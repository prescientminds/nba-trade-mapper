-- Salary data infrastructure: enhance player_contracts + add salary_cap_history
--
-- player_contracts already exists (migration 002) with:
--   id, player_name, team_id, season, salary, contract_type, created_at
--   UNIQUE(player_name, team_id, season)
--
-- This migration adds richer contract fields and a salary cap history table.

-- ── Enhance player_contracts ─────────────────────────────────────────

ALTER TABLE player_contracts
  ADD COLUMN IF NOT EXISTS cap_hit INTEGER,         -- Actual cap charge (may differ from salary)
  ADD COLUMN IF NOT EXISTS guaranteed INTEGER,      -- Guaranteed money for this season
  ADD COLUMN IF NOT EXISTS signed_using TEXT,        -- Exception used: 'bird', 'early_bird', 'non_bird', 'mle', 'taxpayer_mle', 'bae', 'room', 'min', 'first_round', 'sign_and_trade'
  ADD COLUMN IF NOT EXISTS contract_years INTEGER,  -- Total years on deal
  ADD COLUMN IF NOT EXISTS total_value INTEGER,     -- Full contract value across all years
  ADD COLUMN IF NOT EXISTS league TEXT DEFAULT 'NBA'; -- NBA or WNBA

-- Index for trade analysis queries (find salaries at time of trade)
CREATE INDEX IF NOT EXISTS idx_player_contracts_season ON player_contracts(season);
CREATE INDEX IF NOT EXISTS idx_player_contracts_team_season ON player_contracts(team_id, season);

-- ── Salary cap history table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salary_cap_history (
  season TEXT PRIMARY KEY,                -- e.g., '2023-24'
  salary_cap INTEGER NOT NULL,            -- Salary cap in dollars
  luxury_tax INTEGER,                     -- Luxury tax threshold
  first_apron INTEGER,                    -- First apron (2023 CBA+)
  second_apron INTEGER,                   -- Second apron (2023 CBA+)
  mle INTEGER,                            -- Non-taxpayer mid-level exception
  taxpayer_mle INTEGER,                   -- Taxpayer mid-level exception
  bae INTEGER,                            -- Bi-annual exception
  minimum_salary INTEGER,                 -- Rookie minimum salary
  league TEXT DEFAULT 'NBA',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE salary_cap_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON salary_cap_history FOR SELECT USING (true);
CREATE POLICY "Service role full access" ON salary_cap_history FOR ALL USING (auth.role() = 'service_role');
