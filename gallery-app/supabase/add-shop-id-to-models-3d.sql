-- Add shop_id to models_3d so each 3D model can be assigned to a specific shop
-- Models with shop_id = NULL are global (legacy), new models should always have a shop_id

ALTER TABLE models_3d
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_models_3d_shop_id ON models_3d(shop_id);
