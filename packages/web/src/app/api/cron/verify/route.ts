import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTxHash, publicClient, stravaIdToAddress } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { fetchStravaActivities, isValidRunActivity, refreshStravaToken } from '@/lib/strava'
import { settleChallenge } from '@/lib/settle'

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
  const startMs = Date.now()
  const TIMEOUT_MS = 25_000 // Leave 5s buffer before Vercel's 30s limit

  for (let i = 1; i < Number(nextId); i++) {
    if (Date.now() - startMs > TIMEOUT_MS) {
      results.push({ challengeId: i, status: 'timeout-skipped' })
      break
    }
    const challenge = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'getChallenge',
      args: [BigInt(i)],
    }) as any

    const state = Number(challenge.state)
    const startTime = Number(challenge.startTime)
    const endTime = Number(challenge.endTime)
    const participantCount = Number(challenge.participantCount)
    const nowSec = Math.floor(Date.now() / 1000)

    // Handle Created (state=0) challenges
    if (state === 0) {
      // Auto-cancel expired Created challenges with only 1 participant
      if (nowSec >= endTime && participantCount <= 1) {
        try {
          await sendContractTxHash('cancelChallenge', [BigInt(i)])

          // Refund the creator's GBP balance
          const { data: meta } = await supabaseAdmin
            .from('challenge_metadata')
            .select('created_by, stake_gbp')
            .eq('chain_challenge_id', i)
            .maybeSingle()

          if (meta?.created_by && meta.stake_gbp) {
            const { data: creator } = await supabaseAdmin
              .from('users')
              .select('id, balance')
              .eq('id', meta.created_by)
              .single()

            if (creator) {
              const newBalance = (creator.balance ?? 0) + meta.stake_gbp
              await supabaseAdmin
                .from('users')
                .update({ balance: newBalance })
                .eq('id', creator.id)

              await supabaseAdmin.from('transactions').insert({
                user_id: creator.id,
                type: 'refund',
                amount: meta.stake_gbp,
                chain_challenge_id: i,
              })
            }
          }

          results.push({ challengeId: i, status: 'auto-cancelled', participants: participantCount })
        } catch (err) {
          results.push({ challengeId: i, status: `cancel-error: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }
      // Auto-activate Created challenges that have reached startTime with 2+ participants
      else if (nowSec >= startTime && participantCount >= 1) {
        try {
          await sendContractTxHash('activateChallenge', [BigInt(i)])
          results.push({ challengeId: i, status: 'auto-activated', participants: participantCount })
        } catch (err) {
          results.push({ challengeId: i, status: `activate-error: ${err instanceof Error ? err.message : 'unknown'}` })
        }
      }
      continue
    }

    if (state !== 1) continue // Only verify Active challenges

    const challengeType = Number(challenge.challengeType)
    const distanceGoalCm = Number(challenge.distanceGoalCm)

    // Get participants from Supabase
    const { data: participants } = await supabaseAdmin
      .from('challenge_participants')
      .select('strava_athlete_id, user_id')
      .eq('chain_challenge_id', i)

    if (!participants || participants.length === 0) continue

    const addresses: `0x${string}`[] = []
    const distances: bigint[] = []
    let verifiedCount = 0

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

        if (challengeType === 3) {
          // BestEffort: find fastest qualifying single run
          const goalMeters = distanceGoalCm / 100
          const qualifying = validRuns.filter((a: any) => a.distance >= goalMeters)
          if (qualifying.length > 0) {
            const best = qualifying.reduce((fastest: any, a: any) =>
              a.moving_time < fastest.moving_time ? a : fastest
            )
            const addr = stravaIdToAddress(p.strava_athlete_id)
            await sendContractTxHash(
              'submitBestTime',
              [BigInt(i), addr, BigInt(Math.round(best.distance * 100)), BigInt(best.moving_time)]
            )
            verifiedCount++
          }
        } else {
          // Cumulative distance for GroupGoal, HeadToHead, Endurance
          const totalDistanceCm = validRuns.reduce((sum: number, a: any) => sum + Math.round(a.distance * 100), 0)
          addresses.push(stravaIdToAddress(p.strava_athlete_id))
          distances.push(BigInt(totalDistanceCm))
        }
      } catch {
        continue
      }
    }

    // Submit batch for non-BestEffort types
    if (challengeType !== 3 && addresses.length > 0) {
      try {
        await sendContractTxHash(
          'submitBatchVerification',
          [BigInt(i), addresses, distances]
        )
        results.push({ challengeId: i, status: 'verified', participants: addresses.length })
      } catch (err) {
        results.push({ challengeId: i, status: `error: ${err instanceof Error ? err.message : 'unknown'}` })
      }
    } else if (challengeType === 3 && verifiedCount > 0) {
      results.push({ challengeId: i, status: 'verified-best-times', participants: verifiedCount })
    } else {
      results.push({ challengeId: i, status: 'no activities', participants: 0 })
    }

    // Auto-settle if challenge has expired
    if (nowSec >= endTime) {
      try {
        const settleResult = await settleChallenge(i)
        if (settleResult.status === 'settled') {
          results.push({ challengeId: i, status: 'auto-settled', participants: settleResult.results?.length })
        }
      } catch (err) {
        results.push({ challengeId: i, status: `settle-error: ${err instanceof Error ? err.message : 'unknown'}` })
      }
    }
  }

  return NextResponse.json({ verified: results, timestamp: new Date().toISOString() })
}
