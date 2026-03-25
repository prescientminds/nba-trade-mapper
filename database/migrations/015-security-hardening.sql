-- Migration 015: Security hardening (APPLIED 2026-03-24)
-- Fixes 4 Supabase Security Advisor errors + tightens shared_graphs write access.
-- Note: RLS policies already existed on playoff_game_logs and trade_chain_scores
-- from prior partial setup — only ENABLE ROW LEVEL SECURITY was missing.

-- ══════════════════════════════════════════════════
-- 1. Enable RLS on unprotected tables
-- ══════════════════════════════════════════════════

ALTER TABLE public.playoff_game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_chain_scores ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════
-- 2. Fix SECURITY DEFINER views
-- ══════════════════════════════════════════════════

ALTER VIEW public.trade_lineage SET (security_invoker = true);
ALTER VIEW public.trade_details SET (security_invoker = true);

-- ══════════════════════════════════════════════════
-- 3. Lock down shared_graphs UPDATE policy
--    Old policy allowed overwriting any field on any row.
--    New: view count incremented only via RPC function.
-- ══════════════════════════════════════════════════

DROP POLICY IF EXISTS "Allow view count update" ON shared_graphs;

-- ══════════════════════════════════════════════════
-- 4. Atomic view count increment (replaces client-side read-then-write)
-- ══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_view_count(share_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE shared_graphs
  SET view_count = view_count + 1
  WHERE id = share_id;
$$;

GRANT EXECUTE ON FUNCTION increment_view_count(TEXT) TO anon, authenticated;
