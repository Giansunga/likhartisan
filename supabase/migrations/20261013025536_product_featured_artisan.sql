-- Existing products remain unassigned until their next admin edit.
alter table public.products
  add column featured_artisan_id uuid
  references public.artisans(id) on delete set null;

create index products_featured_artisan_id_idx on public.products(featured_artisan_id);

create function public.validate_product_featured_artisan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.featured_artisan_id is not null then
    perform 1 from public.artisans
      where id = new.featured_artisan_id and shop_id = new.shop_id
      for share;
    if not found then
      raise exception 'Featured Artisan must belong to the product shop.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger products_validate_featured_artisan
before insert or update of featured_artisan_id, shop_id on public.products
for each row execute function public.validate_product_featured_artisan();
