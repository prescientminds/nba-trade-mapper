-- Transaction scores: CATV-scored non-trade moves (signings, extensions, claims, etc.)
-- Populated by scripts/score-transactions.ts
-- Mirrors trade_scores pattern but for single-team moves.

CREATE TABLE IF NOT EXISTS transaction_scores (
  transaction_id TEXT PRIMARY KEY,
  season TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_id TEXT NOT NULL,

  -- CATV value (same formula as trade scoring)
  seasons_scored INTEGER DEFAULT 0,
  win_shares NUMERIC(8,2) DEFAULT 0,
  playoff_ws NUMERIC(8,2) DEFAULT 0,
  championships INTEGER DEFAULT 0,
  championship_bonus NUMERIC(8,2) DEFAULT 0,
  accolades JSONB DEFAULT '[]',
  accolade_bonus NUMERIC(8,2) DEFAULT 0,
  catv_score NUMERIC(8,2) DEFAULT 0,

  -- Salary efficiency
  salary_at_move INTEGER,                  -- Salary in the move season
  total_salary INTEGER,                    -- Sum of all salary on this team post-move
  dollars_per_ws NUMERIC(12,2),            -- Total salary / total WS (lower = better)
  cap_pct NUMERIC(6,4),                    -- Move-season salary as fraction of cap

  -- Team context
  team_wins_before INTEGER,                -- Wins in season before move
  team_wins_after INTEGER,                 -- Wins in season of move (or next full season)
  win_delta INTEGER,                       -- team_wins_after - team_wins_before

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ranked-list queries
CREATE INDEX IF NOT EXISTS idx_tx_scores_catv ON transaction_scores (catv_score DESC);
CREATE INDEX IF NOT EXISTS idx_tx_scores_dpws ON transaction_scores (dollars_per_ws ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tx_scores_team ON transaction_scores (team_id);
CREATE INDEX IF NOT EXISTS idx_tx_scores_season ON transaction_scores (season);
CREATE INDEX IF NOT EXISTS idx_tx_scores_type ON transaction_scores (transaction_type);
CREATE INDEX IF NOT EXISTS idx_tx_scores_player ON transaction_scores (player_name);

-- RLS
ALTER TABLE transaction_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transaction_scores_read" ON transaction_scores FOR SELECT USING (true);
