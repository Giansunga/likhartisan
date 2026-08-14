-- Versioned design requests, auditable workflow events, and paid-only
-- custom-order production transitions.

alter table public.design_requests
  add column if not exists current_revision integer not null default 1
    check (current_revision >= 1);

create table if not exists public.design_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.design_requests(id) on delete cascade,
  revision_number integer not null check (revision_number >= 1),
  client_token uuid not null,
  design_snapshot jsonb not null,
  quantity integer not null check (quantity between 1 and 100),
  buyer_note text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, revision_number),
  unique (request_id, client_token)
);

create table if not exists public.design_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.design_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('buyer', 'shop', 'system', 'admin')),
  event_type text not null check (event_type in (
    'submitted', 'changes_requested', 'revised', 'quoted', 'declined',
    'approved', 'payment_verified', 'production_updated'
  )),
  revision_number integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_design_request_revisions_request
  on public.design_request_revisions(request_id, revision_number desc);
create index if not exists idx_design_request_events_request
  on public.design_request_events(request_id, created_at desc);

insert into public.design_request_revisions (
  request_id, revision_number, client_token, design_snapshot, quantity,
  buyer_note, created_by, created_at
)
select id, 1, client_token, design_snapshot, quantity, buyer_note, buyer_id, created_at
from public.design_requests
on conflict (request_id, revision_number) do nothing;

insert into public.design_request_events (
  request_id, actor_id, actor_role, event_type, revision_number, payload, created_at
)
select id, buyer_id, 'buyer', 'submitted', 1,
  jsonb_build_object('quantity', quantity), created_at
from public.design_requests request
where not exists (
  select 1 from public.design_request_events event
  where event.request_id = request.id and event.event_type = 'submitted'
);

alter table public.design_request_revisions enable row level security;
alter table public.design_request_events enable row level security;

drop policy if exists design_request_revisions_select_parties on public.design_request_revisions;
create policy design_request_revisions_select_parties
on public.design_request_revisions for select to authenticated
using (
  exists (
    select 1 from public.design_requests request
    where request.id = request_id
      and (
        request.buyer_id = (select auth.uid())
        or public.is_shop_owner(request.shop_id)
        or public.is_admin()
      )
  )
);

drop policy if exists design_request_events_select_parties on public.design_request_events;
create policy design_request_events_select_parties
on public.design_request_events for select to authenticated
using (
  exists (
    select 1 from public.design_requests request
    where request.id = request_id
      and (
        request.buyer_id = (select auth.uid())
        or public.is_shop_owner(request.shop_id)
        or public.is_admin()
      )
  )
);

revoke all on table public.design_request_revisions from anon, authenticated;
revoke all on table public.design_request_events from anon, authenticated;
grant select on table public.design_request_revisions to authenticated;
grant select on table public.design_request_events to authenticated;
grant all on table public.design_request_revisions to service_role;
grant all on table public.design_request_events to service_role;

