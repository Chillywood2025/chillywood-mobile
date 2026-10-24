begin;
select plan(41);
select ok(not (select batch_enabled from private.platform_brand_retention_settings),'global Brand batch defaults off');
select ok(not (select expiry_enabled from private.platform_brand_retention_settings),'existing Brand expiry stays off');
select ok(not (select version_delete_verified from private.platform_brand_retention_settings),'no provider qualification fabricated');
select ok(not (select capture_enabled from private.deleted_content_retention_settings),'global capture remains off');
select is(public.list_platform_brand_retention_expiry_work(),'{"enabled":false,"qualified":false,"assetIds":[],"limit":25}'::jsonb,'disabled batch returns no provider work');
select is(public.begin_platform_brand_retention_batch_transport(gen_random_uuid())->>'status','batch_disabled_or_unqualified','batch claim cannot bypass disabled gates');
select is(public.read_platform_brand_retention_batch_claim(gen_random_uuid(),gen_random_uuid())->>'status','batch_disabled_or_unqualified','batch recheck cannot bypass disabled gates');
select ok(not has_function_privilege('anon','public.list_platform_brand_retention_expiry_work()','EXECUTE'),'anonymous enumeration denied');
select ok(not has_function_privilege('authenticated','public.list_platform_brand_retention_expiry_work()','EXECUTE'),'client enumeration denied');
select ok(has_function_privilege('service_role','public.list_platform_brand_retention_expiry_work()','EXECUTE'),'service can read bounded due work');
select ok(not has_function_privilege('authenticated','public.begin_platform_brand_retention_batch_transport(uuid)','EXECUTE'),'client cannot authorize batch transport');
select ok(not has_function_privilege('authenticated','public.record_platform_brand_retention_worker_heartbeat(boolean,boolean)','EXECUTE'),'client cannot refresh Brand health');
select ok(not has_function_privilege('service_role','private.deleted_content_brand_source_coverage(jsonb,boolean)','EXECUTE'),'private coverage is not exposed to service API');
select is((select count(*)::int from pg_class where oid=any(array['private.platform_brand_retention_work_dispatch'::regclass,'private.platform_brand_retention_worker_health'::regclass,'private.deleted_content_brand_delegations'::regclass]) and relrowsecurity and relforcerowsecurity),3,'every new private relation forces RLS');
select is((select count(*)::int from pg_trigger where tgrelid='public.platform_brand_assets'::regclass and tgfoid='private.guard_deleted_content_brand_admission()'::regprocedure and tgenabled in ('O','A') and tgqual is null and (tgtype::int & 23)=23),1,'dedicated Brand admission installed');
select is((select count(*)::int from pg_trigger where tgrelid='public.platform_brand_assets'::regclass and tgfoid='private.guard_deleted_content_secondary_coverage()'::regprocedure),0,'only Brand secondary hook replaced');
select is((select count(*)::int from pg_trigger where tgrelid=any(array['public.video_renditions'::regclass,'public.media_renditions'::regclass,'public.media_transcode_jobs'::regclass]) and tgfoid='private.guard_deleted_content_secondary_coverage()'::regprocedure and tgenabled in ('O','A')),3,'shared secondary hooks preserved');
select ok(position('deleted_media_reference_fence_armed' in pg_get_functiondef('private.platform_brand_retention_lock()'::regprocedure))<position('pg_advisory_xact_lock' in pg_get_functiondef('private.platform_brand_retention_lock()'::regprocedure)),'Brand enters global fence before advisory lock');
select is(public.deleted_content_expiry_readiness()->>'platformBrandMediaCoverage','delegated_exact_brand_lifecycle','readiness reports explicit delegation, not blanket unsupported');
select is(public.deleted_content_expiry_readiness()->>'secondaryMediaCoverage','unsupported','unimplemented secondary lifecycle remains honest');
select is(public.deleted_content_expiry_readiness()->>'permanentPhysicalAbsenceGuaranteed','false','no permanent physical-absence guarantee');
select is(public.record_platform_brand_retention_worker_heartbeat(false,false)->>'permanentlyAbsent','false','disabled health records liveness only');

-- Dispatcher ownership regression on the full migrated, disposable database.
-- Every fixture, local qualification assertion and flag change rolls back.
-- No provider call or physical cleanup authorization is exercised here.
delete from public.videos
 where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
 and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
delete from public.media_scan_jobs
 where target_table='videos' and target_id='6e1c3405-7db8-4cb2-98f3-5a7642e82126';
update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification
 set source_revision=repeat('0',40),
 client_enforcement_evidence='disposable-local Brand dispatcher SQL fixture',
 legacy_delete_drain_evidence='disposable-local fixture: no provider requests in flight',
 worker_schedule_evidence='disposable-local manually driven dispatchers',
 origin_cleanup_evidence='disposable-local fixture: no live provider proof',
 qualified_at=clock_timestamp() where singleton;
