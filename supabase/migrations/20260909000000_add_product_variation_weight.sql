-- Store an optional shipping/display weight for each sellable product variation.
ALTER TABLE public.product_variations
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,3);

ALTER TABLE public.product_variations
  DROP CONSTRAINT IF EXISTS product_variations_weight_kg_nonnegative;

ALTER TABLE public.product_variations
  ADD CONSTRAINT product_variations_weight_kg_nonnegative
  CHECK (weight_kg IS NULL OR weight_kg >= 0);
