import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const challengeId = searchParams.get('challengeId')

  if (!challengeId) {
    return NextResponse.json({ error: 'Missing challengeId' }, { status: 400 })
  }

  const { data: states } = await supabaseAdmin
    .from('race_state')
    .select('user_id, is_ready, cumulative_distance_cm, updated_at')
    .eq('chain_challenge_id', Number(challengeId))

  // Get names for participants
  const userIds = (states || []).map(s => s.user_id)
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, name')
    .in('id', userIds)

  const nameMap = new Map((users || []).map(u => [u.id, u.name]))

  const participants = (states || []).map(s => ({
    userId: s.user_id,
    name: nameMap.get(s.user_id) || 'Runner',
    isReady: s.is_ready,
    distanceCm: s.cumulative_distance_cm,
    updatedAt: s.updated_at,
  }))

  return NextResponse.json({ participants })
}
