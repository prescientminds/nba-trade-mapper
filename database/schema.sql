-- ═══════════════════════════════════════════════════════════════════════════════
-- NBA TRADE IMPACT MAPPER - Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEAMS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE teams (
  id TEXT PRIMARY KEY,  -- e.g., 'LAL', 'BOS'
  name TEXT NOT NULL,   -- e.g., 'Los Angeles Lakers'
  city TEXT,
  color TEXT,           -- Primary color hex
  secondary_color TEXT,
  conference TEXT,      -- 'East' or 'West'
  division TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLAYERS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  bbref_id TEXT UNIQUE,        -- Basketball Reference ID
  current_team_id TEXT REFERENCES teams(id),
  position TEXT,
  birth_date DATE,
  draft_year INTEGER,
  draft_round INTEGER,
  draft_pick INTEGER,
  draft_team_id TEXT REFERENCES teams(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for searching players by name
CREATE INDEX idx_players_name ON players USING gin(to_tsvector('english', name));
CREATE INDEX idx_players_current_team ON players(current_team_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRANSACTIONS TABLE
-- Core table for all NBA transactions (trades, signings, drafts, etc.)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  type TEXT NOT NULL,           -- 'trade', 'sign', 'waive', 'draft', 'extension'
  title TEXT,                   -- Display title
  description TEXT,             -- Full description
  season TEXT,                  -- e.g., '2023-24'
  source_url TEXT,
  
  -- Lineage tracking
  root_transaction_id UUID REFERENCES transactions(id),  -- Original trade this stems from
  parent_transaction_id UUID REFERENCES transactions(id), -- Immediate parent
  generation INTEGER DEFAULT 0,  -- How many hops from root (0 = root trade)
  
  -- Multi-team trade support
  is_multi_team BOOLEAN DEFAULT false,
  group_id UUID,                -- Links transactions that are part of same deal
  
  -- Metadata
  significance TEXT,            -- 'historic', 'major', 'minor'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_date ON transactions(date DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_root ON transactions(root_transaction_id);
CREATE INDEX idx_transactions_season ON transactions(season);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRANSACTION_TEAMS TABLE
-- Links transactions to teams involved
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE transaction_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id),
  role TEXT NOT NULL,           -- 'sender', 'receiver', 'facilitator'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transaction_teams_tx ON transaction_teams(transaction_id);
CREATE INDEX idx_transaction_teams_team ON transaction_teams(team_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRANSACTION_ASSETS TABLE
-- The actual assets (players, picks, cash) exchanged in transactions
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE transaction_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  
  -- Asset type and details
  asset_type TEXT NOT NULL,     -- 'player', 'pick', 'swap', 'cash', 'exception'
  
  -- For players
  player_id UUID REFERENCES players(id),
  player_name TEXT,             -- Denormalized for easy display
  
  -- For draft picks
  pick_year INTEGER,
  pick_round INTEGER,
  original_team_id TEXT REFERENCES teams(id),  -- Team whose pick it originally was
  protections JSONB,            -- Complex protection conditions
  
  -- For pick swaps
  swap_year INTEGER,
  swap_teams TEXT[],            -- Array of team IDs involved in swap
  
  -- Direction
  from_team_id TEXT REFERENCES teams(id),
  to_team_id TEXT REFERENCES teams(id),
  
  -- What the pick became (filled in later)
  became_player_id UUID REFERENCES players(id),
  became_player_name TEXT,
  
  -- Tracking
  status TEXT,                  -- 'conveyed', 'pending', 'protected', 'exercised'
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transaction_assets_tx ON transaction_assets(transaction_id);
CREATE INDEX idx_transaction_assets_player ON transaction_assets(player_id);
CREATE INDEX idx_transaction_assets_type ON transaction_assets(asset_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEAM_SEASONS TABLE
-- Team performance by season (for trade outcome analysis)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE team_seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id TEXT NOT NULL REFERENCES teams(id),
  season TEXT NOT NULL,         -- e.g., '2023-24'
  wins INTEGER,
  losses INTEGER,
  playoff_result TEXT,          -- 'R1', 'R2', 'CF', 'Finals', 'Champion', NULL
  championship BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(team_id, season)
);

CREATE INDEX idx_team_seasons_team ON team_seasons(team_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLAYER_ACCOLADES TABLE
-- Player achievements (All-Star, MVP, etc.)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE player_accolades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  accolade TEXT NOT NULL,       -- 'MVP', 'All-Star', 'Champion', etc.
  season TEXT,                  -- When earned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_player_accolades_player ON player_accolades(player_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Allow public read access (data is public NBA info)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_accolades ENABLE ROW LEVEL SECURITY;

-- Public read access policies
CREATE POLICY "Allow public read access" ON teams FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON transaction_teams FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON transaction_assets FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON team_seasons FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON player_accolades FOR SELECT USING (true);

-- Service role can do everything (for scraper)
CREATE POLICY "Service role full access" ON teams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON players FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON transaction_teams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON transaction_assets FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON team_seasons FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON player_accolades FOR ALL USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA - All 30 NBA Teams
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO teams (id, name, city, color, secondary_color, conference, division) VALUES
  ('ATL', 'Atlanta Hawks', 'Atlanta', '#E03A3E', '#C1D32F', 'East', 'Southeast'),
  ('BOS', 'Boston Celtics', 'Boston', '#007A33', '#BA9653', 'East', 'Atlantic'),
  ('BKN', 'Brooklyn Nets', 'Brooklyn', '#000000', '#FFFFFF', 'East', 'Atlantic'),
  ('CHA', 'Charlotte Hornets', 'Charlotte', '#1D1160', '#00788C', 'East', 'Southeast'),
  ('CHI', 'Chicago Bulls', 'Chicago', '#CE1141', '#000000', 'East', 'Central'),
  ('CLE', 'Cleveland Cavaliers', 'Cleveland', '#860038', '#FDBB30', 'East', 'Central'),
  ('DAL', 'Dallas Mavericks', 'Dallas', '#00538C', '#002B5E', 'West', 'Southwest'),
  ('DEN', 'Denver Nuggets', 'Denver', '#0E2240', '#FEC524', 'West', 'Northwest'),
  ('DET', 'Detroit Pistons', 'Detroit', '#C8102E', '#1D42BA', 'East', 'Central'),
  ('GSW', 'Golden State Warriors', 'San Francisco', '#1D428A', '#FFC72C', 'West', 'Pacific'),
  ('HOU', 'Houston Rockets', 'Houston', '#CE1141', '#000000', 'West', 'Southwest'),
  ('IND', 'Indiana Pacers', 'Indianapolis', '#002D62', '#FDBB30', 'East', 'Central'),
  ('LAC', 'LA Clippers', 'Los Angeles', '#C8102E', '#1D428A', 'West', 'Pacific'),
  ('LAL', 'Los Angeles Lakers', 'Los Angeles', '#552583', '#FDB927', 'West', 'Pacific'),
  ('MEM', 'Memphis Grizzlies', 'Memphis', '#5D76A9', '#12173F', 'West', 'Southwest'),
  ('MIA', 'Miami Heat', 'Miami', '#98002E', '#F9A01B', 'East', 'Southeast'),
  ('MIL', 'Milwaukee Bucks', 'Milwaukee', '#00471B', '#EEE1C6', 'East', 'Central'),
  ('MIN', 'Minnesota Timberwolves', 'Minneapolis', '#0C2340', '#236192', 'West', 'Northwest'),
  ('NOP', 'New Orleans Pelicans', 'New Orleans', '#0C2340', '#C8102E', 'West', 'Southwest'),
  ('NYK', 'New York Knicks', 'New York', '#006BB6', '#F58426', 'East', 'Atlantic'),
  ('OKC', 'Oklahoma City Thunder', 'Oklahoma City', '#007AC1', '#EF3B24', 'West', 'Northwest'),
  ('ORL', 'Orlando Magic', 'Orlando', '#0077C0', '#C4CED4', 'East', 'Southeast'),
  ('PHI', 'Philadelphia 76ers', 'Philadelphia', '#006BB6', '#ED174C', 'East', 'Atlantic'),
  ('PHX', 'Phoenix Suns', 'Phoenix', '#1D1160', '#E56020', 'West', 'Pacific'),
  ('POR', 'Portland Trail Blazers', 'Portland', '#E03A3E', '#000000', 'West', 'Northwest'),
  ('SAC', 'Sacramento Kings', 'Sacramento', '#5A2D81', '#63727A', 'West', 'Pacific'),
  ('SAS', 'San Antonio Spurs', 'San Antonio', '#C4CED4', '#000000', 'West', 'Southwest'),
  ('TOR', 'Toronto Raptors', 'Toronto', '#CE1141', '#000000', 'East', 'Atlantic'),
  ('UTA', 'Utah Jazz', 'Salt Lake City', '#002B5C', '#00471B', 'West', 'Northwest'),
  ('WAS', 'Washington Wizards', 'Washington', '#002B5C', '#E31837', 'East', 'Southeast')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS FOR EASY QUERYING
-- ═══════════════════════════════════════════════════════════════════════════════

-- View: Trade details with all assets
CREATE OR REPLACE VIEW trade_details AS
SELECT 
  t.id,
  t.date,
  t.title,
  t.description,
  t.significance,
  t.root_transaction_id,
  t.generation,
  ARRAY_AGG(DISTINCT tt.team_id) AS teams,
  JSONB_AGG(
    DISTINCT jsonb_build_object(
      'type', ta.asset_type,
      'player_name', ta.player_name,
      'to_team', ta.to_team_id,
      'from_team', ta.from_team_id,
      'pick_year', ta.pick_year,
      'pick_round', ta.pick_round,
      'became', ta.became_player_name,
      'status', ta.status
    )
  ) FILTER (WHERE ta.id IS NOT NULL) AS assets
FROM transactions t
LEFT JOIN transaction_teams tt ON t.id = tt.transaction_id
LEFT JOIN transaction_assets ta ON t.id = ta.transaction_id
WHERE t.type = 'trade'
GROUP BY t.id;

-- View: Trade lineage (downstream effects of a trade)
CREATE OR REPLACE VIEW trade_lineage AS
SELECT 
  root.id AS root_trade_id,
  root.title AS root_trade_title,
  root.date AS root_trade_date,
  child.id AS downstream_id,
  child.title AS downstream_title,
  child.date AS downstream_date,
  child.type AS downstream_type,
  child.generation
FROM transactions root
JOIN transactions child ON child.root_transaction_id = root.id
WHERE root.root_transaction_id IS NULL
ORDER BY root.date DESC, child.generation, child.date;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Your database is ready.
-- ═══════════════════════════════════════════════════════════════════════════════
