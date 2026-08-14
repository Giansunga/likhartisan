-- Durable freeform design request workflow.
-- Run after 000-master-schema.sql, add-user-roles.sql, and FIX-RLS.sql.

create table if not exists public.design_requests (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  design_snapshot jsonb not null,
  quantity integer not null default 1 check (quantity between 1 and 100),
  buyer_note text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'changes_requested', 'quoted', 'declined', 'approved')),
  quoted_price numeric(12,2) check (quoted_price is null or quoted_price > 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 1 and 365),
  shop_response text not null default '',
  responded_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, client_token)
);

alter table public.orders add column if not exists design_request_id uuid references public.design_requests(id) on delete set null;
create unique index if not exists idx_orders_design_request_id on public.orders(design_request_id) where design_request_id is not null;
create index if not exists idx_design_requests_shop_status_created on public.design_requests(shop_id, status, created_at desc);
create index if not exists idx_design_requests_buyer_created on public.design_requests(buyer_id, created_at desc);
create index if not exists idx_design_requests_conversation on public.design_requests(conversation_id);

alter table public.design_requests enable row level security;
drop policy if exists design_requests_select_parties on public.design_requests;
drop policy if exists design_requests_insert_buyer on public.design_requests;
drop policy if exists design_requests_update_parties on public.design_requests;

create policy design_requests_select_parties on public.design_requests for select using (
  buyer_id = auth.uid() or public.is_shop_owner(shop_id) or public.is_admin()
);
-- Mutations use the validated RPCs below. This insert policy also permits test and
-- administrative tooling to create a buyer-owned request directly.
create policy design_requests_insert_buyer on public.design_requests for insert with check (
  buyer_id = auth.uid()
);

-- New Supabase projects require explicit Data API grants. All row filtering is
-- still enforced by the RLS policies above; client mutations go through RPCs.
revoke all on table public.design_requests from anon;
grant select on table public.design_requests to authenticated;
grant select, insert, update, delete on table public.design_requests to service_role;

