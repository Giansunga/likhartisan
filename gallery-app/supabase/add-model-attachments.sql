-- Version 3: code-generated procedural attachments.
-- Legacy attachment tables remain physically intact for rollback, but lose Data API grants.

begin;

alter table public.designs
  add column if not exists attachment_params jsonb not null default '[]'::jsonb,
  add column if not exists model_id uuid references public.models_3d(id) on delete set null;

-- Intentional clean rollout: discard legacy/mixed payloads while keeping this
-- migration safe to replay after valid v3 designs have been saved.
update public.designs
set attachment_params = '[]'::jsonb
where attachment_params <> '[]'::jsonb
  and case
    when jsonb_typeof(attachment_params) = 'array' then exists (
      select 1
      from jsonb_array_elements(attachment_params) item
      where item ->> 'version' is distinct from '3'
    )
    else true
  end;

create table if not exists public.generated_attachment_catalog_settings (
  recipe_key text primary key,
  active boolean not null default false,
  default_price numeric(12,2) not null default 0 check (default_price >= 0),
  default_production_days integer not null default 0 check (default_production_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_attachment_shop_overrides (
  recipe_key text not null references public.generated_attachment_catalog_settings(recipe_key) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  enabled boolean not null default true,
  price_adjustment numeric(12,2) check (price_adjustment is null or price_adjustment >= 0),
  production_days_adjustment integer check (production_days_adjustment is null or production_days_adjustment >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recipe_key, shop_id)
);

create index if not exists idx_generated_attachment_shop_lookup
  on public.generated_attachment_shop_overrides(shop_id, recipe_key, enabled);
create index if not exists idx_generated_attachment_active
  on public.generated_attachment_catalog_settings(active, recipe_key);
create index if not exists idx_designs_model_id
  on public.designs(model_id);

create or replace function public.set_generated_attachment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_generated_attachment_catalog_updated_at on public.generated_attachment_catalog_settings;
create trigger set_generated_attachment_catalog_updated_at
before update on public.generated_attachment_catalog_settings
for each row execute function public.set_generated_attachment_updated_at();

drop trigger if exists set_generated_attachment_override_updated_at on public.generated_attachment_shop_overrides;
create trigger set_generated_attachment_override_updated_at
before update on public.generated_attachment_shop_overrides
for each row execute function public.set_generated_attachment_updated_at();

insert into public.generated_attachment_catalog_settings
  (recipe_key, active, default_price, default_production_days)
values
  ('bamboo-loop', false, 0, 0),
  ('square-bridge', false, 0, 0),
  ('round-loop-handle', false, 0, 0),
  ('sampaguita-medallion', false, 0, 0),
  ('faceted-disc', false, 0, 0),
  ('banig-diamond-crest', false, 0, 0),
  ('minimal-collar-bar', false, 0, 0)
on conflict (recipe_key) do nothing;

alter table public.generated_attachment_catalog_settings enable row level security;
alter table public.generated_attachment_shop_overrides enable row level security;

drop policy if exists generated_attachment_catalog_public_read on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_catalog_anon_read on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_catalog_authenticated_read on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_catalog_admin_manage on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_catalog_admin_insert on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_catalog_admin_update on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_catalog_admin_delete on public.generated_attachment_catalog_settings;
drop policy if exists generated_attachment_overrides_public_read on public.generated_attachment_shop_overrides;
drop policy if exists generated_attachment_overrides_admin_manage on public.generated_attachment_shop_overrides;
drop policy if exists generated_attachment_overrides_admin_insert on public.generated_attachment_shop_overrides;
drop policy if exists generated_attachment_overrides_admin_update on public.generated_attachment_shop_overrides;
drop policy if exists generated_attachment_overrides_admin_delete on public.generated_attachment_shop_overrides;

create policy generated_attachment_catalog_anon_read
on public.generated_attachment_catalog_settings for select
to anon
using (active = true);

create policy generated_attachment_catalog_authenticated_read
on public.generated_attachment_catalog_settings for select
to authenticated
using (
  active = true or exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

create policy generated_attachment_catalog_admin_insert
on public.generated_attachment_catalog_settings for insert
to authenticated
with check (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

create policy generated_attachment_catalog_admin_update
on public.generated_attachment_catalog_settings for update
to authenticated
using (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
)
with check (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

create policy generated_attachment_catalog_admin_delete
on public.generated_attachment_catalog_settings for delete
to authenticated
using (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

create policy generated_attachment_overrides_public_read
on public.generated_attachment_shop_overrides for select
to anon, authenticated
using (true);

create policy generated_attachment_overrides_admin_insert
on public.generated_attachment_shop_overrides for insert
to authenticated
with check (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

create policy generated_attachment_overrides_admin_update
on public.generated_attachment_shop_overrides for update
to authenticated
using (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
)
with check (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

create policy generated_attachment_overrides_admin_delete
on public.generated_attachment_shop_overrides for delete
to authenticated
using (
  exists (
    select 1 from public.user_roles role_row
    where role_row.user_id = (select auth.uid()) and role_row.role = 'super_admin'
  )
  or lower(coalesce((select auth.jwt() ->> 'email'), '')) in (
    'giansunga396@gmail.com', 'deang.elaizah0505@gmail.com', 'samuellelucas20@gmail.com'
  )
);

revoke all privileges on table public.generated_attachment_catalog_settings from anon, authenticated;
revoke all privileges on table public.generated_attachment_shop_overrides from anon, authenticated;
grant select on table public.generated_attachment_catalog_settings to anon;
grant select on table public.generated_attachment_shop_overrides to anon;
grant select, insert, update, delete on table public.generated_attachment_catalog_settings to authenticated;
grant select, insert, update, delete on table public.generated_attachment_shop_overrides to authenticated;

-- Disconnect every uploaded/manual attachment schema from the Data API without dropping data.
do $$
declare
  legacy_table text;
begin
  foreach legacy_table in array array[
    'model_attachments',
    'model_attachment_rules',
    'model_attachment_points',
    'attachment_assets'
  ]
  loop
    if to_regclass('public.' || legacy_table) is not null then
      execute format('revoke all privileges on table public.%I from anon, authenticated', legacy_table);
    end if;
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
