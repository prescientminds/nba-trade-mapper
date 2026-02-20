-- Fix: Recreate trade_lineage view without SECURITY DEFINER
-- The view was created with SECURITY DEFINER in production, which bypasses RLS.
-- Since all RLS policies on transactions use USING (true) for public reads,
-- removing SECURITY DEFINER has no functional impact.

DROP VIEW IF EXISTS public.trade_lineage CASCADE;

CREATE VIEW public.trade_lineage AS
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

-- Restore public read access (matches RLS posture of underlying tables)
GRANT SELECT ON public.trade_lineage TO anon, authenticated;
