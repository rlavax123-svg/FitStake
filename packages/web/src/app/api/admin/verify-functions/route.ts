import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { publicClient, stravaIdToAddress } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const FUNCTIONS_ADDRESS = (process.env.NEXT_PUBLIC_FITSTAKE_FUNCTIONS_ADDRESS ||
  '0xF860A3BfB20975bf3FDaa80dF1ef2f89fDc44219') as `0x${string}`

const FUNCTIONS_ABI = parseAbi([
  'function requestVerification(uint256 challengeId, address participant, bool isBestEffort, string[] args, uint8 secretsSlotId, uint64 secretsVersion) external returns (bytes32)',
])

// DON-hosted secrets config (from upload)
const SECRETS_SLOT_ID = 0
const SECRETS_VERSION = 1774911070n

/**
 * Trigger Chainlink Functions verification for a challenge participant.
 * This calls Strava API via the DON — trustless, decentralized verification.
 *
 * POST /api/admin/verify-functions
 * Body: { challengeId, stravaAthleteId }
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const adminSecret = searchParams.get('secret')
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { challengeId, stravaAthleteId } = body

  if (!challengeId || !stravaAthleteId) {
    return NextResponse.json({ error: 'challengeId and stravaAthleteId required' }, { status: 400 })
  }

  // Get challenge data
  const challengeData = (await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge',
    args: [BigInt(challengeId)],
  })) as any

  const challengeType = Number(challengeData.challengeType)
  const startTime = Number(challengeData.startTime)
  const distanceGoalCm = Number(challengeData.distanceGoalCm)
  const isBestEffort = challengeType === 3

  // Get participant's Strava access token
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('strava_access_token, strava_refresh_token')
    .eq('strava_athlete_id', stravaAthleteId)
    .single()

  if (!user?.strava_access_token) {
    return NextResponse.json({ error: 'No Strava token for athlete' }, { status: 404 })
  }

  // NOTE: The DON-hosted secrets contain clientId + clientSecret for token refresh.
  // The access token is passed as an arg since it's per-user and changes frequently.
  // The JS source will refresh it via the DON if expired.
  const participant = stravaIdToAddress(stravaAthleteId)

  const args = [
    String(startTime),
    String(distanceGoalCm),
    String(challengeType),
  ]

  // Send the Functions request
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'),
  })

  try {
    const hash = await wallet.writeContract({
      address: FUNCTIONS_ADDRESS,
      abi: FUNCTIONS_ABI,
      functionName: 'requestVerification',
      args: [
        BigInt(challengeId),
        participant,
        isBestEffort,
        args,
        SECRETS_SLOT_ID,
        SECRETS_VERSION,
      ],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    return NextResponse.json({
      success: true,
      txHash: hash,
      message: 'Chainlink Functions verification requested. DON will call Strava API and submit result on-chain.',
    })
  } catch (err) {
    console.error('Functions request failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to request verification' },
      { status: 500 }
    )
  }
}
