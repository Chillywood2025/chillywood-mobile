begin;
select plan(25);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('41111111-1111-4111-8111-111111111111', false, false),
  ('42222222-2222-4222-8222-222222222222', false, false),
  ('43333333-3333-4333-8333-333333333333', false, false),
  ('44444444-4444-4444-8444-444444444444', false, false),
  ('45555555-5555-4555-8555-555555555555', false, false),
  ('46666666-6666-4666-8666-666666666666', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '41111111-1111-4111-8111-111111111111', true);

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values ('4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'direct', 'atomic-call-pair', '41111111-1111-4111-8111-111111111111');

insert into public.chat_thread_members (thread_id, user_id)
values
  ('4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '41111111-1111-4111-8111-111111111111'),
  ('4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '42222222-2222-4222-8222-222222222222');

insert into public.communication_rooms (room_id, room_code, host_user_id, status)
values
  ('ATOMIC1', 'ATOMIC1', '41111111-1111-4111-8111-111111111111', 'active'),
  ('ATOMIC2', 'ATOMIC2', '42222222-2222-4222-8222-222222222222', 'active'),
  ('ATOMIC3', 'ATOMIC3', '43333333-3333-4333-8333-333333333333', 'active');

create temporary table call_begin_results (label text primary key, payload jsonb not null);

insert into call_begin_results
values (
  'first',
  public.begin_chilly_chat_call('4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ATOMIC1', 'video')
);

select ok((select (payload ->> 'created')::boolean from call_begin_results where label = 'first'), 'first participant creates the call');
select is((select payload ->> 'role' from call_begin_results where label = 'first'), 'caller', 'first participant is the caller');
select is((select count(*)::integer from public.chat_call_invites where thread_id = '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1, 'one durable invite is created');
select is((select count(*)::integer from public.chat_call_events where thread_id = '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and event_type = 'started'), 1, 'one started event is created');
select is((select active_communication_room_id from public.chat_threads where id = '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'ATOMIC1', 'winning room is attached to the thread');

select set_config('request.jwt.claim.sub', '42222222-2222-4222-8222-222222222222', true);
insert into call_begin_results
values (
  'second',
  public.begin_chilly_chat_call('4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ATOMIC2', 'video')
);

select ok(not (select (payload ->> 'created')::boolean from call_begin_results where label = 'second'), 'simultaneous reverse call reuses the winner');
select is((select payload ->> 'role' from call_begin_results where label = 'second'), 'callee', 'second participant becomes the callee');
select is(
  (select payload #>> '{invite,id}' from call_begin_results where label = 'second'),
  (select payload #>> '{invite,id}' from call_begin_results where label = 'first'),
  'both devices receive the same invite identity'
);
select is((select count(*)::integer from public.chat_call_invites where thread_id = '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1, 'collision creates no competing invite');
select is((select active_communication_room_id from public.chat_threads where id = '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'ATOMIC1', 'losing start cannot overwrite the winning room');
select is((select status from public.communication_rooms where room_id = 'ATOMIC2'), 'ended', 'losing candidate room is closed');
select is((select status from public.communication_rooms where room_id = 'ATOMIC1'), 'active', 'winning room remains active');

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values
  ('4bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'direct', 'busy-established-pair', '45555555-5555-4555-8555-555555555555'),
  ('4ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'direct', 'busy-overlap-pair', '44444444-4444-4444-8444-444444444444');

insert into public.chat_thread_members (thread_id, user_id)
values
  ('4bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '45555555-5555-4555-8555-555555555555'),
  ('4bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '46666666-6666-4666-8666-666666666666'),
  ('4ccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444'),
  ('4ccccccc-cccc-4ccc-8ccc-cccccccccccc', '45555555-5555-4555-8555-555555555555');

insert into public.communication_rooms (room_id, room_code, host_user_id, status)
values
  ('BUSYACTIVE', 'BUSYACTIVE', '45555555-5555-4555-8555-555555555555', 'active'),
  ('BUSYCANDIDATE', 'BUSYCANDIDATE', '44444444-4444-4444-8444-444444444444', 'active');

insert into public.communication_room_memberships (
  room_id, user_id, role, membership_state, camera_enabled, mic_enabled
)
values
  ('BUSYACTIVE', '45555555-5555-4555-8555-555555555555', 'host', 'active', true, true),
  ('BUSYACTIVE', '46666666-6666-4666-8666-666666666666', 'participant', 'active', true, true),
  ('BUSYCANDIDATE', '44444444-4444-4444-8444-444444444444', 'host', 'active', true, true);

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;
insert into public.chat_call_invites (
  id, thread_id, communication_room_id, caller_user_id, callee_user_id,
  call_type, status, expires_at, accepted_at
)
values (
  '47777777-7777-4777-8777-777777777777',
  '4bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'BUSYACTIVE',
  '45555555-5555-4555-8555-555555555555',
  '46666666-6666-4666-8666-666666666666',
  'voice',
  'accepted',
  now() + interval '5 minutes',
  now()
);
alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
insert into call_begin_results
values (
  'busy',
  public.begin_chilly_chat_call('4ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'BUSYCANDIDATE', 'video')
);

select ok(not (select (payload ->> 'created')::boolean from call_begin_results where label = 'busy'), 'callee overlap is rejected before incoming delivery');
select is((select payload #>> '{invite,status}' from call_begin_results where label = 'busy'), 'busy', 'overlap returns an authoritative busy invite');
select is(
  (select count(*)::integer
   from public.chat_call_events
   where call_invite_id = ((select payload #>> '{invite,id}' from call_begin_results where label = 'busy'))::uuid
     and event_type = 'busy'),
  1,
  'overlap records one durable busy event'
);
select is(
  (select delivery_status
   from public.chat_call_transition_deliveries
   where call_invite_id = ((select payload #>> '{invite,id}' from call_begin_results where label = 'busy'))::uuid
     and target_status = 'busy'),
  'skipped',
  'busy terminal delivery is explicitly skipped without a second push'
);
select is((select status from public.communication_rooms where room_id = 'BUSYCANDIDATE'), 'ended', 'busy overlap closes its candidate room');
select is(
  (select membership_state from public.communication_room_memberships where room_id = 'BUSYCANDIDATE'),
  'left',
  'busy overlap leaves its only candidate membership'
);
select is(
  (select active_communication_room_id from public.chat_threads where id = '4ccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  null,
  'busy overlap never attaches a room to its thread'
);
select is((select status from public.communication_rooms where room_id = 'BUSYACTIVE'), 'active', 'busy overlap preserves the established room');
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id = 'BUSYACTIVE' and membership_state = 'active'),
  2,
  'busy overlap preserves both established memberships'
);
select is(
  (select count(*)::integer
   from public.chat_call_invites
   where thread_id = '4ccccccc-cccc-4ccc-8ccc-cccccccccccc'
     and status in ('ringing', 'accepted')),
  0,
  'busy overlap leaves no second ringing or accepted invite'
);

select throws_ok(
  $$insert into public.chat_call_invites (
    thread_id, communication_room_id, caller_user_id, callee_user_id, call_type, status, expires_at
  ) values (
    '4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ATOMIC2',
    '42222222-2222-4222-8222-222222222222', '41111111-1111-4111-8111-111111111111',
    'voice', 'ringing', now() + interval '45 seconds'
  )$$,
  'active_call_invite_exists',
  'legacy reverse-direction insert cannot create a competing ringing call'
);

select set_config('request.jwt.claim.sub', '43333333-3333-4333-8333-333333333333', true);
select throws_ok(
  $$select public.begin_chilly_chat_call('4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ATOMIC3', 'voice')$$,
  'chat_call_thread_access_required',
  'non-member cannot begin a call'
);

select ok(
  has_function_privilege('authenticated', 'public.begin_chilly_chat_call(uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.begin_chilly_chat_call(uuid,text,text)', 'execute'),
  'only authenticated/service call paths may invoke the begin operation'
);

select * from finish();
rollback;
