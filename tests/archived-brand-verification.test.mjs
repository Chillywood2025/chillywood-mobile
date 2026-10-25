import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {archivedDatabase,archivedMigration,archivedTables,archivedPublicFunctions,cleanResult} from './helpers/archived-brand-fixture.mjs';
import {splitSQL} from './helpers/database-runtime-authority-fixture.mjs';
import {applyBrandMigrationStatements} from './helpers/apply-brand-migration-statements.mjs';

test('archived-only migration never edits held guards, live scan jobs or source delivery state',()=>{
 const sql=readFileSync('supabase/migrations/'+archivedMigration,'utf8');
 assert.doesNotMatch(sql,/create(?: or replace)? function private\.(?:guard_platform_brand_retention_references|guard_deleted_content_secondary_coverage)\(/i);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+(?:public\.)?(?:media_scan_jobs|platform_brand_assets)\b/i);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from)\s+private\.(?:platform_brand_object_incarnations|platform_brand_expiry_claims)\b/i);
 assert.doesNotMatch(sql,/grant\s+.+\s+to\s+(?:anon|authenticated)/i);
 for(const [file,name] of [['20261025033057_platform_brand_global_retention_integration.sql','platform_brand_scan_byte_receipt_matches'],
  ['20261021134104_platform_brand_exact_expiry_transport.sql','platform_brand_claimed_scan_evidence_matches']]){
  const extract=(source,n)=>{const marker=new RegExp(`create(?: or replace)? function private\\.${n}\\(`,'i');
   const statement=splitSQL(source).find(x=>marker.test(x));assert.ok(statement,n);return statement.slice(statement.indexOf('as $$')+5,statement.lastIndexOf('$$;'));};
  assert.equal(extract(sql,name+'_before_archived'),extract(readFileSync('supabase/migrations/'+file,'utf8'),name));
  assert.match(sql,new RegExp('create or replace function private\\.'+name+'\\('),'preserve existing function OID');
 }
});

