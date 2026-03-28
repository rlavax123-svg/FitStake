import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshStravaToken } from '@/lib/strava'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get user's Strava tokens from Supabase
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('strava_athlete_id', session.stravaId)
    .single()

  if (error || !user || !user.strava_access_token) {
    return NextResponse.json({ error: 'Strava not connected' }, { status: 400 })
  }

  // Check if token needs refresh
  let accessToken = user.strava_access_token
  const now = Math.floor(Date.now() / 1000)
  if (user.strava_token_expires_at && user.strava_token_expires_at < now) {
    try {
      const refreshed = await refreshStravaToken(user.strava_refresh_token)
      accessToken = refreshed.access_token

      await supabaseAdmin
        .from('users')
        .update({
          strava_access_token: refreshed.access_token,
          strava_refresh_token: refreshed.refresh_token,
          strava_token_expires_at: refreshed.expires_at,
        })
        .eq('strava_athlete_id', session.stravaId)
    } catch {
      return NextResponse.json({ error: 'Failed to refresh Strava token' }, { status: 401 })
    }
  }

  // Fetch recent activities (last 30 days)
  try {
    const thirtyDaysAgo = now - 30 * 86400
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${thirtyDaysAgo}&per_page=30`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `Strava API error: ${res.status}` },
        { status: res.status }
      )
    }

    const activities = await res.json()

    // Map to a clean format
    const runs = activities
      .filter((a: { type: string }) => a.type === 'Run')
      .map(
        (a: {
          id: number
          name: string
          distance: number
          moving_time: number
          start_date_local: string
          average_speed: number
          total_elevation_gain: number
          manual: boolean
          flagged: boolean
        }) => ({
          id: a.id,
          name: a.name,
          distanceKm: (a.distance / 1000).toFixed(2),
          durationMin: Math.round(a.moving_time / 60),
          pace: formatPace(a.moving_time, a.distance),
          date: a.start_date_local,
          elevationM: Math.round(a.total_elevation_gain),
          manual: a.manual,
          flagged: a.flagged,
        })
      )

    const totalDistanceKm = activities
      .filter((a: { type: string }) => a.type === 'Run')
      .reduce((sum: number, a: { distance: number }) => sum + a.distance, 0) / 1000

    const totalRuns = runs.length

    return NextResponse.json({
      runs,
      stats: {
        totalDistanceKm: totalDistanceKm.toFixed(1),
        totalRuns,
        last30Days: true,
      },
    })
  } catch (err) {
    console.error('Failed to fetch activities:', err)
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
  }
}

function formatPace(seconds: number, meters: number): string {
  if (meters === 0) return '-'
  const paceSecondsPerKm = (seconds / meters) * 1000
  const mins = Math.floor(paceSecondsPerKm / 60)
  const secs = Math.round(paceSecondsPerKm % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}/km`
}
