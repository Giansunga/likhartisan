-- Keep seller-facing conversation identity synchronized with Supabase Auth.
-- raw_user_meta_data is used only for display data, never authorization.

create schema if not exists private;

create or replace function private.apply_conversation_buyer_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_name text;
  account_avatar text;
begin
  if TG_OP = 'UPDATE'
    and NEW.buyer_id is distinct from OLD.buyer_id
    and (select auth.uid()) is not null then
    raise exception 'Conversation buyer cannot be reassigned by a client'
      using errcode = '42501';
  end if;

  select
    nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(user_row.raw_user_meta_data ->> 'avatar_url'), '')
  into account_name, account_avatar
  from auth.users user_row
  where user_row.id = NEW.buyer_id;

  NEW.buyer_name := coalesce(account_name, 'Customer');
  NEW.buyer_avatar := coalesce(account_avatar, '');
  return NEW;
end;
$$;

create or replace function private.sync_auth_user_conversation_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_name text := coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''), 'Customer');
  account_avatar text := coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'avatar_url'), ''), '');
begin
  update public.conversations
  set buyer_name = account_name,
      buyer_avatar = account_avatar
  where buyer_id = NEW.id
    and (buyer_name, buyer_avatar) is distinct from (account_name, account_avatar);

  return NEW;
end;
$$;

revoke all on function private.apply_conversation_buyer_identity() from public, anon, authenticated;
revoke all on function private.sync_auth_user_conversation_identity() from public, anon, authenticated;

drop trigger if exists conversations_apply_buyer_identity on public.conversations;
create trigger conversations_apply_buyer_identity
before insert or update of buyer_id, buyer_name, buyer_avatar
on public.conversations
for each row execute function private.apply_conversation_buyer_identity();

drop trigger if exists auth_user_sync_conversation_identity on auth.users;
create trigger auth_user_sync_conversation_identity
after update of raw_user_meta_data
on auth.users
for each row
when (OLD.raw_user_meta_data is distinct from NEW.raw_user_meta_data)
execute function private.sync_auth_user_conversation_identity();

-- Reconcile every existing conversation with the buyer's current account profile.
update public.conversations conversation
set buyer_name = coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''), 'Customer'),
    buyer_avatar = coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'avatar_url'), ''), '')
from auth.users user_row
where conversation.buyer_id = user_row.id
  and (conversation.buyer_name, conversation.buyer_avatar) is distinct from (
    coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'name'), ''), 'Customer'),
    coalesce(nullif(btrim(user_row.raw_user_meta_data ->> 'avatar_url'), ''), '')
  );
