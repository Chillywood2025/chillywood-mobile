begin;
select plan(12);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('ca110001-0000-4000-8000-000000000001', false, false),
  ('ca110002-0000-4000-8000-000000000002', false, false)
on conflict (id) do nothing;

insert into auth.sessions (id, user_id)
values
  ('ca110001-0000-4000-8000-000000000101', 'ca110001-0000-4000-8000-000000000001'),
  ('ca110002-0000-4000-8000-000000000202', 'ca110002-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.user_profiles (user_id, username, display_name)
values
  ('ca110001-0000-4000-8000-000000000001', 'chat_operational_a', 'Chat Operational A'),
  ('ca110002-0000-4000-8000-000000000002', 'chat_operational_b', 'Chat Operational B')
on conflict (user_id) do update set display_name = excluded.display_name;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ca110001-0000-4000-8000-000000000001","session_id":"ca110001-0000-4000-8000-000000000101"}',
  true
);

insert into public.chat_threads (
  id,
  thread_kind,
  participant_pair_key,
  created_by
) values (
  'ca110000-0000-4000-8000-000000000010',
  'direct',
  'ca110001-0000-4000-8000-000000000001::ca110002-0000-4000-8000-000000000002',
  'ca110001-0000-4000-8000-000000000001'
);

insert into public.chat_thread_members (thread_id, user_id, unread_count)
values
  ('ca110000-0000-4000-8000-000000000010', 'ca110001-0000-4000-8000-000000000001', 4),
  ('ca110000-0000-4000-8000-000000000010', 'ca110002-0000-4000-8000-000000000002', 0);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ca110001-0000-4000-8000-000000000001","session_id":"ca110001-0000-4000-8000-000000000101"}',
  true
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.sync_chat_thread_after_message_insert()'::regprocedure),
  '1. message projection trigger runs with bounded server authority'
);
select ok(
  not has_table_privilege('authenticated', 'public.chat_threads', 'UPDATE'),
  '2. repair does not restore raw client chat-thread update authority'
);

select lives_ok(
  $$insert into public.chat_messages (thread_id, sender_user_id, body, message_type)
    values (
      'ca110000-0000-4000-8000-000000000010',
      'ca110001-0000-4000-8000-000000000001',
      'operational message proof',
      'text'
    ) returning id$$,
  '3. exact-session member can insert and RETURN the message'
);
select is(
  (select last_message_preview from public.chat_threads where id = 'ca110000-0000-4000-8000-000000000010'),
  'operational message proof',
  '4. trigger updates the server-owned thread preview'
);
select is(
  (select unread_count from public.chat_thread_members
   where thread_id = 'ca110000-0000-4000-8000-000000000010'
     and user_id = 'ca110001-0000-4000-8000-000000000001'),
  0,
  '5. sender read state is synchronized'
);
select is(
  (select unread_count from public.chat_thread_members
   where thread_id = 'ca110000-0000-4000-8000-000000000010'
     and user_id = 'ca110002-0000-4000-8000-000000000002'),
  1,
  '6. recipient unread count increments without client authority over that member'
);

select lives_ok(
  $$insert into public.communication_rooms (
      room_id, room_code, host_user_id, status, content_access_rule, capture_policy
    ) values (
      'CHATOP92', 'CHATOP92',
      'ca110001-0000-4000-8000-000000000001',
      'active', 'open', 'best_effort'
    ) returning room_id$$,
  '7. exact-session host can INSERT RETURNING a new communication room'
);
select ok(
  public.communication_room_creation_readback_allowed(
    'CHATOP92',
    'ca110001-0000-4000-8000-000000000001',
    'active',
    null
  ),
  '8. bounded creation readback is available before chat attachment'
);
select lives_ok(
  $$select public.begin_chilly_chat_call(
    'ca110000-0000-4000-8000-000000000010',
    'CHATOP92',
    'voice'
  )$$,
  '9. room can progress into the canonical Chi''lly Chat call begin RPC'
);
select ok(
  not public.communication_room_creation_readback_allowed(
    'CHATOP92',
    'ca110001-0000-4000-8000-000000000001',
    'active',
    null
  ),
  '10. creation-only readback closes after a chat thread attaches'
);
select ok(
  public.can_read_communication_room_authority('CHATOP92'),
  '11. attached room is readable only through canonical room/thread authority'
);
select is(
  (select status from public.chat_call_invites
   where thread_id = 'ca110000-0000-4000-8000-000000000010'
     and communication_room_id = 'CHATOP92'
   order by created_at desc limit 1),
  'ringing',
  '12. call begin creates the expected ringing invite'
);

select * from finish();
rollback;
