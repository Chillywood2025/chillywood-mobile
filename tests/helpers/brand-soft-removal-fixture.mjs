import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installByteReceiptFixture} from './media-scan-byte-receipt-fixture.mjs';
import {applyBrandMigrationStatements} from './apply-brand-migration-statements.mjs';
export const readMigration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
export function scannerDefinition(name) {
 const sql=readMigration('20260530191115_media_malware_scanning_pipeline.sql');
 const start=sql.indexOf(`create or replace function public."${name}"(`);assert.ok(start>=0);
 return sql.slice(start,sql.indexOf('$$;',start)+3);
}
export async function installBrandSoftRemovalFixture(db) {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.session',true),'role',current_setting('request.jwt.claim.role',true))$$;
 create table auth.users(id uuid primary key,deleted_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text,created_at timestamptz default now(),last_accessed_at timestamptz,updated_at timestamptz default now(),path_tokens text[] generated always as (string_to_array(name,'/')) stored,metadata jsonb,unique(bucket_id,name));
 create table public.videos(id text primary key,owner_id text,visibility text,moderation_status text);
 create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text);
 create function public.whole_app_exact_current_session_authority_internal() returns boolean language sql as $$select true$$;
 create function public.has_active_premium_creator_tool_access(text) returns boolean language sql as $$select true$$;
 create function public.is_account_access_restricted(text) returns boolean language sql as $$select false$$;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
 await db.exec(readMigration('202605240001_platform_brand_studio_assets.sql'));
 await db.exec('create table public.platform_brand_publications(like public.platform_brand_profiles including all)');
 await installByteReceiptFixture(db);
 // Preserve the actual publication constraint so pending fixtures cannot model
 // a published object that the native migrated schema rejects.
 const authoritySql=readMigration('202608250002_whole_app_media_authority_closure.sql');
 const safetyStart=authoritySql.indexOf('create or replace function public.media_scan_public_safe(');
 assert.ok(safetyStart>=0);
 await db.exec(authoritySql.slice(safetyStart,authoritySql.indexOf('$$;',safetyStart)+3));
 const publicationStart=authoritySql.indexOf('alter table public.platform_brand_assets\n  add constraint platform_brand_assets_published_malware_clean_check');
 assert.ok(publicationStart>=0);
 await db.exec(authoritySql.slice(publicationStart,authoritySql.indexOf(';',publicationStart)+1));
 const scanner=readMigration('20260530191115_media_malware_scanning_pipeline.sql');
 const indexStart=scanner.indexOf('create unique index if not exists "media_scan_jobs_target_object_unique"');
 await db.exec(scanner.slice(indexStart,scanner.indexOf(';',indexStart)+1));
 for(const name of ['enqueue_media_scan_job','queue_platform_brand_asset_scan','enqueue_platform_brand_asset_scan'])await db.exec(scannerDefinition(name));
 for(const name of ['queue_platform_brand_asset_scan_before','enqueue_platform_brand_asset_scan_after']) {
  const start=scanner.indexOf(`create trigger "${name}"`);assert.ok(start>=0);
  await db.exec(scanner.slice(start,scanner.indexOf(';',start)+1));
 }
 const references=readMigration('20261020141554_deleted_media_reference_retirement.sql');
 for(const name of ['deleted_media_locator_columns','deleted_media_locator_document','deleted_media_normalize_locator','deleted_media_mentions','deleted_media_reference_identity']) {
  const start=references.indexOf('create function private.'+name+'(');assert.ok(start>=0);
  await db.exec(references.slice(start,references.indexOf('$$;',start)+3));
 }
 const holds=readMigration('20261020141458_deleted_content_retention.sql');
 const start=holds.indexOf('create function private.deleted_content_hold_matches(');
 await db.exec(holds.slice(start,holds.indexOf('$$;',start)+3));
 await applyBrandMigrationStatements(db,readMigration('20261021134043_platform_brand_exact_retention_lifecycle.sql'));
 await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
}
