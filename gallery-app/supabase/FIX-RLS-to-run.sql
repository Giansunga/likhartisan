-- =============================================================================
-- FIX-RLS.sql — Comprehensive Row Level Security Migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/wlnknpbjkcmxwxtuspeh/sql
-- =============================================================================

-- ── Step 1: Drop ALL policies that depend on is_admin() / is_shop_owner() ──────

-- Orders
DROP POLICY IF EXISTS "Admin can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admin can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admin can insert orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own_or_shop" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "orders_update_buyer_or_shop_or_admin" ON public.orders;

-- Shops
DROP POLICY IF EXISTS "Public can view shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can insert shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can update shops" ON public.shops;
DROP POLICY IF EXISTS "Admin can delete shops" ON public.shops;
DROP POLICY IF EXISTS "shops_select_public" ON public.shops;
DROP POLICY IF EXISTS "shops_insert_admin" ON public.shops;
DROP POLICY IF EXISTS "shops_update_admin_or_owner" ON public.shops;
DROP POLICY IF EXISTS "shops_delete_admin" ON public.shops;

-- Products
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Admin can insert products" ON public.products;
DROP POLICY IF EXISTS "Admin can update products" ON public.products;
DROP POLICY IF EXISTS "Admin can delete products" ON public.products;
DROP POLICY IF EXISTS "products_select_public" ON public.products;
DROP POLICY IF EXISTS "products_insert_admin_or_owner" ON public.products;
DROP POLICY IF EXISTS "products_update_admin_or_owner" ON public.products;
DROP POLICY IF EXISTS "products_delete_admin_or_owner" ON public.products;

-- Product Variations
DROP POLICY IF EXISTS "Anyone can read variations" ON public.product_variations;
DROP POLICY IF EXISTS "Authenticated users can manage variations" ON public.product_variations;
DROP POLICY IF EXISTS "variations_select_public" ON public.product_variations;
DROP POLICY IF EXISTS "variations_manage_owner" ON public.product_variations;
DROP POLICY IF EXISTS "Admin can manage variations" ON public.product_variations;

-- Conversations
DROP POLICY IF EXISTS "Users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select_parties" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_buyer" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_parties" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete_buyer" ON public.conversations;

-- Messages
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages" ON public.messages;
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_sender_or_admin" ON public.messages;

-- Artisans
DROP POLICY IF EXISTS "Public can view artisans" ON public.artisans;
DROP POLICY IF EXISTS "Admin can insert artisans" ON public.artisans;
DROP POLICY IF EXISTS "Admin can update artisans" ON public.artisans;
DROP POLICY IF EXISTS "Admin can delete artisans" ON public.artisans;
DROP POLICY IF EXISTS "artisans_select_public" ON public.artisans;
DROP POLICY IF EXISTS "artisans_insert_admin" ON public.artisans;
DROP POLICY IF EXISTS "artisans_update_admin" ON public.artisans;
DROP POLICY IF EXISTS "artisans_delete_admin" ON public.artisans;

-- Models_3D
DROP POLICY IF EXISTS "Public can view models" ON public.models_3d;
DROP POLICY IF EXISTS "Admin can insert models" ON public.models_3d;
DROP POLICY IF EXISTS "Admin can update models" ON public.models_3d;
DROP POLICY IF EXISTS "Admin can delete models" ON public.models_3d;
DROP POLICY IF EXISTS "models_select_public" ON public.models_3d;
DROP POLICY IF EXISTS "models_insert_admin" ON public.models_3d;
DROP POLICY IF EXISTS "models_update_admin" ON public.models_3d;
DROP POLICY IF EXISTS "models_delete_admin" ON public.models_3d;

-- Theme Settings
DROP POLICY IF EXISTS "Anyone can read theme" ON public.theme_settings;
DROP POLICY IF EXISTS "Admin can update theme" ON public.theme_settings;
DROP POLICY IF EXISTS "Admin can insert theme" ON public.theme_settings;
DROP POLICY IF EXISTS "theme_select_public" ON public.theme_settings;
DROP POLICY IF EXISTS "theme_insert_admin" ON public.theme_settings;
DROP POLICY IF EXISTS "theme_update_admin" ON public.theme_settings;

-- Shop Followers
DROP POLICY IF EXISTS "Public can view followers" ON public.shop_followers;
DROP POLICY IF EXISTS "Users can follow" ON public.shop_followers;
DROP POLICY IF EXISTS "Users can unfollow" ON public.shop_followers;
DROP POLICY IF EXISTS "followers_select_public" ON public.shop_followers;
DROP POLICY IF EXISTS "followers_insert_own" ON public.shop_followers;
DROP POLICY IF EXISTS "followers_delete_own" ON public.shop_followers;

-- Product Reviews
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Authenticated users can insert own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can delete own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_select_public" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_insert_own" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_update_own" ON public.product_reviews;
DROP POLICY IF EXISTS "reviews_delete_own" ON public.product_reviews;

-- Designs
DROP POLICY IF EXISTS "Users can view own designs" ON public.designs;
DROP POLICY IF EXISTS "Users can insert own designs" ON public.designs;
DROP POLICY IF EXISTS "Users can update own designs" ON public.designs;
DROP POLICY IF EXISTS "Users can delete own designs" ON public.designs;
DROP POLICY IF EXISTS "designs_select_own" ON public.designs;
DROP POLICY IF EXISTS "designs_insert_own" ON public.designs;
DROP POLICY IF EXISTS "designs_update_own" ON public.designs;
DROP POLICY IF EXISTS "designs_delete_own" ON public.designs;

-- Notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;

-- Storage
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "storage_select_public" ON storage.objects;
DROP POLICY IF EXISTS "storage_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete_owner_or_admin" ON storage.objects;

