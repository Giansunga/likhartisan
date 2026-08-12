-- Run after add-gallery-ai-search.sql against a disposable/local Supabase DB.
-- Every write is rolled back.
BEGIN;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_search_index'::regclass) THEN
    RAISE EXCEPTION 'product_search_index RLS must be enabled';
  END IF;
  IF has_table_privilege('anon', 'public.product_search_index', 'SELECT')
    OR has_table_privilege('authenticated', 'public.product_search_index', 'SELECT') THEN
    RAISE EXCEPTION 'search index must not be readable by public roles';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.search_gallery_products(text,extensions.vector,text,uuid,numeric,numeric,text,text,boolean,uuid[],text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'hybrid search RPC must be service-role-only';
  END IF;
END;
$$;

INSERT INTO public.shops (id, name, email)
VALUES ('10000000-0000-4000-8000-000000000001', 'Codex Fixture Shop', 'gallery-search-fixture@example.test');

INSERT INTO public.products (
  id, name, description, category, price, stock, image, materials, technique, shop_id, shop_name, status, views
) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Codex Exact Vase', 'A codexfixture decorative vessel', 'Vases', 2500, 4, '', 'Terracotta', 'Wheel-thrown', '10000000-0000-4000-8000-000000000001', 'Codex Fixture Shop', 'active', 20),
  ('20000000-0000-4000-8000-000000000002', 'Decorative Vessel', 'A codex exact vase made as a codexfixture', 'Vases', 1500, 3, '', 'Terracotta', 'Hand-built', '10000000-0000-4000-8000-000000000001', 'Codex Fixture Shop', 'active', 5),
  ('20000000-0000-4000-8000-000000000003', 'Archived Codex Vase', 'codexfixture', 'Vases', 500, 2, '', 'Terracotta', 'Wheel-thrown', '10000000-0000-4000-8000-000000000001', 'Codex Fixture Shop', 'archived', 999);

INSERT INTO public.product_variations (product_id, name, price, stock)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Small', 1800, 2),
  ('20000000-0000-4000-8000-000000000001', 'Large', 3200, 2);

INSERT INTO public.product_reviews (product_id, user_name, rating, body)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Fixture One', 5, 'Excellent'),
  ('20000000-0000-4000-8000-000000000001', 'Fixture Two', 3, 'Good');

INSERT INTO public.products (id, name, description, category, price, stock, materials, technique, shop_id, shop_name, status)
SELECT
  ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::UUID,
  'CodexPaging Planter ' || series,
  'codexpaging fixture',
  'Planters',
  1000 + series,
  1,
  'Stoneware',
  'Hand-built',
  '10000000-0000-4000-8000-000000000001',
  'Codex Fixture Shop',
  'active'
FROM generate_series(1, 25) AS series;

DO $$
DECLARE
  index_row public.product_search_index%ROWTYPE;
  exact_result RECORD;
  page_result RECORD;
  favorite_count INTEGER;
BEGIN
  SELECT * INTO index_row
  FROM public.product_search_index
  WHERE product_id = '20000000-0000-4000-8000-000000000001';
  IF index_row.embedding_status <> 'pending' OR index_row.content_hash IS NULL THEN
    RAISE EXCEPTION 'product trigger did not queue the search index row';
  END IF;

  SELECT * INTO exact_result
  FROM public.search_gallery_products(
    'Codex Exact Vase', NULL::extensions.vector(384), 'Vases', NULL,
    NULL, 2000, 'Terracotta', 'Wheel-thrown', FALSE, ARRAY[]::UUID[], 'relevance', 1, 24
  )
  LIMIT 1;
  IF exact_result.id <> '20000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'exact product-name match was not ranked first';
  END IF;
  IF exact_result.effective_price <> 1800 OR exact_result.rating_count <> 2 OR exact_result.rating_avg <> 4 THEN
    RAISE EXCEPTION 'variation price or review aggregates are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_gallery_products(
      'codexfixture', NULL::extensions.vector(384), NULL, NULL,
      NULL, NULL, NULL, NULL, FALSE, ARRAY[]::UUID[], 'relevance', 1, 24
    )
    WHERE status <> 'active' OR id = '20000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'inactive product escaped retrieval';
  END IF;

  SELECT count(*) INTO favorite_count
  FROM public.search_gallery_products(
    'codexfixture', NULL::extensions.vector(384), NULL, NULL,
    NULL, NULL, NULL, NULL, TRUE,
    ARRAY['20000000-0000-4000-8000-000000000002']::UUID[], 'relevance', 1, 24
  );
  IF favorite_count <> 1 THEN
    RAISE EXCEPTION 'favorites restriction failed';
  END IF;

  SELECT * INTO page_result
  FROM public.search_gallery_products(
    'codexpaging', NULL::extensions.vector(384), 'Planters', NULL,
    NULL, NULL, 'Stoneware', 'Hand-built', FALSE, ARRAY[]::UUID[], 'name-asc', 2, 24
  )
  LIMIT 1;
  IF page_result.total_count <> 25 THEN
    RAISE EXCEPTION 'pagination total is incorrect';
  END IF;
END;
$$;

ROLLBACK;
