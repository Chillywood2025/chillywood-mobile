import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDatabase,splitSQL} from './helpers/database-runtime-authority-fixture.mjs';
import {applyBrandMigrationStatements} from './helpers/apply-brand-migration-statements.mjs';

const genericDispatchDefinition=file=>{
 const marker='create or replace function public.list_deleted_content_expiry_work()';
 const statements=splitSQL(readFileSync(file,'utf8')).filter(sql=>sql.includes(marker));
 assert.equal(statements.length,1,'one authoritative generic dispatcher definition');
 return statements[0].slice(statements[0].indexOf(marker)).trim();
};
const genericDispatch=genericDispatchDefinition('supabase/migrations/20261025033057_platform_brand_global_retention_integration.sql');

test('Brand integration changes the existing generic dispatcher only by excluding Brand archives',()=>{
 const predecessor=genericDispatchDefinition('supabase/migrations/20261020201310_deleted_content_stage_recovery.sql');
 const expected=predecessor.replace('where r.expires_at<=',"where r.target_type<>'platform_brand_asset' and r.expires_at<=");
 assert.notEqual(expected,predecessor,'the exact Brand filter must be present');
 assert.equal(genericDispatch,expected,'preserve every non-Brand branch, gate, lease and function attribute');
});

// Full actual migration composition, not an isolated Brand implementation.
// Auth/storage infrastructure is the existing local PGlite test double; all
// scanner/Brand/global functions and guards are actual source SQL. No provider.
test('global Brand integration preserves exact lifecycle, admission and independent qualification', {timeout:240000}, async t=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 const readiness=async()=> (await q('select public.deleted_content_expiry_readiness() r')).r;
 const work=async()=> (await q('select public.list_platform_brand_retention_expiry_work() r')).r;
 const owner='platform_rachi_official';
 const fixture=async()=>{
  const id=randomUUID(),key=`${owner}/global/${id}.png`,objectId=randomUUID();
  await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'v1','{\"size\":23}')",[objectId,key]);
  await db.query("insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'logo',$3,$3,'image/png',23)",[id,owner,key]);
  const job=(await q("select id from media_scan_jobs where target_table='platform_brand_assets' and target_id=$1 order by created_at desc limit 1",[id])).id;
  return {id,key,objectId,job};
 };
 const prove=async f=>{
  await db.query('update media_scan_jobs set priority=-2147483648 where id=$1',[f.job]);
  await db.query("select * from claim_media_scan_jobs(1,'global-brand-fixture')");
  const attempt=(await q('select attempt_count from media_scan_jobs where id=$1',[f.job])).attempt_count;
  const observation=(await q("select begin_media_scan_byte_observation($1,'global-brand-fixture',$2) id",[f.job,attempt])).id;
  const result=(await q("select complete_media_scan_job($1,'clean','clamav','ClamAV fixture','daily/fixture',null,null,1) r",[f.job])).r;
  assert.equal(result.targetPropagationComplete,true);
  const receipt=(await q("select record_media_scan_byte_receipt($1,$2,'global-brand-fixture',$3,23) id",[observation,f.job,'a'.repeat(64)])).id;
  const binding=(await q('select read_platform_brand_retention_binding($1) r',[f.id])).r;
  const proof={scanReceiptId:receipt,originSha256:'a'.repeat(64),originSizeBytes:23};
  await db.query('select record_platform_brand_retention_proof($1,$2,$3)',[f.id,binding,proof]);
  return {...f,receipt,binding,proof};
 };
 const coverage=async id=>(await q('select private.deleted_content_brand_source_coverage(to_jsonb(a)) c from platform_brand_assets a where id=$1',[id])).c;
 const age=async id=>{
  // Synthetic time travel only in this disposable database. Never production
  // evidence. Preserve the exact original 720-hour relationship everywhere.
  await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable');
  await db.query("update private.platform_brand_object_incarnations set removed_at=removed_at-interval '721 hours',retain_until=retain_until-interval '721 hours' where asset_id=$1",[id]);
  await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable');
  await db.exec('alter table public.platform_brand_assets disable trigger aaa_platform_brand_retention');
  await db.query('update platform_brand_assets a set deleted_at=r.removed_at from private.platform_brand_object_incarnations r where a.id=r.asset_id and a.id=$1',[id]);
  await db.exec('alter table public.platform_brand_assets enable trigger aaa_platform_brand_retention');
  await db.exec('alter table private.deleted_content_brand_delegations disable trigger brand_delegation_immutable; alter table private.deleted_content_records disable trigger deleted_content_immutable');
  await db.query('update private.deleted_content_brand_delegations b set removed_at=r.removed_at,retain_until=r.retain_until from private.platform_brand_object_incarnations r where b.asset_id=r.asset_id and r.asset_id=$1',[id]);
  await db.query('update private.deleted_content_records d set deleted_at=b.removed_at,expires_at=b.retain_until from private.deleted_content_brand_delegations b where d.id=b.deletion_id and b.asset_id=$1',[id]);
  await db.exec('alter table private.deleted_content_brand_delegations enable trigger brand_delegation_immutable; alter table private.deleted_content_records enable trigger deleted_content_immutable');
 };
 try {
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  await t.test('all gates stay off and grants remain service-only',async()=>{
   assert.equal((await readiness()).flags.capture_enabled,false);
   assert.deepEqual(await work(),{enabled:false,qualified:false,assetIds:[],limit:25});
   assert.deepEqual((await q('select expiry_enabled,version_delete_verified,batch_enabled from private.platform_brand_retention_settings')),
    {expiry_enabled:false,version_delete_verified:false,batch_enabled:false});
   for(const role of ['anon','authenticated']){
    assert.equal((await q("select has_function_privilege($1,'public.list_platform_brand_retention_expiry_work()','EXECUTE') allowed",[role])).allowed,false);
    assert.equal((await q("select has_function_privilege($1,'public.begin_platform_brand_retention_batch_transport(uuid)','EXECUTE') allowed",[role])).allowed,false);
   }
   for(const name of ['platform_brand_retention_work_dispatch','platform_brand_retention_worker_health','deleted_content_brand_delegations']){
    assert.deepEqual(await q('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['private.'+name]),{relrowsecurity:true,relforcerowsecurity:true});
   }
  });
  await db.exec(readFileSync('tests/fixtures/deleted-content-local-qualification.sql','utf8'));
  await db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true');
  let f;
  await t.test('enabled admission permits exact pending upload bootstrap without inventing clean proof',async()=>{
   f=await fixture();
   assert.equal((await q('select scan_status from platform_brand_assets where id=$1',[f.id])).scan_status,'pending_scan');
   assert.equal(await coverage(f.id),'brand_scan_proof_required');
   let r=await readiness();
   assert.equal(r.platformBrandUncoveredIncarnationCount,0);
   assert.equal(r.platformBrandMissingCurrentScanProofCount,1);
   assert.ok(r.blockers.includes('platform_brand_exact_scan_proof_incomplete'));
   assert.ok(!r.blockers.includes('platform_brand_media_not_covered'));
   assert.equal(r.sourceAdmissionGuardCoverage,true);
   f=await prove(f);
   assert.equal(await coverage(f.id),'brand_verified_original');
   assert.equal(f.binding.ownerId,owner,'non-UUID owner text preserved');
   r=await readiness();
   assert.equal(r.platformBrandMissingCurrentScanProofCount,0);
   assert.ok(r.blockers.includes('platform_brand_transport_not_qualified'));
   assert.equal(r.ready,false,'proof does not manufacture provider qualification');
  });
  await t.test('publication references and legal holds are not unsupported protocol coverage',async()=>{
   await db.query('insert into platform_brand_profiles(owner_user_id,logo_asset_id) values($1,$2)',[owner,f.id]);
   assert.equal(await coverage(f.id),'brand_verified_original');
   await assert.rejects(db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[f.id]),/brand_asset_in_use/);
   await db.query('update platform_brand_profiles set logo_asset_id=null where owner_user_id=$1',[owner]);
   await db.query("insert into legal_holds(target_type,target_id,status,placed_by_user_id,reason) values('account',$1,'active','fixture','Synthetic preservation fixture')",[owner]);
   assert.equal(await coverage(f.id),'brand_verified_original');
  });
  let deletionId,clock;
  await t.test('capture binds the existing immutable Brand clock and text worker delegates',async()=>{
   await db.query("update platform_brand_assets set deleted_at='2020-01-01' where id=$1",[f.id]);
   clock=await q('select removed_at,retain_until from private.platform_brand_object_incarnations where asset_id=$1',[f.id]);
   const d=await q("select * from private.deleted_content_records where target_type='platform_brand_asset' and target_id=$1",[f.id]);
   deletionId=d.id;
   assert.equal(d.author,owner); assert.equal(d.content,null); assert.equal(d.media_disposition,'delegated_brand_original');
   assert.deepEqual(d.deleted_at,clock.removed_at); assert.deepEqual(d.expires_at,clock.retain_until);
   assert.equal((await q("select retain_until-removed_at=interval '720 hours' exact from private.platform_brand_object_incarnations where asset_id=$1",[f.id])).exact,true);
   const repeated=(await q('select private.capture_deleted_content_row(\'platform_brand_asset\',to_jsonb(a),true) id from platform_brand_assets a where id=$1',[f.id])).id;
   assert.equal(repeated,deletionId);
   assert.deepEqual(await q('select removed_at,retain_until from private.platform_brand_object_incarnations where asset_id=$1',[f.id]),clock);
   const delegated=(await q('select expire_deleted_content_text($1) r',[deletionId])).r;
   assert.equal(delegated.status,'delegated_brand_lifecycle'); assert.equal(delegated.assetId,f.id);
   assert.equal((await q("select count(*)::int n from private.deleted_content_expiry_claims where target_id=$1",[f.id])).n,0);
   await assert.rejects(db.exec('delete from private.deleted_content_brand_delegations'),/identity_permanent/);
   await assert.rejects(db.query('update platform_brand_assets set deleted_at=null where id=$1',[f.id]),/tombstone_permanent/);
  });
  await t.test('qualified due reader is bounded, separated, throttled and still hold/scan gated',async()=>{
   await age(f.id);
   assert.deepEqual((await work()).assetIds,[],'no unqualified scheduling');
   await db.exec("update private.platform_brand_retention_settings set batch_enabled=true,version_delete_verified=true,provider_origin='https://fixture.supabase.invalid',provider_contract_sha256=repeat('c',64),writer_drain_evidence_sha256=repeat('d',64),reference_review_evidence_sha256=repeat('e',64)");
   await db.exec('select record_platform_brand_retention_worker_heartbeat(false,true)');
   assert.ok((await readiness()).blockers.includes('platform_brand_expiry_not_enabled'),'qualified disabled probe cannot conceal the independent off switch');
   await db.exec('update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false,media_expiry_enabled=false,activation_ready=false');
   await assert.rejects(db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true'),/platform_brand_expiry_not_enabled/);
   await db.exec('update private.platform_brand_retention_settings set expiry_enabled=true');
   await db.exec('select record_platform_brand_retention_worker_heartbeat(false,true)');
   await db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true');
   let w=await work(); assert.deepEqual(w,{enabled:true,qualified:true,assetIds:[f.id],limit:25});
   assert.deepEqual((await work()).assetIds,[],'dispatch prevents immediate duplicate batch');
   assert.equal((await q('select begin_platform_brand_retention_batch_transport($1) r',[f.id])).r.status,'held');
   await db.query("delete from legal_holds where target_type='account' and target_id=$1",[owner]);
   const c=(await q('select begin_platform_brand_retention_batch_transport($1) r',[f.id])).r;
   assert.equal(c.status,'claimed');
   assert.equal((await q('select read_platform_brand_retention_batch_claim($1,$2) r',[f.id,c.claimToken])).r.status,'authorized');
   await db.exec('update private.platform_brand_retention_settings set batch_enabled=false');
   assert.equal((await q('select read_platform_brand_retention_batch_claim($1,$2) r',[f.id,c.claimToken])).r.status,'batch_disabled_or_unqualified');
   assert.equal((await q('select prepare_platform_brand_retention_batch_dispatch($1,$2) r',[f.id,c.claimToken])).r.status,'batch_disabled_or_unqualified','gate changed after read prevents final intent');
   assert.equal((await q('select count(*)::int n from private.platform_brand_expiry_dispatch_intents where asset_id=$1',[f.id])).n,0);
   await db.exec('update private.platform_brand_retention_settings set batch_enabled=true');
   await db.query("update private.platform_brand_retention_work_dispatch set next_attempt_at=clock_timestamp()-interval '1 second' where asset_id=$1",[f.id]);
   assert.equal((await q('select read_platform_brand_retention_batch_claim($1,$2) r',[f.id,c.claimToken])).r.status,'batch_dispatch_unavailable');
   assert.equal((await q('select prepare_platform_brand_retention_batch_dispatch($1,$2) r',[f.id,c.claimToken])).r.status,'batch_dispatch_unavailable','expired dispatch fence prevents final intent');
   assert.deepEqual((await work()).assetIds,[f.id],'crash becomes retryable without extending retain_until');
   assert.equal((await q('select prepare_platform_brand_retention_batch_dispatch($1,$2) r',[f.id,c.claimToken])).r.status,'dispatch_authorized','batch has its own fully guarded final authorization');
   assert.equal((await q('select prepare_platform_brand_retention_batch_dispatch($1,$2) r',[f.id,c.claimToken])).r.status,'observe_only','batch never reauthorizes uncertain prior dispatch');
   assert.deepEqual((await q('select list_deleted_content_expiry_work() r')).r.deletionIds,[],'generic text queue does not spin on Brand tombstones');
   await db.query('delete from storage.objects where id=$1',[f.objectId]);
   assert.equal((await q('select read_platform_brand_retention_batch_claim($1,$2) r',[f.id,c.claimToken])).r.status,'authorized','metadata disappearance retains exact claimed recovery evidence');
   assert.equal(await coverage(f.id),'brand_claimed_original');
   await assert.rejects(db.query("insert into storage.objects(id,bucket_id,name,version) values($1,'platform-brand-assets',$2,'v2')",[randomUUID(),f.key]),/incarnation_fenced/);
   await db.query("select record_platform_brand_retention_transport_result($1,$2,'observed_absent')",[f.id,c.claimToken]);
   await db.query("update private.platform_brand_retention_work_dispatch set next_attempt_at=clock_timestamp()-interval '1 second' where asset_id=$1",[f.id]);
   assert.deepEqual((await work()).assetIds,[],'observed absent is a completed API observation, not permanent physical absence');
   assert.equal((await q('select permanently_absent from private.platform_brand_expiry_transport_results where asset_id=$1',[f.id])).permanently_absent,false);
  });
  await t.test('disabled or unknown guard coverage and stale proof remain honest blockers',async()=>{
   await db.exec('alter table public.platform_brand_assets disable trigger zzz_deleted_content_brand_admission');
   assert.equal((await readiness()).platformBrandGuardCoverage,false);
   assert.equal((await work()).qualified,false);
   await db.exec('alter table public.platform_brand_assets enable trigger zzz_deleted_content_brand_admission');
   await db.exec('create table public.brand_unknown_locator(id uuid,media_url text)');
   assert.equal((await readiness()).platformBrandGuardCoverage,false);
   await db.exec('create trigger zzz_deleted_media_reference_guard before insert or update on public.brand_unknown_locator for each row execute function private.guard_deleted_media_references()');
   assert.equal((await readiness()).platformBrandGuardCoverage,false,'generic reference coverage alone cannot authorize Brand references');
   await db.exec('create trigger zzz_platform_brand_retention_reference before insert or update on public.brand_unknown_locator for each row execute function private.guard_platform_brand_retention_references()');
   assert.equal((await readiness()).platformBrandGuardCoverage,true,'both actual guards restore fully covered public locator inventory');
   await db.exec('drop table public.brand_unknown_locator');
   await db.exec('alter table public.platform_brand_assets add column future_media_url text');
   assert.equal((await readiness()).platformBrandGuardCoverage,false,'future source locator column requires explicit lifecycle review, even NULL');
   assert.equal(await coverage(f.id),'brand_source_schema_unreviewed');
   await db.exec('alter table public.platform_brand_assets drop column future_media_url');
   const g=await prove(await fixture());
   await db.query('update media_scan_jobs set attempt_count=attempt_count+1 where id=$1',[g.job]);
   assert.equal(await coverage(g.id),'brand_scan_proof_no_longer_current');
   assert.ok((await readiness()).blockers.includes('platform_brand_exact_scan_proof_incomplete'));
   assert.equal((await q("select count(*)::int n from pg_trigger where tgname='zzz_deleted_content_secondary_coverage' and tgrelid=any(array['public.video_renditions'::regclass,'public.media_renditions'::regclass,'public.media_transcode_jobs'::regclass])")).n,3,'unrelated secondary guards untouched');
  });
  await t.test('new unproved removals dispatch at most25 and cannot claim or issue provider authority',async()=>{
   const pending=[];
   for(let i=0;i<26;i++){
    const item=await fixture();pending.push(item.id);
    await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[item.id]);
    await age(item.id);
   }
   const first=await work();assert.equal(first.assetIds.length,25);
   assert.ok(first.assetIds.every(id=>pending.includes(id)));
   for(const id of first.assetIds){
    const result=(await q('select begin_platform_brand_retention_batch_transport($1) r',[id])).r;
    assert.ok(['references_or_coverage_blocked','unproven_incarnation'].includes(result.status));
   }
   assert.equal((await work()).assetIds.length,1,'blocked assets do not starve later due work');
   assert.equal((await q('select count(*)::int n from private.platform_brand_expiry_claims where asset_id=any($1::uuid[])',[pending])).n,0);
  });
 } finally {await db.close();}
});