create or replace function public.submit_design_request(
  p_shop_id uuid,
  p_client_token uuid,
  p_design_snapshot jsonb,
  p_quantity integer default 1,
  p_buyer_note text default ''
) returns public.design_requests
language plpgsql security definer set search_path = public
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
  if p_design_snapshot is null or p_design_snapshot->>'version' <> '1' or coalesce(p_design_snapshot#>>'{model,file}','') = '' then
    raise exception 'A valid version 1 design snapshot is required';
  end if;
  select * into v_request from public.design_requests where buyer_id = v_user_id and client_token = p_client_token;
  if found then return v_request; end if;
  select * into v_shop from public.shops where id = p_shop_id;
  if not found then raise exception 'Shop not found'; end if;
  v_buyer_name := coalesce(nullif(btrim(auth.jwt()#>>'{user_metadata,name}'), ''), 'Customer');
  select * into v_conversation from public.conversations
    where buyer_id = v_user_id and shop_id = p_shop_id order by last_message_at desc nulls last limit 1;
  if not found then
    insert into public.conversations (buyer_id, shop_id, shop_name, shop_image, buyer_name, buyer_avatar, buyer_unread, artisan_unread)
    values (v_user_id, p_shop_id, v_shop.name, coalesce(v_shop.image,''), v_buyer_name,
      coalesce(auth.jwt()#>>'{user_metadata,avatar_url}',''), 0, 0) returning * into v_conversation;
  end if;
  insert into public.design_requests (client_token, buyer_id, shop_id, conversation_id, design_snapshot, quantity, buyer_note)
  values (p_client_token, v_user_id, p_shop_id, v_conversation.id, p_design_snapshot, p_quantity, left(coalesce(p_buyer_note,''), 2000))
  returning * into v_request;
  v_payload := jsonb_build_object(
    'type','design_request','version',1,'request_id',v_request.id,
    'message','I sent a custom pottery design for quotation.',
    'summary',jsonb_build_object('model',p_design_snapshot#>>'{model,name}','color',p_design_snapshot#>>'{material,color}',
      'finish',p_design_snapshot#>>'{material,finish}','quantity',p_quantity,'status','pending')
  )::text;
  insert into public.messages(conversation_id, sender_id, text) values(v_conversation.id, v_user_id, v_payload);
  update public.conversations set last_message='Custom design request', last_message_at=now(), artisan_unread=coalesce(artisan_unread,0)+1
    where id=v_conversation.id;
  if v_shop.owner_id is not null then
    insert into public.notifications(user_id,type,title,message,product_image)
    values(v_shop.owner_id,'design_request','New custom design request',v_buyer_name || ' sent a pottery design for quotation.',coalesce(p_design_snapshot#>>'{model,thumbnail}',''));
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
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.design_requests%rowtype;
  v_status text;
  v_payload text;
begin
  select * into v_request from public.design_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if not public.is_shop_owner(v_request.shop_id) and not public.is_admin() then raise exception 'Not authorized'; end if;
  if v_request.status in ('approved','declined') then raise exception 'This request can no longer be changed'; end if;
  if p_action = 'quote' then
    if p_quoted_price is null or p_quoted_price <= 0 then raise exception 'A positive quote is required'; end if;
    if p_lead_time_days is null or p_lead_time_days < 1 or p_lead_time_days > 365 then raise exception 'Lead time must be between 1 and 365 days'; end if;
    v_status := 'quoted';
  elsif p_action = 'request_changes' then
    if length(trim(coalesce(p_response,''))) = 0 then raise exception 'Describe the requested changes'; end if;
    v_status := 'changes_requested';
  elsif p_action = 'decline' then
    if length(trim(coalesce(p_response,''))) = 0 then raise exception 'A decline reason is required'; end if;
    v_status := 'declined';
  else raise exception 'Unsupported response action'; end if;
  update public.design_requests set status=v_status,
    quoted_price=case when v_status='quoted' then p_quoted_price else null end,
    lead_time_days=case when v_status='quoted' then p_lead_time_days else null end,
    shop_response=left(coalesce(p_response,''),2000), responded_at=now(), updated_at=now()
    where id=p_request_id returning * into v_request;
  v_payload := jsonb_build_object('type','design_request_update','version',1,'request_id',v_request.id,
    'message',case v_status when 'quoted' then 'The shop sent a quote for your design.' when 'changes_requested' then 'The shop requested changes to your design.' else 'The shop declined this design request.' end,
    'status',v_status,'quoted_price',v_request.quoted_price,'lead_time_days',v_request.lead_time_days,'shop_response',v_request.shop_response)::text;
  insert into public.messages(conversation_id,sender_id,text) values(v_request.conversation_id,v_user_id,v_payload);
  update public.conversations set last_message=case v_status when 'quoted' then 'Quote sent for custom design' when 'changes_requested' then 'Changes requested for custom design' else 'Custom design request declined' end,
    last_message_at=now(), buyer_unread=coalesce(buyer_unread,0)+1 where id=v_request.conversation_id;
  insert into public.notifications(user_id,type,title,message,product_image)
  values(v_request.buyer_id,'design_request',case v_status when 'quoted' then 'Your design has a quote' when 'changes_requested' then 'Changes requested' else 'Design request declined' end,
    case v_status when 'quoted' then 'Review the shop quote in Messages.' when 'changes_requested' then v_request.shop_response else v_request.shop_response end,
    coalesce(v_request.design_snapshot#>>'{model,thumbnail}',''));
  return v_request;
end;
$$;

create or replace function public.approve_design_request(p_request_id uuid)
returns public.design_requests
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.design_requests%rowtype;
  v_shop public.shops%rowtype;
  v_order_id uuid;
  v_buyer_name text;
  v_payload text;
begin
  select * into v_request from public.design_requests where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_request.buyer_id <> v_user_id then raise exception 'Not authorized'; end if;
  if v_request.status = 'approved' and v_request.order_id is not null then return v_request; end if;
  if v_request.status <> 'quoted' or v_request.quoted_price is null then raise exception 'Only a current quote can be approved'; end if;
  select * into v_shop from public.shops where id=v_request.shop_id;
  v_buyer_name := coalesce(nullif(btrim(auth.jwt()#>>'{user_metadata,name}'), ''), 'Customer');
  insert into public.orders(user_id,user_name,buyer_email,items,subtotal,shipping_fee,total,delivery_option,delivery_status,status,payment_status,order_type,customer_notes,design_request_id)
  values(v_user_id,v_buyer_name,coalesce(auth.jwt()->>'email',''),jsonb_build_array(jsonb_build_object(
    'product_id',null,'product_name',coalesce(v_request.design_snapshot#>>'{model,name}','Custom pottery design'),
    'qty',v_request.quantity,'price',round(v_request.quoted_price/v_request.quantity,2),
    'image',coalesce(v_request.design_snapshot#>>'{model,thumbnail}',''),'shop_id',v_request.shop_id,'shop_name',v_shop.name,
    'design_request_id',v_request.id)),v_request.quoted_price,0,v_request.quoted_price,'pickup','pending','pending','pending','customized',v_request.buyer_note,v_request.id)
  returning id into v_order_id;
  update public.design_requests set status='approved',order_id=v_order_id,updated_at=now() where id=p_request_id returning * into v_request;
  v_payload := jsonb_build_object('type','design_request_update','version',1,'request_id',v_request.id,'message','I approved the quote.','status','approved','order_id',v_order_id)::text;
  insert into public.messages(conversation_id,sender_id,text) values(v_request.conversation_id,v_user_id,v_payload);
  update public.conversations set last_message='Custom design quote approved',last_message_at=now(),artisan_unread=coalesce(artisan_unread,0)+1 where id=v_request.conversation_id;
  if v_shop.owner_id is not null then insert into public.notifications(user_id,type,title,message,order_id,product_image)
    values(v_shop.owner_id,'design_request','Design quote approved',v_buyer_name || ' approved your custom design quote.',v_order_id,coalesce(v_request.design_snapshot#>>'{model,thumbnail}','')); end if;
  return v_request;
end;
$$;

revoke all on function public.submit_design_request(uuid,uuid,jsonb,integer,text) from public;
revoke all on function public.respond_to_design_request(uuid,text,text,numeric,integer) from public;
revoke all on function public.approve_design_request(uuid) from public;
revoke all on function public.submit_design_request(uuid,uuid,jsonb,integer,text) from anon;
revoke all on function public.respond_to_design_request(uuid,text,text,numeric,integer) from anon;
revoke all on function public.approve_design_request(uuid) from anon;
grant execute on function public.submit_design_request(uuid,uuid,jsonb,integer,text) to authenticated;
grant execute on function public.respond_to_design_request(uuid,text,text,numeric,integer) to authenticated;
grant execute on function public.approve_design_request(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.design_requests;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
