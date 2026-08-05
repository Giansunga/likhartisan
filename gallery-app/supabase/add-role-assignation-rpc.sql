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

-- RPC B: grant super-admin dashboard access. Only the designated account can
-- promote another user; the browser-side email check is intentionally not
-- trusted for authorization.
CREATE OR REPLACE FUNCTION public.assign_super_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = (SELECT auth.uid())
      AND lower(email) = 'giansunga396@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Only the designated super-admin manager can promote super admins'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role, assigned_by)
    VALUES (p_user_id, 'super_admin', (SELECT auth.uid()));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_super_admin(uuid) TO authenticated;

-- RPC C: revoke super-admin dashboard access under the same authorization.
CREATE OR REPLACE FUNCTION public.remove_super_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = (SELECT auth.uid())
      AND lower(email) = 'giansunga396@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Only the designated super-admin manager can demote super admins'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'You cannot remove your own super-admin access'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = 'super_admin';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_super_admin(uuid) TO authenticated;

-- RPC D: demote a seller -> remove shop_owner role AND delete their shop(s)
-- Deletes the shop by ownership OR by matching email, so it works even when the
-- user_roles row has a NULL shop_id or the shop's owner_id was not set to the user.
CREATE OR REPLACE FUNCTION public.remove_shop_owner(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = 'shop_owner';

  DELETE FROM public.shops
  WHERE owner_id = p_user_id
     OR (v_email IS NOT NULL AND email = v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_shop_owner(uuid) TO anon, authenticated;
