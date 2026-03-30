import { supabaseAdmin } from './supabase'
import { sendContractTx, publicClient, stravaIdToAddress } from './server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from './contracts'
import { decodeEventLog } from 'viem'

export interface SettleResult {
  challengeId: number
  status: 'settled' | 'skipped' | 'error'
  reason?: string
  txHash?: string
  winnersCount?: number
  results?: {
    stravaId: number
    userId: string
    distanceCm: number
    isWinner: boolean
    payoutGbp: number
  }[]
}

/**
 * Settle a single challenge if it is active and has expired.
 * Handles on-chain settlement and GBP balance distribution.
 */
export async function settleChallenge(challengeId: number): Promise<SettleResult> {
  try {
    // Read challenge from chain
    const challengeData = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'getChallenge',
      args: [BigInt(challengeId)],
    }) as any

    const state = Number(challengeData.state)
    if (state !== 1) {
      return { challengeId, status: 'skipped', reason: `not active (state=${state})` }
    }

    const endTime = Number(challengeData.endTime)
    const challengeType = Number(challengeData.challengeType)
    const now = Math.floor(Date.now() / 1000)

    // Endurance + LiveRace can settle early — contract handles the check
    if (challengeType !== 2 && challengeType !== 4 && now < endTime) {
      return { challengeId, status: 'skipped', reason: `not expired yet` }
    }

    // Settle on-chain
    const receipt = await sendContractTx('settle', [BigInt(challengeId)])

    // Parse ChallengeSettled event
    let winnersCount = 0
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
    const distanceGoalCm = Number(challengeData.distanceGoalCm)
    const participantCount = participants?.length ?? 0
    const totalPotGbp = stakeGbp * participantCount
    const feeGbp = totalPotGbp * 0.05
    const distributableGbp = totalPotGbp - feeGbp

    const results: SettleResult['results'] = []

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

      if (challengeType === 0) {
        // GroupGoal: winners are those who met the distance goal
        const winners = distanceMap.filter(d => d.distance >= distanceGoalCm)
        const payoutPerWinner = winners.length > 0
          ? distributableGbp / winners.length
          : distributableGbp / distanceMap.length

        for (const d of distanceMap) {
          const isWinner = d.distance >= distanceGoalCm
          const payout = winners.length === 0 ? payoutPerWinner : (isWinner ? payoutPerWinner : 0)
          results.push({
            stravaId: d.stravaId,
            userId: d.userId,
            distanceCm: d.distance,
            isWinner: winners.length === 0 ? false : isWinner,
            payoutGbp: payout,
          })
        }
      } else if (challengeType === 2 || challengeType === 4) {
        // Endurance / LiveRace: first to goal wins. If both hit, higher distance wins. If neither, refund.
        if (distanceMap.length === 2) {
          const hitters = distanceMap.filter(d => d.distance >= distanceGoalCm)
          if (hitters.length === 0) {
            // Nobody hit goal — refund everyone
            for (const d of distanceMap) {
              results.push({
                stravaId: d.stravaId, userId: d.userId, distanceCm: d.distance,
                isWinner: false, payoutGbp: stakeGbp,
              })
            }
          } else if (hitters.length === 1) {
            // One winner
            for (const d of distanceMap) {
              const isWinner = d.distance >= distanceGoalCm
              results.push({
                stravaId: d.stravaId, userId: d.userId, distanceCm: d.distance,
                isWinner, payoutGbp: isWinner ? distributableGbp : 0,
              })
            }
          } else {
            // Both hit goal — higher distance wins, tie = refund
            const isTie = distanceMap[0].distance === distanceMap[1].distance
            if (isTie) {
              for (const d of distanceMap) {
                results.push({
                  stravaId: d.stravaId, userId: d.userId, distanceCm: d.distance,
                  isWinner: false, payoutGbp: stakeGbp,
                })
              }
            } else {
              const winnerIdx = distanceMap[0].distance > distanceMap[1].distance ? 0 : 1
              for (let i = 0; i < 2; i++) {
                results.push({
                  stravaId: distanceMap[i].stravaId, userId: distanceMap[i].userId,
                  distanceCm: distanceMap[i].distance,
                  isWinner: i === winnerIdx, payoutGbp: i === winnerIdx ? distributableGbp : 0,
                })
              }
            }
          }
        }
      } else if (challengeType === 3) {
        // BestEffort: fastest time wins. No time = didn't qualify.
        if (distanceMap.length === 2) {
          // Read best times from chain
          const time0 = Number(await publicClient.readContract({
            address: FITSTAKE_ADDRESS, abi: FITSTAKE_ABI,
            functionName: 'getParticipantBestTime',
            args: [BigInt(challengeId), stravaIdToAddress(distanceMap[0].stravaId)],
          }) as bigint)
          const time1 = Number(await publicClient.readContract({
            address: FITSTAKE_ADDRESS, abi: FITSTAKE_ABI,
            functionName: 'getParticipantBestTime',
            args: [BigInt(challengeId), stravaIdToAddress(distanceMap[1].stravaId)],
          }) as bigint)

          if (time0 === 0 && time1 === 0) {
            // Neither qualified — refund
            for (const d of distanceMap) {
              results.push({ stravaId: d.stravaId, userId: d.userId, distanceCm: d.distance, isWinner: false, payoutGbp: stakeGbp })
            }
          } else if (time0 === time1) {
            // Tie — refund
            for (const d of distanceMap) {
              results.push({ stravaId: d.stravaId, userId: d.userId, distanceCm: d.distance, isWinner: false, payoutGbp: stakeGbp })
            }
          } else {
            // One or both qualified — fastest wins (lower time = faster, 0 = didn't qualify)
            let winnerIdx: number
            if (time0 === 0) winnerIdx = 1
            else if (time1 === 0) winnerIdx = 0
            else winnerIdx = time0 < time1 ? 0 : 1

            for (let i = 0; i < 2; i++) {
              results.push({
                stravaId: distanceMap[i].stravaId, userId: distanceMap[i].userId,
                distanceCm: distanceMap[i].distance,
                isWinner: i === winnerIdx, payoutGbp: i === winnerIdx ? distributableGbp : 0,
              })
            }
          }
        }
      } else {
        // HeadToHead
        if (distanceMap.length === 2) {
          const isTie = distanceMap[0].distance === distanceMap[1].distance
          if (isTie) {
            for (const d of distanceMap) {
              results.push({
                stravaId: d.stravaId,
                userId: d.userId,
                distanceCm: d.distance,
                isWinner: false,
                payoutGbp: stakeGbp,
              })
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

    return {
      challengeId,
      status: 'settled',
      txHash: receipt.transactionHash,
      winnersCount,
      results,
    }
  } catch (err) {
    console.error(`Settlement failed for challenge ${challengeId}:`, err)
    return {
      challengeId,
      status: 'error',
      reason: err instanceof Error ? err.message : 'unknown',
    }
  }
}

/**
 * Check all active challenges and settle any that have expired.
 */
export async function settleExpiredChallenges(): Promise<SettleResult[]> {
  const nextId = await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'nextChallengeId',
  }) as bigint

  const results: SettleResult[] = []

  for (let i = 1; i < Number(nextId); i++) {
    const result = await settleChallenge(i)
    if (result.status !== 'skipped') {
      results.push(result)
    }
  }

  return results
}
