import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTx, gbpToWei } from '@/lib/server-wallet'
import { keccak256, toBytes, decodeEventLog } from 'viem'
import { FITSTAKE_ABI } from '@/lib/contracts'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { name, challengeType, distanceKm, durationDays, stakeGbp, maxParticipants, isPrivate, inviteCode } = body

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
  if (!durationDays || durationDays < 1 || durationDays > 365) {
    return NextResponse.json({ error: 'Duration must be 1-365 days' }, { status: 400 })
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

    // Prepare contract args
    const distanceCm = Math.round(distanceKm * 100_000)
    const startTime = Math.floor(Date.now() / 1000) + 3600
    const inviteCodeHash = isPrivate && inviteCode
      ? keccak256(toBytes(inviteCode))
      : ('0x' + '0'.repeat(64)) as `0x${string}`

    const receipt = await sendContractTx(
      'createChallenge',
      [
        challengeType,
        BigInt(distanceCm),
        BigInt(durationDays),
        BigInt(startTime),
        BigInt(challengeType === 1 ? 2 : (maxParticipants || 10)),
        isPrivate ?? false,
        inviteCodeHash,
      ],
      valueWei
    )

    // Parse ChallengeCreated event for challengeId
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

    // Save metadata to Supabase
    if (challengeId !== null) {
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
    }

    // Update stake transaction with chain details
    if (challengeId !== null) {
      await supabaseAdmin
        .from('transactions')
        .update({
          chain_challenge_id: challengeId,
          tx_hash: receipt.transactionHash,
        })
        .eq('user_id', user.id)
        .eq('type', 'stake')
        .is('chain_challenge_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
    }

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
    })

    console.error('Create challenge tx failed:', err)
    return NextResponse.json(
      { error: 'Transaction failed. Balance refunded.', balance: refundBalance },
      { status: 500 }
    )
  }
}
