-- Paused listings stay in My Listings and can be activated again.
-- Keep this expanded constraint on application rollback to preserve paused products.
set lock_timeout = '5s';

alter table public.products
  drop constraint if exists products_status_check,
  add constraint products_status_check
    check (status in ('active', 'inactive', 'archived', 'draft'));
