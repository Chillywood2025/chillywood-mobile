#!/usr/bin/env node
// Disposable SQL integration fixture; not provider or multi-session proof.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();let checks=0;
const q=async(sql,p=[]) => (await db.query(sql,p)).rows[0];
const check=(v,label)=>{assert.ok(v,label);checks++;};
const deny=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const owner='10000000-0000-4000-8000-000000000001';
const target='20000000-0000-4000-8000-000000000001';
try {
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table auth.users(id uuid primary key);
create table public.platform_role_memberships(user_id text,role text);
create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text,placed_by_user_id text,released_by_user_id text);
create table public.profile_posts(id uuid primary key,user_id text,body text,created_at timestamptz default now(),deleted_at timestamptz,updated_at timestamptz);
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

await db.exec(`
alter table media_scan_jobs add column attempt_count integer default 0,add column max_attempts integer default 3,add column target_table text;
alter table videos alter column created_at type timestamp without time zone;
alter table social_attachments add column created_at timestamptz default now();
alter table video_renditions add column video_id uuid, add column owner_id uuid,add column quality_label text,add column storage_bucket text;
alter table media_renditions add column video_id uuid,add column source_type text,add column source_id text;
create table media_transcode_jobs(id uuid,source_type text,source_id text);
create table media_security_audit_events(action text constraint media_security_audit_events_action_check check(action in ('delete_object')));
create schema if not exists private;
create table private.media_object_storage_migration_audit(id bigserial primary key,table_name text,row_id text,status text,new_storage_provider text,new_storage_bucket text,new_storage_object_key text,row_before jsonb,row_after jsonb,copied_verified_at timestamptz default now());
create function public.has_verified_legacy_media_object_provenance(text,text,text,text,text) returns boolean language sql as $$select true$$;
create function public.revoke_media_object_delivery(text,text,text,text,uuid,text,text,text) returns jsonb language plpgsql as $$begin raise exception 'reservation_path_must_not_be_used';end$$;
`);
for(const file of [
 '20261020141458_deleted_content_retention.sql','20261020141554_deleted_media_reference_retirement.sql',
 '20261020141633_deleted_content_media_expiry.sql','20261020201310_deleted_content_stage_recovery.sql',
 '20261020201322_deleted_content_activation_readiness.sql','20261020201336_deleted_content_delete_intent.sql',
 '20261020201937_deleted_content_terminal_source_cleanup.sql']) {
 try {await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));} catch(e){console.error('migration',file);throw e;}
}
await db.exec(readFileSync('supabase/migrations/20261021134020_deleted_media_legacy_provenance_adapter.sql','utf8'));

await db.query(`insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key)
 values($1,$2,'2026-01-01','cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4')`,[target,owner]);
await db.query(`insert into private.media_object_storage_migration_audit(table_name,row_id,status,new_storage_provider,new_storage_bucket,new_storage_object_key,row_before,row_after) select 'videos',id::text,'updated',storage_provider,storage_bucket,storage_object_key,to_jsonb(v),to_jsonb(v) from videos v where id=$1`,[target]);
const binding=(await q(`select private.read_deleted_media_legacy_source('creator_video',$1) b`,[target])).b;
const evidence={binding,scanResult:'clean',scanOriginSha256:'a'.repeat(64),originSha256:'a'.repeat(64),
 ownershipEvidenceSha256:'b'.repeat(64),originSizeBytes:1234,scanEvidenceSha256:'c'.repeat(64),
 writerDrainEvidenceSha256:'d'.repeat(64),reviewedBy:'disposable-fixture-review'};
