import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTxHash, gbpToWei, stravaIdToAddress, publicClient } from '@/lib/server-wallet'
import { keccak256, toBytes } from 'viem'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { name, challengeType, distanceKm, durationMinutes, stakeGbp, maxParticipants, isPrivate, inviteCode, startTime: startTimeInput } = body

  // Validate
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (![0, 1].includes(challengeType)) {
    return NextResponse.json({ error: 'Invalid challenge type' }, { status: 400 })
  }
  if (!distanceKm || distanceKm <= 0) {
    return NextResponse.json({ error: 'Distance must be positive' }, { status: 400 })
  }
  if (!durationMinutes || durationMinutes < 1440 || durationMinutes > 525600) {
    return NextResponse.json({ error: 'Duration must be at least 1 day (up to 365 days)' }, { status: 400 })
  }
  if (!stakeGbp || stakeGbp <= 0) {
    return NextResponse.json({ error: 'Stake must be positive' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
  }

  // Deduct balance first
  const newBalance = (user.balance ?? 0) - stakeGbp
  await supabaseAdmin
    .from('users')
    .update({ balance: newBalance })
    .eq('id', user.id)

  // Log the stake transaction
  await supabaseAdmin.from('transactions').insert({
    user_id: user.id,
    type: 'stake',
    amount: -stakeGbp,
  })

  try {
    // Convert £ to wei
    const valueWei = await gbpToWei(stakeGbp)

    // Read the next challenge ID before sending (so we know what ID it'll get)
    const nextId = await publicClient.readContract({
      address: FITSTAKE_ADDRESS,
      abi: FITSTAKE_ABI,
      functionName: 'nextChallengeId',
    }) as bigint
    const challengeId = Number(nextId)

    // Prepare contract args
    const distanceCm = Math.round(distanceKm * 100_000)
    const nowSec = Math.floor(Date.now() / 1000)
    const startTime = startTimeInput ? Math.floor(startTimeInput) : nowSec
    if (startTime < nowSec - 60) {
      // Allow 60s clock skew, but reject obviously past times
      return NextResponse.json({ error: 'Start time cannot be in the past' }, { status: 400 })
    }
    const participantAddress = stravaIdToAddress(session.stravaId)
    const inviteCodeHash = isPrivate && inviteCode
      ? keccak256(toBytes(inviteCode))
      : ('0x' + '0'.repeat(64)) as `0x${string}`

    // Send tx — don't wait for receipt (Vercel timeout)
    const txHash = await sendContractTxHash(
      'createChallengeFor',
      [
        participantAddress,
        challengeType,
        BigInt(distanceCm),
        BigInt(durationMinutes),
        BigInt(startTime),
        BigInt(challengeType === 1 ? 2 : (maxParticipants || 10)),
        isPrivate ?? false,
        inviteCodeHash,
      ],
      valueWei
    )

    // Save metadata to Supabase
    await supabaseAdmin.from('challenge_metadata').insert({
      chain_challenge_id: challengeId,
      name,
      description: body.description || null,
      invite_code: isPrivate ? inviteCode : null,
      created_by: user.id,
      stake_gbp: stakeGbp,
    })

    // Track creator as first participant
    await supabaseAdmin.from('challenge_participants').insert({
      chain_challenge_id: challengeId,
      user_id: user.id,
      strava_athlete_id: session.stravaId,
    })

    // Update stake transaction with chain details
    await supabaseAdmin
      .from('transactions')
      .update({
        chain_challenge_id: challengeId,
        tx_hash: txHash,
      })
      .eq('user_id', user.id)
      .eq('type', 'stake')
      .is('chain_challenge_id', null)
      .order('created_at', { ascending: false })
      .limit(1)

    return NextResponse.json({
      success: true,
      challengeId,
      txHash,
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
    })

    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('Create challenge tx failed:', errMsg)
    return NextResponse.json(
      { error: 'Transaction failed. Balance refunded.', detail: errMsg, balance: refundBalance },
      { status: 500 }
    )
  }
}
