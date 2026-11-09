import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
function load(name){const api={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/'+name,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api,s=>load(s.replace(/^\.\//u,'')));return api;}
const api=load('native-store-sandbox-command-v1.ts');
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
test('dispatch contract rejects caller qualification and missing server qualification remains held',async()=>{
 const request={...input,command:'dispatch-consume',payload:{selectionId:'nssv1_selection_'+id(40),reservationId:'nssv1_reservation_'+id(41)}};
 assert.ok(api.parseNativeStoreSandboxRequestV1(request));
 for(const extra of [{verified:true},{qualification:{}},{dispatchAllowed:true},{buyerId:actor.userId}])assert.equal(api.parseNativeStoreSandboxRequestV1({...request,payload:{...request.payload,...extra}}),null);
 const value={...held(request),data:{attempt:null,qualification:null,newlyConsumed:false,reason:'qualification_unavailable'}};
 const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>actor,execute:async()=>value});
 const response=await handler(req(request));assert.equal(response.status,200);assert.equal((await response.json()).dispatchAllowed,false);
 assert.equal(api.validateNativeStoreSandboxResultV1({...value,dispatchAllowed:true},actor,request),false);
});
test('synthetic wire validation permits only exact first iOS consume, never replay or Android admission',()=>{
 const request={...input,command:'dispatch-consume',payload:{selectionId:'nssv1_selection_'+id(40),reservationId:'nssv1_reservation_'+id(41)}};
 const qualification={id:'nssv1_qualification_'+id(44),revision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',wireProductId:'synthetic-product',catalogBindingId:'nssv1_catalog_'+id(45),catalogRevision:1,quoteDigest:'a'.repeat(64),connectionId:id(46),connectionRevision:1,protocolEvidenceSha256:'b'.repeat(64),platform:'ios',nativeBuild:'synthetic-build',nativeVersion:'synthetic-version',signedAppVersion:'synthetic-signed-version',sdkVersion:'synthetic-sdk',noChargeAccountScope:'testflight_distribution',accountEvidenceSha256:'c'.repeat(64)};
 const attempt={id:'nssv1_attempt_'+id(42),reservationId:request.payload.reservationId,selectionId:request.payload.selectionId,originalRequestId:request.requestId,originalSessionGeneration:actor.sessionGeneration,quoteDigest:'a'.repeat(64),createdAt:'2026-11-09T00:00:00Z',state:'consumed',dispatchAllowed:false,providerQualified:false};
 const value={...held(request),status:'ok',data:{attempt,qualification,newlyConsumed:true,reason:null},dispatchAllowed:true};
 assert.equal(api.validateNativeStoreSandboxResultV1(value,actor,request),true);
 for(const mutate of [v=>v.data.attempt.originalRequestId=id(99),v=>v.data.attempt.reservationId='nssv1_reservation_'+id(99),v=>v.data.attempt.originalSessionGeneration=id(99),v=>v.data.attempt.dispatchAllowed=true,v=>v.data.qualification.environment='PRODUCTION',v=>v.data.qualification.accountEvidenceSha256='',v=>v.data.qualification.extra=true,v=>v.data.newlyConsumed=false,v=>{v.data.qualification.store='PLAY_STORE';v.data.qualification.platform='android';v.data.qualification.noChargeAccountScope='play_license_account';}]){
  const bad=structuredClone(value);mutate(bad);assert.equal(api.validateNativeStoreSandboxResultV1(bad,actor,request),false);
 }
 const recovered={...value,command:'dispatch-recover',dispatchAllowed:false,data:{...value.data,newlyConsumed:false}};
 assert.equal(api.validateNativeStoreSandboxResultV1(recovered,actor,{...request,command:'dispatch-recover'}),true);
 assert.equal(api.validateNativeStoreSandboxResultV1({...recovered,dispatchAllowed:true},actor,{...request,command:'dispatch-recover'}),false);
});
test('qualification discovery accepts only selection and never returns dispatch permission or attempt',()=>{
 const request={...input,command:'dispatch-qualification',payload:{selectionId:'nssv1_selection_'+id(40)}};
 assert.ok(api.parseNativeStoreSandboxRequestV1(request));assert.equal(api.parseNativeStoreSandboxRequestV1({...request,payload:{...request.payload,reservationId:'nssv1_reservation_'+id(41)}}),null);
 const value={...held(request),data:{qualification:null,reason:'qualification_unavailable'}};
 assert.equal(api.validateNativeStoreSandboxResultV1(value,actor,request),true);
 assert.equal(api.validateNativeStoreSandboxResultV1({...value,dispatchAllowed:true},actor,request),false);
 assert.equal(api.validateNativeStoreSandboxResultV1({...value,data:{...value.data,attempt:null}},actor,request),false);
});
