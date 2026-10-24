// Offline-only actual-handler/SDK/SQL/signed-origin integration. No live fetch.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createClient} from '@supabase/supabase-js';
import {loadQualificationModule,fixtureNow,qualificationMigrationSource,fixtureAdmissionClockSQL,
  qualificationCatalogFingerprintSQL,assertClockOnlyCatalogChange} from '../../../tests/helpers/r2-qualification-fixture.mjs';
import {createSyntheticQualificationR2} from '../../../tests/helpers/r2-qualification-r2-fixture.mjs';
const {createQualificationRuntime}=loadQualificationModule('r2-disposable-qualification-runtime.ts');
const {createQualificationHandler}=loadQualificationModule('r2-disposable-qualification-handler.ts');
const {initialState}=loadQualificationModule('r2-disposable-qualification.ts');
const {RUN_ID,DEADLINE,BUCKET,R2_ENDPOINT,OBJECTS,MUTATION_RECEIPTS,manifestHash}=loadQualificationModule('r2-disposable-qualification-manifest.ts');
const project='https://bmkkhihfbmsnnmcqkoly.supabase.co',key='synthetic-cleanup-service';
const readUrl=project+'/rest/v1/rpc/read_r2_qualification_test_run',casUrl=project+'/rest/v1/rpc/cas_r2_qualification_test_run';

