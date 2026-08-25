begin;
select plan(48);

-- ACL and SECURITY DEFINER contract (1-8).
select has_function(
  'public',
  'watch_party_room_actor_blocked_by_host',
  array['text', 'text'],
  '1. the room-host participant block-check function exists'
);

select ok(
  (
    select procedure.prosecdef and procedure.provolatile = 's'
    from pg_proc procedure
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
  ),
  '2. SECURITY DEFINER and stable volatility remain intentional'
);

select ok(
  (
    select procedure.proconfig = array['search_path=""']::text[]
    from pg_proc procedure
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
  ),
  '3. the corrected function has the exact empty search path'
);

select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  '4. PUBLIC has no execute privilege'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.watch_party_room_actor_blocked_by_host(text,text)',
    'EXECUTE'
  ),
  '5. anon has no execute privilege'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.watch_party_room_actor_blocked_by_host(text,text)',
    'EXECUTE'
  ),
  '6. authenticated retains the intended execute privilege'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.watch_party_room_actor_blocked_by_host(text,text)',
    'EXECUTE'
  ),
  '7. service_role retains the intended execute privilege'
);

select is(
  (
    select string_agg(
      grantee_role.rolname::text,
      ','
      order by grantee_role.rolname::text
    )
    from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    join pg_roles grantee_role on grantee_role.oid = acl.grantee
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> procedure.proowner
  ),
  'authenticated,service_role',
  '8. no unexpected non-owner role has execute privilege'
);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('46111111-1111-4111-8111-111111111111', false, false),
  ('46222222-2222-4222-8222-222222222222', false, false),
  ('46333333-3333-4333-8333-333333333333', false, false),
  ('46444444-4444-4444-8444-444444444444', false, false),
  ('46555555-5555-4555-8555-555555555555', false, false),
  ('46666666-6666-4666-8666-666666666666', false, false)
on conflict (id) do nothing;

insert into auth.sessions (id, user_id)
values
  (
    '46111111-1111-4111-8111-111111111101',
    '46111111-1111-4111-8111-111111111111'
  ),
  (
    '46222222-2222-4222-8222-222222222201',
    '46222222-2222-4222-8222-222222222222'
  ),
  (
    '46555555-5555-4555-8555-555555555501',
    '46555555-5555-4555-8555-555555555555'
  ),
  (
    '46666666-6666-4666-8666-666666666601',
    '46666666-6666-4666-8666-666666666666'
  )
on conflict (id) do nothing;

-- Migration 001 requires every source-less Live Stage host to have the
-- complete current server-authoritative creator eligibility projection. These
-- rows establish only the two exact hosts exercised by this block-check test.
insert into public.wave1_creator_eligibility (
  creator_user_id, state, account_status, age_18_plus, legal_accepted,
  creator_role, moderation_state, market, rollout_eligible,
  platform_capability, provider_eligible, kyc_complete, tax_complete,
  sanctions_clear, payout_eligible, authority_source, last_operation_key
)
values
  (
    '46111111-1111-4111-8111-111111111111',
    'VERIFIED', 'ACTIVE', true, true, true, 'CLEAR', 'UNITED_STATES',
    true, true, true, true, true, true, true,
    'room-host-block-check-test', 'room-host-block-check-host-a'
  ),
  (
    '46333333-3333-4333-8333-333333333333',
    'VERIFIED', 'ACTIVE', true, true, true, 'CLEAR', 'UNITED_STATES',
    true, true, true, true, true, true, true,
    'room-host-block-check-test', 'room-host-block-check-host-b'
  );

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

create temporary table watch_party_rooms (
  party_id text,
  host_user_id uuid
);
insert into pg_temp.watch_party_rooms (party_id, host_user_id)
values (
  'ROOM-HOST-BLOCK-CHECK',
  '46444444-4444-4444-8444-444444444444'
);

create or replace function pg_temp.b3_room_block_denial(
  p_party_id text,
  p_actor_user_id text
)
returns text
language plpgsql
as $$
begin
  perform public.watch_party_room_actor_blocked_by_host(
    p_party_id,
    p_actor_user_id
  );
  return 'NO_ERROR';
exception
  when others then
    return sqlstate || ':' || sqlerrm;
end;
$$;

