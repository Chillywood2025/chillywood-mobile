begin;
select plan(145);

-- Contract and ACL surface (1-15).
select has_function('public', 'can_access_chat_thread', array['uuid'], '1. exact chat membership helper exists');
select has_function('public', 'get_or_create_direct_chat_thread', array['text', 'text', 'text', 'text'], '2. direct-thread RPC exists');
select has_function('public', 'clear_stale_chilly_chat_thread_call', array['uuid', 'text'], '3. compare-and-clear RPC exists');
select has_function('public', 'can_read_watch_party_room_authority', array['text'], '4. Watch-Party read helper exists');
select has_function('public', 'can_read_communication_room_authority', array['text'], '5. communication read helper exists');
select has_function('public', 'join_communication_room_session', array['text', 'text', 'text', 'boolean', 'boolean'], '6. communication join RPC exists');
select has_function('public', 'can_access_communication_realtime_topic', array['text'], '7. private Realtime helper exists');

select ok(not has_table_privilege('authenticated', 'public.chat_threads', 'INSERT'), '8. clients cannot insert chat threads');
select ok(not has_table_privilege('authenticated', 'public.chat_threads', 'UPDATE'), '9. clients cannot mutate active-room or pair authority');
select ok(
  not has_table_privilege('authenticated', 'public.chat_thread_members', 'INSERT')
  and not has_column_privilege('authenticated', 'public.chat_thread_members', 'thread_id', 'UPDATE')
  and has_column_privilege('authenticated', 'public.chat_thread_members', 'last_read_at', 'UPDATE'),
  '10. clients cannot add/reparent thread members; only bounded read state remains writable'
);
select ok(not has_table_privilege('authenticated', 'public.chat_call_invites', 'INSERT'), '11. clients cannot fabricate call invites');
select ok(not has_table_privilege('authenticated', 'public.chat_call_invites', 'UPDATE'), '12. clients cannot mutate invite lifecycle');
select ok(not has_table_privilege('authenticated', 'public.communication_room_memberships', 'INSERT'), '13. communication membership creation is RPC-only');
select ok(not has_column_privilege('authenticated', 'public.communication_room_memberships', 'room_id', 'UPDATE'), '14. room identity is not client-updatable');
select ok(
  not has_column_privilege('authenticated', 'public.communication_room_memberships', 'role', 'UPDATE')
  and has_column_privilege('authenticated', 'public.communication_room_memberships', 'membership_state', 'UPDATE'),
  '15. role is immutable while bounded heartbeat/state updates remain available'
);
select ok(
  not has_column_privilege('authenticated', 'public.communication_rooms', 'linked_party_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.communication_rooms', 'content_access_rule', 'UPDATE')
  and has_column_privilege('authenticated', 'public.communication_rooms', 'last_activity_at', 'UPDATE'),
  '15a. communication room identity/access scope is immutable while bounded heartbeat remains writable'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.watch_party_room_self_access_allowed_internal(text,text)',
    'EXECUTE'
  ),
  '15b. the paid-room internal authority helper remains private after cutover'
);
select is(
  (select trigger_state.tgenabled::text
   from pg_trigger trigger_state
   where trigger_state.tgrelid = 'public.watch_party_room_memberships'::regclass
     and trigger_state.tgname = 'enforce_watch_party_room_membership_block_guard'
     and not trigger_state.tgisinternal),
  'O',
  '15c. the membership block guard is enabled after cutover'
);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('a1111111-1111-4111-8111-111111111111', false, false),
  ('b2222222-2222-4222-8222-222222222222', false, false),
  ('c3333333-3333-4333-8333-333333333333', false, false),
  ('d4444444-4444-4444-8444-444444444444', false, false),
  ('e5555555-5555-4555-8555-555555555555', false, false),
  ('f6666666-6666-4666-8666-666666666666', false, false),
  ('a7777777-7777-4777-8777-777777777777', false, false),
  ('b8888888-8888-4888-8888-888888888888', false, false)
on conflict (id) do nothing;

insert into auth.sessions (id, user_id)
values
  ('a1111111-1111-4111-8111-111111111101', 'a1111111-1111-4111-8111-111111111111'),
  ('b2222222-2222-4222-8222-222222222201', 'b2222222-2222-4222-8222-222222222222'),
  ('c3333333-3333-4333-8333-333333333301', 'c3333333-3333-4333-8333-333333333333'),
  ('d4444444-4444-4444-8444-444444444401', 'd4444444-4444-4444-8444-444444444444'),
  ('e5555555-5555-4555-8555-555555555501', 'e5555555-5555-4555-8555-555555555555'),
  ('f6666666-6666-4666-8666-666666666601', 'f6666666-6666-4666-8666-666666666666'),
  ('a7777777-7777-4777-8777-777777777701', 'a7777777-7777-4777-8777-777777777777'),
  ('b8888888-8888-4888-8888-888888888801', 'b8888888-8888-4888-8888-888888888888')
on conflict (id) do nothing;

insert into public.user_profiles (user_id, username, display_name)
values
  ('a1111111-1111-4111-8111-111111111111', 'closure_a', 'Closure A'),
  ('b2222222-2222-4222-8222-222222222222', 'closure_b', 'Closure B'),
  ('c3333333-3333-4333-8333-333333333333', 'closure_c', 'Closure C'),
  ('d4444444-4444-4444-8444-444444444444', 'closure_d', 'Closure D'),
  ('e5555555-5555-4555-8555-555555555555', 'closure_e', 'Closure E'),
  ('f6666666-6666-4666-8666-666666666666', 'closure_f', 'Closure F'),
  ('a7777777-7777-4777-8777-777777777777', 'closure_g', 'Closure G'),
  ('b8888888-8888-4888-8888-888888888888', 'closure_h', 'Closure H')
on conflict (user_id) do update set display_name = excluded.display_name;

