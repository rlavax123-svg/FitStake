import { NextResponse } from 'next/server'
import { settleChallenge } from '@/lib/settle'
import { publicClient } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'

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

  // Read challenge from chain to give a better error for non-active challenges
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

  const result = await settleChallenge(challengeId)

  if (result.status === 'error') {
    return NextResponse.json(
      { error: `Settlement failed: ${result.reason}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    challengeId,
    txHash: result.txHash,
    winnersCount: result.winnersCount,
    results: result.results,
  })
}
