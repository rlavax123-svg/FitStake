/**
 * FitStake — Challenge Settlement CRE Workflow
 *
 * Trigger: Cron (hourly)
 * Purpose: Find expired active challenges and settle them on-chain.
 *          Also activates GroupGoal challenges that have reached their start time.
 *
 * Flow:
 * 1. Read all challenges from FitStake.sol
 * 2. For Created challenges past startTime → activate or cancel
 * 3. For Active challenges past endTime → do final verification then settle
 */

const FITSTAKE_CONTRACT = process.env.FITSTAKE_ADDRESS!
const FITSTAKE_VRF_CONTRACT = process.env.FITSTAKE_VRF_ADDRESS!
const API_BASE_URL = process.env.API_BASE_URL!
const BASE_SEPOLIA_CHAIN_ID = 84532

const FITSTAKE_ABI = {
  getChallenge:
    'function getChallenge(uint256 challengeId) view returns (tuple(uint256 id, address creator, uint8 challengeType, uint8 state, uint256 stakeAmount, uint256 distanceGoalCm, uint256 startTime, uint256 endTime, uint256 maxParticipants, bool isPrivate, bytes32 inviteCodeHash, uint256 participantCount, uint256 totalStaked))',
  getParticipants: 'function getParticipants(uint256 challengeId) view returns (address[])',
  nextChallengeId: 'function nextChallengeId() view returns (uint256)',
  activateChallenge: 'function activateChallenge(uint256 challengeId)',
  submitBatchVerification:
    'function submitBatchVerification(uint256 challengeId, address[] participants, uint256[] distances)',
  settle: 'function settle(uint256 challengeId)',
}

// Challenge states
const STATE_CREATED = 0
const STATE_ACTIVE = 1

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

  const nextId = (await evmClient.read(
    BASE_SEPOLIA_CHAIN_ID,
    FITSTAKE_CONTRACT,
    FITSTAKE_ABI.nextChallengeId,
    []
  )) as number

  let activated = 0
  let settled = 0

  for (let id = 1; id < nextId; id++) {
    const challenge = (await evmClient.read(
      BASE_SEPOLIA_CHAIN_ID,
      FITSTAKE_CONTRACT,
      FITSTAKE_ABI.getChallenge,
      [id]
    )) as {
      state: number
      challengeType: number
      startTime: number
      endTime: number
      participantCount: number
    }

    // ---------------------------------------------------------------
    // Activate Created challenges that have reached their start time
    // ---------------------------------------------------------------
    if (challenge.state === STATE_CREATED && challenge.startTime <= now) {
      // GroupGoal challenges need CRE to activate them
      // (HeadToHead auto-activates on join)
      if (challenge.challengeType === 0) {
        // GroupGoal
        await evmClient.write(
          BASE_SEPOLIA_CHAIN_ID,
          FITSTAKE_CONTRACT,
          FITSTAKE_ABI.activateChallenge,
          [id]
        )
        activated++
      }
    }

    // ---------------------------------------------------------------
    // Settle Active challenges that have expired
    // ---------------------------------------------------------------
    if (challenge.state === STATE_ACTIVE && challenge.endTime <= now) {
      // Do one final Strava verification before settling
      const participants = (await evmClient.read(
        BASE_SEPOLIA_CHAIN_ID,
        FITSTAKE_CONTRACT,
        FITSTAKE_ABI.getParticipants,
        [id]
      )) as string[]

      const distances: number[] = []
      for (const participant of participants) {
        try {
          const response = await httpClient.get(
            `${API_BASE_URL}/api/strava/activities?wallet=${participant}&after=${challenge.startTime}`
          )
          if (response.status === 200) {
            const data = JSON.parse(response.body)
            distances.push(data.totalDistanceCm)
          } else {
            distances.push(0)
          }
        } catch {
          distances.push(0)
        }
      }

      // Submit final verification
      if (participants.length > 0) {
        await evmClient.write(
          BASE_SEPOLIA_CHAIN_ID,
          FITSTAKE_CONTRACT,
          FITSTAKE_ABI.submitBatchVerification,
          [id, participants, distances]
        )
      }

      // Settle the challenge
      await evmClient.write(
        BASE_SEPOLIA_CHAIN_ID,
        FITSTAKE_CONTRACT,
        FITSTAKE_ABI.settle,
        [id]
      )
      settled++
    }
  }

  return { activated, settled }
}
