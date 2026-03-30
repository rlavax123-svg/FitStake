-- Team Battle support: add team tracking columns
-- Run this in Supabase SQL editor (Dashboard → SQL → New query)

ALTER TABLE challenge_metadata
  ADD COLUMN IF NOT EXISTS is_team_battle BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS team_size INTEGER;

ALTER TABLE challenge_participants
  ADD COLUMN IF NOT EXISTS team INTEGER;

-- Index for quick team lookups
CREATE INDEX IF NOT EXISTS idx_participants_team
  ON challenge_participants(chain_challenge_id, team);
