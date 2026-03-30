import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const challengeId = parseInt(id)

  if (isNaN(challengeId)) {
    return NextResponse.json({ error: 'Invalid challenge ID' }, { status: 400 })
  }

  const { data: participants } = await supabaseAdmin
    .from('challenge_participants')
    .select('strava_athlete_id, joined_at, team')
    .eq('chain_challenge_id', challengeId)
    .order('joined_at', { ascending: true })

  if (!participants) {
    return NextResponse.json({ participants: [] })
  }

  // Fetch names for Strava athletes
  const stravaIds = participants
    .map(p => p.strava_athlete_id)
    .filter((id): id is number => id !== null)

  let nameMap: Record<number, string> = {}
  if (stravaIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('strava_athlete_id, name, email')
      .in('strava_athlete_id', stravaIds)

    if (users) {
      for (const u of users) {
        if (u.strava_athlete_id) {
          nameMap[u.strava_athlete_id] = u.name || u.email || `Athlete ${u.strava_athlete_id}`
        }
      }
    }
  }

  const result = participants.map((p, i) => ({
    index: i,
    name: p.strava_athlete_id
      ? nameMap[p.strava_athlete_id] || `Runner #${i + 1}`
      : 'Bot',
    isBot: !p.strava_athlete_id,
    team: (p as any).team ?? null,
  }))

  return NextResponse.json({ participants: result })
}
