begin;
select plan(15);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('41111111-1111-4111-8111-111111111111', false, false),
  ('42222222-2222-4222-8222-222222222222', false, false),
  ('43333333-3333-4333-8333-333333333333', false, false)
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