create or replace function public.submit_design_request(
  p_shop_id uuid,
  p_client_token uuid,
  p_design_snapshot jsonb,
  p_quantity integer default 1,
  p_buyer_note text default ''
) returns public.design_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_shop public.shops%rowtype;
  v_request public.design_requests%rowtype;
  v_conversation public.conversations%rowtype;
  v_buyer_name text;
  v_payload text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_quantity < 1 or p_quantity > 100 then raise exception 'Quantity must be between 1 and 100'; end if;
  if p_design_snapshot is null or p_design_snapshot->>'version' <> '1'
    or coalesce(p_design_snapshot#>>'{model,file}', '') = '' then
    raise exception 'A valid version 1 design snapshot is required';
  end if;
  select * into v_request from public.design_requests
    where buyer_id = v_user_id and client_token = p_client_token;
  if found then return v_request; end if;
  select * into v_shop from public.shops where id = p_shop_id;
  if not found then raise exception 'Shop not found'; end if;
  v_buyer_name := coalesce(nullif(btrim(auth.jwt()#>>'{user_metadata,name}'), ''), 'Customer');
  select * into v_conversation from public.conversations
    where buyer_id = v_user_id and shop_id = p_shop_id
    order by last_message_at desc nulls last limit 1;
  if not found then
    insert into public.conversations (
      buyer_id, shop_id, shop_name, shop_image, buyer_name, buyer_avatar,
      buyer_unread, artisan_unread
    ) values (
      v_user_id, p_shop_id, v_shop.name, coalesce(v_shop.image, ''), v_buyer_name,
      coalesce(auth.jwt()#>>'{user_metadata,avatar_url}', ''), 0, 0
    ) returning * into v_conversation;
  end if;
  insert into public.design_requests (
    client_token, buyer_id, shop_id, conversation_id, design_snapshot,
    quantity, buyer_note, current_revision
  ) values (
    p_client_token, v_user_id, p_shop_id, v_conversation.id, p_design_snapshot,
    p_quantity, left(coalesce(p_buyer_note, ''), 2000), 1
  ) returning * into v_request;
  insert into public.design_request_revisions (
    request_id, revision_number, client_token, design_snapshot, quantity,
    buyer_note, created_by
  ) values (
    v_request.id, 1, p_client_token, p_design_snapshot, p_quantity,
    v_request.buyer_note, v_user_id
  );
  insert into public.design_request_events (
    request_id, actor_id, actor_role, event_type, revision_number, payload
  ) values (
    v_request.id, v_user_id, 'buyer', 'submitted', 1,
    jsonb_build_object('quantity', p_quantity)
  );
  v_payload := jsonb_build_object(
    'type', 'design_request', 'version', 1, 'request_id', v_request.id,
    'revision_number', 1, 'event_type', 'submitted',
    'message', 'I sent a custom pottery design for quotation.',
    'summary', jsonb_build_object(
      'model', p_design_snapshot#>>'{model,name}',
      'color', p_design_snapshot#>>'{material,color}',
      'finish', p_design_snapshot#>>'{material,finish}',
      'quantity', p_quantity, 'status', 'pending'
    )
  )::text;
  insert into public.messages(conversation_id, sender_id, text)
    values (v_conversation.id, v_user_id, v_payload);
  update public.conversations set
    last_message = 'Custom design request', last_message_at = now(),
    artisan_unread = coalesce(artisan_unread, 0) + 1
  where id = v_conversation.id;
  if v_shop.owner_id is not null then
    insert into public.notifications(user_id, type, title, message, product_image)
    values (
      v_shop.owner_id, 'design_request', 'New custom design request',
      v_buyer_name || ' sent a pottery design for quotation.',
      coalesce(p_design_snapshot#>>'{model,thumbnail}', '')
    );
  end if;
  return v_request;
end;
$$;

create or replace function public.revise_design_request(
  p_request_id uuid,
  p_client_token uuid,
  p_design_snapshot jsonb,
  p_quantity integer default 1,
  p_buyer_note text default ''
) returns public.design_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.design_requests%rowtype;
  v_revision integer;
  v_payload text;
  v_shop_owner uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select request.* into v_request
  from public.design_requests request
  join public.design_request_revisions revision on revision.request_id = request.id
  where request.id = p_request_id and request.buyer_id = v_user_id
    and revision.client_token = p_client_token;
  if found then return v_request; end if;
  select * into v_request from public.design_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.buyer_id <> v_user_id then raise exception 'Not authorized'; end if;
  if v_request.status <> 'changes_requested' then
    raise exception 'This request is not waiting for a revision';
  end if;
  if p_quantity < 1 or p_quantity > 100 then raise exception 'Quantity must be between 1 and 100'; end if;
  if p_design_snapshot is null or p_design_snapshot->>'version' <> '1'
    or coalesce(p_design_snapshot#>>'{model,file}', '') = '' then
    raise exception 'A valid version 1 design snapshot is required';
  end if;
  v_revision := v_request.current_revision + 1;
  insert into public.design_request_revisions (
    request_id, revision_number, client_token, design_snapshot, quantity,
    buyer_note, created_by
  ) values (
    p_request_id, v_revision, p_client_token, p_design_snapshot, p_quantity,
    left(coalesce(p_buyer_note, ''), 2000), v_user_id
  );
  update public.design_requests set
    design_snapshot = p_design_snapshot,
    quantity = p_quantity,
    buyer_note = left(coalesce(p_buyer_note, ''), 2000),
    current_revision = v_revision,
    status = 'pending', quoted_price = null, lead_time_days = null,
    shop_response = '', responded_at = null, updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.design_request_events (
    request_id, actor_id, actor_role, event_type, revision_number, payload
  ) values (
    p_request_id, v_user_id, 'buyer', 'revised', v_revision,
    jsonb_build_object('quantity', p_quantity)
  );
  v_payload := jsonb_build_object(
    'type', 'design_request_update', 'version', 1,
    'request_id', p_request_id, 'revision_number', v_revision,
    'event_type', 'revised', 'status', 'pending',
    'message', 'I submitted a revised custom design.'
  )::text;
  if v_request.conversation_id is not null then
    insert into public.messages(conversation_id, sender_id, text)
      values (v_request.conversation_id, v_user_id, v_payload);
    update public.conversations set
      last_message = 'Revised custom design submitted', last_message_at = now(),
      artisan_unread = coalesce(artisan_unread, 0) + 1
    where id = v_request.conversation_id;
  end if;
  select owner_id into v_shop_owner from public.shops where id = v_request.shop_id;
  if v_shop_owner is not null then
    insert into public.notifications(user_id, type, title, message, product_image)
    values (
      v_shop_owner, 'design_request', 'Design revision received',
      'A buyer submitted revision ' || v_revision || ' for a custom design.',
      coalesce(p_design_snapshot#>>'{model,thumbnail}', '')
    );
  end if;
  return v_request;
end;
$$;

create or replace function public.respond_to_design_request(
  p_request_id uuid,
  p_action text,
  p_response text default '',
  p_quoted_price numeric default null,
  p_lead_time_days integer default null
) returns public.design_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.design_requests%rowtype;
  v_status text;
  v_event text;
  v_payload text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_request from public.design_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not public.is_shop_owner(v_request.shop_id) and not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_action = 'quote' then
    if p_quoted_price is null or p_quoted_price <= 0 then raise exception 'A positive quote is required'; end if;
    if p_lead_time_days is null or p_lead_time_days < 1 or p_lead_time_days > 365 then
      raise exception 'Lead time must be between 1 and 365 days';
    end if;
    v_status := 'quoted'; v_event := 'quoted';
  elsif p_action = 'request_changes' then
    if length(trim(coalesce(p_response, ''))) = 0 then raise exception 'Describe the requested changes'; end if;
    v_status := 'changes_requested'; v_event := 'changes_requested';
  elsif p_action = 'decline' then
    if length(trim(coalesce(p_response, ''))) = 0 then raise exception 'A decline reason is required'; end if;
    v_status := 'declined'; v_event := 'declined';
  else
    raise exception 'Unsupported response action';
  end if;
  if v_request.status = v_status
    and v_request.shop_response = left(coalesce(p_response, ''), 2000)
    and v_request.quoted_price is not distinct from
      (case when v_status = 'quoted' then p_quoted_price else null end)
    and v_request.lead_time_days is not distinct from
      (case when v_status = 'quoted' then p_lead_time_days else null end) then
    return v_request;
  end if;
  if v_request.status in ('approved', 'declined') then
    raise exception 'This request can no longer be changed';
  end if;
  if v_request.status = 'changes_requested' then
    raise exception 'Waiting for the buyer to submit a revision';
  end if;
  update public.design_requests set
    status = v_status,
    quoted_price = case when v_status = 'quoted' then p_quoted_price else null end,
    lead_time_days = case when v_status = 'quoted' then p_lead_time_days else null end,
    shop_response = left(coalesce(p_response, ''), 2000),
    responded_at = now(), updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.design_request_events (
    request_id, actor_id, actor_role, event_type, revision_number, payload
  ) values (
    p_request_id, v_user_id,
    case when public.is_admin() and not public.is_shop_owner(v_request.shop_id) then 'admin' else 'shop' end,
    v_event, v_request.current_revision,
    jsonb_build_object(
      'response', v_request.shop_response,
      'quoted_price', v_request.quoted_price,
      'lead_time_days', v_request.lead_time_days
    )
  );
  v_payload := jsonb_build_object(
    'type', 'design_request_update', 'version', 1,
    'request_id', v_request.id, 'revision_number', v_request.current_revision,
    'event_type', v_event, 'status', v_status,
    'message', case v_status
      when 'quoted' then 'The shop sent a quote for your design.'
      when 'changes_requested' then 'The shop requested changes to your design.'
      else 'The shop declined this design request.' end,
    'quoted_price', v_request.quoted_price,
    'lead_time_days', v_request.lead_time_days,
    'shop_response', v_request.shop_response
  )::text;
  if v_request.conversation_id is not null then
    insert into public.messages(conversation_id, sender_id, text)
      values (v_request.conversation_id, v_user_id, v_payload);
    update public.conversations set
      last_message = case v_status
        when 'quoted' then 'Quote sent for custom design'
        when 'changes_requested' then 'Changes requested for custom design'
        else 'Custom design request declined' end,
      last_message_at = now(), buyer_unread = coalesce(buyer_unread, 0) + 1
    where id = v_request.conversation_id;
  end if;
  insert into public.notifications(user_id, type, title, message, product_image)
  values (
    v_request.buyer_id, 'design_request',
    case v_status when 'quoted' then 'Your design has a quote'
      when 'changes_requested' then 'Changes requested'
      else 'Design request declined' end,
    case v_status when 'quoted' then 'Review the shop quote in Messages.'
      else v_request.shop_response end,
    coalesce(v_request.design_snapshot#>>'{model,thumbnail}', '')
  );
  return v_request;
end;
$$;

create or replace function public.approve_design_request(p_request_id uuid)
returns public.design_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.design_requests%rowtype;
  v_shop public.shops%rowtype;
  v_order_id uuid;
  v_buyer_name text;
  v_payload text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_request from public.design_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.buyer_id <> v_user_id then raise exception 'Not authorized'; end if;
  if v_request.status = 'approved' and v_request.order_id is not null then return v_request; end if;
  if v_request.status <> 'quoted' or v_request.quoted_price is null then
    raise exception 'Only a current quote can be approved';
  end if;
  select * into v_shop from public.shops where id = v_request.shop_id;
  if not found then raise exception 'Shop not found'; end if;
  v_buyer_name := coalesce(nullif(btrim(auth.jwt()#>>'{user_metadata,name}'), ''), 'Customer');
  insert into public.orders (
    user_id, user_name, buyer_email, items, subtotal, shipping_fee, total,
    delivery_option, delivery_status, status, payment_status, order_type,
    customer_notes, design_request_id
  ) values (
    v_user_id, v_buyer_name, coalesce(auth.jwt()->>'email', ''),
    jsonb_build_array(jsonb_build_object(
      'product_id', null,
      'product_name', coalesce(v_request.design_snapshot#>>'{model,name}', 'Custom pottery design'),
      'qty', v_request.quantity,
      'price', round(v_request.quoted_price / v_request.quantity, 2),
      'image', coalesce(v_request.design_snapshot#>>'{model,thumbnail}', ''),
      'shop_id', v_request.shop_id, 'shop_name', v_shop.name,
      'design_request_id', v_request.id
    )),
    v_request.quoted_price, 0, v_request.quoted_price, 'pickup', 'pending',
    'pending', 'pending', 'customized', v_request.buyer_note, v_request.id
  ) returning id into v_order_id;
  update public.design_requests set
    status = 'approved', order_id = v_order_id, updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.design_request_events (
    request_id, actor_id, actor_role, event_type, revision_number, payload
  ) values (
    p_request_id, v_user_id, 'buyer', 'approved', v_request.current_revision,
    jsonb_build_object('order_id', v_order_id, 'quoted_price', v_request.quoted_price)
  );
  v_payload := jsonb_build_object(
    'type', 'design_request_update', 'version', 1,
    'request_id', v_request.id, 'revision_number', v_request.current_revision,
    'event_type', 'approved', 'message', 'I approved the quote.',
    'status', 'approved', 'order_id', v_order_id
  )::text;
  if v_request.conversation_id is not null then
    insert into public.messages(conversation_id, sender_id, text)
      values (v_request.conversation_id, v_user_id, v_payload);
    update public.conversations set
      last_message = 'Custom design quote approved', last_message_at = now(),
      artisan_unread = coalesce(artisan_unread, 0) + 1
    where id = v_request.conversation_id;
  end if;
  if v_shop.owner_id is not null then
    insert into public.notifications(user_id, type, title, message, order_id, product_image)
    values (
      v_shop.owner_id, 'design_request', 'Design quote approved',
      v_buyer_name || ' approved your custom design quote.', v_order_id,
      coalesce(v_request.design_snapshot#>>'{model,thumbnail}', '')
    );
  end if;
  return v_request;
end;
$$;

create or replace function public.advance_custom_order(
  p_order_id uuid,
  p_next_status text
) returns public.orders
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_request public.design_requests%rowtype;
  v_expected text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select * into v_request from public.design_requests
    where id = v_order.design_request_id and order_id = v_order.id;
  if not found or v_order.order_type <> 'customized' then raise exception 'Not a custom design order'; end if;
  if not public.is_shop_owner(v_request.shop_id) and not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if v_order.status in ('cancelled', 'refunded') then raise exception 'This order can no longer advance'; end if;
  v_expected := case v_order.delivery_status
    when 'pending' then 'preparing'
    when 'preparing' then 'shipped'
    when 'shipped' then 'delivered'
    when 'delivered' then 'completed'
    else null end;
  if v_expected is null or p_next_status <> v_expected then raise exception 'Invalid production transition'; end if;
  if v_order.delivery_status = 'pending' and v_order.payment_status <> 'paid' then
    raise exception 'Verified payment is required before production starts';
  end if;
  update public.orders set
    delivery_status = p_next_status,
    status = case when p_next_status = 'completed' then 'completed' else status end,
    updated_at = now()
  where id = p_order_id returning * into v_order;
  insert into public.design_request_events (
    request_id, actor_id, actor_role, event_type, revision_number, payload
  ) values (
    v_request.id, v_user_id,
    case when public.is_admin() and not public.is_shop_owner(v_request.shop_id) then 'admin' else 'shop' end,
    'production_updated', v_request.current_revision,
    jsonb_build_object('order_id', p_order_id, 'delivery_status', p_next_status)
  );
  insert into public.notifications(user_id, type, title, message, order_id, product_image)
  values (
    v_order.user_id, 'order', 'Custom order updated',
    case p_next_status
      when 'preparing' then 'Production has started on your custom design.'
      when 'shipped' then 'Your custom design is on the way.'
      when 'delivered' then 'Your custom design was marked delivered.'
      else 'Your custom design order is complete.' end,
    v_order.id, coalesce(v_request.design_snapshot#>>'{model,thumbnail}', '')
  );
  return v_order;
end;
$$;

revoke all on function public.submit_design_request(uuid, uuid, jsonb, integer, text) from public, anon;
revoke all on function public.revise_design_request(uuid, uuid, jsonb, integer, text) from public, anon;
revoke all on function public.respond_to_design_request(uuid, text, text, numeric, integer) from public, anon;
revoke all on function public.approve_design_request(uuid) from public, anon;
revoke all on function public.advance_custom_order(uuid, text) from public, anon;
grant execute on function public.submit_design_request(uuid, uuid, jsonb, integer, text) to authenticated;
grant execute on function public.revise_design_request(uuid, uuid, jsonb, integer, text) to authenticated;
grant execute on function public.respond_to_design_request(uuid, text, text, numeric, integer) to authenticated;
grant execute on function public.approve_design_request(uuid) to authenticated;
grant execute on function public.advance_custom_order(uuid, text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.design_request_revisions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.design_request_events;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
