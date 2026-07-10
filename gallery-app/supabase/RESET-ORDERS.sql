-- Reset order history: keep 1 completed order, delete the rest
-- The review on Ancient Vase (product 60d7efc0) is retained

-- Step 1: Delete all orders except 1 completed order (keep the most recent completed one)
DELETE FROM orders
WHERE id NOT IN (
  SELECT id FROM orders
  WHERE status = 'completed'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Verify: should show only 1 order
SELECT id, user_id, status, delivery_status, total, items, created_at FROM orders;
