begin;
select plan(28);

select has_function('private', 'broadcast_communication_state_invalidation', array[]::text[],
  'state invalidation is an internal trigger function');
select ok((select prosecdef from pg_proc where oid='private.broadcast_communication_state_invalidation()'::regprocedure),
  'only the server-owned trigger sends private invalidations');
select ok((select 'search_path=""'=any(proconfig) from pg_proc where oid='private.broadcast_communication_state_invalidation()'::regprocedure),
  'internal trigger has a fixed empty search path');
select ok(not has_function_privilege('authenticated','private.broadcast_communication_state_invalidation()','EXECUTE'),
  'authenticated clients cannot invoke the trigger helper');
select ok(not has_function_privilege('anon','private.broadcast_communication_state_invalidation()','EXECUTE'),
  'anonymous clients cannot invoke the trigger helper');
select ok(not has_function_privilege('service_role','private.broadcast_communication_state_invalidation()','EXECUTE'),
  'service role has no direct helper invocation');
select ok(not exists (
  select 1 from pg_proc p, lateral aclexplode(p.proacl) acl
  where p.oid='private.broadcast_communication_state_invalidation()'::regprocedure
    and acl.grantee=0 and acl.privilege_type='EXECUTE'
), 'PUBLIC has no helper execution grant');
select has_trigger('public','communication_rooms','broadcast_communication_room_state_invalidation',
  'room mutations produce invalidation hints');
select has_trigger('public','communication_room_memberships','broadcast_communication_membership_state_invalidation',
  'membership mutations produce invalidation hints');
select is((select count(*)::integer from pg_trigger
  where tgfoid='private.broadcast_communication_state_invalidation()'::regprocedure
    and tgtype=29 and tgenabled='O'), 2,
  'both triggers run after each INSERT UPDATE and DELETE in the write transaction');
select is((select count(*)::integer from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
    and tablename in ('communication_rooms','communication_room_memberships')), 0,
  'communication tables remain outside the shared CDC publication');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.communication_rooms'::regclass,'public.communication_room_memberships'::regclass)),
  'authoritative snapshot tables retain RLS');
select ok((select pg_get_expr(polqual,polrelid) like '%can_access_communication_realtime_topic%'
  from pg_policy where polrelid='realtime.messages'::regclass and polname='communication_room_realtime_receive'),
  'private delivery retains the exact room authorization predicate');
select ok((select pg_get_expr(polwithcheck,polrelid) like '%extension%presence%'
  and pg_get_expr(polwithcheck,polrelid) not like '%broadcast%'
  from pg_policy where polrelid='realtime.messages'::regclass and polname='communication_room_realtime_send'),
  'client Broadcast writes remain closed while authorized Presence remains available');
select ok(pg_get_functiondef('private.broadcast_communication_state_invalidation()'::regprocedure)
  like '%realtime.send(%''{}''::jsonb,%''state:update'',%''comm-room-'' || v_room_id,%true%',
  'server invalidations contain exactly an empty object on the private room topic');

insert into auth.users (id,is_sso_user,is_anonymous) values
  ('d9551111-1111-4111-8111-111111111111',false,false),
  ('d9552222-2222-4222-8222-222222222222',false,false);
insert into auth.sessions (id,user_id) values
  ('d9551111-1111-4111-8111-111111111110','d9551111-1111-4111-8111-111111111111'),
  ('d9552222-2222-4222-8222-222222222220','d9552222-2222-4222-8222-222222222222');
insert into public.user_profiles (user_id,username,display_name) values
  ('d9551111-1111-4111-8111-111111111111','state_hint_host','State Host'),
  ('d9552222-2222-4222-8222-222222222222','state_hint_receiver','State Receiver')
on conflict (user_id) do update set display_name=excluded.display_name;

select lives_ok($$insert into public.communication_rooms (room_id,room_code,host_user_id,status,content_access_rule)
  values ('STATEHINT1','STATEHINT1','d9551111-1111-4111-8111-111111111111','active','open')$$,
  'ordinary room insertion still succeeds with the trigger');
select lives_ok($$insert into public.communication_room_memberships
  (room_id,user_id,role,membership_state,camera_enabled,mic_enabled) values
  ('STATEHINT1','d9551111-1111-4111-8111-111111111111','host','active',true,true),
  ('STATEHINT1','d9552222-2222-4222-8222-222222222222','participant','active',true,true)$$,
  'ordinary membership insertion still succeeds with the trigger');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"d9552222-2222-4222-8222-222222222222","session_id":"d9552222-2222-4222-8222-222222222220"}',true);
select ok(public.can_access_communication_realtime_topic('comm-room-STATEHINT1'),
  'fresh participant may receive private invalidation hints');
select is((select count(*)::integer from public.communication_room_memberships where room_id='STATEHINT1'),2,
  'receiver derives its initial projection from authenticated RLS reads');
select throws_ok($$select public.broadcast_communication_room_signal('STATEHINT1','state:update','{}')$$,
  'communication_signal_event_invalid','existing client relay cannot forge a server state invalidation');
reset role;
select lives_ok($$update public.communication_room_memberships set mic_enabled=false
  where room_id='STATEHINT1' and user_id='d9551111-1111-4111-8111-111111111111'$$,
  'ordinary membership update still succeeds with the trigger');
set local role authenticated;
select is((select mic_enabled from public.communication_room_memberships
  where room_id='STATEHINT1' and user_id='d9551111-1111-4111-8111-111111111111'),false,
  'receiver projection comes from committed membership state');
reset role;
savepoint uncommitted_state_change;
update public.communication_room_memberships set mic_enabled=true
  where room_id='STATEHINT1' and user_id='d9551111-1111-4111-8111-111111111111';
rollback to savepoint uncommitted_state_change;
select is((select mic_enabled from public.communication_room_memberships
  where room_id='STATEHINT1' and user_id='d9551111-1111-4111-8111-111111111111'),false,
  'rolled-back writes cannot change authoritative snapshot truth');
select lives_ok($$delete from public.communication_room_memberships
  where room_id='STATEHINT1' and user_id='d9551111-1111-4111-8111-111111111111'$$,
  'ordinary membership deletion still succeeds with the trigger');
select lives_ok($$update public.communication_rooms set status='ended' where room_id='STATEHINT1'$$,
  'terminal transition still emits its hint after new read authority closes');
set local role authenticated;
select is((select count(*)::integer from public.communication_rooms where room_id='STATEHINT1'),0,
  'empty terminal hint never grants access to an ended room');
select is((select count(*)::integer from public.communication_room_memberships where room_id='STATEHINT1'),0,
  'terminal authoritative read exposes no participant rows');
reset role;
select lives_ok($$delete from public.communication_rooms where room_id='STATEHINT1'$$,
  'ordinary room deletion and cascaded membership cleanup still succeed');

select * from finish();
rollback;