const enrollment=(await q(`select private.enroll_deleted_media_legacy_provenance('creator_video',$1,$2,$3) id`,[target,binding,evidence])).id;
check((await q(`select private.deleted_content_source_coverage('creator_video',to_jsonb(v)) c from videos v where id=$1`,[target])).c==='eligible_r2_original','legacy exact provenance eligible without fake reservation');
await db.exec("set time zone 'America/Los_Angeles'");
check((await q(`select private.deleted_content_source_coverage('creator_video',to_jsonb(v)) c from videos v where id=$1`,[target])).c==='eligible_r2_original','video audit serialization is timezone independent');
check((await q(`select private.enroll_deleted_media_legacy_provenance('creator_video',$1,$2,$3) id`,[target,binding,evidence])).id===enrollment,'video enrollment retry remains exact across timezones');
await db.exec("set time zone 'UTC'");

check((await q(`select public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','upload') r`)).r.allowed===false,'enrolled key cannot be overwritten even while retention disabled');
// Nullable live rendition fields must be negative evidence, never SQL UNKNOWN
// that disappears under NOT alias in both source coverage and global readiness.
for (const [column,value] of [['storage_bucket',null],['storage_path',null],['owner_id',null],['quality_label',null]]) {
 await db.exec('begin');
 await q(`insert into video_renditions(video_id,owner_id,quality_label,storage_bucket,storage_path)
 values($1,$2,'original','chillywood-media-origin','originals/legacy-one.mp4')`,[target,owner]);
 await q(`update video_renditions set ${column}=$1`,[value]);
 check((await q(`select private.deleted_content_original_rendition_alias(to_jsonb(r),to_jsonb(v)) a
 from video_renditions r join videos v on v.id=r.video_id`)).a===false,`nullable ${column} cannot be an original alias`);
 check((await q(`select private.deleted_content_source_coverage('creator_video',to_jsonb(v)) c from videos v where id=$1`,[target])).c==='secondary_media_uncovered',`nullable ${column} remains uncovered secondary media`);
 check((await q(`select public.deleted_content_expiry_readiness() r`)).r.secondaryMediaSourceCount===1,`nullable ${column} blocks global readiness`);
 await db.exec('rollback');
}
await db.exec(`update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification set source_revision=repeat('0',40),client_enforcement_evidence='disposable fixture',
legacy_delete_drain_evidence='disposable fixture',worker_schedule_evidence='disposable fixture',origin_cleanup_evidence='disposable fixture',qualified_at=clock_timestamp();
select public.record_deleted_content_worker_heartbeat();
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;`);
await db.exec('begin');
await q(`select private.stage_deleted_content_media_internal('creator_video',$1,'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4')`,[target]);
const stagedBeforeAuditRollback=await q('select id from private.deleted_content_media_stages');
await db.exec("update private.media_object_storage_migration_audit set status='rolled_back'");
await deny(()=>q('select private.revoke_deleted_media_legacy_delivery($1)',[stagedBeforeAuditRollback.id]),/revocation_active_audit_required/);
await db.exec('rollback');
await db.exec(`insert into media_upload_reservations(id,storage_provider,storage_bucket,storage_object_key,status)
 values(gen_random_uuid(),'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','deleted')`);
await deny(()=>db.query('delete from videos where id=$1',[target]),/legacy_delivery_revocation_staged_binding_required/);
check((await q('select count(*)::int n from private.deleted_media_key_retirements')).n===0,'competing reservation rolls back staging and capture');
check((await q('select count(*)::int n from videos')).n===1,'failed revocation preserves live source');
await db.exec('delete from media_upload_reservations');
await db.query('delete from videos where id=$1',[target]);
check((await q('select count(*)::int n from media_upload_reservations')).n===0,'capture does not fabricate reservation');
check((await q('select count(*)::int n from private.deleted_media_legacy_delivery_revocations')).n===1,'capture atomically revokes delivery');
const retired=await q('select * from private.deleted_media_key_retirements');
check(retired.legacy_provenance_id===enrollment && retired.reservation_id===null && retired.status==='retained','tagged retirement finalized');
check(retired.inspection_proof===null,'legacy does not fabricate retained inspection authority');
check((await q('select public.claim_deleted_content_media_expiry($1) r',[retired.stage_id])).r.status==='not_due','30 day deadline remains enforced');
check((await q('select private.deleted_media_retirement_binding($1) r',[retired.stage_id])).r.supported===true,'finalized immutable legacy binding verified');
await deny(()=>db.query(`insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key)
 values($1,$2,'2026-01-01','cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4')`,[target,owner]),/retired_reference_forbidden|legacy_provenance_cannot_admit_new_source/);
