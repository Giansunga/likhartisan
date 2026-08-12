BEGIN;

SELECT plan(11);

SELECT has_table('public', 'order_return_requests', 'return request table exists');
SELECT has_table('public', 'order_return_items', 'return items table exists');
SELECT has_table('public', 'order_return_evidence', 'return evidence table exists');
SELECT has_column('public', 'orders', 'search_text', 'orders have indexed search text');
SELECT has_index('public', 'orders', 'idx_orders_user_created', 'buyer pagination index exists');
SELECT has_index('public', 'orders', 'idx_orders_search_text_trgm', 'order search index exists');
SELECT has_trigger('public', 'orders', 'orders_log_activity', 'activity trigger installed');
SELECT has_trigger('public', 'orders', 'orders_refresh_search_text', 'search trigger installed');
SELECT is(
  public.buyer_order_status('pending', 'pending', 'pending'),
  'to-pay',
  'pending order maps to pay'
);
SELECT is(
  public.buyer_order_status('paid', 'paid', 'delivered'),
  'to-receive',
  'delivered order maps to receive'
);
SELECT is(
  public.buyer_order_status('completed', 'paid', 'completed'),
  'completed',
  'completed status wins'
);

SELECT * FROM finish();
ROLLBACK;
