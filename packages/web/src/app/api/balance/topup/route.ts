import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

const TOPUP_AMOUNT = 50

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get current user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, balance')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const newBalance = (user.balance ?? 0) + TOPUP_AMOUNT

  // Update balance
  await supabaseAdmin
    .from('users')
    .update({ balance: newBalance })
    .eq('id', user.id)

  // Log transaction
  await supabaseAdmin.from('transactions').insert({
    user_id: user.id,
    type: 'topup',
    amount: TOPUP_AMOUNT,
  })

  return NextResponse.json({ balance: newBalance })
}