await db.exec('update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false,text_expiry_enabled=false');
check((await q(`select public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','read') r`)).r.allowed===false,'runtime stop never reopens ordinary delivery');
check((await q(`select public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','upload') r`)).r.allowed===false,'runtime stop never reopens writes');
const revokeRetry=(await q('select private.revoke_deleted_media_legacy_delivery($1) r',[retired.stage_id])).r;
check(revokeRetry.revoked===true && revokeRetry.alreadyRevoked===true,'exact durable revocation retry survives source deletion and runtime stop');
check((await q('select count(*)::int n from private.deleted_media_legacy_delivery_revocations')).n===1,'revocation retry creates no duplicate receipt');
check((await q('select count(*)::int n from media_upload_reservations')).n===0,'revocation retry never fabricates a reservation');
check((await q(`select public.check_legacy_media_delivery_revocation('cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4') r`)).r.revoked===true,'separate delivery fence denies the permanently revoked key');
check((await q(`select public.check_legacy_media_delivery_revocation('s3','other-bucket','originals/legacy-one.mp4') r`)).r.revoked===true,'alternate provider or bucket cannot launder revoked logical key');
check((await q(`select public.check_legacy_media_delivery_revocation(null,'chillywood-media-origin','other/key') r`)).r.revoked===true,'malformed tuple fails closed');
check((await q(`select public.check_legacy_media_delivery_revocation('cloudflare_r2','chillywood-media-origin','other/key') r`)).r.revoked===false,'deny-only fence distinguishes untouched keys without granting media authority');
check((await q(`select status from private.media_object_storage_migration_audit limit 1`)).status==='updated','revocation preserves original migration evidence');
check((await q(`select public.has_verified_legacy_media_object_provenance('videos',$1,'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4') v`,[target])).v===false,'historical updated audit cannot restore revoked delivery');
check((await q(`select public.has_verified_legacy_media_object_provenance(' videos ',$1,' cloudflare_r2 ',' chillywood-media-origin ',' originals/legacy-one.mp4 ') v`,[target])).v===false,'legacy helper normalization cannot bypass permanent denial');
await deny(()=>db.exec('update private.deleted_media_legacy_delivery_revocations set revoked_at=clock_timestamp()'),/revocation_permanent/);
await deny(()=>db.exec('delete from private.deleted_media_legacy_delivery_revocations'),/revocation_permanent/);
await deny(()=>db.exec('truncate private.deleted_media_legacy_delivery_revocations'),/revocation_permanent/);
await deny(()=>q('select private.revoke_deleted_media_legacy_delivery(gen_random_uuid())'),/revocation_binding_required/);
await db.exec('begin');
await db.query('update private.deleted_content_media_stages set author=$1 where id=$2',[target,retired.stage_id]);
await deny(()=>q('select private.revoke_deleted_media_legacy_delivery($1)',[retired.stage_id]),/revocation_binding_required/);
await db.exec('rollback');
await db.exec('begin isolation level repeatable read');
await deny(()=>q('select private.revoke_deleted_media_legacy_delivery($1)',[retired.stage_id]),/requires_read_committed/);
await db.exec('rollback');
for(const role of ['anon','authenticated','service_role']) {
 check(!(await q(`select has_function_privilege($1,'private.revoke_deleted_media_legacy_delivery(uuid)','execute') v`,[role])).v,`${role} cannot acquire revocation authority directly`);
 check(!(await q(`select has_table_privilege($1,'private.deleted_media_legacy_delivery_revocations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') v`,[role])).v,`${role} cannot mutate or read private revocation receipts`);
 check((await q(`select has_function_privilege($1,'public.check_legacy_media_delivery_revocation(text,text,text)','execute') v`,[role])).v===(role==='service_role'),`${role} has only intended deny-only check privilege`);
}
check((await q(`select relrowsecurity and relforcerowsecurity v from pg_class where oid='private.deleted_media_legacy_delivery_revocations'::regclass`)).v,'revocation ledger forces RLS');
// Enrollment itself is permanent source identity even before capture begins.
const inactiveTarget='20000000-0000-4000-8000-000000000099';
await db.query(`insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key)
 values($1,$2,'2026-01-01','cloudflare_r2','chillywood-media-origin','originals/inactive-enrolled.mp4')`,[inactiveTarget,owner]);
