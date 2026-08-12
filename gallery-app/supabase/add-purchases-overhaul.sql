-- My Purchases overhaul: scalable retrieval, authentic history, and returns.
-- Run in the Supabase SQL editor before deploying the matching API/frontend.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.buyer_order_status(
  p_status TEXT,
  p_payment_status TEXT,
  p_delivery_status TEXT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status = 'cancelled' THEN 'cancelled'
    WHEN p_status = 'refunded' OR p_payment_status = 'refunded' THEN 'return-refund'
    WHEN p_status = 'completed' OR p_delivery_status = 'completed' THEN 'completed'
    WHEN p_status = 'pending' OR COALESCE(p_payment_status, 'pending') = 'pending' THEN 'to-pay'
    WHEN p_delivery_status = 'delivered' THEN 'to-receive'
    ELSE 'to-ship'
  END
$$;

CREATE OR REPLACE FUNCTION public.refresh_order_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_items TEXT;
BEGIN
  SELECT COALESCE(string_agg(
    concat_ws(' ', item->>'product_name', item->>'productName', item->>'shop_name', item->>'shopName'),
    ' '
  ), '') INTO v_items
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item;

  NEW.search_text := lower(concat_ws(' ', NEW.id::text, v_items, NEW.tracking_number));
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS orders_refresh_search_text ON public.orders;
CREATE TRIGGER orders_refresh_search_text
BEFORE INSERT OR UPDATE OF items, tracking_number ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.refresh_order_search_text();

UPDATE public.orders SET items = items;

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
  ON public.orders (user_id, status, delivery_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_search_text_trgm
  ON public.orders USING gin (search_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.order_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('damaged', 'defective', 'wrong_item', 'missing_item', 'not_as_described', 'other')),
  requested_resolution TEXT NOT NULL CHECK (requested_resolution IN ('refund', 'replacement')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'refunded', 'closed')),
  resolution_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_return_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.order_return_requests(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL CHECK (item_index >= 0),
  product_id UUID,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (request_id, item_index)
);

CREATE TABLE IF NOT EXISTS public.order_return_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.order_return_requests(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_return_requests ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.order_return_evidence ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_one_active_order
  ON public.order_return_requests(order_id)
  WHERE status IN ('submitted', 'under_review', 'approved', 'refunded');
CREATE INDEX IF NOT EXISTS idx_return_requests_user_created
  ON public.order_return_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_order_status
  ON public.order_return_requests(order_id, status);
CREATE INDEX IF NOT EXISTS idx_return_items_request
  ON public.order_return_items(request_id);
CREATE INDEX IF NOT EXISTS idx_return_evidence_request
  ON public.order_return_evidence(request_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_order_created
  ON public.order_activity_log(order_id, created_at DESC);

ALTER TABLE public.order_return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_return_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view activity logs" ON public.order_activity_log;
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.order_activity_log;
DROP POLICY IF EXISTS "activity_participants_select" ON public.order_activity_log;
CREATE POLICY "activity_participants_select" ON public.order_activity_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND (
      o.user_id = (SELECT auth.uid())
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(o.items) item
        WHERE public.is_shop_owner((item->>'shop_id')::uuid)
      )
    )
  ));

DROP POLICY IF EXISTS "orders_update_buyer_or_shop_or_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_update_shop_or_admin" ON public.orders;
CREATE POLICY "orders_update_shop_or_admin" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) item
      WHERE public.is_shop_owner((item->>'shop_id')::uuid)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) item
      WHERE public.is_shop_owner((item->>'shop_id')::uuid)
    )
  );

DROP POLICY IF EXISTS "return_requests_participants_select" ON public.order_return_requests;
CREATE POLICY "return_requests_participants_select" ON public.order_return_requests
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o, jsonb_array_elements(o.items) item
      WHERE o.id = order_id AND public.is_shop_owner((item->>'shop_id')::uuid)
    )
  );

DROP POLICY IF EXISTS "return_items_participants_select" ON public.order_return_items;
CREATE POLICY "return_items_participants_select" ON public.order_return_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_return_requests r
    WHERE r.id = request_id AND (
      r.user_id = (SELECT auth.uid()) OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.orders o, jsonb_array_elements(o.items) item
        WHERE o.id = r.order_id AND public.is_shop_owner((item->>'shop_id')::uuid)
      )
    )
  ));

DROP POLICY IF EXISTS "return_evidence_participants_select" ON public.order_return_evidence;
CREATE POLICY "return_evidence_participants_select" ON public.order_return_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_return_requests r
    WHERE r.id = request_id AND (
      r.user_id = (SELECT auth.uid()) OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.orders o, jsonb_array_elements(o.items) item
        WHERE o.id = r.order_id AND public.is_shop_owner((item->>'shop_id')::uuid)
      )
    )
  ));

