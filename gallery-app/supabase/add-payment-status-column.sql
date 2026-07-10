-- Add payment_status column to orders table
-- This column was referenced in code but never created

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Update existing orders to sync payment_status from status
UPDATE orders SET payment_status = status WHERE payment_status IS NULL OR payment_status = '';
