import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTx, publicClient, stravaIdToAddress } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { fetchStravaActivities, isValidRunActivity, refreshStravaToken } from '@/lib/strava'

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fitstake-dev-secret-change-in-production'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { challengeId } = body

  if (!challengeId) {
    return NextResponse.json({ error: 'challengeId required' }, { status: 400 })
  }

  // Read challenge from chain
  const challengeData = await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge',
    args: [BigInt(challengeId)],
  }) as any

  const state = Number(challengeData.state)
  if (state !== 1) {
    return NextResponse.json({ error: `Challenge not active (state=${state})` }, { status: 400 })
  }

  const startTime = Number(challengeData.startTime)

  // Get participants from Supabase
  const { data: participants } = await supabaseAdmin
    .from('challenge_participants')
    .select('strava_athlete_id, user_id')
    .eq('chain_challenge_id', challengeId)

  if (!participants || participants.length === 0) {
    return NextResponse.json({ error: 'No participants found' }, { status: 400 })
  }

  const addresses: `0x${string}`[] = []
  const distances: bigint[] = []
  const details: { stravaId: number; address: string; distanceCm: number; distanceKm: number; validRuns: number }[] = []

  for (const p of participants) {
    // Skip bot participants (no strava_athlete_id)
    if (!p.strava_athlete_id) continue

    // Get user's Strava token
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('strava_access_token, strava_refresh_token, strava_token_expires_at')
      .eq('strava_athlete_id', p.strava_athlete_id)
      .single()

    if (!user?.strava_access_token) continue

    // Refresh token if expired
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

    // Fetch and validate activities
    try {
      const activities = await fetchStravaActivities(accessToken, startTime)
      const validRuns = activities.filter(isValidRunActivity)
      const totalDistanceCm = validRuns.reduce((sum, a) => sum + Math.round(a.distance * 100), 0)

      const addr = stravaIdToAddress(p.strava_athlete_id)
      addresses.push(addr)
      distances.push(BigInt(totalDistanceCm))
      details.push({
        stravaId: p.strava_athlete_id,
        address: addr,
        distanceCm: totalDistanceCm,
        distanceKm: totalDistanceCm / 100_000,
        validRuns: validRuns.length,
      })
    } catch (err) {
      console.error(`Failed to fetch activities for athlete ${p.strava_athlete_id}:`, err)
    }
  }

  if (addresses.length === 0) {
    return NextResponse.json({ error: 'No valid activities found for any participant' }, { status: 400 })
  }

  // Submit batch verification on-chain
  try {
    const receipt = await sendContractTx(
      'submitBatchVerification',
      [BigInt(challengeId), addresses, distances]
    )

    return NextResponse.json({
      success: true,
      challengeId,
      txHash: receipt.transactionHash,
      participants: details,
    })
  } catch (err) {
    console.error('Verification tx failed:', err)
    return NextResponse.json(
      { error: `Verification tx failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    )
  }
}
