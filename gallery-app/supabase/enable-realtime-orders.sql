-- ═══════════════════════════════════════════════════════════════════════════════
-- Enable Realtime on orders so the admin Revenue Overview updates live
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;