select public.record_deleted_content_worker_heartbeat();
select lives_ok($$update private.deleted_content_retention_settings
 set activation_ready=true,capture_enabled=true,text_expiry_enabled=true,media_staging_enabled=true,media_expiry_enabled=true$$,
 'real readiness gate permits the explicit empty-inventory local dispatcher fixture');

insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
 values('b7300000-0000-4000-8000-000000000001','brand-dispatch-native@example.test',now(),false,false);
-- Both stages are registered by the real AFTER INSERT trigger using consumed
-- reservations and current clean scanner results. Only their scheduling clocks
-- are aged to avoid a one-hour test sleep. Dispatch is not permission to delete
-- these still-attached sources; the cleanup worker must recheck each stage.
do $$
declare n integer; target uuid; reservation uuid; stage uuid; job uuid; object_key text;
 author uuid:='b7300000-0000-4000-8000-000000000001'; scan_result jsonb;
begin
 for n in 1..2 loop
  target:=md5('brand-dispatch-target-'||n)::uuid;
  reservation:=md5('brand-dispatch-reservation-'||n)::uuid;
  stage:=md5('brand-dispatch-stage-'||n)::uuid;
  object_key:=author||'/'||target||'/source.mp4';
  insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,
   storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at)
  values(reservation,author,'creator_video','cloudflare_r2','chillywood-media-origin',object_key,
   'video/mp4',1024,'verified',clock_timestamp()+interval '1 hour','video/mp4',1024,clock_timestamp());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated')::text,true);
  if not public.consume_verified_media_upload('creator_video','cloudflare_r2','chillywood-media-origin',
   object_key,'video/mp4',1024,target::text) then raise exception 'brand_dispatch_reservation_consume_failed'; end if;
  perform set_config('request.jwt.claims','{}',true);
  insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,
   storage_object_key,storage_path,mime_type,file_size_bytes)
  values(target,author,'Synthetic Brand dispatch regression','draft','clean','cloudflare_r2','chillywood-media-origin',
   object_key,object_key,'video/mp4',1024);
  select j.id into strict job from public.media_scan_jobs j
   where j.target_table='videos' and j.target_column='source' and j.target_id=target::text
    and j.storage_provider='cloudflare_r2' and j.storage_bucket='chillywood-media-origin' and j.storage_object_key=object_key;
  update public.media_scan_jobs set priority=-2147483648 where id=job;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.claim_media_scan_jobs(1,'brand-dispatch-native');
  if (select status from public.media_scan_jobs where id=job) is distinct from 'scanning' then
   raise exception 'brand_dispatch_real_scan_claim_required'; end if;
  scan_result:=public.complete_media_scan_job(job,'clean','clamav','synthetic','synthetic-signatures',null,null,1);
  if scan_result->>'targetPropagationComplete' is distinct from 'true'
   or (select scan_status from public.videos where id=target) is distinct from 'clean' then
   raise exception 'brand_dispatch_real_scan_projection_required'; end if;
  perform set_config('request.jwt.claims','{}',true);
  insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,
   reservation_id,staged_at,reconcile_after)
  values(stage,'creator_video',target::text,author::text,'cloudflare_r2','chillywood-media-origin',object_key,
   reservation,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
 end loop;
end $$;
select is((select count(*) from private.deleted_content_media_stages s
 join private.deleted_media_key_retirements r on r.stage_id=s.id
 where s.id in (md5('brand-dispatch-stage-1')::uuid,md5('brand-dispatch-stage-2')::uuid)
  and s.deletion_id is null and s.reconcile_after<=clock_timestamp() and r.status='staged'
  and (r.provider,r.bucket,r.object_key,r.target_id,r.reservation_id)
   =(s.provider,s.bucket,s.object_key,s.target_id,s.reservation_id)),2::bigint,
 'both due stages have actual exact-key registration and qualify for cleanup dispatch');
select is((select count(*) from private.deleted_content_work_dispatch where kind='stage'),0::bigint,
 'stage fixtures begin without any dispatch lease');
insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 values('stage',md5('brand-dispatch-stage-2')::uuid,clock_timestamp()-interval '5 minutes');
create temp table brand_dispatch_stage_lease_before as
 select to_jsonb(q) as row_data from private.deleted_content_work_dispatch q
 where kind='stage' and work_id=md5('brand-dispatch-stage-2')::uuid;
insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
 values(md5('brand-dispatch-text')::uuid,'room_message','brand-dispatch-text',
 'b7300000-0000-4000-8000-000000000001','{"body":"Synthetic due text"}','hard',now()-interval '31 days',now()-interval '1 day');
create temp table brand_dispatch_results(name text primary key,result jsonb);
insert into brand_dispatch_results values('text',public.list_deleted_content_expiry_work());
select is((select result->>'enabled' from brand_dispatch_results where name='text'),'true','text dispatcher remains enabled for text');
select is((select result->'stageIds' from brand_dispatch_results where name='text'),'[]'::jsonb,
 'text dispatcher never returns cleanup stages');
select is((select result->'deletionIds' from brand_dispatch_results where name='text'),
 jsonb_build_array(md5('brand-dispatch-text')::uuid),'ordinary due text still dispatches');
select is((select count(*) from private.deleted_content_work_dispatch
 where kind='stage' and work_id=md5('brand-dispatch-stage-1')::uuid),0::bigint,
 'text dispatcher leaves an absent stage lease absent');
select is((select to_jsonb(q) from private.deleted_content_work_dispatch q
 where kind='stage' and work_id=md5('brand-dispatch-stage-2')::uuid),
 (select row_data from brand_dispatch_stage_lease_before),'text dispatcher does not extend an existing expired stage lease');
select ok((select next_attempt_at>clock_timestamp() from private.deleted_content_work_dispatch
 where kind='text' and work_id=md5('brand-dispatch-text')::uuid),'text dispatcher leases its own text work');
insert into brand_dispatch_results values('cleanup',public.list_deleted_content_stage_cleanup_work());
select is((select result->>'enabled' from brand_dispatch_results where name='cleanup'),'true','existing cleanup dispatcher is enabled');
select is((select jsonb_agg(id order by id) from brand_dispatch_results x,
 jsonb_array_elements_text(x.result->'stageIds') ids(id) where x.name='cleanup'),
 (select jsonb_agg(id order by id) from (values
  (md5('brand-dispatch-stage-1')::uuid::text),(md5('brand-dispatch-stage-2')::uuid::text)) expected(id)),
 'cleanup dispatcher immediately selects the same two eligible stages after text dispatch');
select is((select count(*) from private.deleted_content_work_dispatch
 where kind='stage' and work_id in (md5('brand-dispatch-stage-1')::uuid,md5('brand-dispatch-stage-2')::uuid)
  and next_attempt_at>clock_timestamp()),2::bigint,'only cleanup dispatch creates or renews both stage leases');
select is((select count(*) from private.deleted_content_records where id=md5('brand-dispatch-text')::uuid),1::bigint,
 'enumeration does not delete the retained text');

-- Missing singleton is a disabled state, not SQL NULL falling through into
-- dispatch. A fresh due record would expose a fail-open text lease immediately.
insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
 values(md5('brand-dispatch-missing-settings')::uuid,'room_message','brand-dispatch-missing-settings',
 'b7300000-0000-4000-8000-000000000001','{"body":"Must not dispatch"}','hard',now()-interval '31 days',now()-interval '1 day');
create temp table brand_dispatch_all_leases_before as
 select coalesce(jsonb_agg(to_jsonb(q) order by kind,work_id),'[]'::jsonb) as rows_data
 from private.deleted_content_work_dispatch q;
delete from private.deleted_content_retention_settings where singleton;
select is((select count(*) from private.deleted_content_retention_settings),0::bigint,'singleton is genuinely absent for fail-closed regression');
insert into brand_dispatch_results values('missing-settings',public.list_deleted_content_expiry_work());
select is((select result from brand_dispatch_results where name='missing-settings'),
 '{"enabled":false,"deletionIds":[],"stageIds":[]}'::jsonb,'missing singleton returns exact disabled empty text work');
select is((select count(*) from private.deleted_content_work_dispatch
 where kind='text' and work_id=md5('brand-dispatch-missing-settings')::uuid),0::bigint,
 'missing singleton cannot lease fresh due text');
select is((select coalesce(jsonb_agg(to_jsonb(q) order by kind,work_id),'[]'::jsonb) from private.deleted_content_work_dispatch q),
 (select rows_data from brand_dispatch_all_leases_before),'missing singleton leaves every dispatch lease byte-for-byte unchanged');
select is(public.list_deleted_content_stage_cleanup_work(),'{"enabled":false,"stageIds":[]}'::jsonb,
 'existing cleanup dispatcher also remains disabled when singleton is missing');
select is((select coalesce(jsonb_agg(to_jsonb(q) order by kind,work_id),'[]'::jsonb) from private.deleted_content_work_dispatch q),
 (select rows_data from brand_dispatch_all_leases_before),'both disabled dispatchers leave the dispatch table unchanged');
select * from finish();
rollback;
