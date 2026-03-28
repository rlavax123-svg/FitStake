/**
 * FitStake — Bonus Day Announcement CRE Workflow
 *
 * Trigger: EVM Log — BonusDaysSelected event from FitStakeVRF.sol
 * Purpose: When VRF selects bonus days for a challenge, notify the API
 *          so push notifications can be sent to participants.
 *
 * Flow:
 * 1. Parse BonusDaysSelected event data
 * 2. POST to our API with the bonus day timestamps
 */

const API_BASE_URL = process.env.API_BASE_URL!

interface BonusDaysSelectedEvent {
  challengeId: number
  bonusDayTimestamps: number[]
}

export async function onEvent(
  event: BonusDaysSelectedEvent,
  context: {
    httpClient: {
      post: (url: string, body: string) => Promise<{ status: number; body: string }>
    }
  }
) {
  const { httpClient } = context

  // Notify our API about the selected bonus days
  // The API can then send push notifications, update the frontend cache, etc.
  const response = await httpClient.post(
    `${API_BASE_URL}/api/challenges/bonus-days`,
    JSON.stringify({
      challengeId: event.challengeId,
      bonusDays: event.bonusDayTimestamps,
    })
  )

  return {
    challengeId: event.challengeId,
    bonusDayCount: event.bonusDayTimestamps.length,
    notificationSent: response.status === 200,
  }
}
