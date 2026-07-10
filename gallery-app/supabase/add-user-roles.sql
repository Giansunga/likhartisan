-- =============================================================================
-- Phase 1: User Roles & Permissions System
-- Run in Supabase SQL Editor
-- =============================================================================

-- ── 1. Create user_roles table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'shop_owner', 'buyer')),
  shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_shop_id ON public.user_roles(shop_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.is_super_admin());

-- ── 2. Helper functions ────────────────────────────────────────────────────────

-- is_super_admin checks both new role AND legacy emails
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
    UNION
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email IN ('giansunga396@gmail.com', 'deang.elaizah0505@gmail.com')
  );
$$;

-- has_role checks role with optional shop scoping
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, shop_uuid UUID DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = role_name
      AND (shop_uuid IS NULL OR shop_id = shop_uuid)
  );
$$;

-- is_shop_owner backward compatibility
CREATE OR REPLACE FUNCTION public.is_shop_owner(shop_uuid UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT public.has_role('shop_owner', shop_uuid);
$$;

-- ── 3. Seed initial roles ──────────────────────────────────────────────────────

-- Super admins
INSERT INTO public.user_roles (user_id, role, assigned_by)
SELECT id, 'super_admin', id FROM auth.users
WHERE email IN ('giansunga396@gmail.com', 'deang.elaizah0505@gmail.com')
ON CONFLICT (user_id, role, shop_id) DO NOTHING;

-- Shop owner for Regala Pottery
INSERT INTO public.user_roles (user_id, role, shop_id, assigned_by)
SELECT u.id, 'shop_owner', s.id, u.id
FROM auth.users u
JOIN public.shops s ON s.email = 'regalapottery@gmail.com'
WHERE u.email = 'regalapottery@gmail.com'
ON CONFLICT (user_id, role, shop_id) DO NOTHING;

-- ── 4. Auto-assign buyer role on user creation ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_buyer_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'buyer')
  ON CONFLICT (user_id, role, shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_buyer_role();

-- Backfill buyer role for existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'buyer' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'buyer')
ON CONFLICT (user_id, role, shop_id) DO NOTHING;

-- ── 5. Update RLS Policies ──────────────────────────────────────────────────────

-- ============ ORDERS ============
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_own_or_shop" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "orders_update_buyer_or_shop" ON public.orders;
DROP POLICY IF EXISTS "Admin can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admin can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admin can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can view own orders" ON public.orders;

CREATE POLICY "orders_select_own_or_shop" ON public.orders
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_role('shop_owner', (
      SELECT DISTINCT (item->>'shop_id')::uuid 
      FROM jsonb_array_elements(items) AS item 
      WHERE item->>'shop_id' IS NOT NULL 
      LIMIT 1
    ))
    OR public.is_super_admin()
  );

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders_update_buyer_or_shop" ON public.orders
  FOR UPDATE USING (
    (user_id = auth.uid() AND status = 'pending')
    OR public.has_role('shop_owner', (
      SELECT DISTINCT (item->>'shop_id')::uuid 
      FROM jsonb_array_elements(items) AS item 
      WHERE item->>'shop_id' IS NOT NULL 
      LIMIT 1
    ))
    OR public.is_super_admin()
  );

-- ============ SHOPS ============
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shops_select_public" ON public.shops;
DROP POLICY IF EXISTS "shops_insert_owner" ON public.shops;
DROP POLICY IF EXISTS "shops_update_owner" ON public.shops;
DROP POLICY IF EXISTS "shops_delete_admin" ON public.shops;
DROP POLICY IF EXISTS "Public can view shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can insert shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can update shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can delete shops" ON public.shops;

