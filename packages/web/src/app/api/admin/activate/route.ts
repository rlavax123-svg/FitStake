import { NextResponse } from 'next/server'
import { sendContractTx, publicClient } from '@/lib/server-wallet'
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

  // Read challenge from chain
  const challengeData = await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge',
    args: [BigInt(challengeId)],
  }) as any

  const state = Number(challengeData.state)
  if (state !== 0) {
    return NextResponse.json({ error: `Challenge not in Created state (state=${state})` }, { status: 400 })
  }

  try {
    const receipt = await sendContractTx('activateChallenge', [BigInt(challengeId)])

    return NextResponse.json({
      success: true,
      challengeId,
      txHash: receipt.transactionHash,
    })
  } catch (err) {
    console.error('Activate tx failed:', err)
    return NextResponse.json(
      { error: `Activation failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    )
  }
}
