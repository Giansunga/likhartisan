-- Unified, append-only activity log for the admin portal.
-- The browser receives SELECT only; all writes are produced by trusted triggers.

create extension if not exists pgcrypto;
create schema if not exists private;

-- This is intentionally role-based rather than email- or user-metadata-based.
-- It is used by both the audit table and the private admin realtime topic.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text,
  actor_context text not null default 'system'
    check (actor_context in ('admin', 'artisan', 'buyer', 'system')),
  source text not null default 'database'
    check (source in ('admin_portal', 'artisan_portal', 'storefront', 'server', 'database', 'system', 'legacy')),
  category text not null,
  event_name text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  entity_type text,
  entity_id text,
  entity_label text,
  summary text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  legacy_source text,
  legacy_id uuid
);

create index if not exists activity_log_occurred_at_id_idx
  on public.activity_log (occurred_at desc, id desc);
create index if not exists activity_log_actor_time_idx
  on public.activity_log (actor_id, occurred_at desc) where actor_id is not null;
create index if not exists activity_log_context_time_idx
  on public.activity_log (actor_context, occurred_at desc);
create index if not exists activity_log_category_time_idx
  on public.activity_log (category, occurred_at desc);
create index if not exists activity_log_severity_time_idx
  on public.activity_log (severity, occurred_at desc);
create index if not exists activity_log_entity_time_idx
  on public.activity_log (entity_type, entity_id, occurred_at desc);
create unique index if not exists activity_log_legacy_source_id_idx
  on public.activity_log (legacy_source, legacy_id)
  where legacy_source is not null and legacy_id is not null;

alter table public.activity_log enable row level security;

revoke all on table public.activity_log from public, anon, authenticated;
grant select on table public.activity_log to authenticated;
grant select, insert on table public.activity_log to service_role;

drop policy if exists activity_log_super_admin_select on public.activity_log;
create policy activity_log_super_admin_select
  on public.activity_log
  for select
  to authenticated
  using ((select public.is_super_admin()));

-- Private channels require an explicit realtime.messages policy. Super admins
-- can receive only database-originated audit broadcasts; no browser write
-- policy is granted for this topic.
drop policy if exists activity_log_super_admin_realtime_select on realtime.messages;
create policy activity_log_super_admin_realtime_select
  on realtime.messages
  for select
  to authenticated
  using (
    (select realtime.topic()) = 'admin:portal'
    and (select public.is_super_admin())
    and realtime.messages.extension = 'broadcast'
  );

