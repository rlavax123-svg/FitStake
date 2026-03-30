import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTxHash, publicClient, stravaIdToAddress } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { fetchStravaActivities, isValidRunActivity, refreshStravaToken } from '@/lib/strava'

export async function GET(request: Request) {
  // Verify this is from Vercel Cron (or admin)
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdmin = searchParams.get('secret') === (process.env.ADMIN_SECRET || 'fitstake-dev-secret-change-in-production')

  if (!isVercelCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read nextChallengeId to know how many challenges exist
  const nextId = await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'nextChallengeId',
  }) as bigint

  const results: { challengeId: number; status: string; participants?: number }[] = []

  for (let i = 1; i < Number(nextId); i++) {
    const challenge = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'getChallenge',
      args: [BigInt(i)],
    }) as any

    const state = Number(challenge.state)
    if (state !== 1) continue // Only verify Active challenges

    const startTime = Number(challenge.startTime)

    // Get participants from Supabase
    const { data: participants } = await supabaseAdmin
      .from('challenge_participants')
      .select('strava_athlete_id, user_id')
      .eq('chain_challenge_id', i)

    if (!participants || participants.length === 0) continue

    const addresses: `0x${string}`[] = []
    const distances: bigint[] = []

    for (const p of participants) {
      if (!p.strava_athlete_id) continue

      const { data: user } = await supabaseAdmin
        .from('users')
        .select('strava_access_token, strava_refresh_token, strava_token_expires_at')
        .eq('strava_athlete_id', p.strava_athlete_id)
        .single()

      if (!user?.strava_access_token) continue

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
            .eq('strava_athlete_id', p.strava_athlete_id)
        } catch {
          continue
        }
      }

      try {
        const activities = await fetchStravaActivities(accessToken, startTime)
        const validRuns = activities.filter(isValidRunActivity)
        const totalDistanceCm = validRuns.reduce((sum, a) => sum + Math.round(a.distance * 100), 0)

        addresses.push(stravaIdToAddress(p.strava_athlete_id))
        distances.push(BigInt(totalDistanceCm))
      } catch {
        continue
      }
    }

    if (addresses.length > 0) {
      try {
        await sendContractTxHash(
          'submitBatchVerification',
          [BigInt(i), addresses, distances]
        )
        results.push({ challengeId: i, status: 'verified', participants: addresses.length })
      } catch (err) {
        results.push({ challengeId: i, status: `error: ${err instanceof Error ? err.message : 'unknown'}` })
      }
    } else {
      results.push({ challengeId: i, status: 'no activities', participants: 0 })
    }
  }

  return NextResponse.json({ verified: results, timestamp: new Date().toISOString() })
}
