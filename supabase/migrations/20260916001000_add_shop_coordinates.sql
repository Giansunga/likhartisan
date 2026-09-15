-- Cache the artisan pickup pin so checkout does not have to geocode the same
-- address on every quotation request. Existing addresses continue to work via
-- the checkout geocoder until these values are populated.
begin;

alter table public.shops
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table public.shops
  drop constraint if exists shops_coordinates_pair,
  add constraint shops_coordinates_pair check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );

commit;

