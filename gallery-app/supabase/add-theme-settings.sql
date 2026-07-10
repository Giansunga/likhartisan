-- Theme Settings table for seasonal theme customizer
-- Stores the current active theme for the entire site

CREATE TABLE IF NOT EXISTS theme_settings (
  id TEXT PRIMARY KEY DEFAULT 'current',
  theme_name TEXT NOT NULL DEFAULT 'default'
    CHECK (theme_name IN ('default', 'christmas', 'valentines', 'holy-week', 'mothers-day', 'fathers-day')),
  auto_detect BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default row
INSERT INTO theme_settings (id, theme_name, auto_detect)
VALUES ('current', 'default', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can read the theme (it's public), only admin can update
ALTER TABLE theme_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read theme" ON theme_settings
  FOR SELECT USING (true);

CREATE POLICY "Admin can update theme" ON theme_settings
  FOR UPDATE USING (true);

CREATE POLICY "Admin can insert theme" ON theme_settings
  FOR INSERT WITH CHECK (true);
