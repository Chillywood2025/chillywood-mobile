-- Disposable fully migrated PostgreSQL. All data and fault triggers roll back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();

create function pg_temp.mutation_id(kind text,n integer) returns uuid language sql immutable as $$
 select ('fa'||kind||'0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.mutation_claim(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub',pg_temp.mutation_id('01',n),'session_id',pg_temp.mutation_id('02',n),
  'email','owner-mutation-'||n||'@example.test')::text,true)::text
$$;
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select pg_temp.mutation_id('01',n),'owner-mutation-'||n||'@example.test',now(),false,false from generate_series(1,5) n;
insert into auth.sessions(id,user_id,not_after)
select pg_temp.mutation_id('02',n),pg_temp.mutation_id('01',n),now()+interval '1 day' from generate_series(1,5) n;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
 role_key,capability,session_generation,authority_source)
select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,
 coalesce(nullif(lower(trim(p.channel_role)),''),'member'),d.capability,s.id::text,'service_reconciliation'
from auth.sessions s left join public.user_profiles p on p.user_id=s.user_id::text
cross join public.wave1_legal_document_versions d where s.id::text like 'fa020000-%'
 and d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
select case when n=1 then 'owner' when n=4 then 'moderator' else 'operator' end,
 pg_temp.mutation_id('01',n)::text,'owner-mutation-'||n||'@example.test','active','Synthetic transaction fixture','pgtap'
from generate_series(1,5) n;
insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason)
values(pg_temp.mutation_id('01',2)::text,'owner-mutation-2@example.test','audit_review','active','Synthetic scoped canary authority'),
 (pg_temp.mutation_id('01',3)::text,'owner-mutation-3@example.test','admin.audit.view','active','Alias-only negative control'),
 (pg_temp.mutation_id('01',4)::text,'owner-mutation-4@example.test','security_review','active','Synthetic Moderator canary authority');
insert into public.owner_trusted_devices(id,owner_user_id,device_fingerprint_hash,trusted_at,trusted_by)
select pg_temp.mutation_id('06',n),pg_temp.mutation_id('01',1),repeat(n::text,64),clock_timestamp(),pg_temp.mutation_id('01',1)
from generate_series(1,2) n;
insert into public.security_request_context(id,user_id,device_hash,ip_hash,source,capture_status,metadata,created_at)
select pg_temp.mutation_id('05',n),pg_temp.mutation_id('01',1),repeat(case when n=3 then '2' else '1' end,64),repeat('a',64),
 'admin-owner-controls:'||case when n=2 then 'revoke_all_temporary_owner_grants' else 'revoke_temporary_owner_grant' end,
 'unavailable',jsonb_build_object('auth_session_id',pg_temp.mutation_id('02',1),
  'owner_security_action',case when n=2 then 'revoke_all_temporary_owner_grants' else 'revoke_temporary_owner_grant' end),
 clock_timestamp()
from generate_series(1,3) n;
insert into public.platform_staff_permission_grants(id,target_user_id,target_email,permission_key,status,reason,expires_at,metadata)
select pg_temp.mutation_id('03',n),pg_temp.mutation_id('01',5)::text,'owner-mutation-5@example.test',
 (array['legal_review','evidence_export','legal_hold','dmca_review','legal_request_intake'])[n],
 'active','Synthetic exact grant',case when n=2 then now()+interval '1 hour'
  when n=4 then clock_timestamp()+interval '1 second' else null end,
 case when n=5 then '{"cleanup_required":true}'::jsonb else '{}'::jsonb end
from generate_series(1,5) n;

-- The real exact-subject trigger forbids inserting active, already-expired
-- grants. Admit a valid short grant, then wait only until its actual cutoff.
select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp())))
from public.platform_staff_permission_grants where id=pg_temp.mutation_id('03',4);
select ok((select expires_at<=clock_timestamp() from public.platform_staff_permission_grants
 where id=pg_temp.mutation_id('03',4)),'expired exclusion fixture crossed its actual wall-clock cutoff');

