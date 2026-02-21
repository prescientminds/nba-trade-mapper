-- Migration 005: Add playoff stats columns to player_seasons
-- These are populated by scripts/scrape-playoff-stats.ts

ALTER TABLE player_seasons
  ADD COLUMN IF NOT EXISTS playoff_gp   INTEGER,
  ADD COLUMN IF NOT EXISTS playoff_ppg  DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS playoff_rpg  DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS playoff_apg  DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS playoff_ws   DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS playoff_per  DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS playoff_bpm  DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS playoff_vorp DECIMAL(5, 2);
