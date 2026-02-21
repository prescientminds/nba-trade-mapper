-- Migration 007: trade_chain_scores
--
-- Stores recursive "chain value" for each trade — the total downstream value
-- a team accumulated by holding an asset, then flipping it for more assets,
-- and so on through the full trade graph.
--
-- One row per trade. chain_scores JSONB is keyed by team_id.
-- max_chain_score and max_chain_breadth enable discovery queries without
-- unpacking JSONB (e.g., ORDER BY max_chain_score DESC).
--
-- Run via: Supabase SQL Editor
--   https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new

CREATE TABLE IF NOT EXISTS trade_chain_scores (
  trade_id          TEXT PRIMARY KEY,
  season            TEXT NOT NULL,

  -- Per-team chain breakdown: { "LAL": { direct, chain, depth, asset_count,
  --   max_single_asset, assets: [{name, type, direct, chain, exit_trade_id, children}] } }
  chain_scores      JSONB NOT NULL DEFAULT '{}',

  -- Derived stats for fast sorting/filtering in discovery queries
  max_chain_score   DECIMAL(8, 2),   -- highest chain total across all teams in this trade
  max_chain_breadth INTEGER,         -- most distinct downstream assets any team accumulated
  max_chain_depth   INTEGER,         -- deepest chain hop count across all teams

  scored_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_chain_scores_max_chain_score_idx
  ON trade_chain_scores (max_chain_score DESC);

CREATE INDEX IF NOT EXISTS trade_chain_scores_season_idx
  ON trade_chain_scores (season);
