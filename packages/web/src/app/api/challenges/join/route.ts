import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTx, weiToGbp, publicClient, stravaIdToAddress } from '@/lib/server-wallet'
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
  const startTime = Number(cd.startTime ?? 0)
  const isPrivateChallenge = cd.isPrivate as boolean
  const inviteCodeHash = cd.inviteCodeHash as `0x${string}`

  if (state !== 0) {
    return NextResponse.json({ error: 'Challenge is not open for joining' }, { status: 400 })
  }

  // Check join window hasn't closed
  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec >= startTime) {
    return NextResponse.json({ error: 'Join window has closed — challenge has started' }, { status: 400 })
  }

  // Validate invite code BEFORE deducting balance
  if (isPrivateChallenge) {
    if (!inviteCode) {
      return NextResponse.json({ error: 'Invite code required for private challenge' }, { status: 400 })
    }
    const { keccak256: k, toBytes: tb } = await import('viem')
    const providedHash = k(tb(inviteCode))
    if (providedHash !== inviteCodeHash) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 })
    }
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
    const participantAddress = stravaIdToAddress(session.stravaId)
    const inviteCodeBytes = inviteCode
      ? toHex(toBytes(inviteCode))
      : '0x' as `0x${string}`

    const receipt = await sendContractTx(
      'joinChallengeFor',
      [BigInt(challengeId), participantAddress, inviteCodeBytes],
      stakeWei
    )

    // Check if this is a team battle and assign team
    const { data: teamMeta } = await supabaseAdmin
      .from('challenge_metadata')
      .select('is_team_battle, team_size')
      .eq('chain_challenge_id', challengeId)
      .maybeSingle()

    let assignedTeam: number | undefined
    if (teamMeta?.is_team_battle) {
      // Count current team members and assign to the smaller team
      const { data: existingParticipants } = await supabaseAdmin
        .from('challenge_participants')
        .select('team')
        .eq('chain_challenge_id', challengeId)

      const team1Count = (existingParticipants || []).filter(p => p.team === 1).length
      const team2Count = (existingParticipants || []).filter(p => p.team === 2).length
      assignedTeam = team1Count <= team2Count ? 1 : 2
    }

    // Track participation
    await supabaseAdmin.from('challenge_participants').insert({
      chain_challenge_id: challengeId,
      user_id: user.id,
      strava_athlete_id: session.stravaId,
      ...(assignedTeam ? { team: assignedTeam } : {}),
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
