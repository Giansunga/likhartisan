-- Add exported_glb_url column to designs table
ALTER TABLE designs ADD COLUMN IF NOT EXISTS exported_glb_url TEXT;