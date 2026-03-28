// Strava API helpers

const STRAVA_API_BASE = 'https://www.strava.com/api/v3'
const STRAVA_AUTH_BASE = 'https://www.strava.com/oauth'

// -------------------------------------------------------------------------
// OAuth
// -------------------------------------------------------------------------

export function getStravaAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'activity:read_all',
    approval_prompt: 'auto',
  })
  return `${STRAVA_AUTH_BASE}/authorize?${params}`
}

export async function exchangeStravaCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(`${STRAVA_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${res.status}`)
  }

  return res.json()
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const res = await fetch(`${STRAVA_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`)
  }

  return res.json()
}

// -------------------------------------------------------------------------
// Activity Fetching
// -------------------------------------------------------------------------

export async function fetchStravaActivities(
  accessToken: string,
  after?: number
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    per_page: '100',
  })
  if (after) {
    params.set('after', after.toString())
  }

  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Strava activities fetch failed: ${res.status}`)
  }

  return res.json()
}

// -------------------------------------------------------------------------
// Anti-Cheat Validation
// -------------------------------------------------------------------------

export function isValidRunActivity(activity: StravaActivity): boolean {
  // Reject non-run activities
  if (activity.type !== 'Run') return false

  // Reject manual entries (hand-typed)
  if (activity.manual) return false

  // Reject flagged activities (Strava community flagged)
  if (activity.flagged) return false

  // Reject GPS file imports (common cheating method)
  if (activity.device_name === 'StravaGPX') return false
  if (activity.external_id?.startsWith('garmin_push_')) {
    // Garmin push is legitimate — allow
  }

  // Reject impossible pace (faster than world record ~2:30/km)
  if (activity.distance > 0 && activity.moving_time > 0) {
    const paceSecondsPerKm = (activity.moving_time / activity.distance) * 1000
    if (paceSecondsPerKm < 150) return false // 2:30 = 150 seconds
  }

  // Reject no GPS data (unless treadmill)
  if (!activity.start_latlng?.length && !activity.trainer) return false

  return true
}

/// Sum valid running distance in centimeters
export function sumValidRunDistanceCm(activities: StravaActivity[]): number {
  return activities
    .filter(isValidRunActivity)
    .reduce((sum, a) => sum + Math.round(a.distance * 100), 0)
}

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface StravaTokenResponse {
  token_type: string
  expires_at: number
  expires_in: number
  refresh_token: string
  access_token: string
  athlete: {
    id: number
    firstname: string
    lastname: string
  }
}

export interface StravaActivity {
  id: number
  name: string
  type: string
  sport_type: string
  distance: number // meters
  moving_time: number // seconds
  elapsed_time: number
  start_date: string
  start_date_local: string
  start_latlng: number[] | null
  end_latlng: number[] | null
  manual: boolean
  flagged: boolean
  trainer: boolean
  device_name: string | null
  average_speed: number // m/s
  max_speed: number
  external_id: string | null
}
