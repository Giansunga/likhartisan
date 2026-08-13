begin;

select plan(28);

select has_schema('private', 'private helper schema exists');
select has_function('private', 'send_portal_invalidation', array['text', 'text', 'text', 'text'], 'minimal invalidation sender exists');
select has_function('private', 'broadcast_portal_direct_change', 'direct routing trigger function exists');
select has_function('private', 'broadcast_order_change', 'order routing trigger function exists');
select has_function('private', 'broadcast_variation_change', 'variation routing trigger function exists');
select has_function('private', 'broadcast_message_change', 'message routing trigger function exists');
select has_function('private', 'broadcast_order_activity_change', 'activity routing trigger function exists');

select has_trigger('public', 'orders', 'portal_realtime_broadcast', 'orders broadcast invalidations');
select has_trigger('public', 'order_activity_log', 'portal_realtime_broadcast', 'order activity broadcasts invalidations');
select has_trigger('public', 'products', 'portal_realtime_broadcast', 'products broadcast invalidations');
select has_trigger('public', 'product_variations', 'portal_realtime_broadcast', 'variations broadcast invalidations');
select has_trigger('public', 'shops', 'portal_realtime_broadcast', 'shops broadcast invalidations');
select has_trigger('public', 'artisans', 'portal_realtime_broadcast', 'artisans broadcast invalidations');
select has_trigger('public', 'models_3d', 'portal_realtime_broadcast', 'models broadcast invalidations');
select has_trigger('public', 'conversations', 'portal_realtime_broadcast', 'conversations broadcast invalidations');
select has_trigger('public', 'messages', 'portal_realtime_broadcast', 'messages broadcast invalidations');
select has_trigger('public', 'notifications', 'portal_realtime_broadcast', 'notifications broadcast invalidations');
select has_trigger('public', 'design_requests', 'portal_realtime_broadcast', 'design requests broadcast invalidations');
select has_trigger('public', 'user_roles', 'portal_realtime_broadcast', 'roles broadcast invalidations');
select has_trigger('public', 'theme_settings', 'portal_realtime_broadcast', 'theme changes broadcast invalidations');

select has_policy(
  'realtime',
  'messages',
  'portal_broadcast_topics_select',
  'portal topic authorization policy exists'
);

select ok(
  not has_function_privilege('authenticated', 'private.send_portal_invalidation(text,text,text,text)', 'EXECUTE'),
  'authenticated clients cannot invoke the broadcast sender directly'
);
select ok(
  not has_function_privilege('anon', 'private.broadcast_portal_direct_change()', 'EXECUTE'),
  'anonymous clients cannot invoke trigger routing directly'
);
select ok(
  (select qual like '%admin:portal%' and qual like '%is_super_admin%'
   from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'portal_broadcast_topics_select'),
  'admin topic requires the super-admin helper'
);
select ok(
  (select qual like '%user:%' and qual like '%auth.uid%'
   from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'portal_broadcast_topics_select'),
  'user topics are scoped to the authenticated user'
);
select ok(
  (select qual like '%shop:%' and qual like '%has_role%'
   from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'portal_broadcast_topics_select'),
  'shop topics require a scoped shop-owner role'
);
select matches(
  pg_get_functiondef('private.broadcast_order_change()'::regprocedure),
  'jsonb_array_elements[^;]*shop_id',
  'order routing derives scoped topics from order-item shop ids'
);

select matches(
  pg_get_functiondef('private.send_portal_invalidation(text,text,text,text)'::regprocedure),
  'jsonb_build_object[^;]*table[^;]*operation[^;]*record_id',
  'broadcast payload is limited to table, operation, and record id'
);

select * from finish();
rollback;
