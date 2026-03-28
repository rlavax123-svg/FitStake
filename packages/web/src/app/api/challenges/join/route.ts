import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTx, weiToGbp, publicClient } from '@/lib/server-wallet'
import { toHex, toBytes } from 'viem'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { challengeId, inviteCode } = body

  if (typeof challengeId !== 'number' || challengeId < 1) {
    return NextResponse.json({ error: 'Invalid challengeId' }, { status: 400 })
  }

  // Check if already a participant
  const { data: existing } = await supabaseAdmin
    .from('challenge_participants')
    .select('id')
    .eq('chain_challenge_id', challengeId)
    .eq('strava_athlete_id', session.stravaId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already joined this challenge' }, { status: 400 })
  }

  // Read challenge from chain to get stake amount and state
  const challengeData = await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge',
    args: [BigInt(challengeId)],
  })

  const cd = challengeData as unknown as Record<string, unknown>
  const stakeWei = cd.stakeAmount as bigint
  const state = Number(cd.state ?? 0)

  if (state !== 0) {
    return NextResponse.json({ error: 'Challenge is not open for joining' }, { status: 400 })
  }

  // Get the original £ stake from Supabase metadata (source of truth for £ amount)
  // Falls back to reverse-converting from ETH if metadata missing
  const { data: meta } = await supabaseAdmin
    .from('challenge_metadata')
    .select('stake_gbp')
    .eq('chain_challenge_id', challengeId)
    .maybeSingle()

  const stakeGbp = meta?.stake_gbp ?? await weiToGbp(stakeWei)

  // Get user and check balance
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, balance')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if ((user.balance ?? 0) < stakeGbp) {
    return NextResponse.json({
      error: `Insufficient balance. Need £${stakeGbp.toFixed(2)}, have £${((user.balance ?? 0)).toFixed(2)}`,
    }, { status: 400 })
  }

  // Deduct balance
  const newBalance = (user.balance ?? 0) - stakeGbp
  await supabaseAdmin
    .from('users')
    .update({ balance: newBalance })
    .eq('id', user.id)

  await supabaseAdmin.from('transactions').insert({
    user_id: user.id,
    type: 'stake',
    amount: -stakeGbp,
    chain_challenge_id: challengeId,
  })

  try {
    // Prepare invite code bytes
    const inviteCodeBytes = inviteCode
      ? toHex(toBytes(inviteCode))
      : '0x' as `0x${string}`

    const receipt = await sendContractTx(
      'joinChallenge',
      [BigInt(challengeId), inviteCodeBytes],
      stakeWei
    )

    // Track participation
    await supabaseAdmin.from('challenge_participants').insert({
      chain_challenge_id: challengeId,
      user_id: user.id,
      strava_athlete_id: session.stravaId,
    })

    // Update tx with hash
    await supabaseAdmin
      .from('transactions')
      .update({ tx_hash: receipt.transactionHash })
      .eq('user_id', user.id)
      .eq('type', 'stake')
      .eq('chain_challenge_id', challengeId)
      .order('created_at', { ascending: false })
      .limit(1)

    return NextResponse.json({
      success: true,
      challengeId,
      txHash: receipt.transactionHash,
      balance: newBalance,
    })
  } catch (err) {
    // Refund on failure
    const refundBalance = newBalance + stakeGbp
    await supabaseAdmin
      .from('users')
      .update({ balance: refundBalance })
      .eq('id', user.id)

    await supabaseAdmin.from('transactions').insert({
      user_id: user.id,
      type: 'refund',
      amount: stakeGbp,
      chain_challenge_id: challengeId,
    })

    console.error('Join challenge tx failed:', err)
    return NextResponse.json(
      { error: 'Transaction failed. Balance refunded.', balance: refundBalance },
      { status: 500 }
    )
  }
}
