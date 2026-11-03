begin;
create table public.order_receipts (
  order_id uuid primary key references public.orders(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  receipt_number text not null unique,
  issued_at timestamptz not null default now(),
  template_version integer not null default 1 check (template_version = 1),
  snapshot jsonb not null
);
alter table public.order_receipts enable row level security;
revoke all on public.order_receipts from anon, authenticated;
grant select on public.order_receipts to authenticated;
grant all on public.order_receipts to service_role;
create policy receipt_owner_read on public.order_receipts for select to authenticated
  using (owner_user_id = (select auth.uid()));

create function public.capture_order_receipt(p_order_id uuid, p_owner_id uuid) returns public.order_receipts
language plpgsql security definer set search_path = pg_catalog, public as $$
declare source public.orders; receipt public.order_receipts;
begin
  select * into source from public.orders where id=p_order_id and user_id=p_owner_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into receipt from public.order_receipts where order_id=p_order_id and owner_user_id=p_owner_id;
  if found then return receipt; end if;
  if source.payment_status is distinct from 'paid' and not (
    (source.payment_status = 'refunded' or source.status = 'refunded') and source.payment_verified_at is not null
  ) then raise exception 'RECEIPT_NOT_AVAILABLE'; end if;
  insert into public.order_receipts(order_id, owner_user_id, receipt_number, snapshot)
  values(source.id,source.user_id,'LK-'||upper(replace(source.id::text,'-','')),jsonb_build_object(
    'orderId',source.id,'orderDate',source.created_at,'paidAt',source.payment_verified_at,
    'buyerName',source.user_name,'buyerPhone',source.user_phone,'buyerAddress',source.user_address,
    'buyerEmail',coalesce(to_jsonb(source)->>'buyer_email',to_jsonb(source)->>'email'),
    'items',source.items,'subtotal',source.subtotal,'shippingFee',source.shipping_fee,'total',source.total,
    'paymentReference',source.payment_reference,'orderType',source.order_type,'deliveryOption',source.delivery_option
  )) on conflict(order_id) do nothing;
  select * into receipt from public.order_receipts where order_id=p_order_id and owner_user_id=p_owner_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return receipt;
end $$;
revoke all on function public.capture_order_receipt(uuid,uuid) from public, anon, authenticated;
grant execute on function public.capture_order_receipt(uuid,uuid) to service_role;

create function public.capture_verified_order_receipt() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.payment_status='paid' and new.user_id is not null then
    perform public.capture_order_receipt(new.id,new.user_id);
  end if;
  return new;
end $$;
revoke all on function public.capture_verified_order_receipt() from public;
create trigger capture_verified_order_receipt after insert or update of payment_status on public.orders
for each row execute function public.capture_verified_order_receipt();

create function public.prevent_receipt_changes() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin raise exception 'Receipt snapshots cannot be changed'; end $$;
create trigger immutable_receipt before update on public.order_receipts
for each row execute function public.prevent_receipt_changes();
commit;
