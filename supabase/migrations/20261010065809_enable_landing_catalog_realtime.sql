-- Landing metrics refetch public, RLS-filtered counts after catalog changes.
-- No table policies, data, replica identity, or private portal broadcasts change.
do $$
declare
  source_table text;
begin
  foreach source_table in array array['artisans', 'products'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = source_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', source_table);
    end if;
  end loop;
end;
$$;

-- Verification (read-only):
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime'
--   and schemaname = 'public' and tablename in ('artisans', 'products');
-- Rollback: DROP TABLE from this publication only for tables newly added above;
-- retain any membership that existed before applying this migration.
-- Both tables were absent in the verified LikhArtisan project before this update.
-- For that project: ALTER PUBLICATION supabase_realtime DROP TABLE public.artisans, public.products;
