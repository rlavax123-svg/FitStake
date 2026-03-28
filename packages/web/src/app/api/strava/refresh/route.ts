import { NextResponse } from 'next/server'
import { refreshStravaToken } from '@/lib/strava'
import { supabaseAdmin } from '@/lib/supabase'

/// Refresh all Strava tokens that expire within the next hour.
/// Call this on a cron schedule (every 5 hours) or before CRE verification.
export async function POST(request: Request) {
  // Simple auth check — in production use a proper secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600

  // Find users whose tokens expire within the next hour
  const { data: users, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, wallet_address, strava_refresh_token, strava_token_expires_at')
    .not('strava_refresh_token', 'is', null)
    .lt('strava_token_expires_at', oneHourFromNow)

  if (fetchError) {
    console.error('Failed to fetch users for refresh:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  if (!users || users.length === 0) {
    return NextResponse.json({ refreshed: 0, message: 'No tokens need refresh' })
  }

  let refreshed = 0
  let failed = 0

  for (const user of users) {
    try {
      const tokenData = await refreshStravaToken(user.strava_refresh_token!)

      await supabaseAdmin
        .from('users')
        .update({
          strava_access_token: tokenData.access_token,
          strava_refresh_token: tokenData.refresh_token,
          strava_token_expires_at: tokenData.expires_at,
        })
        .eq('id', user.id)

      refreshed++
    } catch (err) {
      console.error(`Failed to refresh token for user ${user.id}:`, err)
      failed++
    }
  }

  return NextResponse.json({ refreshed, failed, total: users.length })
}
