-- Add performance indexes for common query patterns
-- Apply via Supabase SQL Editor or migrations

CREATE INDEX IF NOT EXISTS idx_orders_checkout_session_id
  ON public.orders (checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_shop_id
  ON public.products (shop_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_participants
  ON public.conversations USING GIN (participants);
