import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { publicClient } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get the user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get all challenges this user participated in
  const { data: participations } = await supabaseAdmin
    .from('challenge_participants')
    .select('chain_challenge_id')
    .eq('strava_athlete_id', session.stravaId)

  if (!participations || participations.length === 0) {
    return NextResponse.json({ challenges: [] })
  }

  const challengeIds = participations.map((p) => p.chain_challenge_id)

  // Get metadata for all those challenges
  const { data: metadataRows } = await supabaseAdmin
    .from('challenge_metadata')
    .select('chain_challenge_id, name, stake_gbp')
    .in('chain_challenge_id', challengeIds)

  const metaMap = new Map(
    (metadataRows || []).map((m) => [m.chain_challenge_id, m])
  )

  // Get winnings transactions for this user on those challenges
  const { data: winningsRows } = await supabaseAdmin
    .from('transactions')
    .select('chain_challenge_id, amount')
    .eq('user_id', user.id)
    .eq('type', 'winnings')
    .in('chain_challenge_id', challengeIds)

  const winningsMap = new Map(
    (winningsRows || []).map((w) => [w.chain_challenge_id, w.amount])
  )

  // Read challenge state from chain for each
  const results = await Promise.all(
    challengeIds.map(async (cid) => {
      try {
        const challengeData = await publicClient.readContract({
          address: FITSTAKE_ADDRESS,
          abi: FITSTAKE_ABI,
          functionName: 'getChallenge',
          args: [BigInt(cid)],
        })

        const cd = challengeData as unknown as Record<string, unknown>
        const state = Number(cd.state ?? 0)
        const distanceGoalCm = Number(cd.distanceGoalCm ?? 0)
        const meta = metaMap.get(cid)
        const payout = winningsMap.get(cid) ?? 0

        return {
          challengeId: cid,
          name: meta?.name || `Challenge #${cid}`,
          stakeGbp: meta?.stake_gbp ?? 0,
          state,
          distanceGoalKm: distanceGoalCm / 100_000,
          won: payout > 0,
          payoutGbp: payout,
        }
      } catch {
        return null
      }
    })
  )

  const challenges = results.filter((r) => r !== null)

  return NextResponse.json({ challenges })
}
