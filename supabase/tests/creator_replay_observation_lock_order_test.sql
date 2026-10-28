-- Local pgTAP regression for the replay-observation FK lock boundary.
-- Run after the forward migration as the normal test database owner. Every
-- fixture rolls back; all production triggers and access controls stay enabled.
-- The separate two-session test proves concurrency and snapshots history across
-- the migration; this file verifies referential integrity and API isolation.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select has_table('private','creator_event_replay_observation_anchors',
  'replay observations have a separate event reference anchor');
select col_is_pk('private','creator_event_replay_observation_anchors','event_id',
  'each event has at most one observation anchor');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='private.creator_event_replay_observation_anchors'::regclass),
  'observation anchors enable and force row level security');
select is((select count(*)::integer from pg_policy
  where polrelid='private.creator_event_replay_observation_anchors'::regclass),0,
  'observation anchors expose no row-level access policy');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) api_role
  where has_table_privilege(api_role,'private.creator_event_replay_observation_anchors',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')),
  'API roles have no observation-anchor table privileges');
select ok(not exists(select 1 from pg_class relation
  cross join lateral aclexplode(coalesce(relation.relacl,acldefault('r',relation.relowner))) privilege
  where relation.oid='private.creator_event_replay_observation_anchors'::regclass
    and privilege.grantee=0),
  'PUBLIC has no observation-anchor table privileges');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) api_role
  where has_function_privilege(api_role,'private.seed_creator_event_replay_observation_anchor()','EXECUTE')),
  'API roles cannot call the observation-anchor trigger function');
select ok(not exists(select 1 from pg_proc procedure
  cross join lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) privilege
  where procedure.oid='private.seed_creator_event_replay_observation_anchor()'::regprocedure
    and privilege.grantee=0 and privilege.privilege_type='EXECUTE'),
  'PUBLIC cannot call the observation-anchor trigger function');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid='private.seed_creator_event_replay_observation_anchor()'::regprocedure),
  'anchor seeding uses a security-definer function with an empty search path');
select ok(exists(select 1 from pg_trigger seed join pg_trigger capture
  on capture.tgrelid=seed.tgrelid and capture.tgname='record_creator_event_replay_availability'
  where seed.tgrelid='public.creator_events'::regclass
    and seed.tgname='creator_event_replay_observation_anchor_after_insert'
    and seed.tgfoid='private.seed_creator_event_replay_observation_anchor()'::regprocedure
    and seed.tgtype=5 and seed.tgenabled in('O','A') and seed.tgqual is null
    and not seed.tgisinternal and seed.tgname<capture.tgname),
  'the enabled AFTER INSERT row trigger seeds anchors before replay capture');

select ok(exists(select 1 from pg_constraint constraint_row
  where constraint_row.conrelid='private.creator_event_replay_observation_anchors'::regclass
    and constraint_row.contype='f' and constraint_row.confrelid='public.creator_events'::regclass
    and constraint_row.confdeltype='c' and constraint_row.confupdtype='c'
    and constraint_row.convalidated and not constraint_row.condeferrable
    and constraint_row.conkey=array[(select attnum from pg_attribute
      where attrelid=constraint_row.conrelid and attname='event_id')]
    and constraint_row.confkey=array[(select attnum from pg_attribute
      where attrelid=constraint_row.confrelid and attname='id')]),
  'anchors reference real events and cascade event deletion and key changes');
select ok(exists(select 1 from pg_constraint constraint_row
  where constraint_row.conrelid='private.creator_event_replay_availability_facts'::regclass
    and constraint_row.conname='creator_event_replay_availability_facts_event_id_fkey'
    and constraint_row.contype='f'
    and constraint_row.confrelid='private.creator_event_replay_observation_anchors'::regclass
    and constraint_row.confdeltype='r' and constraint_row.confupdtype='a'
    and constraint_row.convalidated and not constraint_row.condeferrable
    and constraint_row.conkey=array[(select attnum from pg_attribute
      where attrelid=constraint_row.conrelid and attname='event_id')]
    and constraint_row.confkey=array[(select attnum from pg_attribute
      where attrelid=constraint_row.confrelid and attname='event_id')]),
  'fact inserts check the anchor while retaining immediate restrictive history references');
select ok(not exists(select 1 from pg_constraint
  where conrelid='private.creator_event_replay_availability_facts'::regclass
    and contype='f' and confrelid='public.creator_events'::regclass),
  'fact inserts no longer acquire a foreign-key lock on the mutable event row');
select is((select count(*)::integer from public.creator_events event
  left join private.creator_event_replay_observation_anchors anchor on anchor.event_id=event.id
  where anchor.event_id is null),0,
  'all pre-existing events have observation anchors after backfill');
select is((select count(*)::integer from private.creator_event_replay_availability_facts fact
  left join private.creator_event_replay_observation_anchors anchor on anchor.event_id=fact.event_id
  where anchor.event_id is null),0,
  'all retained replay observations resolve to an anchor');
select ok(exists(select 1 from pg_trigger
  where tgrelid='private.creator_event_replay_availability_facts'::regclass
    and tgname='creator_event_replay_availability_facts_immutable'
    and tgfoid='private.guard_creator_event_policy_history()'::regprocedure
    and tgtype=27 and tgenabled in('O','A') and tgqual is null),
  'replay observation history retains its immutable update/delete guard');

create temporary table replay_observation_history_before on commit drop as
  select to_jsonb(fact) row_data from private.creator_event_replay_availability_facts fact;
create temporary table replay_observation_policy_before on commit drop as
  select to_jsonb(policy) row_data from private.creator_event_replay_policy_observation policy;

