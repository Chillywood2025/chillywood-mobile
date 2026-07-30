begin;
select plan(18);

select has_function(
  'public',
  'watch_party_room_actor_blocked_by_host',
  array['text', 'text'],
  'the room-host participant block-check function exists'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']
    from pg_proc procedure
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
  ),
  'the corrected block check uses an empty search-path security-definer boundary'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.watch_party_room_actor_blocked_by_host(text,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot inspect participant block state'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.watch_party_room_actor_blocked_by_host(text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.watch_party_room_actor_blocked_by_host(text,text)',
    'EXECUTE'
  ),
  'only the authenticated and service-role entry paths retain execution grants'
);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('46111111-1111-4111-8111-111111111111', false, false),
  ('46222222-2222-4222-8222-222222222222', false, false),
  ('46333333-3333-4333-8333-333333333333', false, false),
  ('46444444-4444-4444-8444-444444444444', false, false)
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
values
  (
    'ROOM-HOST-BLOCK-CHECK',
    '46111111-1111-4111-8111-111111111111',
    'live',
    'open',
    'open',
    true,
    'paused',
    0,
    now(),
    now()
  ),
  (
    'OTHER-HOST-BLOCK-CHECK',
    '46333333-3333-4333-8333-333333333333',
    'live',
    'open',
    'open',
    true,
    'paused',
    0,
    now(),
    now()
  );

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  '42501',
  'permission denied for function watch_party_room_actor_blocked_by_host',
  'anonymous execution is denied at the function boundary'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  'authenticated execution without a subject fails closed'
);

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  'an authenticated database role cannot spoof service authority with claims'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '46222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46222222-2222-4222-8222-222222222222"}',
  true
);
select lives_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'a participant may evaluate their own room block state'
);

select set_config(
  'request.jwt.claim.sub',
  '46111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46111111-1111-4111-8111-111111111111"}',
  true
);
select lives_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'the exact room host may evaluate a participant block state'
);
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  false,
  'the exact host sees an unblocked participant as unblocked'
);

insert into public.channel_audience_blocks (
  channel_user_id,
  blocked_user_id,
  blocked_by_user_id,
  reason
)
values (
  '46111111-1111-4111-8111-111111111111',
  '46222222-2222-4222-8222-222222222222',
  '46111111-1111-4111-8111-111111111111',
  'assurance fixture'
);

select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  true,
  'the exact host sees a blocked participant as blocked'
);

select set_config(
  'request.jwt.claim.sub',
  '46222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46222222-2222-4222-8222-222222222222"}',
  true
);
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  true,
  'the blocked participant sees their own room block state'
);

select set_config(
  'request.jwt.claim.sub',
  '46333333-3333-4333-8333-333333333333',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46333333-3333-4333-8333-333333333333"}',
  true
);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  'a host of another room cannot inspect this room participant'
);

select set_config(
  'request.jwt.claim.sub',
  '46444444-4444-4444-8444-444444444444',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46444444-4444-4444-8444-444444444444"}',
  true
);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  'an unrelated authenticated user cannot inspect another participant'
);

select set_config(
  'request.jwt.claim.sub',
  '46222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46222222-2222-4222-8222-222222222222"}',
  true
);
select is(
  public.watch_party_room_actor_blocked_by_host(
    '',
    '46222222-2222-4222-8222-222222222222'
  ),
  false,
  'an empty room identifier returns false without querying authority state'
);
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    ''
  ),
  false,
  'an empty actor identifier returns false without querying authority state'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  true,
  'the explicit service-role path may inspect the blocked participant'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  'service database role without the matching request claim fails closed'
);
reset role;

select * from finish();
rollback;
