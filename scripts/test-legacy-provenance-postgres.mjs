#!/usr/bin/env node
// Disposable PostgreSQL transaction tests, not provider/concurrency proof.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(); let checks=0;
const q=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
const check=(x,label)=>{assert.ok(x,label);checks++;};
const deny=async(fn,pattern)=>{await assert.rejects(fn,pattern); checks++;};
const id='20000000-0000-4000-8000-000000000001';
const owner='10000000-0000-4000-8000-000000000001';
try {
 await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
 create table public.videos(id uuid primary key,owner_id uuid,created_at timestamp without time zone,deleted_at timestamptz,
 storage_provider text,storage_bucket text,storage_object_key text,storage_path text,thumb_storage_path text,thumb_url text,playback_url text);
 create table public.social_attachments(id uuid primary key,owner_user_id uuid,created_at timestamptz,deleted_at timestamptz,
 surface_type text,surface_id uuid,storage_provider text,storage_bucket text,storage_object_key text,storage_path text);
 create table public.media_upload_reservations(id uuid,storage_provider text,storage_bucket text,storage_object_key text);
 create table private.deleted_media_key_retirements(object_key text);
create table private.media_object_storage_migration_audit(id bigserial primary key,table_name text,row_id text,status text,new_storage_provider text,new_storage_bucket text,new_storage_object_key text,row_before jsonb,row_after jsonb,copied_verified_at timestamptz default now());
 create table public.legal_holds(target_type text,target_id text,status text);`);
 const holdSql=readFileSync('supabase/migrations/20261020141458_deleted_content_retention.sql','utf8');
 await db.exec(holdSql.slice(holdSql.indexOf('create function private.deleted_content_hold_matches('),holdSql.indexOf('create function private.deleted_content_legal_hold_guard()')));
 await db.exec(readFileSync('supabase/migrations/20261021134020_deleted_media_legacy_provenance_adapter.sql','utf8').split('-- BEGIN LEGACY PROVENANCE\n')[1].split('-- BEGIN LEGACY RUNTIME\n')[0]);
 await db.query(`insert into videos(id,owner_id,created_at,storage_provider,storage_bucket,storage_object_key)
 values($1,$2,'2026-01-01Z','cloudflare_r2','chillywood-media-origin','legacy/video-one.mp4')`,[id,owner]);
 await db.query(`insert into private.media_object_storage_migration_audit(table_name,row_id,status,new_storage_provider,new_storage_bucket,new_storage_object_key,row_before,row_after) select 'videos',id::text,'updated',storage_provider,storage_bucket,storage_object_key,to_jsonb(v),to_jsonb(v) from videos v where id=$1`,[id]);
 const binding=(await q(`select private.read_deleted_media_legacy_source('creator_video',$1) b`,[id])).b;
 const evidence={binding,scanResult:'clean',scanOriginSha256:'a'.repeat(64),originSha256:'a'.repeat(64),
 ownershipEvidenceSha256:'b'.repeat(64),originSizeBytes:1234,scanEvidenceSha256:'c'.repeat(64),
 writerDrainEvidenceSha256:'d'.repeat(64),reviewedBy:'disposable-fixture-review'};
 const enroll=(b=binding,e=evidence)=>q(`select private.enroll_deleted_media_legacy_provenance('creator_video',$1,$2,$3) id`,[id,b,e]);
 await db.exec("set timezone='America/Los_Angeles'");
 check((await q(`select private.read_deleted_media_legacy_source('creator_video',$1) b`,[id])).b.createdAt===binding.createdAt,'timestamp without time zone incarnation stays exact across session zones');
 await db.exec("set timezone='UTC'");
 for(const key of ['legacy/quote"file.mp4','legacy/nonascii-é.mp4','backups/media-object-storage/secret.json','playback/public/file.mp4']) {
  await db.query('update videos set storage_object_key=$1 where id=$2',[key,id]);
  const bad=(await q(`select private.read_deleted_media_legacy_source('creator_video',$1) b`,[id])).b;
  await deny(()=>enroll(bad,{...evidence,binding:bad}),/locator_unsupported/);
 }
 await db.query('update videos set storage_object_key=$1 where id=$2',[binding.objectKey,id]);
 await db.exec("update private.media_object_storage_migration_audit set status='rolled_back'");
 await deny(()=>enroll(),/unique_migration_receipt_required/);
 await db.exec("update private.media_object_storage_migration_audit set status='updated'");
 await db.exec("update private.media_object_storage_migration_audit set row_before=jsonb_set(row_before,'{owner_id}','\"00000000-0000-0000-0000-000000000000\"')");
 await deny(()=>enroll(),/unique_migration_receipt_required/);
 await db.exec('update private.media_object_storage_migration_audit set row_before=row_after');
 await db.exec(`insert into private.media_object_storage_migration_audit(table_name,row_id,status,new_storage_provider,new_storage_bucket,new_storage_object_key,row_before,row_after) select table_name,row_id,status,new_storage_provider,new_storage_bucket,new_storage_object_key,row_before,row_after from private.media_object_storage_migration_audit`);
 await deny(()=>enroll(),/unique_migration_receipt_required/);
 await db.exec('delete from private.media_object_storage_migration_audit where id=(select max(id) from private.media_object_storage_migration_audit)');
 await deny(()=>enroll({...binding,author:id}),/source_changed/);
 await deny(()=>enroll(binding,{...evidence,scanResult:'manual_review'}),/evidence_mismatch/);
 await deny(()=>enroll(binding,{...evidence,scanOriginSha256:'e'.repeat(64)}),/evidence_mismatch/);
 await deny(()=>enroll(binding,{...evidence,ownershipEvidenceSha256:null}),/null value/);
 await db.exec(`insert into legal_holds values('user','${owner}','active')`);
 await deny(()=>enroll(),/legal_hold/);
 await db.exec('delete from legal_holds');
 await db.exec(`insert into legal_holds values('unknown_scope','unrelated','active')`);
 await deny(()=>enroll(),/legal_hold/);
 await db.exec('delete from legal_holds');
 await db.exec(`insert into media_upload_reservations values(gen_random_uuid(),'cloudflare_r2','chillywood-media-origin','legacy/video-one.mp4')`);
 await deny(()=>enroll(),/reservation_conflict/);
 await db.exec('delete from media_upload_reservations');
 await db.exec(`insert into private.deleted_media_key_retirements values('legacy/video-one.mp4')`);
 await deny(()=>enroll(),/retirement_conflict/);
 await db.exec('delete from private.deleted_media_key_retirements');
 await db.exec('begin');
 const enrolled=(await enroll()).id;
 check(Boolean(enrolled),'explicit evidence creates distinct ledger identity');
 check((await q('select count(*)::int n from media_upload_reservations')).n===0,'no fabricated reservation');
 const guard=(await q('select private.validate_deleted_media_legacy_provenance($1) g',[enrolled])).g;
 check(guard.supported===false && guard.bindingMatches===true && guard.physicalDeletionAllowed===false,'matching evidence is NOT claim authority');
 await db.exec('rollback');
 check((await q('select count(*)::int n from private.deleted_media_legacy_provenance')).n===0,'enrollment rolls back atomically');
 const permanent=(await enroll()).id;
 check((await enroll()).id===permanent,'exact retry is idempotent');
 await deny(()=>enroll(binding,{...evidence,reviewedBy:'changed'}),/enrollment_conflict/);
 await deny(()=>db.exec('update private.deleted_media_legacy_provenance set reviewed_by=reviewed_by'),/provenance_permanent/);
 await deny(()=>db.exec('delete from private.deleted_media_legacy_provenance'),/provenance_permanent/);
 await deny(()=>db.exec('truncate private.deleted_media_legacy_provenance'),/provenance_permanent/);
 await db.query(`update videos set created_at='2026-02-01Z' where id=$1`,[id]);
 check((await q('select private.validate_deleted_media_legacy_provenance($1) g',[permanent])).g.reason==='legacy_provenance_source_changed','same ID new incarnation does not inherit proof');
 await db.query('delete from videos where id=$1',[id]);
 await deny(()=>q('select private.validate_deleted_media_legacy_provenance($1)',[permanent]),/live_source_required/);
 check((await q('select count(*)::int n from private.deleted_media_legacy_provenance')).n===1,'source deletion cannot erase ledger');
 for(const role of ['anon','authenticated','service_role']) {
  check(!(await q(`select has_function_privilege($1,'private.enroll_deleted_media_legacy_provenance(text,uuid,jsonb,jsonb)','execute') v`,[role])).v,`${role} cannot enroll`);
  check(!(await q(`select has_table_privilege($1,'private.deleted_media_legacy_provenance','select') v`,[role])).v,`${role} cannot read ledger`);
 }
 check((await q(`select relrowsecurity and relforcerowsecurity v from pg_class where oid='private.deleted_media_legacy_provenance'::regclass`)).v,'RLS forced');
 console.log(`PASS ${checks} legacy provenance PostgreSQL checks (ledger component; full adapter tested separately).`);
} finally {await db.close();}
