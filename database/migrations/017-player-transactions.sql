-- Player transactions (non-trade moves): signings, waivers, extensions, etc.
-- Complements the existing trades pipeline with full transaction coverage.

CREATE TABLE IF NOT EXISTS player_transactions (
  id TEXT PRIMARY KEY,
  date DATE,
  season TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'signing', 'waiver', 'extension', 'two_way', 'exhibit_10',
    '10_day', 'claimed', 'converted', 'retirement', 'suspension',
    'rest_of_season', 'other'
  )),
  player_name TEXT NOT NULL,
  player_bbref_id TEXT,
  team_id TEXT REFERENCES teams(id),
  from_team_id TEXT REFERENCES teams(id),  -- for claims (waived from)
  contract_type TEXT,  -- 'multi_year', 'two_way', 'exhibit_10', '10_day', 'rest_of_season', etc.
  description TEXT NOT NULL,
  notes TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_player_tx_player ON player_transactions(player_name);
CREATE INDEX IF NOT EXISTS idx_player_tx_team ON player_transactions(team_id);
CREATE INDEX IF NOT EXISTS idx_player_tx_season ON player_transactions(season);
CREATE INDEX IF NOT EXISTS idx_player_tx_type ON player_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_player_tx_date ON player_transactions(date);

-- RLS
ALTER TABLE player_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_transactions_read" ON player_transactions FOR SELECT USING (true);
