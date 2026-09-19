begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_column('public', 'voip_push_delivery_attempts', 'presentation_ack_token_hash', 'delivery attempts store only a presentation capability digest');
select has_column('public', 'voip_push_delivery_attempts', 'presented_at', 'delivery attempts distinguish provider acceptance from CallKit presentation');
select has_function(
  'public',
  'whole_app_acknowledge_ios_callkit_presentation',
  array['uuid','uuid','uuid','text'],
  'exact CallKit presentation acknowledgement RPC exists'
);
select ok(
  not has_function_privilege('authenticated', 'public.whole_app_acknowledge_ios_callkit_presentation(uuid,uuid,uuid,text)', 'EXECUTE'),
  'authenticated clients cannot invoke the server-owned acknowledgement RPC directly'
);
select ok(
  not has_function_privilege('anon', 'public.whole_app_acknowledge_ios_callkit_presentation(uuid,uuid,uuid,text)', 'EXECUTE'),
  'anonymous clients cannot invoke the server-owned acknowledgement RPC directly'
);
select ok(
  has_function_privilege('service_role', 'public.whole_app_acknowledge_ios_callkit_presentation(uuid,uuid,uuid,text)', 'EXECUTE'),
  'the capability-verifying Edge Function can invoke the acknowledgement RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.voip_push_delivery_attempts', 'SELECT'),
  'raw capability digests and delivery evidence remain unreadable to authenticated clients'
);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('11111111-1111-4111-8111-111111111111', false, false),
  ('22222222-2222-4222-8222-222222222222', false, false),
  ('33333333-3333-4333-8333-333333333333', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'direct',
  '11111111-1111-4111-8111-111111111111::22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.chat_thread_members (thread_id, user_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;
insert into public.chat_call_invites (
  id, thread_id, caller_user_id, callee_user_id, call_type, status, expires_at, accepted_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'video', 'ringing', now() - interval '1 minute', null),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'voice', 'accepted', now() + interval '5 minutes', now()),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'video', 'ringing', now() + interval '5 minutes', null);
alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;

insert into public.voip_push_delivery_attempts (
  id, dispatch_key, call_invite_id, recipient_user_id, apns_environment, status, presentation_ack_token_hash
)
values
  ('20000000-0000-4000-8000-000000000001', 'ack-fixture-valid-0001', '10000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'production', 'sent', repeat('a', 64)),
  ('20000000-0000-4000-8000-000000000002', 'ack-fixture-expired-02', '10000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'production', 'sent', repeat('b', 64)),
  ('20000000-0000-4000-8000-000000000003', 'ack-fixture-ended-0003', '10000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'production', 'sent', repeat('c', 64)),
  ('20000000-0000-4000-8000-000000000004', 'ack-fixture-member-0004', '10000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'production', 'sent', repeat('d', 64));

select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    repeat('a', 64)
  ),
  true,
  'the exact live invite, recipient, attempt, and capability digest acknowledge once'
);
select ok(
  (select presented_at is not null from public.voip_push_delivery_attempts where id = '20000000-0000-4000-8000-000000000001'),
  'successful acknowledgement records customer-visible CallKit presentation evidence'
);
select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    repeat('a', 64)
  ),
  false,
  'presentation capability replay is idempotently rejected'
);
select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    repeat('a', 64)
  ),
  false,
  'a wrong capability digest cannot acknowledge another attempt'
);
select ok(
  (select presented_at is null from public.voip_push_delivery_attempts where id = '20000000-0000-4000-8000-000000000002'),
  'wrong capability leaves presentation evidence unchanged'
);
select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    repeat('b', 64)
  ),
  false,
  'an expired ringing invite cannot become presented'
);
select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222',
    repeat('c', 64)
  ),
  false,
  'an already accepted invite cannot receive a late incoming presentation acknowledgement'
);
select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    repeat('b', 64)
  ),
  false,
  'recipient substitution fails closed'
);

delete from public.chat_thread_members
where thread_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and user_id = '22222222-2222-4222-8222-222222222222';
select is(
  public.whole_app_acknowledge_ios_callkit_presentation(
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    '22222222-2222-4222-8222-222222222222',
    repeat('d', 64)
  ),
  false,
  'removed direct-thread membership prevents late CallKit presentation evidence'
);
select throws_ok(
  $$insert into public.voip_push_delivery_attempts (
      id, dispatch_key, call_invite_id, recipient_user_id, apns_environment, status, presentation_ack_token_hash
    ) values (
      '20000000-0000-4000-8000-000000000005', 'ack-fixture-invalid-05', '10000000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222', 'production', 'sent', 'raw-capability-must-not-persist'
    )$$,
  '23514',
  null,
  'malformed or raw presentation capabilities cannot enter durable storage'
);
select ok(
  pg_get_functiondef('public.whole_app_acknowledge_ios_callkit_presentation(uuid,uuid,uuid,text)'::regprocedure)
    like '%invite.%status% = %ringing%'
  and pg_get_functiondef('public.whole_app_acknowledge_ios_callkit_presentation(uuid,uuid,uuid,text)'::regprocedure)
    like '%invite.%expires_at% > clock_timestamp()%'
  and pg_get_functiondef('public.whole_app_acknowledge_ios_callkit_presentation(uuid,uuid,uuid,text)'::regprocedure)
    like '%chat_thread_members%',
  'the atomic RPC retains lifecycle and direct-membership authority checks'
);

select * from finish();
rollback;
