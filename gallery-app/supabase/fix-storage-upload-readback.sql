-- Supabase Storage uploads insert object metadata with RETURNING *.
-- The products bucket is public for delivery, but authenticated uploaders still
-- need a SELECT policy that can read back the metadata row they just created.
drop policy if exists "storage_select_own_products" on storage.objects;

create policy "storage_select_own_products"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'products'
    and owner_id = (select auth.uid()::text)
  );
