-- Playoff game logs: per-game stats during playoff runs
-- Source: BBRef individual player pages (/players/{letter}/{id}/gamelog-playoffs/)
-- Enables series-level analysis: "averaged 25/8 in the Finals"

CREATE TABLE IF NOT EXISTS playoff_game_logs (
  id BIGSERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  season TEXT NOT NULL,
  game_date DATE NOT NULL,
  team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  is_home BOOLEAN NOT NULL DEFAULT TRUE,
  result TEXT,
  minutes REAL,
  pts INTEGER,
  trb INTEGER,
  ast INTEGER,
  stl INTEGER,
  blk INTEGER,
  tov INTEGER,
  fg INTEGER,
  fga INTEGER,
  fg3 INTEGER,
  fg3a INTEGER,
  ft INTEGER,
  fta INTEGER,
  orb INTEGER,
  drb INTEGER,
  pf INTEGER,
  plus_minus REAL,
  game_score REAL,
  league TEXT NOT NULL DEFAULT 'NBA',
  UNIQUE(player_name, game_date, team_id)
);

CREATE INDEX IF NOT EXISTS idx_pgl_player_name ON playoff_game_logs(player_name);
CREATE INDEX IF NOT EXISTS idx_pgl_season ON playoff_game_logs(season);
CREATE INDEX IF NOT EXISTS idx_pgl_team_id ON playoff_game_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_pgl_opponent_id ON playoff_game_logs(opponent_id);
