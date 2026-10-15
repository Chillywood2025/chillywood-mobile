begin;
set local time zone 'UTC';

create extension if not exists pgtap with schema extensions;
select no_plan();

-- The service grants are deliberate, bounded RPC entrypoints. No anonymous
-- access, table write permission, predecessor access, or managed role changes.
select ok(
  has_function_privilege('service_role','public.has_active_beta_access()','EXECUTE')
  and has_function_privilege('service_role','public.resolve_sandbox_monetization_tester(text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.has_active_beta_access()','EXECUTE')
  and has_function_privilege('authenticated','public.resolve_sandbox_monetization_tester(text,text)','EXECUTE')
  and not has_function_privilege('anon','public.has_active_beta_access()','EXECUTE')
  and not has_function_privilege('anon','public.resolve_sandbox_monetization_tester(text,text)','EXECUTE'),
  'beta and sandbox readbacks retain authenticated access and restore only service EXECUTE'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='watch_party_room_memberships'
      and policyname in (
        'watch_party_room_memberships_self_insert_policy',
        'watch_party_room_memberships_self_update_policy'
      )
  )
  and not has_any_column_privilege('authenticated','public.watch_party_room_memberships','INSERT')
  and not has_any_column_privilege('authenticated','public.watch_party_room_memberships','UPDATE'),
  'obsolete Watch Party policies are absent and direct writes remain denied'
);
select ok(
  exists (
    select 1 from pg_proc p
    where p.oid='public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)'::regprocedure
      and p.prosecdef and p.proconfig @> array['search_path=""']
  )
  and not has_function_privilege('anon','public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.admin_grant_platform_role_by_email_pre_exact_subject_closure(text,text,text)','EXECUTE'),
  'historical predecessor has an empty pinned path and remains inaccessible'
);
select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('anon'),('authenticated')) r(role_name)
    where n.nspname='public' and c.relkind in ('r','p')
      and has_table_privilege(r.role_name,c.oid,'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  ),
  'API roles gain no table maintenance or DDL privileges'
);

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
values
  ('e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test',now(),false,false),
  ('e7000000-0000-4000-8000-000000000002','permission-pgtap-other@example.test',now(),false,false);
insert into auth.sessions(id,user_id)
values
  ('e7100000-0000-4000-8000-000000000001','e7000000-0000-4000-8000-000000000001'),
  ('e7100000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000002');
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
values
  ('moderator','e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test','active','Permission repair active fixture','pgtap'),
  ('operator','e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test','revoked','Permission repair revoked fixture','pgtap');
insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,granted_by)
values
  ('e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test','user_lookup','active','Permission repair active fixture','pgtap'),
  ('e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test','reports_review','revoked','Permission repair revoked fixture','pgtap');
insert into public.beta_access_memberships(email,user_id,access_status,cohort)
values ('permission-pgtap-staff@example.test','e7000000-0000-4000-8000-000000000001','active','permission-repair');
select ok(public.wave1_legal_document_configuration_complete_internal('account'),
  'positive fixtures use the complete actual current account legal configuration');
insert into public.wave1_legal_acceptances
  (user_id,subject_hash,document_key,document_version,market,role_key,
   capability,session_generation,authority_source)
select 'e7000000-0000-4000-8000-000000000001'::uuid,
  public.wave1_sha256('e7000000-0000-4000-8000-000000000001'),
  document_key,version,market,'member',capability,
  'e7100000-0000-4000-8000-000000000001','service_reconciliation'
from public.wave1_legal_document_versions
where active and market='UNITED_STATES' and capability='account';