async function fixture(){
  const db=new PGlite(),database=[],envReads=[];let clock=Date.parse(fixtureNow);
  await db.exec('create role anon;create role authenticated;create role service_role;');
  await db.exec(qualificationMigrationSource);
  const catalog=(await db.query(qualificationCatalogFingerprintSQL)).rows[0].v;
  await db.exec(fixtureAdmissionClockSQL);
  assertClockOnlyCatalogChange(catalog,(await db.query(qualificationCatalogFingerprintSQL)).rows[0].v);
  await db.query('insert into r2_qualification_test_private.run(state,setup_approval_ref) values($1,$2)',
    [await initialState(),'approved:offline-synthetic-setup']);
  await db.exec('set role service_role');
  const provider=createSyntheticQualificationR2({now:()=>clock});
  const env={SUPABASE_URL:project,RETENTION_WORKER_SERVICE_KEY_SHA256:createHash('sha256').update(key).digest('hex'),
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-authority',MEDIA_ORIGIN_PROVIDER:'cloudflare_r2',
    MEDIA_ORIGIN_PRIVATE_ONLY:'true',MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',MEDIA_ORIGIN_R2_ENDPOINT:R2_ENDPOINT,
    MEDIA_ORIGIN_BUCKET:BUCKET,MEDIA_ORIGIN_R2_ACCESS_KEY_ID:'synthetic-access',MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:'synthetic-secret'};
  const runtime=createQualificationRuntime({env:name=>{envReads.push(name);return env[name];},createClient,now:()=>clock,
    request:async(input,init)=>{
      if(input!==readUrl&&input!==casUrl)return provider.request(input,init);
      assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
      assert.equal(init.headers.Authorization,'Bearer '+key);assert.equal(init.headers.apikey,key);
      const args=JSON.parse(init.body),name=input===readUrl?'read_r2_qualification_test_run':'cas_r2_qualification_test_run';
      database.push(name);
      const values=[args.p_run_id,args.p_manifest_hash];
      if(input===casUrl)values.push(args.p_expected_revision,args.p_next_state);
      try{
        const data=(await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) v`,values)).rows[0].v;
        return new Response(JSON.stringify(data));
      }catch{return new Response('{"error":"synthetic_sql_denial"}',{status:400});}
    },
  });
  const handler=createQualificationHandler(runtime);
  const call=(action,authorization='Bearer '+key,extra={})=>handler(new Request('https://synthetic.invalid',{
    method:'POST',headers:{Authorization:authorization},body:JSON.stringify({runId:RUN_ID,action,...extra}),
  }));
  const state=async()=>(await db.query('select public.read_r2_qualification_test_run($1,$2) v',[RUN_ID,await manifestHash()])).rows[0].v;
  const owner=async(fn)=>{await db.exec('reset role');try{return await fn();}finally{await db.exec('set role service_role');}};
  return {db,database,envReads,provider,call,state,owner,setNow:value=>{clock=value;},close:()=>db.close(),
    approveCleanup:()=>owner(()=>db.exec("update r2_qualification_test_private.run set cleanup_approval_ref='approved:offline-exact-cleanup'"))};
}
async function qualify(f){
  for(const [action,status] of [['prepare','prepared'],['read','read_verified'],['conflict','conflict_verified']]){
    const response=await f.call(action);assert.equal(response.status,200);assert.equal((await response.json()).status,status);
  }
  const state=await f.state();
  assert.equal(state.phase,'conflict_verified');assert.equal(state.revision,8);assert.equal(state.pending,null);
  assert.equal(state.requestBudgetReserved,10);assert.equal(state.reconciliations,0);
  for(const object of Object.values(OBJECTS))assert.equal(f.provider.objects.get(object.key),object.payload);
}

test('actual cleanup handler requires owner-recorded SQL approval before receipts or DELETE, then deletes only the two fixed objects',async()=>{
  const f=await fixture();try{
    const initialDb=f.database.length;
    assert.equal((await f.call('cleanup','Bearer wrong')).status,403);
    assert.equal(f.database.length,initialDb);assert.equal(f.provider.requests.length,0);
    await assert.rejects(f.approveCleanup(),/qualification_run_immutable/);
    await qualify(f);
    const before=f.provider.requests.length,stateBefore=await f.state();
    await assert.rejects(f.db.exec("update r2_qualification_test_private.run set cleanup_approval_ref='forged:service-approval'"),/permission denied/);
    for(let repeat=0;repeat<2;repeat++){
      const response=await f.call('cleanup');assert.equal(response.status,503);
      assert.deepEqual(await response.json(),{status:'qualification_unconfirmed'});
      assert.deepEqual(await f.state(),stateBefore);assert.equal(f.provider.requests.length,before);
    }
    assert.equal((await f.call('cleanup','Bearer '+key,{cleanupApproved:true})).status,400);
    assert.equal(f.provider.requests.length,before);
    await f.approveCleanup();
    f.provider.before=async record=>{
      if(record.op.includes('delete_'))assert.equal((await f.state()).phase,'cleanup_started');
    };
    const response=await f.call('cleanup');assert.equal(response.status,200);
    const output=await response.json();assert.equal(output.status,'cleaned');
    assert.equal(output.requestBudgetReserved,16);assert.deepEqual(output.observations.map(o=>o.status),[404,404]);
    assert.deepEqual(f.provider.requests.slice(before).map(r=>r.op),[
      'receipt_delete_target','delete_target','receipt_delete_control','delete_control','get_control','get_target']);
    assert.equal(f.provider.objects.size,5);
    for(const object of Object.values(OBJECTS))assert.ok(!f.provider.objects.has(object.key));
    for(const receipt of Object.values(MUTATION_RECEIPTS))assert.equal(f.provider.objects.get(receipt.key),receipt.payload);
    const after=f.provider.requests.length;
    for(const action of ['cleanup','prepare','read','conflict','reconcile','status','cleanup']){
      const repeated=await f.call(action);assert.equal(repeated.status,200);assert.equal((await repeated.json()).status,'cleaned');
    }
    assert.equal(f.provider.requests.length,after);
    assert.deepEqual(f.provider.requests.filter(r=>r.method==='DELETE').map(r=>r.key),[OBJECTS.target.key,OBJECTS.control.key]);
    assert.ok(!f.envReads.includes('SUPABASE_SERVICE_ROLE_KEY'));
    for(const secret of [key,'synthetic-secret',OBJECTS.target.key])assert.ok(!JSON.stringify(output).includes(secret));
  }finally{await f.close();}
});
test('SQL-approved cleanup remains behind auth and unchanged deadline with no new provider dispatch',async()=>{
  const f=await fixture();try{
    await qualify(f);await f.approveCleanup();const before=f.provider.requests.length,stateBefore=await f.state();
    const databaseBefore=f.database.length;
    assert.equal((await f.call('cleanup','Bearer synthetic-not-authority')).status,403);
    assert.equal(f.database.length,databaseBefore);
    for(const clock of [Date.parse(DEADLINE),Date.parse(DEADLINE)+1,NaN]){
      f.setNow(clock);const response=await f.call('cleanup');assert.equal(response.status,503);
      assert.deepEqual(await response.json(),{status:'qualification_unconfirmed'});
      assert.deepEqual(await f.state(),stateBefore);assert.equal(f.provider.requests.length,before);
    }
    assert.ok(f.database.slice(databaseBefore).every(name=>name==='read_r2_qualification_test_run'));
    const status=await f.call('status');assert.equal(status.status,200);assert.equal((await status.json()).status,'conflict_verified');
    for(const object of Object.values(OBJECTS))assert.equal(f.provider.objects.get(object.key),object.payload);
  }finally{await f.close();}
});
test('actual cleanup handler preserves uncertain DELETE intent and read-reconciles without replay',async()=>{
  const f=await fixture();try{
    await qualify(f);await f.approveCleanup();
    f.provider.after=record=>{if(record.op==='delete_target'){f.provider.after=null;throw Error('synthetic lost DELETE response');}};
    const failed=await f.call('cleanup');assert.equal(failed.status,503);
    assert.deepEqual(await failed.json(),{status:'qualification_unconfirmed'});
    assert.equal((await f.state()).pending,'delete_target');
    const before=f.provider.requests.length,repeated=await f.call('cleanup');assert.equal(repeated.status,200);
    assert.equal((await repeated.json()).status,'pending_reconcile_required');assert.equal(f.provider.requests.length,before);
    const reconciled=await f.call('reconcile');assert.equal(reconciled.status,200);
    assert.equal((await reconciled.json()).status,'delete_absence_reconciled');
    const completed=await f.call('cleanup');assert.equal(completed.status,200);assert.equal((await completed.json()).status,'cleaned');
    for(const operation of ['delete_target','delete_control'])assert.equal(f.provider.requests.filter(r=>r.op===operation).length,1);
    for(const receipt of Object.values(MUTATION_RECEIPTS))assert.equal(f.provider.objects.get(receipt.key),receipt.payload);
  }finally{await f.close();}
});
