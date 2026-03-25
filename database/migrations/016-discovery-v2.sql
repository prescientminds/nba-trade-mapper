-- Migration 016: New Discovery categories (Inflection Trades, Dynasty Ingredients, Verdict Flips)
-- Replaces League Impact. Run via Supabase SQL Editor.

-- ── Inflection Trades: team trajectory before/after ──
-- inflection_teams: { "LAL": { before: 42.3, after: 55.7, delta: +13.4 }, ... }
-- inflection_swing: max divergence between any two teams' deltas

ALTER TABLE trade_scores
  ADD COLUMN IF NOT EXISTS inflection_swing DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS inflection_teams JSONB;

CREATE INDEX IF NOT EXISTS trade_scores_inflection_idx
  ON trade_scores (inflection_swing DESC NULLS LAST);

-- ── Verdict Flips: trade winner at 1yr, 3yr, 5yr ──
-- verdict_flipped: true when winner_1yr != winner_5yr (and both non-null)

ALTER TABLE trade_scores
  ADD COLUMN IF NOT EXISTS winner_1yr TEXT,
  ADD COLUMN IF NOT EXISTS winner_3yr TEXT,
  ADD COLUMN IF NOT EXISTS winner_5yr TEXT,
  ADD COLUMN IF NOT EXISTS verdict_flipped BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS trade_scores_verdict_flip_idx
  ON trade_scores (verdict_flipped) WHERE verdict_flipped = true;

-- ── Dynasty Ingredients: how championship rosters were assembled ──
-- roster: [ { name, playoff_ws, acquisition: "trade"|"draft"|"fa", trade_id?, trade_season? } ]

CREATE TABLE IF NOT EXISTS championship_ingredients (
  team_id       TEXT NOT NULL,
  season        TEXT NOT NULL,
  league        TEXT NOT NULL DEFAULT 'NBA',
  roster        JSONB NOT NULL DEFAULT '[]',
  trade_pct     DECIMAL(5, 2),
  draft_pct     DECIMAL(5, 2),
  fa_pct        DECIMAL(5, 2),
  top_trade_id  TEXT,
  top_trade_pws DECIMAL(6, 2),
  PRIMARY KEY (team_id, season)
);

ALTER TABLE championship_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON championship_ingredients FOR SELECT USING (true);
CREATE POLICY "Service role full" ON championship_ingredients FOR ALL USING (auth.role() = 'service_role');
