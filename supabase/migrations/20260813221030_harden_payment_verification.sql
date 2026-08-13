-- Payment verification hardening. Apply after running the reconciliation script
-- in dry-run mode; duplicate provider identifiers intentionally abort migration.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_verification_source TEXT,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;

UPDATE public.orders SET checkout_session_id = NULL WHERE checkout_session_id = '';
ALTER TABLE public.orders ALTER COLUMN checkout_session_id DROP DEFAULT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE checkout_session_id IS NOT NULL
    GROUP BY checkout_session_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate checkout_session_id values must be reconciled before payment hardening';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE payment_provider_id IS NOT NULL
    GROUP BY payment_provider_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate payment_provider_id values must be reconciled before payment hardening';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_session_id_unique
  ON public.orders (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_provider_id_unique
  ON public.orders (payment_provider_id)
  WHERE payment_provider_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Preserve older duplicate audit rows while freeing the real provider event ID
-- for a unique idempotency claim.
WITH ranked AS (
  SELECT id, event_id, row_number() OVER (
    PARTITION BY event_id ORDER BY processed DESC, created_at ASC, id ASC
  ) AS duplicate_number
  FROM public.webhook_logs
  WHERE event_id IS NOT NULL
)
UPDATE public.webhook_logs AS logs
SET event_id = logs.event_id || ':duplicate:' || ranked.duplicate_number::TEXT
FROM ranked
WHERE logs.id = ranked.id AND ranked.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_event_id_unique
  ON public.webhook_logs (event_id);
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webhook_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.webhook_logs TO service_role;

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
    WHEN p_payment_status = 'paid' AND p_delivery_status = 'delivered' THEN 'to-receive'
    WHEN p_payment_status = 'paid' THEN 'to-ship'
    WHEN p_status = 'pending' OR COALESCE(p_payment_status, 'pending') <> 'paid' THEN 'to-pay'
    WHEN p_delivery_status = 'delivered' THEN 'to-receive'
    ELSE 'to-ship'
  END
$$;
