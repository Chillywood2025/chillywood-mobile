begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Genuine current Auth sessions and actual role/legal predicates; no authority
-- function replacement. The HTTP companion also exercises real Auth-issued JWTs.
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values
 ('a8300000-0000-4000-8000-000000000001','null-guard-member@example.test',now(),false,false),
 ('a8300000-0000-4000-8000-000000000002','null-guard-owner@example.test',now(),false,false),
 ('a8300000-0000-4000-8000-000000000003','null-guard-target@example.test',now(),false,false),
 ('a8300000-0000-4000-8000-000000000004','null-guard-operator@example.test',now(),false,false);
insert into auth.sessions(id,user_id,not_after)
select ('a8400000-0000-4000-8000-'||right(id::text,12))::uuid,id,now()+interval '1 day'
from auth.users where id::text like 'a8300000-%';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values
 ('owner','a8300000-0000-4000-8000-000000000002','null-guard-owner@example.test','active','Synthetic null guard fixture','pgtap'),
 ('operator','a8300000-0000-4000-8000-000000000003','null-guard-target@example.test','active','Synthetic null guard fixture','pgtap'),
 ('operator','a8300000-0000-4000-8000-000000000004','null-guard-operator@example.test','active','Synthetic null guard fixture','pgtap');
insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason)
values('a8300000-0000-4000-8000-000000000003','null-guard-target@example.test','legal_review','active','Existing synthetic grant');

create temporary table null_guard_grants as select to_jsonb(g) row from public.platform_staff_permission_grants g;
create temporary table null_guard_permission_audit as select to_jsonb(a) row from public.platform_staff_permission_audit a;
create temporary table null_guard_admin_audit as select to_jsonb(a) row from public.platform_admin_audit_logs a;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"a8300000-0000-4000-8000-000000000001","session_id":"a8400000-0000-4000-8000-000000000001","email":"null-guard-member@example.test"}',true);
select ok(public.platform_exact_current_session_authority_internal(),'nonstaff has a valid exact session');
select is(public.platform_staff_actor_role(),null::text,'nonstaff role is NULL, reproducing the dangerous predicate input');
set local role authenticated;
select throws_ok($$select public.admin_grant_platform_staff_permission_by_email('null-guard-target@example.test','evidence_export','Synthetic denial')$$,
 'P0001','platform_staff_permission_owner_required','nonstaff cannot grant through NULL role');
select throws_ok($$select public.admin_revoke_platform_staff_permission_by_email('null-guard-target@example.test','legal_review','Synthetic denial')$$,
 'P0001','platform_staff_permission_owner_required','nonstaff cannot revoke an existing exact grant');
select throws_ok($$select public.admin_update_platform_staff_permissions_by_email('null-guard-target@example.test',array['evidence_export'],'Synthetic denial')$$,
 'P0001','platform_staff_permission_owner_required','nonstaff cannot replace the permission set');
reset role;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"a8300000-0000-4000-8000-000000000002","session_id":"a8400000-0000-4000-8000-000000000002","email":"null-guard-owner@example.test"}',true);
select ok(public.platform_exact_current_session_authority_internal(),'Owner without legal acceptance still has an exact Auth session');
select is(public.platform_staff_actor_role(),null::text,'unqualified Owner authority is NULL');
set local role authenticated;
select throws_ok($$select public.admin_grant_platform_staff_permission_by_email('null-guard-target@example.test','evidence_export','Synthetic denial')$$,
 'P0001','platform_staff_permission_owner_required','unqualified Owner cannot grant');
select throws_ok($$select public.admin_revoke_platform_staff_permission_by_email('null-guard-target@example.test','legal_review','Synthetic denial')$$,
 'P0001','platform_staff_permission_owner_required','unqualified Owner cannot revoke');
select throws_ok($$select public.admin_update_platform_staff_permissions_by_email('null-guard-target@example.test',array['evidence_export'],'Synthetic denial')$$,
 'P0001','platform_staff_permission_owner_required','unqualified Owner cannot replace permissions');
reset role;
select results_eq('select to_jsonb(g) from public.platform_staff_permission_grants g order by id',
 'select row from null_guard_grants order by row->>''id''','denied NULL callers leave every grant unchanged');
select results_eq('select to_jsonb(a) from public.platform_staff_permission_audit a order by id',
 'select row from null_guard_permission_audit order by row->>''id''','denied NULL callers leave permission audits unchanged');
select results_eq('select to_jsonb(a) from public.platform_admin_audit_logs a order by id',
 'select row from null_guard_admin_audit order by row->>''id''','denied NULL callers leave admin audits unchanged');

-- Accept the exact current document versions using the canonical authenticated
-- API, then prove the same Owner can still use all three normal APIs.
set local role authenticated;
select lives_ok($$
 select public.wave1_accept_legal_documents(
   (select jsonb_object_agg(item->>'documentKey',item->>'version')
    from jsonb_array_elements(public.wave1_legal_requirements_readback('account')->'requirements') item),
   'UNITED_STATES','a8300000-0000-4000-8000-000000000002','a8300000-0000-4000-8000-000000000002',
   'a8400000-0000-4000-8000-000000000002','account')
$$,'Owner accepts current legal requirements through the canonical producer');
select is(public.platform_staff_actor_role(),'owner','qualified Owner has non-null effective role');
select lives_ok($$select public.admin_grant_platform_staff_permission_by_email('null-guard-target@example.test','evidence_export','Synthetic valid grant')$$,
 'qualified Owner normal grant remains available');
select lives_ok($$select public.admin_revoke_platform_staff_permission_by_email('null-guard-target@example.test','legal_review','Synthetic valid revoke')$$,
 'qualified Owner normal revoke remains available');
select lives_ok($$select public.admin_update_platform_staff_permissions_by_email('null-guard-target@example.test',array['audit_review'],'Synthetic valid replacement')$$,
 'qualified Owner normal permission replacement remains available');
reset role;
select is((select array_agg(permission_key order by permission_key) from public.platform_staff_permission_grants
 where target_user_id='a8300000-0000-4000-8000-000000000003' and status='active'),array['audit_review'],
 'legitimate bulk operation produces its exact requested set');

-- Direct service table access still cannot bypass the protected normalizer.
select ok(not has_function_privilege('service_role','public.platform_staff_normalize_permission_key(text)','EXECUTE'),
 'no service-role normalizer permission was widened');
select ok(has_function_privilege('authenticated','public.admin_grant_platform_staff_permission_by_email(text,text,text,timestamptz)','EXECUTE')
 and has_function_privilege('authenticated','public.admin_revoke_platform_staff_permission_by_email(text,text,text)','EXECUTE')
 and has_function_privilege('authenticated','public.admin_update_platform_staff_permissions_by_email(text,text[],text,timestamptz)','EXECUTE'),
 'all three existing authenticated APIs retain their grants');
select ok(not has_function_privilege('anon','public.admin_grant_platform_staff_permission_by_email(text,text,text,timestamptz)','EXECUTE')
 and not has_function_privilege('anon','public.admin_revoke_platform_staff_permission_by_email(text,text,text)','EXECUTE')
 and not has_function_privilege('anon','public.admin_update_platform_staff_permissions_by_email(text,text[],text,timestamptz)','EXECUTE'),
 'anonymous execute privileges remain denied');

select * from finish();
rollback;
