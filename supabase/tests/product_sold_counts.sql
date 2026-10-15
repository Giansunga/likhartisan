-- Run after the product_sold_counts migration. Uses only temporary fixtures.
begin;
create temporary table products (id uuid primary key, status text);
create temporary table orders (status text, items jsonb);
set local search_path = '';
do $$ begin
  execute replace(replace(replace(
    pg_get_functiondef('public.get_product_sold_counts(uuid[])'::regprocedure),
    'public.products', 'pg_temp.products'),
    'public.orders', 'pg_temp.orders'),
    'public.get_product_sold_counts', 'pg_temp.get_product_sold_counts');
  execute format('grant usage on schema %I to anon, authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end; $$;
revoke all on function pg_temp.get_product_sold_counts(uuid[]) from public;
grant execute on function pg_temp.get_product_sold_counts(uuid[]) to anon, authenticated;

insert into pg_temp.products values
('00000000-0000-0000-0000-000000000001', 'active'),
('00000000-0000-0000-0000-000000000002', 'active'),
('00000000-0000-0000-0000-000000000003', 'active'),
('00000000-0000-0000-0000-000000000004', 'archived');
insert into pg_temp.orders values
('paid', '[{"product_id":"00000000-0000-0000-0000-000000000001","variation_id":"small","qty":2},{"product_id":"00000000-0000-0000-0000-000000000001","variation_id":"large","qty":3},{"product_id":"00000000-0000-0000-0000-000000000002","qty":6}]'),
('completed', '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":4},{"product_id":"00000000-0000-0000-0000-000000000004","qty":8}]'),
('pending', '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":100}]'),
('cancelled', '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":100}]'),
('refunded', '[{"product_id":"00000000-0000-0000-0000-000000000001","qty":100}]'),
('paid', '[]'), ('completed', null);

alter table pg_temp.orders enable row level security;
-- Deliberately no public order policy or table grants.
do $$ begin
  assert has_function_privilege('anon', 'public.get_product_sold_counts(uuid[])', 'execute'), 'Guest execute';
  assert has_function_privilege('authenticated', 'public.get_product_sold_counts(uuid[])', 'execute'), 'Buyer execute';
  assert not exists (
    select 1 from pg_proc p, lateral aclexplode(p.proacl) a
    where p.oid = 'public.get_product_sold_counts(uuid[])'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ), 'No implicit PUBLIC grant';
  assert (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.get_product_sold_counts(uuid[])'::regprocedure), 'Definer with fixed empty search path';
end; $$;

set local role anon;
do $$
declare requested uuid[] := array[
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000003'::uuid,
  '00000000-0000-0000-0000-000000000004'::uuid,
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid
];
begin
  assert (select count(*) from pg_temp.get_product_sold_counts(requested)) = 3, 'Only requested active products, no duplicate results';
  assert (select sold_count from pg_temp.get_product_sold_counts(requested) where product_id = requested[1]) = 9, 'Sum units across sizes and paid/completed orders';
  assert (select sold_count from pg_temp.get_product_sold_counts(requested) where product_id = requested[2]) = 6, 'Keep product totals separate';
  assert (select sold_count from pg_temp.get_product_sold_counts(requested) where product_id = requested[3]) = 0, 'Include zero-sale products';
  assert (select count(*) from pg_temp.get_product_sold_counts('{}')) = 0, 'Empty request';
  assert (select count(*) from pg_temp.get_product_sold_counts(null)) = 0, 'Null request';
  assert (select count(*) from pg_temp.get_product_sold_counts(array[requested[2]])) = 1, 'Do not return unrequested products';
  begin
    perform * from pg_temp.orders;
    raise exception 'Guest could read orders';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
set local role authenticated;
do $$ begin
  assert (select sold_count from pg_temp.get_product_sold_counts(array['00000000-0000-0000-0000-000000000001'::uuid])) = 9, 'Buyer aggregate';
  begin
    perform * from pg_temp.orders;
    raise exception 'Buyer could read private orders';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
