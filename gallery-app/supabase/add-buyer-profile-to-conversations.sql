-- Add buyer_name and buyer_avatar columns to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS buyer_name TEXT DEFAULT '';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS buyer_avatar TEXT DEFAULT '';
