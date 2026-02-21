-- Migration 006: Trade scoring table
-- Stores precomputed trade value scores for each side.
-- Populated by scripts/score-trades.ts

CREATE TABLE IF NOT EXISTS trade_scores (
  trade_id     TEXT PRIMARY KEY,
  season       TEXT NOT NULL,
  team_scores  JSONB NOT NULL,
  -- team_scores schema:
  -- {
  --   "GSW": {
  --     "score": 25.4,
  --     "assets": [
  --       {
  --         "name": "Andrew Wiggins",
  --         "type": "player",          -- "player" | "pick"
  --         "seasons": 3,
  --         "ws": 12.5,
  --         "vorp": 3.2,
  --         "playoff_ws": 4.1,
  --         "championships": 1,
  --         "accolades": ["All-Star"],
  --         "accolade_bonus": 0.3,
  --         "score": 25.4
  --       }
  --     ]
  --   },
  --   "MIN": { "score": 8.2, "assets": [...] }
  -- }
  winner       TEXT,           -- team_id with highest score (null if margin < 2.0)
  lopsidedness DECIMAL(6, 2),  -- abs diff between top two teams' scores
  scored_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_scores_season_idx ON trade_scores (season);
CREATE INDEX IF NOT EXISTS trade_scores_winner_idx  ON trade_scores (winner);
