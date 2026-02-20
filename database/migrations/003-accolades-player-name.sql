-- Add player_name to accolades so we can import without player UUIDs
ALTER TABLE player_accolades ADD COLUMN IF NOT EXISTS player_name TEXT;
ALTER TABLE player_accolades ALTER COLUMN player_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_player_accolades_name ON player_accolades(player_name);
