-- LikhArtisan Database Schema
-- Run this in Supabase SQL Editor

-- Create shops table
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

-- Create products table
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
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create orders table
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
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'preparing', 'delivered')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'completed', 'cancelled')),
  payment_reference TEXT DEFAULT '',
  checkout_session_id TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES auth.users(id),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  shop_name TEXT,
  shop_image TEXT DEFAULT '',
  shop_about TEXT DEFAULT '',
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  buyer_unread INTEGER DEFAULT 0,
  artisan_unread INTEGER DEFAULT 0
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  text TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Shops policies
CREATE POLICY "Public can view shops" ON shops FOR SELECT USING (true);
CREATE POLICY "Admin can insert shops" ON shops FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update shops" ON shops FOR UPDATE USING (true);
CREATE POLICY "Admin can delete shops" ON shops FOR DELETE USING (true);

-- Products policies (drop and recreate to avoid conflicts)
DROP POLICY IF EXISTS "Public can view active products" ON products;
DROP POLICY IF EXISTS "Admin can view all products" ON products;
DROP POLICY IF EXISTS "Shop owners can view their products" ON products;
CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);
CREATE POLICY "Admin can insert products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update products" ON products FOR UPDATE USING (true);
CREATE POLICY "Admin can delete products" ON products FOR DELETE USING (true);

-- Orders policies
CREATE POLICY "Admin can view all orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Users can insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update orders" ON orders FOR UPDATE USING (true);

-- Conversations policies
CREATE POLICY "Users can view conversations" ON conversations FOR SELECT USING (true);
CREATE POLICY "Users can insert conversations" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update conversations" ON conversations FOR UPDATE USING (true);
CREATE POLICY "Users can delete conversations" ON conversations FOR DELETE USING (true);

-- Messages policies
CREATE POLICY "Users can view messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Users can insert messages" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete messages" ON messages FOR DELETE USING (true);

-- Create indexes
CREATE INDEX idx_products_shop_id ON products(shop_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_conversations_buyer_id ON conversations(buyer_id);
CREATE INDEX idx_conversations_shop_id ON conversations(shop_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Insert default shop for Regala Pottery
INSERT INTO shops (name, email, owner_name, description, about)
VALUES ('Regala Pottery', 'regalapottery@gmail.com', 'Regala Pottery', 'Traditional Filipino pottery shop', 'Handcrafted pottery inspired by Filipino heritage')
ON CONFLICT (email) DO NOTHING;

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "Anyone can upload product images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products');
CREATE POLICY "Anyone can delete product images" ON storage.objects FOR DELETE USING (bucket_id = 'products');
