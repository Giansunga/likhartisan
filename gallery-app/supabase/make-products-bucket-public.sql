-- Make the 'products' storage bucket public so uploaded chat/product images
-- are viewable by both buyer and seller (URLs returned by storage.getPublicUrl
-- only resolve when the bucket is public).
update storage.buckets
set public = true
where name = 'products';

-- Permissive public READ policy on objects in the products bucket (idempotent).
-- In current Supabase, storage policies are PostgreSQL RLS policies on
-- storage.objects (there is no storage.policies table).
drop policy if exists "Public read products" on storage.objects;
create policy "Public read products"
  on storage.objects for select
  using ( bucket_id = 'products' );
