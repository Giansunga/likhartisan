-- Search and gallery-click signals used for account-level recommendations.
-- Safe to run more than once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_product_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('search', 'product_click')),
  query_text TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_product_signals_payload_check CHECK (
    (
      event_type = 'search'
      AND query_text IS NOT NULL
      AND char_length(query_text) BETWEEN 2 AND 100
    )
    OR
    (
      event_type = 'product_click'
      AND product_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_product_signals_user_created
  ON public.user_product_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_product_signals_product
  ON public.user_product_signals (product_id)
  WHERE product_id IS NOT NULL;

ALTER TABLE public.user_product_signals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_product_signals FROM anon;
REVOKE ALL ON TABLE public.user_product_signals FROM authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_product_signals TO authenticated;

DROP POLICY IF EXISTS "signals_select_own" ON public.user_product_signals;
DROP POLICY IF EXISTS "signals_insert_own" ON public.user_product_signals;
DROP POLICY IF EXISTS "signals_delete_own" ON public.user_product_signals;

CREATE POLICY "signals_select_own"
  ON public.user_product_signals
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "signals_insert_own"
  ON public.user_product_signals
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "signals_delete_own"
  ON public.user_product_signals
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
