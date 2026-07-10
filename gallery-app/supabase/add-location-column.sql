-- Add location column to shops table
ALTER TABLE shops ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