create or replace function pg_temp.b3_membership_insert_denial()
returns text
language plpgsql
as $$
begin
  insert into public.watch_party_room_memberships (party_id, user_id)
  values (
    'ROOM-HOST-BLOCK-CHECK',
    '46444444-4444-4444-8444-444444444444'
  );
  return 'NO_ERROR';
exception
  when others then
    return sqlstate || ':' || sqlerrm;
end;
$$;

create or replace function pg_temp.b3_blocks_digest()
returns text
language sql
stable
as $$
  select pg_catalog.md5(
    coalesce(
      jsonb_agg(
        to_jsonb(block_row)
        order by block_row.channel_user_id, block_row.blocked_user_id
      )::text,
      '[]'
    )
  )
  from public.channel_audience_blocks block_row;
$$;

create or replace function pg_temp.b3_rooms_digest()
returns text
language sql
stable
as $$
  select pg_catalog.md5(
    coalesce(
      jsonb_agg(to_jsonb(room_row) order by room_row.party_id)::text,
      '[]'
    )
  )
  from public.watch_party_rooms room_row;
$$;

create or replace function pg_temp.b3_memberships_digest()
returns text
language sql
stable
as $$
  select pg_catalog.md5(
    coalesce(
      jsonb_agg(
        to_jsonb(membership_row)
        order by membership_row.party_id, membership_row.user_id
      )::text,
      '[]'
    )
  )
  from public.watch_party_room_memberships membership_row;
$$;

-- Authenticated participant and host behavior (9-20).
set local role authenticated;
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
  '9. an authenticated participant may inspect their own room block state'
);

select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  false,
  '10. an unblocked authenticated self-check returns false'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46222222-2222-4222-8222-222222222222","session_id":"46222222-2222-4222-8222-222222222201"}',
  true
);
select public.join_watch_party_room_session(
  'ROOM-HOST-BLOCK-CHECK', null, null, null, false, false, false
);
reset role;

insert into public.channel_audience_blocks (
  channel_user_id,
  blocked_user_id,
  blocked_by_user_id,
  reason
)
values
  (
    '46111111-1111-4111-8111-111111111111',
    '46222222-2222-4222-8222-222222222222',
    '46111111-1111-4111-8111-111111111111',
    'assurance fixture'
  ),
  (
    '46111111-1111-4111-8111-111111111111',
    '46666666-6666-4666-8666-666666666666',
    '46111111-1111-4111-8111-111111111111',
    'assurance blocked-insert fixture'
  );

set local role authenticated;
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
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  true,
  '11. a blocked authenticated self-check returns true'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '12. authenticated role with null auth.uid() is denied'
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
  '13. an actor different from auth.uid() is denied without exact-host authority'
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
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46555555-5555-4555-8555-555555555555'
  ),
  false,
  '14. the exact authenticated host can inspect an unblocked participant'
);

select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  true,
  '15. the exact authenticated host can inspect a blocked participant'
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
  '16. the host of room B cannot inspect an actor under room A'
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
  '17. an unrelated authenticated user cannot inspect another actor'
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
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46555555-5555-4555-8555-555555555555'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '18. a non-host room participant cannot inspect another actor'
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
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-DOES-NOT-EXIST',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '19. an exact host cannot use a nonexistent party id to inspect another actor'
);

select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'OTHER-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '20. other-room denial anchors the exact-party negative control'
);
reset role;

-- Anonymous, null, unknown, and malformed contexts (21-25).
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
  '21. anon cannot invoke the function'
);
reset role;

select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '22. a direct no-JWT postgres invocation is denied'
);

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
  '23. authenticated execution with an absent sub claim is denied'
);

select set_config('request.jwt.claim.role', 'fabricated_role', true);
select set_config(
  'request.jwt.claim.sub',
  '46222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"fabricated_role","sub":"46222222-2222-4222-8222-222222222222"}',
  true
);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '24. an unknown or fabricated request role is denied despite a nonnull sub'
);
reset role;

select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(null, null)$$,
  'P0001',
  'room_block_check_forbidden',
  '25. invalid inputs cannot bypass caller authorization'
);

