Database Migrations — LikhArtisan
====================================

MIGRATION ORDER (run in this sequence on a fresh Supabase project):

   1. 000-master-schema.sql    ← All tables, indexes, constraints, storage bucket
   2. FIX-RLS.sql               ← Row Level Security policies (run AFTER schema)
   3. add-user-roles.sql        ← RBAC: user_roles table, helper funcs, role-seeded policies

OPTIONAL / INCREMENTAL FILES (for existing databases, column additions):

  enable-realtime.sql              Enable Supabase Realtime for chat
  add-shop-followers.sql           Shop followers table (included in master)
  add-theme-settings.sql           Theme settings table (included in master)
  add-models-3d-table.sql          3D models table (included in master)
  add-artisans-table.sql           Artisans table (included in master)
  add-designs-table.sql            Freeform designs table (included in master)
  add-notifications-table.sql      Notifications table (included in master)
  add-product-variations.sql       Product variations table (included in master)
  add-product-reviews.sql          Product reviews table (included in master)
  add-product-detail-columns.sql   Height/diameter/technique columns (in master)
  add-views-column.sql             Product views column (in master)
  add-payment-status-column.sql    Payment status column (in master)
  add-lalamove-quote-id.sql        Lalamove quote ID column (in master)
  add-buyer-profile-to-conversations.sql  Buyer name/avatar (in master)
  add-location-column.sql          Shop location column (in master)
  add-review-seller-ratings.sql    Seller/delivery ratings (in master)
  add-review-images.sql            Review images array (in master)

FIX / RESET FILES (run only when troubleshooting):

  FIX-ALL.sql     Fixes constraints, adds missing columns
  FIX-RLS.sql     Full RLS policy replacement
  delete-old-orders.sql    Remove stale orders
  RESET-ORDERS.sql         Reset all orders (keeps 1 completed)
  RESET-ALL-ORDERS.sql     Reset ALL orders, no exceptions

LEGACY (original schema, do not use):

  schema.sql          ← Superseded by 000-master-schema.sql
  migration.sql       ← Superseded by 000-master-schema.sql
