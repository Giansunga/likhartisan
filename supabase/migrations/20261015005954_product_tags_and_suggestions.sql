-- Additive rollout: apply before the frontend. Old writers can omit tags.
-- Rollback: restore the old frontend; retain this column and its saved data.
alter table public.products
  add column if not exists tags text[] not null default '{}'::text[];

create or replace function public.get_product_suggestions(
  p_product_id uuid,
  p_shop_scope text,
  p_limit integer default 8
)
returns setof public.products
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_shop_scope is null or p_shop_scope not in ('same', 'different') then
    raise exception 'Shop scope must be same or different.' using errcode = '22023';
  end if;

  return query
  select candidate.*
  from public.products as source
  join public.products as candidate
    on candidate.id <> source.id
    and candidate.status = 'active'
    and candidate.shop_id is not null
    and candidate.category = any (
      -- Keep aligned with normalizeProductCategory/storedProductCategories.
      case
        when source.category in ('Decorative Pieces', 'Amphoras')
          then array['Decorative Pieces', 'Amphoras']
        when source.category in ('Others', 'Tea Light Vases', 'Bowls', 'Teapots', 'Plates')
          then array['Others', 'Tea Light Vases', 'Bowls', 'Teapots', 'Plates']
        else array[source.category]
      end
    )
    and (
      (p_shop_scope = 'same' and candidate.shop_id = source.shop_id)
      or (p_shop_scope = 'different' and candidate.shop_id <> source.shop_id)
    )
  where source.id = p_product_id
    and source.shop_id is not null
    and nullif(btrim(source.category), '') is not null
  order by (
    select count(*) from (
      select unnest(candidate.tags)
      intersect
      select unnest(source.tags)
    ) as shared_tags
  ) desc, candidate.created_at desc nulls last, candidate.id asc
  limit greatest(0, least(coalesce(p_limit, 8), 8));
end;
$$;

revoke all on function public.get_product_suggestions(uuid, text, integer) from public;
grant execute on function public.get_product_suggestions(uuid, text, integer) to anon, authenticated, service_role;
