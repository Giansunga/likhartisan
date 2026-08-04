-- Idempotent rollout seed for the code-owned Round Loop Handle recipe.
-- It remains hidden until a super admin configures and activates it.
insert into public.generated_attachment_catalog_settings
  (recipe_key, active, default_price, default_production_days)
values
  ('round-loop-handle', false, 0, 0)
on conflict (recipe_key) do nothing;
