import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth-config'

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3002'
  const response = NextResponse.redirect(`${baseUrl}/`)
  response.cookies.delete(SESSION_COOKIE)
  return response
}
