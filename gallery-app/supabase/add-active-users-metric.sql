-- ═══════════════════════════════════════════════════════════════════════════════
-- Active Users metric (admin dashboard)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. RPC to count total users (distinct auth users with a role).
-- SECURITY DEFINER so the admin client can read the count regardless of RLS.
CREATE OR REPLACE FUNCTION public.count_active_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)::bigint FROM public.user_roles;
$$;

REVOKE ALL ON FUNCTION public.count_active_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_active_users() TO authenticated;

-- 2. Enable Realtime on user_roles so the admin dashboard updates live
--    when a new user signs up (buyer role row is inserted by trigger).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_roles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;