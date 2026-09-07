begin;
select plan(10);

select ok(
  position(
    'new."room_type" not in (''live'', ''title'')'
    in pg_get_functiondef('public.bootstrap_watch_party_live_host_membership()'::regprocedure)
  ) > 0,
  '1. exact host membership bootstrap covers Party Rooms and ordinary Live rooms'
);

select ok(
  position(
    'whole_app_exact_current_session_authority_internal'
    in pg_get_functiondef('public.bootstrap_watch_party_live_host_membership()'::regprocedure)
  ) > 0,
  '2. bootstrap remains bound to exact current-session authority'
);

select ok(
  position(
    'auth.uid() is distinct from new."host_user_id"'
    in pg_get_functiondef('public.bootstrap_watch_party_live_host_membership()'::regprocedure)
  ) > 0,
  '3. bootstrap rejects foreign-host substitution'
);

select ok(
  position(
    'join_watch_party_room_session'
    in pg_get_functiondef('public.bootstrap_watch_party_live_host_membership()'::regprocedure)
  ) > 0,
  '4. bootstrap delegates to canonical room-session membership authority'
);

select is(
  (
    select trigger_state.tgenabled::text
    from pg_trigger trigger_state
    where trigger_state.tgrelid = 'public.watch_party_rooms'::regclass
      and trigger_state.tgname = 'bootstrap_watch_party_live_host_membership'
      and not trigger_state.tgisinternal
  ),
  'O',
  '5. exact room host-membership trigger remains enabled'
);

select ok(
  not has_function_privilege('authenticated', 'public.bootstrap_watch_party_live_host_membership()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.bootstrap_watch_party_live_host_membership()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.bootstrap_watch_party_live_host_membership()', 'EXECUTE'),
  '6. clients and service callers cannot invoke the trigger function directly'
);

set local session_replication_role = replica;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
  ('a7000000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now()))
on conflict (id) do nothing;
insert into auth.sessions(id,user_id,not_after) values
  ('b7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001',now()+interval '1 day');
insert into public.wave1_legal_acceptances(
  user_id,subject_hash,document_key,document_version,market,role_key,
  capability,session_generation,authority_source
)
select 'a7000000-0000-4000-8000-000000000001'::uuid,
  public.wave1_sha256('a7000000-0000-4000-8000-000000000001'),
  document.document_key,document.version,document.market,'member',
  document.capability,'b7000000-0000-4000-8000-000000000001',
  'service_reconciliation'
from public.wave1_legal_document_versions document
where document.active and document.market='UNITED_STATES'
  and document.capability='account';
set local session_replication_role = origin;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a7000000-0000-4000-8000-000000000001","session_id":"b7000000-0000-4000-8000-000000000001"}',
  true
);

insert into public.watch_party_rooms(
  party_id,host_user_id,room_type,is_active,title_id,source_type,source_id,
  join_policy,content_access_rule
) values (
  'POLISH-HOST-TITLE',
  'a7000000-0000-4000-8000-000000000001',
  'title',true,'platform-exact-source','platform_title','platform-exact-source','open','open'
);

reset role;

select is(
  (
    select membership.role
    from public.watch_party_room_memberships membership
    where membership.party_id='POLISH-HOST-TITLE'
      and membership.user_id='a7000000-0000-4000-8000-000000000001'
  ),
  'host',
  '7. a fresh Party Room atomically persists its exact host membership'
);

select is(
  (
    select membership.stage_role
    from public.watch_party_room_memberships membership
    where membership.party_id='POLISH-HOST-TITLE'
      and membership.user_id='a7000000-0000-4000-8000-000000000001'
  ),
  'host',
  '8. the persisted Party Room host retains canonical host stage state'
);

select ok(
  (
    select membership.can_speak and not membership.host_muted
    from public.watch_party_room_memberships membership
    where membership.party_id='POLISH-HOST-TITLE'
      and membership.user_id='a7000000-0000-4000-8000-000000000001'
  ),
  '9. exact host media eligibility is derived by canonical join authority'
);

select is(
  (
    select count(*)::integer
    from public.watch_party_room_memberships membership
    where membership.party_id='POLISH-HOST-TITLE'
  ),
  1,
  '10. room creation cannot fabricate any viewer, pass, or unrelated membership'
);

select * from finish();
rollback;
