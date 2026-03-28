import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client-side Supabase (limited permissions via RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase (full access, only use in API routes)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// -------------------------------------------------------------------------
// Types matching our Supabase tables
// -------------------------------------------------------------------------

export interface DbUser {
  id: string
  wallet_address: string
  email: string | null
  strava_athlete_id: number | null
  strava_access_token: string | null
  strava_refresh_token: string | null
  strava_token_expires_at: number | null
  created_at: string
}

export interface DbActivityCache {
  id: string
  user_id: string
  strava_activity_id: number
  type: string
  distance_meters: number
  moving_time_seconds: number
  start_date: string
  manual: boolean
  flagged: boolean
  device_name: string | null
  has_gps: boolean
  average_speed: number
  synced_at: string
}

export interface DbChallengeMetadata {
  id: string
  chain_challenge_id: number
  name: string
  description: string | null
  invite_code: string | null
  created_by: string
}

export interface DbTransaction {
  id: string
  user_id: string
  type: 'topup' | 'stake' | 'refund' | 'winnings'
  amount: number
  chain_challenge_id: number | null
  tx_hash: string | null
  created_at: string
}

export interface DbChallengeParticipant {
  id: string
  chain_challenge_id: number
  user_id: string
  strava_athlete_id: number
  joined_at: string
}

// -------------------------------------------------------------------------
// SQL to create tables (run this in Supabase SQL editor)
// -------------------------------------------------------------------------

export const SETUP_SQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  email TEXT,
  strava_athlete_id BIGINT UNIQUE,
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_token_expires_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity cache (reduces Strava API calls)
CREATE TABLE IF NOT EXISTS activity_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  strava_activity_id BIGINT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  distance_meters DOUBLE PRECISION NOT NULL,
  moving_time_seconds INTEGER NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  manual BOOLEAN DEFAULT FALSE,
  flagged BOOLEAN DEFAULT FALSE,
  device_name TEXT,
  has_gps BOOLEAN DEFAULT TRUE,
  average_speed DOUBLE PRECISION DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Challenge metadata (off-chain data)
CREATE TABLE IF NOT EXISTS challenge_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_challenge_id BIGINT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT,
  created_by UUID REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_cache_user ON activity_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_cache_strava ON activity_cache(strava_activity_id);
CREATE INDEX IF NOT EXISTS idx_challenge_metadata_chain ON challenge_metadata(chain_challenge_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_metadata ENABLE ROW LEVEL SECURITY;

-- Policies: users can read their own data
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (true);
CREATE POLICY "Users can read own activities" ON activity_cache FOR SELECT USING (true);
CREATE POLICY "Anyone can read challenge metadata" ON challenge_metadata FOR SELECT USING (true);
`
