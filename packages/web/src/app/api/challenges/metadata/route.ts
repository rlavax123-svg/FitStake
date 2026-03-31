import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = searchParams.get('ids')

  if (!ids) {
    return NextResponse.json({ metadata: {} })
  }

  const idList = ids.split(',').map(Number).filter(Boolean)

  const { data } = await supabaseAdmin
    .from('challenge_metadata')
    .select('chain_challenge_id, name, stake_gbp, is_team_battle, team_size, invite_code, created_by')
    .in('chain_challenge_id', idList)

  // Check if caller is the creator (to decide whether to expose invite code)
  const { getSession } = await import('@/lib/auth-config')
  const session = await getSession()
  let userId: string | null = null
  if (session) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('strava_athlete_id', session.stravaId)
      .maybeSingle()
    userId = user?.id ?? null
  }

  const metadata: Record<number, { name: string; stakeGbp: number | null; isTeamBattle?: boolean; teamSize?: number; isPrivate?: boolean; inviteCode?: string }> = {}
  for (const row of data || []) {
    metadata[row.chain_challenge_id] = {
      name: row.name,
      stakeGbp: row.stake_gbp,
      ...(row.is_team_battle ? { isTeamBattle: true, teamSize: row.team_size } : {}),
      ...(row.invite_code ? { isPrivate: true } : {}),
      // Only expose invite code to the creator
      ...(row.invite_code && userId === row.created_by ? { inviteCode: row.invite_code } : {}),
    }
  }

  return NextResponse.json({ metadata })
}
