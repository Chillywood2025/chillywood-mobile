-- Run on the full migrated disposable Supabase database. No authority helper
-- is replaced: legal acceptance, account state, live sessions and roles are real.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not (select enabled from private.content_inspection_settings where singleton),'inspection starts disabled');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('private.content_inspection_settings'::regclass,'private.content_inspection_contexts'::regclass,
    'private.content_inspection_context_targets'::regclass,'private.content_inspection_grants'::regclass,
    'private.content_inspection_access_events'::regclass)),'all private tables RLS and FORCE RLS');
select ok(not has_table_privilege('authenticated','private.content_inspection_grants','SELECT'),'client cannot read grants directly');
select ok(not has_table_privilege('service_role','private.content_inspection_access_events','INSERT'),'service role cannot forge access audit');
select ok(not has_function_privilege('authenticated','private.content_inspection_source(text,uuid)','EXECUTE'),'source resolver is not client callable');
select ok(not has_function_privilege('anon','public.admin_read_content_inspection(uuid,text,text,text,uuid)','EXECUTE'),'anonymous cannot call inspection');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'inspection-'||n||'@example.test',now(),false,false from generate_series(1,6) n;
insert into auth.sessions(id,user_id,not_after)
select ('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()+interval '1 hour' from generate_series(1,6) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
  coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d
where s.id::text like 'a4000000-%' and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
select role,'a3000000-0000-4000-8000-'||lpad(n::text,12,'0'),'inspection-'||n||'@example.test','active','Synthetic inspection fixture','pgtap'
from (values(1,'owner'),(2,'super_admin'),(3,'operator'),(4,'moderator')) r(n,role);
insert into public.profile_posts(id,user_id,body,visibility,moderation_status,deleted_at)
values('a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000005',E'  Exact <b>stored</b> body\n','draft','removed',null),
  ('a5000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001','Owner body','draft','clean',null);

create function pg_temp.inspection_claim(n integer) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','a3000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'session_id','a4000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::text;
$$;
select pg_temp.inspection_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_list_content_inspection_contexts('Synthetic review',gen_random_uuid())$$,'42501','content_inspection_disabled','even Owner denied when disabled');
reset role;
-- This activation exists only inside the rollback-only disposable test.
update private.content_inspection_settings set enabled=true;
set local role authenticated;
select lives_ok($$select set_config('test.inspection.context',(public.admin_create_content_inspection_context('Synthetic review',
  '[{"targetType":"profile_post","targetId":"a5000000-0000-4000-8000-000000000001"},{"targetType":"profile_post","targetId":"a5000000-0000-4000-8000-000000000002"}]',gen_random_uuid())->>'contextId'),true)$$,'Owner creates exact internal review context');
select is(public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())->'content'->>'body',E'  Exact <b>stored</b> body\n','Owner sees unchanged stored removed draft text');
reset role;
select is((select count(*) from private.content_inspection_access_events where operation='read' and actor='a3000000-0000-4000-8000-000000000001'),0::bigint,'exact Owner view exemption is limited to inspection access events');
select pg_temp.inspection_claim(2);
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','Super Admin cannot read unshared Owner context');
select is(jsonb_array_length(public.admin_list_content_inspection_contexts('Synthetic listing',gen_random_uuid())->'contexts'),0,'Super Admin cannot enumerate Owner-private context metadata');
select lives_ok($$select set_config('test.inspection.sa_context',(public.admin_create_content_inspection_context('Synthetic SA review',
  '[{"targetType":"profile_post","targetId":"a5000000-0000-4000-8000-000000000001"},{"targetType":"profile_post","targetId":"a5000000-0000-4000-8000-000000000002"}]',gen_random_uuid())->>'contextId'),true)$$,'Super Admin creates own review context');
