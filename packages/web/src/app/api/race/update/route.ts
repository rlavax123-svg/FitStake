import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

// Haversine distance in meters between two GPS points
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { challengeId, lat, lng, accuracy } = await request.json()

  if (!challengeId || typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Reject poor GPS accuracy (> 30 meters)
  if (accuracy && accuracy > 30) {
    return NextResponse.json({ error: 'GPS accuracy too low', accuracy }, { status: 400 })
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Get current race state
  const { data: state } = await supabaseAdmin
    .from('race_state')
    .select('*')
    .eq('chain_challenge_id', challengeId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!state) {
    return NextResponse.json({ error: 'Not in this race' }, { status: 400 })
  }

  let newDistance = state.cumulative_distance_cm

  if (state.last_lat !== null && state.last_lng !== null) {
    const deltaMeters = haversineMeters(state.last_lat, state.last_lng, lat, lng)

    // Anti-cheat: reject if speed > 30 km/h (8.33 m/s)
    const timeDeltaSec = (Date.now() - new Date(state.updated_at).getTime()) / 1000
    if (timeDeltaSec > 0 && deltaMeters / timeDeltaSec > 8.33) {
      return NextResponse.json({ error: 'Speed too high — rejected' }, { status: 400 })
    }

    // Anti-cheat: reject if pace faster than 2:30/km (150 sec/km = 6.67 m/s)
    // Only check on meaningful distances (> 5 meters, avoids GPS jitter)
    if (deltaMeters > 5) {
      newDistance += Math.round(deltaMeters * 100) // meters to cm
    }
  }

  // Update race state
  await supabaseAdmin
    .from('race_state')
    .update({
      cumulative_distance_cm: newDistance,
      last_lat: lat,
      last_lng: lng,
      last_accuracy: accuracy ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.id)

  return NextResponse.json({
    distanceCm: newDistance,
    timestamp: Date.now(),
  })
}
