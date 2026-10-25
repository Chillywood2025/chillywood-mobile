// Disposable source-contract fixture. Actual retention and queue functions,
// reduced table schemas. Not native concurrency or provider-byte evidence.
import {readFileSync} from 'node:fs';
import {externalReferenceFixture} from './deleted-content-external-reference-fixture.mjs';
export const cutoverMigration='supabase/migrations/20261025055047_supabase_original_copy_cutover.sql';
export async function copyCutoverFixture(){
 const db=await externalReferenceFixture();
 await db.exec("set timezone='UTC'");
 await db.exec(`create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.role() returns text language sql as $$select auth.jwt()->>'role'$$;
 set request.jwt.claims='{"role":"service_role"}';
 create schema storage;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text,unique(bucket_id,name));
 alter table videos add column scan_provider text,add column scan_result text,add column scanned_at timestamptz,
  add column scan_error text,add column quarantined_at timestamptz,add column mime_type text,add column file_size_bytes bigint;
 alter table social_attachments add column scan_status text,add column scan_provider text,add column scan_result text,
  add column scanned_at timestamptz,add column scan_error text,add column quarantined_at timestamptz,
  add column mime_type text,add column size_bytes bigint;
 alter table media_scan_jobs add primary key(id),add column target_column text,add column target_id text,
  add column owner_user_id text,add column storage_provider text,add column storage_bucket text,
  add column mime_type text,add column size_bytes bigint default 0,add column priority integer default 100,
  add column claimed_by text,add column claimed_at timestamptz,add column completed_at timestamptz,
  add column scanner_provider text,add column scanner_version text,add column signature_version text,
  add column finding_name text,add column error_message text,add column metadata jsonb not null default '{}',
  add column created_at timestamptz default now(),add column updated_at timestamptz default now(),
  add unique(target_table,target_column,target_id,storage_bucket,storage_object_key);
 `);
 const queue=readFileSync('supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql','utf8');
 const section=(start,end)=>queue.slice(queue.indexOf(start),queue.indexOf(end));
 await db.exec(section('create or replace function public."enqueue_media_scan_job"(', 'create or replace function public."claim_media_scan_jobs"('));
 await db.exec(section('create or replace function public."queue_social_attachment_scan"()', 'create or replace function public."queue_profile_media_scan"()'));
 await db.exec(section('create or replace function public."queue_video_scan"()', 'create or replace function public."queue_video_rendition_scan"()'));
 const bytes=readFileSync('supabase/migrations/20261021134053_media_scan_exact_byte_receipts.sql','utf8');
 await db.exec(bytes.slice(bytes.indexOf('create function private.media_scan_byte_result_binding('),bytes.indexOf('create function public.begin_media_scan_byte_observation(')));
 db.historicalBodies=(await db.query(`select proname,prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='private' and proname='deleted_media_legacy_source_supported')
   or (n.nspname='public' and proname in ('has_verified_legacy_media_object_provenance','has_verified_legacy_video_object_provenance'))`)).rows;
 await db.exec(readFileSync(cutoverMigration,'utf8'));
 return db;
}