await db.query(`insert into private.media_object_storage_migration_audit(table_name,row_id,status,new_storage_provider,new_storage_bucket,new_storage_object_key,row_before,row_after)
 select 'videos',id::text,'updated',storage_provider,storage_bucket,storage_object_key,to_jsonb(v),to_jsonb(v) from videos v where id=$1`,[inactiveTarget]);
const inactiveBinding=(await q(`select private.read_deleted_media_legacy_source('creator_video',$1) b`,[inactiveTarget])).b;
await q(`select private.enroll_deleted_media_legacy_provenance('creator_video',$1,$2,$3)`,[inactiveTarget,inactiveBinding,{...evidence,binding:inactiveBinding}]);
await deny(()=>db.query(`update videos set created_at=created_at+interval '1 second' where id=$1`,[inactiveTarget]),/legacy_provenance_binding_immutable/);
await db.query(`update videos set storage_object_key='originals/replacement-not-enrolled.mp4' where id=$1`,[inactiveTarget]);
await deny(()=>db.query(`update videos set storage_object_key='originals/inactive-enrolled.mp4' where id=$1`,[inactiveTarget]),/legacy_provenance_binding_immutable/);
await db.query('delete from videos where id=$1',[inactiveTarget]);
await deny(()=>db.query(`insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key)
 values($1,$2,'2026-01-01','cloudflare_r2','chillywood-media-origin','originals/inactive-enrolled.mp4')`,[inactiveTarget,owner]),/legacy_provenance_cannot_admit_new_source/);
// Match the real timestamptz attachment schema, including audit JSON originally
// produced in a different zone and capture called with externally built JSON.
const social='20000000-0000-4000-8000-000000000088';
await db.exec("set time zone 'America/Los_Angeles'");
await q(`insert into social_attachments(id,owner_user_id,surface_type,surface_id,created_at,storage_provider,storage_bucket,storage_object_key)
 values($1,$2,'profile_post',$3,'2026-01-01T00:00:00.123456+00:00','cloudflare_r2','chillywood-media-origin','originals/social-zone.mp4')`,[social,owner,target]);
await q(`insert into private.media_object_storage_migration_audit(table_name,row_id,status,new_storage_provider,new_storage_bucket,new_storage_object_key,row_before,row_after)
 select 'social_attachments',id::text,'updated',storage_provider,storage_bucket,storage_object_key,to_jsonb(v),to_jsonb(v) from social_attachments v where id=$1`,[social]);
