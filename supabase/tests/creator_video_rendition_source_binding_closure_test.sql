begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(37);

select ok(
  pg_get_functiondef(
    'public.creator_video_rendition_binding_valid(uuid,text,uuid)'::regprocedure
  ) ilike '%security definer%set search_path to ''''%'
  and has_function_privilege(
    'anon','public.creator_video_rendition_binding_valid(uuid,text,uuid)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.enforce_media_rendition_source_and_path_binding()','EXECUTE'
  )
  and not has_table_privilege(
    'anon','public.media_rendition_output_path_claims','SELECT'
  ),
  '1. fixed-path boolean helpers are exposed while the claim registry and write trigger remain internal'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row."tgrelid"='public.media_renditions'::regclass
      and trigger_row."tgname"='zy_enforce_media_rendition_source_and_path_binding'
      and not trigger_row."tgisinternal"
      and trigger_row."tgenabled"='O'
  )
  and pg_get_functiondef(
    'public.enforce_media_rendition_source_and_path_binding()'::regprocedure
  ) ilike '%on conflict%output_path%'
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row."conrelid"=
      'public.media_rendition_output_path_claims'::regclass
      and constraint_row."contype"='p'
  ),
  '2. one enabled trigger uses a primary-keyed claim to reject concurrent cross-column path reuse'
);

select ok(
  (select policy."qual" ilike '%creator_video_rendition_binding_valid%'
          and policy."qual" ilike '%media_rendition_output_paths_valid%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='public'
     and policy."tablename"='media_renditions'
     and policy."policyname"='media_renditions_select_public_safe_metadata')
  and
  (select policy."qual" ilike '%creator_video_rendition_binding_valid%'
          and policy."qual" ilike '%media_rendition_output_paths_valid%'
          and policy."qual" ilike '%creator_rendition_direct_owner_authorized%'
          and policy."qual" ilike '%creator_video_rendition_parent_read_safe%'
          and policy."qual" ilike '%media_scan_public_safe%'
          and policy."qual" ilike '%is_ready%'
          and policy."qual" ilike '%is_original%'
          and policy."qual" ilike '%moderation_status%'
          and policy."qual" not ilike '%has_platform_role%'
          and policy."qual" not ilike '%has_platform_permission%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='public'
     and policy."tablename"='media_renditions'
     and policy."policyname"='media_renditions_select_owner_operator'),
  '3. public and exact-current-owner paths independently enforce safe source binding without a direct staff bypass'
);

select ok(
  has_function_privilege(
    'authenticated','public.creator_rendition_direct_owner_authorized(uuid)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.creator_rendition_direct_owner_authorized(uuid)','EXECUTE'
  )
  and has_function_privilege(
    'authenticated','public.creator_video_rendition_parent_read_safe(uuid,uuid)','EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.creator_video_rendition_parent_read_safe(uuid,uuid)','EXECUTE'
  )
  and pg_get_functiondef(
    'public.creator_video_rendition_parent_read_safe(uuid,uuid)'::regprocedure
  ) ilike '%creator_rendition_direct_owner_authorized%'
  and
  (select policy."qual" ilike '%creator_rendition_direct_owner_authorized%'
          and policy."qual" ilike '%creator_video_rendition_parent_read_safe%'
          and policy."qual" ilike '%media_scan_public_safe%'
          and policy."qual" ilike '%quarantined_at%'
          and policy."qual" ilike '%status%'
          and policy."qual" ilike '%quality_label%'
          and policy."qual" not ilike '%has_platform_role%'
          and policy."qual" not ilike '%has_platform_permission%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='public'
     and policy."tablename"='video_renditions'
     and policy."policyname"='video_renditions_select_owner_operator'),
  'direct helper ACLs and the legacy rendition policy admit only an exact current safe owner'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000','ea000000-0000-4000-8000-000000000001','authenticated','authenticated','rendition-owner-a@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','ea000000-0000-4000-8000-000000000002','authenticated','authenticated','rendition-owner-b@example.test','',now(),'{}','{}',now(),now(),false,false),
  ('00000000-0000-0000-0000-000000000000','ea000000-0000-4000-8000-000000000003','authenticated','authenticated','rendition-operator@example.test','',now(),'{}','{}',now(),now(),false,false);

insert into auth.sessions(id,user_id,not_after) values
  ('ea000000-0000-4000-8000-000000000101','ea000000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('ea000000-0000-4000-8000-000000000202','ea000000-0000-4000-8000-000000000002',now()+interval '1 day'),
  ('ea000000-0000-4000-8000-000000000303','ea000000-0000-4000-8000-000000000003',now()+interval '1 day');

insert into public.wave1_legal_acceptances(
  user_id,subject_hash,document_key,document_version,market,role_key,capability,
  session_generation,authority_source
)
select fixture.user_id,public.wave1_sha256(fixture.user_id::text),
       document.document_key,document.version,document.market,'member',
       document.capability,fixture.session_generation,'service_reconciliation'
from (values
  ('ea000000-0000-4000-8000-000000000001'::uuid,'ea000000-0000-4000-8000-000000000101'),
  ('ea000000-0000-4000-8000-000000000002'::uuid,'ea000000-0000-4000-8000-000000000202'),
  ('ea000000-0000-4000-8000-000000000003'::uuid,'ea000000-0000-4000-8000-000000000303')
) fixture(user_id,session_generation)
cross join public.wave1_legal_document_versions document
where document.active and document.market='UNITED_STATES'
  and document.capability='account';

insert into public.platform_role_memberships(
  role,user_id,email,status,notes,granted_by,expires_at
) values (
  'operator','ea000000-0000-4000-8000-000000000003',
  'rendition-operator@example.test','active',
  'pgTAP direct rendition source denial fixture','service_role',
  now()+interval '1 day'
);

insert into public.videos (
  id,owner_id,title,visibility,moderation_status,
  storage_provider,storage_bucket,storage_object_key,storage_path,
  mime_type,file_size_bytes
) values
  ('eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','Rendition source A','public','clean','cloudflare_r2','chillywood-media-origin','ea000000-0000-4000-8000-000000000001/eb000000-0000-4000-8000-000000000001/source.mp4','ea000000-0000-4000-8000-000000000001/eb000000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024),
  ('eb000000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000002','Rendition source B','public','clean','cloudflare_r2','chillywood-media-origin','ea000000-0000-4000-8000-000000000002/eb000000-0000-4000-8000-000000000002/source.mp4','ea000000-0000-4000-8000-000000000002/eb000000-0000-4000-8000-000000000002/source.mp4','video/mp4',1024);
update public.videos
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id in (
  'eb000000-0000-4000-8000-000000000001',
  'eb000000-0000-4000-8000-000000000002'
);

select lives_ok($sql$
  insert into public.media_renditions (
    media_id,video_id,source_type,source_id,creator_id,rendition_label,
    delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
    public_playback_path,manifest_path,variant_playlist_path
  ) values (
    'binding-valid-a','eb000000-0000-4000-8000-000000000001','creator_video',
    'eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001',
    '360p','hls','origin_signed_direct','cloudflare_r2','private_origin','chillywood-media-origin',
    'private/a/360/master.m3u8','private/a/360/master.m3u8','private/a/360/index.m3u8'
  )
$sql$,'4. an exact creator-video binding and same-row manifest alias remain valid');

select is(
  (select count(*)::integer
   from public.media_rendition_output_path_claims
   where rendition_id=(
     select id from public.media_renditions where media_id='binding-valid-a'
   )),2,
  '5. same-row aliases produce exactly two distinct transactional path claims'
);

select throws_ok($sql$
  insert into public.media_renditions (
    media_id,video_id,source_type,source_id,creator_id,rendition_label,
    delivery_format,delivery_provider,storage_provider,bucket_role
  ) values (
    'binding-wrong-video','eb000000-0000-4000-8000-000000000002','creator_video',
    'eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',
    '360p','mp4','origin_signed_direct','cloudflare_r2','private_origin'
  )
$sql$,'P0001','creator_video_rendition_source_binding_invalid',
  '6. source A cannot be relabelled as video B');

select throws_ok($sql$
  insert into public.media_renditions (
    media_id,video_id,source_type,source_id,creator_id,rendition_label,
    delivery_format,delivery_provider,storage_provider,bucket_role
  ) values (
    'binding-wrong-creator','eb000000-0000-4000-8000-000000000001','creator_video',
    'eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',
    '480p','mp4','origin_signed_direct','cloudflare_r2','private_origin'
  )
$sql$,'P0001','creator_video_rendition_source_binding_invalid',
  '7. creator B cannot be attached to creator A video');

select throws_ok($sql$
  insert into public.media_renditions (
    media_id,video_id,source_type,source_id,creator_id,rendition_label,
    delivery_format,delivery_provider,storage_provider,bucket_role
  ) values (
    'binding-malformed-source','eb000000-0000-4000-8000-000000000001','creator_video',
    'not-a-video-id','ea000000-0000-4000-8000-000000000001',
    '480p','mp4','origin_signed_direct','cloudflare_r2','private_origin'
  )
$sql$,'P0001','creator_video_rendition_source_binding_invalid',
  '8. malformed creator-video source identity fails closed');

select throws_ok($sql$
  insert into public.media_renditions (
    media_id,video_id,source_type,source_id,creator_id,rendition_label,
    delivery_format,delivery_provider,storage_provider,bucket_role,manifest_path
  ) values (
    'binding-cross-column-path','eb000000-0000-4000-8000-000000000002','creator_video',
    'eb000000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000002',
    '480p','hls','origin_signed_direct','cloudflare_r2','private_origin',
    'private/a/360/master.m3u8'
  )
$sql$,'P0001','media_rendition_output_path_reused',
  '9. another row cannot reuse a public path as its manifest path');

insert into public.media_renditions (
  media_id,source_type,source_id,creator_id,rendition_label,
  delivery_format,delivery_provider,storage_provider,bucket_role,variant_playlist_path
) values (
  'proof-path-owner','proof_demo','proof-path-owner',null,
  '360p','mp4','origin_signed_direct','cloudflare_r2','private_origin',
  'proof/shared/index.m3u8'
);
select throws_ok($sql$
  update public.media_renditions
  set variant_playlist_path='proof/shared/index.m3u8'
  where media_id='binding-valid-a'
$sql$,'P0001','media_rendition_output_path_reused',
  '10. a creator-video update cannot reuse a proof row path');

-- Simulate a pre-closure malformed row so the final permissive policies, not
-- the write trigger, must independently protect direct Data API callers.
set local session_replication_role=replica;
insert into public.media_renditions (
  media_id,video_id,source_type,source_id,creator_id,rendition_label,
  delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
  public_playback_path,manifest_path,variant_playlist_path,width,height,duration_ms,
  codec,bitrate,file_size_bytes,cache_policy,visibility,scan_status,moderation_status,
  is_public_playback_safe,is_original,is_ready,worker_version,source_hash
) values (
  'historical-forged-creator','eb000000-0000-4000-8000-000000000001','creator_video',
  'eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',
  '480p','hls','cloudflare_r2_custom_domain','cloudflare_r2','public_playback','chillywood-public',
  'playback/public/forged/480/master.m3u8','playback/public/forged/480/master.m3u8',
  'playback/public/forged/480/index.m3u8',854,480,1000,'h264',1000000,1024,
  'public, max-age=300','public','clean','clean',true,false,true,'pgtap-worker',repeat('f',64)
);
set local session_replication_role=origin;

insert into public.media_renditions (
  media_id,video_id,source_type,source_id,creator_id,rendition_label,
  delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
  public_playback_path,manifest_path,variant_playlist_path,width,height,duration_ms,
  codec,bitrate,file_size_bytes,cache_policy,visibility,scan_status,moderation_status,
  is_public_playback_safe,is_original,is_ready,worker_version,source_hash
) values (
  'exact-public-creator-b','eb000000-0000-4000-8000-000000000002','creator_video',
  'eb000000-0000-4000-8000-000000000002','ea000000-0000-4000-8000-000000000002',
  '360p','hls','cloudflare_r2_custom_domain','cloudflare_r2','public_playback','chillywood-public',
  'playback/public/exact-b/360/master.m3u8','playback/public/exact-b/360/master.m3u8',
  'playback/public/exact-b/360/index.m3u8',640,360,1000,'h264',750000,1024,
  'public, max-age=300','public','clean','clean',true,false,true,'pgtap-worker',repeat('e',64)
);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='historical-forged-creator'),0,
  '11. the public policy hides a historical forged creator binding'
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='exact-public-creator-b'),1,
  '12. the public policy still exposes an exactly bound free public rendition'
);
reset role;
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000002"}',
  true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='historical-forged-creator'),0,
  '13. the forged creator cannot use the owner policy as a permissive bypass'
);
reset role;
select set_config('request.jwt.claims','{}',true);

select throws_ok($sql$
  insert into public.video_renditions (
    video_id,owner_id,quality_label,storage_bucket,status,access_tier
  ) values (
    'eb000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000002','360p','creator-videos','queued','free'
  )
$sql$,'P0001','video_rendition_owner_binding_invalid',
  '14. a legacy rendition cannot relabel creator A video as creator B output');

select lives_ok($sql$
  insert into public.video_renditions (
    video_id,owner_id,quality_label,storage_bucket,storage_path,manifest_path,
    status,access_tier
  ) values (
    'eb000000-0000-4000-8000-000000000002',
    'ea000000-0000-4000-8000-000000000002','360p','creator-videos',
    'legacy/exact-b/360/master.m3u8','legacy/exact-b/360/master.m3u8','ready','free'
  )
$sql$,'15. an exactly owner-bound legacy rendition remains valid');

select is(
  (select count(*)::integer from public.media_rendition_output_path_claims
   where rendition_kind='video_rendition'
     and output_path='legacy/exact-b/360/master.m3u8'),1,
  '16. a same-row legacy alias creates one global path claim'
);

select throws_ok($sql$
  insert into public.video_renditions (
    video_id,owner_id,quality_label,storage_bucket,storage_path,status,access_tier
  ) values (
    'eb000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000001','480p','creator-videos',
    'private/a/360/master.m3u8','ready','free'
  )
$sql$,'P0001','media_rendition_output_path_reused',
  '17. a legacy row cannot reuse a modern rendition path across tables');

set local session_replication_role=replica;
insert into public.video_renditions (
  video_id,owner_id,quality_label,storage_bucket,storage_path,status,access_tier
) values (
  'eb000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000002','360p','creator-videos',
  'legacy/forged-owner/360.mp4','queued','free'
);
set local session_replication_role=origin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000002"}',true
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/forged-owner/360.mp4'),0,
  '18. the legacy owner policy hides a trigger-bypassed owner/path forgery'
);
reset role;
select set_config('request.jwt.claims','{}',true);

insert into public.media_renditions (
  media_id,video_id,source_type,source_id,creator_id,rendition_label,
  delivery_format,delivery_provider,storage_provider,bucket_role,storage_bucket,
  manifest_path,variant_playlist_path,width,height,duration_ms,codec,bitrate,
  file_size_bytes,visibility,scan_status,moderation_status,is_public_playback_safe,
  is_original,is_ready,worker_version,source_hash
) values
  (
    'direct-safe-private-a','eb000000-0000-4000-8000-000000000001','creator_video',
    'eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001',
    '1080p','hls','origin_signed_direct','cloudflare_r2','private_origin','chillywood-media-origin',
    'private/direct-safe-a/1080/master.m3u8','private/direct-safe-a/1080/index.m3u8',
    1920,1080,1000,'h264',4000000,1024,'private','clean','clean',false,false,true,
    'pgtap-worker',repeat('a',64)
  ),
  (
    'direct-unsafe-private-a','eb000000-0000-4000-8000-000000000001','creator_video',
    'eb000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001',
    '720p','hls','origin_signed_direct','cloudflare_r2','private_origin','chillywood-media-origin',
    'private/direct-unsafe-a/720/master.m3u8','private/direct-unsafe-a/720/index.m3u8',
    1280,720,1000,'h264',2000000,1024,'private','pending_scan','clean',false,false,true,
    'pgtap-worker',repeat('b',64)
  );

insert into public.video_renditions (
  video_id,owner_id,quality_label,storage_bucket,storage_path,status,access_tier,
  scan_status,scan_provider,scan_result,scanned_at
) values
  (
    'eb000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000001','480p','creator-videos',
    'legacy/direct-safe-a/480.mp4','ready','free','clean','pgtap','clean',now()
  ),
  (
    'eb000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000001','720p','creator-videos',
    'legacy/direct-unsafe-a/720.mp4','ready','owner','pending_scan',null,null,null
  );
update public.video_renditions
set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where storage_path='legacy/direct-safe-a/480.mp4';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000001","session_id":"ea000000-0000-4000-8000-000000000101"}',true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-safe-private-a'),1,
  'a current unrestricted exact owner can directly read one safe bound private media rendition'
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-unsafe-private-a'),0,
  'exact ownership cannot disclose an unscanned media rendition path'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),1,
  'a current unrestricted exact owner can directly read one safe bound legacy rendition'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-unsafe-a/720.mp4'),0,
  'exact ownership cannot disclose an unscanned legacy rendition path'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000001","session_id":"ea000000-0000-4000-8000-999999999999"}',true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-safe-private-a'),0,
  'a stale session cannot directly read its safe media rendition path'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),0,
  'a stale session cannot directly read its safe legacy rendition path'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000003","session_id":"ea000000-0000-4000-8000-000000000303"}',true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-safe-private-a'),0,
  'platform operator authority is not an unaudited direct media-rendition source bypass'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),0,
  'platform operator authority is not an unaudited direct legacy-rendition source bypass'
);
reset role;
select set_config('request.jwt.claims','{}',true);

update public.videos
set quarantined_at=now()
where id='eb000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000001","session_id":"ea000000-0000-4000-8000-000000000101"}',true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-safe-private-a'),0,
  'a quarantined parent revokes direct media-rendition disclosure immediately'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),0,
  'a quarantined parent revokes direct legacy-rendition disclosure immediately'
);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.videos
set quarantined_at=null
where id='eb000000-0000-4000-8000-000000000001';

update public.videos
set moderation_status='hidden'
where id='eb000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000001","session_id":"ea000000-0000-4000-8000-000000000101"}',true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-safe-private-a'),0,
  'an unsafe parent moderation state denies direct media-rendition disclosure'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),0,
  'an unsafe parent moderation state denies direct legacy-rendition disclosure'
);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.videos
set moderation_status='clean'
where id='eb000000-0000-4000-8000-000000000001';

update public.video_renditions
set quarantined_at=now()
where storage_path='legacy/direct-safe-a/480.mp4';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000001","session_id":"ea000000-0000-4000-8000-000000000101"}',true
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),0,
  'a quarantined legacy rendition denies its path even to the exact current owner'
);
reset role;
select set_config('request.jwt.claims','{}',true);
update public.video_renditions
set quarantined_at=null
where storage_path='legacy/direct-safe-a/480.mp4';

insert into public.account_deletion_requests(
  user_id,status,delete_after,restore_deadline
) values (
  'ea000000-0000-4000-8000-000000000001','scheduled',
  now()+interval '30 days',now()+interval '30 days'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-000000000001","session_id":"ea000000-0000-4000-8000-000000000101"}',true
);
select is(
  (select count(*)::integer from public.media_renditions
   where media_id='direct-safe-private-a'),0,
  'an account-restricted owner loses direct media-rendition disclosure immediately'
);
select is(
  (select count(*)::integer from public.video_renditions
   where storage_path='legacy/direct-safe-a/480.mp4'),0,
  'an account-restricted owner loses direct legacy-rendition disclosure immediately'
);
reset role;
select set_config('request.jwt.claims','{}',true);

select ok(
  (select policy."qual" ilike '%creator_video_storage_object_access_allowed%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='storage'
     and policy."tablename"='objects'
     and policy."policyname"='creator_videos_storage_select_visibility_access')
  and
  (select policy."qual" ilike '%creator_video_storage_rendition_access_allowed%'
          and policy."qual" ilike '%''free''%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='storage'
     and policy."tablename"='objects'
     and policy."policyname"='creator_videos_storage_select_free_renditions')
  and
  (select policy."qual" ilike '%creator_video_storage_rendition_access_allowed%'
          and policy."qual" ilike '%''premium''%'
   from pg_catalog.pg_policies policy
   where policy."schemaname"='storage'
     and policy."tablename"='objects'
     and policy."policyname"='creator_videos_storage_select_premium_renditions')
  and
  pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%video_rendition_binding_valid%'
  and pg_get_functiondef(
    'public.creator_video_storage_rendition_access_allowed(text,text,text)'::regprocedure
  ) ilike '%video_rendition_output_paths_valid%',
  '19. tier-specific storage policies delegate exact legacy row and path binding to the fixed helper'
);

update public.media_renditions
set public_playback_path='private/a/360/replaced/master.m3u8',
    manifest_path='private/a/360/replaced/master.m3u8'
where media_id='binding-valid-a';
select ok(
  not exists (
    select 1 from public.media_rendition_output_path_claims
    where output_path='private/a/360/master.m3u8'
  ) and exists (
    select 1 from public.media_rendition_output_path_claims
    where output_path='private/a/360/replaced/master.m3u8'
      and rendition_kind='media_rendition'
  ),
  '20. path updates atomically claim replacements and release stale claims'
);

delete from public.media_renditions where media_id='proof-path-owner';
select lives_ok($sql$
  insert into public.media_renditions (
    media_id,source_type,source_id,rendition_label,delivery_format,
    delivery_provider,storage_provider,bucket_role,variant_playlist_path
  ) values (
    'proof-path-successor','proof_demo','proof-path-successor','360p','mp4',
    'origin_signed_direct','cloudflare_r2','private_origin','proof/shared/index.m3u8'
  )
$sql$,'21. deleting a rendition releases its path for a legitimate successor');

select * from finish();
rollback;
