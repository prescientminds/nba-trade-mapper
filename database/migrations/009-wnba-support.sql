-- ═══════════════════════════════════════════════════════════════════════════════
-- 009: WNBA Support
-- Adds league column to all relevant tables and seeds WNBA team data.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add league column to teams ─────────────────────────────────────────────
ALTER TABLE teams ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'NBA';
CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league);

-- ── 2. Add league column to player_seasons ────────────────────────────────────
ALTER TABLE player_seasons ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'NBA';
CREATE INDEX IF NOT EXISTS idx_player_seasons_league ON player_seasons(league);

-- ── 3. Add league column to player_accolades ──────────────────────────────────
ALTER TABLE player_accolades ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'NBA';
CREATE INDEX IF NOT EXISTS idx_player_accolades_league ON player_accolades(league);

-- ── 4. Add league column to team_seasons ──────────────────────────────────────
ALTER TABLE team_seasons ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'NBA';
CREATE INDEX IF NOT EXISTS idx_team_seasons_league ON team_seasons(league);

-- ── 5. Add league column to trade_scores ──────────────────────────────────────
ALTER TABLE trade_scores ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'NBA';
CREATE INDEX IF NOT EXISTS idx_trade_scores_league ON trade_scores(league);

-- ── 6. Add league column to trade_chain_scores ────────────────────────────────
ALTER TABLE trade_chain_scores ADD COLUMN IF NOT EXISTS league TEXT NOT NULL DEFAULT 'NBA';
CREATE INDEX IF NOT EXISTS idx_trade_chain_scores_league ON trade_chain_scores(league);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA: WNBA Teams
-- All WNBA team IDs are prefixed with "W-" to avoid collisions with NBA teams.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Current active teams (2025 season) ────────────────────────────────────────
INSERT INTO teams (id, name, city, color, secondary_color, conference, division, league) VALUES
  ('W-ATL', 'Atlanta Dream',            'Atlanta',       '#E31837', '#0C2340', 'East', 'Eastern', 'WNBA'),
  ('W-CHI', 'Chicago Sky',              'Chicago',       '#418FDE', '#FFCD00', 'East', 'Eastern', 'WNBA'),
  ('W-CON', 'Connecticut Sun',          'Uncasville',    '#F05023', '#0A2240', 'East', 'Eastern', 'WNBA'),
  ('W-DAL', 'Dallas Wings',             'Arlington',     '#C4D600', '#002B5C', 'West', 'Western', 'WNBA'),
  ('W-GSV', 'Golden State Valkyries',   'San Francisco', '#1D428A', '#FFC72C', 'West', 'Western', 'WNBA'),
  ('W-IND', 'Indiana Fever',            'Indianapolis',  '#002D62', '#E03A3E', 'East', 'Eastern', 'WNBA'),
  ('W-LVA', 'Las Vegas Aces',           'Las Vegas',     '#000000', '#C4102E', 'West', 'Western', 'WNBA'),
  ('W-LAS', 'Los Angeles Sparks',       'Los Angeles',   '#552583', '#FDB927', 'West', 'Western', 'WNBA'),
  ('W-MIN', 'Minnesota Lynx',           'Minneapolis',   '#236192', '#78BE20', 'West', 'Western', 'WNBA'),
  ('W-NYL', 'New York Liberty',         'Brooklyn',      '#86CEBC', '#000000', 'East', 'Eastern', 'WNBA'),
  ('W-PHO', 'Phoenix Mercury',          'Phoenix',       '#CB6015', '#1D1160', 'West', 'Western', 'WNBA'),
  ('W-SEA', 'Seattle Storm',            'Seattle',       '#2C5234', '#FEE11A', 'West', 'Western', 'WNBA'),
  ('W-WAS', 'Washington Mystics',       'Washington',    '#E03A3E', '#002B5C', 'East', 'Eastern', 'WNBA')
ON CONFLICT (id) DO UPDATE SET league = 'WNBA';

-- ── Defunct teams (folded franchises) ─────────────────────────────────────────
INSERT INTO teams (id, name, city, color, secondary_color, conference, division, league) VALUES
  ('W-CHA', 'Charlotte Sting',     'Charlotte',  '#00778B', '#F26522', 'East', 'Eastern', 'WNBA'),
  ('W-CLE', 'Cleveland Rockers',   'Cleveland',  '#002D62', '#E03A3E', 'East', 'Eastern', 'WNBA'),
  ('W-HOU', 'Houston Comets',      'Houston',    '#BA0C2F', '#00338D', 'West', 'Western', 'WNBA'),
  ('W-MIA', 'Miami Sol',           'Miami',      '#F47B20', '#00529B', 'East', 'Eastern', 'WNBA'),
  ('W-POR', 'Portland Fire',       'Portland',   '#CE1141', '#000000', 'West', 'Western', 'WNBA'),
  ('W-SAC', 'Sacramento Monarchs', 'Sacramento', '#5A2D81', '#63727A', 'West', 'Western', 'WNBA')
ON CONFLICT (id) DO UPDATE SET league = 'WNBA';

-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTE: Relocated franchise identities (Utah Starzz, San Antonio Stars,
-- Orlando Miracle, Detroit Shock, Tulsa Shock) are NOT separate rows in the
-- teams table. They are stored under their current franchise ID (W-LVA, W-CON,
-- W-DAL) and displayed with historical names via getWnbaTeamDisplayInfo().
-- This mirrors the NBA approach (Seattle → OKC stored as OKC).
-- ═══════════════════════════════════════════════════════════════════════════════
