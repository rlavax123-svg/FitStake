import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTx, publicClient, weiToGbp } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'
import { keccak256, toBytes } from 'viem'

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'fitstake-dev-secret-change-in-production'
const BOT_ADDRESS = `0x${keccak256(toBytes('fitstake-bot')).slice(26)}` as `0x${string}`

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
    return NextResponse.json({ error: `Challenge not open for joining (state=${state})` }, { status: 400 })
  }

  const stakeWei = challengeData.stakeAmount as bigint

  try {
    const receipt = await sendContractTx(
      'joinChallengeFor',
      [BigInt(challengeId), BOT_ADDRESS, '0x'],
      stakeWei
    )

    // Track bot participant in Supabase (ignore errors for bot entries)
    await supabaseAdmin.from('challenge_participants').insert({
      chain_challenge_id: challengeId,
      user_id: null,
      strava_athlete_id: null,
    })

    // Check resulting state (H2H auto-activates)
    const updated = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'getChallenge',
      args: [BigInt(challengeId)],
    }) as any

    const stakeGbp = await weiToGbp(stakeWei)

    return NextResponse.json({
      success: true,
      challengeId,
      botAddress: BOT_ADDRESS,
      stakeWei: stakeWei.toString(),
      stakeGbp: stakeGbp.toFixed(2),
      txHash: receipt.transactionHash,
      newState: Number(updated.state),
      autoActivated: Number(updated.state) === 1,
    })
  } catch (err) {
    console.error('Bot join tx failed:', err)
    return NextResponse.json(
      { error: `Bot join failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 }
    )
  }
}