-- ── Step 2: Drop functions (now no dependencies) ──────────────────────────────

DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_shop_owner(uuid);

-- ── Step 3: Recreate functions ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'giansunga396@gmail.com'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(shop_uuid UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shops
    WHERE id = shop_uuid AND owner_id = auth.uid()
  );
$$;

-- ── Step 4: Recreate all policies ────────────────────────────────────────────

-- =============================================================================
-- ORDERS (critical fix)
-- =============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own_or_shop" ON public.orders
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) AS item
      WHERE public.is_shop_owner((item->>'shop_id')::uuid)
    )
  );

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders_update_buyer_or_shop_or_admin" ON public.orders
  FOR UPDATE USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(items) AS item
      WHERE public.is_shop_owner((item->>'shop_id')::uuid)
    )
  );

-- =============================================================================
-- SHOPS
-- =============================================================================
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shops_select_public" ON public.shops FOR SELECT USING (true);
CREATE POLICY "shops_insert_admin" ON public.shops FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "shops_update_admin_or_owner" ON public.shops FOR UPDATE USING (public.is_admin() OR owner_id = auth.uid());
CREATE POLICY "shops_delete_admin" ON public.shops FOR DELETE USING (public.is_admin());

-- =============================================================================
-- PRODUCTS
-- =============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select_public" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_insert_admin_or_owner" ON public.products FOR INSERT WITH CHECK (public.is_admin() OR public.is_shop_owner(shop_id));
CREATE POLICY "products_update_admin_or_owner" ON public.products FOR UPDATE USING (public.is_admin() OR public.is_shop_owner(shop_id));
CREATE POLICY "products_delete_admin_or_owner" ON public.products FOR DELETE USING (public.is_admin() OR public.is_shop_owner(shop_id));

-- =============================================================================
-- PRODUCT VARIATIONS
-- =============================================================================
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variations_select_public" ON public.product_variations FOR SELECT USING (true);
CREATE POLICY "variations_manage_owner" ON public.product_variations FOR ALL USING (
  public.is_admin() OR public.is_shop_owner((SELECT shop_id FROM public.products WHERE id = product_id))
);

-- =============================================================================
-- CONVERSATIONS
-- =============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select_parties" ON public.conversations FOR SELECT USING (buyer_id = auth.uid() OR public.is_shop_owner(shop_id) OR public.is_admin());
CREATE POLICY "conversations_insert_buyer" ON public.conversations FOR INSERT WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "conversations_update_parties" ON public.conversations FOR UPDATE USING (buyer_id = auth.uid() OR public.is_shop_owner(shop_id));
CREATE POLICY "conversations_delete_buyer" ON public.conversations FOR DELETE USING (buyer_id = auth.uid() OR public.is_shop_owner(shop_id) OR public.is_admin());

-- =============================================================================
-- MESSAGES
-- =============================================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_participants" ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.buyer_id = auth.uid() OR public.is_shop_owner(c.shop_id) OR public.is_admin())
  )
);
CREATE POLICY "messages_insert_sender" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.buyer_id = auth.uid() OR public.is_shop_owner(c.shop_id))
  )
);
CREATE POLICY "messages_delete_sender_or_admin" ON public.messages FOR DELETE USING (sender_id = auth.uid() OR public.is_admin());

-- =============================================================================
-- ARTISANS
-- =============================================================================
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artisans_select_public" ON public.artisans FOR SELECT USING (true);
CREATE POLICY "artisans_insert_admin" ON public.artisans FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "artisans_update_admin" ON public.artisans FOR UPDATE USING (public.is_admin());
CREATE POLICY "artisans_delete_admin" ON public.artisans FOR DELETE USING (public.is_admin());

-- =============================================================================
-- MODELS_3D
-- =============================================================================
ALTER TABLE public.models_3d ENABLE ROW LEVEL SECURITY;
CREATE POLICY "models_select_public" ON public.models_3d FOR SELECT USING (true);
CREATE POLICY "models_insert_admin" ON public.models_3d FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "models_update_admin" ON public.models_3d FOR UPDATE USING (public.is_admin());
CREATE POLICY "models_delete_admin" ON public.models_3d FOR DELETE USING (public.is_admin());

-- =============================================================================
-- THEME_SETTINGS
-- =============================================================================
ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "theme_select_public" ON public.theme_settings FOR SELECT USING (true);
CREATE POLICY "theme_insert_admin" ON public.theme_settings FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "theme_update_admin" ON public.theme_settings FOR UPDATE USING (public.is_admin());

-- =============================================================================
-- SHOP_FOLLOWERS
-- =============================================================================
ALTER TABLE public.shop_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followers_select_public" ON public.shop_followers FOR SELECT USING (true);
CREATE POLICY "followers_insert_own" ON public.shop_followers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "followers_delete_own" ON public.shop_followers FOR DELETE USING (user_id = auth.uid());

-- =============================================================================
-- PRODUCT_REVIEWS
-- =============================================================================
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_public" ON public.product_reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON public.product_reviews FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
CREATE POLICY "reviews_update_own" ON public.product_reviews FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "reviews_delete_own" ON public.product_reviews FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- =============================================================================
-- DESIGNS
-- =============================================================================
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "designs_select_own" ON public.designs FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "designs_insert_own" ON public.designs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "designs_update_own" ON public.designs FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "designs_delete_own" ON public.designs FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "notifications_insert_own" ON public.notifications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "notifications_insert_service" ON public.notifications FOR INSERT WITH CHECK (true);

-- =============================================================================
-- STORAGE
-- =============================================================================
CREATE POLICY "storage_select_public" ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "storage_insert_auth" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "storage_delete_owner_or_admin" ON storage.objects FOR DELETE USING (bucket_id = 'products' AND (auth.uid() = owner OR public.is_admin()));