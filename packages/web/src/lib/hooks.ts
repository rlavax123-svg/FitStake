'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import { FITSTAKE_ADDRESS, FITSTAKE_ABI, CHAIN } from './contracts'
import { formatEther } from 'viem'

// Chainlink ETH/USD Price Feed on Sepolia
const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const
const PRICE_FEED_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface Challenge {
  id: number
  creator: string
  challengeType: number // 0=GroupGoal, 1=HeadToHead
  state: number // 0=Created, 1=Active, 2=Verifying, 3=Settled, 4=Cancelled
  stakeAmount: bigint
  distanceGoalCm: bigint
  startTime: bigint
  endTime: bigint
  maxParticipants: bigint
  isPrivate: boolean
  inviteCodeHash: string
  participantCount: bigint
  totalStaked: bigint
}

export const STATE_LABELS = ['Open', 'Active', 'Verifying', 'Settled', 'Cancelled'] as const
export const TYPE_LABELS = ['Group Goal', 'Head-to-Head'] as const

// -------------------------------------------------------------------------
// Hooks
// -------------------------------------------------------------------------

export function useNextChallengeId() {
  return useReadContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'nextChallengeId',
    chainId: CHAIN.id,
  })
}

export function useChallenge(id: number) {
  const { data, ...rest } = useReadContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge',
    args: [BigInt(id)],
    chainId: CHAIN.id,
    query: { enabled: id > 0 },
  })

  const challenge = data
    ? parseChallenge(data as unknown as readonly unknown[])
    : null

  return { data: challenge, ...rest }
}

export function useEthPrice() {
  const { data, ...rest } = useReadContract({
    address: ETH_USD_FEED,
    abi: PRICE_FEED_ABI,
    functionName: 'latestRoundData',
    chainId: CHAIN.id,
  })

  // Chainlink price feeds return price with 8 decimals
  const price = data ? Number((data as readonly [bigint, bigint, bigint, bigint, bigint])[1]) / 1e8 : null

  return { data: price, ...rest }
}

export function useParticipants(challengeId: number) {
  return useReadContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getParticipants',
    args: [BigInt(challengeId)],
    chainId: CHAIN.id,
    query: { enabled: challengeId > 0 },
  })
}

export function useParticipantDistance(challengeId: number, participant: string) {
  return useReadContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getParticipantDistance',
    args: [BigInt(challengeId), participant as `0x${string}`],
    chainId: CHAIN.id,
    query: { enabled: challengeId > 0 && !!participant },
  })
}

export function useAllChallenges() {
  const { data: nextId } = useNextChallengeId()
  const count = nextId ? Number(nextId) - 1 : 0

  const contracts = Array.from({ length: count }, (_, i) => ({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge' as const,
    args: [BigInt(i + 1)],
    chainId: CHAIN.id,
  }))

  const { data, ...rest } = useReadContracts({
    contracts,
    query: { enabled: count > 0 },
  })

  const challenges: Challenge[] = (data || [])
    .map((result, i) => {
      if (result.status !== 'success' || !result.result) return null
      return parseChallenge(result.result as unknown as readonly unknown[])
    })
    .filter((c): c is Challenge => c !== null)

  return { data: challenges, ...rest }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function parseChallenge(raw: unknown): Challenge | null {
  try {
    // wagmi can return as array or object depending on version
    const r = raw as Record<string, unknown>

    // Try object format first (wagmi v2 returns named fields)
    if (r && typeof r === 'object' && 'id' in r) {
      return {
        id: Number(r.id || 0),
        creator: String(r.creator || ''),
        challengeType: Number(r.challengeType || 0),
        state: Number(r.state || 0),
        stakeAmount: BigInt(String(r.stakeAmount || 0)),
        distanceGoalCm: BigInt(String(r.distanceGoalCm || 0)),
        startTime: BigInt(String(r.startTime || 0)),
        endTime: BigInt(String(r.endTime || 0)),
        maxParticipants: BigInt(String(r.maxParticipants || 0)),
        isPrivate: Boolean(r.isPrivate),
        inviteCodeHash: String(r.inviteCodeHash || ''),
        participantCount: BigInt(String(r.participantCount || 0)),
        totalStaked: BigInt(String(r.totalStaked || 0)),
      }
    }

    // Try array format
    if (Array.isArray(raw)) {
      return {
        id: Number(raw[0] || 0),
        creator: String(raw[1] || ''),
        challengeType: Number(raw[2] || 0),
        state: Number(raw[3] || 0),
        stakeAmount: BigInt(String(raw[4] || 0)),
        distanceGoalCm: BigInt(String(raw[5] || 0)),
        startTime: BigInt(String(raw[6] || 0)),
        endTime: BigInt(String(raw[7] || 0)),
        maxParticipants: BigInt(String(raw[8] || 0)),
        isPrivate: Boolean(raw[9]),
        inviteCodeHash: String(raw[10] || ''),
        participantCount: BigInt(String(raw[11] || 0)),
        totalStaked: BigInt(String(raw[12] || 0)),
      }
    }

    return null
  } catch {
    return null
  }
}

export function formatStake(wei: bigint | undefined | null): string {
  if (!wei) return '0'
  try {
    return parseFloat(formatEther(wei)).toFixed(4)
  } catch {
    return '0'
  }
}

export function cmToKm(cm: bigint | undefined | null): number {
  if (!cm) return 0
  try {
    return Number(cm) / 100_000
  } catch {
    return 0
  }
}

export function daysRemaining(endTime: bigint | undefined | null): number {
  if (!endTime) return 0
  try {
    const now = Math.floor(Date.now() / 1000)
    const remaining = Number(endTime) - now
    return Math.max(0, Math.ceil(remaining / 86400))
  } catch {
    return 0
  }
}

export function shortenAddress(addr: string | undefined | null): string {
  if (!addr) return '???'
  try {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  } catch {
    return '???'
  }
}

export function ethToFiat(wei: bigint | undefined | null, ethPrice: number | null): string {
  if (!wei || !ethPrice) return '£?'
  try {
    const eth = parseFloat(formatEther(wei))
    const usd = eth * ethPrice
    // Approximate USD to GBP (0.79 rate). In production, use a proper FX feed.
    const gbp = usd * 0.79
    return `£${gbp.toFixed(2)}`
  } catch {
    return '£?'
  }
}
