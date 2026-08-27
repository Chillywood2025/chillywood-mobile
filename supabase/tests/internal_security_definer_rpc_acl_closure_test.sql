begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(25);

select ok(
  (
    select count(*) = 3
      and bool_and(procedure.prosecdef)
      and bool_and(pg_get_userbyid(procedure.proowner) = 'postgres')
    from pg_proc procedure
    where procedure.oid in (
      'public.admin_reports_target_state(text,text)'::regprocedure,
      'public.dmca_resolve_uploader_user_id(text,text)'::regprocedure,
      'public.account_purge_deidentification_counts(text)'::regprocedure
    )
  ),
  '1. all three operational helpers remain postgres-owned SECURITY DEFINER functions'
);

select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    where procedure.oid in (
      'public.admin_reports_target_state(text,text)'::regprocedure,
      'public.dmca_resolve_uploader_user_id(text,text)'::regprocedure,
      'public.account_purge_deidentification_counts(text)'::regprocedure
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  '2. PUBLIC has no execute privilege on any operational helper'
);

select ok(
  not has_function_privilege('anon', 'public.admin_reports_target_state(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.dmca_resolve_uploader_user_id(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.account_purge_deidentification_counts(text)', 'EXECUTE'),
  '3. anon cannot execute any operational helper'
);

select ok(
  not has_function_privilege('authenticated', 'public.admin_reports_target_state(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.dmca_resolve_uploader_user_id(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.account_purge_deidentification_counts(text)', 'EXECUTE'),
  '4. authenticated cannot execute any operational helper'
);

select ok(
  not has_function_privilege('service_role', 'public.admin_reports_target_state(text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.dmca_resolve_uploader_user_id(text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.account_purge_deidentification_counts(text)', 'EXECUTE'),
  '5. only the explicitly contracted account-count helper remains service callable'
);

select is(
  (
    select string_agg(grantee_role.rolname::text, ',' order by grantee_role.rolname::text)
    from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    join pg_roles grantee_role on grantee_role.oid = acl.grantee
    where procedure.oid = 'public.admin_reports_target_state(text,text)'::regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> procedure.proowner
  ),
  null::text,
  '6. the report target-state helper has no non-owner executor'
);

select is(
  (
    select string_agg(grantee_role.rolname::text, ',' order by grantee_role.rolname::text)
    from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    join pg_roles grantee_role on grantee_role.oid = acl.grantee
    where procedure.oid = 'public.dmca_resolve_uploader_user_id(text,text)'::regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> procedure.proowner
  ),
  null::text,
  '7. the DMCA uploader resolver has no non-owner executor'
);

select is(
  (
    select string_agg(grantee_role.rolname::text, ',' order by grantee_role.rolname::text)
    from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    join pg_roles grantee_role on grantee_role.oid = acl.grantee
    where procedure.oid = 'public.account_purge_deidentification_counts(text)'::regprocedure
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> procedure.proowner
  ),
  'service_role',
  '8. service_role is the account-count helper''s only non-owner executor'
);

select is(
  (
    select string_agg(procedure.proname::text, ',' order by procedure.proname::text)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosrc like '%admin_reports_target_state%'
  ),
  'get_admin_report_detail',
  '9. report target-state remains reachable only through its guarded detail wrapper'
);

select is(
  (
    select string_agg(procedure.proname::text, ',' order by procedure.proname::text)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosrc like '%dmca_resolve_uploader_user_id%'
  ),
  'admin_dmca_create_case,submit_dmca_notice',
  '10. the DMCA uploader resolver retains only its two validated intake wrappers'
);

select is(
  (
    select string_agg(procedure.proname::text, ',' order by procedure.proname::text)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosrc like '%account_purge_deidentification_counts%'
  ),
  'admin_deidentify_deleted_account,admin_run_account_purge_batch',
  '11. account counts retain only the two guarded purge wrappers'
);

