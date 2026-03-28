import { NextResponse } from 'next/server'

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL || 'http://localhost:3002'}/api/auth/callback`,
    response_type: 'code',
    scope: 'read,activity:read_all,profile:read_all',
    approval_prompt: 'auto',
  })

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`)
}
