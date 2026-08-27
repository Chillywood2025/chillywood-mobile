begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(35);

select ok(
  pg_get_functiondef(
    'public.creator_video_storage_owner_current_authority(text,text)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and has_function_privilege(
    'authenticated',
    'public.creator_video_storage_owner_current_authority(text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.creator_video_storage_owner_current_authority(text,text)',
    'EXECUTE'
  ),
  '1. the owner upload/delete helper is fixed-path, authenticated-only, and SECURITY DEFINER'
);

select ok(
  pg_get_functiondef(
    'public.creator_video_storage_object_access_allowed(text,text)'::regprocedure
  ) ilike '%storage_provider%=%''supabase''%'
  and pg_get_functiondef(
    'public.creator_video_storage_object_access_allowed(text,text)'::regprocedure
  ) ilike '%media_scan_public_safe%'
  and pg_get_functiondef(
    'public.creator_video_storage_object_access_allowed(text,text)'::regprocedure
  ) ilike '%target_column%=%''thumbnail''%'
  and pg_get_functiondef(
    'public.creator_video_storage_object_access_allowed(text,text)'::regprocedure
  ) ilike '%can_read_creator_video_row%'
  and pg_get_functiondef(
    'public.creator_video_storage_object_access_allowed(text,text)'::regprocedure
  ) not ilike '%has_platform_role%'
  and has_function_privilege(
    'anon','public.creator_video_storage_object_access_allowed(text,text)','EXECUTE'
  ),
  '2. the boolean object gate binds exact Supabase rows, scan proof, and canonical content access with no direct staff bypass'
);

select ok(
  pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%video_rendition_binding_valid%'
  and pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%video_rendition_output_paths_valid%'
  and pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%monetization_has_active_premium%'
  and pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%can_read_creator_video_row%'
  and pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) not ilike '%has_platform_role%',
  '3. the rendition gate composes exact row/path binding, canonical content authority, and current Premium with no direct staff bypass'
);

select ok(
  (select policy.qual ilike '%creator_video_storage_object_access_allowed%'
     and policy.qual not ilike '%foldername%'
     and policy.qual not ilike '%video_renditions%'
     and policy.qual not ilike '%has_platform_role%'
   from pg_catalog.pg_policies policy
   where policy.schemaname='storage' and policy.tablename='objects'
     and policy.policyname='creator_videos_storage_select_visibility_access'),
  '4. the visibility policy has no raw owner, broad staff, playback-url, or rendition permissive branch'
);

select ok(
  (select policy.qual ilike '%creator_video_storage_rendition_access_allowed%free%'
   from pg_catalog.pg_policies policy
   where policy.schemaname='storage' and policy.tablename='objects'
     and policy.policyname='creator_videos_storage_select_free_renditions')
  and
  (select policy.qual ilike '%creator_video_storage_rendition_access_allowed%premium%'
   from pg_catalog.pg_policies policy
   where policy.schemaname='storage' and policy.tablename='objects'
     and policy.policyname='creator_videos_storage_select_premium_renditions'),
  '5. free and Premium rendition policies call the same exact gate with non-interchangeable fixed tiers'
);