test('forward integration adopts legacy bookkeeping without rewriting or restarting the Brand window', {timeout:240000},async()=>{
 const migration='20261025033057_platform_brand_global_retention_integration.sql';
 const sql=readFileSync('supabase/migrations/'+migration,'utf8');
 const lock=sql.indexOf('lock table public.platform_brand_assets in access exclusive mode;');
 assert.ok(lock>0 && lock<sql.indexOf('insert into private.deleted_content_brand_delegations'));
 assert.ok(lock<sql.indexOf('alter table private.deleted_content_records'),'drain source writers before archive DDL, matching capture order');
 const {db}=await createDatabase({includeHeldStudio:true,excludeMigrations:[migration]});
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 try{
  const id=randomUUID(),key=`legacy-official/logo/${id}.png`,deletionId=randomUUID();
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  await db.query("insert into storage.objects(id,bucket_id,name,version) values($1,'platform-brand-assets',$2,'legacy-v1')",[randomUUID(),key]);
  await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type) values($1,'legacy-official','logo',$2,$2,'image/png')",[id,key]);
  await db.query('update platform_brand_assets set deleted_at=clock_timestamp() where id=$1',[id]);
  // Historical generic capture had its own later clock and text_only label.
  // The migration must preserve that historical record, explicitly delegate it,
  // and use only the existing immutable Brand clock for operational expiry.
  await db.query("insert into private.deleted_content_records(id,target_type,target_id,author,content,source_created_at,deletion_kind,deleted_at,expires_at,media_disposition) select $1,'platform_brand_asset',asset_id::text,owner_id,null,source_created_at,'soft',removed_at+interval '5 minutes',retain_until+interval '5 minutes','text_only' from private.platform_brand_object_incarnations where asset_id=$2",[deletionId,id]);
  const clock=(await q('select to_jsonb(r) r from private.platform_brand_object_incarnations r where asset_id=$1',[id])).r;
  const original=(await q('select to_jsonb(d) d from private.deleted_content_records d where id=$1',[deletionId])).d;
  await applyBrandMigrationStatements(db,sql);
  assert.deepEqual((await q('select to_jsonb(r) r from private.platform_brand_object_incarnations r where asset_id=$1',[id])).r,clock);
  assert.deepEqual((await q('select to_jsonb(d) d from private.deleted_content_records d where id=$1',[deletionId])).d,original);
  const result=(await q('select expire_deleted_content_text($1) r',[deletionId])).r;
  assert.equal(result.status,'delegated_brand_lifecycle');
  assert.equal(result.removedAt,clock.removed_at);assert.equal(result.retainUntil,clock.retain_until);
  assert.equal((await q('select public.deleted_content_expiry_readiness() r')).r.platformBrandUnboundArchiveCount,0);
  assert.deepEqual((await q('select public.list_platform_brand_retention_expiry_work() r')).r,{enabled:false,qualified:false,assetIds:[],limit:25});
 }finally{await db.close();}
});

