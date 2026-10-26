begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(20);

select ok(
  pg_get_functiondef('public.video_rendition_playback_safe(uuid)'::regprocedure)
    ilike '%security definer%set search_path to ''''%'
  and has_function_privilege('anon','public.video_rendition_playback_safe(uuid)','EXECUTE'),
  'the boolean safety helper has a fixed search path and is callable by policy roles');
select ok(
  not has_function_privilege('anon','public.resolve_video_playback_pre_paid_authority_closeout(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.resolve_video_playback_pre_paid_authority_closeout(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.resolve_video_playback_pre_paid_authority_closeout(uuid)','EXECUTE'),
  'the predecessor remains inaccessible as a direct RPC');
select ok(
  pg_get_functiondef('public.resolve_video_playback(uuid)'::regprocedure)
    ilike '%resolve_creator_content_access%resolve_video_playback_pre_paid_authority_closeout%',
  'the public wrapper still requires canonical parent commerce authority');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('00000000-0000-0000-0000-000000000000','ab100000-0000-4000-8000-000000000001',
  'authenticated','authenticated','legacy-playback-owner@example.test','',now(),'{}','{}',now(),now(),false,false);
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,file_size_bytes)
values('ab200000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001',
  'Legacy playback safety fixture','public','clean','cloudflare_r2','chillywood-media-origin',
  'ab100000-0000-4000-8000-000000000001/ab200000-0000-4000-8000-000000000001/source.mp4',
  'ab100000-0000-4000-8000-000000000001/ab200000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024);
update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id='ab200000-0000-4000-8000-000000000001';
insert into public.video_renditions(id,video_id,owner_id,quality_label,storage_bucket,storage_path,manifest_path,status,access_tier)
values('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001',
  'ab100000-0000-4000-8000-000000000001','360p','creator-videos','legacy/playback-safety/360.mp4',
  'legacy/playback-safety/master.m3u8','ready','free');
update public.video_renditions set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=now()
where id='ab300000-0000-4000-8000-000000000001';

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is(jsonb_array_length(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->'allowed_qualities'),1,
  'a clean free rendition remains anonymously available');
select is(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'default_quality','360p',
  'the normal default quality remains 360p');
select is((public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'legacy_playback_allowed')::boolean,false,
  'a ready rendition suppresses original fallback');
reset role;

delete from public.media_rendition_output_path_claims where output_path='legacy/playback-safety/master.m3u8';
set local role anon;
select is(jsonb_array_length(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->'allowed_qualities'),0,
  'a missing manifest claim denies the real public resolver');
select is((public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'legacy_playback_allowed')::boolean,false,
  'a missing claim does not revive original fallback');
select is(public.creator_video_storage_rendition_access_allowed('creator-videos','legacy/playback-safety/360.mp4','free'),false,
  'Storage agrees with the resolver on a missing sibling path claim');
reset role;
insert into public.media_rendition_output_path_claims(output_path,rendition_kind,rendition_id)
values('legacy/playback-safety/master.m3u8','video_rendition','ab300000-0000-4000-8000-000000000001');

update public.video_renditions set quarantined_at=now() where id='ab300000-0000-4000-8000-000000000001';
set local role anon;
select is(jsonb_array_length(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->'allowed_qualities'),0,
  'quarantine denies a ready scan-clean rendition');
select is(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'default_quality',null,
  'quarantine also removes the default quality');
reset role;
update public.video_renditions set quality_label='720p',access_tier='premium'
where id='ab300000-0000-4000-8000-000000000001';
set local role anon;
select is((public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'is_premium_locked_available')::boolean,false,
  'quarantined HD is not advertised as an available Premium upgrade');
reset role;
update public.video_renditions set quarantined_at=null,quality_label='360p',access_tier='free',status='archived'
where id='ab300000-0000-4000-8000-000000000001';
set local role anon;
select is(jsonb_array_length(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->'allowed_qualities'),0,
  'archived outputs are not playback qualities');
select is((public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'legacy_playback_allowed')::boolean,true,
  'an authorized parent retains its existing fallback when no rendition is ready');
reset role;

update public.video_renditions set status='ready' where id='ab300000-0000-4000-8000-000000000001';
-- Simulate a historical alias that predates enforced claims. Normal writers
-- cannot create this state; read boundaries must still fail closed for it.
set local session_replication_role=replica;
insert into public.video_renditions(id,video_id,owner_id,quality_label,storage_bucket,storage_path,manifest_path,
  status,access_tier,scan_status,scan_provider,scan_result,scanned_at)
select 'ab300000-0000-4000-8000-000000000002',video_id,owner_id,'480p',storage_bucket,storage_path,manifest_path,
  status,access_tier,scan_status,scan_provider,scan_result,scanned_at
from public.video_renditions where id='ab300000-0000-4000-8000-000000000001';
set local session_replication_role=origin;
set local role anon;
select is(jsonb_array_length(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->'allowed_qualities'),1,
  'only the exact canonical claim holder is offered while a shared alias remains');
reset role;
delete from public.video_renditions where id='ab300000-0000-4000-8000-000000000001';
set local role anon;
select is(jsonb_array_length(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->'allowed_qualities'),0,
  'canonical retirement does not authorize its surviving shared alias');
select is((public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'legacy_playback_allowed')::boolean,false,
  'surviving ready aliases do not revive original fallback');
select is(public.creator_video_storage_rendition_access_allowed('creator-videos','legacy/playback-safety/master.m3u8','free'),false,
  'retired canonical output is denied through Storage too');
reset role;
delete from public.videos where id='ab200000-0000-4000-8000-000000000001';
set local role anon;
select is(public.resolve_video_playback('ab200000-0000-4000-8000-000000000001')->>'status','not_allowed',
  'hard parent deletion remains denied by the outer authority gate');
reset role;
select ok(not has_table_privilege('anon','public.media_rendition_output_path_claims','SELECT')
  and not has_table_privilege('authenticated','public.media_rendition_output_path_claims','SELECT'),
  'sharing the safety predicate grants no access to internal claims');

select * from finish();
rollback;
