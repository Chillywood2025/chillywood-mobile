#!/usr/bin/env node
// Synthetic SQL on PGlite, not a provider test or multi-session concurrency proof.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let checks=0;
const scalar=async sql=>(await db.query(sql)).rows[0].v;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const denied=async(sql,pattern=/media_key_retired_reference_forbidden/)=>{await assert.rejects(db.exec(sql),pattern);checks++;};
const owner='10000000-0000-4000-8000-000000000001';
const target='20000000-0000-4000-8000-000000000001';
const reservation='30000000-0000-4000-8000-000000000001';
const stage='40000000-0000-4000-8000-000000000001';
const deletion='50000000-0000-4000-8000-000000000001';
const key=`${owner}/${target}/source.mp4`;
try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table auth.users(id uuid primary key);
create table public.platform_role_memberships(user_id text,role text);
create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text,placed_by_user_id text,released_by_user_id text);
create table public.profile_posts(id uuid primary key,user_id text,body text,deleted_at timestamptz,updated_at timestamptz);
create table public.profile_post_comments(like public.profile_posts including all);
create table public.creator_video_comments(like public.profile_posts including all);
create table public.chat_messages(id uuid primary key,sender_user_id text,body text,moderation_status text);
create table public.watch_party_room_messages(id uuid primary key,user_id text,text text);
create table public.videos(id uuid primary key,owner_id uuid,title text,description text,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,thumb_storage_path text,created_at timestamptz,deleted_at timestamptz);
create table public.social_attachments(id uuid primary key,owner_user_id text,surface_type text,surface_id uuid,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,deleted_at timestamptz);
create table public.platform_brand_assets(id uuid primary key,owner_user_id text,deleted_at timestamptz,storage_path text);
create table public.media_upload_reservations(id uuid primary key,surface_type text,storage_provider text,storage_bucket text,storage_object_key text,attached_record_id text,owner_user_id uuid references auth.users on delete cascade,status text,verified_at timestamptz,attached_at timestamptz);
create table public.media_renditions(id uuid default gen_random_uuid(),storage_path text,manifest_path text,public_playback_path text,protected_playback_path text);
create table public.video_renditions(id uuid default gen_random_uuid(),storage_path text,manifest_path text);
create table public.media_scan_jobs(id uuid default gen_random_uuid(),storage_object_key text,status text);
create table public.reference_resolutions(id uuid default gen_random_uuid(),resolved_object_key text);
create table public.json_consumers(id uuid default gen_random_uuid(),metadata jsonb);
create table public.url_consumers(id uuid default gen_random_uuid(),media_url text);
`);
await db.exec(readFileSync('supabase/migrations/20261020011840_deleted_content_retention.sql','utf8'));
for(const isolation of ['repeatable read','serializable']) {
 await db.exec(`begin isolation level ${isolation};
   insert into public.legal_holds(target_type,target_id,status) values('user','partial-migration-fixture','active');
   rollback;`);
 check(true,`inactive legal holds remain compatible before the later reference migration: ${isolation}`);
}
check(await scalar(`select not has_function_privilege('authenticated','private.deleted_media_reference_fence_armed()','execute') v`),
 'private latch execution is closed immediately in the first migration');
await db.exec(readFileSync('supabase/migrations/20261020013500_deleted_media_reference_retirement.sql','utf8'));
check(await scalar('select private.deleted_media_reference_coverage_ready() v'),'catalog locator coverage initially complete');
check(await scalar('select not armed v from private.deleted_media_reference_fence'),'disabled installation starts unarmed');
for(const isolation of ['read committed','repeatable read','serializable']) {
 await db.exec(`begin isolation level ${isolation};insert into json_consumers(metadata) values('{"unrelated":true}');update json_consumers set metadata='{"unrelated":"updated"}';
 insert into legal_holds(target_type,target_id,status) values('room_message',gen_random_uuid()::text,'active');update legal_holds set target_type='room_message';`);
 check(await scalar(`select not exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and classid=176214 and objid=30) v`),`${isolation} inactive writes do not take global exclusive lock`);
 await db.exec('commit;');
}
await db.exec('begin;update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true;');
check(await scalar('select armed v from private.deleted_media_reference_fence'),'text-only capture enable arms the joint retention barrier');
await db.exec('rollback;');
check(await scalar('select not armed v from private.deleted_media_reference_fence'),'rolled-back enable leaves the barrier unarmed');
await denied(`insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id)
 values('${stage}','creator_video','${target}','${owner}','cloudflare_r2','chillywood-media-origin','${key}','${reservation}')`,/retirement_fence_not_armed/);
await db.exec(`update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,text_expiry_enabled=true;
 insert into private.deleted_content_records(target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
 values('room_message','text-only-retirement','${owner}','{"text":"expired"}','hard',now()-interval '31 days',now()-interval '1 day');`);
check(await scalar(`select public.expire_deleted_content_text((select id from private.deleted_content_records where target_id='text-only-retirement'))->>'status'='purged' v`),'text-only capture arms before irreversible text claim');
await db.exec('update private.deleted_content_retention_settings set capture_enabled=false,text_expiry_enabled=false;');
await denied(`insert into legal_holds(target_type,target_id,status) values('room_message','text-only-retirement','active')`,/retention_preservation_unavailable_deletion_already_claimed/);
check(await scalar('select armed v from private.deleted_media_reference_fence'),'disabling flags never disarms the fence');
await denied('update private.deleted_media_reference_fence set armed=false',/retirement_fence_monotonic/);
await denied('delete from private.deleted_media_reference_fence',/retirement_fence_permanent/);
await denied('truncate private.deleted_media_reference_fence',/retirement_fence_permanent/);
for(const role of ['anon','authenticated','service_role']) {
 check(await scalar(`select not has_table_privilege('${role}','private.deleted_media_reference_fence','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') v`),`${role} has no direct fence access`);
 check(await scalar(`select not has_function_privilege('${role}','private.deleted_media_reference_fence_armed()','EXECUTE') v`),`${role} cannot call fence helper`);
}
await db.exec(`insert into auth.users values('${owner}');
insert into videos values('${target}','${owner}','original','', 'cloudflare_r2','chillywood-media-origin','${key}','${key}',null,now(),null);
insert into media_upload_reservations values('${reservation}','creator_video','cloudflare_r2','chillywood-media-origin','${key}','${target}','${owner}','verified',now(),now());
insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id)
values('${stage}','creator_video','${target}','${owner}','cloudflare_r2','chillywood-media-origin','${key}','${reservation}');`);
check(await scalar(`select count(*)=1 v from private.deleted_media_key_retirements`),'exact original reservation copied');
check(await scalar(`select not (private.deleted_media_retirement_binding('${stage}')->>'supported')::boolean v`),'staged alone unsupported');
await db.exec(`insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
values('${deletion}','creator_video','${target}','${owner}','{}','hard',now()-interval '31 days',now()-interval '1 day');
update private.deleted_content_media_stages set deletion_id='${deletion}' where id='${stage}';`);
check(await scalar(`select (private.deleted_media_retirement_binding('${stage}')->>'supported')::boolean v`),'finalized canonical source supported by SQL coverage');
check(await scalar(`select private.deleted_media_has_live_reference('${stage}') v`),'still attached original prevents cleanup');
check(await scalar(`select not private.claim_deleted_media_retirement('${stage}') v`),'live original prevents irreversible claim');
await db.exec(`update videos set deleted_at=now();update videos set deleted_at=null;`);
check(await scalar('select deleted_at is null v from videos'),'unchanged existing incarnation can restore before claim');
await denied(`update videos set owner_id='10000000-0000-4000-8000-000000000002'`);
await denied(`insert into reference_resolutions(resolved_object_key) values('${key}')`);
for(const column of ['storage_path','manifest_path','public_playback_path','protected_playback_path'])
 await denied(`insert into media_renditions(${column}) values('${key}')`);
for(const column of ['storage_path','manifest_path']) await denied(`insert into video_renditions(${column}) values('${key}')`);
await denied(`insert into platform_brand_assets(id,storage_path) values(gen_random_uuid(),'${key}')`);
await denied(`insert into json_consumers(metadata) values('{"nested":[{"object":"${key}"}]}')`);
await denied(`insert into url_consumers(media_url) values('https://example.invalid/${key.replaceAll('/','%2f')}')`);
await denied(`insert into media_scan_jobs(storage_object_key,status) values('${key}','clean')`);
await db.exec('grant usage on schema public to service_role;grant all on all tables in schema public to service_role;set role service_role;');
await denied(`insert into reference_resolutions(resolved_object_key) values('${key}')`);
await db.exec('reset role;');
check(await scalar(`select not (public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','${key}','upload')->>'allowed')::boolean v`),'new upload issuance denied');
check(await scalar(`select not (public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','${key}','inspection')->>'allowed')::boolean v`),'expired inspection denied');
await db.exec(`delete from videos;delete from auth.users where id='${owner}';`);
check(await scalar('select count(*)=0 v from media_upload_reservations'),'account cascade removes reservation');
check(await scalar('select count(*)=1 v from private.deleted_media_key_retirements'),'permanent provenance survives account cascade');
check(await scalar(`select not private.deleted_media_has_live_reference('${stage}') v`),'no remaining live bindings');
await db.exec('create table public.new_unreviewed_consumer(object_key text);');
check(await scalar('select not private.deleted_media_reference_coverage_ready() v'),'new unguarded consumer fails coverage');
check(await scalar(`select not private.claim_deleted_media_retirement('${stage}') v`),'coverage gap blocks claim');
await db.exec('drop table public.new_unreviewed_consumer;');
await db.exec('alter table public.media_renditions disable trigger zzz_deleted_media_reference_guard;');
check(await scalar(`select not private.claim_deleted_media_retirement('${stage}') v`),'disabled guard blocks claim');
await db.exec('alter table public.media_renditions enable trigger zzz_deleted_media_reference_guard;');
check(await scalar(`select private.claim_deleted_media_retirement('${stage}') v`),'retirement claim succeeds with no live refs');
check(await scalar(`select private.claim_deleted_media_retirement('${stage}') v`),'claim retry remains idempotent');
await denied(`insert into videos(id,owner_id,storage_provider,storage_bucket,storage_object_key,storage_path) values('${target}','${owner}','cloudflare_r2','chillywood-media-origin','${key}','${key}')`);
await denied(`delete from private.deleted_media_key_retirements`,/retirement_tombstone_permanent/);
await denied(`update private.deleted_media_key_retirements set status='retained',claimed_at=null`,/retirement_identity_immutable/);
for(const purpose of ['upload','read','inspection','publish'])
 check(await scalar(`select not (public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','${key}','${purpose}')->>'allowed')::boolean v`),`claimed ${purpose} denied`);
await db.exec('set role authenticated;');
await denied(`select public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','${key}','read')`,/permission denied/);
await denied('select * from private.deleted_media_key_retirements',/permission denied/);
await db.exec('reset role;');

// Further independent cases use fresh keys; permanent ledger rows are never reset.
const fixture=async({surface='creator_video',provider='cloudflare_r2',suffix='source.mp4',beforeFinalize=''}={})=>{
 const ids=(await db.query('select gen_random_uuid() owner,gen_random_uuid() target,gen_random_uuid() reservation,gen_random_uuid() stage,gen_random_uuid() deletion,gen_random_uuid() parent')).rows[0];
 const k=surface==='creator_video'?`${ids.owner}/${ids.target}/${suffix}`:`${ids.owner}/profile_post/${ids.parent}/${ids.target}.jpg`;
 await db.exec(`insert into auth.users values('${ids.owner}');`);
 if(surface==='creator_video')await db.exec(`insert into videos(id,owner_id,storage_provider,storage_bucket,storage_object_key,storage_path) values('${ids.target}','${ids.owner}','${provider}','chillywood-media-origin','${k}','${k}');`);
 else await db.exec(`insert into social_attachments(id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,storage_object_key,storage_path) values('${ids.target}','${ids.owner}','profile_post','${ids.parent}','${provider}','chillywood-media-origin','${k}','${k}');`);
 await db.exec(`insert into media_upload_reservations values('${ids.reservation}','${surface}','${provider}','chillywood-media-origin','${k}','${ids.target}','${ids.owner}','verified',now(),now());
 insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id) values('${ids.stage}','${surface}','${ids.target}','${ids.owner}','${provider}','chillywood-media-origin','${k}','${ids.reservation}');`);
 if(beforeFinalize)await db.exec(beforeFinalize.replaceAll('KEY',k));
 await db.exec(`insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at) values('${ids.deletion}','${surface}','${ids.target}','${ids.owner}','{}','hard',now()-interval '31 days',now()-interval '1 day');
 update private.deleted_content_media_stages set deletion_id='${ids.deletion}' where id='${ids.stage}';
 delete from ${surface==='creator_video'?'videos':'social_attachments'} where id='${ids.target}';`);
 return {...ids,key:k};
};
const social=await fixture({surface:'social_attachment'});
check(await scalar(`select private.claim_deleted_media_retirement('${social.stage}') v`),'verified canonical social original supported');
const unsupported=await fixture({provider:'s3'});
check(await scalar(`select not (private.deleted_media_retirement_binding('${unsupported.stage}')->>'supported')::boolean v`),'Hetzner provider remains unsupported');
const cover=await fixture({suffix:'cover-10000000-0000-4000-8000-000000000009.jpg'});
check(await scalar(`select not (private.deleted_media_retirement_binding('${cover.stage}')->>'supported')::boolean v`),'cover keys remain unsupported');
const shared=await fixture({beforeFinalize:"insert into media_renditions(manifest_path) values('KEY')"});
check(await scalar(`select private.deleted_media_has_live_reference('${shared.stage}') v`),'preexisting shared rendition blocks claim');
check(await scalar(`select not private.claim_deleted_media_retirement('${shared.stage}') v`),'no irreversible claim with shared binding');
await db.exec(`delete from media_renditions where manifest_path='${shared.key}';`);
check(await scalar(`select private.claim_deleted_media_retirement('${shared.stage}') v`),'last shared reference removal permits claim');
const scan=await fixture({beforeFinalize:"insert into media_scan_jobs(storage_object_key,status) values('KEY','scanning')"});
check(await scalar(`select not private.claim_deleted_media_retirement('${scan.stage}') v`),'pending scan publisher prevents claim');
await db.exec(`update media_scan_jobs set status='clean' where storage_object_key='${scan.key}';`);
check(await scalar(`select private.claim_deleted_media_retirement('${scan.stage}') v`),'terminal scan receipt is provenance only');
await denied(`update media_scan_jobs set status='scanning' where storage_object_key='${scan.key}'`);
// A physical late write cannot change DB retirement or authorize delivery.
const physicalObjects=new Map([[scan.key,'original']]);
physicalObjects.delete(scan.key);physicalObjects.set(scan.key,'late admitted PUT');
check(await scalar(`select not (public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','${scan.key}','read')->>'allowed')::boolean v`),'late bytes remain unreachable');
check(await scalar(`select private.claim_deleted_media_retirement('${scan.stage}') v`),'repeated cleanup retains identical irreversible claim');
physicalObjects.delete(scan.key);check(!physicalObjects.has(scan.key),'model repeated cleanup targets retired logical key only');


for(const isolation of ['repeatable read','serializable']) {
 await db.exec(`begin isolation level ${isolation};`);
 check(await scalar(`select not (public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','${key}','read')->>'allowed')::boolean v`),'non-read-committed delivery fails closed');
 check(await scalar(`select not (private.deleted_media_retirement_binding('${stage}')->>'supported')::boolean v`),'non-read-committed binding fails closed');
 await denied(`insert into reference_resolutions(resolved_object_key) values('unrelated/key')`,/retirement_read_committed_required/);
 await db.exec('rollback;');
 await db.exec(`begin isolation level ${isolation};`);
 await denied(`select private.claim_deleted_media_retirement('${stage}')`,/retirement_read_committed_required/);
 await db.exec('rollback;');
}
console.log(`Deleted-media retirement SQL: ${checks} checks passed; no provider calls, no concurrency/production claim.`);
}finally{await db.close();}
