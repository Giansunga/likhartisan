-- Secure Realtime invalidations for the admin and artisan portals.
-- Run after 000-master-schema.sql, FIX-RLS.sql, and add-user-roles.sql.
-- Payloads intentionally contain identifiers only; clients refetch through RLS.

create schema if not exists private;

create or replace function private.send_portal_invalidation(
  topic_name text,
  source_table text,
  source_operation text,
  source_record_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if topic_name is null or topic_name = '' then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'table', source_table,
      'operation', source_operation,
      'record_id', source_record_id
    ),
    'db_change',
    topic_name,
    true
  );
end;
$$;

create or replace function private.broadcast_portal_direct_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  old_data jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) else '{}'::jsonb end;
  new_data jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) else '{}'::jsonb end;
  shop_field text := nullif(TG_ARGV[0], '');
  user_field text := nullif(TG_ARGV[1], '');
  include_theme boolean := coalesce(TG_ARGV[2], 'false') = 'true';
  record_id text;
  topic_id text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  record_id := row_data ->> 'id';

  perform private.send_portal_invalidation('admin:portal', TG_TABLE_NAME, TG_OP, record_id);

  if shop_field is not null then
    for topic_id in
      select distinct value
      from (values (old_data ->> shop_field), (new_data ->> shop_field)) topics(value)
      where nullif(value, '') is not null
    loop
      perform private.send_portal_invalidation(
        'shop:' || topic_id, TG_TABLE_NAME, TG_OP, record_id
      );
    end loop;
  end if;

  if user_field is not null then
    for topic_id in
      select distinct value
      from (values (old_data ->> user_field), (new_data ->> user_field)) topics(value)
      where nullif(value, '') is not null
    loop
      perform private.send_portal_invalidation(
        'user:' || topic_id, TG_TABLE_NAME, TG_OP, record_id
      );
    end loop;
  end if;

  if include_theme then
    perform private.send_portal_invalidation('app:theme', TG_TABLE_NAME, TG_OP, record_id);
  end if;

  return null;
end;
$$;

create or replace function private.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  record_id text;
  shop_id text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  record_id := row_data ->> 'id';

  perform private.send_portal_invalidation('admin:portal', TG_TABLE_NAME, TG_OP, record_id);

  for shop_id in
    select distinct item ->> 'shop_id'
    from jsonb_array_elements(
      coalesce(case when TG_OP <> 'INSERT' then to_jsonb(OLD) -> 'items' end, '[]'::jsonb)
      || coalesce(case when TG_OP <> 'DELETE' then to_jsonb(NEW) -> 'items' end, '[]'::jsonb)
    ) item
    where nullif(item ->> 'shop_id', '') is not null
  loop
    perform private.send_portal_invalidation(
      'shop:' || shop_id, TG_TABLE_NAME, TG_OP, record_id
    );
  end loop;

  return null;
end;
$$;

create or replace function private.broadcast_variation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  record_id text;
  owner_shop_id text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  record_id := row_data ->> 'id';

  perform private.send_portal_invalidation('admin:portal', TG_TABLE_NAME, TG_OP, record_id);

  for owner_shop_id in
  select distinct p.shop_id::text
  from public.products p
  where p.id::text in (
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) ->> 'product_id' end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) ->> 'product_id' end
  )
  loop
    perform private.send_portal_invalidation(
      'shop:' || owner_shop_id, TG_TABLE_NAME, TG_OP, record_id
    );
  end loop;

  return null;
end;
$$;

create or replace function private.broadcast_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  record_id text;
  owner_shop_id text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  record_id := row_data ->> 'id';

  perform private.send_portal_invalidation('admin:portal', TG_TABLE_NAME, TG_OP, record_id);

  for owner_shop_id in
  select distinct c.shop_id::text
  from public.conversations c
  where c.id::text in (
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) ->> 'conversation_id' end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) ->> 'conversation_id' end
  )
  loop
    perform private.send_portal_invalidation(
      'shop:' || owner_shop_id, TG_TABLE_NAME, TG_OP, record_id
    );
  end loop;

  return null;
