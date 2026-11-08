import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript'),api={};
new Function('exports',ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/native-store-sandbox-command-v1.ts',import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api);
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),accountId:id(1),sessionGeneration:id(2)};
const input={protocol:'native-store-sandbox-command-v1',command:'offer',requestId:id(3),payload:{offerId:'scv1_offer_'+id(4),store:'APP_STORE'}};
const held=(r=input,a=actor)=>({protocol:r.protocol,command:r.command,requestId:r.requestId,actor:a,status:'held',
 data:r.command==='offer'?{quote:null,reason:'catalog_unavailable'}:{selection:null,reason:'preparation_disabled'},dispatchAllowed:false,correlation:'unsupported'});
const req=body=>new Request('https://local.invalid',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body)});
test('valid normal request reaches bound executor once, never dispatches',async()=>{
 let calls=0;const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async({actor:a,request:r})=>{calls++;assert.deepEqual(a,actor);assert.deepEqual(r,input);return held(r,a);}});
 const response=await handler(req(input));assert.equal(response.status,200);assert.equal(calls,1);assert.deepEqual(await response.json(),held());
});
test('missing auth or wrong account/session never executes',async()=>{
 for(const a of [null,{...actor,accountId:id(99)},{...actor,sessionGeneration:'bad'}]){
  let calls=0;const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>a,execute:async()=>{calls++;}});
  assert.equal((await handler(req(input))).status,401);assert.equal(calls,0);
 }
});
test('body and command scope is bounded before executor',async()=>{
 let calls=0;const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async()=>{calls++;}});
 for(const body of ['not json',{...input,command:'purchase'},{...input,userId:id(9)},{...input,payload:{...input.payload,store:'TEST_STORE'}},
  {...input,command:'prepare'},{...input,command:'recover',payload:{originalRequestId:'bad'}}])assert.equal((await handler(req(body))).status,400);
 assert.equal((await handler(req('x'.repeat(16385)))).status,413);assert.equal(calls,0);
});
test('unknown database outcome is not retried or called failed purchase',async()=>{
 let calls=0;const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async()=>{calls++;throw Error('timeout after possible commit');}});
 const response=await handler(req(input));assert.equal(response.status,503);assert.equal(calls,1);
 assert.deepEqual(await response.json(),{error:'native_store_preparation_uncertain',retryPurchase:false});
});
test('wrong actor/request and false authority response cannot escape handler',async()=>{
 for(const patch of [{actor:{...actor,userId:id(9)}},{requestId:id(9)},{dispatchAllowed:true},{correlation:'verified'},
  {status:'ok'},{data:{quote:null,reason:'held',secret:'private'}}]){
  const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async()=>({...held(),...patch})});
  assert.equal((await handler(req(input))).status,503);
 }
});
test('actor is detached while request streams',async()=>{
 const mutable={...actor};let controller;
 const body=new ReadableStream({start(c){controller=c;}});
 const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>mutable,execute:async({actor:a,request:r})=>{assert.deepEqual(a,actor);return held(r,a);}});
 const response=handler(new Request('https://local.invalid',{method:'POST',body,duplex:'half'}));
 await new Promise(resolve=>setTimeout(resolve,0));mutable.userId=id(99);mutable.sessionGeneration=id(99);
 controller.enqueue(new TextEncoder().encode(JSON.stringify(input)));controller.close();assert.equal((await response).status,200);
});
test('claim request is exact and response never upgrades a client assertion',()=>{
 const request={...input,command:'claim',payload:{selectionId:'nssv1_selection_'+id(9),transactionIdentifier:'synthetic-tx',productIdentifier:'synthetic-product'}};
 assert.deepEqual(api.parseNativeStoreSandboxRequestV1(request),request);
 for(const patch of [{transactionIdentifier:' bad'},{transactionIdentifier:'\ud800'},{productIdentifier:'x'.repeat(513)},{buyerId:id(9)}])assert.equal(api.parseNativeStoreSandboxRequestV1({...request,payload:{...request.payload,...patch}}),null);
 const claim={id:'nssv1_claim_'+id(10),selectionId:request.payload.selectionId,originalRequestId:request.requestId,originalSessionGeneration:actor.sessionGeneration,createdAt:'2026-11-08T01:00:00Z',transactionIdentifier:'synthetic-tx',productIdentifier:'synthetic-product',evidence:'client_assertion',settlementAllowed:false};
 const response={...held(request),status:'ok',data:{claim,reason:null}};assert.equal(api.validateNativeStoreSandboxResultV1(response,actor,request),true);
 assert.equal(api.validateNativeStoreSandboxResultV1({...response,data:{claim:{...claim,originalSessionGeneration:id(88)},reason:null}},actor,request),true);
 for(const patch of [{evidence:'provider_verified'},{settlementAllowed:true},{selectionId:'nssv1_selection_'+id(88)},{transactionIdentifier:'other'},{originalSessionGeneration:'bad'}])assert.equal(api.validateNativeStoreSandboxResultV1({...response,data:{claim:{...claim,...patch},reason:null}},actor,request),false);
});
test('existing authenticated command route validates reservation RPC adaptation without laundering authority',async()=>{
 const command={...input,command:'reserve',payload:{selectionId:'nssv1_selection_'+id(9)}};
 const reservation={id:'nssv1_reservation_'+id(10),selectionId:command.payload.selectionId,originalRequestId:command.requestId,originalSessionGeneration:actor.sessionGeneration,createdAt:'2026-11-08T00:00:00Z',quoteDigest:'a'.repeat(64),state:'dispatch_reserved',dispatchAllowed:false,providerQualified:false};
 const rpc={protocol:'native-store-sandbox-reservation-v1',command:'reserve',requestId:command.requestId,actor,status:'ok',data:{reservation,reason:null},dispatchAllowed:false,providerQualified:false};
 const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async({request})=>{assert.ok(Object.isFrozen(request));assert.ok(Object.isFrozen(request.payload));return api.adaptNativeStoreReservationResultV1(rpc);}});
 assert.equal((await handler(req(command))).status,200);
 for(const patch of [{providerQualified:true},{dispatchAllowed:true},{protocol:'other'},{extra:true}])assert.throws(()=>api.adaptNativeStoreReservationResultV1({...rpc,...patch}));
 for(const patch of [{providerQualified:true},{dispatchAllowed:true},{selectionId:'nssv1_selection_'+id(20)},{originalRequestId:id(20)},{createdAt:'November 8, 2026'},{quoteDigest:'x'}]){
  assert.equal(api.validateNativeStoreSandboxResultV1(api.adaptNativeStoreReservationResultV1({...rpc,data:{reservation:{...reservation,...patch},reason:null}}),actor,command),false);
 }
 const recover={...command,command:'reserve-recover'};
 const unknown=api.adaptNativeStoreReservationResultV1({...rpc,command:'reserve-recover',status:'unknown',data:{reservation:null,reason:'reservation_unknown'}});
 assert.equal(api.validateNativeStoreSandboxResultV1(unknown,actor,recover),true);
 assert.equal(api.parseNativeStoreSandboxRequestV1({...command,payload:{...command.payload,buyerId:actor.userId}}),null);
});
