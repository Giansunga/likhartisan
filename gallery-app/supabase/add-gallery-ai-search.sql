-- Gallery hybrid search: private product index, query cache, analytics, and RPC.
-- Apply in the Supabase SQL Editor before enabling AI_GALLERY_SEARCH_ENABLED.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Older Supabase projects may already have pgvector installed in public.
-- Normalize its namespace so the qualified vector type/opclass references
-- below work consistently. ALTER EXTENSION preserves extension object OIDs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension extension_record
    JOIN pg_catalog.pg_namespace extension_schema
      ON extension_schema.oid = extension_record.extnamespace
    WHERE extension_record.extname = 'vector'
      AND extension_schema.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.product_search_index (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  materials TEXT NOT NULL DEFAULT '',
  technique TEXT NOT NULL DEFAULT '',
  shop_name TEXT NOT NULL DEFAULT '',
  search_text TEXT GENERATED ALWAYS AS (
    product_name || ' ' || description || ' ' || category || ' ' ||
    materials || ' ' || technique || ' ' || shop_name
  ) STORED,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', product_name), 'A') ||
    setweight(to_tsvector('simple', category), 'A') ||
    setweight(to_tsvector('simple', materials), 'B') ||
    setweight(to_tsvector('simple', technique), 'B') ||
    setweight(to_tsvector('simple', shop_name), 'B') ||
    setweight(to_tsvector('english', description), 'C')
  ) STORED,
  embedding extensions.vector(384),
  content_hash TEXT NOT NULL,
  embedded_hash TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  embedding_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (embedding_attempts >= 0),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedded_at TIMESTAMPTZ
);

-- Keep this migration safe to re-run if an earlier draft created the table.
ALTER TABLE public.product_search_index
  DROP CONSTRAINT IF EXISTS product_search_index_embedding_status_check;
