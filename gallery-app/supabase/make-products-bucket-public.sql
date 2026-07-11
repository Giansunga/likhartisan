-- Make the 'products' storage bucket public so uploaded chat/product images
-- are viewable by both buyer and seller (URLs returned by storage.getPublicUrl
-- only resolve when the bucket is public).
update storage.buckets
set public = true
where name = 'products';

-- Ensure a permissive read policy exists on objects in the products bucket
-- (public buckets still need a SELECT policy for the anon/public role).
insert into storage.policies (name, bucket_id, definition, action)
select 'Public read products', 'products', 'true', 'SELECT'
where not exists (
  select 1 from storage.policies
  where bucket_id = 'products' and action = 'SELECT' and name = 'Public read products'
);