end;
$$;

create or replace function private.broadcast_order_activity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  record_id text;
  shop_id text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  record_id := row_data ->> 'id';

  perform private.send_portal_invalidation('admin:portal', TG_TABLE_NAME, TG_OP, record_id);

  for shop_id in
    select distinct item ->> 'shop_id'
    from public.orders o,
      jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) item
    where o.id::text in (
      case when TG_OP <> 'INSERT' then to_jsonb(OLD) ->> 'order_id' end,
      case when TG_OP <> 'DELETE' then to_jsonb(NEW) ->> 'order_id' end
    )
      and nullif(item ->> 'shop_id', '') is not null
  loop
    perform private.send_portal_invalidation(
      'shop:' || shop_id, TG_TABLE_NAME, TG_OP, record_id
    );
  end loop;

  return null;
end;
$$;

revoke all on function private.send_portal_invalidation(text, text, text, text) from public, anon, authenticated;
revoke all on function private.broadcast_portal_direct_change() from public, anon, authenticated;
revoke all on function private.broadcast_order_change() from public, anon, authenticated;
revoke all on function private.broadcast_variation_change() from public, anon, authenticated;
revoke all on function private.broadcast_message_change() from public, anon, authenticated;
revoke all on function private.broadcast_order_activity_change() from public, anon, authenticated;

drop policy if exists "portal_broadcast_topics_select" on realtime.messages;
create policy "portal_broadcast_topics_select"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and case
    when (select realtime.topic()) = 'admin:portal' then (select public.is_super_admin())
    when (select realtime.topic()) = 'app:theme' then true
    when (select realtime.topic()) = 'user:' || (select auth.uid())::text then true
    when (select realtime.topic()) ~ '^shop:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      (select public.is_super_admin())
      or (select public.has_role('shop_owner', substring((select realtime.topic()) from 6)::uuid))
    else false
  end
);

do $$
declare
  target record;
begin
  for target in
    select * from (values
      ('products', 'private.broadcast_portal_direct_change', array['shop_id', '', 'false']),
      ('shops', 'private.broadcast_portal_direct_change', array['id', 'owner_id', 'false']),
      ('artisans', 'private.broadcast_portal_direct_change', array['shop_id', '', 'false']),
      ('models_3d', 'private.broadcast_portal_direct_change', array['shop_id', '', 'false']),
      ('generated_attachment_catalog_settings', 'private.broadcast_portal_direct_change', array['', '', 'false']),
      ('generated_attachment_shop_overrides', 'private.broadcast_portal_direct_change', array['shop_id', '', 'false']),
      ('conversations', 'private.broadcast_portal_direct_change', array['shop_id', 'buyer_id', 'false']),
      ('notifications', 'private.broadcast_portal_direct_change', array['', 'user_id', 'false']),
      ('design_requests', 'private.broadcast_portal_direct_change', array['shop_id', 'buyer_id', 'false']),
      ('user_roles', 'private.broadcast_portal_direct_change', array['shop_id', 'user_id', 'false']),
      ('theme_settings', 'private.broadcast_portal_direct_change', array['', '', 'true']),
      ('orders', 'private.broadcast_order_change', array[]::text[]),
      ('product_variations', 'private.broadcast_variation_change', array[]::text[]),
      ('messages', 'private.broadcast_message_change', array[]::text[]),
      ('order_activity_log', 'private.broadcast_order_activity_change', array[]::text[])
    ) as configured(table_name, function_name, function_args)
  loop
    if to_regclass('public.' || target.table_name) is null then
      continue;
    end if;

    execute format('drop trigger if exists portal_realtime_broadcast on public.%I', target.table_name);
    execute format(
      'create trigger portal_realtime_broadcast after insert or update or delete on public.%I for each row execute function %s(%s)',
      target.table_name,
      target.function_name,
      (
        select coalesce(string_agg(quote_literal(arg), ', '), '')
        from unnest(target.function_args) arg
      )
    );
  end loop;
end;
$$;
