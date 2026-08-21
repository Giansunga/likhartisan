-- Remove report RPCs from deployments where the earlier analytics migration
-- has already been applied.
drop function if exists public.admin_commerce_report(text, date, date, uuid, text, integer, integer);
drop function if exists public.admin_commerce_sales_summary_report(date, date, uuid, text, integer, integer);
