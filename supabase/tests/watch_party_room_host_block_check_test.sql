begin;
select plan(4);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('45111111-1111-4111-8111-111111111111', false, false),
  ('45222222-2222-4222-8222-222222222222', false, false),
  ('45333333-3333-4333-8333-333333333333', false, false)
on conflict (id) do nothing;

insert into public.watch_party_rooms (
  party_id,
  host_user_id,
  room_type,
  join_policy,
  content_access_rule,
  is_active,
  playback_state,
  playback_position_millis,
  started_at,
  last_activity_at
)
values (
  'HOST-BLOCK-CHECK',
  '45111111-1111-4111-8111-111111111111',
  'live',
  'open',
  'open',
  true,
  'paused',
  0,
  now(),
  now()
);

select set_config('request.jwt.claim.sub', '45222222-2222-4222-8222-222222222222', true);
select lives_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'HOST-BLOCK-CHECK',
    '45222222-2222-4222-8222-222222222222'
  )$$,
  'a participant may evaluate their own room block state'
);

select set_config('request.jwt.claim.sub', '45111111-1111-4111-8111-111111111111', true);
select lives_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'HOST-BLOCK-CHECK',
    '45222222-2222-4222-8222-222222222222'
  )$$,
  'the exact room host may evaluate a participant block state'
);
select is(
  public.watch_party_room_actor_blocked_by_host(
    'HOST-BLOCK-CHECK',
    '45222222-2222-4222-8222-222222222222'
  ),
  false,
  'the host check preserves an unblocked participant result'
);

select set_config('request.jwt.claim.sub', '45333333-3333-4333-8333-333333333333', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'HOST-BLOCK-CHECK',
    '45222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  'an unrelated authenticated user still cannot inspect another actor'
);

select * from finish();
rollback;
