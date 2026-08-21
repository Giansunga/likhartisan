-- Preserve the original aggregation implementation as a private helper, then
-- expose the same admin RPC with a previous, equal-length period summary.
alter function public.admin_commerce_analytics(date, date, text, uuid, text)
  rename to admin_commerce_analytics_base;

revoke all on function public.admin_commerce_analytics_base(date, date, text, uuid, text)
  from public, anon;
grant execute on function public.admin_commerce_analytics_base(date, date, text, uuid, text)
  to authenticated;

create function public.admin_commerce_analytics(
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
  v_current jsonb;
  v_previous jsonb;
  v_days integer;
begin
  if not public.is_super_admin() then
    raise exception 'Admin analytics requires a super_admin role' using errcode = '42501';
  end if;

  v_current := public.admin_commerce_analytics_base(
    p_start_date, p_end_date, p_granularity, p_shop_id, p_order_type
  );

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    return jsonb_set(v_current, '{comparisonSummary}', 'null'::jsonb, true);
  end if;

  v_days := (p_end_date - p_start_date) + 1;
  v_previous := public.admin_commerce_analytics_base(
    p_start_date - v_days,
    p_start_date - 1,
    p_granularity,
    p_shop_id,
    p_order_type
  );

  return jsonb_set(v_current, '{comparisonSummary}', coalesce(v_previous -> 'summary', 'null'::jsonb), true);
end;
$$;

revoke all on function public.admin_commerce_analytics(date, date, text, uuid, text) from public, anon;
grant execute on function public.admin_commerce_analytics(date, date, text, uuid, text) to authenticated;
