import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { challengeId } = await request.json()

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Upsert race state — create if not exists, mark ready
  await supabaseAdmin
    .from('race_state')
    .upsert({
      chain_challenge_id: challengeId,
      user_id: user.id,
      is_ready: true,
      cumulative_distance_cm: 0,
      last_lat: null,
      last_lng: null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'chain_challenge_id,user_id',
    })

  // Check if both participants are ready
  const { data: allStates } = await supabaseAdmin
    .from('race_state')
    .select('is_ready')
    .eq('chain_challenge_id', challengeId)

  const allReady = allStates && allStates.length >= 2 && allStates.every(s => s.is_ready)

  return NextResponse.json({ ready: true, allReady })
}
