begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);

select ok(
  (select relrowsecurity from pg_class where oid='public.livekit_room_namespace_reservations'::regclass)
  and not has_table_privilege('anon','public.livekit_room_namespace_reservations','SELECT')
  and not has_table_privilege('authenticated','public.livekit_room_namespace_reservations','SELECT')
  and not has_table_privilege('service_role','public.livekit_room_namespace_reservations','SELECT'),
  '1. the shared namespace registry is RLS-enabled and unavailable through Data API roles'
);

select ok(
  pg_get_functiondef('public.reserve_livekit_room_namespace()'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and pg_get_functiondef('public.release_livekit_room_namespace()'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and not has_function_privilege('authenticated','public.reserve_livekit_room_namespace()','EXECUTE')
  and not has_function_privilege('service_role','public.release_livekit_room_namespace()','EXECUTE'),
  '2. namespace trigger functions have fixed paths and no caller execution grant'
);

select is(
  (select count(*)::integer
   from pg_trigger trigger_state
   where trigger_state.tgrelid in (
       'public.communication_rooms'::regclass,
       'public.watch_party_rooms'::regclass
     )
     and trigger_state.tgname in (
       'enforce_livekit_room_namespace_unique_trigger',
       'release_livekit_room_namespace_trigger'
     )
     and trigger_state.tgenabled='O'
     and not trigger_state.tgisinternal),
  4,
  '3. reserve and release triggers are enabled on both room authorities'
);

insert into auth.users(id,is_sso_user,is_anonymous)
values ('fa300000-0000-4000-8000-000000000001',false,false);

select lives_ok(
  $$insert into public.communication_rooms(room_id,room_code,host_user_id,status)
    values ('Namespace-A','NAMESPACE-A','fa300000-0000-4000-8000-000000000001','active')$$,
  '4. an ordinary Live room can reserve a previously unused room name'
);
select is(
  (select room_kind from public.livekit_room_namespace_reservations where room_name='NAMESPACE-A'),
  'communication',
  '5. an ordinary Live room owns the exact normalized reservation'
);
select throws_ok(
  $$insert into public.watch_party_rooms(party_id,host_user_id,room_type)
    values ('namespace-a','fa300000-0000-4000-8000-000000000001','live')$$,
  'P0001','livekit_room_namespace_collision',
  '6. a Watch Party cannot claim an ordinary Live room name with different casing'
);

delete from public.communication_rooms where room_id='Namespace-A';
select is(
  (select count(*)::integer from public.livekit_room_namespace_reservations where room_name='NAMESPACE-A'),
  0,
  '7. deleting the owning room releases its exact reservation'
);
select lives_ok(
  $$insert into public.watch_party_rooms(party_id,host_user_id,room_type)
    values ('NAMESPACE-A','fa300000-0000-4000-8000-000000000001','live')$$,
  '8. the other room authority can claim a name only after its prior owner is deleted'
);
select is(
  (select room_kind from public.livekit_room_namespace_reservations where room_name='NAMESPACE-A'),
  'watch_party',
  '9. the replacement reservation remains bound to its Watch Party owner'
);
select throws_ok(
  $$insert into public.communication_rooms(room_id,room_code,host_user_id,status)
    values ('namespace-a','NAMESPACE-A-2','fa300000-0000-4000-8000-000000000001','active')$$,
  'P0001','livekit_room_namespace_collision',
  '10. an ordinary Live room cannot claim an existing Watch Party name'
);

insert into public.communication_rooms(room_id,room_code,host_user_id,status)
values ('Namespace-B','NAMESPACE-B','fa300000-0000-4000-8000-000000000001','active');
select throws_ok(
  $$update public.watch_party_rooms set party_id='namespace-b' where party_id='NAMESPACE-A'$$,
  'P0001','livekit_room_namespace_collision',
  '11. updating an existing room identity cannot cross into a reserved namespace'
);
select is(
  (select count(*)::integer
   from public.livekit_room_namespace_reservations
   where (room_name,room_kind,room_id) in (
     ('NAMESPACE-A','watch_party','NAMESPACE-A'),
     ('NAMESPACE-B','communication','Namespace-B')
   )),
  2,
  '12. failed collision attempts preserve both original ownership reservations'
);

alter table public.watch_party_rooms
  disable trigger enforce_livekit_room_namespace_unique_trigger;
insert into public.watch_party_rooms(party_id,host_user_id,room_type)
values ('namespace-a','fa300000-0000-4000-8000-000000000001','live');
alter table public.watch_party_rooms
  enable trigger enforce_livekit_room_namespace_unique_trigger;

delete from public.watch_party_rooms where party_id='NAMESPACE-A';
select is(
  (select room_id from public.livekit_room_namespace_reservations where room_name='NAMESPACE-A'),
  'namespace-a',
  '13. deleting a canonical legacy casing alias rebinds its reservation to the preserved alias'
);
select throws_ok(
  $$insert into public.communication_rooms(room_id,room_code,host_user_id,status)
    values ('NAMESPACE-A','NAMESPACE-A-3','fa300000-0000-4000-8000-000000000001','active')$$,
  'P0001','livekit_room_namespace_collision',
  '14. a preserved same-authority alias still blocks a cross-authority namespace claim'
);

select * from finish();
rollback;
