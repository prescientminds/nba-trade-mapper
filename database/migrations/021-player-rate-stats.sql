-- Migration 021: Rate stats on player_seasons
-- Adds BPM/OBPM/DBPM, TS%, USG%, WS/48, OWS, DWS, MP, age, position.
-- All nullable, non-destructive. Back-filled by scripts/import-player-stats.ts from Kaggle Advanced.csv.
--
-- Why: WS remains the verdict currency (CATV). BPM + rate stats power
-- the Trade Machine comparables matcher, young-player cohort curves (age ≤ 23),
-- and future short-window analysis once regular-season game logs land.
--
-- Stint granularity: Advanced.csv rows are keyed (player, season, team) with TOT
-- rows skipped by the importer, so mid-season traded players get pre/post-trade
-- BPM splits for free from 1974-present.

ALTER TABLE player_seasons
  ADD COLUMN IF NOT EXISTS bpm         DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS obpm        DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS dbpm        DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS ts_percent  DECIMAL(5, 3),
  ADD COLUMN IF NOT EXISTS usg_percent DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS ws_48       DECIMAL(5, 3),
  ADD COLUMN IF NOT EXISTS ows         DECIMAL(5, 1),
  ADD COLUMN IF NOT EXISTS dws         DECIMAL(5, 1),
  ADD COLUMN IF NOT EXISTS mp          INTEGER,
  ADD COLUMN IF NOT EXISTS age         INTEGER,
  ADD COLUMN IF NOT EXISTS position    TEXT;

COMMENT ON COLUMN player_seasons.bpm         IS 'Box Plus/Minus — points above league average per 100 possessions. From Kaggle Advanced.csv.';
COMMENT ON COLUMN player_seasons.obpm        IS 'Offensive BPM.';
COMMENT ON COLUMN player_seasons.dbpm        IS 'Defensive BPM.';
COMMENT ON COLUMN player_seasons.ts_percent  IS 'True Shooting % — unified 2P/3P/FT efficiency.';
COMMENT ON COLUMN player_seasons.usg_percent IS 'Usage % — share of team plays ending with this player.';
COMMENT ON COLUMN player_seasons.ws_48       IS 'Win Shares per 48 minutes — rate form of WS.';
COMMENT ON COLUMN player_seasons.mp          IS 'Total minutes played that stint.';
