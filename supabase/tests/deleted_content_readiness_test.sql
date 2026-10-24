-- Full migrated disposable database. No provider calls; everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not (public.deleted_content_expiry_readiness()->>'ready')::boolean,'unqualified source is not ready');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'consumer_rollout_not_qualified','client coverage is explicit pending evidence');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'worker_schedule_not_qualified','no source migration invents a running schedule');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'origin_cleanup_not_qualified','heartbeat cannot certify provider cleanup');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'legacy_object_delete_gate_open','preactivation legacy gateway gate defaults open for compatibility');
select is(public.deleted_content_expiry_readiness()->>'scheduleObservedByDatabase','false','database does not pretend to observe external scheduling');
select is(public.deleted_content_expiry_readiness()->>'supabaseDirectStorageCoverage','exact_brand_only_other_direct_storage_unsupported','only exact Brand is delegated; other direct Supabase storage remains uncovered');
select throws_ok($$update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true$$,
 '55000',null,'old readiness boolean cannot bypass qualification');
select ok((select not armed from private.deleted_media_reference_fence),'failed enable rolls back latch arming');
select ok(not has_function_privilege('authenticated','public.deleted_content_expiry_readiness()','EXECUTE'),'consumer cannot inventory private source coverage');
select ok(not has_function_privilege('authenticated','public.record_deleted_content_worker_heartbeat()','EXECUTE'),'consumer cannot fabricate worker health');
select ok(not has_table_privilege('service_role','private.deleted_content_rollout_qualification','UPDATE'),'worker cannot qualify its own deployment');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in
 ('private.deleted_content_rollout_qualification'::regclass,'private.deleted_content_worker_health'::regclass)),'qualification and health FORCE RLS');

-- Only the known historical synthetic proof fixture is removed. No arbitrary
-- source inventory is erased merely to make a qualification pass.
delete from public.videos where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
 and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
delete from public.media_scan_jobs where target_table='videos' and target_id='6e1c3405-7db8-4cb2-98f3-5a7642e82126';
update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification set
 source_revision=repeat('0',40),client_enforcement_evidence='disposable-local SQL protocol fixture',
 legacy_delete_drain_evidence='disposable-local fixture: no provider request in flight',
 worker_schedule_evidence='disposable-local bounded worker fixture',
 origin_cleanup_evidence='disposable-local fixture; no live provider proof',qualified_at=clock_timestamp();
select public.record_deleted_content_worker_heartbeat();
select ok((public.deleted_content_expiry_readiness()->>'ready')::boolean,'empty inventory plus explicit local fixture qualification passes gate');
select is(public.deleted_content_expiry_readiness()->'flags'->>'capture_enabled','false','readiness never enables capture');
select is(public.deleted_content_expiry_readiness()->>'physicalDeletionAllowed','false','diagnostics do not authorize provider deletion');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
values('c3000000-0000-4000-8000-000000000001','retention-readiness@example.test',now(),false,false);
insert into auth.sessions(id,user_id,not_after)
values('c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',now()+interval '1 day');
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
select 'c3000000-0000-4000-8000-000000000001'::uuid,public.wave1_sha256('c3000000-0000-4000-8000-000000000001'),
 d.document_key,d.version,d.market,'member',d.capability,'c4000000-0000-4000-8000-000000000001','service_reconciliation'
from public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES' and d.capability='account';
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path)
values('c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',
 'Synthetic legacy source','draft','clean','supabase','creator-videos',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000001/legacy-readiness-key.mp4',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000001/legacy-readiness-key.mp4');
select is(public.deleted_content_expiry_readiness()->>'uncoveredSourceCount','1','actual legacy source blocks readiness even with all assertions recorded');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'current_media_inventory_not_fully_covered','legacy decision cannot be waived by operator evidence');
select ok(strpos(public.deleted_content_expiry_readiness()::text,'legacy-readiness-key.mp4')=0,'readiness contains counts not private object keys');
select throws_ok($$update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true$$,
 '55000',null,'unsupported current provider prevents activation');
select lives_ok($$update public.videos set title='Synthetic legacy edit' where id='c5000000-0000-4000-8000-000000000001'$$,'disabled source keeps ordinary edits working');
delete from public.videos where id='c5000000-0000-4000-8000-000000000001';
delete from public.media_scan_jobs where target_table='videos' and target_id='c5000000-0000-4000-8000-000000000001';

insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
 expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