test('archived verifier composes exact evidence without restoring a source or making a deletion claim',{timeout:240000},async t=>{
 const h=await archivedDatabase(); const {db,q,rpc,fixture,enable,request,claim,read,record,seal,snapshot}=h;
 const coverage=async f=>(await q('select private.deleted_content_brand_source_coverage(to_jsonb(a)) c from platform_brand_assets a where id=$1',[f.id])).c;
 try {
  await t.test('default off, service-only functions, private FORCE RLS and immutable ledgers',async()=>{
   assert.equal((await q('select archived_verification_enabled from private.platform_brand_retention_settings')).archived_verification_enabled,false);
   assert.deepEqual(await claim([randomUUID()]),{status:'disabled',attempts:[]});
   for(const name of archivedPublicFunctions)for(const role of ['anon','authenticated','service_role']){
    assert.equal((await q('select has_function_privilege($1,$2,\'EXECUTE\') yes',[role,name])).yes,role==='service_role');
   }
   for(const name of archivedTables){
    assert.deepEqual(await q('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['private.'+name]),{relrowsecurity:true,relforcerowsecurity:true});
    for(const role of ['anon','authenticated','service_role'])assert.equal((await q("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') yes",[role,'private.'+name])).yes,false);
    await assert.rejects(db.exec('truncate private.'+name+' cascade'),/brand_retention_identity_permanent/);
   }
   const f=await fixture();await assert.rejects(request(f),/archived_brand_verification_disabled/);
   await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
   await assert.rejects(claim([randomUUID()]),/archived_brand_service_role_required/);
   await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);await enable();
  });
  let f,a,r,receipt,before;
  await t.test('pins separate legacy clocks and rejects live, normal-job, stale, held or already-claimed sources',async()=>{
   f=await fixture({legacy:true});before=await snapshot(f);
   assert.notEqual(before.asset.deleted_at,before.incarnation.removed_at);
   assert.equal(await coverage(f),'brand_scan_proof_required');
   await assert.rejects(request({...f,binding:{...f.binding,storageVersion:'stale'}}),/archived_brand_exact_unheld_incarnation_required/);
   await assert.rejects(request(await fixture({archived:false})),/archived_brand_exact_unheld_incarnation_required/);
   await assert.rejects(request(await fixture({normalJob:true})),/archived_brand_exact_unheld_incarnation_required/);
   for(const sizes of [{sourceSize:0,storageSize:0},{storageSize:0},{storageSize:null},{storageSize:22},
    {sourceSize:536870913,storageSize:536870913}]){
    await assert.rejects(request(await fixture(sizes)),/archived_brand_exact_unheld_incarnation_required/);
   }
   await db.query("insert into legal_holds(target_type,target_id,status,placed_by_user_id,reason) values('platform_brand_asset',$1,'active','fixture','Synthetic hold')",[f.id]);
   await assert.rejects(request(f),/archived_brand_exact_unheld_incarnation_required/);
   await db.query("update legal_holds set status='released' where target_id=$1",[f.id]);
   const claimed=await fixture();await db.query('insert into private.platform_brand_expiry_claims(asset_id) values($1)',[claimed.id]);
   await assert.rejects(request(claimed),/archived_brand_exact_unheld_incarnation_required/);
   const id=await request(f);assert.equal(await request(f),id);
   await assert.rejects(claim([id,id]),/archived_brand_exact_bounded_requests_required/);
   await assert.rejects(claim([id,randomUUID(),randomUUID()]),/archived_brand_exact_bounded_requests_required/);
   a=(await claim([id])).attempts[0];assert.ok(a);assert.equal(a.binding.ownerId,'platform_rachi_official');
   assert.equal(a.archiveBinding.removalClock,'legacy_unknown_conservative_observation');
   assert.notEqual(a.archiveBinding.sourceDeletedAt,a.archiveBinding.removedAt);
   assert.deepEqual((await claim([id],'another-worker')).attempts,[]);
   assert.equal((await read(a)).status,'authorized');
   assert.equal((await read({...a,claimToken:randomUUID()})).status,'unavailable');
   assert.equal((await read({...a,workerId:'another-worker'})).status,'unavailable');
   for(const table of ['platform_brand_archived_requests','platform_brand_archived_attempts']){
    await assert.rejects(db.exec('update private.'+table+' set id=id'),/brand_retention_identity_permanent/);
    await assert.rejects(db.exec('delete from private.'+table),/brand_retention_identity_permanent/);
   }
  });
  await t.test('clean requires valid complete observed result, with immutable duplicates and conflict rejection',async()=>{
   await assert.rejects(seal(a,randomUUID()),/archived_brand_exact_clean_result_required/);
   for(const delta of [{status:'clean',fullReadback:false,sha256:null,sizeBytes:null},{signatureVersion:'unknown'},
    {scannerVersion:'unknown'},{exitCode:1},{findingName:'infected'},{errorCode:'error'},{sizeBytes:0},
    {sha256:'x'.repeat(64)},{sizeBytes:22},{sizeBytes:24},{sizeBytes:536870913},{extraField:true},{durationMs:1200001}]){
    await assert.rejects(record(a,{...cleanResult(),...delta}),/archived_brand_scanner_result_invalid/);
   }
   r=await record(a);assert.equal(r.status,'clean');assert.deepEqual(await record(a),r);
   await assert.rejects(record(a,{...cleanResult(),sha256:'b'.repeat(64)}),/archived_brand_result_immutable_conflict/);
   assert.deepEqual((await claim([a.requestId],'other')).attempts,[],'clean result owns lease until sealed or expired');
   receipt=await seal(a,r.resultId);assert.equal(receipt.proofRecorded,true);assert.deepEqual(await seal(a,r.resultId),receipt);
   assert.equal(await coverage(f),'brand_verified_original');
   assert.deepEqual(await snapshot(f),before,'no source/scan/moderation/clock/job/deletion-claim changes');
   assert.deepEqual((await claim([a.requestId])).attempts,[]);
   for(const table of ['platform_brand_archived_results','platform_brand_archived_receipts']){
    await assert.rejects(db.exec('update private.'+table+' set id=id'),/brand_retention_identity_permanent/);
    await assert.rejects(db.exec('delete from private.'+table),/brand_retention_identity_permanent/);
   }
   const p=await q('select * from private.platform_brand_object_proofs where asset_id=$1',[f.id]);assert.equal(p.scan_receipt_id,receipt.receiptId);
   assert.equal((await rpc('claim_platform_brand_retention_expiry',[f.id])).status,'disabled');
  });
  await t.test('failure and infection preserve evidence, never seal, and finite retry budget cannot reset',async()=>{
   const g=await fixture(),id=await request(g);let attempt=(await claim([id])).attempts[0];
   for(let i=1;i<=3;i++){
    const result=await record(attempt,{...cleanResult(),status:'scan_failed',exitCode:2,errorCode:'scan_failed'});
    await assert.rejects(seal(attempt,result.resultId),/archived_brand_exact_clean_result_required/);
    const next=await claim([id]);if(i<3){attempt=next.attempts[0];assert.ok(attempt);}else assert.deepEqual(next.attempts,[]);
   }
   assert.equal((await q('select count(*)::int n from private.platform_brand_archived_attempts where request_id=$1',[id])).n,3);
   assert.equal(await request(g),id,'request replay cannot reset lifetime attempt budget');
   assert.equal(await coverage(g),'brand_scan_proof_required');
   const infected=await fixture(),infectedId=await request(infected),infectedAttempt=(await claim([infectedId])).attempts[0];
   const infectedResult=await record(infectedAttempt,{...cleanResult(),status:'malware_detected',exitCode:1,findingName:'Synthetic.EICAR'});
   await assert.rejects(seal(infectedAttempt,infectedResult.resultId),/archived_brand_exact_clean_result_required/);
   assert.deepEqual((await claim([infectedId])).attempts,[],'infection does not automatically rescan toward clean');
  });
  await t.test('holds, disabled gate and expiry after observation prevent further evidence/receipt authority',async()=>{
   const g=await fixture(),id=await request(g),attempt=(await claim([id])).attempts[0],result=await record(attempt);
   await db.query("insert into legal_holds(target_type,target_id,status,placed_by_user_id,reason) values('platform_brand_asset',$1,'active','fixture','Synthetic hold race')",[g.id]);
   assert.equal((await read(attempt)).status,'unavailable');await assert.rejects(seal(attempt,result.resultId),/archived_brand_attempt_unavailable/);
   await db.query("update legal_holds set status='released' where status='active'");
   await db.exec('update private.platform_brand_retention_settings set archived_verification_enabled=false');
   await assert.rejects(seal(attempt,result.resultId),/archived_brand_attempt_unavailable/);await enable();
   // Synthetic time travel only in a disposable fixture. No production lease,
   // retention clock or immutable evidence is changed by protocol functions.
   await db.exec('alter table private.platform_brand_archived_attempts disable trigger archived_evidence_immutable');
   try{await db.query("update private.platform_brand_archived_attempts set claimed_at=claimed_at-interval '21 minutes',expires_at=expires_at-interval '21 minutes' where id=$1",[attempt.attemptId]);}
   finally{await db.exec('alter table private.platform_brand_archived_attempts enable trigger archived_evidence_immutable');}
   assert.equal((await read(attempt)).status,'unavailable');await assert.rejects(seal(attempt,result.resultId),/archived_brand_attempt_unavailable/);
   assert.ok((await claim([id])).attempts[0],'expired unsealed clean attempt can recover via a new immutable attempt');
  });
  await t.test('ordinary reference guard still refuses removed-key enqueue and all processing settings remain off',async()=>{
   await assert.rejects(rpc('enqueue_media_scan_job',['platform_brand_assets','storage_object_key',f.id,'platform_rachi_official','supabase','platform-brand-assets',f.key,'image/png',23,100,{}]),/brand_retained_reference_forbidden/);
   const flags=await q('select capture_enabled,activation_ready,text_expiry_enabled,media_expiry_enabled,media_staging_enabled from private.deleted_content_retention_settings');
   assert.ok(Object.values(flags).every(x=>x===false));
   const brand=await q('select expiry_enabled,batch_enabled,version_delete_verified from private.platform_brand_retention_settings');assert.ok(Object.values(brand).every(x=>x===false));
  });
 } finally {await db.close();}
});

test('forward migration preserves original validator OIDs, warmed behavior and held guard bodies',{timeout:240000},async()=>{
 const h=await archivedDatabase({excludeMigrations:[archivedMigration]});const {db,q}=h;
 try {
  const identity=['private.platform_brand_scan_byte_receipt_matches(uuid,jsonb,text,bigint)','private.platform_brand_claimed_scan_evidence_matches(uuid,uuid,jsonb,text,bigint)'];
  const guards=['private.guard_platform_brand_retention_references()','private.guard_deleted_content_secondary_coverage()'];
  const snapshot=async()=>Promise.all([...identity,...guards].map(async name=>({name,...await q('select oid::text,prosrc from pg_proc where oid=$1::regprocedure',[name])})));
  const before=await snapshot();
  assert.equal((await q("select private.platform_brand_scan_byte_receipt_matches($1,'{}',$2,23) yes",[randomUUID(),'a'.repeat(64)])).yes,false);
  await applyBrandMigrationStatements(db,readFileSync('supabase/migrations/'+archivedMigration,'utf8'));
  const after=await snapshot();for(let i=0;i<before.length;i++)assert.equal(after[i].oid,before[i].oid);
  for(let i=2;i<before.length;i++)assert.equal(after[i].prosrc,before[i].prosrc);
  assert.equal((await q("select private.platform_brand_scan_byte_receipt_matches($1,'{}',$2,23) yes",[randomUUID(),'a'.repeat(64)])).yes,false);
 }finally{await db.close();}
});
