import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTxHash, publicClient, stravaIdToAddress } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { fetchStravaActivities, isValidRunActivity, refreshStravaToken } from '@/lib/strava'
import { settleChallenge } from '@/lib/settle'

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'fitstake-webhook-verify'

// GET — Strava subscription validation
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Invalid verification' }, { status: 403 })
}

// POST — Strava event notification
export async function POST(request: Request) {
  const event = await request.json()

  // Only care about new/updated activities
  if (event.object_type !== 'activity') {
    return NextResponse.json({ ok: true })
  }
  if (event.aspect_type !== 'create' && event.aspect_type !== 'update') {
    return NextResponse.json({ ok: true })
  }

  const athleteId = event.owner_id as number

  // Find this athlete's active challenges
  const { data: participations } = await supabaseAdmin
    .from('challenge_participants')
    .select('chain_challenge_id')
    .eq('strava_athlete_id', athleteId)

  if (!participations || participations.length === 0) {
    return NextResponse.json({ ok: true, msg: 'no active challenges' })
  }

  // Get user's Strava token
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('strava_access_token, strava_refresh_token, strava_token_expires_at')
    .eq('strava_athlete_id', athleteId)
    .single()

  if (!user?.strava_access_token) {
    return NextResponse.json({ ok: true, msg: 'no token' })
  }

  // Refresh token if needed
  let accessToken = user.strava_access_token
  const now = Math.floor(Date.now() / 1000)
  if (user.strava_token_expires_at && user.strava_token_expires_at < now + 300) {
    try {
      const refreshed = await refreshStravaToken(user.strava_refresh_token)
      accessToken = refreshed.access_token
      await supabaseAdmin
        .from('users')
        .update({
          strava_access_token: refreshed.access_token,
          strava_refresh_token: refreshed.refresh_token,
          strava_token_expires_at: refreshed.expires_at,
        })
        .eq('strava_athlete_id', athleteId)
    } catch {
      return NextResponse.json({ ok: false, msg: 'token refresh failed' })
    }
  }

  const participantAddress = stravaIdToAddress(athleteId)

  // Verify each active challenge this athlete is in
  for (const p of participations) {
    const challengeId = p.chain_challenge_id

    // Check challenge is still active on-chain
    try {
      const challenge = await publicClient.readContract({
        address: FITSTAKE_ADDRESS,
        abi: FITSTAKE_ABI,
        functionName: 'getChallenge',
        args: [BigInt(challengeId)],
      }) as any

      if (Number(challenge.state) !== 1) continue // Skip non-active

      const startTime = Number(challenge.startTime)
      const endTime = Number(challenge.endTime)

      // Fetch and validate activities since challenge start
      const activities = await fetchStravaActivities(accessToken, startTime)
      const validRuns = activities.filter(isValidRunActivity)
      const totalDistanceCm = validRuns.reduce((sum, a) => sum + Math.round(a.distance * 100), 0)

      // Submit verification on-chain
      await sendContractTxHash(
        'submitBatchVerification',
        [BigInt(challengeId), [participantAddress], [BigInt(totalDistanceCm)]]
      )

      // Auto-settle if challenge has expired
      const now = Math.floor(Date.now() / 1000)
      if (now >= endTime) {
        try {
          await settleChallenge(challengeId)
        } catch (err) {
          console.error(`Auto-settle failed for challenge ${challengeId}:`, err)
        }
      }
    } catch (err) {
      console.error(`Webhook verify failed for challenge ${challengeId}:`, err)
    }
  }

  return NextResponse.json({ ok: true })
}
