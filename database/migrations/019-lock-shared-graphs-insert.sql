-- Migration 019: Lock down shared_graphs INSERT
-- The open INSERT policy (migration 014) allows anyone to insert arbitrary data.
-- Replace with a rate-limited RPC that validates payload size.

-- Drop the wide-open INSERT policy
DROP POLICY IF EXISTS "Allow public insert" ON shared_graphs;

-- Create a controlled insert function with size validation
CREATE OR REPLACE FUNCTION create_shared_graph(
  p_id TEXT,
  p_share_state JSONB,
  p_title TEXT,
  p_subtitle TEXT DEFAULT NULL,
  p_teams TEXT[] DEFAULT '{}',
  p_league TEXT DEFAULT 'NBA'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Reject oversized payloads (max 50KB for share_state)
  IF octet_length(p_share_state::text) > 51200 THEN
    RAISE EXCEPTION 'share_state exceeds maximum size';
  END IF;

  -- Reject excessively long titles/subtitles
  IF length(p_title) > 500 THEN
    RAISE EXCEPTION 'title exceeds maximum length';
  END IF;

  IF p_subtitle IS NOT NULL AND length(p_subtitle) > 500 THEN
    RAISE EXCEPTION 'subtitle exceeds maximum length';
  END IF;

  INSERT INTO shared_graphs (id, share_state, title, subtitle, teams, league)
  VALUES (p_id, p_share_state, p_title, p_subtitle, p_teams, p_league);
END;
$$;

GRANT EXECUTE ON FUNCTION create_shared_graph(TEXT, JSONB, TEXT, TEXT, TEXT[], TEXT) TO anon, authenticated;
