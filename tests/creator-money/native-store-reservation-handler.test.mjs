import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';import ts from 'typescript';
const api={};new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../../supabase/functions/_shared/native-store-sandbox-reservation-v1.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api);
const uuid=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=()=>({userId:uuid(1),accountId:uuid(1),sessionGeneration:uuid(2)});
const command=()=>({protocol:'native-store-sandbox-reservation-v1',command:'reserve',requestId:uuid(3),payload:{selectionId:'nssv1_selection_'+uuid(4)}});
const result=(a,c)=>({...c,payload:undefined,actor:a,status:'ok',data:{reservation:{id:'nssv1_reservation_'+uuid(5),selectionId:c.payload.selectionId,originalRequestId:c.requestId,originalSessionGeneration:a.sessionGeneration,createdAt:'2026-11-08T00:00:00Z',quoteDigest:'a'.repeat(64),state:'dispatch_reserved',dispatchAllowed:false,providerQualified:false},reason:null},dispatchAllowed:false,providerQualified:false});
const response=(a,c)=>{const value=result(a,c);delete value.payload;return value;};
test('reservation handler snapshots authority before reading body and freezes execution scope',async()=>{
 const identity=actor(),original=actor(),c=command();let executed;
 const handler=api.createNativeStoreReservationHandlerV1({authenticate:async()=>identity,execute:async(a,request)=>{
  assert.deepEqual(a,original);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(request));assert.ok(Object.isFrozen(request.payload));
  assert.throws(()=>{request.payload.selectionId='changed';},TypeError);executed=request;return response(a,request);
 }});
 const request={method:'POST',text:async()=>{identity.userId=uuid(9);identity.sessionGeneration=uuid(9);return JSON.stringify(c);}};
 const reply=await handler(request);assert.equal(reply.status,200);assert.deepEqual(executed,c);assert.equal((await reply.json()).dispatchAllowed,false);
});
test('reservation boundary rejects untrusted scope and altered authority-bearing responses',async()=>{
 for(const change of [v=>v.dispatchAllowed=true,v=>v.providerQualified=true,v=>v.actor={...v.actor,userId:uuid(8)},v=>v.data.reservation.state='dispatched',v=>v.data.reservation.dispatchAllowed=true,v=>v.data.reservation.selectionId='nssv1_selection_'+uuid(8),v=>v.data.reservation.originalRequestId=uuid(8),v=>v.data.reservation.createdAt='1']){
  const handler=api.createNativeStoreReservationHandlerV1({authenticate:async()=>actor(),execute:async(a,c)=>{const value=response(a,c);change(value);return value;}});
  assert.equal((await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify(command())}))).status,503);
 }
 const handler=api.createNativeStoreReservationHandlerV1({authenticate:async()=>actor(),execute:async()=>assert.fail('must reject body authority')});const c=command();c.payload.buyerId=uuid(8);
 assert.equal((await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify(c)}))).status,400);
});
