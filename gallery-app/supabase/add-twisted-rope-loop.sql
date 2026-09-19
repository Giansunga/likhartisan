-- Idempotent rollout seed for the code-owned Twisted Rope Loop recipe.
-- Active by default so it is immediately available in the Freeform handle catalog.
insert into public.generated_attachment_catalog_settings
  (recipe_key, active, default_price, default_production_days)
values
  ('twisted-rope-loop', true, 0, 0)
on conflict (recipe_key) do update
set active = true;
