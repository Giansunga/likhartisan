-- Add admin-facing columns and activity log for order management
-- Run: PATCH 000-master-schema.sql, extends orders table

-- ── 1. ACTIVITY LOG TABLE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT,
  previous_payment_status TEXT,
  new_payment_status TEXT,
  previous_delivery_status TEXT,
  new_delivery_status TEXT,
  action_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  actor_name TEXT,
  actor_role TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_order_id ON order_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON order_activity_log(created_at DESC);

ALTER TABLE order_activity_log ENABLE ROW LEVEL SECURITY;
-- Allow authenticated reads for admin/seller queries
CREATE POLICY "Authenticated users can view activity logs"
  ON order_activity_log FOR SELECT TO authenticated USING (true);
-- Allow inserts by authenticated users (server or admin)
CREATE POLICY "Authenticated users can insert activity logs"
  ON order_activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- ── 2. EXTEND ORDERS TABLE ────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_email TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_provider TEXT DEFAULT 'lalamove';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'product';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_problematic BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS problem_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS problem_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS problem_resolution TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flagged_for_investigation BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_approved BOOLEAN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reviewed_by UUID REFERENCES auth.users(id);

-- order_type constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('product', 'customized'));

-- refund_status constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refund_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN ('pending', 'processing', 'refunded', 'rejected'));

-- payment_status constraint (if not already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_payment_status_check' AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
  END IF;
END $$;

-- ── 3. RPC: log_order_change ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_order_change(
  p_order_id UUID,
  p_previous_status TEXT,
  p_new_status TEXT,
  p_previous_payment_status TEXT,
  p_new_payment_status TEXT,
  p_previous_delivery_status TEXT,
  p_new_delivery_status TEXT,
  p_action_type TEXT,
  p_actor_id UUID,
  p_actor_name TEXT,
  p_actor_role TEXT,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO order_activity_log (
    order_id,
    previous_status,
    new_status,
    previous_payment_status,
    new_payment_status,
    previous_delivery_status,
    new_delivery_status,
    action_type,
    actor_id,
    actor_name,
    actor_role,
    reason
  ) VALUES (
    p_order_id,
    p_previous_status,
    p_new_status,
    p_previous_payment_status,
    p_new_payment_status,
    p_previous_delivery_status,
    p_new_delivery_status,
    p_action_type,
    p_actor_id,
    p_actor_name,
    p_actor_role,
    p_reason
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END $$;

-- ── 4. INDEXES ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_is_problematic ON orders(is_problematic);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE order_activity_log;