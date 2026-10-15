-- Run after the product_tags_and_suggestions migration.
-- Fixtures and the cloned invoker function are isolated from the live catalog.
begin;
create temporary table products (like public.products including defaults);
set local search_path = '';
do $$ begin
  execute replace(replace(
    pg_get_functiondef('public.get_product_suggestions(uuid,text,integer)'::regprocedure),
    'public.products', 'pg_temp.products'),
    'public.get_product_suggestions', 'pg_temp.get_product_suggestions');
end; $$;
revoke all on function pg_temp.get_product_suggestions(uuid,text,integer) from public;
grant execute on function pg_temp.get_product_suggestions(uuid,text,integer) to anon, authenticated;
insert into pg_temp.products (id, name, category, price, shop_id, shop_name, status, tags, created_at) values
('00000000-0000-0000-0000-000000000001', 'Viewed jar', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', array['clay','rustic'], '2026-01-01'),
('00000000-0000-0000-0000-000000000002', 'Two shared tags', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', array['rustic','clay'], '2026-01-01'),
('00000000-0000-0000-0000-000000000003', 'One shared tag', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', array['clay'], '2026-03-01'),
('00000000-0000-0000-0000-000000000004', 'Category fallback', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', '{}', '2026-04-01'),
('00000000-0000-0000-0000-000000000005', 'Other shop match', 'Jars', 10, '00000000-0000-0000-0000-000000000200', 'Other shop', 'active', array['clay'], '2026-03-01'),
('00000000-0000-0000-0000-000000000006', 'Wrong category', 'Vases', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', array['rustic','clay'], '2026-05-01'),
('00000000-0000-0000-0000-000000000007', 'Archived', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'archived', array['rustic','clay'], '2026-05-01'),
('00000000-0000-0000-0000-000000000008', 'No shop', 'Jars', 10, null, 'No shop', 'active', array['rustic','clay'], '2026-05-01'),
('00000000-0000-0000-0000-000000000009', 'Tie after 3', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', array['clay'], '2026-03-01'),
('00000000-0000-0000-0000-000000000010', 'Older tagged match', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active', array['clay'], '2026-02-01'),
('00000000-0000-0000-0000-000000000011', 'Draft', 'Jars', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'draft', array['clay'], '2026-05-01');

do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'same');
  assert ids = array[
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000009'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000004'::uuid
  ], 'Tag counts, newest ties, ID ties, fallback and exclusions';
  select array_agg(id) into ids from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'different');
  assert ids = array['00000000-0000-0000-0000-000000000005'::uuid], 'Different shops must be strictly separated';
  assert (select count(*) from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'same', 1)) = 1, 'Custom limit';
  assert (select count(*) from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'same', 0)) = 0, 'Zero limit';
  assert (select count(*) from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000008', 'same')) = 0, 'Missing shop';
  assert (select count(*) from pg_temp.get_product_suggestions('ffffffff-ffff-ffff-ffff-ffffffffffff', 'same')) = 0, 'Missing product';
  begin
    perform pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'invalid');
    raise exception 'Invalid scope accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Untagged viewed products retain category-only recommendations.
update pg_temp.products set tags = '{}' where id = '00000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select id from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'same', 1)) = '00000000-0000-0000-0000-000000000004'::uuid, 'Untagged source fallback';
end; $$;

insert into pg_temp.products (id, name, category, price, shop_id, shop_name, status)
select ('10000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'Legacy fixture ' || i,
  (array['Others','Bowls','Tea Light Vases','Teapots','Plates'])[1 + (i % 5)], 10,
  '00000000-0000-0000-0000-000000000100'::uuid, 'Fixture shop', 'active'
from generate_series(1, 12) as i;
do $$ begin
  assert (select count(*) from pg_temp.get_product_suggestions('10000000-0000-0000-0000-000000000001', 'same', 100)) = 8, 'Legacy aliases and maximum limit';
  assert (select bool_and(category in ('Others','Bowls','Tea Light Vases','Teapots','Plates')) from pg_temp.get_product_suggestions('10000000-0000-0000-0000-000000000001', 'same')),
    'Legacy categories cannot leak other categories';
end; $$;

insert into pg_temp.products (id, name, category, price, shop_id, shop_name, status) values
('20000000-0000-0000-0000-000000000001', 'Amphora', 'Amphoras', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active'),
('20000000-0000-0000-0000-000000000002', 'Decorative match', 'Decorative Pieces', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active'),
('20000000-0000-0000-0000-000000000003', 'No category', '', 10, '00000000-0000-0000-0000-000000000100', 'Fixture shop', 'active');
do $$ begin
  assert (select id from pg_temp.get_product_suggestions('20000000-0000-0000-0000-000000000001', 'same')) = '20000000-0000-0000-0000-000000000002'::uuid, 'Amphoras map to Decorative Pieces';
  assert (select count(*) from pg_temp.get_product_suggestions('20000000-0000-0000-0000-000000000003', 'same')) = 0, 'Missing category';
end; $$;

-- Exercise the same invoker function with restricted rows and both API roles.
alter table pg_temp.products enable row level security;
create policy fixture_public_read on pg_temp.products for select to anon, authenticated
  using (name <> 'Two shared tags');
do $$ begin
  execute format('grant usage on schema %I to anon, authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end; $$;
grant select on pg_temp.products to anon, authenticated;
set local role anon;
do $$ begin
  assert not exists (select 1 from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'same') where name = 'Two shared tags'), 'Invoker must honor anon RLS';
  assert (select count(*) from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'different')) = 1, 'Anon reads';
end; $$;
reset role;
set local role authenticated;
do $$ begin
  assert not exists (select 1 from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'same') where name = 'Two shared tags'), 'Invoker must honor authenticated RLS';
  assert (select count(*) from pg_temp.get_product_suggestions('00000000-0000-0000-0000-000000000001', 'different')) = 1, 'Authenticated reads';
end; $$;
reset role;
rollback;
