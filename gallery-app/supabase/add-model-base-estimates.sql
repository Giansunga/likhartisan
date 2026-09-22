-- Additive model metadata for the provisional Freeform estimate. Existing rows remain
-- incomplete until the separately reviewed test-data reset or an admin edit.
alter table public.models_3d
  add column if not exists base_height_in numeric(5,2),
  add column if not exists base_body_width_in numeric(5,2),
  add column if not exists base_neck_width_in numeric(5,2),
  add column if not exists base_rim_size_in numeric(5,2),
  add column if not exists base_price_php numeric(12,2),
  add column if not exists base_production_days integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'models_3d_base_height_range') then
    alter table public.models_3d add constraint models_3d_base_height_range check (base_height_in between 2 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'models_3d_base_body_width_range') then
    alter table public.models_3d add constraint models_3d_base_body_width_range check (base_body_width_in between 2 and 16);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'models_3d_base_neck_width_range') then
    alter table public.models_3d add constraint models_3d_base_neck_width_range check (base_neck_width_in between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'models_3d_base_rim_size_range') then
    alter table public.models_3d add constraint models_3d_base_rim_size_range check (base_rim_size_in between 1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'models_3d_base_price_range') then
    alter table public.models_3d add constraint models_3d_base_price_range check (base_price_php > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'models_3d_base_production_days_range') then
    alter table public.models_3d add constraint models_3d_base_production_days_range check (base_production_days between 1 and 365);
  end if;
end $$;
