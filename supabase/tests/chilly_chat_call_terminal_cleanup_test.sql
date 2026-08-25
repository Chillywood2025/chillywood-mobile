begin;
select plan(31);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('81111111-1111-1111-1111-111111111111', false, false),
  ('82222222-2222-2222-2222-222222222222', false, false),
  ('83333333-3333-3333-3333-333333333333', false, false),
  ('84444444-4444-4444-4444-444444444444', false, false),
  ('85555555-5555-5555-5555-555555555555', false, false),
  ('86666666-6666-6666-6666-666666666666', false, false),
  ('87777777-7777-7777-7777-777777777777', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '81111111-1111-1111-1111-111111111111', true);

insert into public.chat_threads (
  id, thread_kind, participant_pair_key, created_by
)
values
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'direct', '81111111-1111-1111-1111-111111111111::82222222-2222-2222-2222-222222222222', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'direct', '81111111-1111-1111-1111-111111111111::83333333-3333-3333-3333-333333333333', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'direct', '81111111-1111-1111-1111-111111111111::84444444-4444-4444-4444-444444444444', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'direct', '81111111-1111-1111-1111-111111111111::85555555-5555-5555-5555-555555555555', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'direct', '81111111-1111-1111-1111-111111111111::86666666-6666-6666-6666-666666666666', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'direct', '81111111-1111-1111-1111-111111111111::87777777-7777-7777-7777-777777777777', '81111111-1111-1111-1111-111111111111');

insert into public.chat_thread_members (thread_id, user_id)
values
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '82222222-2222-2222-2222-222222222222'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '83333333-3333-3333-3333-333333333333'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '84444444-4444-4444-4444-444444444444'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '85555555-5555-5555-5555-555555555555'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', '86666666-6666-6666-6666-666666666666'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '81111111-1111-1111-1111-111111111111'),
  ('8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', '87777777-7777-7777-7777-777777777777');

alter table public.communication_rooms disable trigger enforce_communication_rooms_abuse_guard;

insert into public.communication_rooms (room_id, room_code, host_user_id, status)
values
  ('TERMINALROOM1', 'TERMINALROOM1', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM2', 'TERMINALROOM2', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM3', 'TERMINALROOM3', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM4', 'TERMINALROOM4', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM5', 'TERMINALROOM5', '81111111-1111-1111-1111-111111111111', 'active'),
  ('TERMINALROOM6', 'TERMINALROOM6', '81111111-1111-1111-1111-111111111111', 'active');

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
    ('TERMINALROOM1'::text, '81111111-1111-1111-1111-111111111111'::text),
    ('TERMINALROOM1'::text, '82222222-2222-2222-2222-222222222222'::text),
    ('TERMINALROOM2'::text, '81111111-1111-1111-1111-111111111111'::text),
    ('TERMINALROOM2'::text, '83333333-3333-3333-3333-333333333333'::text),
    ('TERMINALROOM3'::text, '81111111-1111-1111-1111-111111111111'::text),
    ('TERMINALROOM3'::text, '84444444-4444-4444-4444-444444444444'::text),
    ('TERMINALROOM4'::text, '81111111-1111-1111-1111-111111111111'::text),
    ('TERMINALROOM4'::text, '85555555-5555-5555-5555-555555555555'::text),
    ('TERMINALROOM5'::text, '81111111-1111-1111-1111-111111111111'::text),
    ('TERMINALROOM5'::text, '86666666-6666-6666-6666-666666666666'::text),
    ('TERMINALROOM6'::text, '81111111-1111-1111-1111-111111111111'::text),
    ('TERMINALROOM6'::text, '87777777-7777-7777-7777-777777777777'::text)
) memberships(room_id, user_id);

alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;

