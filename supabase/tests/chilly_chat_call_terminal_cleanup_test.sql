begin;
select plan(22);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('81111111-1111-1111-1111-111111111111', false, false),
  ('82222222-2222-2222-2222-222222222222', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '81111111-1111-1111-1111-111111111111', true);

insert into public.chat_threads (
  id, thread_kind, participant_pair_key, created_by
)
values
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'direct', 'terminal-cleanup-1', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'direct', 'terminal-cleanup-2', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'direct', 'terminal-cleanup-3', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'direct', 'terminal-cleanup-4', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'direct', 'terminal-cleanup-5', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'direct', 'terminal-cleanup-6', '81111111-1111-1111-1111-111111111111');

insert into public.chat_thread_members (thread_id, user_id)
select thread_id, user_id
from (
  values
    ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid),
    ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid),
    ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'::uuid),
    ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'::uuid),
    ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'::uuid),
    ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'::uuid)
) threads(thread_id)
cross join (
  values
    ('81111111-1111-1111-1111-111111111111'::text),
    ('82222222-2222-2222-2222-222222222222'::text)
) users(user_id);

alter table public.communication_rooms disable trigger enforce_communication_rooms_abuse_guard;

insert into public.communication_rooms (room_id, room_code, host_user_id, status)
values
  ('TERMINALROOM1', 'TERM1', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM2', 'TERM2', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM3', 'TERM3', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM4', 'TERM4', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM5', 'TERM5', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM6', 'TERM6', '81111111-1111-1111-1111-111111111111', 'active');

alter table public.communication_rooms enable trigger enforce_communication_rooms_abuse_guard;

update public.chat_threads
set
  active_communication_room_id = 'TERMINALROOM' || right(id::text, 1),
  active_call_type = case when right(id::text, 1)::integer % 2 = 0 then 'video' else 'voice' end
where id in (
  '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'
);

insert into public.communication_room_memberships (
  room_id, user_id, role, membership_state, camera_enabled, mic_enabled
)
select
  room_id,
  user_id,
  case when user_id = '81111111-1111-1111-1111-111111111111' then 'host' else 'participant' end,
  'active',
  true,
  true
from (
  values
    ('TERMINALROOM1'::text),
    ('TERMINALROOM2'::text),
    ('TERMINALROOM3'::text),
    ('TERMINALROOM4'::text),
    ('TERMINALROOM5'::text),
    ('TERMINALROOM6'::text)
) rooms(room_id)
cross join (
  values
    ('81111111-1111-1111-1111-111111111111'::text),
    ('82222222-2222-2222-2222-222222222222'::text)
) users(user_id);

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;

insert into public.chat_call_invites (
  id, thread_id, communication_room_id, caller_user_id, callee_user_id,
  call_type, status, expires_at, accepted_at
)
values
  ('80000000-0000-0000-0000-000000000001', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'TERMINALROOM1', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('80000000-0000-0000-0000-000000000002', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'TERMINALROOM2', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'video', 'ringing', now() + interval '5 minutes', null),
  ('80000000-0000-0000-0000-000000000003', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'TERMINALROOM3', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'voice', 'ringing', now() - interval '1 minute', null),
  ('80000000-0000-0000-0000-000000000004', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'TERMINALROOM4', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'video', 'accepted', now() + interval '5 minutes', now() - interval '1 minute'),
  ('80000000-0000-0000-0000-000000000005', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'TERMINALROOM5', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('80000000-0000-0000-0000-000000000006', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'TERMINALROOM6', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'video', 'ringing', now() + interval '5 minutes', null);

alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;

select has_trigger(
  'public',
  'chat_call_invites',
  'cleanup_terminal_chilly_chat_call_product_state',
  'terminal product-state cleanup trigger exists'
);

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000001', '81111111-1111-1111-1111-111111111111', 'canceled', null)$$,
  'caller cancel atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000002', '82222222-2222-2222-2222-222222222222', 'declined', null)$$,
  'callee decline atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000003', '81111111-1111-1111-1111-111111111111', 'missed', null)$$,
  'timeout atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000004', '82222222-2222-2222-2222-222222222222', 'ended', 60)$$,
  'accepted call end atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000005', '82222222-2222-2222-2222-222222222222', 'busy', null)$$,
  'callee busy atomically cleans product state'
);

select is(
  (select count(*)::integer from public.communication_rooms where room_id between 'TERMINALROOM1' and 'TERMINALROOM5' and status = 'ended'),
  5,
  'all terminal statuses close their exact communication rooms'
);
select is(
  (select count(*)::integer from public.chat_threads where id in (
    '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'
  ) and active_communication_room_id is null and active_call_type is null),
  5,
  'all terminal statuses clear exact thread call linkage'
);
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id between 'TERMINALROOM1' and 'TERMINALROOM5' and membership_state = 'left'),
  10,
  'all accepted and pre-accept terminal memberships become left'
);
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id between 'TERMINALROOM1' and 'TERMINALROOM5' and left_at is not null),
  10,
  'terminal membership cleanup records bounded departure time'
);
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id between 'TERMINALROOM1' and 'TERMINALROOM5' and not camera_enabled and not mic_enabled),
  10,
  'terminal membership cleanup disables published-media state'
);

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000001', '81111111-1111-1111-1111-111111111111', 'canceled', null)$$,
  'duplicate terminal transition remains idempotent'
);
select is(
  (select count(*)::integer from public.chat_call_events where call_invite_id = '80000000-0000-0000-0000-000000000001' and event_type = 'canceled'),
  1,
  'duplicate terminal transition still records one history event'
);

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000006', '82222222-2222-2222-2222-222222222222', 'accepted', null)$$,
  'acceptance remains non-terminal'
);
select is((select status from public.communication_rooms where room_id = 'TERMINALROOM6'), 'active', 'acceptance keeps the communication room active');
select is(
  (select active_communication_room_id from public.chat_threads where id = '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'),
  'TERMINALROOM6',
  'acceptance keeps exact thread linkage'
);
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id = 'TERMINALROOM6' and membership_state = 'active'),
  2,
  'acceptance keeps participant memberships active'
);

select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000006', '81111111-1111-1111-1111-111111111111', 'ended', 1)$$,
  'the accepted call can subsequently end'
);
select is((select status from public.communication_rooms where room_id = 'TERMINALROOM6'), 'ended', 'subsequent end closes the room');
select is(
  (select active_communication_room_id from public.chat_threads where id = '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'),
  null,
  'subsequent end clears thread linkage'
);
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id = 'TERMINALROOM6' and membership_state = 'left'),
  2,
  'subsequent end leaves both memberships'
);
select is(
  has_function_privilege('authenticated', 'public.cleanup_terminal_chilly_chat_call_product_state()', 'execute'),
  false,
  'clients cannot invoke the privileged cleanup trigger function'
);

select * from finish();
rollback;
