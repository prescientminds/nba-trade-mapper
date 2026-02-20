-- Player salary/contract data
CREATE TABLE IF NOT EXISTS player_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_name TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  season TEXT NOT NULL,
  salary INTEGER,
  contract_type TEXT,  -- 'rookie', 'extension', 'max', 'vet_min', 'mle'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_name, team_id, season)
);

CREATE INDEX idx_player_contracts_name ON player_contracts(player_name);

-- RLS
ALTER TABLE player_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON player_contracts FOR SELECT USING (true);
CREATE POLICY "Service role full access" ON player_contracts FOR ALL USING (auth.role() = 'service_role');
