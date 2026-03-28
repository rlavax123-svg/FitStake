import { NextResponse } from 'next/server'
import { exchangeStravaCode } from '@/lib/strava'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const walletAddress = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?strava_error=${error}`)
  }

  if (!code || !walletAddress) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?strava_error=missing_params`)
  }

  try {
    // Exchange authorization code for tokens
    const tokenData = await exchangeStravaCode(code)

    // Upsert user with Strava credentials
    const { error: dbError } = await supabaseAdmin.from('users').upsert(
      {
        wallet_address: walletAddress,
        strava_athlete_id: tokenData.athlete.id,
        strava_access_token: tokenData.access_token,
        strava_refresh_token: tokenData.refresh_token,
        strava_token_expires_at: tokenData.expires_at,
      },
      { onConflict: 'wallet_address' }
    )

    if (dbError) {
      console.error('Supabase upsert error:', dbError)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?strava_error=db_error`)
    }

    // Redirect back to app with success
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?strava_connected=true`)
  } catch (err) {
    console.error('Strava callback error:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?strava_error=exchange_failed`)
  }
}
