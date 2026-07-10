-- Artisans table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS artisans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT DEFAULT '',
  experience TEXT DEFAULT '',
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE artisans ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public can view artisans" ON artisans FOR SELECT USING (true);
CREATE POLICY "Admin can insert artisans" ON artisans FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update artisans" ON artisans FOR UPDATE USING (true);
CREATE POLICY "Admin can delete artisans" ON artisans FOR DELETE USING (true);

-- Index
CREATE INDEX idx_artisans_shop_id ON artisans(shop_id);
