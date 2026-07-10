-- RESET ALL ORDERS + FIX CONSTRAINTS
-- Run this in Supabase SQL Editor

-- 1. First fix any existing delivery_status values that don't match allowed values
UPDATE orders SET delivery_status = 'pending'
  WHERE delivery_status NOT IN ('pending', 'preparing', 'shipped', 'delivered', 'completed');

-- 2. First fix any existing status values that don't match allowed values
UPDATE orders SET status = 'pending'
  WHERE status NOT IN ('pending', 'paid', 'completed', 'cancelled', 'refunded');

-- 3. Now safely drop and recreate the CHECK constraints
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'completed', 'cancelled', 'refunded'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check CHECK (delivery_status IN ('pending', 'preparing', 'shipped', 'delivered', 'completed'));

-- 4. Delete ALL orders
DELETE FROM orders;

-- 5. Verify
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'orders'::regclass AND contype = 'c';
