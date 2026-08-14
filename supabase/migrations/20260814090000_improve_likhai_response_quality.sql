CREATE TABLE IF NOT EXISTS public.likhai_response_metrics (
  response_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  intent TEXT NOT NULL,
  authenticated BOOLEAN NOT NULL DEFAULT FALSE,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  provider_latency_ms INTEGER CHECK (provider_latency_ms IS NULL OR provider_latency_ms >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  grounding_status TEXT NOT NULL CHECK (grounding_status IN ('grounded', 'partial', 'unavailable')),
  card_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  action_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  error_code TEXT,
  rating SMALLINT CHECK (rating IS NULL OR rating IN (-1, 1)),
  rated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_likhai_response_metrics_created_at
  ON public.likhai_response_metrics (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likhai_response_metrics_intent_created_at
  ON public.likhai_response_metrics (intent, created_at DESC);

ALTER TABLE public.likhai_response_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.likhai_response_metrics FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.likhai_response_metrics TO service_role;

COMMENT ON TABLE public.likhai_response_metrics IS
  'Privacy-safe LikhAI operational metrics. Conversation text and business record identifiers are intentionally excluded.';