select ok(not has_function_privilege('service_role','public.platform_staff_normalize_permission_key(text)','EXECUTE'),
 'normalizer ACL remains closed to direct service table mutation');
select ok(not has_function_privilege('service_role','public.owner_security_revoke_grants(uuid,text,uuid,text,uuid,uuid)','EXECUTE')
 and not has_function_privilege('anon','public.owner_security_revoke_grants(uuid,text,uuid,text,uuid,uuid)','EXECUTE'),
 'revoke requires an authenticated actor, never subjectless service authority');
select ok(not has_function_privilege('authenticated','public.cleanup_admin_canary_run(uuid,text)','EXECUTE'),
 'purpose-limited cleanup is service-only');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('private.owner_security_revocation_receipts'::regclass,'private.admin_canary_fixture_runs'::regclass,
  'private.admin_canary_fixture_users'::regclass,'private.admin_canary_fixture_roles'::regclass,
  'private.admin_canary_fixture_grants'::regclass)),'private ledgers force RLS without caller table grants');
set local role service_role;
select throws_ok($$update public.platform_staff_permission_grants set status='revoked' where id=pg_temp.mutation_id('03',1)$$,
 '42501',null,'direct service write remains denied at existing helper boundary');
reset role;
select pg_temp.mutation_claim(2);
set local role authenticated;
select throws_ok($$select public.owner_security_revoke_grants(pg_temp.mutation_id('04',1),'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',1))$$,
 '42501','owner_required','scoped operator is not an Owner revoker');
reset role;
select pg_temp.mutation_claim(1);
select set_config('test.owner.app_audit_before',(select count(*)::text from public.platform_admin_audit_logs
 where actor_user_id=pg_temp.mutation_id('01',1)::text),true);
set local role authenticated;
select throws_ok($$select public.owner_security_revoke_grants(pg_temp.mutation_id('04',1),'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',2),pg_temp.mutation_id('06',1))$$,
 '42501','owner_security_context_required','server context is bound to the exact action');
select throws_ok($$select public.owner_security_revoke_grants(pg_temp.mutation_id('04',1),'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',99))$$,
 '42501','trusted_device_required','unknown device cannot authorize revocation');
select throws_ok(format($sql$select public.owner_security_revoke_grants(%L::uuid,'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',1))$sql$,invalid_id),
 '22023','owner_security_request_invalid','unsupported operation UUID is rejected before mutation: '||invalid_id)
from unnest(array['00000000-0000-0000-0000-000000000000','fa040000-0000-7000-8000-000000000001',
 'fa040000-0000-4000-c000-000000000001']) invalid_id;
reset role;
select is((select count(*) from private.owner_security_revocation_receipts
 where actor_user_id=pg_temp.mutation_id('01',1)),0::bigint,'invalid operation IDs leave no durable receipts');
select is((select status from public.platform_staff_permission_grants where id=pg_temp.mutation_id('03',1)),
 'active','invalid operation IDs leave the source grant unchanged');
set local role authenticated;
select is(public.owner_security_revoke_grants(pg_temp.mutation_id('04',1),'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',1))->>'revokedCount','1',
 'single revocation preserves exact active permanent grant behavior');
select is(public.owner_security_revoke_grants(pg_temp.mutation_id('04',1),'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',1))->'grant'->>'id',
 pg_temp.mutation_id('03',1)::text,'same operation returns persisted exact grant receipt');
select throws_ok($$select public.owner_security_revoke_grants(pg_temp.mutation_id('04',1),'single',pg_temp.mutation_id('03',1),
 'Synthetic exact revoke',pg_temp.mutation_id('05',3),pg_temp.mutation_id('06',2))$$,
 '22023','owner_security_request_conflict','receipt cannot move to a different trusted device');
reset role;
select is((select count(*) from public.platform_staff_permission_audit where target_user_id=pg_temp.mutation_id('01',5)::text
 and action='revoke' and permission_key='legal_review'),1::bigint,'idempotent retry has one permission audit');
