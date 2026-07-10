-- RUN THIS IN SUPABASE SQL EDITOR TO FIX ALL ISSUES
-- This adds missing columns, tables, and RLS policies

-- 0. Add payment_status column to orders (was missing, caused insert failures)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
UPDATE orders SET payment_status = status WHERE payment_status IS NULL OR payment_status = '';

-- 0b. Add shop_name column to orders (for admin dashboard queries)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_name TEXT DEFAULT '';

-- 0c. Fix status CHECK constraint (actual DB constraint may not include 'paid')
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'completed', 'cancelled', 'refunded'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check CHECK (delivery_status IN ('pending', 'preparing', 'shipped', 'delivered', 'completed'));

-- 1. Add missing product columns (height, opening_diameter, technique)
ALTER TABLE products ADD COLUMN IF NOT EXISTS height TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS opening_diameter TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS technique TEXT DEFAULT 'Handcrafted & Kiln-Fired';

-- 2. Create product_variations table (if not exists)
CREATE TABLE IF NOT EXISTS product_variations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  dimensions TEXT NOT NULL DEFAULT '',
  height TEXT NOT NULL DEFAULT '',
  opening_diameter TEXT NOT NULL DEFAULT '',
  price DECIMAL(10,2),
  stock INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variations_product_id ON product_variations(product_id);

ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read variations"
    ON product_variations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage variations"
    ON product_variations FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create product_reviews table (if not exists)
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON product_reviews(user_id);

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_product_reviews_user_product ON product_reviews(product_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read reviews"
    ON product_reviews FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert own reviews"
    ON product_reviews FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own reviews"
    ON product_reviews FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own reviews"
    ON product_reviews FOR DELETE TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add seller/delivery service ratings to product_reviews
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS seller_service_rating INTEGER DEFAULT 0;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS delivery_service_rating INTEGER DEFAULT 0;
ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS show_name BOOLEAN DEFAULT true;
