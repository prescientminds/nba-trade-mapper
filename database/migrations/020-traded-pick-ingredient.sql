-- Migration 020: Add `traded_pick_pct` category to championship_ingredients.
--
-- Previously: trade / draft / fa. Now: trade / draft / traded_pick / fa.
-- `traded_pick` = a player this team drafted using a pick acquired via trade.
-- A team adept at trading for picks and getting value is a distinct signal
-- from one that trades directly for established players.

ALTER TABLE championship_ingredients
  ADD COLUMN IF NOT EXISTS traded_pick_pct DECIMAL(5, 2);