select lives_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.sa_context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'Super Admin reads own-context ordinary target');
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.sa_context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000002','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','Super Admin cannot inspect Owner target by default');
select throws_ok($$select public.admin_grant_content_inspection_access(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003',now()+interval '1 hour','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','Super Admin cannot delegate');
reset role;
select pg_temp.inspection_claim(3);
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','operator has no implicit view');
select throws_ok($$select * from private.content_inspection_contexts$$,'42501',null,'no direct private table access');
select throws_ok($$select private.content_inspection_source('profile_post','a5000000-0000-4000-8000-000000000001')$$,'42501',null,'no direct source helper access');
reset role;
select pg_temp.inspection_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_grant_content_inspection_access(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000004',now()+interval '1 hour','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','moderator not an eligible existing Admin');
select throws_ok($$select public.admin_grant_content_inspection_access(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000003',now()+interval '1 hour','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','Owner targets cannot be delegated');
select throws_ok($$select public.admin_grant_content_inspection_access(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003',now()+interval '25 hours','Synthetic review',gen_random_uuid())$$,'22023','content_inspection_invalid_expiry','24 hour ceiling');
select lives_ok($$select set_config('test.inspection.grant',public.admin_grant_content_inspection_access(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003',now()+interval '1 hour','Synthetic review',gen_random_uuid())->>'grantId',true)$$,'exact Owner grants exact existing operator');
select throws_ok($$select public.admin_grant_content_inspection_access(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000003',now()+interval '2 hours','Manual outcome retry',gen_random_uuid())$$,'22023','content_inspection_grant_exists','new request UUID cannot duplicate or renew an unrevoked grant');
reset role;
select is((select count(*) from private.content_inspection_grants where context_id=current_setting('test.inspection.context')::uuid and grantee='a3000000-0000-4000-8000-000000000003'),1::bigint,'duplicate attempt leaves one original grant');
select pg_temp.inspection_claim(3);
set local role authenticated;
select lives_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'exact scoped grant works');
select is(jsonb_array_length(public.admin_list_content_inspection_scope(current_setting('test.inspection.context')::uuid,'Synthetic review',gen_random_uuid())->'targets'),1,'operator scope list contains only own grant target');
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000003','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','wrong exact target denied');
select throws_ok($$select public.admin_read_content_inspection('a6000000-0000-4000-8000-000000000001','profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','wrong context denied');
reset role;
update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='a4000000-0000-4000-8000-000000000003';
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','expired exact session denied');
reset role;
update auth.sessions set not_after=now()+interval '1 hour' where id='a4000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims','{"sub":"a3000000-0000-4000-8000-000000000003","session_id":"a4000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"owner"}}',true);
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','spoofed role claim and cross-user session fail');
reset role;
select pg_temp.inspection_claim(3);
update public.platform_role_memberships set expires_at=clock_timestamp()-interval '1 second' where user_id='a3000000-0000-4000-8000-000000000003';
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','expired role denied despite active grant');
reset role;
update public.platform_role_memberships set expires_at=null where user_id='a3000000-0000-4000-8000-000000000003';
select pg_temp.inspection_claim(1);
create function pg_temp.inspection_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_audit_failure'; end;$$;
create trigger inspection_audit_failure before insert on private.content_inspection_access_events for each row execute function pg_temp.inspection_audit_failure();
select pg_temp.inspection_claim(2);
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.sa_context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'P0001','synthetic_audit_failure','audit insert failure prevents Super Admin delivery');
reset role;
select pg_temp.inspection_claim(1);
set local role authenticated;
select throws_ok($$select public.admin_revoke_content_inspection_access(current_setting('test.inspection.grant')::uuid,'Synthetic review',gen_random_uuid())$$,'P0001','synthetic_audit_failure','audit failure rolls back revoke');
reset role;
select ok((select revoked_at is null from private.content_inspection_grants where id=current_setting('test.inspection.grant')::uuid),'failed audit leaves grant unchanged');
drop trigger inspection_audit_failure on private.content_inspection_access_events;
select pg_temp.inspection_claim(2);
set local role authenticated;
select lives_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.sa_context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review','a7000000-0000-4000-8000-000000000001')$$,'first request accepted');
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.sa_context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000002','Different purpose','a7000000-0000-4000-8000-000000000001')$$,'22023','content_inspection_request_reused','request cannot replay across target or purpose');
reset role;
select pg_temp.inspection_claim(1);
set local role authenticated;
select lives_ok($$select public.admin_revoke_content_inspection_access(current_setting('test.inspection.grant')::uuid,'Synthetic revoke',gen_random_uuid())$$,'Owner revokes scoped grant');
reset role;
select pg_temp.inspection_claim(3);
set local role authenticated;
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','read after committed revoke denied');
reset role;
select pg_temp.inspection_claim(1);
set local role authenticated;
select lives_ok($$select public.admin_close_content_inspection_context(current_setting('test.inspection.context')::uuid,'Synthetic close',gen_random_uuid())$$,'Owner closes context');
select throws_ok($$select public.admin_read_content_inspection(current_setting('test.inspection.context')::uuid,'profile_post','a5000000-0000-4000-8000-000000000001','Synthetic review',gen_random_uuid())$$,'42501','content_inspection_denied','closed context denies Owner read');
reset role;
select throws_ok($$delete from private.content_inspection_access_events$$,'42501','content_inspection_audit_immutable','audit cannot be deleted');
select throws_ok($$truncate private.content_inspection_access_events$$,'42501','content_inspection_audit_immutable','audit cannot be truncated');
select * from finish();
rollback;
