begin;
select plan(31);

-- Unique participant pairs keep the real call-abuse guard enabled. Everything,
-- including these helpers and fixtures, is rolled back by this hosted SQL test.
create function pg_temp.deadline_fixture(p_case integer, p_remaining interval, p_status text default 'ringing')
returns jsonb language plpgsql as $$
declare
  v_caller uuid := md5('deadline-caller-' || p_case)::uuid;
  v_callee uuid := md5('deadline-callee-' || p_case)::uuid;
  v_session uuid := md5('deadline-session-' || p_case)::uuid;
  v_thread uuid := md5('deadline-thread-' || p_case)::uuid;
  v_invite uuid := md5('deadline-invite-' || p_case)::uuid;
  v_room text := 'DT' || lpad(p_case::text, 4, '0');
  v_expiry timestamptz := clock_timestamp() + p_remaining;
begin
  insert into auth.users (id, is_sso_user, is_anonymous)
  values (v_caller, false, false), (v_callee, false, false);
  insert into auth.sessions (id, user_id) values (v_session, v_caller);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', v_caller, 'session_id', v_session)::text, true);
  insert into public.chat_threads (id, thread_kind, participant_pair_key, created_by)
  values (v_thread, 'direct', least(v_caller::text, v_callee::text) || '::' || greatest(v_caller::text, v_callee::text), v_caller::text);
  insert into public.chat_thread_members (thread_id, user_id)
  values (v_thread, v_caller::text), (v_thread, v_callee::text);
  insert into public.communication_rooms (room_id, room_code, host_user_id, status)
  values (v_room, v_room, v_caller::text, 'active');
  if p_status <> 'prepared' then
    insert into public.chat_call_invites (
      id, thread_id, communication_room_id, caller_user_id, callee_user_id,
      call_type, status, created_at, expires_at, accepted_at
    ) values (
      v_invite, v_thread, v_room, v_caller::text, v_callee::text,
      'voice', p_status, v_expiry - interval '90 seconds', v_expiry,
      case when p_status = 'accepted' then v_expiry - interval '80 seconds' else null end
    );
  end if;
  return jsonb_build_object('caller', v_caller, 'callee', v_callee, 'thread', v_thread,
    'invite', v_invite, 'room', v_room, 'expiry', v_expiry);
end;
$$;
create temporary table deadline_fixtures (label text primary key, data jsonb not null);
create temporary table deadline_results (label text primary key, data jsonb not null);

