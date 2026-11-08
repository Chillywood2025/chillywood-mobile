import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';

// Synthetic HTTP/crypto fixtures. These do not qualify a provider or device.
globalThis.crypto ??= webcrypto;
const require = createRequire(import.meta.url), ts = require('typescript');
const functions = new URL('../../supabase/functions/', import.meta.url);
function load(path, overrides = {}, deno = { env: { get: () => undefined } }, cache = new Map()) {
  if (cache.has(path)) return cache.get(path);
  const api = {}; cache.set(path, api);
  const source = readFileSync(new URL(path, functions), 'utf8').replaceAll('import.meta.main', 'false');
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(compiled.diagnostics, []);
  new Function('exports', 'require', 'Deno', compiled.outputText)(api, specifier => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    return load(new URL(specifier, new URL(path, functions)).href.slice(functions.href.length), overrides, deno, cache);
  }, deno);
  return api;
}

const { createIsolatedTestStoreV2CommandHandler: handler } = load('_shared/isolated-test-store-v2-command.ts');
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333';
const dispatch='44444444-4444-4444-8444-444444444444', clock=Date.parse('2026-11-07T12:00:00.000Z'), digest='a'.repeat(64);
const actor=()=>({userId:uid,sessionId:sid});
const quote=()=>({offerId:`scv1_offer_${uid}`,offerRevision:1,resourceId:`scv1_resource_${uid}`,resourceRevision:1,creatorId:rid,kind:'creator_tip',amountMinor:199,currency:'usd'});
const customer=()=>({id:`scv2_customer_${uid}`,buyerId:uid,installationId:dispatch,providerAppUserId:`scv2_teststore_${uid}`,configurationDigest:digest,projectId:'synthetic-project',appId:'synthetic-app',providerScopeKey:'["revenuecat","synthetic-project","synthetic-app","TEST_STORE","SANDBOX"]',economicApplicationId:'rc_test_store:synthetic-project:synthetic-app',provider:'revenuecat',store:'TEST_STORE',sourceEnvironment:'SANDBOX'});
const registration=()=>({id:`scv2_registration_${uid}`,providerOfferingId:'offering-id',offeringIdentifier:'offering-lookup',providerPackageId:'package-id',packageIdentifier:'package-lookup',providerProductId:'product-id',productId:'synthetic-tip'});
const allocation=()=>({id:`scv2_allocation_${uid}`,intentId:`scv1_intent_${uid}`,dispatchId:dispatch,customerBindingId:customer().id,configurationDigest:digest,productId:'synthetic-tip',quote:quote(),acceptPurchaseUntil:new Date(clock+900000).toISOString(),registration:registration()});
const receipt=(state='verified')=>({id:`scv1_receipt_${uid}`,state,providerTransactionId:'synthetic-tx',originalTransactionId:'synthetic-original',purchasedAt:new Date(clock).toISOString()});
const body=(command='claim')=>{
 const common={intentId:allocation().intentId};
 const payload=command==='bind'?{installationId:dispatch}:command==='allocate'?{...common,customerBindingId:customer().id,expectedQuote:quote()}:command==='claim'?{...common,dispatchId:dispatch,registrationId:registration().id,expectedQuote:quote()}:command==='advance'?{...common,dispatchId:dispatch,expectedReservationRevision:2,disposition:'retain_unknown',expectedReceiptId:null}:command==='report'?{...common,dispatchId:dispatch,outcome:'sdk_unknown',transactionHint:null}:common;
 return {protocol:'isolated-test-store-v2',command,requestId:rid,expectedSessionId:sid,configurationDigest:digest,payload};
};
const result=(b=body(),patch={})=>({protocol:b.protocol,command:b.command,requestId:b.requestId,actor:actor(),generation:1,environment:'sandbox',result:{
 status:b.command==='bind'?'customer_bound':b.command==='claim'?'dispatch_claimed':b.command==='allocate'?'offering_ready':b.command==='advance'?'released':'pending',
 reason:'synthetic_result',dispatchAllowed:b.command==='claim',retryProviderMutation:false,grantsAccess:false,notPayable:true,
 customer:customer(),allocation:b.command==='bind'?null:allocation(),reservation:{revision:b.command==='advance'?3:2,activeAllocationId:['bind','advance'].includes(b.command)?null:allocation().id},
 authorityValidUntil:b.command==='claim'?new Date(clock+4000).toISOString():null,receipt:null,...patch}});
