-- Add views column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
