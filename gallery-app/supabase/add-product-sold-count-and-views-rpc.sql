-- Safe, server-side aggregations for the product detail page.
-- Both are callable from the frontend (anon/authenticated) and bypass row-level
-- security via SECURITY DEFINER so they only ever return an aggregate count
-- (never individual order rows).

-- Count total units sold for a product across completed/paid orders.
CREATE OR REPLACE FUNCTION public.get_product_sold_count(p_product_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
BEGIN
  SELECT COALESCE(SUM((item->>'qty')::integer), 0)
    INTO v_total
    FROM orders, jsonb_array_elements(items) AS item
   WHERE status IN ('paid', 'completed')
     AND item->>'product_id' = p_product_id::text;

  RETURN v_total;
END;
$$;

-- Atomically increment a product's view count (avoids read-modify-write races).
CREATE OR REPLACE FUNCTION public.increment_views(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
     SET views = COALESCE(views, 0) + 1
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_sold_count(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_views(uuid) TO anon, authenticated;
