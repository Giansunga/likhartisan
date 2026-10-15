-- Public storefront aggregate. No order rows or buyer information are returned.
-- SECURITY DEFINER is intentional: orders stay private under their existing RLS.
create or replace function public.get_product_sold_counts(p_product_ids uuid[])
returns table (product_id uuid, sold_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select p.id
    from public.products p
    where p.id = any(p_product_ids) and p.status = 'active'
  ), totals as (
    select item->>'product_id' as id, sum((item->>'qty')::integer)::bigint as units
    from public.orders o
    cross join lateral jsonb_array_elements(o.items) as item
    where o.status in ('paid', 'completed')
      and item->>'product_id' in (select id::text from requested)
    group by item->>'product_id'
  )
  select requested.id, coalesce(totals.units, 0)::bigint
  from requested
  left join totals on totals.id = requested.id::text;
$$;

revoke all on function public.get_product_sold_counts(uuid[]) from public;
grant execute on function public.get_product_sold_counts(uuid[]) to anon, authenticated;