select is((select count(*) from public.security_audit_events where actor_user_id=pg_temp.mutation_id('01',1)
 and event_type='temporary_grant_revoked'),1::bigint,'idempotent retry has one functional security event');

-- Real audit failures: no replacement auth/provider functions and no disabled
-- product triggers. Each exception rolls back both the grant and receipt.
create function pg_temp.fail_owner_mutation_audit() returns trigger language plpgsql as $$
begin
 if current_setting('test.owner.audit_fail',true)=tg_table_name then raise exception 'synthetic_owner_audit_failure'; end if;
 return new;
end $$;
create trigger fixture_owner_permission_failure before insert on public.platform_staff_permission_audit
 for each row execute function pg_temp.fail_owner_mutation_audit();
create trigger fixture_owner_security_failure before insert on public.security_audit_events
 for each row execute function pg_temp.fail_owner_mutation_audit();
select set_config('test.owner.audit_fail','platform_staff_permission_audit',true);
set local role authenticated;
select throws_ok($$select public.owner_security_revoke_grants(pg_temp.mutation_id('04',2),'single',pg_temp.mutation_id('03',2),
 'Synthetic rollback revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',1))$$,
 'P0001','synthetic_owner_audit_failure','permission audit failure rolls back the mutation');
reset role;
select set_config('test.owner.audit_fail','security_audit_events',true);
set local role authenticated;
select throws_ok($$select public.owner_security_revoke_grants(pg_temp.mutation_id('04',2),'single',pg_temp.mutation_id('03',2),
 'Synthetic rollback revoke',pg_temp.mutation_id('05',1),pg_temp.mutation_id('06',1))$$,
 'P0001','synthetic_owner_audit_failure','security event failure rolls back permission audit and mutation');
reset role;
select is((select status from public.platform_staff_permission_grants where id=pg_temp.mutation_id('03',2)),'active',
 'both failures leave the exact source grant active');
select is((select count(*) from private.owner_security_revocation_receipts where request_id=pg_temp.mutation_id('04',2)),0::bigint,
 'failed operation has no misleading durable receipt');
select set_config('test.owner.audit_fail','',true);
drop trigger fixture_owner_permission_failure on public.platform_staff_permission_audit;
drop trigger fixture_owner_security_failure on public.security_audit_events;

-- Complete scope exceeds the old panel's 200-row display limit.
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
select pg_temp.mutation_id('08',n),'owner-bulk-'||n||'@example.test',now(),false,false from generate_series(1,205) n;
insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by)
select 'operator',pg_temp.mutation_id('08',n)::text,'owner-bulk-'||n||'@example.test',
 'active','Synthetic exact bulk target','pgtap' from generate_series(1,205) n;
insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,expires_at)
select pg_temp.mutation_id('08',n)::text,'owner-bulk-'||n||'@example.test','legal_review','active','Synthetic bulk scope',
 now()+interval '1 hour' from generate_series(1,205) n;
set local role authenticated;
select is(public.owner_security_revoke_grants(pg_temp.mutation_id('04',3),'bulk',null,
 'Synthetic complete bulk revoke',pg_temp.mutation_id('05',2),pg_temp.mutation_id('06',1))->>'revokedCount','207',
 'bulk revokes all 205 generated grants plus temporary and explicit cleanup grants');
reset role;
select is((select count(*) from public.platform_staff_permission_grants where target_user_id like 'fa080000-%' and status='active'),0::bigint,
 'no generated grant beyond the 200-row display window survives');
select is((select status from public.platform_staff_permission_grants where id=pg_temp.mutation_id('03',3)),'active',
 'ordinary permanent grant is outside bulk scope');
select is((select status from public.platform_staff_permission_grants where id=pg_temp.mutation_id('03',4)),'active',
 'already expired source is outside start-time scope');
select is((select count(*)::text from public.platform_admin_audit_logs where actor_user_id=pg_temp.mutation_id('01',1)::text),
 current_setting('test.owner.app_audit_before'),'normal Owner revocation adds no platform application audit');

