begin;
select plan(30);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('11111111-1111-1111-1111-111111111111', false, false),
  ('22222222-2222-2222-2222-222222222222', false, false),
  ('33333333-3333-3333-3333-333333333333', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'direct',
  '11111111-1111-1111-1111-111111111111::22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111'
);

insert into public.chat_thread_members (thread_id, user_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222');

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;

insert into public.chat_call_invites (
  id, thread_id, caller_user_id, callee_user_id, call_type, status, expires_at, accepted_at
)
values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'video', 'ringing', now() + interval '5 minutes', null),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'video', 'ringing', now() - interval '1 minute', null),
  ('10000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'voice', 'accepted', now() + interval '5 minutes', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'video', 'accepted', now() + interval '5 minutes', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('10000000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'video', 'ringing', now() + interval '5 minutes', null);

alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'canceled', null)$$,
  'caller can cancel before answer'
);
select is((select status from public.chat_call_invites where id = '10000000-0000-0000-0000-000000000001'), 'canceled', 'cancel updates invite');
select is((select dispatch_action from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'), 'cancel', 'cancel creates durable terminal action');

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'declined', null)$$,
  'callee can decline'
);
select is((select dispatch_action from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000002'), 'declined', 'decline creates durable terminal action');

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'missed', null)$$,
  'expired ringing call can transition through server timeout validation'
);
select is((select dispatch_action from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000003'), 'timeout', 'timeout creates durable terminal action');

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'ended', 60)$$,
  'caller can end an active call'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'ended', 61)$$,
  'callee can end an active call'
);
select is((select count(*)::integer from public.chat_call_transition_deliveries where dispatch_action = 'end'), 2, 'both end transitions have durable delivery records');

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'canceled', null)$$,
  'duplicate transition is retry safe'
);
select is((select count(*)::integer from public.chat_call_events where call_invite_id = '10000000-0000-0000-0000-000000000001' and event_type = 'canceled'), 1, 'duplicate transition creates one call event');
select is((select count(*)::integer from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'), 1, 'duplicate transition creates one delivery record');
select is((select delivery_status from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'), 'pending', 'delivery survives immediate client backgrounding as pending state');

select throws_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'canceled', null)$$,
  'transition_not_call_participant',
  'non-participant transition is rejected'
);
select is((select status from public.chat_call_invites where id = '10000000-0000-0000-0000-000000000006'), 'ringing', 'unauthorized request leaves invite unchanged');

select throws_ok(
  $$select public.transition_chilly_chat_call_invite('10000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'canceled', null)$$,
  'transition_cancel_forbidden',
  'callee cannot cancel as caller'
);
select is((select count(*)::integer from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000007'), 0, 'rejected transition creates no delivery record');

update public.chat_call_transition_deliveries
set delivery_status = 'skipped', completed_at = now()
where call_invite_id <> '10000000-0000-0000-0000-000000000001';

create temporary table retry_claims (payload jsonb);
insert into retry_claims select * from public.claim_chilly_chat_call_transition_delivery_batch(1);
select is((select count(*)::integer from retry_claims), 1, 'server worker claims one pending terminal delivery');
select is(
  (select delivery_status from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'),
  'dispatching',
  'worker claim owns a bounded dispatch lease'
);
select is(
  (select attempt_count from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'first worker claim increments the attempt count'
);
select lives_ok(
  $$select public.complete_chilly_chat_call_transition_delivery(
    (select id from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'),
    'failed',
    '{"result":{"reason":"provider_failed","status":"failed"},"channels":{}}'::jsonb
  )$$,
  'worker records a sanitized failed result'
);
select is(
  (select severity from public.chat_call_transition_delivery_failures where call_invite_id = '10000000-0000-0000-0000-000000000001'),
  'warning',
  'retry failure is reported without credentials'
);
truncate retry_claims;
insert into retry_claims select * from public.claim_chilly_chat_call_transition_delivery_batch(1);
select is((select count(*)::integer from retry_claims), 0, 'failed delivery cannot bypass retry backoff');

update public.chat_call_transition_deliveries
set last_attempt_at = now() - interval '20 seconds'
where call_invite_id = '10000000-0000-0000-0000-000000000001';
insert into retry_claims select * from public.claim_chilly_chat_call_transition_delivery_batch(1);
select is((select count(*)::integer from retry_claims), 1, 'failed delivery becomes claimable after backoff');
select is(
  (select attempt_count from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'),
  2,
  'retry increments the durable attempt count'
);
select lives_ok(
  $$select public.complete_chilly_chat_call_transition_delivery(
    (select id from public.chat_call_transition_deliveries where call_invite_id = '10000000-0000-0000-0000-000000000001'),
    'sent',
    '{"result":{"reason":"sent","status":"sent"},"channels":{}}'::jsonb
  )$$,
  'successful autonomous retry completes the delivery'
);
select ok(
  (select resolved_at is not null from public.chat_call_transition_delivery_failures where call_invite_id = '10000000-0000-0000-0000-000000000001'),
  'successful retry resolves the failure report'
);
select is(public.authorize_chilly_chat_call_transition_retry('invalid'), false, 'retry worker fails closed before hosted configuration');
select is(
  has_function_privilege('authenticated', 'public.claim_chilly_chat_call_transition_delivery_batch(integer)', 'execute'),
  false,
  'authenticated clients cannot claim retry work'
);

select * from finish();
rollback;