insert into deadline_fixtures values ('new', pg_temp.deadline_fixture(1, interval '30 seconds', 'prepared'));
insert into deadline_results select 'new', public.begin_chilly_chat_call((data->>'thread')::uuid, data->>'room', 'voice') from deadline_fixtures where label = 'new';
select is((select extract(epoch from ((data#>>'{invite,expires_at}')::timestamptz - (data#>>'{invite,created_at}')::timestamptz))::integer from deadline_results where label = 'new'), 45, 'new invite receives exactly the prospective 45-second window');
select ok((select (data->>'created')::boolean from deadline_results where label = 'new'), 'normal exact caller creates the new invite');

insert into deadline_fixtures values ('legacy', pg_temp.deadline_fixture(2, interval '30 seconds'));
insert into deadline_results select 'legacy', public.begin_chilly_chat_call((data->>'thread')::uuid, data->>'room', 'voice') from deadline_fixtures where label = 'legacy';
select is((select data#>>'{invite,id}' from deadline_results where label = 'legacy'), (select data->>'invite' from deadline_fixtures where label = 'legacy'), 'begin reuses an existing live 90-second invite');
select is((select (data#>>'{invite,expires_at}')::timestamptz from deadline_results where label = 'legacy'), (select (data->>'expiry')::timestamptz from deadline_fixtures where label = 'legacy'), 'existing invite deadline is not shortened or renewed');

insert into deadline_fixtures values ('early', pg_temp.deadline_fixture(3, interval '30 seconds'));
insert into deadline_results select 'early', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'callee')::uuid, 'declined') from deadline_fixtures where label = 'early';
select is((select data#>>'{invite,status}' from deadline_results where label = 'early'), 'declined', 'genuine pre-deadline callee Decline remains declined');
select is((select data#>>'{delivery,action}' from deadline_results where label = 'early'), 'declined', 'genuine Decline retains its native cleanup action');

insert into deadline_fixtures values ('late', pg_temp.deadline_fixture(4, interval '-1 second'));
insert into deadline_results select 'late', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'callee')::uuid, 'declined') from deadline_fixtures where label = 'late';
select is((select data#>>'{invite,status}' from deadline_results where label = 'late'), 'missed', 'authoritative expiry wins a late callee Decline');
select is((select data#>>'{delivery,action}' from deadline_results where label = 'late'), 'timeout', 'late callee Decline retains timeout cleanup and missed notification dispatch');
insert into deadline_results select 'late-replay', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'callee')::uuid, 'declined') from deadline_fixtures where label = 'late';
select ok((select (data->>'idempotent')::boolean from deadline_results where label = 'late-replay'), 'late Decline replay is idempotent after normalization');
select is((select data#>>'{delivery,id}' from deadline_results where label = 'late-replay'), (select data#>>'{delivery,id}' from deadline_results where label = 'late'), 'late Decline replay reuses the same delivery');
insert into deadline_results select 'late-worker', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'caller')::uuid, 'missed') from deadline_fixtures where label = 'late';
select is((select data#>>'{delivery,id}' from deadline_results where label = 'late-worker'), (select data#>>'{delivery,id}' from deadline_results where label = 'late'), 'expiry worker after callee shares the same delivery');
select is((select count(*)::integer from public.chat_call_events where call_invite_id = (select (data->>'invite')::uuid from deadline_fixtures where label = 'late') and event_type = 'missed'), 1, 'late replays produce one missed event');
select is((select count(*)::integer from public.chat_call_events where call_invite_id = (select (data->>'invite')::uuid from deadline_fixtures where label = 'late') and event_type = 'declined'), 0, 'late replays produce no misleading declined event');

insert into deadline_fixtures values ('worker-first', pg_temp.deadline_fixture(5, interval '-1 second'));
insert into deadline_results select 'worker-first', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'caller')::uuid, 'missed') from deadline_fixtures where label = 'worker-first';
insert into deadline_results select 'worker-first-decline', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'callee')::uuid, 'declined') from deadline_fixtures where label = 'worker-first';
select is((select data#>>'{delivery,id}' from deadline_results where label = 'worker-first-decline'), (select data#>>'{delivery,id}' from deadline_results where label = 'worker-first'), 'callee after expiry worker also reuses the same missed delivery');

insert into deadline_fixtures values ('denials', pg_temp.deadline_fixture(6, interval '-1 second'));
select throws_ok(format('select public.transition_chilly_chat_call_invite(%L::uuid,%L::uuid,''declined'')', data->>'invite', data->>'caller'), 'P0001', 'transition_decline_forbidden', 'caller cannot borrow missed authority by requesting Decline') from deadline_fixtures where label = 'denials';
select throws_ok(format('select public.transition_chilly_chat_call_invite(%L::uuid,%L::uuid,''declined'')', data->>'invite', (select data->>'caller' from deadline_fixtures where label = 'early')), 'P0001', 'transition_not_call_participant', 'unrelated actor remains rejected') from deadline_fixtures where label = 'denials';
select throws_ok(format('select public.transition_chilly_chat_call_invite(%L::uuid,%L::uuid,''accepted'')', data->>'invite', data->>'callee'), 'P0001', 'transition_accept_forbidden', 'late Answer cannot revive the invite') from deadline_fixtures where label = 'denials';
delete from public.chat_thread_members where thread_id = (select (data->>'thread')::uuid from deadline_fixtures where label = 'denials') and user_id = (select data->>'callee' from deadline_fixtures where label = 'denials');
select throws_ok(format('select public.transition_chilly_chat_call_invite(%L::uuid,%L::uuid,''declined'')', data->>'invite', data->>'callee'), 'P0001', 'transition_thread_membership_required', 'removed thread membership cannot settle the call') from deadline_fixtures where label = 'denials';

insert into deadline_fixtures values ('accepted', pg_temp.deadline_fixture(7, interval '-1 second', 'accepted'));
select throws_ok(format('select public.transition_chilly_chat_call_invite(%L::uuid,%L::uuid,''declined'')', data->>'invite', data->>'callee'), 'P0001', 'transition_decline_forbidden', 'accepted call never becomes missed through Decline') from deadline_fixtures where label = 'accepted';
insert into deadline_results select 'accepted-end', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'caller')::uuid, 'ended') from deadline_fixtures where label = 'accepted';
select is((select data#>>'{invite,status}' from deadline_results where label = 'accepted-end'), 'ended', 'accepted call keeps normal End semantics');
insert into deadline_fixtures values ('canceled', pg_temp.deadline_fixture(8, interval '-1 second', 'canceled'));
select throws_ok(format('select public.transition_chilly_chat_call_invite(%L::uuid,%L::uuid,''declined'')', data->>'invite', data->>'callee'), 'P0001', 'transition_decline_forbidden', 'canceled call never becomes missed through Decline') from deadline_fixtures where label = 'canceled';
insert into deadline_fixtures values ('declined', pg_temp.deadline_fixture(9, interval '-1 second', 'declined'));
insert into deadline_results select 'historical-decline', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'callee')::uuid, 'declined') from deadline_fixtures where label = 'declined';
select is((select data#>>'{invite,status}' from deadline_results where label = 'historical-decline'), 'declined', 'existing genuine Decline is not reclassified after its deadline');

-- now() remains the transaction start, before this expiry. Reverting the
-- production post-lock clock to now() makes this real transition fail.
insert into deadline_fixtures values ('fresh-clock', pg_temp.deadline_fixture(10, interval '20 milliseconds'));
select pg_sleep(0.04);
select ok((select now() < (data->>'expiry')::timestamptz and clock_timestamp() >= (data->>'expiry')::timestamptz from deadline_fixtures where label = 'fresh-clock'), 'fresh-clock fixture crosses expiry while transaction-start time remains before it');
insert into deadline_results select 'fresh-clock', public.transition_chilly_chat_call_invite((data->>'invite')::uuid, (data->>'callee')::uuid, 'declined') from deadline_fixtures where label = 'fresh-clock';
select is((select data#>>'{invite,status}' from deadline_results where label = 'fresh-clock'), 'missed', 'expiry decision uses fresh post-lock time rather than transaction start');
select ok(not has_function_privilege('anon', 'public.transition_chilly_chat_call_invite(uuid,uuid,text,integer)', 'EXECUTE'), 'anonymous callers cannot invoke terminal transition');
select ok(not has_function_privilege('authenticated', 'public.transition_chilly_chat_call_invite(uuid,uuid,text,integer)', 'EXECUTE'), 'authenticated clients cannot bypass the trusted transition endpoint');
select ok(has_function_privilege('service_role', 'public.transition_chilly_chat_call_invite(uuid,uuid,text,integer)', 'EXECUTE'), 'trusted service retains transition execution');
select ok(has_function_privilege('authenticated', 'public.begin_chilly_chat_call(uuid,text,text)', 'EXECUTE'), 'authenticated clients retain exact caller begin RPC');
select ok(not has_function_privilege('anon', 'public.begin_chilly_chat_call(uuid,text,text)', 'EXECUTE'), 'anonymous callers cannot begin a call');
select is((select count(*)::integer from public.chat_call_transition_deliveries where call_invite_id = (select (data->>'invite')::uuid from deadline_fixtures where label = 'late')), 1, 'normalization and replay reserve exactly one transition delivery');
select is((select count(*)::integer from public.chat_call_events where call_invite_id = (select (data->>'invite')::uuid from deadline_fixtures where label = 'early') and event_type = 'missed'), 0, 'genuine early Decline never creates a missed event');
select * from finish();
rollback;