select pg_temp.mutation_claim(3);
set local role authenticated;
select throws_ok($$select public.begin_admin_canary_run(pg_temp.mutation_id('07',3))$$,
 '42501','audit_review_required','admin.audit.view alias alone never becomes canary authority');
reset role;
select pg_temp.mutation_claim(2);
set local role authenticated;
select is(public.begin_admin_canary_run(pg_temp.mutation_id('07',2))->>'created','true','exact audit_review operator can begin a run');
reset role;
select pg_temp.mutation_claim(4);
set local role authenticated;
select is(public.begin_admin_canary_run(pg_temp.mutation_id('07',4))->>'created','true','exact security_review Moderator can begin a run');
reset role;
select pg_temp.mutation_claim(1);
set local role authenticated;
select throws_ok(format('select public.begin_admin_canary_run(%L::uuid)',invalid_id),
 '22023','admin_canary_run_id_invalid','unsupported run UUID is rejected before manifest creation: '||invalid_id)
from unnest(array['00000000-0000-0000-0000-000000000000','fa070000-0000-7000-8000-000000000001',
 'fa070000-0000-4000-c000-000000000001']) invalid_id;
select is(jsonb_array_length(public.list_admin_canary_pending_runs()->'runs'),0,
 'rejected run IDs leave pending-run discovery usable and empty');
reset role;
select is((select count(*) from private.admin_canary_fixture_runs where actor_user_id=pg_temp.mutation_id('01',1)),
 0::bigint,'invalid run IDs leave no persisted Owner manifest');
set local role authenticated;
select is(public.begin_admin_canary_run(pg_temp.mutation_id('07',1))->>'created','true','Owner begins the same bounded protocol');
select is(public.begin_admin_canary_run(pg_temp.mutation_id('07',1))->>'created','false','begin retry never reallocates identities or renews deadline');
select throws_ok($$select public.begin_admin_canary_run(pg_temp.mutation_id('07',99))$$,
 '55000','admin_canary_pending_run','another request ID cannot bypass an unfinished run');
reset role;
select is((select count(*) from private.admin_canary_fixture_users where run_id=pg_temp.mutation_id('07',1)),5::bigint,
 'exactly five immutable subject identities are preallocated');
select ok((select deadline=started_at+interval '15 minutes' from private.admin_canary_fixture_runs where run_id=pg_temp.mutation_id('07',1)),
 'run deadline is exactly 15 minutes and cannot renew');
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous,created_at,raw_app_meta_data)
select user_id,email,clock_timestamp(),false,false,clock_timestamp(),
 jsonb_build_object('canary_proof',true,'canary_proof_run_id',run_id,'proof_label',label)
from private.admin_canary_fixture_users where run_id=pg_temp.mutation_id('07',1) and label<>'viewer';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select throws_ok($$select public.register_admin_canary_user(pg_temp.mutation_id('07',1),'granted-admin',pg_temp.mutation_id('01',5))$$,
 '42501','admin_canary_subject_mismatch','service registration cannot adopt an arbitrary real subject');
select is(public.register_admin_canary_user(pg_temp.mutation_id('07',1),'granted-admin',null)->>'label','granted-admin',
 'unknown Auth creation outcome resolves only the preallocated identity');
reset role;
select pg_temp.mutation_claim(1);
set local role authenticated;
select throws_ok($$select public.provision_admin_canary_fixture(pg_temp.mutation_id('07',1),'viewer','operator',null)$$,
 '22023','admin_canary_fixture_scope_invalid','negative-control viewer cannot receive fixture authority');
select throws_ok($$select public.provision_admin_canary_fixture(pg_temp.mutation_id('07',1),'granted-admin',null,'admin_grants')$$,
 '22023','admin_canary_fixture_scope_invalid','fixture cannot grant broad staff management authority');