insert into public.chat_call_invites (
  id, thread_id, communication_room_id, caller_user_id, callee_user_id,
  call_type, status, expires_at, accepted_at
)
values
  ('80000000-0000-0000-0000-000000000001', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'TERMINALROOM1', '81111111-1111-1111-1111-111111111111', '82222222-2222-2222-2222-222222222222', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('80000000-0000-0000-0000-000000000002', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'TERMINALROOM2', '81111111-1111-1111-1111-111111111111', '83333333-3333-3333-3333-333333333333', 'video', 'ringing', now() + interval '5 minutes', null),
  ('80000000-0000-0000-0000-000000000003', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'TERMINALROOM3', '81111111-1111-1111-1111-111111111111', '84444444-4444-4444-4444-444444444444', 'voice', 'ringing', now() - interval '1 minute', null),
  ('80000000-0000-0000-0000-000000000004', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'TERMINALROOM4', '81111111-1111-1111-1111-111111111111', '85555555-5555-5555-5555-555555555555', 'video', 'accepted', now() + interval '5 minutes', now() - interval '1 minute'),
  ('80000000-0000-0000-0000-000000000005', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'TERMINALROOM5', '81111111-1111-1111-1111-111111111111', '86666666-6666-6666-6666-666666666666', 'voice', 'ringing', now() + interval '5 minutes', null),
  ('80000000-0000-0000-0000-000000000006', '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'TERMINALROOM6', '81111111-1111-1111-1111-111111111111', '87777777-7777-7777-7777-777777777777', 'video', 'ringing', now() + interval '5 minutes', null);

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
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000002', '83333333-3333-3333-3333-333333333333', 'declined', null)$$,
  'callee decline atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000003', '81111111-1111-1111-1111-111111111111', 'missed', null)$$,
  'timeout atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000004', '85555555-5555-5555-5555-555555555555', 'ended', 60)$$,
  'accepted call end atomically cleans product state'
);
select lives_ok(
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000005', '86666666-6666-6666-6666-666666666666', 'busy', null)$$,
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
  $$select public.transition_chilly_chat_call_invite('80000000-0000-0000-0000-000000000006', '87777777-7777-7777-7777-777777777777', 'accepted', null)$$,
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
select has_trigger(
  'public',
  'chat_threads',
  'prevent_active_chilly_chat_thread_call_clear',
  'active thread-call clear race guard exists'
);
select lives_ok(
  $$update public.chat_threads
    set active_communication_room_id = null, active_call_type = null
    where id = '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'$$,
  'a stale client cleanup is handled while an accepted call remains active'
);
select is(
  (select active_communication_room_id from public.chat_threads where id = '8aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6'),
  'TERMINALROOM6',
  'a stale client cleanup cannot detach an accepted call'
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
select has_trigger(
  'public',
  'communication_room_memberships',
  'prevent_ended_communication_room_membership_reactivation',
  'ended-room membership reactivation guard exists'
);
select lives_ok(
  $$update public.communication_room_memberships
    set membership_state = 'active', camera_enabled = true, mic_enabled = true
    where room_id = 'TERMINALROOM6'
      and user_id = '87777777-7777-7777-7777-777777777777'$$,
  'a stale post-end membership write is handled fail-closed'
);
select is(
  (select membership_state from public.communication_room_memberships
    where room_id = 'TERMINALROOM6'
      and user_id = '87777777-7777-7777-7777-777777777777'),
  'left',
  'a stale post-end write cannot reactivate membership'
);
select is(
  (select camera_enabled or mic_enabled from public.communication_room_memberships
    where room_id = 'TERMINALROOM6'
      and user_id = '87777777-7777-7777-7777-777777777777'),
  false,
  'a stale post-end write cannot reactivate media state'
);
select is(
  has_function_privilege('authenticated', 'public.prevent_ended_communication_room_membership_reactivation()', 'execute'),
  false,
  'clients cannot invoke the privileged membership reactivation guard'
);
select is(
  has_function_privilege('authenticated', 'public.cleanup_terminal_chilly_chat_call_product_state()', 'execute'),
  false,
  'clients cannot invoke the privileged cleanup trigger function'
);
select is(
  has_function_privilege('authenticated', 'public.prevent_active_chilly_chat_thread_call_clear()', 'execute'),
  false,
  'clients cannot invoke the privileged active-call clear guard'
);

select * from finish();
rollback;
