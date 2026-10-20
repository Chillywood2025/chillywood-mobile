import assert from 'node:assert/strict';
import test from 'node:test';
import {runDeletedMediaExpiryBatch} from './deleted-content-media-expiry.ts';
import {createRetiredMediaOriginCleanup} from './deleted-content-origin.ts';
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
