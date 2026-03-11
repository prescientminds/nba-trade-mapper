-- Migration 014: Shared graph links
-- Stores minimal graph state for shareable permalinks.
-- The share_state JSONB contains the action replay recipe (seed + expansions),
-- not the full node/edge state.

CREATE TABLE IF NOT EXISTS shared_graphs (
  id          TEXT PRIMARY KEY,              -- nanoid, 8 chars
  share_state JSONB NOT NULL,               -- { seed, league, expansions }
  title       TEXT NOT NULL,                 -- denormalized for OG image
  subtitle    TEXT,                          -- team flow or player journey summary
  teams       TEXT[] NOT NULL DEFAULT '{}',  -- team IDs for color rendering in OG
  league      TEXT NOT NULL DEFAULT 'NBA',
  created_at  TIMESTAMPTZ DEFAULT now(),
  view_count  INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS shared_graphs_created_idx ON shared_graphs (created_at DESC);

ALTER TABLE shared_graphs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON shared_graphs FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON shared_graphs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow view count update" ON shared_graphs FOR UPDATE USING (true) WITH CHECK (true);
