-- CM -> inches measurement migration
--
-- This is the expand step. Existing catalog and saved-design rows are marked
-- as centimeters so mixed-version clients can convert them safely at read
-- time. New writes use inches. No old numeric value is overwritten here;
-- conversion of arbitrary catalog text is intentionally owned by the app's
-- compatibility layer and can be verified before a later contract migration.

begin;

alter table public.products
  add column if not exists measurement_unit text;

update public.products
set measurement_unit = 'cm'
where measurement_unit is null;

alter table public.products
  alter column measurement_unit set default 'in',
  alter column measurement_unit set not null;

alter table public.product_variations
  add column if not exists measurement_unit text;

update public.product_variations
set measurement_unit = 'cm'
where measurement_unit is null;

alter table public.product_variations
  alter column measurement_unit set default 'in',
  alter column measurement_unit set not null;

alter table public.designs
  add column if not exists measurement_unit text;

update public.designs
set measurement_unit = 'cm'
where measurement_unit is null;

alter table public.designs
  alter column measurement_unit set default 'in',
  alter column measurement_unit set not null;

commit;
