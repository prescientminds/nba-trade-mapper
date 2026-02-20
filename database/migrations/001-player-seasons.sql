-- Player season stats (per-game + advanced)
CREATE TABLE IF NOT EXISTS player_seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_name TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  season TEXT NOT NULL,
  gp INTEGER,
  ppg NUMERIC(5,1),
  rpg NUMERIC(5,1),
  apg NUMERIC(5,1),
  fg_pct NUMERIC(5,3),
  win_shares NUMERIC(6,1),
  per NUMERIC(5,1),
  vorp NUMERIC(6,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_name, team_id, season)
);

CREATE INDEX idx_player_seasons_name ON player_seasons(player_name);
CREATE INDEX idx_player_seasons_team ON player_seasons(team_id);

-- RLS
ALTER TABLE player_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON player_seasons FOR SELECT USING (true);
CREATE POLICY "Service role full access" ON player_seasons FOR ALL USING (auth.role() = 'service_role');