const socialBinding=(await q(`select private.read_deleted_media_legacy_source('social_attachment',$1) b`,[social])).b;
const socialEvidence={...evidence,binding:socialBinding};
const socialEnrollment=(await q(`select private.enroll_deleted_media_legacy_provenance('social_attachment',$1,$2,$3) id`,[social,socialBinding,socialEvidence])).id;
for(const zone of ['UTC','Asia/Kolkata','America/Los_Angeles']) {
 await db.exec(`set time zone '${zone}'`);
 check(JSON.stringify((await q(`select private.read_deleted_media_legacy_source('social_attachment',$1) b`,[social])).b)===JSON.stringify(socialBinding),'attachment binding canonical across '+zone);
 check((await q(`select private.enroll_deleted_media_legacy_provenance('social_attachment',$1,$2,$3) id`,[social,socialBinding,socialEvidence])).id===socialEnrollment,'attachment exact enrollment retry across '+zone);
 check((await q(`select private.deleted_content_source_coverage('social_attachment',to_jsonb(v)) c from social_attachments v where id=$1`,[social])).c==='eligible_r2_original','external source JSON canonical across '+zone);
 await q(`update social_attachments set storage_path=storage_path where id=$1`,[social]);
}
await q(`insert into profile_posts(id,user_id,body) values($1,$2,'fixture parent')`,[target,owner]);
await db.exec("update private.deleted_content_retention_settings set capture_enabled=true,media_staging_enabled=true");
await db.exec('begin');
await q(`update social_attachments set deleted_at=clock_timestamp() where id=$1`,[social]);
const unsupportedSoft=await q(`select deletion_id from private.deleted_media_key_retirements where legacy_provenance_id=$1`,[socialEnrollment]);
check((await q(`select private.deleted_content_soft_media_coverage($1) r`,[unsupportedSoft.deletion_id])).r===false,'live parent keeps direct attachment soft archive unsupported');
await db.exec('rollback');
await q(`delete from profile_posts where id=$1`,[target]);
await db.exec("set time zone 'America/Los_Angeles'");
await q(`update social_attachments set deleted_at=clock_timestamp() where id=$1`,[social]);
const socialRetired=await q(`select * from private.deleted_media_key_retirements where legacy_provenance_id=$1`,[socialEnrollment]);
check(socialRetired.status==='retained','social capture finalizes under non-UTC session');
await db.exec("set time zone 'Asia/Kolkata'");
check((await q(`select private.deleted_media_retirement_binding($1) r`,[socialRetired.stage_id])).r.supported===true,'social finalized retirement survives timezone change');
check((await q(`select private.deleted_content_soft_media_coverage($1) r`,[socialRetired.deletion_id])).r===true,'social soft recovery binds canonical incarnation across zones');
await db.exec("set time zone 'UTC'");
// The actual actor RPC is the sole retry authority: no live row/reservation
// and no service-role key-presence acknowledgement is substituted for it.
await db.exec(`create or replace function auth.uid() returns uuid language sql as $$select nullif(current_setting('fixture.actor',true),'')::uuid$$;
create function public.whole_app_exact_current_session_authority_internal() returns boolean language sql as $$select current_setting('fixture.session',true)='true'$$;
select set_config('fixture.session','true',false);`);
await q(`select set_config('fixture.actor',$1,false)`,[owner]);
check((await q(`select public.delete_retained_content('creator_video',$1,'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','2026-01-01T00:00:00Z') r`,[target])).r.status==='already_deleted','exact owner actor RPC acknowledges finalized legacy retry');
await q(`select set_config('fixture.actor',$1,false)`,[target]);
await deny(()=>q(`select public.delete_retained_content('creator_video',$1,'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','2026-01-01T00:00:00Z')`,[target]),/source_binding_changed/);
await q(`select set_config('fixture.actor',$1,false)`,[owner]);
await deny(()=>q(`select public.delete_retained_content('creator_video',$1,'cloudflare_r2','chillywood-media-origin','originals/no-receipt.mp4','2026-01-01T00:00:00Z')`,[target]),/source_binding_changed/);
await deny(()=>q(`select public.delete_retained_content('creator_video',$1,'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','2026-01-02T00:00:00Z')`,[target]),/source_binding_changed/);
await db.exec("select set_config('fixture.session','false',false)");
await deny(()=>q(`select public.delete_retained_content('creator_video',$1,'cloudflare_r2','chillywood-media-origin','originals/legacy-one.mp4','2026-01-01T00:00:00Z')`,[target]),/current_session_required/);
console.log(`PASS ${checks} legacy runtime integration checks (disposable fixture only)`);
} finally {await db.close();}
