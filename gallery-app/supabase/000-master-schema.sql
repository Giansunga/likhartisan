-- ════════════════════════════════════════════════════════════════════════════
-- LikhArtisan — Master Database Schema v1.0
-- ════════════════════════════════════════════════════════════════════════════
-- Run once in Supabase SQL Editor.
-- All statements use IF NOT EXISTS so it is safe to re-run.
-- Order: tables with no FK deps first, then dependent tables.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. SHOPS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  owner_name TEXT,
  email TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  about TEXT DEFAULT '',
  image TEXT DEFAULT '',
  banner TEXT DEFAULT '',
  location TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON shops(owner_id);

-- ── 2. PRODUCTS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  image TEXT DEFAULT '',
  model3d TEXT,
  materials TEXT DEFAULT '',
  dimensions TEXT DEFAULT '',
  height TEXT DEFAULT '',
  opening_diameter TEXT DEFAULT '',
  technique TEXT DEFAULT 'Handcrafted & Kiln-Fired',
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ── 3. PRODUCT VARIATIONS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_variations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  sku TEXT DEFAULT '',
  dimensions TEXT DEFAULT '',
  height TEXT DEFAULT '',
  opening_diameter TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variations_product_id ON product_variations(product_id);

-- ── 4. PRODUCT REVIEWS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,
  seller_rating INTEGER CHECK (seller_rating >= 1 AND seller_rating <= 5),
  delivery_rating INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  show_name BOOLEAN DEFAULT true,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON product_reviews(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_product ON product_reviews(product_id, user_id);

-- ── 5. ORDERS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  user_phone TEXT DEFAULT '',
  user_address TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  delivery_option TEXT DEFAULT 'pickup',
  delivery_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending',
  payment_reference TEXT DEFAULT '',
  checkout_session_id TEXT DEFAULT '',
  payment_status TEXT DEFAULT 'pending',
  lalamove_quote_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recreate CHECK constraints safely
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'completed', 'cancelled', 'refunded'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status IN ('pending', 'preparing', 'shipped', 'delivered', 'completed'));

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_checkout_session_id ON orders(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ── 6. ARTISANS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artisans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT DEFAULT '',
  experience TEXT DEFAULT '',
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 7. MODELS_3D ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS models_3d (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Vase',
  file_url TEXT NOT NULL,
  thumbnail TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 8. DESIGNS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  model_name TEXT DEFAULT '',
  model_file TEXT DEFAULT '',
  thumbnail TEXT DEFAULT '',
  shape_params JSONB DEFAULT '{}',
  material_params JSONB DEFAULT '{}',
  decor_params JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_designs_user_id ON designs(user_id);

-- ── 9. NOTIFICATIONS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read);

-- ── 10. CONVERSATIONS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  shop_name TEXT,
  shop_image TEXT DEFAULT '',
  shop_about TEXT DEFAULT '',
  buyer_name TEXT DEFAULT '',
  buyer_avatar TEXT DEFAULT '',
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  buyer_unread INTEGER DEFAULT 0,
  artisan_unread INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_shop_id ON conversations(shop_id);

-- ── 11. MESSAGES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  text TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

-- ── 12. SHOP FOLLOWERS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shop_followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_followers_shop_id ON shop_followers(shop_id);
CREATE INDEX IF NOT EXISTS idx_followers_user_id ON shop_followers(user_id);

-- ── 13. THEME SETTINGS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS theme_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  colors JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── STORAGE BUCKET ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- ── DEFAULT DATA ───────────────────────────────────────────────────────────

INSERT INTO shops (name, email, owner_name, description, about)
VALUES (
  'Regala Pottery',
  'regalapottery@gmail.com',
  'Regala Pottery',
  'Traditional Filipino pottery shop',
  'Handcrafted pottery inspired by Filipino heritage'
)
ON CONFLICT (email) DO NOTHING;