CREATE POLICY "shops_select_public" ON public.shops FOR SELECT USING (true);
CREATE POLICY "shops_insert_owner" ON public.shops FOR INSERT WITH CHECK (owner_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "shops_update_owner" ON public.shops FOR UPDATE USING (owner_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "shops_delete_admin" ON public.shops FOR DELETE USING (public.is_super_admin());

-- ============ PRODUCTS ============
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_public" ON public.products;
DROP POLICY IF EXISTS "products_insert_owner" ON public.products;
DROP POLICY IF EXISTS "products_update_owner" ON public.products;
DROP POLICY IF EXISTS "products_delete_owner" ON public.products;
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Admin can insert products" ON public.products;
DROP POLICY IF EXISTS "Admin can update products" ON public.products;
DROP POLICY IF EXISTS "Admin can delete products" ON public.products;

CREATE POLICY "products_select_public" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_insert_owner" ON public.products FOR INSERT WITH CHECK (public.has_role('shop_owner', shop_id) OR public.is_super_admin());
CREATE POLICY "products_update_owner" ON public.products FOR UPDATE USING (public.has_role('shop_owner', shop_id) OR public.is_super_admin());
CREATE POLICY "products_delete_owner" ON public.products FOR DELETE USING (public.has_role('shop_owner', shop_id) OR public.is_super_admin());

-- ============ PRODUCT VARIATIONS ============
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "variations_select_public" ON public.product_variations;
DROP POLICY IF EXISTS "variations_manage_owner" ON public.product_variations;
DROP POLICY IF EXISTS "Anyone can read variations" ON public.product_variations;
DROP POLICY IF EXISTS "Authenticated users can manage variations" ON public.product_variations;

CREATE POLICY "variations_select_public" ON public.product_variations FOR SELECT USING (true);
CREATE POLICY "variations_manage_owner" ON public.product_variations
  FOR ALL USING (
    public.is_super_admin()
    OR public.has_role('shop_owner', (SELECT shop_id FROM public.products WHERE id = product_id))
  );

-- ============ CONVERSATIONS ============
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_parties" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_buyer" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_parties" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete_buyer" ON public.conversations;
DROP POLICY IF EXISTS "Users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON public.conversations;

CREATE POLICY "conversations_select_parties" ON public.conversations
  FOR SELECT USING (
    buyer_id = auth.uid()
    OR public.has_role('shop_owner', shop_id)
    OR public.is_super_admin()
  );

CREATE POLICY "conversations_insert_buyer" ON public.conversations
  FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "conversations_update_parties" ON public.conversations
  FOR UPDATE USING (
    buyer_id = auth.uid()
    OR public.has_role('shop_owner', shop_id)
  );

CREATE POLICY "conversations_delete_buyer" ON public.conversations
  FOR DELETE USING (
    buyer_id = auth.uid()
    OR public.has_role('shop_owner', shop_id)
    OR public.is_super_admin()
  );

-- ============ MESSAGES ============
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_sender_or_admin" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages" ON public.messages;

CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() 
             OR public.has_role('shop_owner', c.shop_id)
             OR public.is_super_admin())
    )
  );

CREATE POLICY "messages_insert_sender" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR public.has_role('shop_owner', c.shop_id))
    )
  );

CREATE POLICY "messages_delete_sender_or_admin" ON public.messages
  FOR DELETE USING (sender_id = auth.uid() OR public.is_super_admin());

-- ============ ARTISANS ============
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artisans_select_public" ON public.artisans;
DROP POLICY IF EXISTS "artisans_insert_owner" ON public.artisans;
DROP POLICY IF EXISTS "artisans_update_owner" ON public.artisans;
DROP POLICY IF EXISTS "artisans_delete_owner" ON public.artisans;
DROP POLICY IF EXISTS "Public can view artisans" ON public.artisans;
DROP POLICY IF EXISTS "Admin can insert artisans" ON public.artisans;
DROP POLICY IF EXISTS "Admin can update artisans" ON public.artisans;
DROP POLICY IF EXISTS "Admin can delete artisans" ON public.artisans;

CREATE POLICY "artisans_select_public" ON public.artisans FOR SELECT USING (true);
CREATE POLICY "artisans_insert_owner" ON public.artisans FOR INSERT WITH CHECK (public.has_role('shop_owner', shop_id) OR public.is_super_admin());
CREATE POLICY "artisans_update_owner" ON public.artisans FOR UPDATE USING (public.has_role('shop_owner', shop_id) OR public.is_super_admin());
CREATE POLICY "artisans_delete_owner" ON public.artisans FOR DELETE USING (public.has_role('shop_owner', shop_id) OR public.is_super_admin());

-- ============ MODELS_3D ============
ALTER TABLE public.models_3d ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "models_select_public" ON public.models_3d;
DROP POLICY IF EXISTS "models_insert_admin" ON public.models_3d;
DROP POLICY IF EXISTS "models_update_admin" ON public.models_3d;
DROP POLICY IF EXISTS "models_delete_admin" ON public.models_3d;
DROP POLICY IF EXISTS "Public can view models" ON public.models_3d;
DROP POLICY IF EXISTS "Admin can insert models" ON public.models_3d;
DROP POLICY IF EXISTS "Admin can update models" ON public.models_3d;
DROP POLICY IF EXISTS "Admin can delete models" ON public.models_3d;