select ok(
  not exists (
    select 1
    from pg_proc caller
    join pg_namespace namespace on namespace.oid = caller.pronamespace
    where namespace.nspname = 'public'
      and caller.proname in (
        'get_admin_report_detail',
        'admin_dmca_create_case',
        'submit_dmca_notice',
        'admin_deidentify_deleted_account',
        'admin_run_account_purge_batch'
      )
      and (
        not caller.prosecdef
        or pg_get_userbyid(caller.proowner) <> 'postgres'
      )
  ),
  '12. every retained caller executes under the same trusted postgres owner'
);

select ok(
  has_function_privilege('authenticated', 'public.get_admin_report_detail(bigint)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_dmca_create_case(jsonb,text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.submit_dmca_notice(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_dmca_notice(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_deidentify_deleted_account(text,text,boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.admin_deidentify_deleted_account(text,text,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_run_account_purge_batch(boolean,integer,boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.admin_run_account_purge_batch(boolean,integer,boolean)', 'EXECUTE'),
  '13. intended report, DMCA, and purge wrapper contracts remain executable'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_reports_target_state('creator_video','00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '14. authenticated cannot directly disclose report target state'
);
select throws_ok(
  $$select public.dmca_resolve_uploader_user_id('creator_video','00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '15. authenticated cannot directly resolve an arbitrary uploader identity'
);
select throws_ok(
  $$select public.account_purge_deidentification_counts('00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '16. authenticated cannot directly enumerate another account''s private counts'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.admin_reports_target_state('creator_video','00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '17. anon cannot directly disclose report target state'
);
select throws_ok(
  $$select public.dmca_resolve_uploader_user_id('creator_video','00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '18. anon cannot directly resolve an arbitrary uploader identity'
);
select throws_ok(
  $$select public.account_purge_deidentification_counts('00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '19. anon cannot directly enumerate another account''s private counts'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.admin_reports_target_state('creator_video','00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '20. service_role cannot bypass the report detail wrapper'
);
select throws_ok(
  $$select public.dmca_resolve_uploader_user_id('creator_video','00000000-0000-0000-0000-000000000000')$$,
  '42501', null,
  '21. service_role cannot bypass the DMCA intake wrappers'
);
select lives_ok(
  $$select public.account_purge_deidentification_counts('00000000-0000-0000-0000-000000000000')$$,
  '22. the explicit service account-count contract remains operational'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

create function public.rpc_acl_closure_report_proxy()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.admin_reports_target_state('unsupported', null);
$$;

create function public.rpc_acl_closure_dmca_proxy()
returns text
language sql
security definer
set search_path = ''
as $$
  select public.dmca_resolve_uploader_user_id('other', null);
$$;

create function public.rpc_acl_closure_purge_proxy()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.account_purge_deidentification_counts('00000000-0000-0000-0000-000000000000');
$$;

revoke all on function public.rpc_acl_closure_report_proxy() from public, anon, authenticated, service_role;
revoke all on function public.rpc_acl_closure_dmca_proxy() from public, anon, authenticated, service_role;
revoke all on function public.rpc_acl_closure_purge_proxy() from public, anon, authenticated, service_role;
grant execute on function public.rpc_acl_closure_report_proxy() to authenticated;
grant execute on function public.rpc_acl_closure_dmca_proxy() to authenticated;
grant execute on function public.rpc_acl_closure_purge_proxy() to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select lives_ok(
  $$select public.rpc_acl_closure_report_proxy()$$,
  '23. a trusted definer wrapper can still resolve report target state'
);
select lives_ok(
  $$select public.rpc_acl_closure_dmca_proxy()$$,
  '24. a trusted definer wrapper can still resolve DMCA uploader state'
);
select lives_ok(
  $$select public.rpc_acl_closure_purge_proxy()$$,
  '25. a trusted definer wrapper can still compute purge counts'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

select * from finish();
rollback;
