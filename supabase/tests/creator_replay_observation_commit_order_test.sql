-- Native multi-session tests cover real COMMIT, provider/creator interleavings,
-- and opposite event orders. This rolled-back pgTAP suite isolates queue,
-- authority, and observation semantics without changing production history.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select has_table('private','creator_event_replay_observation_pending',
  'source transactions queue replay observations privately');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='private.creator_event_replay_observation_pending'::regclass),
  'pending observations enable and force row level security');
select is((select count(*)::integer from pg_policy
  where polrelid='private.creator_event_replay_observation_pending'::regclass),0,
  'pending observations have no API access policy');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) api_role
  where has_table_privilege(api_role,'private.creator_event_replay_observation_pending',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')),
  'API roles cannot read or mutate pending observations');
select ok(not exists(select 1 from pg_class relation
  cross join lateral aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) privilege
  where relation.oid='private.creator_event_replay_observation_pending'::regclass
    and privilege.grantee=0),
  'PUBLIC has no pending-observation privileges');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) api_role
  where has_function_privilege(api_role,'private.flush_creator_event_replay_observations()','EXECUTE')),
  'API roles cannot invoke the deferred observer directly');
select ok(not exists(select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) privilege
  where procedure.oid='private.flush_creator_event_replay_observations()'::regprocedure
    and privilege.grantee=0),
  'PUBLIC cannot invoke the deferred observer directly');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid='private.flush_creator_event_replay_observations()'::regprocedure),
  'deferred capture retains an empty definer search path');
select ok(exists(select 1 from pg_trigger
  where tgrelid='private.creator_event_replay_observation_pending'::regclass
    and tgname='creator_event_replay_observation_commit' and tgtype=5
    and tgdeferrable and tginitdeferred and tgenabled in('O','A')
    and tgfoid='private.flush_creator_event_replay_observations()'::regprocedure),
  'queued observations flush through an initially deferred constraint trigger');
select ok(not exists(select 1 from pg_constraint
  where conrelid='private.creator_event_replay_observation_pending'::regclass and contype='f'),
  'queueing an observation does not acquire a foreign-key lock on source rows');
select is((select count(*)::integer from private.creator_event_replay_observation_pending),0,
  'completed earlier transactions leave no pending observations');

-- Notification activity written by an AFTER event trigger takes the shared
-- media guard. The lifecycle prelock must run before those AFTER side effects.
select ok(exists(select 1 from pg_trigger lifecycle
  where lifecycle.tgrelid='public.creator_events'::regclass
    and lifecycle.tgfoid='private.guard_creator_event_lifecycle()'::regprocedure
    and lifecycle.tgtype=23 and lifecycle.tgenabled in('O','A')),
  'the lifecycle prelock guards every event insert and update before the row write');
select is((select count(*)::integer from pg_trigger side_effect
  join pg_trigger lifecycle on lifecycle.tgrelid=side_effect.tgrelid
    and lifecycle.tgfoid='private.guard_creator_event_lifecycle()'::regprocedure
    and lifecycle.tgtype=23 and lifecycle.tgenabled in('O','A')
  where side_effect.tgrelid='public.creator_events'::regclass
    and side_effect.tgfoid in('private.enqueue_discovery_notification_transition()'::regprocedure,
      'private.queue_creator_event_broadcast_lifecycle_stop()'::regprocedure)
    and (side_effect.tgtype & 19)=17 and side_effect.tgenabled in('O','A')),2,
  'stop jobs are prelocked before notification and stop-queue AFTER side effects');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) api_role
  where has_function_privilege(api_role,'private.guard_creator_event_lifecycle()','EXECUTE')),
  'replacing the lifecycle guard preserves its denial of direct API execution');

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000','73e1a670-62e4-4bb6-980a-58a74ecaa001',
  'authenticated','authenticated','replay-commit-regression@example.test','',now(),
  '{}','{}',now(),now(),false,false
);
insert into public.creator_events(id,host_user_id,event_title,event_type)
  values('73e1a670-62e4-4bb6-980a-58a74ecaa101','73e1a670-62e4-4bb6-980a-58a74ecaa001',
    'Replay commit fixture','live_first');
-- A synthetic positive baseline makes the subsequent absence of any protected
-- playback observable. No existing history is edited or manufactured as proof.
insert into private.creator_event_replay_availability_facts(
  event_id,available,attempt_id,broadcast_id,record_id,replay_id,receipt_id)
  values('73e1a670-62e4-4bb6-980a-58a74ecaa101',true,
    gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
update public.creator_events set event_title='First intermediate title'
  where id='73e1a670-62e4-4bb6-980a-58a74ecaa101';
update public.creator_events set event_title='Final committed title'
  where id='73e1a670-62e4-4bb6-980a-58a74ecaa101';
select is((select count(*)::integer from private.creator_event_replay_observation_pending
  where transaction_id=txid_current() and event_id='73e1a670-62e4-4bb6-980a-58a74ecaa101'),1,
  'repeated writes queue one observation per event and transaction');
select is((select count(*)::integer from private.creator_event_replay_availability_facts
  where event_id='73e1a670-62e4-4bb6-980a-58a74ecaa101'),1,
  'intermediate source writes do not append prematurely visible observations');
create temporary table replay_flush_boundary on commit drop as select clock_timestamp() observed_after;
-- Emulate the commit-time constraint boundary while retaining test rollback.
set constraints private.creator_event_replay_observation_commit immediate;
select is((select count(*)::integer from private.creator_event_replay_observation_pending
  where transaction_id=txid_current()),0,
  'the deferred flush removes the complete current transaction queue');
select is((select count(*)::integer from private.creator_event_replay_availability_facts
  where event_id='73e1a670-62e4-4bb6-980a-58a74ecaa101'),2,
  'one final availability transition is appended for repeated source writes');
select ok((select not available and observed_at>=(select observed_after from replay_flush_boundary)
  from private.creator_event_replay_availability_facts
  where event_id='73e1a670-62e4-4bb6-980a-58a74ecaa101' order by id desc limit 1),
  'the final source state receives its actual flush-time observation timestamp');
set constraints private.creator_event_replay_observation_commit deferred;
update public.creator_events set event_title='Same availability'
  where id='73e1a670-62e4-4bb6-980a-58a74ecaa101';
set constraints private.creator_event_replay_observation_commit immediate;
select is((select count(*)::integer from private.creator_event_replay_availability_facts
  where event_id='73e1a670-62e4-4bb6-980a-58a74ecaa101'),2,
  'a later unchanged source state remains deduplicated');
set constraints private.creator_event_replay_observation_commit deferred;
savepoint replay_queue_rollback;
update public.creator_events set event_title='Rolled-back source change'
  where id='73e1a670-62e4-4bb6-980a-58a74ecaa101';
rollback to savepoint replay_queue_rollback;
select is((select count(*)::integer from private.creator_event_replay_observation_pending
  where transaction_id=txid_current()),0,
  'rolling back a source change also removes its queued observation');
select is((select count(*)::integer from private.creator_event_replay_availability_facts
  where event_id='73e1a670-62e4-4bb6-980a-58a74ecaa101'),2,
  'a rolled-back source change does not create an observation');

select * from finish();
rollback;
