-- Admin commerce analytics and paginated CSV report data.
-- All timestamps are grouped in Philippine time (Asia/Manila).

create index if not exists idx_orders_admin_analytics
  on public.orders (created_at desc, payment_status, status, delivery_status);

create or replace function public.admin_commerce_analytics(
  p_start_date date default null,
  p_end_date date default null,
  p_granularity text default 'month',
  p_shop_id uuid default null,
  p_order_type text default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_start timestamptz := case when p_start_date is null then null else (p_start_date::timestamp at time zone 'Asia/Manila') end;
  v_end timestamptz := case when p_end_date is null then null else ((p_end_date + 1)::timestamp at time zone 'Asia/Manila') end;
  v_bucket text := case when p_granularity in ('day', 'week', 'month') then p_granularity else 'month' end;
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Admin analytics requires a super_admin role' using errcode = '42501';
  end if;

  with filtered as materialized (
    select o.*
    from public.orders o
    where (v_start is null or o.created_at >= v_start)
      and (v_end is null or o.created_at < v_end)
      and (p_order_type is null or coalesce(o.order_type, 'product') = p_order_type)
      and (p_shop_id is null or exists (
        select 1 from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) i
        where coalesce(i->>'shop_id', i->>'shopId') = p_shop_id::text
      ))
  ), paid as materialized (
    select * from filtered where payment_status = 'paid' or status in ('paid', 'completed')
  ), normalized_items as materialized (
    select p.id as order_id, p.created_at, p.total,
      coalesce(i->>'product_id', i->>'productId') as product_id,
      coalesce(i->>'product_name', i->>'productName', 'Custom order') as product_name,
      coalesce(i->>'shop_id', i->>'shopId') as shop_id,
      coalesce(i->>'shop_name', i->>'shopName', 'Unknown shop') as shop_name,
      greatest(coalesce(nullif(i->>'qty', '')::numeric, nullif(i->>'quantity', '')::numeric, 1), 0) as quantity,
      greatest(coalesce(nullif(i->>'price', '')::numeric, 0), 0) as unit_price
    from paid p cross join lateral jsonb_array_elements(coalesce(p.items, '[]'::jsonb)) i
  ), summary as (
    select
      coalesce(sum(total), 0) as gross_revenue,
      coalesce(sum(case when refund_status = 'refunded' then coalesce(refund_amount, 0) else 0 end), 0) as refunds,
      count(*) as paid_orders,
      count(distinct user_id) filter (where user_id is not null) as customers,
      count(*) filter (where status = 'cancelled') as cancelled_orders,
      count(*) filter (where coalesce(is_problematic, false)) as problematic_orders
    from paid
  ), customers as (
    select distinct user_id from paid where user_id is not null
  ), repeat_customers as (
    select count(*) as count from customers c
    where (select count(*) from public.orders o where o.user_id = c.user_id) >= 2
  ), series as (
    select date_trunc(v_bucket, created_at at time zone 'Asia/Manila')::date as period,
      coalesce(sum(total), 0) as gross_revenue,
      coalesce(sum(case when refund_status = 'refunded' then coalesce(refund_amount, 0) else 0 end), 0) as refunds,
      count(*) as orders
    from paid group by 1 order by 1
  ), product_rank as (
    select product_id, max(product_name) as name, max(shop_name) as shop_name,
      sum(quantity) as units_sold, sum(quantity * unit_price) as revenue, count(distinct order_id) as orders
    from normalized_items group by product_id order by revenue desc nulls last limit 10
  ), shop_rank as (
    select shop_id, max(shop_name) as name, sum(quantity * unit_price) as revenue,
      sum(quantity) as units_sold, count(distinct order_id) as orders
    from normalized_items group by shop_id order by revenue desc nulls last limit 10
  ), category_rank as (
    select coalesce(pr.category, 'Uncategorised') as name, sum(ni.quantity * ni.unit_price) as revenue,
      sum(ni.quantity) as units_sold, coalesce(sum(pr.views), 0) as views
    from normalized_items ni left join public.products pr on pr.id::text = ni.product_id
    group by 1 order by revenue desc nulls last limit 10
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'grossRevenue', s.gross_revenue, 'refunds', s.refunds, 'netRevenue', s.gross_revenue - s.refunds,
      'paidOrders', s.paid_orders, 'averageOrderValue', case when s.paid_orders = 0 then 0 else (s.gross_revenue - s.refunds) / s.paid_orders end,
      'purchasingCustomers', s.customers, 'repeatCustomers', rc.count,
      'repeatCustomerRate', case when s.customers = 0 then 0 else rc.count::numeric / s.customers end,
      'cancellationRate', case when s.paid_orders = 0 then 0 else s.cancelled_orders::numeric / s.paid_orders end,
      'problematicOrders', s.problematic_orders
    ),
    'series', coalesce((select jsonb_agg(jsonb_build_object('period', period, 'grossRevenue', gross_revenue, 'refunds', refunds, 'netRevenue', gross_revenue - refunds, 'orders', orders) order by period) from series), '[]'::jsonb),
    'paymentStatuses', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(payment_status, 'pending'), 'value', count) order by count desc) from (select payment_status, count(*) from filtered group by payment_status) x), '[]'::jsonb),
    'deliveryStatuses', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(delivery_status, 'pending'), 'value', count) order by count desc) from (select delivery_status, count(*) from filtered group by delivery_status) x), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(product_rank)) from product_rank), '[]'::jsonb),
    'shops', coalesce((select jsonb_agg(to_jsonb(shop_rank)) from shop_rank), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(category_rank)) from category_rank), '[]'::jsonb)
  ) into v_result from summary s cross join repeat_customers rc;
  return v_result;
end;
$$;

revoke all on function public.admin_commerce_analytics(date, date, text, uuid, text) from public, anon;
grant execute on function public.admin_commerce_analytics(date, date, text, uuid, text) to authenticated;
