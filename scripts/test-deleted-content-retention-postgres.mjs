#!/usr/bin/env node
// Actual SQL on disposable PGlite; not a claim of multi-session PostgreSQL proof.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(); let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;};
const scalar=async sql=>(await db.query(sql)).rows[0].v;
const uid='10000000-0000-4000-8000-000000000001';
const vid='20000000-0000-4000-8000-000000000001';
const aid='30000000-0000-4000-8000-000000000001';
const initialKey=`${uid}/${vid}/source.mp4`;
const stage=async key=>(await db.query('select public.stage_deleted_content_media($1,$2,$3,$4,$5) v',['creator_video',vid,'cloudflare_r2','chillywood-media-origin',key==='source'?initialKey:key])).rows[0].v;
try {
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table public.platform_role_memberships(user_id text,role text);
create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text,placed_by_user_id text,released_by_user_id text);
create table public.profile_posts(id uuid primary key,user_id text,body text,deleted_at timestamptz,updated_at timestamptz);
create table public.profile_post_comments(like public.profile_posts including all);
create table public.creator_video_comments(like public.profile_posts including all);
create table public.chat_messages(id uuid primary key,sender_user_id text,body text,moderation_status text);
create table public.watch_party_room_messages(id uuid primary key,user_id text,text text);
create table public.videos(id uuid primary key,owner_id uuid,title text,description text,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,thumb_storage_path text);
create table public.social_attachments(id uuid primary key,owner_user_id text,surface_type text,surface_id uuid,storage_provider text,storage_bucket text,storage_object_key text,storage_path text,deleted_at timestamptz);
create table public.platform_brand_assets(id uuid primary key,owner_user_id text,deleted_at timestamptz);
create table public.media_upload_reservations(id uuid primary key,surface_type text,storage_provider text,storage_bucket text,storage_object_key text,attached_record_id text,owner_user_id uuid,status text,verified_at timestamptz,attached_at timestamptz);`);
await db.exec(readFileSync('supabase/migrations/20261020011840_deleted_content_retention.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261020013500_deleted_media_reference_retirement.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261020013556_deleted_content_media_expiry.sql','utf8'));
await db.exec("set timezone='America/Denver'");
await db.exec(`insert into profile_posts values('${vid}','${uid}','disabled',null,now());update profile_posts set body='still updates';delete from profile_posts;`);
check(await scalar('select count(*)=0 v from private.deleted_content_records'),'default disabled creates nothing');
await assert.rejects(db.exec('update private.deleted_content_retention_settings set capture_enabled=true'),/check constraint/); checks++;
await db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true');
await db.exec(`insert into profile_posts values('${vid}','${uid}','first',null,now());update profile_posts set body='final exact <text>';`);
check(await scalar('select count(*)=0 v from private.deleted_content_records'),'ordinary edits never snapshot');
await db.exec('begin;delete from profile_posts;rollback;');
check(await scalar('select count(*)=0 v from private.deleted_content_records'),'rollback leaves no record');
await db.exec(`insert into public.platform_role_memberships values('${uid}','owner');delete from profile_posts;`);
check(await scalar("select content->>'body'='final exact <text>' v from private.deleted_content_records"),'actual deletion captures final exact text');
check(await scalar("select extract(epoch from expires_at-deleted_at)=2592000 v from private.deleted_content_records"),'server capture fixed at 720 hours across Denver DST boundary');
check(await scalar("select extract(epoch from (timestamptz '2026-10-20 12:00:00 America/Denver'+interval '720 hours')-timestamptz '2026-10-20 12:00:00 America/Denver')=2592000 v"),'known fall DST crossing remains exactly 720 hours');
await db.exec("set timezone='UTC'");
await db.exec('delete from public.platform_role_memberships');
check(await scalar('select owner_protected v from private.deleted_content_records'),'Owner protection survives role change');
await assert.rejects(db.exec("update private.deleted_content_records set content='{}'"),/deleted_content_immutable/);checks++;
await db.exec('delete from profile_posts');
check(await scalar("select count(*)=1 and min(content->>'body')='final exact <text>' v from private.deleted_content_records"),'retry of completed delete does not overwrite snapshot or expiry');
await db.exec(`insert into profile_posts values('${vid}','${uid}','new incarnation',null,now());delete from profile_posts;`);
check(await scalar(`select private.read_deleted_content_inspection('profile_post','${vid}')->'content'->>'body'='new incarnation' v`),'genuinely recreated then deleted row captures latest content');
await db.exec(`insert into profile_post_comments values('${aid}','${uid}','before',null,now());update profile_post_comments set body='final',deleted_at='2000-01-01';`);
check(await scalar("select content->>'body'='final' and deleted_at>now()-interval '1 minute' v from private.deleted_content_records where target_type='profile_post_comment'"),'first soft delete uses final text and server time');
await db.exec(`update profile_post_comments set body='later';delete from profile_post_comments;`);
check(await scalar("select count(*)=1 and min(content->>'body')='final' v from private.deleted_content_records where target_type='profile_post_comment'"),'soft delete then hard delete retains one first-deletion record');
await db.exec(`insert into chat_messages values('${vid}','${uid}','chat','clean');update chat_messages set moderation_status='removed';`);
check(await scalar("select count(*)=0 v from private.deleted_content_records where target_type='chat_message'"),'reversible moderation is not deletion');
await db.exec(`insert into videos values('${vid}','${uid}','title','description','cloudflare_r2','chillywood-media-origin','${initialKey}','${initialKey}','cover');
insert into media_upload_reservations values('${aid}','creator_video','cloudflare_r2','chillywood-media-origin','${initialKey}','${vid}','${uid}','verified',now(),now());`);
check((await stage('detached-cover')).decision==='delete_now','replaced cover not staged');
check((await stage('source')).decision==='defer','legacy storage-first media staged');
check(await scalar("select count(*)=0 v from private.deleted_content_records where target_type='creator_video'"),'staging creates no content snapshot');
check(await scalar(`select private.read_deleted_content_inspection('creator_video','${vid}') is null v`),'staging never inspectable');
await stage('source');
check(await scalar('select count(*)=1 v from private.deleted_content_media_stages'),'stage retry is idempotent');
await db.exec('delete from videos');
check(await scalar('select deletion_id is not null v from private.deleted_content_media_stages'),'DB delete finalizes staging');
check((await stage('source')).decision==='defer','late storage retry cannot erase retained bytes');
check(await scalar(`select private.read_deleted_content_inspection('creator_video','${vid}')->>'isRetainedDeletion'='true' v`),'deleted text available through private adapter');
await db.exec("insert into private.deleted_content_records(target_type,target_id,author,content,deletion_kind,deleted_at,expires_at) values('room_message','40000000-0000-4000-8000-000000000001','synthetic','{}','hard',now()-interval '31 days',now()-interval '1 day')");
check(await scalar("select private.read_deleted_content_inspection('room_message','40000000-0000-4000-8000-000000000001') is null v"),'expired content denied before physical purge');
check(await scalar("select public.deleted_content_expiry_readiness()->>'physicalDeletionAllowed'='false' v"),'unsafe expiry permanently fail-closed');
await db.exec("update private.deleted_content_retention_settings set text_expiry_enabled=true; insert into public.legal_holds(target_type,target_id,status) values('room_message','40000000-0000-4000-8000-000000000001','active')");
const expire="select public.expire_deleted_content_text((select id from private.deleted_content_records where target_id='40000000-0000-4000-8000-000000000001'))->>'status' v";
check(await scalar(expire)==='held','backed active legal hold prevents expiry');
await db.exec("update public.legal_holds set status='released'");
check(await scalar(expire)==='purged','released hold after fixed expiry permits text purge without restarting clock');
await assert.rejects(db.exec("insert into public.legal_holds(target_type,target_id,status) values('room_message','40000000-0000-4000-8000-000000000001','active')"),/deletion_already_claimed/);checks++;
check(await scalar("select count(*)=1 v from private.deleted_content_expiry_claims where completed_at is not null"),'irreversible claim persists after deletion');
check(await scalar("select count(*)=1 v from private.deleted_content_retention_events where operation='purge'"),'purge mutation audit mandatory');
for(const [id,restored] of [['50000000-0000-4000-8000-000000000001',false],['50000000-0000-4000-8000-000000000002',true]]) {
  await db.exec(`insert into profile_posts values('${id}','${uid}','soft original',${restored?'null':"'2000-01-01'"},now());
    insert into private.deleted_content_records(target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
    values('profile_post','${id}','${uid}','{"body":"retained"}','soft',now()-interval '31 days',now()-interval '1 day');`);
  check(await scalar(`select public.expire_deleted_content_text((select id from private.deleted_content_records where target_id='${id}'))->>'status' v`)==='purged','soft archive expiry succeeds');
  check(await scalar(`select count(*)=${restored?1:0} v from profile_posts where id='${id}'`),restored?'restored current source never removed':'expired soft original removed with archive');
  check(await scalar(`select count(*)=0 v from private.deleted_content_records where target_id='${id}'`),'soft cleanup does not recapture or renew deleted record');
}
await db.exec('set role authenticated');
await assert.rejects(db.exec('select * from private.deleted_content_records'),/permission denied/);checks++;
await assert.rejects(db.exec(`select public.stage_deleted_content_media('creator_video','${vid}','s3','private','source')`),/permission denied/);checks++;
await db.exec('reset role');
check(await scalar("select count(*)>0 v from private.deleted_content_retention_events where operation='capture'"),'mutation capture audited');
// Construct a genuinely aged synthetic state without altering immutable records.
const mediaId='60000000-0000-4000-8000-000000000001',reserveId='60000000-0000-4000-8000-000000000002';
const key=`${uid}/${mediaId}/source.mp4`;
await db.exec(`insert into videos values('${mediaId}','${uid}','aged media','exact deleted body','cloudflare_r2','chillywood-media-origin','${key}','${key}',null);
insert into media_upload_reservations values('${reserveId}','creator_video','cloudflare_r2','chillywood-media-origin','${key}','${mediaId}','${uid}','verified',now(),now());`);
await db.query('select public.stage_deleted_content_media($1,$2,$3,$4,$5,$6)',['creator_video',mediaId,'cloudflare_r2','chillywood-media-origin',key,uid]);
const stageId=await scalar(`select id v from private.deleted_content_media_stages where target_id='${mediaId}'`);
await db.exec(`insert into private.deleted_content_records(target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
values('creator_video','${mediaId}','${uid}','{"title":"aged media","description":"exact deleted body"}','hard',now()-interval '31 days',now()-interval '1 day');
update private.deleted_content_media_stages set deletion_id=(select id from private.deleted_content_records where target_id='${mediaId}') where id='${stageId}';
update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false;
delete from videos where id='${mediaId}';
update private.deleted_content_retention_settings set capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true;`);
check(await scalar(`select private.deleted_media_retirement_binding('${stageId}')->>'supported'='true' v`),'actual registry certifies supported finalized key');
await db.exec(`insert into public.legal_holds(target_type,target_id,status) values('creator_video','${mediaId}','active')`);
const claimSql=`select public.claim_deleted_content_media_expiry('${stageId}') v`;
check((await scalar(claimSql)).status==='held','media claim honors backed legal hold');
await db.exec(`update public.legal_holds set status='released' where target_id='${mediaId}'`);
const claimed=await scalar(claimSql);
check(claimed.status==='claimed','actual retirement + expiry claims authorize permanently retired key');
check((await scalar(claimSql)).claimId===claimed.claimId,'media claim retry stable');
check(await scalar(`select content is null v from private.deleted_content_records where target_id='${mediaId}'`),'expired media text body purged at irreversible claim');
check((await scalar(`select public.read_deleted_content_media_expiry_claim('${claimed.claimId}') v`)).objectKey===key,'only service resolver returns exact claimed origin key');
await assert.rejects(db.exec(`insert into public.legal_holds(target_type,target_id,status) values('creator_video','${mediaId}','active')`),/deletion_already_claimed/);checks++;
await assert.rejects(db.exec(`insert into videos values('${mediaId}','${uid}','resurrect','bad','cloudflare_r2','chillywood-media-origin','${key}','${key}',null)`),/media_key_retired_reference_forbidden/);checks++;
check((await scalar(`select public.record_deleted_content_media_expiry_result('${claimed.claimId}','observed_absent') v`)).permanentlyAbsent===false,'404 receipt never claims impossible future bytes');
// Canonical legal-hold aliases must protect retained attachment parents too.
const roomParent='70000000-0000-4000-8000-000000000001', roomAttachment='70000000-0000-4000-8000-000000000002';
await db.exec(`insert into private.deleted_content_records(id,target_type,target_id,author,parent_type,parent_id,content,deletion_kind,deleted_at,expires_at)
values('${roomAttachment}','social_attachment','${roomAttachment}','${uid}','watch_party_room_message','${roomParent}',null,'hard',now()-interval '31 days',now()-interval '1 day');
insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,deletion_id,reservation_id)
values('${roomAttachment}','social_attachment','${roomAttachment}','${uid}','cloudflare_r2','chillywood-media-origin','synthetic-room-key','${roomAttachment}','${roomAttachment}');
insert into public.legal_holds(target_type,target_id,status) values('room_message','${roomParent}','active');`);
check((await scalar(`select public.claim_deleted_content_media_expiry('${roomAttachment}') v`)).status==='held','canonical room parent hold protects aged hard-deleted attachment before provider eligibility');
await db.exec(`update public.legal_holds set status='released' where target_id='${roomParent}';
insert into private.deleted_content_media_expiry_claims(stage_id,deletion_id,target_type,target_id,author,parent_type,parent_id,provider,bucket,object_key)
values('${roomAttachment}','${roomAttachment}','social_attachment','${roomAttachment}','${uid}','watch_party_room_message','${roomParent}','cloudflare_r2','chillywood-media-origin','synthetic-room-key');`);
await assert.rejects(db.exec(`insert into public.legal_holds(target_type,target_id,status) values('room_message','${roomParent}','active')`),/deletion_already_claimed/);checks++;
for(const [hold,parent] of [['room_message','watch_party_room_message'],['watch_party_room_message','room_message'],['video','creator_video'],['creator_video','video']]) {
 check(await scalar(`select private.deleted_content_hold_matches('${hold}','parent','social_attachment','attachment','author','${parent}','parent') v`),'hold aliases normalized symmetrically for parent');
}
// Bounded dispatch must advance past twenty blockers, and later retry them.
await db.exec('begin');
await db.exec(`insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 select 'text',id,now()+interval '1 day' from private.deleted_content_records;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 select 'media',id,now()+interval '1 day' from private.deleted_content_media_stages;
 update private.deleted_content_media_expiry_claims set next_check_at=now()-interval '1 day' where id='${claimed.claimId}';
 delete from private.deleted_content_work_dispatch where kind='media' and work_id='${stageId}';`);
const blockedIds=[];
for(let i=1;i<=21;i++) {
 const id=`80000000-0000-4000-8000-${String(i).padStart(12,'0')}`;blockedIds.push(id);
 await db.exec(`insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
 values('${id}','${i<=20?'social_attachment':'room_message'}','${id}','synthetic','{}','hard',now()-interval '${i<=20?40:31} days',now()-interval '${i<=20?10:1} days');`);
 if(i<=20) await db.exec(`insert into public.legal_holds(target_type,target_id,status) values('social_attachment','${id}','active');
 insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,deletion_id)
 values('${id}','social_attachment','${id}','synthetic','cloudflare_r2','chillywood-media-origin','synthetic-blocker-${i}','${id}','${id}');`);
}
const firstText=(await scalar('select public.list_deleted_content_expiry_work() v')).deletionIds;
check(firstText.length===20,'text batch bounded at twenty held records');
for(const id of firstText) assert.equal((await scalar(`select public.expire_deleted_content_text('${id}') v`)).status,'held');
const nextText=(await scalar('select public.list_deleted_content_expiry_work() v')).deletionIds;
check(nextText.includes(blockedIds[20]),'second text batch reaches twenty-first unheld record');
check((await scalar(`select public.expire_deleted_content_text('${blockedIds[20]}') v`)).status==='purged','twenty-first unheld text processed while blockers preserved');
const firstMedia=(await scalar('select public.list_deleted_content_media_expiry_work() v')).stageIds;
check(firstMedia.length===20,'media batch bounded at twenty held records');
for(const id of firstMedia) assert.equal((await scalar(`select public.claim_deleted_content_media_expiry('${id}') v`)).status,'held');
const nextMedia=(await scalar('select public.list_deleted_content_media_expiry_work() v')).stageIds;
check(nextMedia.includes(stageId),'second media batch reaches supported twenty-first original');
check((await scalar(`select public.claim_deleted_content_media_expiry('${stageId}') v`)).status==='claimed','supported twenty-first original processed without provider IO');
check(await scalar(`select count(*)=20 v from private.deleted_content_records where id=any(array[${blockedIds.slice(0,20).map(id=>`'${id}'::uuid`).join(',')}])`),'all held records remain intact');
await db.exec("update private.deleted_content_work_dispatch set next_attempt_at=now()-interval '1 minute' where kind in ('text','media')");
check((await scalar('select public.list_deleted_content_expiry_work() v')).deletionIds.length>0,'blocked text automatically eligible again after dispatch lease');
check((await scalar('select public.list_deleted_content_media_expiry_work() v')).stageIds.length>0,'blocked media automatically eligible again after dispatch lease');
await db.exec('rollback');
for(const isolation of ['repeatable read','serializable']) {
 for(const sql of [
   "insert into public.legal_holds(target_type,target_id,status) values('room_message','synthetic-unclaimed','active')",
   `select public.expire_deleted_content_text('${stageId}')`,
   `select public.claim_deleted_content_media_expiry('${stageId}')`,
   `select public.read_deleted_content_media_expiry_claim('${claimed.claimId}')`,
 ]){
   await db.exec(`begin isolation level ${isolation}`);
   await assert.rejects(db.exec(sql),/requires_read_committed/);checks++;
   await db.exec('rollback');
 }
}
console.log(`Deleted-content PGlite: ${checks} checks passed (synthetic SQL, not multi-session concurrency).`);
} finally {await db.close();}
