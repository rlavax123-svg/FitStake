import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth-config'

export async function GET() {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ authenticated: false })
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      stravaId: session.stravaId,
      name: session.name,
      image: session.image,
    },
  })
}