values('c7000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','creator_video',
 'cloudflare_r2','chillywood-media-origin','c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000002/source.mp4',
 'video/mp4',1024,'verified',now()+interval '1 hour',now(),'c5000000-0000-4000-8000-000000000002',now());
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
values('c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001',
 'Synthetic eligible original','draft','clean','cloudflare_r2','chillywood-media-origin',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000002/source.mp4',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000002/source.mp4','video/mp4',1024);
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'outstanding_scan_references_require_resolution','unsettled scan authority is visible and blocks initial activation');
-- Synthetic scan job only: this exercises DB eligibility, not malware-provider
-- evidence or the separate origin qualification boundary.
update public.media_scan_jobs set status='clean' where target_table='videos' and target_id='c5000000-0000-4000-8000-000000000002';
select ok((public.deleted_content_expiry_readiness()->>'ready')::boolean,'actual verified canonical original is covered');
update public.videos set created_at=null where id='c5000000-0000-4000-8000-000000000002';
select ok(not (public.deleted_content_expiry_readiness()->>'ready')::boolean,'missing source incarnation cannot pass readiness');
update public.videos set created_at=now() where id='c5000000-0000-4000-8000-000000000002';
update public.videos set storage_path='uncovered-secondary-path.mp4' where id='c5000000-0000-4000-8000-000000000002';
select ok(not (public.deleted_content_expiry_readiness()->>'ready')::boolean,'a distinct fallback storage path is a second uncovered object');
update public.videos set storage_path=storage_object_key where id='c5000000-0000-4000-8000-000000000002';
update public.videos set thumb_storage_path='cover-secondary.jpg' where id='c5000000-0000-4000-8000-000000000002';
select ok(not (public.deleted_content_expiry_readiness()->>'ready')::boolean,'original eligibility does not hide uncovered cover bytes');
update public.videos set thumb_storage_path=null where id='c5000000-0000-4000-8000-000000000002';
insert into public.video_renditions(id,video_id,owner_id,quality_label,storage_path)
values('c8000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
 'c3000000-0000-4000-8000-000000000001','360p','secondary-rendition.mp4');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'secondary_media_cleanup_not_covered','derived metadata cannot disappear behind original-only readiness');
select is(private.deleted_content_source_coverage('creator_video',(select to_jsonb(v) from public.videos v where id='c5000000-0000-4000-8000-000000000002')),
 'secondary_media_uncovered','per-source capture check independently rejects derivatives');
delete from public.video_renditions where id='c8000000-0000-4000-8000-000000000001';
update public.media_scan_jobs set status='clean'
where (target_table='videos' and target_id='c5000000-0000-4000-8000-000000000002')
 or (target_table='video_renditions' and target_id='c8000000-0000-4000-8000-000000000001');
alter table public.videos disable trigger zzz_deleted_content_source_coverage;
select is(public.deleted_content_expiry_readiness()->>'sourceAdmissionGuardCoverage','false','disabled admission trigger is a real readiness blocker');
alter table public.videos enable trigger zzz_deleted_content_source_coverage;
alter table public.profile_posts disable trigger capture_soft_deleted_content;
select is(public.deleted_content_expiry_readiness()->>'contentCaptureGuardCoverage','false','disabled soft-delete trigger blocks activation too');
alter table public.profile_posts enable trigger capture_soft_deleted_content;
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,
 media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true;
set local request.jwt.claims='{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.record_video_original_rendition('c5000000-0000-4000-8000-000000000002')->>'status',
 'recorded','ordinary upload RPC may register the independently proven same-original alias');
set local request.jwt.claims='';
select throws_ok($$update public.video_renditions set storage_path='distinct-original-labelled.mp4'
 where video_id='c5000000-0000-4000-8000-000000000002' and quality_label='original'$$,
 '55000','retention_secondary_media_coverage_required','original label cannot authorize a distinct unproven object');
select throws_ok($$update public.video_renditions set manifest_path='distinct-manifest.m3u8'
 where video_id='c5000000-0000-4000-8000-000000000002' and quality_label='original'$$,
 '55000','retention_secondary_media_coverage_required','same original alias cannot smuggle another media locator');
update public.media_scan_jobs set status='clean' where target_table='video_renditions'
 and target_id in (select id::text from public.video_renditions where video_id='c5000000-0000-4000-8000-000000000002');
select ok((public.deleted_content_expiry_readiness()->>'ready')::boolean,'proven same-original alias is covered without admitting secondary bytes');
select lives_ok($$update public.videos set title='Updated current title' where id='c5000000-0000-4000-8000-000000000002'$$,'active gate preserves ordinary content edits');
select is((select count(*) from private.deleted_content_records),0::bigint,'readiness and ordinary edits create no retained snapshots');
select throws_ok($$update public.videos set thumb_storage_path='new-uncovered-cover.jpg' where id='c5000000-0000-4000-8000-000000000002'$$,
 '55000','retention_source_coverage_required: secondary_media_uncovered','active original-only scope rejects new uncovered locators');
