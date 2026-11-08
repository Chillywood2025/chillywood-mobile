import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createCaptureRecovery,runCaptureRecoveryPass} from './recovery.mjs';
const id='a2f4c6d8-1234-4234-8234-123456789abc';
const sourceSha256=JSON.parse(fs.readFileSync(new URL('./source-manifest.json',import.meta.url),'utf8')).installationSourceSha256;
const target={protocol:'scv3-capture-recovery-target-v1',installationId:id,sourceSha256,consumerBinding:'sandbox-commerce-v1:protocol-3:capture-composed-v1',projectId:'synthetic-project',connectionId:id,connectionRevision:1,providerConfigurationDigest:'2'.repeat(64)};
const result={protocol:'scv3-capture-reconciliation-v1',target,ingressId:id,authorityGranted:false,result:{protocol:'scv3-test-store-ingress-result-v1',receiptId:id,status:'recorded',durable:true,acknowledgementAllowed:true,authorityGranted:false,financialAuthority:false}};
const config={projectRef:'abcdefghijklmnopqrst',serviceRoleKey:'synthetic-local-secret-0000000000000000',expectedTarget:target,installationMode:'bootstrap'};
test('exact retained identity uses fixed PostgREST route, immutable server credential and one request',async()=>{
 let calls=0;const api=createCaptureRecovery({...config,request:async(url,init)=>{calls++;assert.equal(url,'https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/isolated_test_store_capture_reconcile_v3');
  assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer '+config.serviceRoleKey);assert.deepEqual(JSON.parse(init.body),{p_expected_target:target,p_ingress_id:id});return Response.json(result);}});
 assert.deepEqual(await api.reconcile(id),result);assert.equal(calls,1);
});
test('invalid destination or replacement receipt fields never reach transport',()=>{
 let calls=0;const request=()=>{calls++;throw Error();};assert.throws(()=>createCaptureRecovery({...config,projectRef:'https://evil.invalid',request}));
 assert.throws(()=>createCaptureRecovery({...config,expectedTarget:{...target,sourceSha256:'0'.repeat(64)},request}));
 assert.throws(()=>createCaptureRecovery({...config,installationMode:'retained',request}));
 assert.throws(()=>createCaptureRecovery({...config,installationMode:'../elsewhere',request}));
 const api=createCaptureRecovery({...config,request});assert.throws(()=>api.reconcile({id,receipt:{}}));assert.throws(()=>api.pending({limit:33}));assert.equal(calls,0);
});
test('uncertain response never retries or accepts positive authority',async()=>{
 for(const response of [()=>{throw Error('synthetic lost response');},()=>Response.json({...result,authorityGranted:true}),()=>Response.json({...result,ingressId:'wrong'}),()=>Response.json({...result,target:{...target,projectId:'wrong-target'}}),()=>new Response(null,{status:302,headers:{location:'https://synthetic.invalid'}})]){
  let calls=0;const api=createCaptureRecovery({...config,request:async()=>{calls++;return response();}});await assert.rejects(api.reconcile(id),/outcome_unknown/u);assert.equal(calls,1);
 }
});
test('bounded pending discovery preserves stable opaque cursor and no authority',async()=>{
 const value={protocol:'scv3-capture-pending-v1',target,rows:[{ingressId:id,firstDeferredAt:'2026-11-07T01:02:03Z',reason:'capture_admission_unavailable'}],authorityGranted:false,nextCursor:id};
 const api=createCaptureRecovery({...config,request:async(url,init)=>{assert.ok(url.endsWith('/isolated_test_store_capture_pending_v3'));assert.deepEqual(JSON.parse(init.body),{p_expected_target:target,p_after:null,p_limit:1});return Response.json(value);}});
 assert.deepEqual(await api.pending({limit:1}),value);
});
test('oversized body is cancelled and cannot claim success',async()=>{
 let cancelled=0;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(65537));},cancel(){cancelled++;}});
 const api=createCaptureRecovery({...config,request:async()=>new Response(stream)});await assert.rejects(api.reconcile(id),/outcome_unknown/u);assert.equal(cancelled,1);
});
test('automatic bounded pass advances past still-deferred entries and preserves exact local identities',async()=>{
 const second='b2f4c6d8-1234-4234-8234-123456789abc',states=[],calls=[];
 const out=await runCaptureRecoveryPass({state:{cursor:null,inFlight:null,lastUnknown:null},save:state=>states.push(state),api:{
  pending:async({after,limit})=>{assert.equal(after,null);assert.equal(limit,8);return{rows:[{ingressId:id},{ingressId:second}],nextCursor:second};},
  reconcile:async value=>{calls.push(value);assert.equal(states.at(-1).inFlight,value);return{result:{status:'recorded'}};}}});
 assert.deepEqual(calls,[id,second]);assert.equal(out.nextCursor,second);assert.equal(states.at(-1).inFlight,null);assert.equal(out.authorityGranted,false);
});
test('unknown dispatch stops this pass but durable cursor lets later work run next',async()=>{
 const second='b2f4c6d8-1234-4234-8234-123456789abc',states=[];
 const out=await runCaptureRecoveryPass({state:{cursor:null,inFlight:null,lastUnknown:null},save:state=>states.push(state),api:{
  pending:async()=>({rows:[{ingressId:id},{ingressId:second}],nextCursor:second}),reconcile:async value=>{assert.equal(value,id);throw Error('lost acknowledgement');}}});
 assert.equal(out.status,'outcome_unknown');assert.deepEqual(states.at(-1),{cursor:id,inFlight:null,lastUnknown:id});assert.equal(out.attempts.length,1);
 const next=await runCaptureRecoveryPass({state:states.at(-1),save:state=>states.push(state),api:{
  pending:async({after})=>{assert.equal(after,id);return{rows:[{ingressId:second}],nextCursor:null};},reconcile:async value=>{assert.equal(value,second);return{result:{status:'recorded'}};}}});
 assert.equal(next.nextCursor,null);assert.equal(states.at(-1).lastUnknown,id);
});
test('interrupted local projection retains uncertainty, advances sweep and respects absolute pass budget',async()=>{
 const states=[];let clock=0,calls=0;
 const out=await runCaptureRecoveryPass({state:{cursor:null,inFlight:id,lastUnknown:null},save:state=>states.push(state),now:()=>clock,maxDurationMs:5000,api:{
  pending:async({after})=>{assert.equal(after,id);clock=1;return{rows:[{ingressId:id}],nextCursor:id};},reconcile:async()=>{calls++;}}});
 assert.equal(out.status,'budget');assert.equal(calls,0);assert.equal(states[0].lastUnknown,id);
});
