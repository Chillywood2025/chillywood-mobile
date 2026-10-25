begin;
select plan(37);
select ok(not (select archived_verification_enabled from private.platform_brand_retention_settings), 'archived verifier defaults off');
select ok((select not expiry_enabled and not batch_enabled and not version_delete_verified and provider_origin is null and provider_contract_sha256 is null
 from private.platform_brand_retention_settings), 'installation supplies no expiry or provider authority');
select is((select count(*)::integer from pg_class where oid=any(array[
 'private.platform_brand_archived_requests'::regclass,'private.platform_brand_archived_attempts'::regclass,
 'private.platform_brand_archived_results'::regclass,'private.platform_brand_archived_receipts'::regclass]) and relrowsecurity and relforcerowsecurity),4,
 'all four private ledgers force RLS');
select ok(not has_table_privilege(role_name,'private.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), role_name||' cannot directly access '||table_name)
 from unnest(array['anon','authenticated','service_role']) role_name cross join unnest(array[
 'platform_brand_archived_requests','platform_brand_archived_attempts','platform_brand_archived_results','platform_brand_archived_receipts']) table_name;
select is(has_function_privilege(role_name,signature,'EXECUTE'),role_name='service_role',role_name||' archived RPC boundary: '||signature)
 from unnest(array['anon','authenticated','service_role']) role_name cross join unnest(array[
 'public.request_platform_brand_archived_verification(uuid,jsonb)',
 'public.claim_platform_brand_archived_verification(uuid[],text)',
 'public.read_platform_brand_archived_verification_attempt(uuid,uuid,text)',
 'public.record_platform_brand_archived_verification_result(uuid,uuid,text,jsonb)',
 'public.seal_platform_brand_archived_verification(uuid,uuid,text,uuid)']) signature;
select is((select count(*)::integer from pg_trigger where tgrelid=any(array[
 'private.platform_brand_archived_requests'::regclass,'private.platform_brand_archived_attempts'::regclass,
 'private.platform_brand_archived_results'::regclass,'private.platform_brand_archived_receipts'::regclass])
 and tgfoid='private.platform_brand_retention_immutable()'::regprocedure and tgenabled in ('O','A') and tgqual is null),8,
 'all private evidence is immutable for updates, deletes and truncation');
select ok(not has_function_privilege('service_role','private.platform_brand_archived_snapshot(uuid,boolean)','EXECUTE'), 'private snapshot cannot be invoked by service API');
select ok(not has_function_privilege('service_role','private.platform_brand_archived_receipt_matches(uuid,jsonb,text,bigint,uuid)','EXECUTE'), 'private receipt adapter cannot be invoked by service API');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.claim_platform_brand_archived_verification(array[gen_random_uuid()],'native-pgtap'),' {"status":"disabled","attempts":[]}'::jsonb,'disabled gate returns no work');
select throws_ok($$select public.request_platform_brand_archived_verification(gen_random_uuid(),'{}')$$,'P0001','archived_brand_verification_disabled','disabled gate prevents request issuance');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.claim_platform_brand_archived_verification(array[gen_random_uuid()],'native-pgtap')$$,'P0001','archived_brand_service_role_required','authenticated caller cannot cross scanner trust boundary');
select ok(position('for share nowait' in lower(pg_get_functiondef('private.platform_brand_archived_snapshot(uuid,boolean)'::regprocedure)))>0,'snapshot rejects row/advisory inversion without waiting');
select * from finish();
rollback;
