-- Designs table for freeform pottery customizer
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL DEFAULT 'Untitled Design',
  model_name TEXT NOT NULL,
  model_file TEXT NOT NULL,
  shape_params JSONB DEFAULT '{}',
  material_params JSONB DEFAULT '{}',
  decor_params JSONB DEFAULT '{}',
  thumbnail TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own designs" ON designs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own designs" ON designs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own designs" ON designs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own designs" ON designs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_designs_user_id ON designs(user_id);
