import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTx, publicClient, weiToGbp, stravaIdToAddress } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { decodeEventLog } from 'viem'

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

  const endTime = Number(challengeData.endTime)
  const now = Math.floor(Date.now() / 1000)
  if (now < endTime) {
    const remaining = endTime - now
    const mins = Math.ceil(remaining / 60)
    return NextResponse.json({
      error: `Challenge hasn't expired yet. ${mins} minute(s) remaining.`,
    }, { status: 400 })
  }

  // Settle on-chain
  try {
    const receipt = await sendContractTx('settle', [BigInt(challengeId)])

    // Parse ChallengeSettled event
    let winnersCount = 0
    let totalPayout = BigInt(0)
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: FITSTAKE_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'ChallengeSettled') {
          const args = decoded.args as any
          winnersCount = Number(args.winnersCount)
          totalPayout = args.totalPayout as bigint
        }
      } catch {
        // Not our event
      }
    }

    // Read participants and determine winners for GBP distribution
    const { data: participants } = await supabaseAdmin
      .from('challenge_participants')
      .select('strava_athlete_id, user_id')
      .eq('chain_challenge_id', challengeId)

    const { data: meta } = await supabaseAdmin
      .from('challenge_metadata')
      .select('stake_gbp')
      .eq('chain_challenge_id', challengeId)
      .maybeSingle()

    const stakeGbp = meta?.stake_gbp ?? 0
    const challengeType = Number(challengeData.challengeType)
    const distanceGoalCm = Number(challengeData.distanceGoalCm)
    const participantCount = participants?.length ?? 0
    const totalPotGbp = stakeGbp * participantCount
    const feeGbp = totalPotGbp * 0.05
    const distributableGbp = totalPotGbp - feeGbp

    // Read each participant's verified distance
    const results: { stravaId: number; userId: string; distanceCm: number; isWinner: boolean; payoutGbp: number }[] = []

    if (participants) {
      const distanceMap: { stravaId: number; userId: string; distance: number }[] = []
      for (const p of participants) {
        if (!p.strava_athlete_id) continue
        const addr = stravaIdToAddress(p.strava_athlete_id)
        const dist = await publicClient.readContract({
          address: FITSTAKE_ADDRESS,
          abi: FITSTAKE_ABI,
          functionName: 'getParticipantDistance',
          args: [BigInt(challengeId), addr],
        }) as bigint
        distanceMap.push({ stravaId: p.strava_athlete_id, userId: p.user_id, distance: Number(dist) })
      }

      // Determine winners and payouts
      if (challengeType === 0) {
        // GroupGoal: winners are those who met the distance goal
        const winners = distanceMap.filter(d => d.distance >= distanceGoalCm)
        const payoutPerWinner = winners.length > 0 ? distributableGbp / winners.length : distributableGbp / distanceMap.length

        for (const d of distanceMap) {
          const isWinner = d.distance >= distanceGoalCm
          // If no winners, everyone gets refund minus fee
          const payout = winners.length === 0 ? payoutPerWinner : (isWinner ? payoutPerWinner : 0)
          results.push({
            stravaId: d.stravaId,
            userId: d.userId,
            distanceCm: d.distance,
            isWinner: winners.length === 0 ? false : isWinner,
            payoutGbp: payout,
          })
        }
      } else {
        // HeadToHead
        if (distanceMap.length === 2) {
          const isTie = distanceMap[0].distance === distanceMap[1].distance
          if (isTie) {
            // Full refund, no fee
            for (const d of distanceMap) {
              results.push({ stravaId: d.stravaId, userId: d.userId, distanceCm: d.distance, isWinner: false, payoutGbp: stakeGbp })
            }
          } else {
            const winnerIdx = distanceMap[0].distance > distanceMap[1].distance ? 0 : 1
            for (let i = 0; i < 2; i++) {
              results.push({
                stravaId: distanceMap[i].stravaId,
                userId: distanceMap[i].userId,
                distanceCm: distanceMap[i].distance,
                isWinner: i === winnerIdx,
                payoutGbp: i === winnerIdx ? distributableGbp : 0,
              })
            }
          }
        }
      }

      // Credit winners' GBP balances
      for (const r of results) {
        if (r.payoutGbp > 0) {
          const { data: u } = await supabaseAdmin
            .from('users')
            .select('balance')
            .eq('id', r.userId)
            .single()

          if (u) {
            await supabaseAdmin
              .from('users')
              .update({ balance: (u.balance ?? 0) + r.payoutGbp })
              .eq('id', r.userId)
          }

          await supabaseAdmin.from('transactions').insert({
            user_id: r.userId,
            type: 'winnings',
            amount: r.payoutGbp,
            chain_challenge_id: challengeId,
            tx_hash: receipt.transactionHash,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      challengeId,
      txHash: receipt.transactionHash,
      winnersCount,
      totalPayoutWei: totalPayout.toString(),
      results,
    })
  } catch (err) {
    console.error('Settlement tx failed:', err)
    return NextResponse.json(
      { error: `Settlement failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    )
  }
}
