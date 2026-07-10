-- Migration: Fix conversations and orders tables to match code
-- Run this in Supabase SQL Editor

-- 1. Drop ALL existing policies on conversations and messages (to avoid name conflicts)
DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON conversations;

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can view messages" ON messages;
DROP POLICY IF EXISTS "Users can insert messages" ON messages;

-- 2. Fix conversations table: drop artisan_id, add shop_id
ALTER TABLE conversations DROP COLUMN IF EXISTS artisan_id;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_conversations_shop_id ON conversations(shop_id);

-- 3. Recreate conversations policies
CREATE POLICY "Users can view conversations" ON conversations FOR SELECT USING (true);
CREATE POLICY "Users can insert conversations" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update conversations" ON conversations FOR UPDATE USING (true);

-- 4. Recreate messages policies
CREATE POLICY "Users can view messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Users can insert messages" ON messages FOR INSERT WITH CHECK (true);

-- 5. Fix orders table: drop old columns, add new ones
ALTER TABLE orders DROP COLUMN IF EXISTS customer_id;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_name;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_phone TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_address TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_option TEXT DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_session_id TEXT DEFAULT '';
DROP INDEX IF EXISTS idx_orders_customer_id;
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- 6. Update orders status check to include 'paid'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'completed', 'cancelled'));

-- 7. Add delivery_status column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending';

-- 8. Add DELETE policies for conversations and messages
CREATE POLICY "Users can delete conversations" ON conversations FOR DELETE USING (true);
CREATE POLICY "Users can delete messages" ON messages FOR DELETE USING (true);
