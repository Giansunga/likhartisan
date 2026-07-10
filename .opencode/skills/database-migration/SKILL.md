---
name: database-migration
description: Create and apply Supabase database migrations for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: supabase
---

## What I do
- Create SQL migration files for Supabase
- Follow the naming convention: `add-<table/column>.sql` or `fix-<issue>.sql`
- Always include RLS policies for new tables
- Use `is_admin()` and `is_shop_owner(shop_id)` helper functions for access control
- Test migrations are idempotent (safe to re-run)

## When to use me
Use this when adding new tables, columns, or modifying RLS policies.

## Schema conventions
- Primary key: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- Timestamps: `created_at TIMESTAMPTZ DEFAULT NOW()`
- Foreign keys: `REFERENCES table_name(id) ON DELETE CASCADE`
- Always enable RLS: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY`

## RLS pattern
```sql
-- Public read
CREATE POLICY "Public can view X" ON X FOR SELECT USING (true);

-- Owner only
CREATE POLICY "Users can manage own X" ON X FOR ALL USING (auth.uid() = user_id);

-- Admin only
CREATE POLICY "Admin can manage X" ON X FOR ALL USING (is_admin());

-- Shop owner
CREATE POLICY "Shop owners can manage X" ON X FOR ALL USING (is_shop_owner(shop_id));
```