CREATE OR REPLACE FUNCTION public.log_order_activity_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action TEXT;
  v_actor UUID := auth.uid();
  v_role TEXT := CASE
    WHEN auth.uid() IS NULL THEN 'system'
    WHEN public.is_admin() THEN 'admin'
    ELSE 'authenticated'
  END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'order_placed';
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
    AND NEW.delivery_status IS NOT DISTINCT FROM OLD.delivery_status THEN
    RETURN NEW;
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'order_cancelled';
  ELSIF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    v_action := 'payment_' || COALESCE(NEW.payment_status, 'updated');
  ELSE
    v_action := 'delivery_' || COALESCE(NEW.delivery_status, 'updated');
  END IF;

  INSERT INTO public.order_activity_log (
    order_id, previous_status, new_status, previous_payment_status,
    new_payment_status, previous_delivery_status, new_delivery_status,
    action_type, actor_id, actor_role
  ) VALUES (
    NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_status END, NEW.payment_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.delivery_status END, NEW.delivery_status,
    v_action, v_actor, v_role
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS orders_log_activity ON public.orders;
CREATE TRIGGER orders_log_activity
AFTER INSERT OR UPDATE OF status, payment_status, delivery_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_activity_trigger();

REVOKE ALL ON FUNCTION public.log_order_activity_trigger() FROM PUBLIC, anon, authenticated, service_role;

-- Existing admin screens attach actor/reason metadata through this RPC. Reuse the
-- trigger-created transition instead of creating a second, conflicting milestone.
CREATE OR REPLACE FUNCTION public.log_order_change(
  p_order_id UUID, p_previous_status TEXT, p_new_status TEXT,
  p_previous_payment_status TEXT, p_new_payment_status TEXT,
  p_previous_delivery_status TEXT, p_new_delivery_status TEXT,
  p_action_type TEXT, p_actor_id UUID, p_actor_name TEXT,
  p_actor_role TEXT, p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_log_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  SELECT id INTO v_log_id FROM public.order_activity_log
  WHERE order_id = p_order_id
    AND new_status IS NOT DISTINCT FROM p_new_status
    AND new_payment_status IS NOT DISTINCT FROM p_new_payment_status
    AND new_delivery_status IS NOT DISTINCT FROM p_new_delivery_status
    AND created_at >= now() - interval '30 seconds'
  ORDER BY created_at DESC LIMIT 1;
  IF v_log_id IS NOT NULL THEN
    UPDATE public.order_activity_log SET actor_id = p_actor_id, actor_name = p_actor_name,
      actor_role = p_actor_role, reason = p_reason, action_type = p_action_type
    WHERE id = v_log_id;
    RETURN v_log_id;
  END IF;
  INSERT INTO public.order_activity_log(order_id, previous_status, new_status,
    previous_payment_status, new_payment_status, previous_delivery_status,
    new_delivery_status, action_type, actor_id, actor_name, actor_role, reason)
  VALUES (p_order_id, p_previous_status, p_new_status, p_previous_payment_status,
    p_new_payment_status, p_previous_delivery_status, p_new_delivery_status,
    p_action_type, p_actor_id, p_actor_name, p_actor_role, p_reason)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END
$$;
REVOKE ALL ON FUNCTION public.log_order_change(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_order_change(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

INSERT INTO public.order_activity_log (
  order_id, previous_status, new_status, previous_payment_status,
  new_payment_status, previous_delivery_status, new_delivery_status,
  action_type, actor_role, created_at
)
SELECT o.id, NULL, o.status, NULL, o.payment_status, NULL, o.delivery_status,
       'legacy_completion', 'system', now()
FROM public.orders o
WHERE public.buyer_order_status(o.status, o.payment_status, o.delivery_status) = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_activity_log l
    WHERE l.order_id = o.id AND (l.new_status = 'completed' OR l.new_delivery_status = 'completed')
  );

CREATE OR REPLACE FUNCTION public.get_buyer_orders_page(
  p_user_id UUID,
  p_status TEXT DEFAULT 'all',
  p_query TEXT DEFAULT '',
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_sort TEXT DEFAULT 'newest',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 10
) RETURNS JSONB
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT o.*, public.buyer_order_status(o.status, o.payment_status, o.delivery_status) AS buyer_status
    FROM public.orders o
    WHERE o.user_id = p_user_id
      AND (p_date_from IS NULL OR o.created_at >= p_date_from)
      AND (p_date_to IS NULL OR o.created_at < p_date_to)
      AND (trim(p_query) = '' OR o.search_text ILIKE '%' || lower(trim(p_query)) || '%')
  ), filtered AS (
    SELECT * FROM base WHERE p_status = 'all' OR buyer_status = p_status
  ), page_rows AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'oldest' THEN created_at END ASC,
      CASE WHEN p_sort <> 'oldest' THEN created_at END DESC,
      id DESC
    OFFSET (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 50)
    LIMIT LEAST(GREATEST(p_page_size, 1), 50)
  )
  SELECT jsonb_build_object(
    'orders', COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'search_text') FROM page_rows p), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'statusCounts', jsonb_build_object(
      'all', (SELECT count(*) FROM base),
      'to-pay', (SELECT count(*) FROM base WHERE buyer_status = 'to-pay'),
      'to-ship', (SELECT count(*) FROM base WHERE buyer_status = 'to-ship'),
      'to-receive', (SELECT count(*) FROM base WHERE buyer_status = 'to-receive'),
      'completed', (SELECT count(*) FROM base WHERE buyer_status = 'completed'),
      'return-refund', (SELECT count(*) FROM base WHERE buyer_status = 'return-refund'),
      'cancelled', (SELECT count(*) FROM base WHERE buyer_status = 'cancelled')
    )
  )
$$;

REVOKE ALL ON FUNCTION public.get_buyer_orders_page(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_buyer_orders_page(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, INTEGER) TO service_role;
GRANT SELECT ON public.order_return_requests, public.order_return_items, public.order_return_evidence TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.order_return_requests, public.order_return_items, public.order_return_evidence TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_return_items_id_seq TO service_role;
GRANT SELECT ON public.order_activity_log TO authenticated, service_role;
GRANT SELECT ON public.orders TO authenticated, service_role;
GRANT INSERT, UPDATE ON public.orders TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('return-evidence', 'return-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
