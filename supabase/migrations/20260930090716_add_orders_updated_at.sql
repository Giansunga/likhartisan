-- The custom-order production RPC records the order update time.
alter table public.orders
  add column if not exists updated_at timestamptz not null default now();
