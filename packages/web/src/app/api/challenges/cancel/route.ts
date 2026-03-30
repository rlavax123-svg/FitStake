import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { sendContractTxHash, publicClient } from '@/lib/server-wallet'
import { FITSTAKE_ABI, FITSTAKE_ADDRESS } from '@/lib/contracts'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { challengeId } = body

  if (typeof challengeId !== 'number' || challengeId < 1) {
    return NextResponse.json({ error: 'Invalid challengeId' }, { status: 400 })
  }

  // Get the user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, balance')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Check the user is the creator
  const { data: meta } = await supabaseAdmin
    .from('challenge_metadata')
    .select('created_by, stake_gbp')
    .eq('chain_challenge_id', challengeId)
    .maybeSingle()

  if (!meta) {
    return NextResponse.json({ error: 'Challenge metadata not found' }, { status: 404 })
  }

  if (meta.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the creator can cancel this challenge' }, { status: 403 })
  }

  // Read challenge from chain to verify state=0 (Created) and participantCount=1
  const challengeData = await publicClient.readContract({
    address: FITSTAKE_ADDRESS,
    abi: FITSTAKE_ABI,
    functionName: 'getChallenge',
    args: [BigInt(challengeId)],
  })

  const cd = challengeData as unknown as Record<string, unknown>
  const state = Number(cd.state ?? 0)
  const participantCount = Number(cd.participantCount ?? 0)

  if (state !== 0) {
    return NextResponse.json({ error: 'Challenge is not in Created state' }, { status: 400 })
  }

  if (participantCount !== 1) {
    return NextResponse.json(
      { error: 'Cannot cancel: other participants have joined' },
      { status: 400 }
    )
  }

  const stakeGbp = meta.stake_gbp ?? 0

  try {
    // Call cancelChallenge on the contract
    await sendContractTxHash('cancelChallenge', [BigInt(challengeId)])

    // Refund the user's GBP balance
    const newBalance = (user.balance ?? 0) + stakeGbp
    await supabaseAdmin
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id)

    // Log a refund transaction
    await supabaseAdmin.from('transactions').insert({
      user_id: user.id,
      type: 'refund',
      amount: stakeGbp,
      chain_challenge_id: challengeId,
    })

    return NextResponse.json({
      success: true,
      challengeId,
      balance: newBalance,
    })
  } catch (err) {
    console.error('Cancel challenge tx failed:', err)
    return NextResponse.json(
      { error: 'Transaction failed. Please try again.' },
      { status: 500 }
    )
  }
}
