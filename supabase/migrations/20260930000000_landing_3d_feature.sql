create table if not exists public.landing_3d_feature (
  id text primary key default 'current' check (id = 'current'),
  model_id uuid not null references public.models_3d(id) on delete restrict,
  visual_keyframes jsonb not null check (jsonb_typeof(visual_keyframes) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.landing_3d_feature enable row level security;

-- Grants are explicit because new public tables are not always exposed to the Data API.
revoke all on public.landing_3d_feature from anon, authenticated;
grant select on public.landing_3d_feature to anon, authenticated;
grant insert, update on public.landing_3d_feature to authenticated;

create policy "Anyone can read the landing 3D feature"
  on public.landing_3d_feature for select
  to anon, authenticated
  using (true);

create policy "Admins can create the landing 3D feature"
  on public.landing_3d_feature for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can update the landing 3D feature"
  on public.landing_3d_feature for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
