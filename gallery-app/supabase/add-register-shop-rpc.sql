-- ── Register Shop RPCs ───────────────────────────────────────────────────────────
-- These let the anon Supabase client (used by the admin frontend) safely:
--   1. resolve an owner email -> auth.users.id
--   2. grant the shop_owner role for a shop
-- Both run as SECURITY DEFINER so they bypass RLS on auth.users / user_roles.

-- RPC A: resolve owner email -> user id (NULL if no account exists)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(target_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(target_email) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO anon, authenticated;

-- RPC B: grant shop_owner role for a shop (upsert to avoid unique violation)
CREATE OR REPLACE FUNCTION public.assign_shop_owner(
  p_user_id uuid,
  p_shop_id uuid,
  p_assigned_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, shop_id, assigned_by)
  VALUES (p_user_id, 'shop_owner', p_shop_id, p_assigned_by)
  ON CONFLICT (user_id, role, shop_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_shop_owner(uuid, uuid, uuid) TO anon, authenticated;