-- Explicit service-role behavior (26-29).
create temporary table b3_service_snapshot as
select
  pg_temp.b3_blocks_digest() as block_digest,
  pg_temp.b3_rooms_digest() as room_digest,
  pg_temp.b3_memberships_digest() as membership_digest;

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
  '26. the explicit service_role context can perform the bounded check'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )$$,
  'P0001',
  'room_block_check_forbidden',
  '27. null auth.uid() alone never infers service authority'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claim.sub',
  '46444444-4444-4444-8444-444444444444',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"46444444-4444-4444-8444-444444444444"}',
  true
);
select is(
  public.watch_party_room_actor_blocked_by_host(
    'OTHER-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  false,
  '28. service_role remains scoped to the supplied exact room and actor'
);
reset role;

select ok(
  pg_temp.b3_blocks_digest() =
    (select block_digest from b3_service_snapshot)
  and pg_temp.b3_rooms_digest() =
    (select room_digest from b3_service_snapshot)
  and pg_temp.b3_memberships_digest() =
    (select membership_digest from b3_service_snapshot),
  '29. the service-role path creates or modifies no protected row'
);

-- Membership, message, and seat-request enforcement (30-40).
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '46555555-5555-4555-8555-555555555555',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46555555-5555-4555-8555-555555555555","session_id":"46555555-5555-4555-8555-555555555501"}',
  true
);
select lives_ok(
  $$select public.join_watch_party_room_session(
      'ROOM-HOST-BLOCK-CHECK', null, null, null, false, false, false
    )$$,
  '30. an unblocked participant joins through the canonical membership RPC'
);

select set_config(
  'request.jwt.claim.sub',
  '46666666-6666-4666-8666-666666666666',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46666666-6666-4666-8666-666666666666","session_id":"46666666-6666-4666-8666-666666666601"}',
  true
);
select throws_ok(
  $$select public.join_watch_party_room_session(
      'ROOM-HOST-BLOCK-CHECK', null, null, null, false, false, false
    )$$,
  'P0001',
  'blocked_from_room',
  '31. a blocked participant canonical join is denied'
);

select set_config(
  'request.jwt.claim.sub',
  '46222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46222222-2222-4222-8222-222222222222","session_id":"46222222-2222-4222-8222-222222222201"}',
  true
);
select throws_ok(
  $$select public.heartbeat_watch_party_room_session(
      'ROOM-HOST-BLOCK-CHECK', 'reconnecting', false, false,
      false, null, null, null
    )$$,
  'P0001',
  'watch_party_room_unavailable',
  '32. a blocked participant canonical reconnect is denied'
);

select set_config(
  'request.jwt.claim.sub',
  '46555555-5555-4555-8555-555555555555',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46555555-5555-4555-8555-555555555555","session_id":"46555555-5555-4555-8555-555555555501"}',
  true
);
select lives_ok(
  $$insert into public.watch_party_room_messages (
      party_id,
      user_id,
      username,
      text
    ) values (
      'ROOM-HOST-BLOCK-CHECK',
      '46555555-5555-4555-8555-555555555555',
      'unblocked-fixture',
      'unblocked message'
    )$$,
  '33. an unblocked room message succeeds'
);

select set_config(
  'request.jwt.claim.sub',
  '46222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46222222-2222-4222-8222-222222222222","session_id":"46222222-2222-4222-8222-222222222201"}',
  true
);
select throws_ok(
  $$insert into public.watch_party_room_messages (
      party_id,
      user_id,
      username,
      text
    ) values (
      'ROOM-HOST-BLOCK-CHECK',
      '46222222-2222-4222-8222-222222222222',
      'blocked-fixture',
      'blocked message'
    )$$,
  'P0001',
  'blocked_from_room',
  '34. a blocked participant room message is denied'
);

select throws_ok(
  $$insert into public.watch_party_room_messages (
      party_id,
      user_id,
      username,
      text
    ) values (
      'ROOM-HOST-BLOCK-CHECK',
      '46222222-2222-4222-8222-222222222222',
      'blocked-fixture',
      '__chillywood_party_seat_request_v1__:speaker'
    )$$,
  'P0001',
  'blocked_from_room',
  '35. the seat-request marker remains subject to block enforcement'
);