-- Evaluate the real stored policy expression for historical expired rows
-- without disabling write guards or switching replication behavior.
create function pg_temp.permission_repair_policy_probe(p_policy text,p_status text,p_expiry timestamptz)
returns boolean language plpgsql as $$
declare v_predicate text; v_allowed boolean;
begin
  select pg_get_expr(p.polqual,p.polrelid) into strict v_predicate
  from pg_policy p join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and p.polname=p_policy;
  execute format(
    'select (%s) from (select auth.uid()::text as user_id, auth.uid()::text as target_user_id, $1::text as status, $2::timestamptz as expires_at) fixture',
    v_predicate
  ) into v_allowed using p_status,p_expiry;
  return v_allowed;
end;
$$;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"e7000000-0000-4000-8000-000000000001","session_id":"e7100000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select is((select count(*) from public.platform_role_memberships where user_id='e7000000-0000-4000-8000-000000000001'),1::bigint,
  'live exact staff reads active own role but not revoked history');
select is((select count(*) from public.platform_staff_permission_grants where target_user_id='e7000000-0000-4000-8000-000000000001'),1::bigint,
  'live exact staff reads active own permission but not revoked history');
select ok(not pg_temp.permission_repair_policy_probe('platform_role_memberships_select_own','active',now()-interval '1 second'),
  'role self-read predicate rejects an expired status-active historical row');
select ok(not pg_temp.permission_repair_policy_probe('platform_staff_permission_grants_select_owner_or_self','active',now()-interval '1 second'),
  'permission self-read predicate rejects an expired status-active historical row');
select ok(public.has_active_beta_access() and public.resolve_sandbox_monetization_tester(null,null),
  'authenticated exact caller retains legitimate beta and sandbox readbacks');
select ok(not public.resolve_sandbox_monetization_tester('e7000000-0000-4000-8000-000000000002',null),
  'explicit sandbox target cannot differ from the current caller');
select ok(not public.resolve_sandbox_monetization_tester(null,'different@example.test'),
  'explicit sandbox email cannot differ from the current confirmed subject');
select throws_ok($$update public.platform_role_memberships set status='active' where false$$,
  '42501','permission denied for table platform_role_memberships',
  'authenticated callers cannot directly update role memberships');
select throws_ok($$update public.platform_staff_permission_grants set status='active' where false$$,
  '42501','permission denied for table platform_staff_permission_grants',
  'authenticated callers cannot directly update permission grants');
select throws_ok($$update public.watch_party_room_memberships set membership_state='active' where false$$,
  '42501','permission denied for table watch_party_room_memberships',
  'obsolete Watch Party update policy removal does not reopen direct writes');
select throws_ok('insert into public.watch_party_room_memberships default values',
  '42501','permission denied for table watch_party_room_memberships',
  'obsolete Watch Party insert policy removal does not reopen direct writes');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"e7000000-0000-4000-8000-000000000002","session_id":"e7100000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select is((select count(*) from public.platform_role_memberships where user_id='e7000000-0000-4000-8000-000000000001'),0::bigint,
  'ordinary subject cannot read another staff role');
select is((select count(*) from public.platform_staff_permission_grants where target_user_id='e7000000-0000-4000-8000-000000000001'),0::bigint,
  'ordinary subject cannot read another staff permission');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"e7000000-0000-4000-8000-000000000001","session_id":"e7100000-0000-4000-8000-999999999999"}',true);
set local role authenticated;
select is((select count(*) from public.platform_role_memberships where user_id='e7000000-0000-4000-8000-000000000001'),0::bigint,
  'missing exact session cannot read own roles');
select is((select count(*) from public.platform_staff_permission_grants where target_user_id='e7000000-0000-4000-8000-000000000001'),0::bigint,
  'missing exact session cannot read own permission rows');
reset role;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select ok(not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester('e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test'),
  'service EXECUTE without exact subject/session does not confer target authority');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","sub":"e7000000-0000-4000-8000-000000000001","session_id":"e7100000-0000-4000-8000-000000000001"}',true);
set local role service_role;
select ok(public.has_active_beta_access() and public.resolve_sandbox_monetization_tester('e7000000-0000-4000-8000-000000000001','permission-pgtap-staff@example.test'),
  'service caller bound to an exact active subject/session retains the intended readback');