select set_config('test.canary.role',public.provision_admin_canary_fixture(pg_temp.mutation_id('07',1),'granted-admin','operator',null)::text,true);
select set_config('test.canary.grant',public.provision_admin_canary_fixture(pg_temp.mutation_id('07',1),'granted-admin',null,'legal_review')::text,true);
select is(public.provision_admin_canary_fixture(pg_temp.mutation_id('07',1),'granted-admin',null,'legal_review')->>'grantId',
 current_setting('test.canary.grant')::jsonb->>'grantId','provision retry returns the persisted grant ID without renewal');
reset role;
select is((select expires_at from public.platform_staff_permission_grants where id=(current_setting('test.canary.grant')::jsonb->>'grantId')::uuid),
 (select deadline from private.admin_canary_fixture_runs where run_id=pg_temp.mutation_id('07',1)),'fixture grant uses immutable run deadline');
select throws_ok($$update private.admin_canary_fixture_runs set deadline=deadline+interval '1 minute'
 where run_id=pg_temp.mutation_id('07',1)$$,'P0001','admin_canary_run_immutable','even privileged accidental deadline renewal is rejected');

-- A foreign row for this subject is never silently adopted or revoked.
insert into public.platform_staff_permission_grants(id,target_user_id,target_email,permission_key,status,reason,expires_at)
select pg_temp.mutation_id('03',99),f.user_id::text,f.email,'evidence_export','active','Independent synthetic grant',r.deadline
from private.admin_canary_fixture_users f join private.admin_canary_fixture_runs r using(run_id)
where f.run_id=pg_temp.mutation_id('07',1) and f.label='granted-admin';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select throws_ok($$select public.cleanup_admin_canary_run(pg_temp.mutation_id('07',1),'Synthetic exact cleanup')$$,
 'P0001','admin_canary_unregistered_authority','unrecorded authority blocks cleanup and Auth deletion');
reset role;
select is((select status from public.platform_staff_permission_grants where id=pg_temp.mutation_id('03',99)),'active',
 'cleanup never revokes a foreign grant');
update public.platform_staff_permission_grants set status='revoked' where id=pg_temp.mutation_id('03',99);
delete from auth.sessions where id=pg_temp.mutation_id('02',1);
set local role service_role;
select is(public.cleanup_admin_canary_run(pg_temp.mutation_id('07',1),'Synthetic exact cleanup')->>'activeCount','0',
 'purpose-limited cleanup remains available after the original actor session dies');
select is(public.cleanup_admin_canary_run(pg_temp.mutation_id('07',1),'Synthetic exact cleanup')->>'activeCount','0',
 'closed cleanup retry verifies current recorded state without duplicate writes');
reset role;
select is((select count(*) from public.security_audit_events where event_type='admin_canary_fixture_cleanup'
 and target_id=pg_temp.mutation_id('07',1)::text),1::bigint,'cleanup receipt and security event are idempotent');
select is((select count(*) from auth.users where id in(select user_id from private.admin_canary_fixture_users
 where run_id=pg_temp.mutation_id('07',1))),4::bigint,'SQL cleanup never deletes Auth subjects');
select throws_ok($$insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous,created_at,raw_app_meta_data)
 select user_id,email,clock_timestamp(),false,false,clock_timestamp(),
  jsonb_build_object('canary_proof',true,'canary_proof_run_id',run_id,'proof_label',label)
 from private.admin_canary_fixture_users where run_id=pg_temp.mutation_id('07',1) and label='viewer'$$,
 'P0001','admin_canary_run_closed','late Auth creation cannot appear after the close receipt');
select throws_ok($$update public.platform_staff_permission_grants set status='active'
 where id=(current_setting('test.canary.grant')::jsonb->>'grantId')::uuid$$,
 'P0001','admin_canary_run_closed','all normal producers are fenced from reactivating a closed fixture');
select is((select count(*)::text from public.platform_admin_audit_logs where actor_user_id=pg_temp.mutation_id('01',1)::text),
 current_setting('test.owner.app_audit_before'),'canary setup and cleanup add no normal Owner application audit');
select * from finish();
rollback;