select set_config(
  'request.jwt.claim.sub',
  '46111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46111111-1111-4111-8111-111111111111","session_id":"46111111-1111-4111-8111-111111111101"}',
  true
);
select lives_ok(
  $$select public.join_watch_party_room_session(
      'ROOM-HOST-BLOCK-CHECK', null, null, null, true, true, false
    )$$,
  '36. exact-room host joins through the canonical membership RPC'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '46111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"46111111-1111-4111-8111-111111111111","session_id":"46111111-1111-4111-8111-111111111101"}',
  true
);
select throws_ok(
  $$insert into public.watch_party_room_memberships (party_id, user_id)
    values (
      'ROOM-HOST-BLOCK-CHECK',
      '46444444-4444-4444-8444-444444444444'
  )$$,
  '42501',
  'permission denied for table watch_party_room_memberships',
  '37. host authority cannot bypass RPC-only cross-user membership creation'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(
  pg_temp.b3_membership_insert_denial() like '42501:%',
  '38. anon membership insert remains denied'
);
reset role;

select ok(
  has_function_privilege(
    'authenticated',
    'public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean)',
    'EXECUTE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.watch_party_room_memberships',
    'INSERT'
  )
  and pg_get_functiondef(
    'public.join_watch_party_room_session(text,text,text,text,boolean,boolean,boolean)'::regprocedure
  ) like '%watch_party_room_self_access_allowed_internal%',
  '39. Premium/content access is enforced inside the RPC-only membership boundary'
);

select ok(
  (
    select pg_catalog.lower(procedure.prosrc) not like '%livekit%'
    from pg_proc procedure
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
  ),
  '40. the block-check correction does not change LiveKit publication authority'
);

-- Search-path, leakage, and mutation resistance (41-48).
set local role authenticated;
set local search_path = pg_temp, public, extensions;
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
select is(
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  true,
  '41. an attacker-controlled same-named relation cannot alter the result'
);
reset role;
set local search_path = public, extensions;

select ok(
  (
    select procedure.prosrc like '%auth.jwt()%'
      and procedure.prosrc like '%auth.uid()%'
      and procedure.prosrc like '%from public."watch_party_rooms"%'
      and procedure.prosrc like '%join public."channel_audience_blocks"%'
      and procedure.prosrc not like '%from watch_party_rooms%'
      and procedure.prosrc not like '%join channel_audience_blocks%'
      and procedure.prosrc not like '%request.jwt.claim.role%'
    from pg_proc procedure
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
  ),
  '42. the function resolves only fully qualified trusted objects and auth helpers'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
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
select is(
  pg_temp.b3_room_block_denial(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  pg_temp.b3_room_block_denial(
    'ROOM-DOES-NOT-EXIST',
    '46222222-2222-4222-8222-222222222222'
  ),
  '43. existing-room and nonexistent-room requests expose the same denial class'
);

select is(
  pg_temp.b3_room_block_denial(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  ),
  pg_temp.b3_room_block_denial(
    'ROOM-HOST-BLOCK-CHECK',
    '46555555-5555-4555-8555-555555555555'
  ),
  '44. blocked and unblocked actor requests expose the same denial class'
);
reset role;

select ok(
  (
    select pg_catalog.lower(procedure.prosrc) !~
      '\m(insert|update|delete|merge|execute|format)\M'
    from pg_proc procedure
    where procedure.oid =
      'public.watch_party_room_actor_blocked_by_host(text,text)'::regprocedure
  ),
  '45. the function contains no data mutation, dynamic SQL, or role setting'
);

create temporary table b3_final_snapshot as
select
  pg_temp.b3_blocks_digest() as block_digest,
  pg_temp.b3_rooms_digest() as room_digest,
  pg_temp.b3_memberships_digest() as membership_digest;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config(
  'b3_assurance.last_result',
  public.watch_party_room_actor_blocked_by_host(
    'ROOM-HOST-BLOCK-CHECK',
    '46222222-2222-4222-8222-222222222222'
  )::text,
  true
);
reset role;

select is(
  pg_temp.b3_blocks_digest(),
  (select block_digest from b3_final_snapshot),
  '46. block rows remain unchanged after the bounded check'
);

select is(
  pg_temp.b3_rooms_digest(),
  (select room_digest from b3_final_snapshot),
  '47. room rows remain unchanged after the bounded check'
);

select is(
  pg_temp.b3_memberships_digest(),
  (select membership_digest from b3_final_snapshot),
  '48. membership rows remain unchanged outside explicit rollback-only fixtures'
);

select * from finish();
rollback;
