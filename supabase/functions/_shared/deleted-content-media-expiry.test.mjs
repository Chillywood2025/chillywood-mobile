import assert from 'node:assert/strict';
import test from 'node:test';
import {runDeletedMediaExpiryBatch,runDeletedStageCleanupBatch} from './deleted-content-media-expiry.ts';
import {createRetiredMediaOriginCleanup} from './deleted-content-origin.ts';
import {runDeletedContentRetentionWorker} from './deleted-content-retention-worker.ts';
const stage='11111111-1111-4111-8111-111111111111',claim='22222222-2222-4222-8222-222222222222';
const binding={claimId:claim,provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:'synthetic/source.mp4'};
const fixture=(change={})=>{
 const calls=[];
 const rpc=async(name,args)=>{
  calls.push([name,args]);
  const values={list_deleted_content_media_expiry_work:{enabled:true,stageIds:[stage]},
   claim_deleted_content_media_expiry:{status:'claimed',claimId:claim},
   read_deleted_content_media_expiry_claim:{status:'authorized',...binding},
   record_deleted_content_media_expiry_result:{status:args.p_result,permanentlyAbsent:false},...change};
  return {data:values[name],error:null};
 };return {rpc,calls};
};
test('disabled media worker makes no provider or mutation calls',async()=>{
 const f=fixture({list_deleted_content_media_expiry_work:{enabled:false}});
 assert.deepEqual(await runDeletedMediaExpiryBatch(f.rpc,()=>{throw Error('must not call')}),{enabled:false,results:[]});
 assert.equal(f.calls.length,1);
});
test('hold and changed reference proof prevent provider calls',async()=>{
 for(const change of [{claim_deleted_content_media_expiry:{status:'held'}},{read_deleted_content_media_expiry_claim:{status:'retirement_proof_changed'}}]){
  const f=fixture(change);await runDeletedMediaExpiryBatch(f.rpc,()=>{throw Error('must not call')});
  assert.ok(!f.calls.some(([name])=>name==='record_deleted_content_media_expiry_result'));
 }
});
test('durable claim plus fresh proof precede DELETE, then HEAD observation is audited',async()=>{
 const f=fixture(),methods=[];
 const result=await runDeletedMediaExpiryBatch(f.rpc,async(b,method)=>{
  assert.equal(f.calls.at(-1)[0],'read_deleted_content_media_expiry_claim');assert.equal(b.objectKey,binding.objectKey);
  methods.push(method);return new Response(null,{status:method==='DELETE'?204:404});
 });
 assert.deepEqual(methods,['DELETE','HEAD']);assert.equal(result.results[0].status,'observed_absent');
 assert.equal(f.calls.at(-1)[1].p_result,'observed_absent');
});
test('late bytes or unknown request failure never report absent',async()=>{
 for(const mode of ['late','failed']){
  const f=fixture();const result=await runDeletedMediaExpiryBatch(f.rpc,async(_b,method)=>{
   if(mode==='failed')throw Error('unknown outcome');return new Response(null,{status:method==='DELETE'?204:200});
  });
  assert.equal(result.results[0].status,mode==='late'?'delete_acknowledged':'failed');
 }
});
test('audit failure is not reported as successful cleanup',async()=>{
 const f=fixture();await assert.rejects(runDeletedMediaExpiryBatch(async(n,a)=>n==='record_deleted_content_media_expiry_result'?{data:null,error:{}}:f.rpc(n,a),async()=>new Response(null,{status:404})),/rpc_failed/);
});
const environment={MEDIA_ORIGIN_PROVIDER:'cloudflare_r2',MEDIA_ORIGIN_PRIVATE_ONLY:'true',MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',MEDIA_ORIGIN_R2_ENDPOINT:'https://synthetic.r2.cloudflarestorage.com',MEDIA_ORIGIN_BUCKET:'chillywood-media-origin',MEDIA_ORIGIN_R2_ACCESS_KEY_ID:'synthetic-access',MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY:'synthetic-secret'};
test('worker-only signer keeps DELETE private, no redirects, and binds canonical provider',async()=>{
 const calls=[];const origin=createRetiredMediaOriginCleanup(k=>environment[k],async(url,init)=>{calls.push({url,init});return new Response(null,{status:204});});
 await origin(binding,'DELETE');assert.equal(calls[0].init.method,'DELETE');assert.equal(calls[0].init.redirect,'error');
 assert.ok(calls[0].url.startsWith('https://chillywood-media-origin.synthetic.r2.cloudflarestorage.com/'));
 await assert.rejects(origin({...binding,provider:'s3'},'DELETE'),/binding_invalid/);
 await assert.rejects(origin({...binding,objectKey:'../escape'},'DELETE'),/binding_invalid/);
 assert.equal(calls.length,1);
});
test('provider exceptions cannot leak private signed URLs',async()=>{
 const origin=createRetiredMediaOriginCleanup(k=>environment[k],async()=>{throw Error('https://secret-signed-url');});
 await assert.rejects(origin(binding,'DELETE'),e=>e.message==='retired_media_origin_request_failed');
});
test('orphan cleanup uses its own claims and never creates a content expiry claim',async()=>{
 const calls=[],methods=[];
 const result=await runDeletedStageCleanupBatch(async(name,args)=>{
  calls.push(name);
  const replies={
   list_deleted_content_stage_cleanup_work:{enabled:true,stageIds:[stage]},
   reconcile_deleted_content_stage:{status:'claimed',claimId:claim},
   read_deleted_content_stage_cleanup_claim:{status:'authorized',...binding},
   record_deleted_content_stage_cleanup_result:{status:args.p_result,permanentlyAbsent:false},
  };
  return {data:replies[name],error:null};
 },async(_binding,method)=>{methods.push(method);return new Response(null,{status:method==='DELETE'?204:404});});
 assert.deepEqual(calls,['list_deleted_content_stage_cleanup_work','reconcile_deleted_content_stage',
  'read_deleted_content_stage_cleanup_claim','record_deleted_content_stage_cleanup_result']);
 assert.deepEqual(methods,['DELETE','HEAD']);
 assert.equal(result.results[0].status,'observed_absent');
});
test('malformed queues, claims, provider bindings and receipts fail closed',async()=>{
 for(const change of [
  {list_deleted_content_media_expiry_work:{}},
  {list_deleted_content_media_expiry_work:{enabled:true,stageIds:[stage,stage]}},
  {claim_deleted_content_media_expiry:{status:'claimed',claimId:'-'.repeat(36)}},
  {read_deleted_content_media_expiry_claim:{status:'authorized',...binding,provider:'s3'}},
  {read_deleted_content_media_expiry_claim:{status:'authorized',...binding,claimId:stage}},
 ]){
  const f=fixture(change);let providerCalls=0;
  await assert.rejects(runDeletedMediaExpiryBatch(f.rpc,async()=>{providerCalls++;return new Response(null,{status:204});}),/invalid/);
  assert.equal(providerCalls,0);
 }
 const f=fixture({record_deleted_content_media_expiry_result:{status:'purged',permanentlyAbsent:true}});
 await assert.rejects(runDeletedMediaExpiryBatch(f.rpc,async()=>new Response(null,{status:404})),/receipt_invalid/);
});
test('disabled complete pass records liveness without constructing or calling an origin',async()=>{
 const calls=[];
 const result=await runDeletedContentRetentionWorker(async(name)=>{
  calls.push(name);
  if(name==='list_platform_brand_retention_expiry_work')return {data:{enabled:false,qualified:false,assetIds:[],limit:25},error:null};
  if(name==='record_platform_brand_retention_worker_heartbeat')return {data:{status:'recorded',enabled:false,qualified:false,permanentlyAbsent:false},error:null};
  return {data:name==='record_deleted_content_worker_heartbeat'?null:{enabled:false},error:null};
 },()=>{throw Error('disabled provider');},()=>{throw Error('disabled Brand provider');});
 assert.deepEqual(calls,['list_deleted_content_expiry_work','list_deleted_content_media_expiry_work',
  'list_deleted_content_stage_cleanup_work','list_platform_brand_retention_expiry_work',
  'record_platform_brand_retention_worker_heartbeat','record_deleted_content_worker_heartbeat']);
 assert.equal(result.brand.enabled,false);assert.equal(result.brand.qualified,false);assert.equal(result.success,true);
 assert.equal(result.permanentPhysicalAbsenceGuaranteed,false);
});
test('provider or receipt failure cannot refresh a successful worker heartbeat',async()=>{
 for(const failReceipt of [false,true]){
  const calls=[],f=fixture();
  await assert.rejects(runDeletedContentRetentionWorker(async(name,args)=>{
   calls.push(name);
   if(name==='list_deleted_content_expiry_work'||name==='list_deleted_content_stage_cleanup_work'){
    return {data:{enabled:false},error:null};
   }
   if(failReceipt&&name==='record_deleted_content_media_expiry_result')return {data:null,error:{message:'synthetic unavailable'}};
   return f.rpc(name,args);
  },async()=>new Response(null,{status:failReceipt?404:503}),()=>{throw Error('must not dispatch Brand');}),/failed/);
  assert.ok(!calls.includes('record_deleted_content_worker_heartbeat'));
 }
});

const protocols=[{
 kind:'media',run:runDeletedMediaExpiryBatch,
 list:'list_deleted_content_media_expiry_work',claim:'claim_deleted_content_media_expiry',
 read:'read_deleted_content_media_expiry_claim',record:'record_deleted_content_media_expiry_result',
 claimStatuses:['disabled','source_busy','not_finalized','missing_deletion_record','not_due','held',
  'unsupported_or_live_reference','unsupported_soft_source','parent_deletion_unproven','source_live_or_changed'],
 crossProtocolStatus:'finalized',
},{
 kind:'stage',run:runDeletedStageCleanupBatch,
 list:'list_deleted_content_stage_cleanup_work',claim:'reconcile_deleted_content_stage',
 read:'read_deleted_content_stage_cleanup_claim',record:'record_deleted_content_stage_cleanup_result',
 claimStatuses:['disabled','source_busy','absent','original_provenance_required','finalized','not_due',
  'attached_requires_explicit_content_delete','original_parent_provenance_required','held','unsupported_or_live_reference'],
 crossProtocolStatus:'not_finalized',
}];
function protocolFixture(protocol,overrides={}) {
 const calls=[];
 const rpc=async(name,args)=>{
  calls.push({name,args});
  const values={
   [protocol.list]:{enabled:true,stageIds:[stage]},
   [protocol.claim]:{status:'claimed',claimId:claim},
   [protocol.read]:{status:'authorized',...binding},
   [protocol.record]:{status:args.p_result,permanentlyAbsent:false},
   ...overrides,
  };
  return {data:values[name],error:null};
 };
 return {rpc,calls};
}
for(const protocol of protocols) {
 test(`${protocol.kind} preserves every current SQL claim and read blocker without provider calls`,async()=>{
  for(const [name,statuses] of [[protocol.claim,protocol.claimStatuses],
   [protocol.read,['disabled','absent','retirement_proof_changed']]]) {
   for(const status of statuses) {
    const f=protocolFixture(protocol,{[name]:{status}});
    assert.deepEqual(await protocol.run(f.rpc,()=>{throw Error('must not reach provider');}),{
     enabled:true,results:[{status}],
    });
    assert.equal(f.calls.at(-1).name,name);
    assert.equal(f.calls.some(call=>call.name===protocol.record),false);
   }
  }
 });
 test(`${protocol.kind} rejects unknown, intermediate and cross-protocol status replies`,async()=>{
  for(const [name,statuses] of [
   [protocol.claim,['','future_status','failed','authorized','observed_absent',protocol.crossProtocolStatus,
    'retirement_protocol_unavailable','retirement_claim_denied']],
   [protocol.read,['','future_status','failed','claimed','held','observed_absent']],
  ]) {
   for(const status of statuses) {
    const f=protocolFixture(protocol,{[name]:{status}});
    await assert.rejects(protocol.run(f.rpc,()=>{throw Error('must not reach provider');}),
     name===protocol.claim?/retired_media_claim_invalid/:/retired_media_binding_invalid/);
    assert.equal(f.calls.at(-1).name,name);
    assert.equal(f.calls.some(call=>call.name===protocol.record),false);
   }
  }
 });
 test(`${protocol.kind} rejects UUID case aliases before any claim or provider call`,async()=>{
  const mixedCase='abcdefab-abcd-4abc-8abc-abcdefabcdef';
  const f=protocolFixture(protocol,{[protocol.list]:{enabled:true,stageIds:[mixedCase,mixedCase.toUpperCase()]}});
  await assert.rejects(protocol.run(f.rpc,()=>{throw Error('must not reach provider');}),/retired_media_work_invalid/);
  assert.deepEqual(f.calls.map(call=>call.name),[protocol.list]);
 });
 test(`${protocol.kind} unknown outcomes cannot refresh successful worker heartbeats`,async()=>{
  for(const name of [protocol.claim,protocol.read]) {
   const f=protocolFixture(protocol,{[name]:{status:'future_status'}}),calls=[];
   await assert.rejects(runDeletedContentRetentionWorker(async(rpcName,args)=>{
    calls.push(rpcName);
    if(rpcName.startsWith('list_')&&rpcName!==protocol.list)return {data:{enabled:false},error:null};
    return f.rpc(rpcName,args);
   },()=>{throw Error('must not reach R2');},()=>{throw Error('must not reach Brand');}),/retired_media_.*_invalid/);
   assert.equal(calls.some(call=>call.includes('heartbeat')),false);
   assert.equal(calls.at(-1),name);
  }
 });
 test(`${protocol.kind} stream cancellation never delays or changes provider acknowledgements`,async()=>{
  for(const at of ['DELETE','HEAD']) {
   for(const cancellation of ['pending','rejected','throws','locked']) {
    for(const headStatus of [200,404]) {
     const f=protocolFixture(protocol),methods=[],cancelled=[];let release,timer,reader;
     const waiting=new Promise(resolve=>{release=resolve;});
     try {
      const work=protocol.run(f.rpc,async(_binding,method)=>{
       methods.push(method);
       if(method!==at)return new Response(null,{status:method==='DELETE'?204:headStatus});
       const body=new ReadableStream({cancel(){
        cancelled.push(method);
        return cancellation==='pending'?waiting:cancellation==='rejected'?Promise.reject(Error('synthetic-private-cancel')):undefined;
       }});
       if(cancellation==='throws')body.cancel=()=>{cancelled.push(method);throw Error('synthetic-private-cancel');};
       const response=new Response(body,{status:method==='DELETE'?200:headStatus});
       if(cancellation==='locked')reader=response.body.getReader();
       return response;
      });
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup blocked audit receipt')),500);});
      const result=await Promise.race([work,deadline]);
      const status=headStatus===404?'observed_absent':'delete_acknowledged';
      assert.deepEqual(result,{enabled:true,results:[{status}]},`${at} ${cancellation} HEAD ${headStatus}`);
      assert.deepEqual(methods,['DELETE','HEAD']);
      assert.deepEqual(cancelled,cancellation==='locked'?[]:[at]);
      assert.deepEqual(f.calls.at(-1),{name:protocol.record,args:{p_claim_id:claim,p_result:status}});
     } finally {clearTimeout(timer);release();reader?.releaseLock();}
    }
   }
  }
 });
}
