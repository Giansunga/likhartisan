-- Keep historical quantities intact while enforcing the new minimum on new work.
alter table public.design_requests drop constraint design_requests_quantity_check;
alter table public.design_requests add constraint design_requests_quantity_check check (quantity >= 1);
alter table public.design_requests alter column quantity set default 100;
alter table public.design_request_revisions drop constraint design_request_revisions_quantity_check;
alter table public.design_request_revisions add constraint design_request_revisions_quantity_check check (quantity >= 1);

create or replace function public.enforce_design_request_minimum_quantity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    -- Status/quote updates to older orders must remain possible.
    if new.quantity is not distinct from old.quantity then return new; end if;
  end if;
  if new.quantity is null or new.quantity < 100 then
    raise exception 'Minimum order is 100 pieces' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_design_request_minimum_quantity() from public, anon, authenticated;
create trigger design_requests_minimum_quantity
before insert or update of quantity on public.design_requests
for each row execute function public.enforce_design_request_minimum_quantity();
create trigger design_request_revisions_minimum_quantity
before insert or update of quantity on public.design_request_revisions
for each row execute function public.enforce_design_request_minimum_quantity();

create or replace function public.submit_design_request(
  p_shop_id uuid,
  p_client_token uuid,
  p_design_snapshot jsonb,
  p_quantity integer default 100,
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
  if p_quantity is null or p_quantity < 100 then raise exception 'Minimum order is 100 pieces'; end if;
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
  p_quantity integer default 100,
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
  if p_quantity is null or p_quantity < 100 then raise exception 'Minimum order is 100 pieces'; end if;
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

notify pgrst, 'reload schema';