test('generic text dispatch cannot steal cleanup leases or fail open without settings, including mutation controls', {timeout:240000},async t=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const textWork=async()=>(await q('select public.list_deleted_content_expiry_work() r')).r;
 const stageWork=async()=>(await q('select public.list_deleted_content_stage_cleanup_work() r')).r;
 const dispatch=async(kind)=>(await q("select coalesce(jsonb_agg(to_jsonb(d) order by work_id),'[]'::jsonb) rows from private.deleted_content_work_dispatch d where kind=$1",[kind])).rows;
 const rollbackCase=async(run)=>{await db.exec('begin');try{await run();}finally{await db.exec('rollback');}};
 const disabled={enabled:false,deletionIds:[],stageIds:[]};
 try{
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  await db.exec(readFileSync('tests/fixtures/deleted-content-local-qualification.sql','utf8'));
  await db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true');
  const owner=randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'brand-dispatch@example.test',now(),false,false)",[owner]);
  const stages=[];
  for(let n=0;n<3;n++){
   const target=randomUUID(),reservation=randomUUID(),stage=randomUUID(),key=`${owner}/${target}/source.mp4`;
   await db.query("insert into media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at) values($1,$2,'creator_video','cloudflare_r2','chillywood-media-origin',$3,'video/mp4',23,'verified',now()+interval '1 hour',now(),$4,now())",[reservation,owner,key,target]);
   await db.query("insert into videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'Synthetic stage dispatch','draft','clean','cloudflare_r2','chillywood-media-origin',$3,$3,'video/mp4',23)",[target,owner,key]);
   await db.query("update media_scan_jobs set status='clean' where target_table='videos' and target_id=$1",[target]);
   // The real registration trigger, with all guards enabled, creates provenance.
   // Queue selection is not a provider claim and the attached parent stays live.
   await db.query("insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,staged_at,reconcile_after) values($1,'creator_video',$2,$3,'cloudflare_r2','chillywood-media-origin',$4,$5,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')",[stage,target,owner,key,reservation]);
   assert.equal((await q('select status from private.deleted_media_key_retirements where stage_id=$1',[stage])).status,'staged');
   stages.push(stage);
  }
  await db.query("insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at) values('stage',$1,clock_timestamp()-interval '1 hour'),('stage',$2,clock_timestamp()+interval '1 hour')",[stages[1],stages[2]]);
  const records=[];
  for(let n=0;n<25;n++){
   const id=randomUUID();records.push(id);
   await db.query("insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at,media_disposition) values($1,'profile_post',$2,$3,'{}','hard',now()-interval '721 hours',now()-interval '1 hour','text_only')",[id,randomUUID(),owner]);
  }
  const brand=randomUUID();
  await db.query("insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at,media_disposition) values($1,'platform_brand_asset',$2,'platform_owner_text',null,'soft',now()-interval '722 hours',now()-interval '2 hours','text_only')",[brand,randomUUID()]);
  const assertTextLeavesStages=async()=>{
   const before=await dispatch('stage');
   const result=await textWork();
   assert.deepEqual(result.stageIds,[],'text dispatch must never expose orphan-stage work');
   assert.deepEqual(await dispatch('stage'),before,'text dispatch must not lease or refresh stage work');
   assert.equal(result.enabled,true);
   assert.equal(result.deletionIds.length,20);
   assert.ok(result.deletionIds.every(id=>records.includes(id)),'only non-Brand due archives enter the bounded text queue');
   assert.equal(result.deletionIds.includes(brand),false);
  };
  await t.test('full migrated text-first ordering leaves fresh, expired and future stage leases intact',()=>rollbackCase(async()=>{
   await assertTextLeavesStages();
   assert.deepEqual(new Set((await stageWork()).stageIds),new Set(stages.slice(0,2)),
    'the real cleanup queue can select the same fresh/expired work immediately after text');
   const second=await textWork();
   assert.equal(second.deletionIds.length,5,'text lease and batch limit preserve the original bounded scheduling');
   assert.equal((await stageWork()).stageIds.length,0,'cleanup, not text, owns the one-minute stage lease');
  }));
  await t.test('missing singleton returns disabled with due work present and changes no leases',()=>rollbackCase(async()=>{
   await db.exec('delete from private.deleted_content_retention_settings');
   const before={text:await dispatch('text'),stage:await dispatch('stage')};
   assert.deepEqual(await textWork(),disabled,'missing configuration must fail closed');
   assert.deepEqual({text:await dispatch('text'),stage:await dispatch('stage')},before);
  }));
  await t.test('mutation control catches stage leasing even if returned stageIds stays empty',()=>rollbackCase(async()=>{
   const marker=" return jsonb_build_object('enabled',true,";
   const steal=` insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 select 'stage',s.id,clock_timestamp()+interval '1 minute' from private.deleted_content_media_stages s
 left join private.deleted_content_work_dispatch d on d.kind='stage' and d.work_id=s.id
 where s.deletion_id is null and s.reconcile_after<=clock_timestamp()
 and (d.work_id is null or d.next_attempt_at<=clock_timestamp())
 and exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled)
 on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
`;
   const mutant=genericDispatch.replace(marker,steal+marker);assert.notEqual(mutant,genericDispatch);
   await db.exec(mutant);
   await assert.rejects(assertTextLeavesStages,{name:'AssertionError',message:/must not lease/});
   assert.deepEqual((await stageWork()).stageIds,[],'the rejected mutation really starves the later cleanup pass');
  }));
  await t.test('mutation control catches nullable settings fail-open and unauthorized dispatch',()=>rollbackCase(async()=>{
   const mutant=genericDispatch.replace('declare ids uuid[];','declare ids uuid[]; enabled boolean;')
    .replace(' if not exists(select 1 from private.deleted_content_retention_settings where text_expiry_enabled) then',
     ' select text_expiry_enabled into enabled from private.deleted_content_retention_settings;\n if not enabled then');
   assert.notEqual(mutant,genericDispatch);await db.exec(mutant);
   await db.exec('delete from private.deleted_content_retention_settings');
   await assert.rejects(async()=>assert.deepEqual(await textWork(),disabled),{name:'AssertionError'});
   assert.equal((await dispatch('text')).length,20,'the rejected mutation actually dispatches work without settings');
  }));
  assert.equal((await q('select count(*)::int n from private.deleted_content_stage_cleanup_claims')).n,0,
   'queue tests never claim or contact a provider');
 }finally{await db.close();}
});
