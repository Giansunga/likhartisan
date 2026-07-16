-- ── Role Assignation RPCs ──────────────────────────────────────────────────────
-- Used by the admin "Role Assignation" page (anon Supabase client, SECURITY DEFINER).

-- RPC A: list all users with their roles
CREATE OR REPLACE FUNCTION public.list_users_with_roles()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  roles json
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email,
    u.created_at,
    COALESCE(
      (SELECT json_agg(json_build_object('role', ur.role, 'shop_id', ur.shop_id))
       FROM public.user_roles ur
       WHERE ur.user_id = u.id),
      '[]'::json
    ) AS roles
  FROM auth.users u
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_users_with_roles() TO anon, authenticated;

-- RPC B: demote a seller -> remove shop_owner role AND delete their shop
CREATE OR REPLACE FUNCTION public.remove_shop_owner(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_id uuid;
BEGIN
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = 'shop_owner'
  RETURNING shop_id INTO v_shop_id;

  IF v_shop_id IS NOT NULL THEN
    DELETE FROM public.shops WHERE id = v_shop_id AND owner_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_shop_owner(uuid) TO anon, authenticated;
