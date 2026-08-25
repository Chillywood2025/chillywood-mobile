begin;
select plan(16);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('71111111-1111-1111-1111-111111111111', false, false),
  ('72222222-2222-2222-2222-222222222222', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '71111111-1111-1111-1111-111111111111', true);

insert into public.chat_threads (
  id, thread_kind, participant_pair_key, created_by
) values (
  '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'direct',
  '71111111-1111-1111-1111-111111111111::72222222-2222-2222-2222-222222222222',
  '71111111-1111-1111-1111-111111111111'
);

insert into public.chat_thread_members (thread_id, user_id)
values
  ('7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '71111111-1111-1111-1111-111111111111'),
  ('7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '72222222-2222-2222-2222-222222222222');

insert into public.communication_rooms (
  room_id, room_code, host_user_id, status
) values (
  'EXPIRYROOM1',
  'EXPIRYROOM1',
  '71111111-1111-1111-1111-111111111111',
  'active'
);

update public.chat_threads
set
  active_communication_room_id = 'EXPIRYROOM1',
  active_call_type = 'video'
where id = '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;

insert into public.chat_call_invites (
  id,
  thread_id,
  communication_room_id,
  caller_user_id,
  callee_user_id,
  call_type,
  status,
  expires_at
) values
  (
    '70000000-0000-0000-0000-000000000001',
    '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'EXPIRYROOM1',
    '71111111-1111-1111-1111-111111111111',
    '72222222-2222-2222-2222-222222222222',
    'video',
    'ringing',
    now() - interval '1 minute'
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    null,
    '71111111-1111-1111-1111-111111111111',
    '72222222-2222-2222-2222-222222222222',
    'voice',
    'ringing',
    now() + interval '5 minutes'
  );

alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;

select has_function(
  'public',
  'expire_stale_chilly_chat_call_invites',
  array['integer'],
  'server-owned stale-call expiry function exists'
);
select is(
  has_function_privilege('authenticated', 'public.expire_stale_chilly_chat_call_invites(integer)', 'execute'),
  false,
  'authenticated clients cannot execute autonomous timeout expiry'
);
select is(
  has_function_privilege('service_role', 'public.expire_stale_chilly_chat_call_invites(integer)', 'execute'),
  true,
  'the scoped service worker may execute timeout expiry'
);

create temporary table expiry_result (payload jsonb);
select lives_ok(
  $$insert into expiry_result select public.expire_stale_chilly_chat_call_invites(10)$$,
  'the autonomous worker can expire a bounded batch without a mobile client'
);
select is((select (payload ->> 'expiredCount')::integer from expiry_result), 1, 'one stale ringing call is expired');
select is((select (payload ->> 'deliveryCreatedCount')::integer from expiry_result), 1, 'timeout creates one durable delivery');
select is(
  (select status from public.chat_call_invites where id = '70000000-0000-0000-0000-000000000001'),
  'missed',
  'stale ringing invite becomes missed'
);
select is(
  (select count(*)::integer from public.chat_call_events where call_invite_id = '70000000-0000-0000-0000-000000000001' and event_type = 'missed'),
  1,
  'timeout writes one durable missed event'
);
select is(
  (select dispatch_action from public.chat_call_transition_deliveries where call_invite_id = '70000000-0000-0000-0000-000000000001'),
  'timeout',
  'timeout delivery uses terminal cleanup action'
);
select is(
  (select delivery_status from public.chat_call_transition_deliveries where call_invite_id = '70000000-0000-0000-0000-000000000001'),
  'pending',
  'terminal cleanup remains durable for the retry dispatcher'
);
select is((select status from public.communication_rooms where room_id = 'EXPIRYROOM1'), 'ended', 'expired call closes its media room');
select is(
  (select active_communication_room_id from public.chat_threads where id = '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  null,
  'expired call clears the active thread room'
);
select is(
  (select active_call_type from public.chat_threads where id = '7aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  null,
  'expired call clears the active thread call type'
);
select is(
  (select status from public.chat_call_invites where id = '70000000-0000-0000-0000-000000000002'),
  'ringing',
  'a non-expired invite is not touched'
);
select is(
  (select (public.expire_stale_chilly_chat_call_invites(10) ->> 'expiredCount')::integer),
  0,
  'repeated worker execution is idempotent'
);
select is(
  (select count(*)::integer from public.chat_call_transition_deliveries where call_invite_id = '70000000-0000-0000-0000-000000000001'),
  1,
  'repeated expiry cannot duplicate terminal delivery'
);

select * from finish();
rollback;
