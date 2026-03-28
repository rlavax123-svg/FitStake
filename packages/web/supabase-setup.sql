-- ============================================================================
-- FitStake Supabase Setup
-- Run this in: https://supabase.com/dashboard/project/iwqjvwgbxvdnkwijmswm/sql
-- ============================================================================

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

-- Challenge metadata (off-chain data like names, descriptions)
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

-- Balance column on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) DEFAULT 0;

-- Transaction audit trail
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  chain_challenge_id BIGINT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

-- Challenge participant tracking (maps Strava users to on-chain challenges)
CREATE TABLE IF NOT EXISTS challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_challenge_id BIGINT NOT NULL,
  user_id UUID REFERENCES users(id),
  strava_athlete_id BIGINT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chain_challenge_id, strava_athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_cp_chain ON challenge_participants(chain_challenge_id);
CREATE INDEX IF NOT EXISTS idx_cp_strava ON challenge_participants(strava_athlete_id);

-- RLS for new tables
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Anyone can read challenge participants" ON challenge_participants FOR SELECT USING (true);