create or replace function private.activity_actor_context(actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when actor is null then 'system'
    when exists (
      select 1 from public.user_roles
      where user_id = actor and role = 'super_admin'
    ) then 'admin'
    when exists (
      select 1 from public.user_roles
      where user_id = actor and role = 'shop_owner'
    ) then 'artisan'
    else 'buyer'
  end;
$$;

create or replace function private.activity_actor_label(actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'User'
  )
  from auth.users u
  where u.id = actor;
$$;

-- Only retain fields that are safe and useful in an audit diff. Message bodies,
-- customer contact details, addresses, notes, tokens, and file contents never enter the log.
create or replace function private.activity_safe_row(table_name text, row_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed text[];
  result jsonb;
begin
  if row_data is null then return null; end if;

  allowed := case table_name
    when 'orders' then array['id','status','payment_status','delivery_status','delivery_option','refund_status','refund_amount','is_problematic','problem_type','problem_resolution','flagged_for_investigation','cancellation_approved','tracking_number','delivery_provider','order_type','subtotal','shipping_fee','total','created_at','updated_at']
    when 'products' then array['id','name','category','price','stock','in_stock','status','shop_id','shop_name','materials','dimensions','height','opening_diameter','technique','created_at','updated_at']
    when 'product_variations' then array['id','product_id','dimensions','height','opening_diameter','price','stock','sort_order','created_at','updated_at']
    when 'artisans' then array['id','name','shop_id','status','location','created_at','updated_at']
    when 'shops' then array['id','name','owner_id','status','location','auto_created','created_at','updated_at']
    when 'models_3d' then array['id','name','title','status','shop_id','product_id','category','created_at','updated_at']
    when 'designs' then array['id','name','status','shop_id','user_id','created_at','updated_at']
    when 'design_requests' then array['id','status','shop_id','buyer_id','artisan_id','quoted_price','revision_count','created_at','updated_at']
    when 'conversations' then array['id','buyer_id','shop_id','buyer_unread','artisan_unread','last_message_at','created_at','updated_at']
    when 'messages' then array['id','conversation_id','sender_id','created_at']
    when 'notifications' then array['id','user_id','type','title','read','is_read','recipient_context','order_id','conversation_id','created_at']
    when 'product_reviews' then array['id','product_id','user_id','rating','seller_service_rating','delivery_service_rating','created_at','updated_at']
    when 'user_roles' then array['id','user_id','role','shop_id','assigned_by','created_at']
    when 'theme_settings' then array['id','theme','active_theme','theme_name','auto_detect','updated_at','updated_by']
    when 'generated_attachment_catalog_settings' then array['id','recipe_key','catalog_key','active','enabled','default_price','default_production_days','updated_at']
    when 'generated_attachment_shop_overrides' then array['id','recipe_key','shop_id','catalog_key','enabled','price_adjustment','production_days_adjustment','updated_at']
    when 'profiles' then array['id','full_name','shop_name','created_at']
    when 'order_return_requests' then array['id','order_id','user_id','requested_resolution','status','reviewed_by','submitted_at','reviewed_at','created_at','updated_at']
    when 'order_return_items' then array['id','request_id','item_index','product_id','quantity']
    when 'order_return_evidence' then array['id','request_id','content_type','size_bytes','uploaded_at','created_at']
    when 'webhook_logs' then array['id','event_type','processed','created_at','processed_at']
    else array['id','status','created_at','updated_at']
  end;

  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  into result
  from jsonb_each(row_data) entry
  where entry.key = any(allowed);

  return result;
end;
$$;

create or replace function private.capture_activity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end;
  new_row jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end;
  current_row jsonb := coalesce(new_row, old_row, '{}'::jsonb);
  safe_old jsonb := private.activity_safe_row(TG_TABLE_NAME, old_row);
  safe_new jsonb := private.activity_safe_row(TG_TABLE_NAME, new_row);
  actor uuid := auth.uid();
  actor_context text;
  category_name text := coalesce(nullif(TG_ARGV[0], ''), TG_TABLE_NAME);
  event_value text;
  severity_value text := 'info';
  entity_value text := current_row ->> 'id';
  label_value text;
  summary_value text;
begin
  if TG_OP = 'UPDATE' and safe_old = safe_new then
    return null;
  end if;

  actor_context := private.activity_actor_context(actor);
  label_value := coalesce(
    nullif(current_row ->> 'name', ''),
    nullif(current_row ->> 'title', ''),
    nullif(current_row ->> 'product_name', ''),
    nullif(current_row ->> 'id', '')
  );

  event_value := case
    when TG_TABLE_NAME = 'orders' and TG_OP = 'INSERT' then 'order.created'
    when TG_TABLE_NAME = 'orders' and TG_OP = 'UPDATE' and old_row ->> 'payment_status' is distinct from new_row ->> 'payment_status' then 'payment.status_changed'
    when TG_TABLE_NAME = 'orders' and TG_OP = 'UPDATE' and old_row ->> 'delivery_status' is distinct from new_row ->> 'delivery_status' then 'delivery.status_changed'
    when TG_TABLE_NAME = 'orders' and TG_OP = 'UPDATE' and old_row ->> 'refund_status' is distinct from new_row ->> 'refund_status' then 'refund.status_changed'
    when TG_TABLE_NAME = 'orders' and TG_OP = 'UPDATE' and old_row ->> 'status' is distinct from new_row ->> 'status' then 'order.status_changed'
    when TG_TABLE_NAME = 'messages' and TG_OP = 'INSERT' then 'message.sent'
    when TG_TABLE_NAME = 'notifications' and TG_OP = 'INSERT' then 'notification.created'
    when TG_TABLE_NAME = 'user_roles' and TG_OP = 'INSERT' then 'role.assigned'
    when TG_TABLE_NAME = 'user_roles' and TG_OP = 'DELETE' then 'role.removed'
    else replace(category_name, '_', '.') || '.' || lower(TG_OP)
  end;

  severity_value := case
    when event_value in ('role.assigned','role.removed','refund.status_changed') then 'warning'
    when TG_TABLE_NAME = 'webhook_logs' and coalesce((new_row ->> 'processed')::boolean, false) = false then 'critical'
    else 'info'
  end;

  summary_value := initcap(replace(event_value, '.', ' '));

  insert into public.activity_log (
    actor_id, actor_label, actor_context, source, category, event_name,
    severity, entity_type, entity_id, entity_label, summary,
    before_data, after_data, metadata
  ) values (
    actor,
    coalesce(private.activity_actor_label(actor), case when actor is null then 'System' else 'User' end),
    actor_context,
    case actor_context when 'admin' then 'admin_portal' when 'artisan' then 'artisan_portal' when 'buyer' then 'storefront' else 'system' end,
    category_name,
    event_value,
    severity_value,
    TG_TABLE_NAME,
    entity_value,
    label_value,
    summary_value,
    safe_old,
    safe_new,
    jsonb_build_object('operation', TG_OP)
  );

  return null;
end;
$$;

create or replace function private.broadcast_activity_log_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('table', 'activity_log', 'operation', 'INSERT', 'record_id', NEW.id::text),
    'db_change',
    'admin:portal',
    true
  );
  return null;
end;
$$;

revoke all on function private.activity_actor_context(uuid) from public, anon, authenticated;
revoke all on function private.activity_actor_label(uuid) from public, anon, authenticated;
revoke all on function private.activity_safe_row(text, jsonb) from public, anon, authenticated;
revoke all on function private.capture_activity_change() from public, anon, authenticated;
revoke all on function private.broadcast_activity_log_insert() from public, anon, authenticated;

drop trigger if exists activity_log_realtime_broadcast on public.activity_log;
create trigger activity_log_realtime_broadcast
after insert on public.activity_log
for each row execute function private.broadcast_activity_log_insert();

do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('orders', 'orders'),
      ('products', 'products'),
      ('product_variations', 'inventory'),
      ('artisans', 'artisans'),
      ('shops', 'shops'),
      ('models_3d', 'models'),
      ('designs', 'designs'),
      ('design_requests', 'designs'),
      ('conversations', 'messages'),
      ('messages', 'messages'),
      ('notifications', 'notifications'),
      ('product_reviews', 'reviews'),
      ('profiles', 'profiles'),
      ('user_roles', 'roles'),
      ('theme_settings', 'settings'),
      ('generated_attachment_catalog_settings', 'settings'),
      ('generated_attachment_shop_overrides', 'settings'),
      ('order_return_requests', 'refunds'),
      ('order_return_items', 'refunds'),
      ('order_return_evidence', 'refunds'),
      ('webhook_logs', 'system')
    ) as configured(table_name, category_name)
  loop
    if to_regclass('public.' || target.table_name) is null then continue; end if;
    execute format('drop trigger if exists capture_activity_change on public.%I', target.table_name);
    execute format(
      'create trigger capture_activity_change after insert or update or delete on public.%I for each row execute function private.capture_activity_change(%L)',
      target.table_name,
      target.category_name
    );
  end loop;
