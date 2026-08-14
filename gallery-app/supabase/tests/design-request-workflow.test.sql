begin;

select plan(19);

select has_table('public', 'design_request_revisions', 'revision snapshots table exists');
select has_table('public', 'design_request_events', 'workflow events table exists');
select has_column('public', 'design_requests', 'current_revision', 'request tracks its current revision');
select has_index('public', 'design_request_revisions', 'idx_design_request_revisions_request', 'revision timeline index exists');
select has_index('public', 'design_request_events', 'idx_design_request_events_request', 'event timeline index exists');

select has_function('public', 'revise_design_request', array['uuid', 'uuid', 'jsonb', 'integer', 'text'], 'buyer revision RPC exists');
select has_function('public', 'advance_custom_order', array['uuid', 'text'], 'custom production RPC exists');
select function_privs_are(
  'public', 'revise_design_request', array['uuid', 'uuid', 'jsonb', 'integer', 'text'],
  'authenticated', array['EXECUTE'], 'only authenticated buyers can invoke revision RPC'
);
select function_privs_are(
  'public', 'advance_custom_order', array['uuid', 'text'],
  'authenticated', array['EXECUTE'], 'only authenticated sellers can invoke production RPC'
);

select has_policy('public', 'design_request_revisions', 'design_request_revisions_select_parties', 'revision history is party-scoped');
select has_policy('public', 'design_request_events', 'design_request_events_select_parties', 'event history is party-scoped');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.design_request_revisions'::regclass),
  'revision history has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.design_request_events'::regclass),
  'event history has RLS enabled'
);

select matches(
  pg_get_functiondef('public.revise_design_request(uuid,uuid,jsonb,integer,text)'::regprocedure),
  'status = ''pending''[^;]*quoted_price = null[^;]*lead_time_days = null',
  'revision submission clears the obsolete quote and returns to pending'
);
select matches(
  pg_get_functiondef('public.revise_design_request(uuid,uuid,jsonb,integer,text)'::regprocedure),
  'current_revision \+ 1',
  'revision sequencing increments exactly once'
);
select matches(
  pg_get_functiondef('public.approve_design_request(uuid)'::regprocedure),
  'status = ''approved'' and v_request.order_id is not null then return',
  'approval is safely idempotent'
);
select matches(
  pg_get_functiondef('public.respond_to_design_request(uuid,text,text,numeric,integer)'::regprocedure),
  'Waiting for the buyer to submit a revision',
  'seller responses reject a stale changes-requested state'
);
select matches(
  pg_get_functiondef('public.advance_custom_order(uuid,text)'::regprocedure),
  'payment_status <> ''paid''',
  'production start requires verified payment'
);
select matches(
  pg_get_functiondef('public.advance_custom_order(uuid,text)'::regprocedure),
  'p_next_status <> v_expected',
  'production RPC rejects skipped and repeated transitions'
);

select * from finish();
rollback;
