-- Add game margin column to playoff_game_logs
-- Margin = team_score - opponent_score (positive = win, negative = loss)
-- Used to filter out blowouts when surfacing peak playoff performances

ALTER TABLE playoff_game_logs ADD COLUMN IF NOT EXISTS game_margin INTEGER;
