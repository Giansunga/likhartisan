-- Add shop_id to designs so saved designs remember which shop they were created for

ALTER TABLE designs
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);