reset role;

-- Current deployed legal requirements are cumulative with exact-session checks.
-- Use real acceptance rows and version foreign keys, without replacing guards.
delete from public.wave1_legal_acceptances
where user_id='e7000000-0000-4000-8000-000000000001';
set local role service_role;
select ok(not public.has_platform_role(array['moderator'])
  and not public.has_platform_permission('user_lookup')
  and not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester(null,null),
  'missing legal acceptance closes role, permission, beta and sandbox authority');
reset role;
insert into public.wave1_legal_acceptances
  (user_id,subject_hash,document_key,document_version,market,role_key,
   capability,session_generation,authority_source)
select 'e7000000-0000-4000-8000-000000000001'::uuid,
  public.wave1_sha256('e7000000-0000-4000-8000-000000000001'),
  document_key,version,market,'member',capability,
  'e7100000-0000-4000-8000-000000000002','service_reconciliation'
from public.wave1_legal_document_versions
where active and market='UNITED_STATES' and capability='account';
set local role service_role;
select ok(not public.has_platform_role(array['moderator'])
  and not public.has_platform_permission('user_lookup')
  and not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester(null,null),
  'legal acceptance for another session cannot authorize this current session');
reset role;
update public.wave1_legal_acceptances
set session_generation='e7100000-0000-4000-8000-000000000001'
where user_id='e7000000-0000-4000-8000-000000000001';
insert into public.wave1_legal_document_versions
  (document_key,version,market,capability,active,effective_at)
select document_key,'permission-pgtap-stale',market,capability,false,effective_at
from public.wave1_legal_document_versions
where active and market='UNITED_STATES' and capability='account';
update public.wave1_legal_acceptances set document_version='permission-pgtap-stale'
where user_id='e7000000-0000-4000-8000-000000000001';
set local role service_role;
select ok(not public.has_platform_role(array['moderator'])
  and not public.has_platform_permission('user_lookup')
  and not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester(null,null),
  'stale document acceptance cannot authorize the current document versions');
reset role;
update public.wave1_legal_acceptances a set document_version=d.version
from public.wave1_legal_document_versions d
where a.user_id='e7000000-0000-4000-8000-000000000001'
  and d.document_key=a.document_key and d.market=a.market and d.capability=a.capability and d.active;
set local role service_role;
select ok(public.has_platform_role(array['moderator'])
  and public.has_platform_permission('user_lookup')
  and public.has_active_beta_access() and public.resolve_sandbox_monetization_tester(null,null),
  'current same-session legal acceptance preserves the existing authority');
reset role;

update auth.sessions set not_after=now()-interval '1 second'
where id='e7100000-0000-4000-8000-000000000001';
set local role service_role;
select ok(not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester(null,null),
  'service EXECUTE does not bypass an expired session');
reset role;
update auth.sessions set not_after=null
where id='e7100000-0000-4000-8000-000000000001';
update auth.users set deleted_at=now()
where id='e7000000-0000-4000-8000-000000000001';
set local role service_role;
select ok(not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester(null,null),
  'service EXECUTE does not bypass a deleted subject');
reset role;
update auth.users set deleted_at=null,banned_until=now()+interval '1 hour'
where id='e7000000-0000-4000-8000-000000000001';
set local role service_role;
select ok(not public.has_active_beta_access() and not public.resolve_sandbox_monetization_tester(null,null),
  'service EXECUTE does not bypass a restricted subject');
reset role;

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok('select public.has_active_beta_access()','42501',
  'permission denied for function has_active_beta_access','anonymous beta RPC is denied');
select throws_ok('select public.resolve_sandbox_monetization_tester(null,null)','42501',
  'permission denied for function resolve_sandbox_monetization_tester','anonymous sandbox RPC is denied');
reset role;

select * from finish();
rollback;
