-- 3D Models table for admin-managed freeform presets
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS models_3d (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Vase',
  file_url TEXT NOT NULL,
  thumbnail TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE models_3d ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view models" ON models_3d FOR SELECT USING (true);
CREATE POLICY "Admin can insert models" ON models_3d FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update models" ON models_3d FOR UPDATE USING (true);
CREATE POLICY "Admin can delete models" ON models_3d FOR DELETE USING (true);

CREATE INDEX idx_models_3d_category ON models_3d(category);
