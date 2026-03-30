import { NextResponse } from 'next/server'
import { createSession, SESSION_COOKIE } from '@/lib/auth-config'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const url = new URL(request.url)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/?error=strava_denied`)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?error=token_exchange_failed`)
    }

    const data = await tokenRes.json()
    const athlete = data.athlete

    // Save to Supabase
    try {
      await supabaseAdmin.from('users').upsert(
        {
          wallet_address: `strava_${athlete.id}`,
          strava_athlete_id: athlete.id,
          strava_access_token: data.access_token,
          strava_refresh_token: data.refresh_token,
          strava_token_expires_at: data.expires_at,
          name: `${athlete.firstname} ${athlete.lastname}`.trim() || null,
        },
        { onConflict: 'strava_athlete_id' }
      )
    } catch (err) {
      console.error('Supabase save failed:', err)
    }

    // Create session JWT
    const token = await createSession({
      stravaId: athlete.id,
      name: `${athlete.firstname} ${athlete.lastname}`,
      image: athlete.profile || null,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
    })

    // Set cookie and redirect to dashboard
    const response = NextResponse.redirect(`${baseUrl}/`)
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (err) {
    console.error('Auth callback error:', err)
    return NextResponse.redirect(`${baseUrl}/?error=auth_failed`)
  }
}
