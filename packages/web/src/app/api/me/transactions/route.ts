import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: transactions, error } = await supabaseAdmin
    .from('transactions')
    .select('id, type, amount, chain_challenge_id, tx_hash, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ transactions: [] })
  }

  // Get challenge names for transactions that have a chain_challenge_id
  const challengeIds = [
    ...new Set(
      transactions
        .filter((t) => t.chain_challenge_id !== null)
        .map((t) => t.chain_challenge_id!)
    ),
  ]

  let nameMap = new Map<number, string>()
  if (challengeIds.length > 0) {
    const { data: metadataRows } = await supabaseAdmin
      .from('challenge_metadata')
      .select('chain_challenge_id, name')
      .in('chain_challenge_id', challengeIds)

    nameMap = new Map(
      (metadataRows || []).map((m) => [m.chain_challenge_id, m.name])
    )
  }

  const result = transactions.map((t) => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    chain_challenge_id: t.chain_challenge_id,
    challenge_name: t.chain_challenge_id ? nameMap.get(t.chain_challenge_id) ?? null : null,
    tx_hash: t.tx_hash,
    created_at: t.created_at,
  }))

  return NextResponse.json({ transactions: result })
}