select throws_ok($$insert into private.creator_event_replay_availability_facts(event_id,available)
  values('63e1a670-62e4-4bb6-980a-58a74ecaa999',false)$$,'23503',null,
  'an observation for a missing event still fails with foreign_key_violation');
select throws_ok($$insert into private.creator_event_replay_observation_anchors(event_id)
  values('63e1a670-62e4-4bb6-980a-58a74ecaa999')$$,'23503',null,
  'an anchor cannot be created for a missing event');

-- Unpaid draft events avoid unrelated immutable sale/schedule references. The
-- ordinary signup and event triggers run, including the new anchor trigger.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000','63e1a670-62e4-4bb6-980a-58a74ecaa001',
  'authenticated','authenticated','replay-anchor-regression@example.test','',now(),
  '{}','{}',now(),now(),false,false
);
select lives_ok($$insert into public.creator_events(id,host_user_id,event_title,event_type)
  values
    ('63e1a670-62e4-4bb6-980a-58a74ecaa101','63e1a670-62e4-4bb6-980a-58a74ecaa001',
     'Replay anchor retained-history fixture','live_first'),
    ('63e1a670-62e4-4bb6-980a-58a74ecaa102','63e1a670-62e4-4bb6-980a-58a74ecaa001',
     'Replay anchor no-history fixture','live_first')$$,
  'new unpaid draft events can be created with all triggers enabled');
select is((select count(*)::integer from private.creator_event_replay_observation_anchors
  where event_id in('63e1a670-62e4-4bb6-980a-58a74ecaa101','63e1a670-62e4-4bb6-980a-58a74ecaa102')),2,
  'new event insertion automatically creates one anchor per event');
select is((select count(*)::integer from private.creator_event_replay_availability_facts
  where event_id in('63e1a670-62e4-4bb6-980a-58a74ecaa101','63e1a670-62e4-4bb6-980a-58a74ecaa102')),0,
  'anchor creation does not manufacture observations for unpaid draft events');
select lives_ok($$insert into private.creator_event_replay_availability_facts(event_id,available)
  values('63e1a670-62e4-4bb6-980a-58a74ecaa101',false)$$,
  'a synthetic observation can reference a real event through its anchor');
select lives_ok($$select private.capture_creator_event_replay_availability(
  '63e1a670-62e4-4bb6-980a-58a74ecaa101')$$,
  'the existing capture function can observe an anchored event');
select is((select count(*)::integer from private.creator_event_replay_availability_facts
  where event_id='63e1a670-62e4-4bb6-980a-58a74ecaa101'),1,
  'unchanged unavailable observations remain deduplicated');
select throws_ok($$update private.creator_event_replay_availability_facts
  set observed_at=clock_timestamp() where event_id='63e1a670-62e4-4bb6-980a-58a74ecaa101'$$,
  'P0001','event_ticket_policy_history_immutable',
  'existing observation timestamps cannot be rewritten');
select throws_ok($$delete from private.creator_event_replay_availability_facts
  where event_id='63e1a670-62e4-4bb6-980a-58a74ecaa101'$$,
  'P0001','event_ticket_policy_history_immutable',
  'existing observations cannot be deleted');
select throws_ok($$delete from public.creator_events
  where id='63e1a670-62e4-4bb6-980a-58a74ecaa101'$$,'23503',null,
  'an event with replay history still cannot be deleted');
select throws_ok($$update public.creator_events set id='63e1a670-62e4-4bb6-980a-58a74ecaa104'
  where id='63e1a670-62e4-4bb6-980a-58a74ecaa101'$$,'23503',null,
  'an event key with replay history still cannot be changed');
select lives_ok($$update public.creator_events set id='63e1a670-62e4-4bb6-980a-58a74ecaa103'
  where id='63e1a670-62e4-4bb6-980a-58a74ecaa102'$$,
  'an unpaid event without history can still change its key');
select ok(exists(select 1 from private.creator_event_replay_observation_anchors
  where event_id='63e1a670-62e4-4bb6-980a-58a74ecaa103')
  and not exists(select 1 from private.creator_event_replay_observation_anchors
    where event_id='63e1a670-62e4-4bb6-980a-58a74ecaa102'),
  'a no-history event key update cascades to its anchor');
select lives_ok($$delete from public.creator_events
  where id='63e1a670-62e4-4bb6-980a-58a74ecaa103'$$,
  'an unpaid event without history can still be deleted');
select is((select count(*)::integer from private.creator_event_replay_observation_anchors
  where event_id in('63e1a670-62e4-4bb6-980a-58a74ecaa102','63e1a670-62e4-4bb6-980a-58a74ecaa103')),0,
  'deleting a no-history event cascades to its anchor');
select is((select count(*)::integer from public.creator_events event
  join private.creator_event_replay_observation_anchors anchor on anchor.event_id=event.id
  join private.creator_event_replay_availability_facts fact on fact.event_id=anchor.event_id
  where event.id='63e1a670-62e4-4bb6-980a-58a74ecaa101'),1,
  'failed history mutations preserve the event, anchor, and original fact');
select results_eq(
  $$select to_jsonb(fact) from private.creator_event_replay_availability_facts fact
    where fact.event_id<>'63e1a670-62e4-4bb6-980a-58a74ecaa101' order by to_jsonb(fact)$$,
  $$select row_data from replay_observation_history_before order by row_data$$,
  'the regression operations leave all pre-existing observation facts unchanged');
select results_eq(
  $$select to_jsonb(policy) from private.creator_event_replay_policy_observation policy$$,
  $$select row_data from replay_observation_policy_before$$,
  'the policy observation cutover remains unchanged');

select * from finish();
rollback;
