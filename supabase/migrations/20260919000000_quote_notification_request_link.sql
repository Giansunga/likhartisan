alter table public.notifications
  add column if not exists design_request_id uuid references public.design_requests(id) on delete set null;

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
  insert into public.notifications(user_id, type, title, message, product_image, design_request_id, conversation_id)
  values (
    v_request.buyer_id, 'design_request',
    case v_status when 'quoted' then 'Your design has a quote'
      when 'changes_requested' then 'Changes requested'
      else 'Design request declined' end,
    case v_status when 'quoted' then 'Review the shop quote in Messages.'
      else v_request.shop_response end,
    coalesce(v_request.design_snapshot#>>'{model,thumbnail}', ''),
    v_request.id, v_request.conversation_id
  );
  return v_request;
end;
$$;
