import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'fitstake_session'
const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'fitstake-dev-secret')
)
if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('NEXTAUTH_SECRET env var is required in production')
}

export interface SessionUser {
  stravaId: number
  name: string
  image: string | null
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = await new SignJWT({
    stravaId: user.stravaId,
    name: user.name,
    image: user.image,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)

  return token
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    const { payload } = await jwtVerify(token, SECRET)
    return {
      stravaId: payload.stravaId as number,
      name: payload.name as string,
      image: (payload.image as string) || null,
      accessToken: '',
      refreshToken: '',
      expiresAt: 0,
    }
  } catch {
    return null
  }
}

export { SESSION_COOKIE }
