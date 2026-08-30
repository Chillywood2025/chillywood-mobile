begin;
select plan(5);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('11111111-1111-1111-1111-111111111111', false, false),
  ('22222222-2222-2222-2222-222222222222', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.communication_rooms (
  room_id, room_code, host_user_id, status, last_activity_at
)
values (
  '9CAYUZ', '9CAYUZ', '11111111-1111-1111-1111-111111111111', 'active', now()
);

insert into public.chat_threads (
  id, thread_kind, participant_pair_key, created_by,
  active_communication_room_id, active_call_type
)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'direct',
  '11111111-1111-1111-1111-111111111111::22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '9CAYUZ',
  'video'
);

insert into public.chat_thread_members (thread_id, user_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222');

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;
insert into public.chat_call_invites (
  id, thread_id, communication_room_id, caller_user_id, callee_user_id,
  call_type, status, expires_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '9CAYUZ',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'video', 'ringing', now() + interval '5 minutes'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '9CAYUZ',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'video', 'ringing', now() + interval '5 minutes'
  );
alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;

select lives_ok(
  $$select public.transition_chilly_chat_call_invite(
    '10000000-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'accepted', null
  )$$,
  'callee can accept an active canonical text room without pre-existing room membership'
);
select is(
  (select status from public.chat_call_invites where id = '10000000-0000-0000-0000-000000000001'),
  'accepted',
  'authoritative transition records acceptance'
);
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id = '9CAYUZ'),
  0,
  'acceptance does not require or manufacture pre-accept room membership'
);

update public.communication_rooms set status = 'ended' where room_id = '9CAYUZ';
select throws_ok(
  $$select public.transition_chilly_chat_call_invite(
    '10000000-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'accepted', null
  )$$,
  'chat_call_invite_room_authority_invalid',
  'authoritative acceptance rejects an ended communication room'
);
select is(
  (select status from public.chat_call_invites where id = '10000000-0000-0000-0000-000000000002'),
  'ringing',
  'rejected acceptance leaves the invite unchanged'
);

select * from finish();
rollback;
