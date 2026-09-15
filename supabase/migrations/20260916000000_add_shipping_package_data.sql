-- Authoritative courier inputs. Values are stored in the units used for
-- transport calculations: integer grams and packed inches.
begin;

alter table public.products
  add column if not exists product_weight_g integer,
  add column if not exists packaging_weight_g integer,
  add column if not exists shipping_weight_g integer,
  add column if not exists shipping_length_in numeric(10,2),
  add column if not exists shipping_width_in numeric(10,2),
  add column if not exists shipping_height_in numeric(10,2);

alter table public.product_variations
  add column if not exists product_weight_g integer,
  add column if not exists packaging_weight_g integer,
  add column if not exists shipping_weight_g integer,
  add column if not exists shipping_length_in numeric(10,2),
  add column if not exists shipping_width_in numeric(10,2),
  add column if not exists shipping_height_in numeric(10,2);

alter table public.products
  drop constraint if exists products_shipping_weight_g_nonnegative,
  drop constraint if exists products_product_weight_g_nonnegative,
  drop constraint if exists products_packaging_weight_g_nonnegative,
  drop constraint if exists products_shipping_dimensions_positive;

alter table public.products
  add constraint products_shipping_weight_g_nonnegative check (shipping_weight_g is null or shipping_weight_g >= 0),
  add constraint products_product_weight_g_nonnegative check (product_weight_g is null or product_weight_g >= 0),
  add constraint products_packaging_weight_g_nonnegative check (packaging_weight_g is null or packaging_weight_g >= 0),
  add constraint products_shipping_dimensions_positive check (
    (shipping_length_in is null and shipping_width_in is null and shipping_height_in is null)
    or (shipping_length_in > 0 and shipping_width_in > 0 and shipping_height_in > 0)
  );

alter table public.product_variations
  drop constraint if exists product_variations_shipping_weight_g_nonnegative,
  drop constraint if exists product_variations_product_weight_g_nonnegative,
  drop constraint if exists product_variations_packaging_weight_g_nonnegative,
  drop constraint if exists product_variations_shipping_dimensions_positive;

alter table public.product_variations
  add constraint product_variations_shipping_weight_g_nonnegative check (shipping_weight_g is null or shipping_weight_g >= 0),
  add constraint product_variations_product_weight_g_nonnegative check (product_weight_g is null or product_weight_g >= 0),
  add constraint product_variations_packaging_weight_g_nonnegative check (packaging_weight_g is null or packaging_weight_g >= 0),
  add constraint product_variations_shipping_dimensions_positive check (
    (shipping_length_in is null and shipping_width_in is null and shipping_height_in is null)
    or (shipping_length_in > 0 and shipping_width_in > 0 and shipping_height_in > 0)
  );

alter table public.orders
  add column if not exists shipping_quote_snapshot jsonb,
  add column if not exists shipment_fingerprint text,
  add column if not exists shipping_service_type text,
  add column if not exists shipping_distance_m integer,
  add column if not exists shipping_total_weight_g integer,
  add column if not exists shipping_total_volume_cm3 numeric;

commit;

