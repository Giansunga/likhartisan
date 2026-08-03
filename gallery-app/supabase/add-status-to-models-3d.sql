-- Add status column to models_3d for active/archived toggle
ALTER TABLE models_3d
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived'));

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_models_3d_status ON models_3d(status);

-- Update existing rows to have active status
UPDATE models_3d SET status = 'active' WHERE status IS NULL;