CREATE POLICY "models_select_public" ON public.models_3d FOR SELECT USING (true);
CREATE POLICY "models_insert_admin" ON public.models_3d FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "models_update_admin" ON public.models_3d FOR UPDATE USING (public.is_super_admin());
CREATE POLICY "models_delete_admin" ON public.models_3d FOR DELETE USING (public.is_super_admin());

-- ============ THEME_SETTINGS ============
ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "theme_select_public" ON public.theme_settings;
DROP POLICY IF EXISTS "theme_insert_admin" ON public.theme_settings;
DROP POLICY IF EXISTS "theme_update_admin" ON public.theme_settings;
DROP POLICY IF EXISTS "Anyone can read theme" ON public.theme_settings;
DROP POLICY IF EXISTS "Admin can update theme" ON public.theme_settings;
DROP POLICY IF EXISTS "Admin can insert theme" ON public.theme_settings;

CREATE POLICY "theme_select_public" ON public.theme_settings FOR SELECT USING (true);
CREATE POLICY "theme_insert_admin" ON public.theme_settings FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "theme_update_admin" ON public.theme_settings FOR UPDATE USING (public.is_super_admin());

-- ============ SHOP_FOLLOWERS ============
ALTER TABLE public.shop_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "followers_select_public" ON public.shop_followers;
DROP POLICY IF EXISTS "followers_insert_own" ON public.shop_followers;
DROP POLICY IF EXISTS "followers_delete_own" ON public.shop_followers;
DROP POLICY IF EXISTS "Public can view followers" ON public.shop_followers;
DROP POLICY IF EXISTS "Users can follow" ON public.shop_followers;
DROP POLICY IF EXISTS "Users can unfollow" ON public.shop_followers;

CREATE POLICY "followers_select_public" ON public.shop_followers FOR SELECT USING (true);
CREATE POLICY "followers_insert_own" ON public.shop_followers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "followers_delete_own" ON public.shop_followers FOR DELETE USING (user_id = auth.uid());

-- ============ PRODUCT_REVIEWS ============
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_public" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_insert_own" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_update_own" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_delete_own" ON public.product_reviews;
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Authenticated users can insert own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can delete own reviews" ON public.product_reviews;

CREATE POLICY "reviews_select_public" ON public.product_reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON public.product_reviews FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
CREATE POLICY "reviews_update_own" ON public.product_reviews FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "reviews_delete_own" ON public.product_reviews FOR DELETE USING (user_id = auth.uid() OR public.is_super_admin());

-- ============ DESIGNS ============
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "designs_select_own" ON public.designs;
DROP POLICY IF EXISTS "designs_insert_own" ON public.designs;
DROP POLICY IF EXISTS "designs_update_own" ON public.designs;
DROP POLICY IF EXISTS "designs_delete_own" ON public.designs;
DROP POLICY IF EXISTS "Users can view own designs" ON public.designs;
DROP POLICY IF EXISTS "Users can insert own designs" ON public.designs;
DROP POLICY IF EXISTS "Users can update own designs" ON public.designs;
DROP POLICY IF EXISTS "Users can delete own designs" ON public.designs;

CREATE POLICY "designs_select_own" ON public.designs FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "designs_insert_own" ON public.designs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "designs_update_own" ON public.designs FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "designs_delete_own" ON public.designs FOR DELETE USING (user_id = auth.uid() OR public.is_super_admin());

-- ============ NOTIFICATIONS ============
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "notifications_insert_own" ON public.notifications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "notifications_insert_service" ON public.notifications FOR INSERT WITH CHECK (true);

-- ============ STORAGE ============
DROP POLICY IF EXISTS "storage_select_public" ON storage.objects;
DROP POLICY IF EXISTS "storage_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete product images" ON storage.objects;

CREATE POLICY "storage_select_public" ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "storage_insert_auth" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "storage_delete_owner_or_admin" ON storage.objects FOR DELETE USING (bucket_id = 'products' AND (auth.uid() = owner OR public.is_super_admin()));