-- The production membership trigger requires one exact authenticated subject
-- even for fixture setup. Bind the canonical first member rather than
-- disabling or weakening the trigger.
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}',
  true
);
insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values (
  'aa111111-1111-4111-8111-111111111111',
  'direct',
  'a1111111-1111-4111-8111-111111111111::b2222222-2222-4222-8222-222222222222',
  'a1111111-1111-4111-8111-111111111111'
);
insert into public.chat_thread_members (thread_id, user_id)
values
  ('aa111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111'),
  ('aa111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
select ok(public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '16. first exact member can read the thread');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select ok(public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '17. second exact member can read the thread');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111"}', true);
select ok(not public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '17a. missing session generation cannot read a member thread');
update public.chat_thread_members
set last_read_at = now()
where thread_id = 'aa111111-1111-4111-8111-111111111111'
  and user_id = 'a1111111-1111-4111-8111-111111111111';
select is(
  (
    select member.last_read_at
    from public.chat_thread_members member
    where member.thread_id = 'aa111111-1111-4111-8111-111111111111'
      and member.user_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  null::timestamptz,
  '17aa. missing session generation cannot mutate direct-thread read state'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select ok(not public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '17b. another user session generation cannot read a member thread');
reset role;
delete from auth.sessions
where id = 'a1111111-1111-4111-8111-111111111101';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
select ok(not public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '17c. revoked session generation cannot retain member thread authority');
reset role;
insert into auth.sessions (id, user_id)
values (
  'a1111111-1111-4111-8111-111111111101',
  'a1111111-1111-4111-8111-111111111111'
);
update auth.sessions
set not_after = now() - interval '1 second'
where id = 'a1111111-1111-4111-8111-111111111101';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
select ok(
  not public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'),
  '17d. a retained time-box-expired session cannot retain member thread authority'
);
reset role;
update auth.sessions
set not_after = null
where id = 'a1111111-1111-4111-8111-111111111101';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select ok(not public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '18. creator/navigation claims cannot substitute for membership');
reset role;

insert into public.chat_thread_members (thread_id, user_id)
values ('aa111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
select ok(not public.can_access_chat_thread('aa111111-1111-4111-8111-111111111111'), '19. a historical third member fails the whole thread closed');
reset role;
delete from public.chat_thread_members
where thread_id = 'aa111111-1111-4111-8111-111111111111'
  and user_id = 'c3333333-3333-4333-8333-333333333333';

-- Strict direct open is idempotent and rejects malformed existing membership (20-24).
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select lives_ok(
  $$select public.get_or_create_direct_chat_thread('d4444444-4444-4444-8444-444444444444', null, null, null)$$,
  '20. first canonical direct open succeeds'
);
select lives_ok(
  $$select public.get_or_create_direct_chat_thread('d4444444-4444-4444-8444-444444444444', null, null, null)$$,
  '21. duplicate direct open is idempotent'
);
reset role;
select is(
  (select count(*)::integer from public.chat_threads where participant_pair_key = 'c3333333-3333-4333-8333-333333333333::d4444444-4444-4444-8444-444444444444'),
  1,
  '22. idempotency creates one direct thread'
);
select is(
  (select count(*)::integer from public.chat_thread_members member join public.chat_threads thread on thread.id = member.thread_id where thread.participant_pair_key = 'c3333333-3333-4333-8333-333333333333::d4444444-4444-4444-8444-444444444444'),
  2,
  '23. idempotency leaves exactly the requested pair'
);

insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
values (
  'cc333333-3333-4333-8333-333333333333',
  'direct',
  'c3333333-3333-4333-8333-333333333333::e5555555-5555-4555-8555-555555555555',
  'c3333333-3333-4333-8333-333333333333'
);
insert into public.chat_thread_members (thread_id, user_id)
values
  ('cc333333-3333-4333-8333-333333333333', 'c3333333-3333-4333-8333-333333333333'),
  ('cc333333-3333-4333-8333-333333333333', 'e5555555-5555-4555-8555-555555555555'),
  ('cc333333-3333-4333-8333-333333333333', 'f6666666-6666-4666-8666-666666666666');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select throws_ok(
  $$select public.get_or_create_direct_chat_thread('e5555555-5555-4555-8555-555555555555', null, null, null)$$,
  'direct_thread_integrity_invalid',
  '24. repair never deletes or adopts an arbitrary third member'
);
reset role;

-- Watch-Party sensitive read authority (25-33).
insert into public.wave1_creator_eligibility (
  creator_user_id, state, account_status, age_18_plus, legal_accepted,
  creator_role, moderation_state, market, rollout_eligible,
  platform_capability, provider_eligible, kyc_complete, tax_complete,
  sanctions_clear, payout_eligible, authority_source, last_operation_key
) values (
  'a7777777-7777-4777-8777-777777777777',
  'VERIFIED', 'ACTIVE', true, true, true, 'CLEAR', 'UNITED_STATES',
  true, true, true, true, true, true, true,
  'closure-test', 'closure-watch-host'
);
insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  'a7777777-7777-4777-8777-777777777777'::uuid,
  public.wave1_sha256('a7777777-7777-4777-8777-777777777777'),
  document.document_key,
  document.version,
  document.market,
  'member',
  document.capability,
  'a7777777-7777-4777-8777-777777777701',
  'service_reconciliation'
from public.wave1_legal_document_versions document
where document.active
  and document.market = 'UNITED_STATES'
  and (document.document_key, document.capability) in (
    ('terms', 'account'),
    ('privacy', 'account'),
    ('community_guidelines', 'account'),
    ('creator_terms', 'creator'),
    ('money_terms', 'creator_money')
  );
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.watch_party_rooms (
  party_id, host_user_id, room_type, join_policy, content_access_rule,
  is_active, playback_state, playback_position_millis, started_at, last_activity_at
) values (
  'CLOSUREWATCH',
  'a7777777-7777-4777-8777-777777777777',
  'live', 'open', 'open', true, 'paused', 0, now(), now()
);
insert into public.watch_party_room_memberships (
  party_id, user_id, role, stage_role, membership_state, last_seen_at
) values
  ('CLOSUREWATCH', 'b8888888-8888-4888-8888-888888888888', 'viewer', 'listener', 'active', now()),
  ('CLOSUREWATCH', 'd4444444-4444-4444-8444-444444444444', 'viewer', 'listener', 'active', now() - interval '2 minutes'),
  ('CLOSUREWATCH', 'e5555555-5555-4555-8555-555555555555', 'viewer', 'listener', 'removed', now()),
  ('CLOSUREWATCH', 'f6666666-6666-4666-8666-666666666666', 'viewer', 'listener', 'active', now());
insert into public.watch_party_room_messages (id, party_id, user_id, username, text)
values (
  '77111111-1111-4111-8111-111111111111',
  'CLOSUREWATCH',
  'a7777777-7777-4777-8777-777777777777',
  'closure_host',
  'private room message'
);
reset role;
update auth.users
set banned_until = now() + interval '1 hour'
where id = 'f6666666-6666-4666-8666-666666666666';

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a7777777-7777-4777-8777-777777777777","session_id":"a7777777-7777-4777-8777-777777777701"}', true);
select ok(public.can_read_watch_party_room_authority('CLOSUREWATCH'), '25. host can read sensitive Watch-Party rows');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select ok(public.can_read_watch_party_room_authority('CLOSUREWATCH'), '26. fresh current member can read sensitive rows');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"d4444444-4444-4444-8444-444444444444","session_id":"d4444444-4444-4444-8444-444444444401"}', true);
select ok(not public.can_read_watch_party_room_authority('CLOSUREWATCH'), '27. stale member is blocked');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"e5555555-5555-4555-8555-555555555555","session_id":"e5555555-5555-4555-8555-555555555501"}', true);
select ok(not public.can_read_watch_party_room_authority('CLOSUREWATCH'), '28. removed member is blocked');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select ok(not public.can_read_watch_party_room_authority('CLOSUREWATCH'), '29. outsider is blocked');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"f6666666-6666-4666-8666-666666666666","session_id":"f6666666-6666-4666-8666-666666666601"}', true);
select ok(not public.can_read_watch_party_room_authority('CLOSUREWATCH'), '30. restricted current member is blocked');
reset role;

insert into public.channel_audience_blocks (channel_user_id, blocked_user_id, blocked_by_user_id)
values (
  'a7777777-7777-4777-8777-777777777777',
  'b8888888-8888-4888-8888-888888888888',
  'a7777777-7777-4777-8777-777777777777'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select ok(not public.can_read_watch_party_room_authority('CLOSUREWATCH'), '31. host block removes sensitive room authority');
reset role;
delete from public.channel_audience_blocks
where channel_user_id = 'a7777777-7777-4777-8777-777777777777'
  and blocked_user_id = 'b8888888-8888-4888-8888-888888888888';

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select is((select count(*)::integer from public.watch_party_room_messages where party_id = 'CLOSUREWATCH'), 1, '32. current member RLS exposes room messages');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select is((select count(*)::integer from public.watch_party_room_messages where party_id = 'CLOSUREWATCH'), 0, '33. outsider RLS hides room messages');
reset role;

-- Communication room creation is current-session and exact-host scoped.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888"}', true);
select throws_ok(
  $$insert into public.communication_rooms (room_id, room_code, host_user_id, status) values ('NOSESSIONCOMM', 'NOSESSIONCOMM', 'b8888888-8888-4888-8888-888888888888', 'active')$$,
  'communication_room_current_session_required',
  '33a. a token without its exact current session cannot create an unlinked communication room'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select throws_ok(
  $$insert into public.communication_rooms (room_id, room_code, host_user_id, status, linked_party_id, linked_room_code, linked_room_mode) values ('VICTIMLINKCOMM', 'VICTIMLINKCOMM', 'b8888888-8888-4888-8888-888888888888', 'active', 'CLOSUREWATCH', 'CLOSUREWATCH', 'live')$$,
  'communication_room_linked_host_authority_required',
  '33b. a member cannot create a host communication room linked to another creator room'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a7777777-7777-4777-8777-777777777777","session_id":"a7777777-7777-4777-8777-777777777701"}', true);
insert into public.communication_rooms (
  room_id, room_code, host_user_id, status, last_activity_at
) values (
  'TERMINALCOMM', 'TERMINALCOMM',
  'a7777777-7777-4777-8777-777777777777', 'active', now()
);
update public.communication_rooms
set status = 'ended'
where room_id = 'TERMINALCOMM';
reset role;
select throws_ok(
  $$update public.communication_rooms set status = 'active' where room_id = 'TERMINALCOMM'$$,
  'communication_room_ended',
  '33c. an ended communication room cannot be reopened even by an internal writer'
);
select throws_ok(
  $$update public.communication_rooms set linked_party_id = 'CLOSUREWATCH', linked_room_code = 'CLOSUREWATCH', linked_room_mode = 'live' where room_id = 'TERMINALCOMM'$$,
  'communication_room_identity_immutable',
  '33d. communication room identity cannot be reparented after creation'
);

-- Communication join, immutable identity, and private Realtime authority (34-47).
insert into public.communication_rooms (
  room_id, room_code, host_user_id, status, content_access_rule, last_activity_at
) values
  ('CLOSURECOMM', 'CLOSURECOMM', 'a7777777-7777-4777-8777-777777777777', 'active', 'open', now()),
  ('OTHERCOMM', 'OTHERCOMM', 'a7777777-7777-4777-8777-777777777777', 'active', 'open', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select ok(not public.can_read_communication_room_authority('CLOSURECOMM'), '34. an unjoined user cannot read a communication room');
select lives_ok(
  $$select public.join_communication_room_session('CLOSURECOMM', 'Member', null, false, true)$$,
  '35. authoritative join derives the current member'
);
select lives_ok(
  $$select public.join_communication_room_session('CLOSURECOMM', 'Member', null, false, true)$$,
  '36. duplicate authoritative join is idempotent'
);
reset role;
select is(
  (select count(*)::integer from public.communication_room_memberships where room_id = 'CLOSURECOMM' and user_id = 'b8888888-8888-4888-8888-888888888888'),
  1,
  '37. idempotent join retains one exact membership'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select ok(public.can_read_communication_room_authority('CLOSURECOMM'), '38. joined current member can read the room');
select ok(public.can_access_communication_realtime_topic('comm-room-CLOSURECOMM'), '39. exact current membership authorizes the private topic');
select ok(not public.can_access_communication_realtime_topic('comm-room-OTHERCOMM'), '40. another room topic is blocked');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888"}', true);
select ok(not public.can_read_communication_room_authority('CLOSURECOMM'), '40a. missing session generation cannot read an unlinked communication room');
update public.communication_room_memberships
set camera_enabled = true
where room_id = 'CLOSURECOMM'
  and user_id = 'b8888888-8888-4888-8888-888888888888';
reset role;
select is(
  (
    select camera_enabled
    from public.communication_room_memberships
    where room_id = 'CLOSURECOMM'
      and user_id = 'b8888888-8888-4888-8888-888888888888'
  ),
  false,
  '40aa. missing session generation cannot mutate its communication membership'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a7777777-7777-4777-8777-777777777777"}', true);
update public.communication_room_memberships
set membership_state = 'removed'
where room_id = 'CLOSURECOMM'
  and user_id = 'b8888888-8888-4888-8888-888888888888';
reset role;
select is(
  (
    select membership_state
    from public.communication_room_memberships
    where room_id = 'CLOSURECOMM'
      and user_id = 'b8888888-8888-4888-8888-888888888888'
  ),
  'active',
  '40ab. host authority from a token without its exact current session cannot remove a member'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
select ok(not public.can_read_communication_room_authority('CLOSURECOMM'), '40b. another user session generation cannot read an unlinked communication room');
reset role;

delete from auth.sessions
where id = 'b8888888-8888-4888-8888-888888888801';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select ok(not public.can_read_communication_room_authority('CLOSURECOMM'), '40c. revoked session generation cannot retain unlinked communication room authority');
reset role;
insert into auth.sessions (id, user_id)
values (
  'b8888888-8888-4888-8888-888888888801',
  'b8888888-8888-4888-8888-888888888888'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a7777777-7777-4777-8777-777777777777","session_id":"a7777777-7777-4777-8777-777777777701"}', true);
select ok(not public.can_read_communication_room_authority('TERMINALCOMM'), '40d. ended communication room cannot retain read or Realtime authority');
reset role;

select throws_ok(
  $$update public.communication_room_memberships set room_id = 'OTHERCOMM' where room_id = 'CLOSURECOMM' and user_id = 'b8888888-8888-4888-8888-888888888888'$$,
  'communication_membership_identity_immutable',
  '41. row identity cannot be moved into a victim room even with elevated fixture privileges'
);
select throws_ok(
  $$update public.communication_room_memberships set role = 'host' where room_id = 'CLOSURECOMM' and user_id = 'b8888888-8888-4888-8888-888888888888'$$,
  'communication_membership_identity_immutable',
  '42. membership role cannot be self-promoted'
);
update public.communication_room_memberships
set membership_state = 'removed'
where room_id = 'CLOSURECOMM'
  and user_id = 'b8888888-8888-4888-8888-888888888888';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select throws_ok(
  $$select public.join_communication_room_session('CLOSURECOMM', 'Member', null, false, true)$$,
  'communication_room_membership_removed',
  '43. removed membership cannot be restored by rejoin'
);
reset role;

-- Accepted direct-call authority is exact and clear cannot detach it (44-48).
insert into public.communication_rooms (
  room_id, room_code, host_user_id, status, content_access_rule, last_activity_at
) values ('CHATCALLROOM', 'CHATCALLROOM', 'a1111111-1111-4111-8111-111111111111', 'active', 'open', now());
update public.chat_threads
set active_communication_room_id = 'CHATCALLROOM', active_call_type = 'video'
where id = 'aa111111-1111-4111-8111-111111111111';
alter table public.chat_call_invites disable trigger enforce_chat_call_invites_abuse_guard;
insert into public.chat_call_invites (
  id, thread_id, communication_room_id, caller_user_id, callee_user_id,
  call_type, status, expires_at, accepted_at
) values (
  '88111111-1111-4111-8111-111111111111',
  'aa111111-1111-4111-8111-111111111111',
  'CHATCALLROOM',
  'a1111111-1111-4111-8111-111111111111',
  'b2222222-2222-4222-8222-222222222222',
  'video', 'accepted', now() - interval '5 minutes', now()
);
alter table public.chat_call_invites enable trigger enforce_chat_call_invites_abuse_guard;
select throws_ok(
  $$update public.chat_call_invites set caller_user_id = 'c3333333-3333-4333-8333-333333333333' where id = '88111111-1111-4111-8111-111111111111'$$,
  'chat_call_invite_binding_immutable',
  '43a. even elevated lifecycle writes cannot substitute caller/thread/room binding'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select lives_ok(
  $$select public.join_communication_room_session('CHATCALLROOM', 'Callee', null, true, true)$$,
  '44. exact accepted callee can join the attached call room'
);
select is(
  (public.clear_stale_chilly_chat_thread_call('aa111111-1111-4111-8111-111111111111', 'CHATCALLROOM') ->> 'reason'),
  'active_invite',
  '45. compare-and-clear cannot detach a fresh accepted call after its ringing deadline'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select throws_ok(
  $$select public.join_communication_room_session('CHATCALLROOM', 'Outsider', null, true, true)$$,
  'communication_chat_call_authority_required',
  '46. outsider cannot join an attached call room'
);
reset role;

select is(
  (select count(*)::integer from pg_policy where polrelid = 'realtime.messages'::regclass and polname in ('communication_room_realtime_receive', 'communication_room_realtime_send')),
  2,
  '47. private broadcast and presence have receive/send policies'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.communication_room_memberships'::regclass
      and tgname = 'enforce_communication_membership_identity'
      and not tgisinternal
  ),
  '48. immutable communication membership trigger is installed'
);
select is(
  (
    select proc.prosecdef
    from pg_proc proc
    where proc.oid =
      'public.enforce_communication_membership_identity()'::regprocedure
  ),
  false,
  '48a. communication membership enforcement preserves the effective invoker role'
);
select ok(
  strpos(
    pg_get_functiondef(
      'public.enforce_communication_membership_identity()'::regprocedure
    ),
    'app.communication_membership_authority'
  ) = 0,
  '48b. communication membership enforcement consumes no client-set authority GUC'
);
select ok(
  has_function_privilege('authenticated', 'public.join_communication_room_session(text,text,text,boolean,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.join_communication_room_session(text,text,text,boolean,boolean)', 'EXECUTE'),
  '49. only authenticated callers can invoke communication join'
);
select ok(
  has_function_privilege('authenticated', 'public.clear_stale_chilly_chat_thread_call(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.clear_stale_chilly_chat_thread_call(uuid,text)', 'EXECUTE'),
  '50. stale clear is caller-bound and not a provider/service mutation surface'
);
select is(
  (select count(*)::integer from public.chat_thread_members where thread_id = 'cc333333-3333-4333-8333-333333333333'),
  3,
  '51. malformed historical membership evidence was retained, not deleted'
);

-- Creator-video object provenance (52-56).
select has_function(
  'public',
  'has_verified_legacy_video_object_provenance',
  array['uuid', 'text', 'text', 'text'],
  '52. exact legacy creator-video object provenance helper exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.has_verified_legacy_video_object_provenance(uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.has_verified_legacy_video_object_provenance(uuid,text,text,text)',
    'EXECUTE'
  ),
  '53. only service authority can query private migration provenance'
);

insert into private.media_object_storage_migration_audit (
  migration_id,
  batch_id,
  table_name,
  row_id,
  source_type,
  source_id,
  new_storage_provider,
  new_storage_bucket,
  new_storage_object_key,
  new_storage_path,
  status
) values (
  'closure-test',
  'closure-test-batch',
  'videos',
  '99111111-1111-4111-8111-111111111111',
  'videos',
  '99111111-1111-4111-8111-111111111111',
  'cloudflare_r2',
  'chillywood-media-origin',
  'originals/closure-legacy-source.mp4',
  'originals/closure-legacy-source.mp4',
  'updated'
);
insert into public.videos (
  id,
  owner_id,
  storage_provider,
  storage_bucket,
  storage_object_key,
  storage_path,
  thumb_storage_path,
  visibility
) values (
  '99111111-1111-4111-8111-111111111111',
  'a1111111-1111-4111-8111-111111111111',
  'cloudflare_r2',
  'chillywood-media-origin',
  'originals/closure-legacy-source.mp4',
  'originals/closure-legacy-source.mp4',
  'a1111111-1111-4111-8111-111111111111/videos/cover.webp',
  'draft'
);

select ok(
  public.has_verified_legacy_video_object_provenance(
    '99111111-1111-4111-8111-111111111111',
    'cloudflare_r2',
    'chillywood-media-origin',
    'originals/closure-legacy-source.mp4'
  ),
  '54. exact updated migration audit preserves a legacy R2 source key'
);
select ok(
  not public.has_verified_legacy_video_object_provenance(
    '99111111-1111-4111-8111-111111111111',
    'cloudflare_r2',
    'chillywood-media-origin',
    'originals/not-the-audited-key.mp4'
  ),
  '55. an audit row cannot authorize a different object key'
);
update private.media_object_storage_migration_audit
set status = 'rolled_back'
where batch_id = 'closure-test-batch'
  and table_name = 'videos'
  and row_id = '99111111-1111-4111-8111-111111111111';
select ok(
  not public.has_verified_legacy_video_object_provenance(
    '99111111-1111-4111-8111-111111111111',
    'cloudflare_r2',
    'chillywood-media-origin',
    'originals/closure-legacy-source.mp4'
  ),
  '56. rolled-back migration evidence grants no object authority'
);

-- RPC-only Watch-Party membership and ordinary Live authority (57-67).
select has_function(
  'public',
  'join_watch_party_room_session',
  array['text', 'text', 'text', 'text', 'boolean', 'boolean', 'boolean'],
  '57. Watch-Party join RPC exists'
);
select has_function(
  'public',
  'heartbeat_watch_party_room_session',
  array['text', 'text', 'boolean', 'boolean', 'boolean', 'text', 'text', 'text'],
  '58. Watch-Party heartbeat RPC exists'
);
select has_function(
  'public',
  'set_watch_party_participant_authority',
  array['text', 'text', 'text', 'boolean', 'text'],
  '59. exact host participant-authority RPC exists'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.watch_party_room_memberships',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.watch_party_room_memberships',
    'UPDATE'
  ),
  '60. clients cannot insert or raw-update Watch-Party authority rows'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.watch_party_rooms (
  party_id, host_user_id, room_type, join_policy, content_access_rule,
  is_active, playback_state, playback_position_millis, started_at,
  last_activity_at
) values (
  'CLOSUREPAID',
  'a7777777-7777-4777-8777-777777777777',
  'live', 'open', 'open', true, 'paused', 0, now(), now()
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select lives_ok(
  $$select public.join_watch_party_room_session('CLOSUREPAID', 'Paid Viewer', null, null, true, true, false)$$,
  '61. ordinary open-room member joins through the canonical RPC'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222"}', true);
select throws_ok(
  $$select public.heartbeat_watch_party_room_session('CLOSUREPAID','active',false,false,false,null,null,null)$$,
  'watch_party_current_session_required',
  '61a. missing exact current session cannot heartbeat a Watch-Party membership'
);
reset role;
select ok(
  exists (
    select 1
    from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSUREPAID'
      and membership.user_id = 'b2222222-2222-4222-8222-222222222222'
      and membership.role = 'viewer'
      and membership.stage_role = 'listener'
      and not membership.can_speak
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '62. Seat Pass/paid-room join grants viewer-only and no publish authority'
);

select set_config('app.watch_party_membership_authority', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select throws_ok(
  $$update public.watch_party_room_memberships set party_id = 'CLOSUREPAID' where party_id = 'CLOSUREWATCH' and user_id = 'b8888888-8888-4888-8888-888888888888'$$,
  'watch_party_membership_identity_immutable',
  '63. a member row cannot be reparented into a paid room'
);
select throws_ok(
  $$update public.watch_party_room_memberships set stage_role = 'speaker', can_speak = true where party_id = 'CLOSUREWATCH' and user_id = 'b8888888-8888-4888-8888-888888888888'$$,
  'watch_party_membership_authority_rpc_required',
  '64. a member cannot self-promote to speaker/publish authority'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"e5555555-5555-4555-8555-555555555555","session_id":"e5555555-5555-4555-8555-555555555501"}', true);
select throws_ok(
  $$update public.watch_party_room_memberships set membership_state = 'active' where party_id = 'CLOSUREWATCH' and user_id = 'e5555555-5555-4555-8555-555555555555'$$,
  'watch_party_membership_removed',
  '65. a removed member cannot unremove itself'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.watch_party_room_memberships'::regclass
      and tgname = 'enforce_watch_party_membership_identity'
      and not tgisinternal
  ),
  '66. fail-closed membership identity trigger is installed'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
insert into public.watch_party_rooms (
  party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,
  playback_state,playback_position_millis,started_at,last_activity_at
) values (
  'UNVERIFIEDLIVE','c3333333-3333-4333-8333-333333333333','live','open','open',true,
  'paused',0,now(),now()
);
select pass('67. exact-current-session ordinary Live creation does not require creator-money eligibility');
select ok(
  exists (
    select 1
    from public.watch_party_room_memberships membership
    where membership.party_id='UNVERIFIEDLIVE'
      and membership.user_id='c3333333-3333-4333-8333-333333333333'
      and membership.role='host'
      and membership.stage_role='host'
      and membership.can_speak
      and membership.membership_state='active'
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '67aa. ordinary Live creation atomically bootstraps only the exact canonical host membership'
);
reset role;
update public.wave1_creator_eligibility
set state = 'SUSPENDED'
where creator_user_id = 'a7777777-7777-4777-8777-777777777777';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b8888888-8888-4888-8888-888888888888","session_id":"b8888888-8888-4888-8888-888888888801"}', true);
select ok(public.can_read_watch_party_room_authority('CLOSUREWATCH'), '67a. ordinary Live room authority is independent of host creator-money eligibility');
reset role;
update public.wave1_creator_eligibility
set state = 'VERIFIED'
where creator_user_id = 'a7777777-7777-4777-8777-777777777777';

-- Legacy WebRTC Broadcast is server-relayed so a current member cannot forge
-- another member's sender identity in SDP/ICE payloads (68-74).
select has_function(
  'public',
  'broadcast_communication_room_signal',
  array['text', 'text', 'jsonb'],
  '68. caller-bound communication signal relay exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.broadcast_communication_room_signal(text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.broadcast_communication_room_signal(text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.broadcast_communication_room_signal(text,text,jsonb)',
    'EXECUTE'
  ),
  '69. only authenticated caller authority can invoke the signal relay'
);
select ok(
  (
    select pg_get_expr(policy.polwithcheck, policy.polrelid)
    from pg_policy policy
    where policy.polrelid = 'realtime.messages'::regclass
      and policy.polname = 'communication_room_realtime_send'
  ) like '%extension%presence%'
  and (
    select pg_get_expr(policy.polwithcheck, policy.polrelid)
    from pg_policy policy
    where policy.polrelid = 'realtime.messages'::regclass
      and policy.polname = 'communication_room_realtime_send'
  ) not like '%broadcast%',
  '70. clients may publish presence but cannot directly forge Broadcast payloads'
);

insert into public.communication_rooms (
  room_id, room_code, host_user_id, status, content_access_rule,
  last_activity_at
) values (
  'SIGNALCOMM', 'SIGNALCOMM',
  'a1111111-1111-4111-8111-111111111111', 'active', 'open', now()
);
insert into public.communication_room_memberships (
  room_id, user_id, role, membership_state, camera_enabled, mic_enabled,
  last_seen_at
) values
  (
    'SIGNALCOMM', 'a1111111-1111-4111-8111-111111111111', 'host',
    'active', true, true, now()
  ),
  (
    'SIGNALCOMM', 'b2222222-2222-4222-8222-222222222222', 'participant',
    'active', true, true, now()
  );

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
update public.communication_room_memberships
set membership_state = 'left', camera_enabled = false, mic_enabled = false
where room_id = 'SIGNALCOMM'
  and user_id = 'a1111111-1111-4111-8111-111111111111';
select set_config('app.communication_membership_authority', 'server', true);
select throws_ok(
  $$update public.communication_room_memberships
    set membership_state = 'active', camera_enabled = true, mic_enabled = true
    where room_id = 'SIGNALCOMM'
      and user_id = 'a1111111-1111-4111-8111-111111111111'$$,
  'communication_membership_join_rpc_required',
  '70a. a client-spoofed custom GUC cannot reactivate communication membership'
);
select set_config('app.communication_membership_authority', '', true);
select is(
  (
    select membership_state
    from public.communication_room_memberships
    where room_id = 'SIGNALCOMM'
      and user_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'left',
  '70b. spoofed server authority leaves the departed membership closed'
);
select lives_ok(
  $$select public.join_communication_room_session('SIGNALCOMM', 'Host', null, true, true)$$,
  '70c. the trusted join RPC can reactivate the exact immutable membership'
);
select is(
  (
    select membership_state
    from public.communication_room_memberships
    where room_id = 'SIGNALCOMM'
      and user_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'active',
  '70d. trusted rejoin restores only active membership authority'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select set_config('app.communication_membership_authority', 'server', true);
update public.communication_room_memberships
set last_seen_at = 'infinity'::timestamptz,
  updated_at = 'infinity'::timestamptz
where room_id = 'SIGNALCOMM'
  and user_id = 'b2222222-2222-4222-8222-222222222222';
select set_config('app.communication_membership_authority', '', true);
select ok(
  (
    select last_seen_at <> 'infinity'::timestamptz
      and last_seen_at >= now() - interval '1 second'
      and last_seen_at <= clock_timestamp()
      and updated_at <> 'infinity'::timestamptz
    from public.communication_room_memberships
    where room_id = 'SIGNALCOMM'
      and user_id = 'b2222222-2222-4222-8222-222222222222'
  ),
  '70e. a forged GUC cannot persist a future communication heartbeat'
);
update public.communication_room_memberships
set membership_state = 'left', camera_enabled = false, mic_enabled = false
where room_id = 'SIGNALCOMM'
  and user_id = 'b2222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a1111111-1111-4111-8111-111111111111","session_id":"a1111111-1111-4111-8111-111111111101"}', true);
select set_config('app.communication_membership_authority', 'server', true);
select throws_ok(
  $$update public.communication_room_memberships
    set membership_state = 'active',
      camera_enabled = true,
      mic_enabled = true,
      display_name = 'Forged by host',
      avatar_url = 'https://attacker.invalid/forged-avatar.png'
    where room_id = 'SIGNALCOMM'
      and user_id = 'b2222222-2222-4222-8222-222222222222'$$,
  'communication_membership_host_transition_invalid',
  '70f. a host with a forged GUC cannot reactivate or rewrite a departed participant'
);
select set_config('app.communication_membership_authority', '', true);
select ok(
  (
    select membership_state = 'left'
      and not camera_enabled
      and not mic_enabled
      and display_name is null
      and avatar_url is null
    from public.communication_room_memberships
    where room_id = 'SIGNALCOMM'
      and user_id = 'b2222222-2222-4222-8222-222222222222'
  ),
  '70g. rejected host spoof preserves departed participant state and profile'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
do $$
begin
  perform public.join_communication_room_session(
    'SIGNALCOMM', null, null, true, true
  );
end;
$$;
select is(
  (
    public.broadcast_communication_room_signal(
      'SIGNALCOMM',
      'webrtc:offer',
      jsonb_build_object(
        'fromUserId', 'a1111111-1111-4111-8111-111111111111',
        'targetUserId', 'a1111111-1111-4111-8111-111111111111',
        'description', jsonb_build_object('type', 'offer', 'sdp', 'v=0')
      )
    ) ->> 'senderUserId'
  ),
  'b2222222-2222-4222-8222-222222222222',
  '71. relay derives sender identity and ignores a forged fromUserId'
);
select throws_ok(
  $$select public.broadcast_communication_room_signal('SIGNALCOMM','webrtc:ice','{"targetUserId":"c3333333-3333-4333-8333-333333333333","candidate":{"candidate":"candidate:1","sdpMid":"0","sdpMLineIndex":0}}'::jsonb)$$,
  'communication_signal_target_invalid',
  '72. signaling cannot target an outsider'
);
select throws_ok(
  $$select public.broadcast_communication_room_signal('SIGNALCOMM','room:end','{"reason":"host-left"}'::jsonb)$$,
  'communication_signal_host_required',
  '73. a participant cannot forge the host room-end signal'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
select throws_ok(
  $$select public.broadcast_communication_room_signal('SIGNALCOMM','media:update','{"cameraOn":true,"micOn":true}'::jsonb)$$,
  'communication_signal_authority_required',
  '74. an outsider cannot inject a room signal'
);
reset role;

select has_function(
  'public',
  'has_verified_legacy_media_object_provenance',
  array['text', 'text', 'text', 'text', 'text'],
  '75. generic exact legacy gateway provenance helper exists'
);
select has_function(
  'public',
  'revoke_verified_legacy_media_object_provenance',
  array['text', 'text', 'text', 'text', 'text'],
  '76. migrated provenance has a pre-delete revocation helper'
);
update private.media_object_storage_migration_audit
set status = 'updated'
where batch_id = 'closure-test-batch'
  and table_name = 'videos'
  and row_id = '99111111-1111-4111-8111-111111111111';
select ok(
  public.has_verified_legacy_media_object_provenance(
    'videos',
    '99111111-1111-4111-8111-111111111111',
    'cloudflare_r2',
    'chillywood-media-origin',
    'originals/closure-legacy-source.mp4'
  ),
  '77. gateway accepts only an exact active migration receipt'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  public.revoke_verified_legacy_media_object_provenance(
    'videos',
    '99111111-1111-4111-8111-111111111111',
    'cloudflare_r2',
    'chillywood-media-origin',
    'originals/closure-legacy-source.mp4'
  ),
  '78. deletion revokes exact migrated provenance before provider mutation'
);
select ok(
  not public.has_verified_legacy_media_object_provenance(
    'videos',
    '99111111-1111-4111-8111-111111111111',
    'cloudflare_r2',
    'chillywood-media-origin',
    'originals/closure-legacy-source.mp4'
  ),
  '79. revoked migration evidence cannot authorize recreated bytes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"c3333333-3333-4333-8333-333333333333","session_id":"c3333333-3333-4333-8333-333333333301"}', true);
do $$
begin
  perform public.get_or_create_direct_chat_thread(
    'd4444444-4444-4444-8444-444444444444',
    'Forged Target',
    'https://attacker.invalid/forged-avatar.png',
    'forged-target-tagline'
  );
end;
$$;
reset role;
select ok(
  not exists (
    select 1
    from public.chat_thread_members member
    join public.chat_threads thread on thread.id = member.thread_id
    where thread.participant_pair_key = 'c3333333-3333-4333-8333-333333333333::d4444444-4444-4444-8444-444444444444'
      and member.user_id = 'd4444444-4444-4444-8444-444444444444'
      and (
        member.display_name = 'Forged Target'
        or member.avatar_url = 'https://attacker.invalid/forged-avatar.png'
        or member.tagline = 'forged-target-tagline'
      )
  ),
  '80. caller-supplied compatibility hints cannot forge target profile metadata'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('app.watch_party_membership_authority', 'server', true);
update public.watch_party_room_memberships
set
  membership_state = 'left',
  stage_role = 'speaker',
  can_speak = true,
  last_seen_at = now() - interval '2 minutes'
where party_id = 'CLOSUREPAID'
  and user_id = 'b2222222-2222-4222-8222-222222222222';
select set_config('app.watch_party_membership_authority', '', true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
do $$
begin
  perform public.join_watch_party_room_session(
    'CLOSUREPAID', 'Paid Viewer', null, null, true, true, false
  );
end;
$$;
reset role;
select ok(
  exists (
    select 1
    from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSUREPAID'
      and membership.user_id = 'b2222222-2222-4222-8222-222222222222'
      and membership.role = 'viewer'
      and membership.stage_role = 'listener'
      and not membership.can_speak
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '81. stale prior speaker approval cannot be restored by a later paid-room rejoin'
);

-- An active paid offer overrides an otherwise-open room. A ticket projection
-- alone is untrusted; only the complete current provider/purchase/grant chain
-- admits the exact buyer, and that authority is viewer/listener only (82-111).
select has_function(
  'public',
  'watch_party_room_self_access_allowed_internal',
  array['text', 'text'],
  '82. one internal exact paid-room authority helper exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)',
    'EXECUTE'
  ),
  '83. only service authority can resolve a session-bound LiveKit viewer proof'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.watch_party_rooms (
  party_id, host_user_id, room_type, join_policy, content_access_rule,
  is_active, playback_state, playback_position_millis, started_at,
  last_activity_at
) values (
  'CLOSURESEAT',
  'a7777777-7777-4777-8777-777777777777',
  'live', 'open', 'open', true, 'paused', 0, now(), now()
);
insert into public.paid_watch_party_offers (
  id, party_id, creator_id, host_id, title, price_cents, currency,
  status, provider, provider_product_key, provider_product_id
) select
  'ab111111-1111-4111-8111-111111111111',
  'CLOSURESEAT',
  'a7777777-7777-4777-8777-777777777777',
  'a7777777-7777-4777-8777-777777777777',
  'Closure Seat Pass',
  99,
  'usd',
  'sandbox',
  'revenuecat_google_play',
  product.product_key,
  product.provider_product_id
from public.monetization_products product
where product.product_key = 'watch_party_live_ticket_sandbox_099';
insert into public.paid_watch_party_tickets (
  id, offer_id, party_id, buyer_id, creator_id, host_id, provider,
  provider_transaction_id, status, expires_at, metadata
) values (
  'ab222222-2222-4222-8222-222222222222',
  'ab111111-1111-4111-8111-111111111111',
  'CLOSURESEAT',
  'b2222222-2222-4222-8222-222222222222',
  'a7777777-7777-4777-8777-777777777777',
  'a7777777-7777-4777-8777-777777777777',
  'revenuecat_google_play',
  'closure-seat-provider-event',
  'active',
  now() + interval '1 hour',
  jsonb_build_object('viewer_access_only', true)
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '84. an active paid offer overrides open/global-entitlement access and a bare ticket fails closed'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select throws_ok(
  $$select public.join_watch_party_room_session('CLOSURESEAT', 'Bare Ticket', null, null, true, true, false)$$,
  'watch_party_room_entitlement_required',
  '85. ticket-only join cannot create paid-room membership'
);
reset role;

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider,
  provider_product_id, source_type, source_id, creator_id, environment,
  status, amount_minor, currency, idempotency_key, expires_at, consumed_at,
  metadata
) select
  'ab333333-3333-4333-8333-333333333333',
  'b2222222-2222-4222-8222-222222222222',
  product.id,
  product.product_key,
  'watch_party_live_ticket',
  'revenuecat_google_play',
  product.provider_product_id,
  'watch_party_live',
  'ab111111-1111-4111-8111-111111111111',
  'a7777777-7777-4777-8777-777777777777',
  'sandbox',
  'consumed',
  99,
  'usd',
  'closure-seat-intent',
  now() + interval '1 hour',
  now(),
  jsonb_build_object('party_id', 'CLOSURESEAT')
from public.monetization_products product
where product.product_key = 'watch_party_live_ticket_sandbox_099';

insert into public.provider_events (
  id, provider_event_id, provider, product_id, product_key, user_id,
  app_user_id, environment, event_type, status, occurred_at,
  idempotency_key, metadata
) select
  'ab444444-4444-4444-8444-444444444444',
  'closure-seat-provider-event',
  'revenuecat_google_play',
  product.id,
  product.product_key,
  'b2222222-2222-4222-8222-222222222222',
  'b2222222-2222-4222-8222-222222222222',
  'sandbox',
  'NON_RENEWING_PURCHASE',
  'processed',
  now(),
  'closure-seat-provider-event',
  jsonb_build_object(
    'purchase_intent_id', 'ab333333-3333-4333-8333-333333333333',
    'provider_product_id', product.provider_product_id,
    'original_transaction_id', 'closure-seat-original-transaction'
  )
from public.monetization_products product
where product.product_key = 'watch_party_live_ticket_sandbox_099';

insert into public.access_grants (
  id, user_id, grant_type, source_type, source_id, product_id, provider,
  provider_event_id, environment, status, starts_at, expires_at, metadata
) select
  'ab555555-5555-4555-8555-555555555555',
  'b2222222-2222-4222-8222-222222222222',
  'watch_party_live_ticket',
  'provider_event',
  'ab111111-1111-4111-8111-111111111111',
  product.id,
  'revenuecat_google_play',
  'ab444444-4444-4444-8444-444444444444',
  'sandbox',
  'sandbox_only',
  now() - interval '1 minute',
  now() + interval '1 hour',
  jsonb_build_object(
    'purchase_intent_id', 'ab333333-3333-4333-8333-333333333333',
    'original_transaction_id', 'closure-seat-original-transaction',
    'viewer_access_only', true,
    'authority_granted', false,
    'speaker_authority', false,
    'moderator_authority', false,
    'payout_access', false,
    'premium_unlock', false
  )
from public.monetization_products product
where product.product_key = 'watch_party_live_ticket_sandbox_099';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '86. the exact current ticket/provider/purchase/grant chain authorizes only its buyer'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select lives_ok(
  $$select public.join_watch_party_room_session('CLOSURESEAT', 'Exact Buyer', null, null, true, true, false)$$,
  '87. exact paid-seat buyer joins through the serialized RPC'
);
reset role;
select ok(
  exists (
    select 1
    from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSURESEAT'
      and membership.user_id = 'b2222222-2222-4222-8222-222222222222'
      and membership.role = 'viewer'
      and membership.stage_role = 'listener'
      and not membership.can_speak
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '88. exact paid-seat membership is viewer/listener with no publish authority'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'reason',
  'exact_paid_seat_viewer_authority',
  '89. LiveKit resolves the same exact paid viewer authority'
);
reset role;
update auth.sessions
set not_after = now() - interval '1 second'
where id = 'b2222222-2222-4222-8222-222222222201';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'reason',
  'viewer_session_authority_invalid',
  '89a. a retained time-box-expired session cannot mint a LiveKit viewer proof'
);
reset role;
update auth.sessions
set not_after = null
where id = 'b2222222-2222-4222-8222-222222222201';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean
  and (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'paidSeatRequired')::boolean
  and not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'hostAuthority')::boolean
  and (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'expiresAt')::timestamptz <= now() + interval '31 seconds',
  '90. paid LiveKit proof is no-host and expires within the 30-second authority window'
);
select ok(
  (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'b2222222-2222-4222-8222-222222222222',
    null
  ) ->> 'allowed')::boolean
  and not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'c3333333-3333-4333-8333-333333333333',
    null
  ) ->> 'allowed')::boolean,
  '90a. service-only host enforcement resolves exact target authority without treating a missing target JWT as an allow'
);
select ok(
  (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'a7777777-7777-4777-8777-777777777777',
    'a7777777-7777-4777-8777-777777777701'
  ) ->> 'allowed')::boolean
  and (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT',
    'a7777777-7777-4777-8777-777777777777',
    'a7777777-7777-4777-8777-777777777701'
  ) ->> 'hostAuthority')::boolean,
  '91. paid-room host authority requires the exact verified creator and current session'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.paid_watch_party_tickets
set provider = 'revenuecat'
where id = 'ab222222-2222-4222-8222-222222222222';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '92. wrong ticket provider fails closed'
);
update public.paid_watch_party_tickets
set provider = 'revenuecat_google_play'
where id = 'ab222222-2222-4222-8222-222222222222';

update public.paid_watch_party_tickets
set buyer_id = 'c3333333-3333-4333-8333-333333333333'
where id = 'ab222222-2222-4222-8222-222222222222';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '93. wrong ticket buyer fails closed'
);
update public.paid_watch_party_tickets
set buyer_id = 'b2222222-2222-4222-8222-222222222222'
where id = 'ab222222-2222-4222-8222-222222222222';

update public.paid_watch_party_tickets
set creator_id = 'c3333333-3333-4333-8333-333333333333'
where id = 'ab222222-2222-4222-8222-222222222222';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '94. wrong ticket creator fails closed'
);
update public.paid_watch_party_tickets
set creator_id = 'a7777777-7777-4777-8777-777777777777'
where id = 'ab222222-2222-4222-8222-222222222222';

update public.access_grants
set product_id = (
  select product.id
  from public.monetization_products product
  where product.product_type <> 'watch_party_live_ticket'
  order by product.created_at
  limit 1
)
where id = 'ab555555-5555-4555-8555-555555555555';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '95. wrong grant product fails closed'
);
update public.access_grants
set product_id = (
  select product.id
  from public.monetization_products product
  where product.product_key = 'watch_party_live_ticket_sandbox_099'
)
where id = 'ab555555-5555-4555-8555-555555555555';

update public.access_grants
set metadata = jsonb_set(
  metadata,
  '{original_transaction_id}',
  '"wrong-original-transaction"'::jsonb
)
where id = 'ab555555-5555-4555-8555-555555555555';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '96. wrong original transaction fails closed'
);
update public.access_grants
set metadata = jsonb_set(
  metadata,
  '{original_transaction_id}',
  '"closure-seat-original-transaction"'::jsonb
)
where id = 'ab555555-5555-4555-8555-555555555555';

update public.paid_watch_party_tickets
set expires_at = now() - interval '1 second'
where id = 'ab222222-2222-4222-8222-222222222222';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '97. expired paid ticket fails closed'
);
update public.paid_watch_party_tickets
set expires_at = now() + interval '1 hour'
where id = 'ab222222-2222-4222-8222-222222222222';

update public.paid_watch_party_tickets
set refunded_at = now()
where id = 'ab222222-2222-4222-8222-222222222222';
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '98. refunded paid ticket fails closed'
);
update public.paid_watch_party_tickets
set refunded_at = null
where id = 'ab222222-2222-4222-8222-222222222222';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a7777777-7777-4777-8777-777777777777"}', true);
select throws_ok(
  $$select public.set_watch_party_participant_authority('CLOSURESEAT','b2222222-2222-4222-8222-222222222222','listener',false,'removed')$$,
  'watch_party_current_session_required',
  '98a. stale host token cannot remove a Watch-Party member'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"a7777777-7777-4777-8777-777777777777","session_id":"a7777777-7777-4777-8777-777777777701"}', true);
select throws_ok(
  $$select public.set_watch_party_participant_authority('CLOSURESEAT','b2222222-2222-4222-8222-222222222222','speaker',false,'active')$$,
  'paid_watch_party_viewer_only',
  '99. paid-seat viewer cannot be promoted to speaker by the host path'
);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select lives_ok(
  $$select public.heartbeat_watch_party_room_session('CLOSURESEAT','active',true,true,false,null,null,null)$$,
  '100. paid-seat heartbeat remains available without trusting media claims'
);
reset role;
select ok(
  exists (
    select 1 from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSURESEAT'
      and membership.user_id = 'b2222222-2222-4222-8222-222222222222'
      and membership.stage_role = 'listener'
      and not membership.can_speak
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '101. paid-seat heartbeat cannot enable camera, microphone, or speaker authority'
);

insert into public.communication_rooms (
  room_id, room_code, host_user_id, status, content_access_rule,
  linked_party_id, last_activity_at
) values (
  'CLOSURESEATCOMM', 'CLOSURESEATCOMM',
  'a7777777-7777-4777-8777-777777777777', 'active', 'open',
  'CLOSURESEAT', now()
);
insert into public.communication_room_memberships (
  room_id, user_id, role, membership_state, camera_enabled, mic_enabled,
  last_seen_at
) values (
  'CLOSURESEATCOMM', 'a7777777-7777-4777-8777-777777777777',
  'host', 'active', true, true, now()
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select lives_ok(
  $$select public.join_communication_room_session('CLOSURESEATCOMM','Paid Viewer',null,true,true)$$,
  '102. paid viewer may join the linked communication room as receive-only'
);
reset role;
select ok(
  exists (
    select 1 from public.communication_room_memberships membership
    where membership.room_id = 'CLOSURESEATCOMM'
      and membership.user_id = 'b2222222-2222-4222-8222-222222222222'
      and membership.role = 'participant'
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '103. linked communication membership cannot turn a Seat Pass into media publish authority'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select throws_ok(
  $$select public.broadcast_communication_room_signal('CLOSURESEATCOMM','webrtc:offer',jsonb_build_object('targetUserId','a7777777-7777-4777-8777-777777777777','description',jsonb_build_object('type','offer','sdp',E'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n')))$$,
  'paid_watch_party_viewer_only',
  '104. paid viewer cannot negotiate default sendrecv legacy WebRTC media'
);
select lives_ok(
  $$select public.broadcast_communication_room_signal('CLOSURESEATCOMM','webrtc:offer',jsonb_build_object('targetUserId','a7777777-7777-4777-8777-777777777777','description',jsonb_build_object('type','offer','sdp',E'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n')))$$,
  '105. paid viewer may negotiate explicit receive-only legacy WebRTC media'
);
select throws_ok(
  $$select public.broadcast_communication_room_signal('CLOSURESEATCOMM','media:update','{"cameraOn":true,"micOn":false}'::jsonb)$$,
  'paid_watch_party_viewer_only',
  '106. paid viewer cannot broadcast optimistic media-on state'
);
reset role;

select lives_ok(
  $$update public.access_grants set status='revoked',revoked_at=now(),revoke_reason='closure regression' where id='ab555555-5555-4555-8555-555555555555'$$,
  '107. terminal grant revocation is applied atomically'
);
select ok(
  exists (
    select 1 from public.watch_party_room_memberships membership
    where membership.party_id = 'CLOSURESEAT'
      and membership.user_id = 'b2222222-2222-4222-8222-222222222222'
      and membership.membership_state = 'removed'
      and membership.stage_role = 'listener'
      and not membership.can_speak
      and not membership.camera_enabled
      and not membership.mic_enabled
  ),
  '108. grant revocation removes exact paid-room presence and publish-shaped state'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  not (public.resolve_watch_party_livekit_viewer_authority(
    'CLOSURESEAT', 'b2222222-2222-4222-8222-222222222222',
    'b2222222-2222-4222-8222-222222222201'
  ) ->> 'allowed')::boolean,
  '109. revoked grant cannot retain paid-room access'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"b2222222-2222-4222-8222-222222222222","session_id":"b2222222-2222-4222-8222-222222222201"}', true);
select ok(
  not public.can_read_watch_party_room_authority('CLOSURESEAT'),
  '110. revoked paid viewer cannot read room messages or attachments'
);
select ok(
  not public.can_read_communication_room_authority('CLOSURESEATCOMM'),
  '111. revoked paid viewer cannot retain linked communication/Realtime authority'
);
reset role;

select * from finish();
rollback;
