begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','read_my_notification_preferences',array[]::text[], 'preferences have an atomic initialize/read RPC');
select has_function('public','mutate_my_notification_preferences',array['uuid','uuid','text','jsonb'], 'mutation captures operation, incarnation and revision');
select ok(has_table_privilege('authenticated','public.notification_preferences','SELECT'), 'own-row SELECT is retained');
select ok(not has_table_privilege('authenticated','public.notification_preferences','INSERT'), 'legacy direct inserts fail closed');
select ok(not has_table_privilege('authenticated','public.notification_preferences','UPDATE'), 'legacy direct updates fail closed');
select ok(not has_any_column_privilege('authenticated','public.notification_preferences','INSERT'), 'column INSERT grants cannot bypass RPC');
select ok(not has_any_column_privilege('authenticated','public.notification_preferences','UPDATE'), 'column UPDATE grants cannot bypass RPC');
select ok(not has_any_column_privilege('anon','public.notification_preferences','INSERT,UPDATE'), 'anonymous column writes are closed');
select ok(not has_table_privilege('authenticated','public.notification_preferences','DELETE'), 'direct deletes remain closed');
select ok(has_table_privilege('service_role','public.notification_preferences','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'trusted service maintenance privileges are preserved');
select ok(not has_function_privilege('anon','public.read_my_notification_preferences()','EXECUTE'), 'anonymous RPC reads are denied');
select ok(not has_function_privilege('service_role','public.mutate_my_notification_preferences(uuid,uuid,text,jsonb)','EXECUTE'), 'service cannot impersonate caller-bound RPC');
select ok(not has_table_privilege('authenticated','private.notification_preference_operation_receipts','SELECT'), 'receipts are not client-readable');
select ok(not has_table_privilege('service_role','private.notification_preference_operation_receipts','INSERT'), 'service cannot fabricate receipts');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='private.notification_preference_operation_receipts'::regclass), 'receipts have forced RLS');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values
 ('8a000000-0000-4000-8000-000000000001','preferences-one@example.test',now(),false,false),
 ('8a000000-0000-4000-8000-000000000002','preferences-two@example.test',now(),false,false);
insert into auth.sessions(id,user_id) values
 ('8b000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001'),
 ('8b000000-0000-4000-8000-000000000002','8a000000-0000-4000-8000-000000000002');
insert into public.wave1_legal_acceptances(
 user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
 coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id in ('8b000000-0000-4000-8000-000000000001','8b000000-0000-4000-8000-000000000002')
 and d.active and d.market='UNITED_STATES' and d.capability='account';
create temporary table preference_test_results(label text primary key,result jsonb);
grant all on preference_test_results to authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"8a000000-0000-4000-8000-000000000001","session_id":"8b000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
insert into preference_test_results values('initial',public.read_my_notification_preferences());
select is((select result->>'revision' from preference_test_results where label='initial'),'0','initial defaults are revision zero');
select is(public.read_my_notification_preferences(),(select result from preference_test_results where label='initial'),'repeated initialize/read does not replace defaults');
insert into preference_test_results select 'first',public.mutate_my_notification_preferences(
 '8c000000-0000-4000-8000-000000000001',(result->>'incarnation')::uuid,'0','{"push_enabled":false}')
from preference_test_results where label='initial';
select is((select result->>'status' from preference_test_results where label='first'),'applied','first captured intent applies');
select is((select result->>'revision' from preference_test_results where label='first'),'1','accepted intent increments revision');
select is(public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000001',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'0','{"push_enabled":false}'),
 (select result from preference_test_results where label='first'),'lost acknowledgment retry returns exact still-current receipt');
select is(public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000002',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'1','{"push_enabled":false}')->>'revision','2','same-value newer intent still advances');
select is(public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000003',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'1','{"push_enabled":true}')->>'status','conflict','stale opposite intent cannot undo newer no-op');
select is(public.read_my_notification_preferences()->'preferences'->>'push_enabled','false','conflict preserves winner');
select is(public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000001',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'0','{"push_enabled":false}')->>'status','conflict','old applied receipt cannot present stale state as current');
select throws_ok($$select public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000001',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'2','{"push_enabled":false}')$$,
 '22023','notification_preference_operation_key_conflict','same operation cannot silently rebase');
select throws_ok($$select public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000004',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'2','{"user_id":"8a000000-0000-4000-8000-000000000002"}')$$,
 '22023','notification_preference_patch_invalid','patch cannot change subject');
select throws_ok($$select public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000004',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'2','{"push_enabled":"false"}')$$,
 '22023','notification_preference_patch_invalid','patch booleans are not coercible strings');
select throws_ok($$update public.notification_preferences set push_enabled=true$$,'42501',null,'actual authenticated direct update is denied');
reset role;
select is((select count(*)::integer from private.notification_preference_operation_receipts where actor_user_id='8a000000-0000-4000-8000-000000000001'),3,'retries and invalid requests produce no extra receipts');
set local role service_role;
update public.notification_preferences set revision=0,push_enabled=true,incarnation='8d000000-0000-4000-8000-000000000001'
 where user_id='8a000000-0000-4000-8000-000000000001';
reset role;
select is((select revision::text from public.notification_preferences where user_id='8a000000-0000-4000-8000-000000000001'),'3','service writer cannot reset revision');
select is((select incarnation::text from public.notification_preferences where user_id='8a000000-0000-4000-8000-000000000001'),
 (select result->>'incarnation' from preference_test_results where label='initial'),'service writer cannot replace existing incarnation');
set local role service_role;
delete from public.notification_preferences where user_id='8a000000-0000-4000-8000-000000000001';
reset role;
set local role authenticated;
insert into preference_test_results values('recreated',public.read_my_notification_preferences());
select isnt((select result->>'incarnation' from preference_test_results where label='recreated'),
 (select result->>'incarnation' from preference_test_results where label='initial'),'recreated row has a fresh incarnation');
select is(public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000005',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'0','{"push_enabled":false}')->>'status','conflict','revision zero from an earlier incarnation cannot match');
select is(public.mutate_my_notification_preferences('8c000000-0000-4000-8000-000000000001',
 (select (result->>'incarnation')::uuid from preference_test_results where label='initial'),'0','{"push_enabled":false}')->>'incarnation',
 (select result->>'incarnation' from preference_test_results where label='recreated'),'old receipt replay reports current incarnation as conflict');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"8a000000-0000-4000-8000-000000000002","session_id":"8b000000-0000-4000-8000-000000000001"}',true);
select throws_ok('select public.read_my_notification_preferences()','42501','notification_preference_current_session_required','another subjects session cannot read preferences');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"8a000000-0000-4000-8000-000000000002","session_id":"8b000000-0000-4000-8000-000000000002"}',true);
select is(public.read_my_notification_preferences()->'preferences'->>'user_id','8a000000-0000-4000-8000-000000000002','read subject comes from exact caller');
select is((select count(*)::integer from public.notification_preferences),1,'own SELECT policy cannot expose another subject');
reset role;
delete from auth.sessions where id='8b000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok('select public.read_my_notification_preferences()','42501','notification_preference_current_session_required','revoked session cannot read');
reset role;
select * from finish();
rollback;
