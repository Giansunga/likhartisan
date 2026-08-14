alter table public.notifications
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists recipient_context text not null default 'buyer';

update public.notifications
set recipient_context = case
  when type = 'message' then 'artisan'
  when type = 'order' then 'artisan'
  else 'buyer'
end;

alter table public.notifications
  drop constraint if exists notifications_recipient_context_check;

alter table public.notifications
  add constraint notifications_recipient_context_check
  check (recipient_context in ('buyer', 'artisan'));

create index if not exists idx_notifications_user_context_created
  on public.notifications (user_id, recipient_context, created_at desc);

create or replace function public.set_notification_recipient_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'order' and new.title = 'New Order Received' then
    new.recipient_context := 'artisan';
  elsif new.type = 'design_request' and new.title in ('New custom design request', 'Design revision received', 'Design quote approved') then
    new.recipient_context := 'artisan';
  end if;
  return new;
end;
$$;

drop trigger if exists set_notification_recipient_context on public.notifications;
create trigger set_notification_recipient_context
before insert on public.notifications
for each row execute function public.set_notification_recipient_context();

drop policy if exists "Users can update own notifications" on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
