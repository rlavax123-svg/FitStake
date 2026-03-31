import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ competitors: [] })
  }

  // Find all challenges this user participated in
  const { data: myChallenges } = await supabaseAdmin
    .from('challenge_participants')
    .select('chain_challenge_id')
    .eq('strava_athlete_id', session.stravaId)

  if (!myChallenges?.length) {
    return NextResponse.json({ competitors: [] })
  }

  const challengeIds = myChallenges.map((c) => c.chain_challenge_id)

  // Find all other participants in those challenges
  const { data: otherParticipants } = await supabaseAdmin
    .from('challenge_participants')
    .select('strava_athlete_id, chain_challenge_id')
    .in('chain_challenge_id', challengeIds)
    .neq('strava_athlete_id', session.stravaId)

  if (!otherParticipants?.length) {
    return NextResponse.json({ competitors: [] })
  }

  // Count how many challenges shared with each person
  const countMap = new Map<number, number>()
  for (const p of otherParticipants) {
    countMap.set(p.strava_athlete_id, (countMap.get(p.strava_athlete_id) || 0) + 1)
  }

  // Get names for these users
  const stravaIds = [...countMap.keys()]
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('strava_athlete_id, name')
    .in('strava_athlete_id', stravaIds)

  const nameMap = new Map<number, string>()
  for (const u of users || []) {
    if (u.name) nameMap.set(u.strava_athlete_id, u.name)
  }

  // Build sorted list (most shared challenges first)
  const competitors = stravaIds
    .filter((id) => nameMap.has(id))
    .map((id) => ({
      name: nameMap.get(id)!,
      challengeCount: countMap.get(id) || 0,
    }))
    .sort((a, b) => b.challengeCount - a.challengeCount)
    .slice(0, 20)

  return NextResponse.json({ competitors })
}