select ok(
  (select policy.with_check ilike '%creator_video_storage_owner_current_authority%'
   from pg_catalog.pg_policies policy
   where policy.schemaname='storage' and policy.tablename='objects'
     and policy.policyname='creator_videos_storage_owner_insert')
  and
  (select policy.qual ilike '%creator_video_storage_owner_current_authority%'
   from pg_catalog.pg_policies policy
   where policy.schemaname='storage' and policy.tablename='objects'
     and policy.policyname='creator_videos_storage_owner_delete')
  and not exists (
    select 1 from pg_catalog.pg_policies policy
    where policy.schemaname='storage' and policy.tablename='objects'
      and policy.policyname='creator_videos_storage_owner_update'
  ),
  '6. insert/delete require current owner authority and byte replacement remains unavailable'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-4000-8000-000000000001','authenticated','authenticated','storage-owner-a@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-4000-8000-000000000002','authenticated','authenticated','storage-owner-b@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-4000-8000-000000000003','authenticated','authenticated','storage-operator@example.test','',now(),'{}','{}',now(),now(),false,false);

insert into auth.sessions(id,user_id,not_after) values
  ('fa000000-0000-4000-8000-000000000101','fa000000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('fa000000-0000-4000-8000-000000000202','fa000000-0000-4000-8000-000000000002',now()+interval '1 day'),
  ('fa000000-0000-4000-8000-000000000303','fa000000-0000-4000-8000-000000000003',now()+interval '1 day');

insert into public.wave1_legal_acceptances(
  user_id,subject_hash,document_key,document_version,market,role_key,capability,
  session_generation,authority_source
)
select fixture.user_id,public.wave1_sha256(fixture.user_id::text),
       document.document_key,document.version,document.market,'member',
       document.capability,fixture.session_generation,'service_reconciliation'
from (values
  ('fa000000-0000-4000-8000-000000000001'::uuid,'fa000000-0000-4000-8000-000000000101'),
  ('fa000000-0000-4000-8000-000000000002'::uuid,'fa000000-0000-4000-8000-000000000202'),
  ('fa000000-0000-4000-8000-000000000003'::uuid,'fa000000-0000-4000-8000-000000000303')
) fixture(user_id,session_generation)
cross join public.wave1_legal_document_versions document
where document.active and document.market='UNITED_STATES'
  and document.capability='account';

insert into public.platform_role_memberships(
  role,user_id,email,status,notes,granted_by,expires_at
) values (
  'operator','fa000000-0000-4000-8000-000000000003',
  'storage-operator@example.test','active','pgTAP exact Storage preview fixture',
  'service_role',now()+interval '1 day'
);

update public.platform_money_kill_switches
set state='sandbox_only'
where key in ('revenuecat_app_store_enabled','provider_webhooks_enabled');

do $premium_fixture$
declare v_result jsonb;
begin
  select public.process_revenuecat_premium_event_atomic(
    'revenuecat_app_store','storage-owner-a-premium','INITIAL_PURCHASE',
    'fa000000-0000-4000-8000-000000000001',mapping.provider_product_id,
    mapping.provider_base_plan_id,'sandbox','active',now()-interval '1 day',
    now()+interval '30 days',now(),mapping.reference_price_minor,
    mapping.reference_currency,repeat('a',64),'NORMAL','app_store','ios',
    mapping.id,mapping.product_id,'storage-owner-a-premium-original'
  ) into v_result
  from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store'
    and mapping.provider_product_id='com.chillywood.premium.monthly'
    and mapping.environment='sandbox'
  limit 1;
  if coalesce(v_result->>'status','') not in ('processed','applied','idempotent') then
    raise exception 'storage_premium_fixture_failed: %',v_result;
  end if;
end;
$premium_fixture$;

insert into public.videos(
  id,owner_id,title,visibility,moderation_status,storage_provider,
  storage_bucket,storage_object_key,storage_path,playback_url,thumb_storage_path,
  mime_type,file_size_bytes
) values
  ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','Owner A clean source','public','clean','supabase','creator-videos','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000001/source.mp4','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000001/source.mp4',null,null,'video/mp4',1024),
  ('fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','Owner B public source','public','clean','supabase','creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/source.mp4','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/source.mp4','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/playback-alias.mp4','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/cover-clean.jpg','video/mp4',1024),
  ('fb000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000001','Pending source','public','clean','supabase','creator-videos','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000003/source.mp4','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000003/source.mp4',null,null,'video/mp4',1024),
  ('fb000000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-000000000002','R2 collision','public','clean','cloudflare_r2','chillywood-media-origin','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000004/source.mp4','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000004/source.mp4',null,null,'video/mp4',1024),
  ('fb000000-0000-4000-8000-000000000005','fa000000-0000-4000-8000-000000000002','Clean draft for exact staff','draft','clean','supabase','creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/source.mp4','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/source.mp4',null,'fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/cover-clean.jpg','video/mp4',1024),
  ('fb000000-0000-4000-8000-000000000006','fa000000-0000-4000-8000-000000000002','Quarantined exact source','draft','clean','supabase','creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000006/source.mp4','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000006/source.mp4',null,null,'video/mp4',1024);

update public.videos
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'fb000000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000002',
  'fb000000-0000-4000-8000-000000000004',
  'fb000000-0000-4000-8000-000000000005'
);
update public.videos
set scan_status='quarantined',scan_provider='pgtap',scan_result='malware',
    quarantined_at=now()
where id='fb000000-0000-4000-8000-000000000006';
update public.media_scan_jobs
set status='clean',completed_at=now(),updated_at=now()
where target_table='videos' and target_column='thumbnail'
  and target_id in (
    'fb000000-0000-4000-8000-000000000002',
    'fb000000-0000-4000-8000-000000000005'
  )
  and storage_provider='supabase' and storage_bucket='creator-videos';
update public.videos
set thumb_scan_status='clean',thumb_scan_provider='pgtap',
    thumb_scan_result='clean',thumb_scanned_at=now()
where id in (
  'fb000000-0000-4000-8000-000000000002',
  'fb000000-0000-4000-8000-000000000005'
);

insert into public.video_renditions(
  id,video_id,owner_id,quality_label,storage_bucket,storage_path,
  status,access_tier
) values
  ('fc000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','360p','creator-videos','renditions/fb000000-0000-4000-8000-000000000002/360p.mp4','ready','free'),
  ('fc000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','720p','creator-videos','renditions/fb000000-0000-4000-8000-000000000002/720p.mp4','ready','premium'),
  ('fc000000-0000-4000-8000-000000000003','fb000000-0000-4000-8000-000000000005','fa000000-0000-4000-8000-000000000002','480p','creator-videos','renditions/fb000000-0000-4000-8000-000000000005/480p.mp4','ready','free');
update public.video_renditions
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002',
  'fc000000-0000-4000-8000-000000000003'
);

insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values
  ('creator-videos','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000001/source.mp4','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000003/source.mp4','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000001/unbound/staged.mp4','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000001/unbound/stale-delete.mp4','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000001/unbound/restricted-delete.mp4','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/source.mp4','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/playback-alias.mp4','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/cover-clean.jpg','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000004/source.mp4','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/source.mp4','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/cover-clean.jpg','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":1024}'),
  ('creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000006/source.mp4','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','renditions/fb000000-0000-4000-8000-000000000002/360p.mp4',null,null,'{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','renditions/fb000000-0000-4000-8000-000000000002/720p.mp4',null,null,'{"mimetype":"video/mp4","size":1024}'),
  ('creator-videos','renditions/fb000000-0000-4000-8000-000000000005/480p.mp4',null,null,'{"mimetype":"video/mp4","size":1024}');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa000000-0000-4000-8000-000000000101"}',true
);
select set_config('storage.allow_delete_query','true',true);
select is(public.monetization_has_active_premium(auth.uid()),true,
  '7. owner A has current provider-backed Premium for the legitimate upload and HD case');
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000001/source.mp4'),1,
  '8. a current unrestricted owner can read the exact safe bound source');
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/unbound/staged.mp4'),0,
  '9. an owner prefix alone cannot read staged or otherwise unbound bytes');
select lives_ok($sql$
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values (
    'creator-videos',
    'fa000000-0000-4000-8000-000000000001/fd000000-0000-4000-8000-000000000001/source.mp4',
    'fa000000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000001',
    '{"mimetype":"video/mp4","size":1024}'
  )
$sql$,'10. the current unrestricted Premium creator keeps the legitimate fresh-key upload workflow');
select lives_ok($sql$
  delete from storage.objects
  where bucket_id='creator-videos'
    and name='fa000000-0000-4000-8000-000000000001/fd000000-0000-4000-8000-000000000001/source.mp4'
$sql$,'11. a current unrestricted owner can clean up an owner-prefixed upload without an attached row');
select throws_ok($sql$
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values (
    'creator-videos',
    'fa000000-0000-4000-8000-000000000002/fd000000-0000-4000-8000-000000000002/source.mp4',
    'fa000000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000001',
    '{"mimetype":"video/mp4","size":1024}'
  )
$sql$,'42501','new row violates row-level security policy for table "objects"',
  '12. a current creator cannot upload into another creators prefix');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa000000-0000-4000-8000-000000000199"}',true
);
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000001/source.mp4'),0,
  '13. a stale session cannot read even its exact clean bound source');
select throws_ok($sql$
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values (
    'creator-videos',
    'fa000000-0000-4000-8000-000000000001/fd000000-0000-4000-8000-000000000003/source.mp4',
    'fa000000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000001',
    '{"mimetype":"video/mp4","size":1024}'
  )
$sql$,'42501','new row violates row-level security policy for table "objects"',
  '14. a stale session cannot create an owner-prefixed object');
delete from storage.objects
where bucket_id='creator-videos'
  and name='fa000000-0000-4000-8000-000000000001/unbound/stale-delete.mp4';
reset role;
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/unbound/stale-delete.mp4'),1,
  '15. a stale session cannot delete an owner-prefixed object');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(public.creator_video_storage_object_access_allowed(
  'creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/source.mp4'),true,
  '16. anonymous playback retains one exact public clean Supabase source');