end;
$$;

-- Preserve the useful portion of the legacy order timeline without copying sensitive notes.
do $$
begin
  if to_regclass('public.order_activity_log') is not null then
    insert into public.activity_log (
      occurred_at, actor_id, actor_label, actor_context, source, category,
      event_name, severity, entity_type, entity_id, entity_label, summary,
      before_data, after_data, metadata, legacy_source, legacy_id
    )
    select
      created_at,
      actor_id,
      coalesce(nullif(actor_name, ''), 'Unknown'),
      case when actor_role = 'admin' then 'admin' when actor_role in ('artisan','shop_owner') then 'artisan' when actor_role = 'buyer' then 'buyer' else 'system' end,
      'legacy',
      'orders',
      'order.' || action_type,
      case when action_type in ('refund_processed','problem_flagged','payment_rejected') then 'warning' else 'info' end,
      'orders',
      order_id::text,
      order_id::text,
      initcap(replace(action_type, '_', ' ')),
      jsonb_strip_nulls(jsonb_build_object('status', previous_status, 'payment_status', previous_payment_status, 'delivery_status', previous_delivery_status)),
      jsonb_strip_nulls(jsonb_build_object('status', new_status, 'payment_status', new_payment_status, 'delivery_status', new_delivery_status)),
      '{}'::jsonb,
      'order_activity_log',
      id
    from public.order_activity_log
    where created_at >= now() - interval '90 days'
    on conflict (legacy_source, legacy_id) where legacy_source is not null and legacy_id is not null do nothing;

    if to_regprocedure('public.log_order_change(uuid,text,text,text,text,text,text,text,uuid,text,text,text)') is not null then
      revoke all on function public.log_order_change(uuid,text,text,text,text,text,text,text,uuid,text,text,text) from public, anon, authenticated;
    end if;
    revoke insert, update, delete on table public.order_activity_log from anon, authenticated;
  end if;
end;
$$;

-- Install retention when pg_cron is available. The migration remains usable on
-- local Postgres instances where the extension is not installed.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $cron$
      select cron.schedule(
        'activity-log-retention',
        '15 3 * * *',
        $job$delete from public.activity_log where occurred_at < now() - interval '90 days'$job$
      )
    $cron$;
  end if;
exception when others then
  raise notice 'pg_cron retention schedule was not installed: %', sqlerrm;
end;
$$;
