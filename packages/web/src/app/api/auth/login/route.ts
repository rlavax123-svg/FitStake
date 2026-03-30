import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Derive redirect URI from the request URL so it works on any port
  const url = new URL(request.url)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${url.protocol}//${url.host}`

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${baseUrl}/api/auth/callback`,
    response_type: 'code',
    scope: 'read,activity:read_all,profile:read_all',
    approval_prompt: 'auto',
  })

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`)
}
