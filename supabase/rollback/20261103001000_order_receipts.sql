-- Export receipt snapshots before rollback if they must be retained.
begin;
drop trigger if exists capture_verified_order_receipt on public.orders;
drop function if exists public.capture_verified_order_receipt();
drop function if exists public.capture_order_receipt(uuid,uuid);
drop table if exists public.order_receipts;
drop function if exists public.prevent_receipt_changes();
commit;
