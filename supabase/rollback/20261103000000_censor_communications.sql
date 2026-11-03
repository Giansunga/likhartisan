-- Does not recover original wording. Historical rows were not backfilled.
begin;
drop trigger if exists aa_censor_communication on public.messages;
drop trigger if exists aa_censor_communication on public.conversations;
drop trigger if exists aa_censor_communication on public.notifications;
drop trigger if exists aa_censor_communication on public.product_reviews;
drop trigger if exists aa_censor_communication on public.design_requests;
drop trigger if exists aa_censor_communication on public.design_request_revisions;
drop trigger if exists aa_censor_communication on public.design_request_events;
drop function if exists public.censor_communication_record();
drop function if exists public.censor_message_body(text);
drop function if exists public.censor_message_payload(jsonb);
drop function if exists public.censor_message_text(text);
commit;
