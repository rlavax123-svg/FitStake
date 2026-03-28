import { NextResponse } from 'next/server'
import { getStravaAuthUrl } from '@/lib/strava'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const walletAddress = searchParams.get('wallet')

  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 })
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/strava/callback`
  const authUrl = getStravaAuthUrl(redirectUri)

  // Append wallet address as state parameter so we can link it after callback
  const urlWithState = `${authUrl}&state=${encodeURIComponent(walletAddress)}`

  return NextResponse.redirect(urlWithState)
}
