begin;
select plan(18);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('11111111-1111-1111-1111-111111111111', false, false),
  ('22222222-2222-2222-2222-222222222222', false, false),
  ('33333333-3333-3333-3333-333333333333', false, false)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'direct', '11111111:22222222', '11111111-1111-1111-1111-111111111111');

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

select * from finish();
rollback;