select throws_ok($$insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path)
 values('c5000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000001',
 'Synthetic forbidden legacy admission','draft','clean','supabase','creator-videos',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000003/source.mp4',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000003/source.mp4')$$,
 '55000','retention_source_coverage_required: unsupported_provider','active admission cannot reopen direct legacy storage coverage gap');
select is(private.deleted_content_source_coverage('creator_video',jsonb_build_object('created_at',now())),
 'metadata_only','coverage does not invent a media object for an empty historic source');
-- The actual video INSERT policy requires finite Premium authority. Exercise
-- its trusted event producer with a synthetic sandbox event; do not replace
-- the entitlement predicate or grant a staff bypass. This all rolls back.
update public.platform_money_kill_switches set state='sandbox_only'
where key in ('revenuecat_app_store_enabled','provider_webhooks_enabled');
do $premium_fixture$
declare result jsonb;
begin
 select public.process_revenuecat_premium_event_atomic(
  'revenuecat_app_store','retention-readiness-premium','INITIAL_PURCHASE',
  'c3000000-0000-4000-8000-000000000001',mapping.provider_product_id,
  mapping.provider_base_plan_id,'sandbox','active',now()-interval '1 day',
  now()+interval '30 days',now(),mapping.reference_price_minor,
  mapping.reference_currency,repeat('c',64),'NORMAL','app_store','ios',
  mapping.id,mapping.product_id,'retention-readiness-premium-original'
 ) into result
 from public.monetization_product_store_mappings mapping
 where mapping.provider='revenuecat_app_store'
   and mapping.provider_product_id='com.chillywood.premium.monthly'
   and mapping.environment='sandbox'
 limit 1;
 if coalesce(result->>'status','') not in ('processed','applied','idempotent') then
  raise exception 'retention_readiness_premium_fixture_failed: %',result;
 end if;
end;
$premium_fixture$;
insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
 expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at)
values('c7000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000001','creator_video',
 'cloudflare_r2','chillywood-media-origin','c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000005/source.mp4',
 'video/mp4',1024,'verified',now()+interval '1 hour','video/mp4',1024,now());
set local request.jwt.claims='{"sub":"c3000000-0000-4000-8000-000000000001","role":"authenticated","email":"retention-readiness@example.test","session_id":"c4000000-0000-4000-8000-000000000001"}';
set local role authenticated;
select ok(public.has_active_premium_creator_tool_access('c3000000-0000-4000-8000-000000000001'),
 'actual current session and producer-backed Premium authority permit creator upload');
select lives_ok($$insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
 values('c5000000-0000-4000-8000-000000000005','c3000000-0000-4000-8000-000000000001',
 'Synthetic consumer upload','draft','clean','cloudflare_r2','chillywood-media-origin',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000005/source.mp4',
 'c3000000-0000-4000-8000-000000000001/c5000000-0000-4000-8000-000000000005/source.mp4','video/mp4',1024)$$,
 'active coverage sees the real verified reservation consumed earlier in the same authenticated INSERT');
reset role;
set local request.jwt.claims='';
select is((select attached_record_id from public.media_upload_reservations where id='c7000000-0000-4000-8000-000000000002'),
 'c5000000-0000-4000-8000-000000000005','actual consumer trigger bound upload before coverage check');
update public.media_scan_jobs set status='clean' where target_table='videos' and target_id='c5000000-0000-4000-8000-000000000005';

update private.deleted_content_worker_health set last_completed_at=clock_timestamp()-interval '16 minutes';
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'worker_completion_missing_or_stale','stopped worker makes diagnostics unready');
update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false,media_expiry_enabled=false;
select throws_ok($$update private.deleted_content_retention_settings set capture_enabled=true,media_staging_enabled=true$$,
 '55000',null,'worker restart cannot bypass stale completion evidence');
select public.record_deleted_content_worker_heartbeat();
select lives_ok($$update private.deleted_content_retention_settings set capture_enabled=true,media_staging_enabled=true$$,'fresh completed pass permits qualified restart');
select ok((select armed from private.deleted_media_reference_fence),'stop and restart never disarms permanent retirement fence');
select throws_ok($$update private.deleted_content_retention_settings set legacy_object_deletes_blocked=false$$,
 '55000','retention_legacy_delete_gate_permanent_after_activation','postactivation rollback cannot reopen unsafe legacy object deletion');
select * from finish();
rollback;
