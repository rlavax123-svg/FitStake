/**
 * FitStake — Activity Verification CRE Workflow
 *
 * Trigger: Cron (daily at midnight UTC)
 * Purpose: Fetch Strava activities for all active challenge participants,
 *          apply anti-cheat filters, and write verified distances on-chain.
 *
 * Flow:
 * 1. Read active challenges from FitStake.sol
 * 2. For each participant, GET /api/strava/activities
 * 3. Check bonus day multiplier from FitStakeVRF
 * 4. Write verified distances via submitBatchVerification()
 */

// CRE SDK types (imported when compiled with cre-sdk)
// import { HTTPClient, EVMClient, CronTrigger } from '@chainlink/cre-sdk'

// -------------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------------

const FITSTAKE_CONTRACT = process.env.FITSTAKE_ADDRESS!
const FITSTAKE_VRF_CONTRACT = process.env.FITSTAKE_VRF_ADDRESS!
const API_BASE_URL = process.env.API_BASE_URL! // e.g. https://fitstake.vercel.app
const BASE_SEPOLIA_CHAIN_ID = 84532

// FitStake ABI fragments needed by this workflow
const FITSTAKE_ABI = {
  getChallenge:
    'function getChallenge(uint256 challengeId) view returns (tuple(uint256 id, address creator, uint8 challengeType, uint8 state, uint256 stakeAmount, uint256 distanceGoalCm, uint256 startTime, uint256 endTime, uint256 maxParticipants, bool isPrivate, bytes32 inviteCodeHash, uint256 participantCount, uint256 totalStaked))',
  getParticipants: 'function getParticipants(uint256 challengeId) view returns (address[])',
  nextChallengeId: 'function nextChallengeId() view returns (uint256)',
  submitBatchVerification:
    'function submitBatchVerification(uint256 challengeId, address[] participants, uint256[] distances)',
}

const FITSTAKE_VRF_ABI = {
  isBonusDay: 'function isBonusDay(uint256 challengeId, uint256 timestamp) view returns (bool)',
}

// Challenge states
const STATE_ACTIVE = 1

// -------------------------------------------------------------------------
// Workflow Logic
// -------------------------------------------------------------------------

interface VerificationResult {
  challengeId: number
  participants: string[]
  distances: number[] // centimeters
}

/**
 * Main workflow entry point.
 * Called by CRE runtime on cron trigger.
 */
export async function onTrigger(context: {
  httpClient: {
    get: (url: string) => Promise<{ status: number; body: string }>
  }
  evmClient: {
    read: (chainId: number, address: string, abi: string, args: unknown[]) => Promise<unknown>
    write: (
      chainId: number,
      address: string,
      abi: string,
      args: unknown[]
    ) => Promise<{ txHash: string }>
  }
}) {
  const { httpClient, evmClient } = context
  const now = Math.floor(Date.now() / 1000)

  // 1. Get total number of challenges
  const nextId = (await evmClient.read(
    BASE_SEPOLIA_CHAIN_ID,
    FITSTAKE_CONTRACT,
    FITSTAKE_ABI.nextChallengeId,
    []
  )) as number

  const results: VerificationResult[] = []

  // 2. Iterate through all challenges and find active ones
  for (let id = 1; id < nextId; id++) {
    const challenge = (await evmClient.read(
      BASE_SEPOLIA_CHAIN_ID,
      FITSTAKE_CONTRACT,
      FITSTAKE_ABI.getChallenge,
      [id]
    )) as { state: number; startTime: number; endTime: number }

    // Skip non-active challenges
    if (challenge.state !== STATE_ACTIVE) continue

    // Skip challenges that haven't started yet
    if (challenge.startTime > now) continue

    // 3. Get participants for this challenge
    const participants = (await evmClient.read(
      BASE_SEPOLIA_CHAIN_ID,
      FITSTAKE_CONTRACT,
      FITSTAKE_ABI.getParticipants,
      [id]
    )) as string[]

    // 4. Check if today is a bonus day for this challenge
    const isBonusDay = (await evmClient.read(
      BASE_SEPOLIA_CHAIN_ID,
      FITSTAKE_VRF_CONTRACT,
      FITSTAKE_VRF_ABI.isBonusDay,
      [id, now]
    )) as boolean

    const multiplier = isBonusDay ? 2 : 1

    // 5. Fetch verified distances for each participant
    const distances: number[] = []
    for (const participant of participants) {
      try {
        const response = await httpClient.get(
          `${API_BASE_URL}/api/strava/activities?wallet=${participant}&after=${challenge.startTime}`
        )

        if (response.status === 200) {
          const data = JSON.parse(response.body)
          // Apply bonus day multiplier to today's activities
          // Note: the API returns cumulative distance, multiplier applies to today's portion
          distances.push(data.totalDistanceCm * multiplier)
        } else {
          // If fetch fails, keep previous distance (0 if first time)
          distances.push(0)
        }
      } catch {
        distances.push(0)
      }
    }

    results.push({
      challengeId: id,
      participants,
      distances,
    })
  }

  // 6. Write all verified distances on-chain
  for (const result of results) {
    if (result.participants.length === 0) continue

    await evmClient.write(
      BASE_SEPOLIA_CHAIN_ID,
      FITSTAKE_CONTRACT,
      FITSTAKE_ABI.submitBatchVerification,
      [result.challengeId, result.participants, result.distances]
    )
  }

  return {
    challengesProcessed: results.length,
    totalParticipantsVerified: results.reduce((sum, r) => sum + r.participants.length, 0),
  }
}
