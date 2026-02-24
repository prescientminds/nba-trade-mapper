-- Migration 008: league impact columns on trade_chain_scores
--
-- Adds league-wide impact metrics: total career value produced by ALL players
-- set in motion by a trade cascade, regardless of which team they end up on.
--
-- This differs from the existing chain_scores (team-centric "asset management")
-- which only credits value a player produced while on the receiving team.
--
-- Run via: Supabase SQL Editor
--   https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new

ALTER TABLE trade_chain_scores
  ADD COLUMN IF NOT EXISTS league_impact DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS league_impact_players INTEGER,
  ADD COLUMN IF NOT EXISTS league_impact_depth INTEGER,
  ADD COLUMN IF NOT EXISTS league_impact_top JSONB;

CREATE INDEX IF NOT EXISTS trade_chain_scores_league_impact_idx
  ON trade_chain_scores (league_impact DESC NULLS LAST);
