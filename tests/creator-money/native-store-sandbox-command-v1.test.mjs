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
