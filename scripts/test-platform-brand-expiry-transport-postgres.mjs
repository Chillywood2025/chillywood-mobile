#!/usr/bin/env node
// Transport successor migration in disposable PGlite. No provider access or fake
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
const migration = '20261021134043_platform_brand_exact_retention_lifecycle.sql';
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
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text,created_at timestamptz default now(),last_accessed_at timestamptz,metadata jsonb,unique(bucket_id,name));
 create table public.videos(id text primary key,owner_id text,visibility text,moderation_status text);
 create table public.legal_holds(id uuid primary key default gen_random_uuid(),target_type text,target_id text,status text);
 create table public.brand_url_consumers(id uuid primary key default gen_random_uuid(),media_url text,metadata jsonb);
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
 await applyBrandMigrationStatements(db,read(migration));
 await applyBrandMigrationStatements(db,read('20261021134104_platform_brand_exact_expiry_transport.sql'));
 await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
 const fixture=async()=>{
   const id=(await q('select gen_random_uuid() id')).id,key=`${owner}/logo/${id}.png`;
   await db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v1')",[key]);
   await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type) values($1,$2,'logo',$3,$3,'image/png')",[id,owner,key]);
   const binding=(await q('select public.read_platform_brand_retention_binding($1) b',[id])).b;
   const {receipt,job}=await createByteReceipt(db,{assetId:id});
   await q('select public.record_platform_brand_retention_proof($1,$2,$3)',[id,binding,{originSha256:'a'.repeat(64),originSizeBytes:23,scanReceiptId:receipt}]);
   await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[id]);
   return {id,key,binding,receipt,job};
 };
 const age=async id=>{
   await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable');
   await db.query("update private.platform_brand_object_incarnations set removed_at=statement_timestamp()-interval '721 hours',retain_until=statement_timestamp()-interval '1 hour' where asset_id=$1",[id]);
   await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable');
 };
 const begin=async id=>(await q('select public.begin_platform_brand_retention_transport($1) r',[id])).r;
 const readClaim=async(id,token)=>(await q('select public.read_platform_brand_retention_expiry_claim($1,$2) r',[id,token])).r;
 const isolated=async work=>{await db.exec('begin');try{await work();}finally{await db.exec('rollback');}};
 const f=await fixture();
 check((await begin(f.id)).status,'transport_unqualified_or_disabled','transport initially disabled');
 await db.exec("update private.platform_brand_retention_settings set expiry_enabled=true,writer_drain_evidence_sha256=repeat('e',64),reference_review_evidence_sha256=repeat('f',64)");
 check((await begin(f.id)).status,'transport_unqualified_or_disabled','ordinary retention qualification is not provider contract evidence');
 await db.exec("update private.platform_brand_retention_settings set provider_origin='https://fixture.supabase.co',provider_contract_sha256=repeat('c',64),version_delete_verified=true");
 check((await begin(f.id)).status,'not_due','qualified transport cannot shorten 720h');
 await age(f.id);
 await db.query("insert into legal_holds(target_type,target_id,status) values('platform_brand_asset',$1,'active')",[f.id]);
 check((await begin(f.id)).status,'held','hold wins before first claim');
 await db.exec('delete from legal_holds');
 const claim=await begin(f.id);
 check(claim.status,'claimed','actual qualified first claim');
 check(claim.storageObjectId,f.binding.storageObjectId,'claim preserves actual metadata incarnation');
 const token=claim.claimToken;
 const authority=await readClaim(f.id,token);
 check(authority.status,'authorized','exact token authorizes qualified transport');
 check(authority.metadataPresent,true,'initial metadata still present');
 check(authority.permanentlyAbsent,false,'authorization never claims absence');
 check(authority.providerOrigin,'https://fixture.supabase.co','exact qualified origin returned');
 check(authority.providerContractSha256,'c'.repeat(64),'contract evidence returned');
 check(authority.storageVersion,'v1','exact object version returned');
 check((await readClaim(f.id,'00000000-0000-4000-8000-000000000000')).status,'claim_unavailable','wrong token denied');
 const unclaimed=await fixture(); await age(unclaimed.id);
 check((await readClaim(unclaimed.id,token)).status,'claim_unavailable','token cannot cross assets');
 await isolated(async()=>{
   await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');
   await db.query('delete from storage.objects where name=$1',[unclaimed.key]);
   await db.exec('alter table storage.objects enable trigger aaa_platform_brand_storage_incarnation');
   check((await begin(unclaimed.id)).status==='claimed',false,'absent metadata recovery cannot qualify an initial claim');
   check((await q('select count(*)::int n from private.platform_brand_expiry_claims where asset_id=$1',[unclaimed.id])).n,0,'failed absent initial admission creates no claim');
 });
 await deny(()=>q('select public.record_platform_brand_retention_transport_result($1,gen_random_uuid(),$2)',[f.id,'failed']),/exact_claim_required/);
 await deny(()=>q('select public.record_platform_brand_retention_transport_result($1,$2,$3)',[f.id,token,'permanently_absent']),/outcome_invalid/);
 await isolated(async()=>{
   await db.exec('update private.platform_brand_retention_settings set expiry_enabled=false');
   check((await begin(f.id)).status,'transport_unqualified_or_disabled','disabled switch blocks claim recovery');
   check((await readClaim(f.id,token)).status,'disabled','disabled switch blocks token use');
 });
 await isolated(async()=>{
   await db.exec('update private.platform_brand_retention_settings set version_delete_verified=false');
   check((await readClaim(f.id,token)).status,'provider_contract_unqualified','unqualified version contract blocks token use');
 });
 await isolated(async()=>{
   await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');
   check((await readClaim(f.id,token)).status,'required_guard_unavailable','disabled metadata fence fails closed');
 });
 await deny(()=>db.query("insert into legal_holds(target_type,target_id,status) values('platform_brand_asset',$1,'active')",[f.id]),/preservation_unavailable/);
 await isolated(async()=>{
   // Simulate a hold arriving through an independently preserved historical path;
   // reenabling the real trigger before readback tests the transport recheck.
   await db.exec('alter table legal_holds disable trigger aaa_platform_brand_retention_hold');
   await db.query("insert into legal_holds(target_type,target_id,status) values('platform_brand_asset',$1,'active')",[f.id]);
   await db.exec('alter table legal_holds enable trigger aaa_platform_brand_retention_hold');
   check((await readClaim(f.id,token)).status,'held','existing claim does not bypass hold recheck');
 });
 await deny(()=>db.query('insert into brand_url_consumers(media_url) values($1)',[f.key]),/retained_reference_forbidden/);
 await isolated(async()=>{
   await db.exec('alter table brand_url_consumers disable trigger zzz_platform_brand_retention_reference');
   await db.query('insert into brand_url_consumers(media_url) values($1)',[f.key]);
   await db.exec('alter table brand_url_consumers enable trigger zzz_platform_brand_retention_reference');
   check((await readClaim(f.id,token)).status,'references_or_coverage_blocked','exact claim does not bypass persisted references');
 });
 await isolated(async()=>{
   await db.exec('create table public.brand_new_url_consumer(media_url text)');
   check((await readClaim(f.id,token)).status,'references_or_coverage_blocked','new uncovered locator table fails closed');
 });
 await isolated(async()=>{
   await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');
   await db.query("update storage.objects set version='replacement-generation' where name=$1",[f.key]);
   await db.exec('alter table storage.objects enable trigger aaa_platform_brand_storage_incarnation');
   check((await readClaim(f.id,token)).status==='authorized',false,'different storage version cannot use old transport authority');
 });
 for(const outcome of ['failed','delete_acknowledged','observed_absent']) {
   const result=(await q('select public.record_platform_brand_retention_transport_result($1,$2,$3) r',[f.id,token,outcome])).r;
   check(result.permanentlyAbsent,false,`${outcome} never fabricates permanent physical absence`);
 }
 await deny(()=>db.exec("update private.platform_brand_expiry_transport_results set outcome='observed_absent'"),/identity_permanent/);
 check((await q('select count(*)::int n from private.platform_brand_expiry_claims where asset_id=$1',[f.id])).n,1,'single durable exact claim');
 // Crash after metadata deletion, before result recording. No provider request is
 // simulated: recovery must retain original authority without claiming absence.
 await db.query('delete from storage.objects where name=$1',[f.key]);
 check((await q('select public.read_platform_brand_retention_binding($1) b',[f.id])).b,null,'ordinary binding correctly requires live metadata');
 const recovered=await begin(f.id);
 check(['claimed','authorized'].includes(recovered.status),true,'begin recovers durable claim after metadata deletion');
 check(recovered.claimToken,token,'recovery retains exact original token');
 const afterCrash=await readClaim(f.id,token);
 check(afterCrash.status,'authorized','exact claim survives metadata deletion');
 check(afterCrash.metadataPresent,false,'metadata absence reported only as metadata');
 check(afterCrash.permanentlyAbsent,false,'crash recovery cannot fabricate physical absence');
 check(afterCrash.storageObjectId,f.binding.storageObjectId,'recovery never invents new object identity');
 check(afterCrash.storageVersion,f.binding.storageVersion,'recovery never invents new object generation');
 await isolated(async()=>{
   await db.exec('update private.platform_brand_retention_settings set expiry_enabled=false');
   check((await begin(f.id)).status,'transport_unqualified_or_disabled','crash recovery still honors stop');
 });
 await isolated(async()=>{
   await db.exec('alter table media_scan_jobs disable trigger zzz_platform_brand_retention_reference');
   await db.query('update media_scan_jobs set attempt_count=attempt_count+1 where id=$1',[f.job]);
   await db.exec('alter table media_scan_jobs enable trigger zzz_platform_brand_retention_reference');
   check((await begin(f.id)).status==='claimed',false,'crash recovery rejects changed scan attempt');
 });
 await isolated(async()=>{
   await db.query("update platform_brand_assets set scan_status='quarantined' where id=$1",[f.id]);
   check((await readClaim(f.id,token)).status==='authorized',false,'crash recovery rejects changed current scan result');
 });
 await isolated(async()=>{
   await db.query('delete from media_scan_jobs where id=$1',[f.job]);
   check((await readClaim(f.id,token)).status==='authorized',false,'missing original scan job cannot authorize crash recovery');
 });

 check((await readClaim(f.id,'00000000-0000-4000-8000-000000000000')).status,'claim_unavailable','wrong token stays denied after metadata deletion');
 check((await q('select count(*)::int n from private.platform_brand_expiry_claims where asset_id=$1',[f.id])).n,1,'recovery never creates second claim');
 await deny(()=>db.query("insert into storage.objects(bucket_id,name,version) values('platform-brand-assets',$1,'v2')",[f.key]),/incarnation_fenced/);
 check((await q("select has_function_privilege('authenticated','public.begin_platform_brand_retention_transport(uuid)','EXECUTE') allowed")).allowed,false,'client cannot begin transport');
 check((await q("select has_function_privilege('anon','public.read_platform_brand_retention_expiry_claim(uuid,uuid)','EXECUTE') allowed")).allowed,false,'anonymous cannot read transport authority');
 const legacy=await fixture();await age(legacy.id);const legacyClaim=await begin(legacy.id);
 await db.exec('update private.platform_brand_retention_settings set expiry_enabled=false');
 await applyBrandMigrationStatements(db,read('20261025111212_platform_brand_expiry_observation_recovery.sql'));
 await db.exec('update private.platform_brand_retention_settings set expiry_enabled=true');
 const prepare=async(id,t)=>(await q('select public.prepare_platform_brand_retention_dispatch($1,$2) r',[id,t])).r;
 check((await prepare(legacy.id,legacyClaim.claimToken)).status,'observe_only','legacy no-result claim cannot replay unknown dispatch');
 check((await prepare(f.id,token)).status,'observe_only','legacy acknowledged missing claim remains read-only');
 check((await q('select reason from private.platform_brand_expiry_dispatch_intents where claim_token=$1',[legacyClaim.claimToken])).reason,'legacy_unknown_history','migration preserves explicit unknown reason');
 const fresh=await fixture();await age(fresh.id);const freshClaim=await begin(fresh.id);
 check((await readClaim(fresh.id,freshClaim.claimToken)).observationOnly,false,'new guarded claim starts eligible');
 check((await prepare(fresh.id,freshClaim.claimToken)).status,'dispatch_authorized','first confirmed intent alone grants dispatch');
 check((await prepare(fresh.id,freshClaim.claimToken)).status,'observe_only','intent persists before any result');
 check((await readClaim(fresh.id,freshClaim.claimToken)).deleteAcknowledged,false,'intent is not acknowledgement');
 await isolated(async()=>{await q('select public.record_platform_brand_retention_transport_result($1,$2,$3)',[fresh.id,freshClaim.claimToken,'delete_acknowledged']);});
 check((await prepare(fresh.id,freshClaim.claimToken)).status,'observe_only','rolled-back acknowledgement does not reset intent');
 await deny(()=>db.exec('delete from private.platform_brand_expiry_dispatch_intents'),/identity_permanent/);
 await deny(()=>db.exec('truncate private.platform_brand_expiry_dispatch_intents'),/identity_permanent/);
 await deny(()=>db.exec("update private.platform_brand_expiry_dispatch_intents set reason='dispatch_intent'"),/identity_permanent/);
 for(const role of ['anon','authenticated'])check((await q(`select has_function_privilege('${role}','public.prepare_platform_brand_retention_dispatch(uuid,uuid)','EXECUTE') allowed`)).allowed,false,`${role} cannot authorize dispatch`);
 check((await q("select has_table_privilege('service_role','private.platform_brand_expiry_dispatch_intents','INSERT') allowed")).allowed,false,'service cannot manufacture intents directly');
 check((await prepare(fresh.id,'00000000-0000-4000-8000-000000000000')).status,'claim_unavailable','wrong token denied');
 await isolated(async()=>{await db.exec('update private.platform_brand_retention_settings set expiry_enabled=false');check((await prepare(fresh.id,freshClaim.claimToken)).status,'disabled','marker does not bypass stop');});
 await isolated(async()=>{await db.exec('alter table storage.objects disable trigger aaa_platform_brand_storage_incarnation');check((await prepare(fresh.id,freshClaim.claimToken)).status,'required_guard_unavailable','marker does not bypass guard parity');});
 console.log(`Brand expiry transport: ${checks} actual migrated SQL controls passed; no provider calls or physical absence claims.`);
} finally { await db.close(); }
