import { NextResponse } from 'next/server'
import { sendContractTx, gbpToWei } from '@/lib/server-wallet'
import { keccak256, toBytes, decodeEventLog } from 'viem'
import { supabaseAdmin } from '@/lib/supabase'
import { FITSTAKE_ABI } from '@/lib/contracts'

const SEED_CHALLENGES = [
  { name: 'January 50K', type: 0, distanceKm: 50, days: 30, stakeGbp: 5, maxP: 10 },
  { name: '100K Ultra Month', type: 0, distanceKm: 100, days: 30, stakeGbp: 10, maxP: 20 },
  { name: '1v1 Sprint: 10K', type: 1, distanceKm: 10, days: 7, stakeGbp: 5, maxP: 2 },
  { name: 'Weekend Warriors 25K', type: 0, distanceKm: 25, days: 14, stakeGbp: 3, maxP: 8 },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (secret !== (process.env.NEXTAUTH_SECRET || 'fitstake-dev-secret-change-in-production')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: { name: string; challengeId: number | null; txHash: string }[] = []

  for (const seed of SEED_CHALLENGES) {
    try {
      const valueWei = await gbpToWei(seed.stakeGbp)
      const distanceCm = Math.round(seed.distanceKm * 100_000)
      const startTime = Math.floor(Date.now() / 1000) + 3600
      const zeroHash = ('0x' + '0'.repeat(64)) as `0x${string}`

      const receipt = await sendContractTx(
        'createChallenge',
        [
          seed.type,
          BigInt(distanceCm),
          BigInt(seed.days),
          BigInt(startTime),
          BigInt(seed.maxP),
          false,
          zeroHash,
        ],
        valueWei
      )

      let challengeId: number | null = null
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: FITSTAKE_ABI,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'ChallengeCreated') {
            challengeId = Number((decoded.args as any).challengeId)
            break
          }
        } catch {
          // Not our event
        }
      }

      if (challengeId !== null) {
        await supabaseAdmin.from('challenge_metadata').insert({
          chain_challenge_id: challengeId,
          name: seed.name,
          description: null,
          invite_code: null,
        })
      }

      results.push({
        name: seed.name,
        challengeId,
        txHash: receipt.transactionHash,
      })
    } catch (err) {
      results.push({
        name: seed.name,
        challengeId: null,
        txHash: `ERROR: ${err instanceof Error ? err.message : 'unknown'}`,
      })
    }
  }

  return NextResponse.json({ seeded: results })
}