select is(public.creator_video_storage_object_access_allowed(
  'creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/playback-alias.mp4'),false,
  '17. a playback_url alias cannot disclose an unbound Storage object');
select is(public.creator_video_storage_object_access_allowed(
  'creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000004/source.mp4'),false,
  '18. an R2 row cannot authorize a same-named Supabase object');
select is(public.creator_video_storage_object_access_allowed(
  'creator-videos','fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000003/source.mp4'),false,
  '19. exact row binding does not substitute for a completed clean scan');
select is(public.creator_video_storage_object_access_allowed(
  'creator-videos','fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000002/cover-clean.jpg'),true,
  '20. an exact independently scanned clean thumbnail remains readable');
select is(public.creator_video_storage_rendition_access_allowed(
  'creator-videos','renditions/fb000000-0000-4000-8000-000000000002/720p.mp4','premium'),false,
  '21. anonymous authority cannot read a Premium rendition through the visibility path');
select is(public.creator_video_storage_rendition_access_allowed(
  'creator-videos','renditions/fb000000-0000-4000-8000-000000000002/360p.mp4','free'),true,
  '22. the exact clean free rendition remains public');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000002","session_id":"fa000000-0000-4000-8000-000000000202"}',true
);
select is((select count(*)::integer from storage.objects
  where name='renditions/fb000000-0000-4000-8000-000000000002/720p.mp4'),0,
  '23. owning the content does not manufacture current Premium authority for the HD rendition');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa000000-0000-4000-8000-000000000101"}',true
);
select is((select count(*)::integer from storage.objects
  where name='renditions/fb000000-0000-4000-8000-000000000002/720p.mp4'),1,
  '24. exact creator-B content authority plus creator-A current Premium admits only the bound HD rendition');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000003","session_id":"fa000000-0000-4000-8000-000000000303"}',true
);
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/unbound/staged.mp4'),0,
  '25. an exact current operator role cannot read an unbound bucket object');
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/source.mp4'),0,
  '26. a platform role cannot directly read another creators private source');
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000005/cover-clean.jpg'),0,
  'a platform role cannot directly read another creators private scanned thumbnail');
select is((select count(*)::integer from storage.objects
  where name='renditions/fb000000-0000-4000-8000-000000000005/480p.mp4'),0,
  'a platform role cannot directly read another creators private free rendition');
select is((select count(*)::integer from storage.objects
  where name='renditions/fb000000-0000-4000-8000-000000000002/720p.mp4'),0,
  'a platform role cannot substitute for current Premium on direct Storage');
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000002/fb000000-0000-4000-8000-000000000006/source.mp4'),0,
  '27. staff authority cannot bypass quarantine or scan safety');
reset role;
select set_config('request.jwt.claims','{}',true);

insert into public.account_deletion_requests(
  user_id,status,delete_after,restore_deadline
) values (
  'fa000000-0000-4000-8000-000000000001','scheduled',
  now()+interval '30 days',now()+interval '30 days'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa000000-0000-4000-8000-000000000101"}',true
);
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/fb000000-0000-4000-8000-000000000001/source.mp4'),0,
  '28. an account-restricted owner cannot read its previously clean source');
select throws_ok($sql$
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values (
    'creator-videos',
    'fa000000-0000-4000-8000-000000000001/fd000000-0000-4000-8000-000000000004/source.mp4',
    'fa000000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000001',
    '{"mimetype":"video/mp4","size":1024}'
  )
$sql$,'42501','new row violates row-level security policy for table "objects"',
  '29. an account-restricted owner cannot upload new bytes');
delete from storage.objects
where bucket_id='creator-videos'
  and name='fa000000-0000-4000-8000-000000000001/unbound/restricted-delete.mp4';
reset role;
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::integer from storage.objects
  where name='fa000000-0000-4000-8000-000000000001/unbound/restricted-delete.mp4'),1,
  '30. an account-restricted owner cannot delete an object');
select is(
  public.creator_video_storage_object_access_allowed(
    'wrong-bucket','fa000000-0000-4000-8000-000000000001/unbound/staged.mp4'
  ),false,
  '31. malformed or wrong-bucket direct helper probes fail closed'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa000000-0000-4000-8000-000000000101"}',true
);
select is(
  public.creator_video_storage_owner_current_authority(
    'creator-videos','fa000000-0000-4000-8000-000000000001/unbound/staged.mp4'
  ),false,
  '32. the owner helper itself reports false after account restriction'
);
reset role;

select * from finish();
rollback;
