-- Cleanup for the reverted Gallery AI Search integration.
-- Run this in the Supabase SQL Editor only if add-gallery-ai-search.sql was
-- already applied to the database.

BEGIN;

-- Stop product writes from trying to maintain the private AI search index.
DROP TRIGGER IF EXISTS products_sync_search_index ON public.products;

-- Remove AI-search RPCs and trigger helper.
DROP FUNCTION IF EXISTS public.sync_product_search_index();
DROP FUNCTION IF EXISTS public.claim_gallery_search_index(INTEGER);
DROP FUNCTION IF EXISTS public.search_gallery_products(
  TEXT,
  extensions.vector,
  TEXT,
  UUID,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT,
  BOOLEAN,
  UUID[],
  TEXT,
  INTEGER,
  INTEGER
);

-- Remove AI-search-only data stores.
DROP TABLE IF EXISTS public.gallery_search_events;
DROP TABLE IF EXISTS public.gallery_search_cache;
DROP TABLE IF EXISTS public.product_search_index;

-- Intentionally keep the vector and pgcrypto extensions. They are shared
-- database capabilities and may be useful outside the reverted feature.

COMMIT;
