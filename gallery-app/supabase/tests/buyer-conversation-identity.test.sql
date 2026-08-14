begin;

select plan(13);

select has_function('private', 'apply_conversation_buyer_identity', 'conversation identity trigger function exists');
select has_function('private', 'sync_auth_user_conversation_identity', 'Auth identity propagation function exists');
select has_trigger('public', 'conversations', 'conversations_apply_buyer_identity', 'conversations enforce canonical buyer identity');
select has_trigger('auth', 'users', 'auth_user_sync_conversation_identity', 'Auth metadata changes propagate to conversations');
select ok(
  not has_function_privilege('authenticated', 'private.apply_conversation_buyer_identity()', 'EXECUTE'),
  'authenticated clients cannot invoke the identity trigger directly'
);
select ok(
  not has_function_privilege('anon', 'private.sync_auth_user_conversation_identity()', 'EXECUTE'),
  'anonymous clients cannot invoke Auth synchronization directly'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'named-buyer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Maria Santos","avatar_url":"https://example.test/maria.jpg"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'unnamed-buyer@example.test', '', now(),
    '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  );

insert into public.shops (id, name, email)
values ('20000000-0000-4000-8000-000000000001', 'Identity Test Shop', 'identity-shop@example.test');

insert into public.conversations (id, buyer_id, shop_id, buyer_name, buyer_avatar)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Spoofed Name',
    'https://attacker.test/avatar.jpg'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Buyer',
    ''
  );

select is(
  (select buyer_name from public.conversations where id = '30000000-0000-4000-8000-000000000001'),
  'Maria Santos',
  'conversation insert uses the account name instead of supplied text'
);
select is(
  (select buyer_avatar from public.conversations where id = '30000000-0000-4000-8000-000000000001'),
  'https://example.test/maria.jpg',
  'conversation insert uses the account avatar instead of supplied text'
);
select is(
  (select buyer_name from public.conversations where id = '30000000-0000-4000-8000-000000000002'),
  'Customer',
  'accounts without a saved name use the private Customer fallback'
);

update auth.users
set raw_user_meta_data = '{"name":"Maria Cruz","avatar_url":"https://example.test/maria-new.jpg"}'
where id = '10000000-0000-4000-8000-000000000001';

select is(
  (select buyer_name from public.conversations where id = '30000000-0000-4000-8000-000000000001'),
  'Maria Cruz',
  'account name changes propagate to existing conversations'
);
select is(
  (select buyer_avatar from public.conversations where id = '30000000-0000-4000-8000-000000000001'),
  'https://example.test/maria-new.jpg',
  'account avatar changes propagate to existing conversations'
);
select is(
  (select count(*)::integer from public.conversations
   where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')
     and buyer_name in ('', 'Buyer')),
  0,
  'the migration leaves no blank or legacy Buyer identity behind'
);
select matches(
  pg_get_functiondef('private.apply_conversation_buyer_identity()'::regprocedure),
  'Conversation buyer cannot be reassigned by a client',
  'authenticated clients cannot reassign conversation ownership'
);

select * from finish();
rollback;
