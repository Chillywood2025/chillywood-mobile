#!/usr/bin/env node
// Real migration execution in disposable PGlite. No provider access or fake
// production evidence; synthetic scan/due dates exist only inside this fixture.
import assert from 'node:assert/strict';
import {applyBrandMigrationStatements} from '../tests/helpers/apply-brand-migration-statements.mjs';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { installByteReceiptFixture, createByteReceipt } from '../tests/helpers/media-scan-byte-receipt-fixture.mjs';
const db = new PGlite();
let checks = 0;
const q = async (sql, params=[]) => (await db.query(sql, params)).rows[0];
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const deny = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
const migration = '20261021030421_platform_brand_exact_retention_lifecycle.sql';
const owner = '10000000-0000-4000-8000-000000000001';
const read = name => readFileSync('supabase/migrations/'+name,'utf8');
try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage; create schema private;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.session',true),'role',current_setting('request.jwt.claim.role',true))$$;
 create table auth.users(id uuid primary key,deleted_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text,created_at timestamptz default now(),last_accessed_at timestamptz,updated_at timestamptz default now(),path_tokens text[] generated always as (string_to_array(name,'/')) stored,metadata jsonb,unique(bucket_id,name));
 create table public.videos(id text primary key,owner_id text,visibility text,moderation_status text);
 create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text,metadata jsonb not null default '{}'::jsonb);
 create table public.brand_url_consumers(id uuid primary key default gen_random_uuid(),media_url text,metadata jsonb);
 create table public.brand_hold_shape_counterexample(id uuid primary key default gen_random_uuid(),target_type text,metadata jsonb);
 create function public.whole_app_exact_current_session_authority_internal() returns boolean language sql as $$select current_setting('test.authority',true)='true'$$;
 create function public.has_active_premium_creator_tool_access(text) returns boolean language sql as $$select coalesce(current_setting('test.premium',true),'true')<>'false'$$;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create function public.is_account_access_restricted(text) returns boolean language sql as $$select false$$;`);
 await db.exec(read('202605240001_platform_brand_studio_assets.sql'));
 await db.exec('create table public.platform_brand_publications(like public.platform_brand_profiles including all);');
 await installByteReceiptFixture(db);
 // The reference recognizers are the ACTUAL currently migrated definitions.
 const referenceSql = read('20261020141554_deleted_media_reference_retirement.sql');
 for (const name of ['deleted_media_locator_columns','deleted_media_locator_document','deleted_media_normalize_locator','deleted_media_mentions','deleted_media_reference_identity']) {
   const start = referenceSql.indexOf('create function private.'+name+'(');
   const end = referenceSql.indexOf('$$;',start)+3;
   assert.ok(start>=0 && end>start); await db.exec(referenceSql.slice(start,end));
 }
 const holdsSql=read('20261020141458_deleted_content_retention.sql');
 const holdStart=holdsSql.indexOf('create function private.deleted_content_hold_matches(');
 await db.exec(holdsSql.slice(holdStart,holdsSql.indexOf('$$;',holdStart)+3));
 const legacyId='20000000-0000-4000-8000-000000000001';
 const legacyKey='platform_rachi_official/logo/legacy.png';
 await db.query(`insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'legacy-v1')`,[legacyKey]);
 await db.query(`insert into platform_brand_assets(id,owner_user_id,asset_type,asset_state,storage_object_key,storage_path,mime_type,moderation_status)
 values($1,'platform_rachi_official','logo','published',$2,$2,'image/png','clean')`,[legacyId,legacyKey]);
 // Legacy aliases are retained, not guessed into a one-owner object proof.
 await db.query(`insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,deleted_at)
 values('20000000-0000-4000-8000-000000000002','different-legacy-owner','logo',$1,'different-legacy-owner/alias.png','image/png','2020-01-01')`,[legacyKey]);
 const policiesBefore=(await db.query(`select policyname,qual,with_check from pg_policies where tablename in ('platform_brand_assets','platform_brand_profiles','objects') order by policyname`)).rows;
 // Negative control: the real lock outside migration-owned BEGIN must fail.
 await deny(()=>db.exec('lock table public.platform_brand_assets, storage.objects in share row exclusive mode;'), error=>error.code==='25P01');
 await applyBrandMigrationStatements(db,read(migration));
 await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
 check((await q("select count(*)::int n from pg_trigger where tgrelid='public.legal_holds'::regclass and tgfoid in ('private.guard_platform_brand_retention_hold()'::regprocedure,'private.guard_platform_brand_retention_references()'::regprocedure) and tgenabled in ('O','A')")).n,2,'actual metadata-bearing hold has BOTH guards');
 for (const isolation of ['repeatable read','serializable']) {
  await db.exec(`begin isolation level ${isolation}`);
  const h=(await q("insert into public.legal_holds(target_type,target_id,status) values('room_message',gen_random_uuid()::text,'active') returning id")).id; checks++;
  await db.query("update public.legal_holds set target_type='chat_message',status='released' where id=$1",[h]); checks++;
  check((await q('select status from public.legal_holds where id=$1',[h])).status,'released','actual unrelated UPDATE executes under both guards');
  await db.exec('rollback');
  await db.exec(`begin isolation level ${isolation}`);
  await deny(()=>db.exec("insert into public.brand_hold_shape_counterexample(target_type,metadata) values('room_message','{}')"),/brand_retention_read_committed_required/);
  await db.exec('rollback');
  for(const scope of ['account','platform_brand_asset','unknown_scope']){
   await db.exec(`begin isolation level ${isolation}`);
   await deny(()=>db.query("insert into public.legal_holds(target_type,target_id,status) values($1,gen_random_uuid()::text,'active')",[scope]),/brand_retention_read_committed_required/);
   await db.exec('rollback');
  }
  for(const metadata of [{locator:legacyKey},{unknown:true}]){
   await db.exec(`begin isolation level ${isolation}`);
   await deny(()=>db.query("insert into public.legal_holds(target_type,target_id,status,metadata) values('room_message',gen_random_uuid()::text,'active',$1)",[metadata]),/brand_retention_read_committed_required/);
   await db.exec('rollback');
  }
  for(const prior of [{scope:'account',metadata:{}},{scope:'platform_brand_asset',metadata:{}},{scope:'unknown_scope',metadata:{}},{scope:'room_message',metadata:{unknown:true}}]){
   const id=(await q("insert into public.legal_holds(target_type,target_id,status,metadata) values($1,gen_random_uuid()::text,'released',$2) returning id",[prior.scope,prior.metadata])).id;
   await db.exec(`begin isolation level ${isolation}`);
   await deny(()=>db.query("update public.legal_holds set target_type='room_message',metadata='{}'::jsonb where id=$1",[id]),/brand_retention_read_committed_required/);
   await db.exec('rollback');await db.query('delete from public.legal_holds where id=$1',[id]);
  }
 }
 await deny(()=>db.query("insert into public.legal_holds(target_type,target_id,status,metadata) values('room_message',gen_random_uuid()::text,'active',$1)",[{unknown:legacyKey}]),/brand_retained_reference_forbidden/);
 // A new locator column, even NULL, cannot silently inherit the exception.
 await db.exec('alter table public.legal_holds add column future_media_url text');
 for(const isolation of ['repeatable read','serializable']){
  await db.exec(`begin isolation level ${isolation}`);
  await deny(()=>db.exec("insert into public.legal_holds(target_type,target_id,status) values('room_message',gen_random_uuid()::text,'active')"),/brand_retention_read_committed_required/);
  await db.exec('rollback');
 }
 await db.exec('alter table public.legal_holds drop column future_media_url');



 check((await db.query(`select policyname,qual,with_check from pg_policies where tablename in ('platform_brand_assets','platform_brand_profiles','objects') order by policyname`)).rows,policiesBefore,'existing read/session/owner predicates unchanged');
 check((await q('select owner_id from private.platform_brand_object_incarnations where asset_id=$1',[legacyId])).owner_id,'platform_rachi_official','official TEXT owner retained');
 check((await q('select count(*)::int n from private.platform_brand_object_proofs')).n,0,'migration never copies a legacy scan or fabricates evidence');
 check((await q('select count(*)::int n from private.platform_brand_object_incarnations where object_key=$1',[legacyKey])).n,2,'shared legacy object keys do not abort migration');
 check((await q("select removal_clock from private.platform_brand_object_incarnations where asset_id='20000000-0000-4000-8000-000000000002'")).removal_clock,'legacy_unknown_conservative_observation','historical deletion time is explicitly unknown');
 check((await q("select public.read_platform_brand_retention_binding('20000000-0000-4000-8000-000000000002') b")).b,null,'conflicting-owner alias never gets physical proof');
 check((await q('select asset_state from platform_brand_assets where id=$1',[legacyId])).asset_state,'published','published asset preserved');
 await deny(()=>db.query('delete from storage.objects where name=$1',[legacyKey]),/brand_storage_attached_incarnation_fenced/);
 await deny(()=>db.query("update storage.objects set version='replaced' where name=$1",[legacyKey]),/brand_storage_attached_incarnation_fenced/);
 await deny(()=>db.query("update platform_brand_assets set owner_user_id='changed' where id=$1",[legacyId]),/brand_retention_asset_identity_immutable/);
 await db.query('update storage.objects set last_accessed_at=clock_timestamp(),updated_at=clock_timestamp() where name=$1',[legacyKey]); checks++;
 await deny(()=>db.query("update storage.objects set metadata='{\"size\":999}'::jsonb where name=$1",[legacyKey]),/brand_storage_attached_incarnation_fenced/);
 await db.exec("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets','unattached/upload.png','v1'); delete from storage.objects where name='unattached/upload.png';"); checks++;
 const fixture=async ({provider='supabase'}={}) => {
   const id=(await q('select gen_random_uuid() id')).id, key=`${owner}/logo/${id}.png`;
   if(provider==='supabase') await db.query(`insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v1')`,[key]);
   await db.query(`insert into platform_brand_assets(id,owner_user_id,asset_type,storage_provider,storage_object_key,storage_path,mime_type) values($1,$2,'logo',$3,$4,$4,'image/png')`,[id,owner,provider,key]);
   const binding=(await q('select public.read_platform_brand_retention_binding($1) b',[id])).b;
   return {id,key,binding};
 };
 const f=await fixture();
 const replacement=await fixture();
 check((await q('select count(*)::int n from platform_brand_assets where id=any($1::uuid[])',[ [f.id,replacement.id] ])).n,2,'replacement uploads use fresh keys and preserve old asset');
 await db.query('insert into platform_brand_profiles(owner_user_id,logo_asset_id) values($1,$2)',[owner,f.id]);
 await db.query('update platform_brand_profiles set logo_asset_id=$1 where owner_user_id=$2',[replacement.id,owner]);
 check((await q('select deleted_at from platform_brand_assets where id=$1',[f.id])).deleted_at,null,'switching draft reference does not delete old object');
 const {receipt,job}=await createByteReceipt(db,{assetId:f.id});
 const proof={originSha256:'a'.repeat(64),originSizeBytes:23,scanReceiptId:receipt};
 const record=(binding=f.binding,p=proof)=>q('select public.record_platform_brand_retention_proof($1,$2,$3) r',[f.id,binding,p]);
 await deny(()=>record({...f.binding,storageVersion:'old'}),/current_incarnation_required/);
 await deny(()=>record(f.binding,{...proof,originSha256:'c'.repeat(64)}),/fresh_bound_scan_required/);
 await deny(()=>record(f.binding,{...proof,scanReceiptId:'00000000-0000-4000-8000-000000000000'}),/fresh_bound_scan_required/);
 await record(); await record(); checks+=2;
 await deny(()=>record(f.binding,{...proof,originSizeBytes:99}),/fresh_bound_scan_required/);
 await deny(()=>db.exec('delete from private.platform_brand_object_proofs'),/identity_permanent/);
 await deny(()=>db.exec('truncate private.platform_brand_object_incarnations cascade'),/identity_permanent/);
 await db.query('update platform_brand_assets set deleted_at=$2 where id=$1',[f.id,'2020-01-01']);
 check((await q('select deleted_at>now()-interval \'1 minute\' recent from platform_brand_assets where id=$1',[f.id])).recent,true,'client cannot backdate removal');
 check((await q("select retain_until-removed_at=interval '720 hours' exact from private.platform_brand_object_incarnations where asset_id=$1",[f.id])).exact,true,'fixed 720 hour retention');
 await deny(()=>db.query('update platform_brand_assets set deleted_at=null where id=$1',[f.id]),/tombstone_permanent/);
 await deny(()=>db.query('delete from platform_brand_assets where id=$1',[f.id]),/soft_delete_required/);
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r.status,'disabled','default inactive');
 await db.exec("update private.platform_brand_retention_settings set expiry_enabled=true,writer_drain_evidence_sha256=repeat('e',64),reference_review_evidence_sha256=repeat('f',64)");
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r.status,'not_due','not due');
 // Synthetic clock only in disposable DB; exact actual claim code remains live.
 const age=async id=> { await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable');
 await db.query("update private.platform_brand_object_incarnations set removed_at=statement_timestamp()-interval '721 hours',retain_until=statement_timestamp()-interval '1 hour' where asset_id=$1",[id]);
 await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable'); };
 await age(f.id);
 await db.query("insert into legal_holds(target_type,target_id,status) values('account',$1,'active')",[owner]);
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r.status,'held','account hold blocks');
 await db.exec('delete from legal_holds');
 // Existing references, introduced before deletion, cannot be assumed absent.
 const g=await fixture(); await db.query('insert into brand_url_consumers(media_url) values($1)',[`https://example.invalid/${g.key}`]);
 await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[g.id]); await age(g.id);
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[g.id])).r.status,'references_or_coverage_blocked','old URL reference blocks');
 await deny(()=>db.query('insert into brand_url_consumers(metadata) values($1)',[{url:`https://example.invalid/${f.key.replaceAll('/','%2F')}`}]),/retained_reference_forbidden/);
 await db.exec('create table public.new_brand_locator(id uuid,media_url text)');
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r.status,'references_or_coverage_blocked','uncovered future table blocks');
 await db.exec('drop table public.new_brand_locator');
 await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r.status,'required_guard_unavailable','disabled writer metadata fence blocks claims');
 await db.exec('alter table storage.objects enable trigger aaa_platform_brand_storage_incarnation');
 const c=(await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r;
 check(c.status,'claimed','qualified exact claim');
 check(c.storageObjectId,f.binding.storageObjectId,'exact storage incarnation returned');
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[f.id])).r.claimToken,c.claimToken,'idempotent claim');
 await deny(()=>db.query("insert into legal_holds(target_type,target_id,status) values('platform_brand_asset',$1,'active')",[f.id]),/preservation_unavailable/);
 await deny(()=>db.query('insert into platform_brand_publications(owner_user_id,logo_asset_id) values($1,$2)',[owner,f.id]),/claimed_profile_reference_forbidden/);
 await db.exec(`grant usage on schema storage,auth to authenticated; grant select,delete on storage.objects to authenticated; alter table storage.objects enable row level security;
 select set_config('test.user','${owner}',false); set role authenticated;`);
 await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
 await deny(()=>db.query('delete from storage.objects where name=$1',[f.key]),/incarnation_fenced/);
 await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false)");
 check((await q('select public.finish_platform_brand_retention_expiry($1,$2) r',[f.id,c.claimToken])).r.status,'still_present','no premature receipt');
 await deny(()=>q('select public.finish_platform_brand_retention_expiry($1,gen_random_uuid()) r',[f.id]),/exact_claim_required/);
 await db.query('delete from storage.objects where name=$1',[f.key]); checks++;
 check((await q('select public.finish_platform_brand_retention_expiry($1,$2) r',[f.id,c.claimToken])).r,{status:'metadata_absent',providerAbsenceVerified:false},'metadata absence not fabricated provider proof');
 await deny(()=>db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v2')",[f.key]),/incarnation_fenced/);
 await deny(()=>db.query('update private.platform_brand_object_incarnations set storage_version=\'v2\' where asset_id=$1',[f.id]),/identity_permanent/);
 const s3=await fixture({provider:'s3'}); check(s3.binding,null,'S3 cannot pretend Supabase authority');
 await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[s3.id]); await age(s3.id);
 check((await q('select public.claim_platform_brand_retention_expiry($1) r',[s3.id])).r.status,'unproven_incarnation','unsupported provider stays blocked');
 check((await q("select has_function_privilege('authenticated','public.record_platform_brand_retention_proof(uuid,jsonb,jsonb)','EXECUTE') allowed")).allowed,false,'clients cannot attest scans');
 check((await q("select has_function_privilege('anon','public.claim_platform_brand_retention_expiry(uuid)','EXECUTE') allowed")).allowed,false,'anonymous cannot claim');
 const removable=await fixture(), session='30000000-0000-4000-8000-000000000003';
 await db.query('insert into auth.users(id) values($1)',[owner]);
 await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 hour')",[session,owner]);
 await db.query("select set_config('test.user',$1,false),set_config('test.session',$2,false),set_config('test.authority','true',false)",[owner,session]);
 await db.exec("select set_config('test.premium','false',false)");
 await deny(()=>q('select public.remove_platform_brand_asset($1) r',[removable.id]),/current_owner_access_required/);
 await db.exec("select set_config('test.premium','true',false)");
 await deny(()=>q('select public.remove_platform_brand_asset($1) r',[legacyId]),/owner_required/);
 const removed=(await q('select public.remove_platform_brand_asset($1) r',[removable.id])).r;
 check((await q('select public.remove_platform_brand_asset($1) r',[removable.id])).r,removed,'RPC retry preserves original tombstone');
 await db.exec("select set_config('test.authority','false',false)");
 await deny(()=>q('select public.remove_platform_brand_asset($1) r',[replacement.id]),/current_session_required/);
 check((await q('select deleted_at from platform_brand_assets where id=$1',[replacement.id])).deleted_at,null,'expired-session failure rolls back untouched replacement');
 console.log(`Platform brand retention: ${checks} migrated PostgreSQL controls passed. Provider bytes and multi-session concurrency are not simulated.`);
} finally { await db.close(); }