ALTER TABLE public.product_search_index
  ADD CONSTRAINT product_search_index_embedding_status_check
  CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS idx_product_search_fts
  ON public.product_search_index USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_product_search_embedding
  ON public.product_search_index USING HNSW (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_product_search_pending
  ON public.product_search_index (embedding_status, updated_at)
  WHERE embedding_status <> 'ready';

ALTER TABLE public.product_search_index ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_search_index FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_search_index TO service_role;

CREATE OR REPLACE FUNCTION public.sync_product_search_index()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  next_hash TEXT;
BEGIN
  next_hash := encode(
    extensions.digest(
      concat_ws(
        E'\n',
        coalesce(NEW.name, ''),
        coalesce(NEW.description, ''),
        coalesce(NEW.category, ''),
        coalesce(NEW.materials, ''),
        coalesce(NEW.technique, ''),
        coalesce(NEW.shop_name, '')
      ),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO public.product_search_index (
    product_id,
    product_name,
    description,
    category,
    materials,
    technique,
    shop_name,
    content_hash
  ) VALUES (
    NEW.id,
    coalesce(NEW.name, ''),
    coalesce(NEW.description, ''),
    coalesce(NEW.category, ''),
    coalesce(NEW.materials, ''),
    coalesce(NEW.technique, ''),
    coalesce(NEW.shop_name, ''),
    next_hash
  )
  ON CONFLICT (product_id) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    materials = EXCLUDED.materials,
    technique = EXCLUDED.technique,
    shop_name = EXCLUDED.shop_name,
    content_hash = EXCLUDED.content_hash,
    embedding = CASE
      WHEN public.product_search_index.content_hash = EXCLUDED.content_hash
        THEN public.product_search_index.embedding
      ELSE NULL
    END,
    embedded_hash = CASE
      WHEN public.product_search_index.content_hash = EXCLUDED.content_hash
        THEN public.product_search_index.embedded_hash
      ELSE NULL
    END,
    embedding_status = CASE
      WHEN public.product_search_index.content_hash = EXCLUDED.content_hash
        THEN public.product_search_index.embedding_status
      ELSE 'pending'
    END,
    embedding_attempts = CASE
      WHEN public.product_search_index.content_hash = EXCLUDED.content_hash
        THEN public.product_search_index.embedding_attempts
      ELSE 0
    END,
    last_error = CASE
      WHEN public.product_search_index.content_hash = EXCLUDED.content_hash
        THEN public.product_search_index.last_error
      ELSE NULL
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_search_index ON public.products;
CREATE TRIGGER products_sync_search_index
AFTER INSERT OR UPDATE OF name, description, category, materials, technique, shop_name
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_search_index();

-- Backfill all existing products. The Edge Function processes these pending rows.
INSERT INTO public.product_search_index (
  product_id,
  product_name,
  description,
  category,
  materials,
  technique,
  shop_name,
  content_hash
)
SELECT
  p.id,
  coalesce(p.name, ''),
  coalesce(p.description, ''),
  coalesce(p.category, ''),
  coalesce(p.materials, ''),
  coalesce(p.technique, ''),
  coalesce(p.shop_name, ''),
  encode(
    extensions.digest(
      concat_ws(
        E'\n',
        coalesce(p.name, ''),
        coalesce(p.description, ''),
        coalesce(p.category, ''),
        coalesce(p.materials, ''),
        coalesce(p.technique, ''),
        coalesce(p.shop_name, '')
      ),
      'sha256'
    ),
    'hex'
  )
FROM public.products p
ON CONFLICT (product_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gallery_search_cache (
  cache_key TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  semantic_query TEXT NOT NULL,
  taxonomy_hash TEXT NOT NULL,
  parser_model TEXT NOT NULL,
  search_plan JSONB NOT NULL,
  embedding extensions.vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_gallery_search_cache_expiry
  ON public.gallery_search_cache (expires_at);

ALTER TABLE public.gallery_search_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gallery_search_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gallery_search_cache TO service_role;

CREATE TABLE IF NOT EXISTS public.gallery_search_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('search', 'filter_change', 'sort', 'page', 'click')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query_text TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_count INTEGER CHECK (result_count IS NULL OR result_count >= 0),
  retrieval_mode TEXT CHECK (retrieval_mode IS NULL OR retrieval_mode IN ('hybrid', 'keyword_fallback')),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_search_events_search
  ON public.gallery_search_events (search_id, created_at);

CREATE INDEX IF NOT EXISTS idx_gallery_search_events_user
  ON public.gallery_search_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_search_events_product
  ON public.gallery_search_events (product_id)
  WHERE product_id IS NOT NULL;

ALTER TABLE public.gallery_search_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gallery_search_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gallery_search_events TO service_role;

-- Atomically claim work so overlapping cron invocations never spend quota on
-- the same product. Processing rows become eligible again after ten minutes.
CREATE OR REPLACE FUNCTION public.claim_gallery_search_index(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  product_id UUID,
  search_text TEXT,
  content_hash TEXT,
  embedding_attempts SMALLINT
)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.product_search_index AS target
  SET
    embedding_status = 'processing',
    embedding_attempts = target.embedding_attempts + 1,
    updated_at = NOW()
  FROM (
    SELECT candidate.product_id
    FROM public.product_search_index AS candidate
    WHERE candidate.embedding_attempts < 5
      AND (
        candidate.embedding_status IN ('pending', 'failed')
        OR (
          candidate.embedding_status = 'processing'
          AND candidate.updated_at < NOW() - INTERVAL '10 minutes'
        )
      )
    ORDER BY candidate.updated_at ASC
    LIMIT least(greatest(coalesce(p_limit, 10), 1), 20)
    FOR UPDATE SKIP LOCKED
  ) AS claimed
  WHERE target.product_id = claimed.product_id
  RETURNING target.product_id, target.search_text, target.content_hash, target.embedding_attempts;
$$;

REVOKE ALL ON FUNCTION public.claim_gallery_search_index(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gallery_search_index(INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.search_gallery_products(
  p_query_text TEXT,
  p_query_embedding extensions.vector(384),
  p_category TEXT,
  p_shop_id UUID,
  p_min_price NUMERIC,
  p_max_price NUMERIC,
  p_material TEXT,
  p_technique TEXT,
  p_favorites_only BOOLEAN,
  p_favorite_ids UUID[],
  p_sort TEXT,
  p_page INTEGER,
  p_page_size INTEGER
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  price NUMERIC,
  stock INTEGER,
  image TEXT,
  model3d TEXT,
  materials TEXT,
  dimensions TEXT,
  height TEXT,
  opening_diameter TEXT,
  technique TEXT,
  shop_id UUID,
  shop_name TEXT,
  status TEXT,
  views INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  effective_price NUMERIC,
  rating_avg NUMERIC,
  rating_count BIGINT,
  relevance DOUBLE PRECISION,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH variation_prices AS (
    SELECT
      variation.product_id,
      min(variation.price) FILTER (WHERE variation.price > 0) AS minimum_price
    FROM public.product_variations AS variation
    GROUP BY variation.product_id
  ),
  review_totals AS (
    SELECT
      review.product_id,
      avg(review.rating)::NUMERIC AS rating_avg,
      count(*)::BIGINT AS rating_count
    FROM public.product_reviews AS review
    GROUP BY review.product_id
  ),
  product_data AS (
    SELECT
      p.id,
      p.name,
      p.description,
      p.category,
      p.price,
      p.stock,
      p.image,
      p.model3d,
      p.materials,
      p.dimensions,
      p.height,
      p.opening_diameter,
      p.technique,
      p.shop_id,
      p.shop_name,
      p.status,
      p.views,
      p.created_at,
      p.updated_at,
      coalesce(v.minimum_price, p.price) AS effective_price,
      coalesce(r.rating_avg, 0)::NUMERIC AS rating_avg,
      coalesce(r.rating_count, 0)::BIGINT AS rating_count,
      i.search_vector,
      i.embedding
    FROM public.products p
    JOIN public.product_search_index i ON i.product_id = p.id
    LEFT JOIN variation_prices v ON v.product_id = p.id
    LEFT JOIN review_totals r ON r.product_id = p.id
    WHERE p.status = 'active'
      AND (p_category IS NULL OR lower(p.category) = lower(p_category))
      AND (p_shop_id IS NULL OR p.shop_id = p_shop_id)
      AND (p_material IS NULL OR lower(p.materials) LIKE '%' || lower(p_material) || '%')
      AND (p_technique IS NULL OR lower(p.technique) LIKE '%' || lower(p_technique) || '%')
      AND (
        NOT p_favorites_only
        OR p.id = ANY(coalesce(p_favorite_ids, ARRAY[]::UUID[]))
      )
      AND (p_min_price IS NULL OR coalesce(v.minimum_price, p.price) >= p_min_price)
      AND (p_max_price IS NULL OR coalesce(v.minimum_price, p.price) <= p_max_price)
  ),
  keyword AS (
    SELECT
      d.id,
      row_number() OVER (
        ORDER BY
          (
            ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', p_query_text))
            + CASE WHEN lower(d.name) = lower(p_query_text) THEN 2.0 ELSE 0.0 END
            + CASE WHEN lower(d.name) LIKE lower(p_query_text) || '%' THEN 0.5 ELSE 0.0 END
          ) DESC,
          d.id
      ) AS rank_ix
    FROM product_data d
    WHERE d.search_vector @@ websearch_to_tsquery('simple', p_query_text)
    ORDER BY rank_ix
    LIMIT 200
  ),
  semantic AS (
    SELECT
      d.id,
      row_number() OVER (
        ORDER BY d.embedding OPERATOR(extensions.<=>) p_query_embedding, d.id
      ) AS rank_ix
    FROM product_data d
    WHERE p_query_embedding IS NOT NULL
      AND d.embedding IS NOT NULL
      AND d.embedding OPERATOR(extensions.<=>) p_query_embedding < 0.68
    ORDER BY rank_ix
    LIMIT 200
  ),
  fused AS (
    SELECT
      coalesce(k.id, s.id) AS id,
      coalesce(1.2 / (50 + k.rank_ix), 0.0)
        + coalesce(1.0 / (50 + s.rank_ix), 0.0) AS relevance
    FROM keyword k
    FULL OUTER JOIN semantic s ON s.id = k.id
  ),
  ranked AS (
    SELECT d.*, f.relevance, count(*) OVER () AS total_count
    FROM fused f
    JOIN product_data d ON d.id = f.id
  )
  SELECT
    ranked.id,
    ranked.name,
    ranked.description,
    ranked.category,
    ranked.price,
    ranked.stock,
    ranked.image,
    ranked.model3d,
    ranked.materials,
    ranked.dimensions,
    ranked.height,
    ranked.opening_diameter,
    ranked.technique,
    ranked.shop_id,
    ranked.shop_name,
    ranked.status,
    ranked.views,
    ranked.created_at,
    ranked.updated_at,
    ranked.effective_price,
    ranked.rating_avg,
    ranked.rating_count,
    ranked.relevance,
    ranked.total_count
  FROM ranked
  ORDER BY
    CASE WHEN p_sort = 'price-asc' THEN ranked.effective_price END ASC,
    CASE WHEN p_sort = 'price-desc' THEN ranked.effective_price END DESC,
    CASE WHEN p_sort = 'popularity' THEN ranked.rating_count END DESC,
    CASE WHEN p_sort = 'name-asc' THEN lower(ranked.name) END ASC,
    CASE WHEN p_sort = 'relevance' OR p_sort = 'recommended' THEN ranked.relevance END DESC,
    ranked.id
  LIMIT least(greatest(p_page_size, 1), 24)
  OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 24);
$$;

REVOKE ALL ON FUNCTION public.search_gallery_products(
  TEXT, extensions.vector, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT,
  BOOLEAN, UUID[], TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.search_gallery_products(
  TEXT, extensions.vector, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT,
  BOOLEAN, UUID[], TEXT, INTEGER, INTEGER
) TO service_role;
