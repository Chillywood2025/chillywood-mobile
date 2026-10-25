import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

// Entire source migration chain, isolated PGlite managed-service doubles. Never
// provider or native concurrency evidence; hosted PostgreSQL covers contention.
test('archived empty-test disposition retains history and uses exact typed expiry', {timeout:240000}, async t=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const service=()=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 const owner=randomUUID(),session=randomUUID();
 const ownerCall=async(sql,args=[])=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:owner,session_id:session})]);
  await db.exec('set role authenticated');
  try{return await q(sql,args);}finally{await db.exec('reset role');await service();}
 };
 const coverage=async id=>(await q('select private.deleted_content_brand_source_coverage(to_jsonb(a)) c from platform_brand_assets a where id=$1',[id])).c;
 const fixture=async({ownerId=owner,mature=false,positive=false}={})=>{
  const id=randomUUID(),object=randomUUID(),key=`${ownerId}/logo/${id}.png`;
  await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'empty-v1',$3)",[object,key,{size:positive?23:0}]);
  await db.query("insert into platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'logo',$3,$3,'image/png',23)",[id,ownerId,key]);
  const job=(await q("select id from media_scan_jobs where target_id=$1 and target_table='platform_brand_assets'",[id])).id;
  await db.query('update media_scan_jobs set priority=-2147483648 where id=$1',[job]);
  await db.exec("select * from claim_media_scan_jobs(1,'synthetic-historical-worker')");
  let observation;
  if(positive){
   const attempt=(await q('select attempt_count n from media_scan_jobs where id=$1',[job])).n;
   observation=(await q("select begin_media_scan_byte_observation($1,'synthetic-historical-worker',$2) id",[job,attempt])).id;
  }
  await db.query("select complete_media_scan_job($1,'clean','clamav','historical-fixture','daily/fixture',null,null,1)",[job]);
  if(positive){
   const receipt=(await q("select record_media_scan_byte_receipt($1,$2,'synthetic-historical-worker',$3,23) id",[observation,job,'b'.repeat(64)])).id;
   const binding=(await q('select read_platform_brand_retention_binding($1) b',[id])).b;
   await db.query('select record_platform_brand_retention_proof($1,$2,$3)',[id,binding,{scanReceiptId:receipt,originSha256:'b'.repeat(64),originSizeBytes:23}]);
  }
  if(mature){
   // Explicit synthetic mature fixture, only in this disposable database.
   // Age the active source/history BEFORE freezing the prearchive intent.
   await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable; alter table platform_brand_assets disable trigger aaa_platform_brand_retention; alter table media_scan_jobs disable trigger zzz_platform_brand_retention_reference');
   await db.query("update private.platform_brand_object_incarnations set source_created_at=source_created_at-interval '722 hours' where asset_id=$1",[id]);
   await db.query('update platform_brand_assets a set created_at=r.source_created_at from private.platform_brand_object_incarnations r where a.id=r.asset_id and a.id=$1',[id]);
   await db.query("update media_scan_jobs set created_at=created_at-interval '722 hours',completed_at=completed_at-interval '722 hours' where id=$1",[job]);
   await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable; alter table platform_brand_assets enable trigger aaa_platform_brand_retention; alter table media_scan_jobs enable trigger zzz_platform_brand_retention_reference');
  }
  return {id,object,key,job};
 };
 const archive=async f=>ownerCall('select remove_platform_brand_empty_test_asset($1) r',[f.id]);
 const canonicalArchive=async f=>ownerCall('select remove_platform_brand_asset($1) r',[f.id]);
 const authorize=async f=>db.query("insert into private.platform_brand_empty_authorizations(asset_id,owner_decision_sha256,snapshot) values($1,repeat('a',64),private.platform_brand_empty_intent_snapshot($1))",[f.id]);
 const begin=async f=>(await q('select begin_platform_brand_empty_observation($1) r',[f.id])).r;
 const result=async()=>({protocol:'brand-empty-test-origin-v1',sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',sizeBytes:0,httpStatus:200,fullReadback:true,encoding:'identity',completedAt:(await q('select clock_timestamp() t')).t.toISOString()});
 const record=async(o,r)=> (await q('select record_platform_brand_empty_disposition($1,$2,$3) r',[o.observationId,o.observationToken,r])).r;
 const age=async f=>{
  // EXPLICIT DISPOSABLE-SQL TIME WARP, not 720 hours of elapsed evidence.
  // Only this fixture rewrites its synthetic clocks/receipt under named guards;
  // production immutable guards and the independent fresh-not-due case remain.
  await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable; alter table platform_brand_assets disable trigger aaa_platform_brand_retention; alter table private.platform_brand_empty_authorizations disable trigger empty_evidence_immutable; alter table private.platform_brand_empty_owner_removals disable trigger empty_evidence_immutable');
  await db.query("update private.platform_brand_object_incarnations set removed_at=removed_at-interval '721 hours',retain_until=retain_until-interval '721 hours' where asset_id=$1",[f.id]);
  await db.query('update platform_brand_assets a set deleted_at=r.removed_at from private.platform_brand_object_incarnations r where a.id=r.asset_id and a.id=$1',[f.id]);
  await db.query("update private.platform_brand_empty_authorizations set authorized_at=authorized_at-interval '721 hours' where asset_id=$1",[f.id]);
  await db.query("update private.platform_brand_empty_owner_removals set operation_started_at=operation_started_at-interval '721 hours',recorded_at=recorded_at-interval '721 hours',snapshot=private.platform_brand_empty_snapshot($1) where asset_id=$1",[f.id]);
  await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable; alter table platform_brand_assets enable trigger aaa_platform_brand_retention; alter table private.platform_brand_empty_authorizations enable trigger empty_evidence_immutable; alter table private.platform_brand_empty_owner_removals enable trigger empty_evidence_immutable');
  assert.equal((await q('select private.platform_brand_empty_owner_receipt_matches($1) ok',[f.id])).ok,true,'synthetic mature receipt remains internally exact');
 };
 const globalFlags=()=>q('select activation_ready,capture_enabled,media_staging_enabled,text_expiry_enabled,media_expiry_enabled,legacy_object_deletes_blocked from private.deleted_content_retention_settings');
 const globalOff={activation_ready:false,capture_enabled:false,media_staging_enabled:false,text_expiry_enabled:false,media_expiry_enabled:false,legacy_object_deletes_blocked:false};
 const globalRows=()=>q("select (select count(*)::int from private.deleted_content_records where target_type='platform_brand_asset') captures,(select count(*)::int from private.deleted_content_brand_delegations) delegations,(select count(*)::int from private.deleted_content_retention_events where target_type='platform_brand_asset' and operation='capture') capture_events");
 try{
  await service();
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'empty-fixture@example.invalid',now(),false,false)",[owner]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
  await db.query("insert into platform_role_memberships(role,user_id,email,status,notes,granted_by) values('owner',$1,'empty-fixture@example.invalid','active','Synthetic fixture','fixture')",[owner]);
  await db.query("insert into wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source) select $1::uuid,wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation' from wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'",[owner,session]);
  assert.deepEqual(await globalFlags(),globalOff,'all global flags are off before any empty fixture exists');
  await t.test('empty private authorization set, forced RLS and narrow service RPCs',async()=>{
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_authorizations')).n,0);
   for(const name of ['platform_brand_empty_authorizations','platform_brand_empty_owner_removals','platform_brand_empty_observations','platform_brand_empty_dispositions','platform_brand_empty_claim_evidence']){
    assert.deepEqual(await q('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['private.'+name]),{relrowsecurity:true,relforcerowsecurity:true});
    for(const role of ['anon','authenticated','service_role']) assert.equal((await q("select has_table_privilege($1,$2,'INSERT') allowed",[role,'private.'+name])).allowed,false);
   }
   for(const rpc of ['begin_platform_brand_empty_observation(uuid)','read_platform_brand_empty_observation(uuid,uuid)','record_platform_brand_empty_disposition(uuid,uuid,jsonb)']){
    for(const role of ['anon','authenticated'])assert.equal((await q("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,'public.'+rpc])).allowed,false);
    assert.equal((await q("select has_function_privilege('service_role',$1,'EXECUTE') allowed",['public.'+rpc])).allowed,true);
   }
   for(const role of ['anon','service_role'])assert.equal((await q("select has_function_privilege($1,'public.remove_platform_brand_empty_test_asset(uuid)','EXECUTE') allowed",[role])).allowed,false);
   assert.equal((await q("select has_function_privilege('authenticated','public.remove_platform_brand_empty_test_asset(uuid)','EXECUTE') allowed")).allowed,true);
  });
  const fresh=await fixture();
  await t.test('active exact intent precedes genuine Owner wrapper; all global flags remain off',async()=>{
   await assert.rejects(q('select remove_platform_brand_empty_test_asset($1)',[fresh.id]),/authenticated_owner_required/);
   assert.equal((await q('select private.platform_brand_empty_snapshot($1) s',[fresh.id])).s,null);
   await assert.rejects(begin(fresh),/exact_authorization_required/);
   await assert.rejects(archive(fresh),/exact_intent_required/);
   await authorize(fresh);
   assert.equal((await q("select snapshot->'source'->>'asset_state' state,snapshot->'source'->>'deleted_at' deleted from private.platform_brand_empty_authorizations where asset_id=$1",[fresh.id])).state,'draft');
   await assert.rejects(begin(fresh),/exact_authorization_required/);
   const removed=(await archive(fresh)).r;
   assert.equal(removed.ownerRemovalReceiptRecorded,true);assert.equal(removed.globalCaptureRecorded,false);
   assert.equal((await q("select a.deleted_at=r.removed_at and r.retain_until=r.removed_at+interval '720 hours' and r.removal_clock='server_observed_removal' exact from platform_brand_assets a join private.platform_brand_object_incarnations r on a.id=r.asset_id where a.id=$1",[fresh.id])).exact,true);
   assert.deepEqual((await archive(fresh)).r,removed,'exact retry returns the original server clock');
   const receipt=await q('select count(*)::int n,min(actor) actor,bool_and(not global_capture_recorded) capture_off from private.platform_brand_empty_owner_removals where asset_id=$1',[fresh.id]);
   assert.deepEqual(receipt,{n:1,actor:owner,capture_off:true});
   assert.deepEqual(await globalRows(),{captures:0,delegations:0,capture_events:0});
   assert.deepEqual(await globalFlags(),globalOff);
  });
  await t.test('exact evidence is neither clean proof nor early expiry permission',async()=>{
   const before=await q('select to_jsonb(a) s,(select to_jsonb(j) from media_scan_jobs j where j.id=$2) j from platform_brand_assets a where a.id=$1',[fresh.id,fresh.job]);
   const observation=await begin(fresh),r=await result();
   assert.equal((await q('select read_platform_brand_empty_observation($1,$2) r',[observation.observationId,randomUUID()])).r,null);
   await assert.rejects(record({...observation,observationToken:randomUUID()},r),/observation_required/);
   for(const patch of [{sizeBytes:1},{httpStatus:404},{fullReadback:false},{sha256:'f'.repeat(64)},{encoding:'gzip'},{unexpected:true}])await assert.rejects(record(observation,{...r,...patch}),/complete_origin_required/);
   const receipt=await record(observation,r);assert.equal(receipt.recorded,true);
   assert.deepEqual(await record(observation,r),receipt);
   await assert.rejects(record(observation,{...r,sizeBytes:1}),/disposition_conflict/);
   assert.equal(await coverage(fresh.id),'retained_empty_test');
   const readiness=(await q('select deleted_content_expiry_readiness() r')).r;
   assert.equal(readiness.platformBrandMissingCurrentScanProofCount,1);
   assert.equal(readiness.platformBrandMissingRetentionEvidenceCount,0);
   assert.equal(readiness.platformBrandSupportedEmptyTestCount,1);
   assert.ok(readiness.uncoveredSourceCount>0,'unrelated historical fixture inventory is preserved, not deleted to green readiness');
   assert.ok(!readiness.blockers.includes('platform_brand_exact_scan_proof_incomplete'));
   assert.equal(readiness.ready,false,'empty evidence does not manufacture provider/global readiness');
   assert.ok(readiness.blockers.includes('platform_brand_transport_not_qualified'));
   assert.ok(readiness.blockers.includes('legacy_object_delete_gate_open'));
   assert.ok(readiness.blockers.includes('consumer_rollout_not_qualified'));
   assert.deepEqual(await globalFlags(),globalOff);
   assert.deepEqual(await globalRows(),{captures:0,delegations:0,capture_events:0});
   await db.exec("update private.platform_brand_retention_settings set expiry_enabled=true,version_delete_verified=true,provider_origin='https://fixture.supabase.invalid',provider_contract_sha256=repeat('c',64),writer_drain_evidence_sha256=repeat('d',64),reference_review_evidence_sha256=repeat('e',64)");
   assert.equal((await q('select claim_platform_brand_retention_expiry($1) r',[fresh.id])).r.status,'not_due');
   assert.equal((await q('select count(*)::int n from private.platform_brand_object_proofs')).n,0);
   assert.equal((await q('select count(*)::int n from private.media_scan_byte_receipts')).n,0);
   assert.deepEqual(await q('select to_jsonb(a) s,(select to_jsonb(j) from media_scan_jobs j where j.id=$2) j from platform_brand_assets a where a.id=$1',[fresh.id,fresh.job]),before);
  });
  await t.test('permanent history/tombstone and delivery remain deny-only',async()=>{
   for(const change of ["status='pending_scan'","attempt_count=attempt_count+1","metadata=metadata||'{\"extra\":true}'"])
    await assert.rejects(db.query('update media_scan_jobs set '+change+' where id=$1',[fresh.job]),/history_permanent/);
   await assert.rejects(db.query('delete from media_scan_jobs where id=$1',[fresh.job]),/history_permanent/);
   await assert.rejects(db.exec('truncate media_scan_jobs'),/history_permanent/);
   for(const [table,patch] of [['platform_brand_empty_authorizations',"owner_decision_sha256=repeat('b',64)"],['platform_brand_empty_owner_removals',"actor='fabricated-owner'"],['platform_brand_empty_observations','observation_token=gen_random_uuid()'],['platform_brand_empty_dispositions',"result=result||'{\"extra\":true}'"]]){
    await assert.rejects(db.exec(`update private.${table} set ${patch}`),/identity_permanent/);
    await assert.rejects(db.exec(`delete from private.${table}`),/identity_permanent/);
    await assert.rejects(db.exec(`truncate private.${table} cascade`),/identity_permanent/);
   }
   await assert.rejects(db.query('update platform_brand_assets set deleted_at=null where id=$1',[fresh.id]),/tombstone_permanent/);
   assert.equal((await ownerCall('select platform_brand_storage_access_allowed($1,$2) allowed',['platform-brand-assets',fresh.key])).allowed,false);
   assert.equal((await q('select platform_brand_publication_asset_safe_internal($1,$2) allowed',[fresh.id,owner])).allowed,false);
   await assert.rejects(db.query('insert into platform_brand_profiles(owner_user_id,logo_asset_id) values($1,$2)',[owner,fresh.id]),/retained|removed|archived|safe|invalid|unavailable|does not belong/);
  });
  await t.test('normal positive-proof capture-off canonical removal remains independent and unchanged',async()=>{
   const positive=await fixture({positive:true});
   assert.equal(await coverage(positive.id),'brand_verified_original');
   const removed=(await canonicalArchive(positive)).r;
   assert.deepEqual(Object.keys(removed).sort(),['assetId','deletedAt']);
   assert.equal(await coverage(positive.id),'brand_verified_original');
   assert.equal((await q('select begin_platform_brand_retention_transport($1) r',[positive.id])).r.status,'not_due');
   // Scanner observation/completion use separate actual transactions, as in
   // production. Isolate only the synthetic maturity/permanent positive claim
   // so it cannot conflict with subsequent account-wide hold controls.
   await db.exec('begin');
   try{
   // Explicit disposable positive-control time warp only, as in the existing
   // positive lifecycle fixture. This is not real elapsed retention evidence.
   await db.exec('alter table private.platform_brand_object_incarnations disable trigger brand_retention_immutable; alter table platform_brand_assets disable trigger aaa_platform_brand_retention');
   await db.query("update private.platform_brand_object_incarnations set removed_at=removed_at-interval '721 hours',retain_until=retain_until-interval '721 hours' where asset_id=$1",[positive.id]);
   await db.query('update platform_brand_assets a set deleted_at=r.removed_at from private.platform_brand_object_incarnations r where a.id=r.asset_id and a.id=$1',[positive.id]);
   await db.exec('alter table private.platform_brand_object_incarnations enable trigger brand_retention_immutable; alter table platform_brand_assets enable trigger aaa_platform_brand_retention');
   const claim=(await q('select begin_platform_brand_retention_transport($1) r',[positive.id])).r;
   assert.equal(claim.status,'claimed');assert.notEqual(claim.evidenceKind,'archived_empty_test');
   assert.equal((await q('select read_platform_brand_retention_expiry_claim($1,$2) r',[positive.id,claim.claimToken])).r.status,'authorized');
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_claim_evidence where asset_id=$1',[positive.id])).n,0);
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[positive.id])).n,0);
   assert.deepEqual(await globalRows(),{captures:0,delegations:0,capture_events:0});
   assert.deepEqual(await globalFlags(),globalOff);
   }finally{await db.exec('rollback');await service();}
  });
  await t.test('capture already enabled remains canonical and optional current records must be wholly consistent',async()=>{
   await db.exec('begin');
   let captured;
   try{
    // Only this separately rolled-back capture-on branch qualifies the global
    // fixture. The receipt-only bootstrap above kept every global flag false.
    await db.exec(readFileSync('tests/fixtures/deleted-content-local-qualification.sql','utf8'));
    await db.exec('update private.platform_brand_retention_settings set batch_enabled=true; select record_platform_brand_retention_worker_heartbeat(false,true)');
    await db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true');
    captured=await fixture();await authorize(captured);
    assert.equal((await archive(captured)).r.globalCaptureRecorded,true);
    const observation=await begin(captured);await record(observation,await result());
    assert.equal(await coverage(captured.id),'retained_empty_test');
    assert.deepEqual(await globalRows(),{captures:1,delegations:1,capture_events:1});
    assert.equal((await q('select private.platform_brand_empty_owner_receipt_matches($1) ok',[captured.id])).ok,true);
    for(const [table,sql] of [
     ['private.deleted_content_brand_delegations','delete from private.deleted_content_brand_delegations where asset_id=$1'],
     ['private.deleted_content_records','delete from private.deleted_content_records where target_id=$1'],
     ['private.deleted_content_brand_delegations',"update private.deleted_content_brand_delegations set owner_id='wrong-owner' where asset_id=$1"],
     ['private.deleted_content_records',"update private.deleted_content_records set author='wrong-owner' where target_id=$1"],
    ]){
     await db.exec('savepoint optional_global_mutant');
     await db.exec(`alter table ${table} disable trigger user`);await db.query(sql,[captured.id]);await db.exec(`alter table ${table} enable trigger user`);
     assert.equal((await q('select private.platform_brand_empty_snapshot($1) s',[captured.id])).s,null,'global orphan/mismatch fails closed');
     assert.equal((await q('select private.platform_brand_empty_evidence_matches($1) ok',[captured.id])).ok,false);
     await db.exec('rollback to savepoint optional_global_mutant');
    }
    // Capture created later by the unchanged canonical capture helper does not
    // rewrite or invalidate a receipt that truthfully recorded capture absent.
    const before=await q('select to_jsonb(r) r from private.platform_brand_empty_owner_removals r where asset_id=$1',[fresh.id]);
    await db.query("select private.capture_deleted_content_row('platform_brand_asset',to_jsonb(a),true) from platform_brand_assets a where id=$1",[fresh.id]);
    assert.equal((await q('select private.platform_brand_empty_evidence_matches($1) ok',[fresh.id])).ok,true);
    assert.deepEqual(await q('select to_jsonb(r) r from private.platform_brand_empty_owner_removals r where asset_id=$1',[fresh.id]),before);
   }finally{await db.exec('rollback');await service();}
   assert.deepEqual(await globalFlags(),globalOff);
   assert.deepEqual(await globalRows(),{captures:0,delegations:0,capture_events:0});
  });
  await t.test('valid Owner session cannot remove another asset owner; expired sessions cannot remove or retry',async()=>{
   const anotherOwner=randomUUID(),foreign=await fixture({ownerId:anotherOwner});await authorize(foreign);
   assert.equal((await archive(fresh)).r.ownerRemovalReceiptRecorded,true,'wrong-target rejection uses the same genuinely valid Owner session as this successful exact retry');
   await assert.rejects(archive(foreign),/brand_remove_owner_required/);
   assert.equal((await q('select deleted_at from platform_brand_assets where id=$1',[foreign.id])).deleted_at,null);
   const expired=await fixture();await authorize(expired);
   await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 minute' where id=$1",[session]);
   try{
    await assert.rejects(archive(expired),/current_session_required/);
    await assert.rejects(archive(fresh),/current_session_required/);
   }finally{await db.query('update auth.sessions set not_after=null where id=$1',[session]);}
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[expired.id])).n,0);
  });
  await t.test('receipt insertion failure atomically rolls canonical archival back, then exact retry succeeds once',async()=>{
   const fault=await fixture();await authorize(fault);
   const before=await q('select to_jsonb(a) source,to_jsonb(r) incarnation from platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=$1',[fault.id]);
   await db.exec("create function private.synthetic_fail_empty_receipt() returns trigger language plpgsql as $$begin raise exception 'synthetic_receipt_insert_fault'; end$$; create trigger synthetic_receipt_insert_fault before insert on private.platform_brand_empty_owner_removals for each row execute function private.synthetic_fail_empty_receipt()");
   try{await assert.rejects(archive(fault),/synthetic_receipt_insert_fault/);}
   finally{await db.exec('drop trigger synthetic_receipt_insert_fault on private.platform_brand_empty_owner_removals; drop function private.synthetic_fail_empty_receipt()');}
   assert.deepEqual(await q('select to_jsonb(a) source,to_jsonb(r) incarnation from platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=$1',[fault.id]),before);
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[fault.id])).n,0);
   const first=await archive(fault);assert.deepEqual(await archive(fault),first);
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[fault.id])).n,1);
  });
  await t.test('holds and extra references roll wrapper archival and its just-inserted receipt back',async()=>{
   for(const gate of ['hold','reference']){
    const f=await fixture();await authorize(f);
    const before=await q('select to_jsonb(a) source,to_jsonb(r) incarnation from platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=$1',[f.id]);
    if(gate==='hold')await db.query("insert into legal_holds(target_type,target_id,status,placed_by_user_id,reason) values('platform_brand_asset',$1,'active','fixture','Synthetic wrapper hold')",[f.id]);
    else{
     await db.exec('create table public.empty_test_wrapper_reference(id uuid,media_url text)');
     await db.query('insert into public.empty_test_wrapper_reference values($1,$2)',[f.id,f.key]);
    }
    try{await assert.rejects(archive(f),/owner_receipt_or_references_required|brand_asset_in_use|held/);}
    finally{
     if(gate==='hold')await db.query("delete from legal_holds where target_type='platform_brand_asset' and target_id=$1",[f.id]);
     else await db.exec('drop table public.empty_test_wrapper_reference');
    }
    assert.deepEqual(await q('select to_jsonb(a) source,to_jsonb(r) incarnation from platform_brand_assets a join private.platform_brand_object_incarnations r on r.asset_id=a.id where a.id=$1',[f.id]),before);
    assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[f.id])).n,0);
   }
  });
  await t.test('source, job, generation and decision intent corruption cannot be converted into a receipt',async()=>{
   for(const [table,patch] of [
    ['platform_brand_assets','file_size_bytes=99'],
    ['media_scan_jobs','attempt_count=attempt_count+1'],
    ['storage.objects',"version='changed-generation'"],
    ['private.platform_brand_empty_authorizations',"snapshot=jsonb_set(snapshot,'{binding,storageVersion}','\"changed-generation\"')"],
   ]){
    const f=await fixture();await authorize(f);
    const id=table==='media_scan_jobs'?f.job:table==='storage.objects'?f.object:f.id;
    const column=table==='private.platform_brand_empty_authorizations'?'asset_id':'id';
    // Deliberate local privileged corruption. Guard behavior is separately tested.
    await db.exec(`alter table ${table} disable trigger user`);await db.query(`update ${table} set ${patch} where ${column}=$1`,[id]);await db.exec(`alter table ${table} enable trigger user`);
    await assert.rejects(archive(f),/exact_intent_required/);
    assert.equal((await q('select deleted_at from platform_brand_assets where id=$1',[f.id])).deleted_at,null);
    assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[f.id])).n,0);
   }
  });
  await t.test('unknown authorization and preexisting archives without a wrapper receipt never qualify',async()=>{
   const unknown=await fixture();
   await assert.rejects(begin(unknown),/exact_authorization_required/);
   await authorize(unknown);await canonicalArchive(unknown);
   assert.equal((await q('select private.platform_brand_empty_intent_snapshot($1) s',[unknown.id])).s,null);
   await assert.rejects(archive(unknown),/owner_receipt_required|exact_intent_required/);
   await assert.rejects(begin(unknown),/exact_authorization_required/);
   assert.equal((await q('select count(*)::int n from private.platform_brand_empty_owner_removals where asset_id=$1',[unknown.id])).n,0);
  });
  const due=await fixture({mature:true});await authorize(due);await archive(due);await age(due);
  const observation=await begin(due);
  await t.test('authorization alone and expired observations cannot create a disposition or claim',async()=>{
   assert.equal((await q('select claim_platform_brand_retention_expiry($1) r',[due.id])).r.status,'unproven_incarnation');
   assert.equal((await q('select count(*)::int n from private.platform_brand_expiry_claims where asset_id=$1',[due.id])).n,0);
   await db.exec('begin');
   try{
    await db.exec('alter table private.platform_brand_empty_observations disable trigger empty_evidence_immutable');
    await db.query("update private.platform_brand_empty_observations set started_at=started_at-interval '21 minutes' where id=$1",[observation.observationId]);
    await db.exec('alter table private.platform_brand_empty_observations enable trigger empty_evidence_immutable');
    assert.equal((await q('select read_platform_brand_empty_observation($1,$2) r',[observation.observationId,observation.observationToken])).r,null);
    await assert.rejects(record(observation,await result()),/complete_origin_required/);
   }finally{await db.exec('rollback');}
  });
  await record(observation,await result());
  await t.test('holds and unknown scopes block actions, not truthful evidence coverage',async()=>{
   for(const type of ['platform_brand_asset','account','user_id','unknown_future_scope']){
    await db.exec('begin');
    try{
     await db.query('insert into legal_holds(target_type,target_id,status,placed_by_user_id,reason) values($1,$2,\'active\',\'fixture\',\'Synthetic preservation fixture\')',[type,type==='platform_brand_asset'?due.id:owner]);
     assert.equal(await coverage(due.id),'retained_empty_test');
     assert.equal((await q('select claim_platform_brand_retention_expiry($1) r',[due.id])).r.status,'held');
     await assert.rejects(begin(due),/exact_authorization_required/);
    }finally{await db.exec('rollback');}
   }
  });
  await t.test('changed exact snapshots, missing metadata and new references fail closed',async()=>{
   // Each deliberate corruption is a local privileged test mutant, rolled back.
   const mutations=[
    ['storage.objects',"update storage.objects set metadata='{\"size\":1}' where id=$1",due.object],
    ['storage.objects',"update storage.objects set version='another-generation' where id=$1",due.object],
    ['storage.objects','delete from storage.objects where id=$1',due.object],
    ['platform_brand_assets',"update platform_brand_assets set owner_user_id='another-owner' where id=$1",due.id],
    ['platform_brand_assets',"update platform_brand_assets set asset_state='draft' where id=$1",due.id],
    ['platform_brand_assets','update platform_brand_assets set file_size_bytes=99 where id=$1',due.id],
    ['media_scan_jobs','update media_scan_jobs set attempt_count=attempt_count+1 where id=$1',due.job],
    ['media_scan_jobs',"update media_scan_jobs set status='pending_scan' where id=$1",due.job],
    ['private.platform_brand_empty_authorizations',"update private.platform_brand_empty_authorizations set owner_decision_sha256=repeat('b',64) where asset_id=$1",due.id],
    ['private.platform_brand_empty_owner_removals',"update private.platform_brand_empty_owner_removals set actor='fabricated-owner' where asset_id=$1",due.id],
    ['private.platform_brand_empty_owner_removals','update private.platform_brand_empty_owner_removals set global_capture_recorded=true where asset_id=$1',due.id],
    ['private.platform_brand_empty_owner_removals','delete from private.platform_brand_empty_owner_removals where asset_id=$1',due.id],
    ['private.platform_brand_object_incarnations',"update private.platform_brand_object_incarnations set removal_clock='legacy_unknown_conservative_observation' where asset_id=$1",due.id],
   ];
   for(const [table,sql,id] of mutations){
    await db.exec('begin');
    try{
     await db.exec(`alter table ${table} disable trigger user`);await db.query(sql,[id]);await db.exec(`alter table ${table} enable trigger user`);
     assert.equal((await q('select private.platform_brand_empty_evidence_matches($1,true) ok',[due.id])).ok,false,sql);
     assert.notEqual((await q('select claim_platform_brand_retention_expiry($1) r',[due.id])).r.status,'claimed',sql);
     assert.equal((await q('select count(*)::int n from private.platform_brand_expiry_claims where asset_id=$1',[due.id])).n,0);
    }finally{await db.exec('rollback');}
   }
   for(const ddl of ['alter table media_scan_jobs add column future_media_url text','alter table platform_brand_assets add column future_media_url text','create table public.empty_test_unknown_reference(id uuid,media_url text)']){
    await db.exec('begin');
    try{await db.exec(ddl);assert.equal((await q('select private.platform_brand_retention_references_clear($1) ok',[due.id])).ok,false);await assert.rejects(begin(due),/exact_authorization_required/);}
    finally{await db.exec('rollback');}
   }
   await db.exec('begin');
   try{
    // Extra alias is not one of the exact authorized terminal job snapshots.
    await db.exec('alter table media_scan_jobs disable trigger user');
    await db.query("insert into media_scan_jobs(target_table,target_column,target_id,owner_user_id,storage_provider,storage_bucket,storage_object_key,status) values('platform_brand_assets','avatar',$1,$2,'supabase','platform-brand-assets',$3,'pending_scan')",[due.id,owner,due.key]);
    await db.exec('alter table media_scan_jobs enable trigger user');
    assert.equal((await q('select private.platform_brand_retention_references_clear($1) ok',[due.id])).ok,false);
   }finally{await db.exec('rollback');}
  });
  await t.test('typed claim, one dispatch, absent-metadata observation-only recovery',async()=>{
   const c=(await q('select begin_platform_brand_retention_transport($1) r',[due.id])).r;
   assert.equal(c.status,'claimed');assert.equal(c.evidenceKind,'archived_empty_test');
   assert.equal((await q('select claim_platform_brand_retention_expiry($1) r',[due.id])).r.claimToken,c.claimToken,'exact retry reuses one immutable typed claim');
   await assert.rejects(db.exec("update private.platform_brand_empty_claim_evidence set evidence_sha256=repeat('b',64)"),/identity_permanent/);
   const reread=()=>q('select read_platform_brand_retention_expiry_claim($1,$2) r',[due.id,c.claimToken]);
   assert.equal((await reread()).r.status,'authorized');
   const dispatch=()=>q('select prepare_platform_brand_retention_dispatch($1,$2) r',[due.id,c.claimToken]);
   assert.equal((await dispatch()).r.status,'dispatch_authorized');
   assert.equal((await dispatch()).r.status,'observe_only');
   await db.query('delete from storage.objects where id=$1',[due.object]);
   const absent=(await reread()).r;assert.equal(absent.status,'authorized');assert.equal(absent.metadataPresent,false);assert.equal(absent.observationOnly,true);assert.equal(absent.permanentlyAbsent,false);
   assert.equal(await coverage(due.id),'claimed_empty_test');
   assert.equal((await dispatch()).r.status,'observe_only');
   await db.query("select record_platform_brand_retention_transport_result($1,$2,'observed_absent')",[due.id,c.claimToken]);
   await assert.rejects(db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'replacement','{\"size\":0}')",[randomUUID(),due.key]),/incarnation_fenced/);
   assert.deepEqual(await globalFlags(),globalOff,'typed claim and recovery do not activate any global flag');
   assert.deepEqual(await globalRows(),{captures:0,delegations:0,capture_events:0});
  });
 }finally{await db.close();}
});
