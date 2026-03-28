import { NextResponse } from 'next/server'
import { fetchStravaActivities, isValidRunActivity } from '@/lib/strava'
import { supabaseAdmin } from '@/lib/supabase'

/// Fetch and validate Strava activities for a user.
/// Called by CRE workflow via HTTPClient during verification.
/// Returns total valid running distance in centimeters.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const walletAddress = searchParams.get('wallet')
  const afterTimestamp = searchParams.get('after') // Unix epoch seconds

  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 })
  }

  // Look up user and their Strava token
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.strava_access_token) {
    return NextResponse.json({ error: 'Strava not connected' }, { status: 400 })
  }

  // Check if token is expired
  const now = Math.floor(Date.now() / 1000)
  if (user.strava_token_expires_at && user.strava_token_expires_at < now) {
    return NextResponse.json({ error: 'Strava token expired, needs refresh' }, { status: 401 })
  }

  try {
    const after = afterTimestamp ? parseInt(afterTimestamp) : undefined
    const activities = await fetchStravaActivities(user.strava_access_token, after)

    // Filter to valid runs only
    const validRuns = activities.filter(isValidRunActivity)

    // Calculate total distance in centimeters
    const totalDistanceCm = validRuns.reduce((sum, a) => sum + Math.round(a.distance * 100), 0)

    // Cache activities in Supabase
    for (const activity of validRuns) {
      await supabaseAdmin.from('activity_cache').upsert(
        {
          user_id: user.id,
          strava_activity_id: activity.id,
          type: activity.type,
          distance_meters: activity.distance,
          moving_time_seconds: activity.moving_time,
          start_date: activity.start_date,
          manual: activity.manual,
          flagged: activity.flagged,
          device_name: activity.device_name,
          has_gps: !!activity.start_latlng?.length,
          average_speed: activity.average_speed,
        },
        { onConflict: 'strava_activity_id' }
      )
    }

    return NextResponse.json({
      wallet: walletAddress,
      totalDistanceCm,
      totalDistanceKm: totalDistanceCm / 100_000,
      validRunCount: validRuns.length,
      totalActivityCount: activities.length,
      rejectedCount: activities.length - validRuns.length,
    })
  } catch (err) {
    console.error('Failed to fetch Strava activities:', err)
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
  }
}