const token=(claims={sub:uid,session_id:sid})=>'Bearer '+[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'syntheticSignature'].join('.');
const request=(b=body(),init={})=>new Request('https://synthetic.invalid/command',{method:'POST',headers:{authorization:token(),'content-type':'application/json'},body:typeof b==='string'?b:JSON.stringify(b),...init});
const run=async(b=body(),options={})=>{let calls=0;const fn=handler({now:()=>clock,authenticate:async()=>actor(),execute:async()=>{calls++;return result(b);},...options});const response=await fn(request(b));return{response,value:await response.json(),calls};};
test('unrepresentable transaction hints reject before authentication or SQL',async()=>{
 let calls=0;
 for(const hint of ['bad\ud800','bad\udfff','bad\u0000']){
  const b=body('report');b.payload.transactionHint=hint;
  const out=await run(b,{authenticate:async()=>{calls++;return actor();}});
  assert.equal(out.response.status,400);assert.equal(out.calls,0);
 }
 assert.equal(calls,0);
 const b=body('report');b.payload.transactionHint='valid-\ud83d\ude00';assert.equal((await run(b)).response.status,200);
});
test('real five-second deadline cancels a stalled request reader before authority work',async()=>{
 let cancelled=false,calls=0;
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 const req=request(body(),{body:stream,duplex:'half'});
 const fn=handler({authenticate:async()=>{calls++;return actor();},execute:async()=>{calls++;return result();}});
 const started=Date.now(),response=await fn(req),value=await response.json();
 assert.equal(response.status,503);assert.equal(value.outcome,'not_sent');assert.equal(calls,0);
 assert.ok(Date.now()-started>=4800,'real deadline did not run');
 await Promise.resolve();assert.equal(cancelled,true);assert.equal(req.body.locked,false);
});
test('six exact commands preserve distinct stable identity, allocation, registration and reservation',async()=>{
 for(const command of ['bind','allocate','claim','read','report','advance']){const b=body(command),out=await run(b);assert.equal(out.response.status,200);assert.deepEqual(out.value,result(b));assert.equal(out.calls,1);}
});
test('caller cannot set actor, provider facts, live scope, v1 IDs or unknown keys',async()=>{
 for(const change of [b=>b.actor=actor(),b=>b.command='cashout',b=>b.protocol='isolated-test-store-v1',b=>b.payload.providerAppUserId=customer().providerAppUserId,b=>b.payload.registrationId=`scv1_registration_${uid}`,b=>b.payload.expectedQuote.currency='eur',b=>b.payload.expectedQuote.amountMinor='199',b=>b.configurationDigest='A'.repeat(64)]){
 const b=body();change(b);const out=await run(b);assert.equal(out.response.status,400);assert.equal(out.calls,0);}
});
test('advance requires exact CAS revision and explicit retained-receipt or unknown disposition',async()=>{
 for(const change of [b=>b.payload.expectedReservationRevision=0,b=>b.payload.expectedReservationRevision=Number.MAX_SAFE_INTEGER+1,b=>b.payload.disposition='cancelled',b=>b.payload.expectedReceiptId=receipt().id,b=>b.payload.disposition='receipt_recorded']){
 const b=body('advance');change(b);const out=await run(b);assert.equal(out.response.status,400);assert.equal(out.calls,0);}
});
test('duplicate JSON keys, malformed UTF8 and depth overflow never authenticate',async()=>{
 let calls=0;const fn=handler({authenticate:async()=>{calls++;return actor();},execute:async()=>result()});
 for(const raw of [JSON.stringify(body()).replace('"protocol":','"protocol":"bad","protocol":'),'{','{"a":'+'['.repeat(10)+'0'+']'.repeat(10)+'}',new Uint8Array([255])]){
 assert.equal((await fn(new Request('https://synthetic.invalid',{method:'POST',body:raw}))).status,400);}assert.equal(calls,0);
});
test('request byte bounds, HTTP methods and preflight avoid all authority work',async()=>{
 const fn=handler({authenticate:async()=>{throw Error('unexpected');},execute:async()=>{throw Error('unexpected');}});
 assert.equal((await fn(request(' '.repeat(8193)))).status,413);
 assert.equal((await fn(request(body(),{headers:{'content-length':'8193'}}))).status,413);
 assert.equal((await fn(new Request('https://synthetic.invalid'))).status,405);
 assert.equal((await fn(new Request('https://synthetic.invalid',{method:'OPTIONS'}))).status,204);
});
test('exact actor and current expected session are mandatory and deeply frozen',async()=>{
 for(const auth of [null,{userId:uid,sessionId:rid},{userId:1,sessionId:sid}]){
 const out=await run(body(),{authenticate:async()=>auth});assert.equal(out.response.status,401);assert.equal(out.calls,0);}
 const auth=actor();const out=await run(body(),{authenticate:async()=>auth,execute:async input=>{
 auth.userId=rid;assert.equal(input.actor.userId,uid);assert.ok(Object.isFrozen(input.request.payload.expectedQuote));assert.throws(()=>input.request.payload.expectedQuote.amountMinor=1);return result();}});
 assert.equal(out.response.status,200);
});
test('RPC actor, configuration, economic application and customer scope cannot drift',async()=>{
 for(const change of [v=>v.actor.userId=rid,v=>v.generation=2,v=>v.result.customer.buyerId=rid,v=>v.result.customer.configurationDigest='b'.repeat(64),v=>v.result.customer.store='APP_STORE',v=>v.result.customer.providerScopeKey='["revenuecat","other","synthetic-app","TEST_STORE","SANDBOX"]',v=>v.result.customer.economicApplicationId='legacy',v=>v.result.customer.providerAppUserId=uid,v=>v.result.customer.extra=true]){
 const v=result();change(v);assert.equal((await run(body(),{execute:async()=>v})).response.status,503);}
});
test('registration, SKU, quote, dispatch and exact requested identity cannot drift',async()=>{
 for(const change of [v=>v.result.allocation.id='invalid',v=>v.result.allocation.dispatchId=rid,v=>v.result.allocation.intentId=`scv1_intent_${rid}`,v=>v.result.allocation.customerBindingId=`scv2_customer_${rid}`,v=>v.result.allocation.quote.amountMinor=200,v=>v.result.allocation.registration.productId='wrong',v=>v.result.allocation.registration.id=`scv2_registration_${rid}`,v=>v.result.allocation.registration.providerOfferingId=null]){
 const v=result();change(v);assert.equal((await run(body(),{execute:async()=>v})).response.status,503);}
});
test('only a fresh bounded claim for the active reservation can authorize an SDK invocation',async()=>{
 for(const change of [v=>v.result.authorityValidUntil=new Date(clock).toISOString(),v=>v.result.authorityValidUntil=new Date(clock+5001).toISOString(),v=>v.result.reservation.activeAllocationId=null,v=>v.result.receipt=receipt(),v=>v.result.status='pending',v=>v.result.authorityValidUntil=null]){
 const v=result();change(v);assert.equal((await run(body(),{execute:async()=>v})).response.status,503);}
 const b=body('read');assert.equal((await run(b,{execute:async()=>result(b,{status:'dispatch_claimed',dispatchAllowed:true,authorityValidUntil:new Date(clock+1000).toISOString()})})).response.status,503);
});
test('provisioning, unavailable and bind cardinalities cannot hide mismatched state',async()=>{
 const b=body('allocate');assert.equal((await run(b,{execute:async()=>result(b,{status:'provisioning',allocation:{...allocation(),registration:null}})})).response.status,200);
 for(const patch of [{status:'provisioning'},{allocation:null},{customer:null},{reservation:null}]){
 assert.equal((await run(b,{execute:async()=>result(b,patch)})).response.status,503);}
 const read=body('read');assert.equal((await run(read,{execute:async()=>result(read,{status:'unavailable',allocation:null,customer:null,reservation:null})})).response.status,200);
});
test('held projection retains historical receipts without granting or implying native completion',async()=>{
 const b=body('read');for(const state of ['verified','refunded','revoked','quarantined']){
 const out=await run(b,{execute:async()=>result(b,{status:'held',receipt:receipt(state)})});assert.equal(out.response.status,200);assert.equal(out.value.result.dispatchAllowed,false);}
});
test('terminal receipt and explicit release must match retained history and reservation CAS',async()=>{
 const b=body('advance');b.payload.disposition='receipt_recorded';b.payload.expectedReceiptId=receipt().id;
 const valid=result(b,{receipt:receipt()});assert.equal((await run(b,{execute:async()=>valid})).response.status,200);
 for(const change of [v=>v.result.reservation.revision=2,v=>v.result.reservation.activeAllocationId=allocation().id,v=>v.result.receipt=null,v=>v.result.receipt.state='quarantined']){
 const v=structuredClone(valid);change(v);assert.equal((await run(b,{execute:async()=>v})).response.status,503);}
});
test('uncertain RPC error is never retried or exposed',async()=>{
 let calls=0;const out=await run(body(),{execute:async()=>{calls++;throw Error('private-secret');}});
 assert.equal(out.response.status,503);assert.equal(calls,1);assert.equal(out.value.outcome,'unknown');assert.equal(JSON.stringify(out.value).includes('private-secret'),false);
});
test('expired HTTP budget prevents later authentication work from reaching SQL',async()=>{
 let clockNow=clock,calls=0;const out=await run(body(),{now:()=>clockNow,authenticate:async()=>{clockNow+=5000;return actor();},execute:async()=>{calls++;return result();}});
 assert.equal(out.response.status,503);assert.equal(calls,0);assert.equal(out.value.outcome,'not_sent');
});
function edge({auth={user:{id:uid,sessionGeneration:sid}},rpc,duringAuth,env={}}={}){
 const observed={auth:[],rpc:[]};const shared={createAuthClient:()=>({supabaseUrl:'https://synthetic.supabase.invalid',supabaseAnonKey:'synthetic-anon'}),authenticateRequest:async(...args)=>{observed.auth.push(args);await duringAuth?.(...args);return auth;},createAdminClient:()=>({configured:true,client:{rpc:async(...args)=>{observed.rpc.push(args);return rpc?rpc(...args):{data:result(body('read')),error:null};}}})};
 return {...load('isolated-sandbox-test-store-v2/index.ts',{'../_shared/stripe-connect.ts':shared},{env:{get:key=>env[key]}}),observed};
}
test('actual Edge binds authenticated token session to exact readback and dedicated RPC',async()=>{
 const {handler:fn,observed}=edge();const response=await fn(request(body('read')));assert.equal(response.status,200);
 assert.equal(observed.auth.length,1);assert.deepEqual(observed.rpc,[['isolated_test_store_command_v2',{p_buyer_id:uid,p_session_id:sid,p_command:'read',p_request_id:rid,p_configuration_digest:digest,p_payload:body('read').payload}]]);
});
test('actual Edge rejects token-session/readback mismatch, missing session and Auth failure',async()=>{
 for(const auth of [{user:{id:uid,sessionGeneration:rid}},{user:{id:uid}},{error:new Response(null,{status:401})}]){
 const e=edge({auth});assert.equal((await e.handler(request(body('read')))).status,401);assert.equal(e.observed.rpc.length,0);}
 for(const authorization of [token({sub:uid}),token({sub:uid,session_id:null}),'Bearer bad']){
 const e=edge();assert.equal((await e.handler(request(body('read'),{headers:{authorization}}))).status,401);assert.equal(e.observed.rpc.length,0);}
});
test('actual Edge freezes bearer during asynchronous verification',async()=>{
 const req=request(body('read'));const e=edge({duringAuth:async frozen=>{req.headers.set('authorization',token({sub:uid,session_id:rid}));assert.equal(frozen.headers.get('authorization'),token());}});
 assert.equal((await e.handler(req)).status,200);assert.equal(e.observed.rpc[0][1].p_session_id,sid);
});
test('default-off provisioning returns durable pending without provider or worker invocation',async()=>{
 const b=body('allocate');const e=edge({rpc:async()=>({data:result(b,{status:'provisioning',allocation:{...allocation(),registration:null}}),error:null})});
 assert.equal((await e.handler(request(b))).status,200);assert.equal(e.observed.rpc.length,1);
});
test('enabled provisioning wake-up uses only exact private plan resolution and service-authenticated local worker',async()=>{
 const b=body('allocate'),calls=[],fetchOriginal=globalThis.fetch,waitOriginal=globalThis.EdgeRuntime,pending=[];
 try{globalThis.EdgeRuntime={waitUntil:p=>pending.push(p)};globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(null,{status:200});};
 const e=edge({env:{TEST_STORE_V2_PROVISIONING_ENABLED:'true',SUPABASE_URL:'https://synthetic.supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-only'},rpc:async name=>({data:name==='isolated_test_store_command_v2'?result(b,{status:'provisioning',allocation:{...allocation(),registration:null}}):{planId:rid},error:null})});
 assert.equal((await e.handler(request(b))).status,200);await Promise.all(pending);assert.equal(e.observed.rpc.length,2);
 assert.deepEqual(e.observed.rpc[1],['isolated_test_store_v2_provisioning_plan_v1',{p_buyer_id:uid,p_intent_id:uid}]);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://synthetic.supabase.invalid/functions/v1/isolated-test-store-provisioner-v2');
 assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers.authorization,'Bearer synthetic-service-only');
 assert.deepEqual(JSON.parse(calls[0].init.body),{protocol:'isolated-test-store-v2-provision-worker',planId:rid});
 }finally{globalThis.fetch=fetchOriginal;globalThis.EdgeRuntime=waitOriginal;}
});
test('native SQL response captures cross actual Edge unchanged with frozen actor and exact RPC arguments',
 {skip:!process.env.ISOLATED_TEST_STORE_V2_FIXTURE},async()=>{
 const fixture=JSON.parse(readFileSync(process.env.ISOLATED_TEST_STORE_V2_FIXTURE,'utf8'));assert.equal(fixture.protocol,'isolated-test-store-v2');assert.ok(fixture.cases.length>=7);
 const actualNow=Date.now;try{for(const c of fixture.cases){Date.now=()=>c.response.result.authorityValidUntil?Date.parse(c.response.result.authorityValidUntil)-1000:actualNow();
 const e=edge({auth:{user:{id:c.actor.userId,sessionGeneration:c.actor.sessionId}},rpc:async(name,args)=>{
 assert.equal(name,'isolated_test_store_command_v2');assert.deepEqual(args,{p_buyer_id:c.actor.userId,p_session_id:c.actor.sessionId,p_command:c.command,p_request_id:c.requestId,p_configuration_digest:c.configurationDigest,p_payload:c.payload});return{data:c.response,error:null};}});
 const response=await e.handler(request({protocol:fixture.protocol,command:c.command,requestId:c.requestId,expectedSessionId:c.actor.sessionId,configurationDigest:c.configurationDigest,payload:c.payload},{headers:{authorization:token({sub:c.actor.userId,session_id:c.actor.sessionId})}}));
 assert.equal(response.status,200,JSON.stringify({command:c.command,response:await response.clone().json(),expected:c.response}));assert.deepEqual(await response.json(),c.response);assert.equal(e.observed.rpc.length,1);
 }}finally{Date.now=actualNow;}
});
