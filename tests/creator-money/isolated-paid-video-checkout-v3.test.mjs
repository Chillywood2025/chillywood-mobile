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

const { createPaidVideoCheckoutV3Handler: handler, validatePaidVideoCheckoutV3Result: validate } = load('_shared/isolated-paid-video-checkout-v3.ts');
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333';
const clock=Date.parse('2026-11-07T12:00:00.000Z'),digest='a'.repeat(64),actor=()=>({userId:uid,sessionId:sid});
const quote=()=>({offerId:`scv1_offer_${uid}`,offerRevision:1,resourceId:`scv1_resource_${uid}`,resourceRevision:1,creatorId:rid,kind:'paid_content',amountMinor:199,currency:'usd',asset:{id:`scv1_asset_${uid}`,incarnation:rid,sha256:'b'.repeat(64),byteLength:22037,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'}});
const intent=()=>({id:`scv1_intent_${uid}`,state:'prepared',quote:quote(),createdAt:new Date(clock).toISOString(),expiresAt:new Date(clock+900000).toISOString(),receipt:null,grantId:null,dispatchAllowed:false,accessRequiresCurrentAuthorization:true,notPayable:true});
const receipt=()=>({id:`scv1_receipt_${uid}`,state:'verified',purchasedAt:new Date(clock).toISOString(),originalTransactionId:'synthetic-original'});
const body=(command='prepare')=>({protocol:'isolated-paid-video-checkout-v3',command,requestId:rid,expectedSessionId:sid,configurationDigest:digest,payload:command==='offer'?{offerId:quote().offerId}:command==='prepare'?{offerId:quote().offerId,expectedQuote:quote()}:command==='recover'?{originalRequestId:uid}:{limit:2,cursor:null}});
const result=(b=body())=>({protocol:b.protocol,command:b.command,requestId:b.requestId,actor:actor(),status:'ok',data:b.command==='offer'?{quote:quote(),preparationAllowed:false}:b.command==='prepare'?{intent:intent(),replayed:false}:b.command==='recover'?{originalRequestId:uid,originalSessionId:rid,originalPayload:body().payload,intent:intent()}:{intents:[intent()],nextCursor:null},providerDispatchAllowed:false,grantsAccess:false,financialAuthority:false,notPayable:true});
const token=(claims={sub:uid,session_id:sid})=>'Bearer '+[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'syntheticSignature'].join('.');
const request=(b=body(),init={})=>new Request('https://synthetic.invalid/checkout',{method:'POST',headers:{authorization:token(),'content-type':'application/json'},body:typeof b==='string'?b:JSON.stringify(b),...init});
const run=async(b=body(),options={})=>{let calls=0;const fn=handler({now:()=>clock,authenticate:async()=>actor(),execute:async()=>{calls++;return result(b);},...options});const response=await fn(request(b));return{response,value:await response.json(),calls};};
const abandonBody=()=>({...body(),command:'abandon',payload:{originalRequestId:uid,originalSessionId:rid,intentId:intent().id,expectedQuote:quote()}});
const abandoned=(b=abandonBody())=>({...result(),command:'abandon',requestId:b.requestId,data:{intent:{...intent(),state:'expired'},replayed:false,
 closure:{id:rid,originalRequestId:uid,originalSessionId:rid,configurationDigest:digest,closedAt:new Date(clock+1000).toISOString(),kind:'unallocated_preparation',allocationAbsent:true,dispatchAbsent:true}}});
const closeBody=()=>({...body(),command:'close_prepared',payload:{customerBindingId:`scv3_customer_${uid}`,intentId:intent().id,dispatchId:rid,
 registrationId:`scv3_registration_${rid}`,originalSessionId:uid,expectedReservationRevision:3,expectedQuote:quote()}});
const closed=(b=closeBody())=>({...result(),command:b.command,requestId:b.requestId,data:{intent:{...intent(),state:'expired'},replayed:false,
 closure:{id:rid,kind:'unclaimed_allocation',customerBindingId:b.payload.customerBindingId,allocationId:`scv3_allocation_${uid}`,dispatchId:rid,
 registrationId:b.payload.registrationId,originalSessionId:uid,configurationDigest:digest,previousReservationRevision:3,releasedReservationRevision:4,
 closedAt:new Date(clock+1000).toISOString(),claimAbsent:true}}});
const recoverCloseBody=()=>({...body(),command:'recover_close_prepared',payload:{originalRequestId:uid}});
const recoveredClosure=()=>({...closed(),command:'recover_close_prepared',data:{originalRequestId:uid,originalSessionId:rid,originalPayload:closeBody().payload,
 intent:closed().data.intent,closure:closed().data.closure}});
const playbackBody=()=>({...body(),command:'resolve_playback',payload:{intentId:intent().id}});
const playbackResult=()=>({...result(),command:'resolve_playback',data:{intent:intent(),currentGrantId:`scv1_grant_${rid}`,accessRequiresCurrentAuthorization:true}});
test('four commands return preparation/history only; cross-session recovery retains original session',async()=>{
 for(const command of ['offer','prepare','recover','history']){const b=body(command),out=await run(b);assert.equal(out.response.status,200);assert.deepEqual(out.value,result(b));assert.equal(out.calls,1);}
 const b=body('recover'),v={...result(b),status:'unknown',data:{originalRequestId:uid,intent:null}};assert.equal((await run(b,{execute:async()=>v})).response.status,200);
});
test('offer preparation capability is an exact server boolean and never provider or playback authority',async()=>{
 const b=body('offer');for(const allowed of [false,true]){const v=result(b);v.data.preparationAllowed=allowed;
  const out=await run(b,{execute:async()=>v});assert.equal(out.response.status,200);assert.equal(out.value.providerDispatchAllowed,false);assert.equal(out.value.grantsAccess,false);}
 for(const allowed of [null,1,'true',{},undefined]){const v=result(b);v.data.preparationAllowed=allowed;assert.equal((await run(b,{execute:async()=>v})).response.status,503);}
 const v=result(b);v.data.preparationAllowed=true;v.data.quote.creatorId=uid;assert.equal((await run(b,{execute:async()=>v})).response.status,503);
});
test('unallocated closure binds original authority and media while permitting a current replacement session',async()=>{
 const b=abandonBody();for(const replayed of [false,true]){const v=abandoned(b);v.data.replayed=replayed;const out=await run(b,{execute:async()=>v});
  assert.equal(out.response.status,200);assert.equal(out.value.data.closure.originalSessionId,rid);assert.equal(out.value.actor.sessionId,sid);}
 for(const change of [v=>v.data.intent.state='prepared',v=>v.data.intent.id=`scv1_intent_${rid}`,v=>v.data.intent.receipt=receipt(),v=>v.data.intent.grantId=`scv1_grant_${uid}`,
  v=>v.data.intent.quote.asset.incarnation=uid,v=>v.data.closure.originalRequestId=rid,v=>v.data.closure.originalSessionId=sid,v=>v.data.closure.configurationDigest='c'.repeat(64),
  v=>v.data.closure.closedAt=new Date(clock-1).toISOString(),v=>v.data.closure.kind='provider_cancelled',v=>v.data.closure.allocationAbsent=false,v=>v.data.closure.dispatchAbsent=false,
  v=>v.data.closure.noCharge=true,v=>v.data.closure.id='bad',v=>v.data.replayed='true',v=>v.status='unknown']){
  const v=abandoned(b);change(v);const out=await run(b,{execute:async()=>v});assert.equal(out.response.status,503);assert.equal(out.value.outcome,'unknown');assert.equal(out.value.retryProviderMutation,false);}
 for(const change of [v=>delete v.payload.originalSessionId,v=>v.payload.originalRequestId='bad',v=>v.payload.intentId='bad',v=>v.payload.expectedQuote.asset.sha256='bad',v=>v.payload.noCharge=true]){
  const input=abandonBody();change(input);assert.equal((await run(input)).response.status,400);}
});
test('prepared closure binds the exact allocation identity and releases only its reservation revision',async()=>{
 const b=closeBody();for(const replayed of [false,true]){const v=closed(b);v.data.replayed=replayed;assert.equal((await run(b,{execute:async()=>v})).response.status,200);}
 for(const change of [v=>v.data.intent.state='provider_pending',v=>v.data.intent.receipt=receipt(),v=>v.data.intent.grantId=`scv1_grant_${uid}`,
  v=>v.data.intent.id=`scv1_intent_${rid}`,v=>v.data.intent.quote.asset.incarnation=uid,v=>v.data.closure.id='bad',v=>v.data.closure.kind='provider_cancelled',
  v=>v.data.closure.customerBindingId=`scv3_customer_${rid}`,v=>v.data.closure.allocationId=`scv1_allocation_${uid}`,v=>v.data.closure.dispatchId=uid,
  v=>v.data.closure.registrationId=`scv3_registration_${uid}`,v=>v.data.closure.originalSessionId=sid,v=>v.data.closure.configurationDigest='c'.repeat(64),
  v=>v.data.closure.previousReservationRevision=2,v=>v.data.closure.releasedReservationRevision=5,v=>v.data.closure.releasedReservationRevision='4',
  v=>v.data.closure.closedAt=new Date(clock-1).toISOString(),v=>v.data.closure.claimAbsent=false,v=>v.data.closure.noCharge=true,
  v=>v.data.replayed='true',v=>v.status='unknown']){
  const v=closed(b);change(v);const out=await run(b,{execute:async()=>v});assert.equal(out.response.status,503);assert.equal(out.value.outcome,'unknown');}
 for(const change of [v=>v.payload.customerBindingId=`scv1_customer_${uid}`,v=>v.payload.registrationId='bad',v=>v.payload.dispatchId='bad',
  v=>v.payload.originalSessionId='bad',v=>v.payload.expectedReservationRevision=0,v=>v.payload.expectedReservationRevision=1.5,
  v=>v.payload.expectedReservationRevision=Number.MAX_SAFE_INTEGER+1,v=>v.payload.nativeProof=true]){
  const input=closeBody();change(input);const out=await run(input);assert.equal(out.response.status,400);assert.equal(out.calls,0);}
 const max=closeBody();max.payload.expectedReservationRevision=Number.MAX_SAFE_INTEGER;const v=closed(max);
 v.data.closure.previousReservationRevision=Number.MAX_SAFE_INTEGER;v.data.closure.releasedReservationRevision=Number.MAX_SAFE_INTEGER+1;
 assert.equal((await run(max,{execute:async()=>v})).response.status,503);
});
test('lost prepared closure is recovered read-only with distinct original action and allocation sessions',async()=>{
 const b=recoverCloseBody(),v=recoveredClosure();const out=await run(b,{execute:async()=>v});assert.equal(out.response.status,200);
 assert.equal(out.value.actor.sessionId,sid);assert.equal(out.value.data.originalSessionId,rid);assert.equal(out.value.data.originalPayload.originalSessionId,uid);
 const unknown={...v,status:'unknown',data:{originalRequestId:uid,intent:null,closure:null}};
 assert.equal((await run(b,{execute:async()=>unknown})).response.status,200);
 for(const change of [v=>v.data.originalRequestId=rid,v=>v.data.originalSessionId='bad',v=>v.data.originalPayload.expectedReservationRevision=4,
  v=>v.data.originalPayload.expectedQuote.asset.sha256='c'.repeat(64),v=>v.data.originalPayload.originalSessionId=sid,v=>v.data.closure.claimAbsent=false,
  v=>v.data.intent.receipt=receipt(),v=>v.status='unknown',v=>v.data.replayed=true]){
  const bad=recoveredClosure();change(bad);assert.equal((await run(b,{execute:async()=>bad})).response.status,503);}
 for(const data of [{originalRequestId:uid,intent:null},{originalRequestId:uid,intent:null,closure:closed().data.closure},
  {originalRequestId:uid,intent:null,closure:null,noEffect:true}])assert.equal((await run(b,{execute:async()=>({...unknown,data})})).response.status,503);
});
test('playback resolution preserves historical receipt while selecting a distinct current grant',async()=>{
 const b=playbackBody();for(const state of ['prepared','provider_pending','verified','failed','expired']){
  const v=playbackResult();v.data.intent.state=state;
  for(const currentGrantId of [null,`scv1_grant_${rid}`]){v.data.currentGrantId=currentGrantId;assert.equal((await run(b,{execute:async()=>v})).response.status,200);}}
 for(const state of ['verified','refunded','revoked','quarantined']){
  const v=playbackResult();v.data.intent.receipt={...receipt(),state};v.data.intent.grantId=`scv1_grant_${uid}`;
  const out=await run(b,{execute:async()=>v});assert.equal(out.response.status,200);assert.notEqual(out.value.data.currentGrantId,out.value.data.intent.grantId);
  assert.equal(out.value.grantsAccess,false);assert.equal(out.value.providerDispatchAllowed,false);}
 for(const change of [v=>v.data.intent.id=`scv1_intent_${rid}`,v=>v.data.intent.quote.creatorId=uid,v=>v.data.currentGrantId=rid,
  v=>v.data.currentGrantId=`scv3_grant_${rid}`,v=>v.data.currentGrantId=undefined,v=>v.data.accessRequiresCurrentAuthorization=false,
  v=>v.data.url='https://synthetic.invalid',v=>v.grantsAccess=true,v=>v.status='unknown']){
  const v=playbackResult();change(v);assert.equal((await run(b,{execute:async()=>v})).response.status,503);}
 for(const payload of [{intentId:uid},{intentId:intent().id,grantId:`scv1_grant_${uid}`},{intentId:intent().id,expectedOwner:uid}]){
  const out=await run({...b,payload});assert.equal(out.response.status,400);assert.equal(out.calls,0);}
});
test('exact payload binds immutable media, price and offer before auth',async()=>{
 for(const change of [b=>b.actor=actor(),b=>b.command='cashout',b=>b.protocol='isolated-test-store-v2',b=>b.payload.expectedQuote.asset.sha256='bad',b=>b.payload.expectedQuote.kind='creator_tip',b=>b.payload.expectedQuote.asset.byteLength=16777217,b=>b.payload.expectedQuote.asset.resourceRevision=2,b=>b.payload.expectedQuote.asset.profile='raw',b=>b.payload.expectedQuote.offerId=`scv1_offer_${rid}`,b=>b.payload.expectedQuote.amountMinor='199',b=>b.payload.expectedQuote.asset.publicUrl='https://invalid',b=>b.configurationDigest='A'.repeat(64)]){
 const b=body();change(b);const out=await run(b);assert.equal(out.response.status,400);assert.equal(out.calls,0);}
 for(const limit of [0,26,1.2,'2']){const b=body('history');b.payload.limit=limit;assert.equal((await run(b)).response.status,400);}
});
test('duplicate nested keys, invalid bytes, excessive depth and body limits never authenticate',async()=>{
 let calls=0;const fn=handler({authenticate:async()=>{calls++;return actor();},execute:async()=>result()});
 for(const raw of [JSON.stringify(body()).replace('"amountMinor":','"amountMinor":1,"amountMinor":'),'{','{"a":'+'['.repeat(10)+'0'+']'.repeat(10)+'}',new Uint8Array([255])]){
 assert.equal((await fn(new Request('https://synthetic.invalid',{method:'POST',body:raw}))).status,400);}
 assert.equal((await fn(request(' '.repeat(8193)))).status,413);assert.equal((await fn(request(body(),{headers:{'content-length':'8193'}}))).status,413);
 assert.equal((await fn(new Request('https://synthetic.invalid'))).status,405);assert.equal((await fn(new Request('https://synthetic.invalid',{method:'OPTIONS'}))).status,204);assert.equal(calls,0);
});
test('current actor/session mandatory; nested request is immutable',async()=>{
 for(const auth of [null,{userId:uid,sessionId:rid},{userId:1,sessionId:sid}]){const out=await run(body(),{authenticate:async()=>auth});assert.equal(out.response.status,401);assert.equal(out.calls,0);}
 const auth=actor();assert.equal((await run(body(),{authenticate:async()=>auth,execute:async input=>{auth.userId=rid;assert.equal(input.actor.userId,uid);assert.throws(()=>input.request.payload.expectedQuote.asset.sha256='c'.repeat(64));return result();}})).response.status,200);
});
test('SQL drift cannot manufacture dispatch, current access or a different media purchase',async()=>{
 for(const change of [v=>v.actor.userId=rid,v=>v.requestId=uid,v=>v.grantsAccess=true,v=>v.providerDispatchAllowed=true,v=>v.financialAuthority=true,v=>v.data.intent.dispatchAllowed=true,v=>v.data.intent.accessRequiresCurrentAuthorization=false,v=>v.data.intent.quote.asset.sha256='c'.repeat(64),v=>v.data.intent.quote.asset.incarnation=uid,v=>v.data.intent.expiresAt=v.data.intent.createdAt,v=>v.data.intent.grantId=`scv1_grant_${uid}`,v=>v.data.intent.quote.creatorId=uid]){
 const v=result();change(v);const out=await run(body(),{execute:async()=>v});assert.equal(out.response.status,503);assert.equal(out.value.outcome,'unknown');}
});
test('recovery binds original request and immutable payload without requiring the former session',async()=>{
 const b=body('recover');for(const change of [v=>v.data.originalRequestId=rid,v=>v.data.originalSessionId='bad',v=>v.data.originalPayload.expectedQuote.asset.sha256='c'.repeat(64),v=>v.status='unknown']){
 const v=result(b);change(v);assert.equal((await run(b,{execute:async()=>v})).response.status,503);}
});
test('history is bounded, unique and ordered, and the cursor binds its final item',async()=>{
 const b=body('history');for(const change of [v=>v.data.intents.push(intent()),v=>v.data.nextCursor=intent().id,v=>v.data.intents[0].quote.creatorId=uid,v=>v.data.intents[0].receipt={...receipt(),extra:true}]){
 const v=result(b);change(v);assert.equal((await run(b,{execute:async()=>v})).response.status,503);}
 const v=result(b),second={...intent(),id:`scv1_intent_${rid}`,createdAt:new Date(clock-1).toISOString()};v.data.intents.push(second);v.data.nextCursor=second.id;
 assert.equal((await run(b,{execute:async()=>v})).response.status,200);
 v.data.intents.reverse();assert.equal((await run(b,{execute:async()=>v})).response.status,503);
});
test('historical refunded/revoked grants never become a playback authorization',async()=>{
 const b=body('history');for(const state of ['verified','refunded','revoked','quarantined']){const v=result(b);v.data.intents[0].receipt={...receipt(),state};v.data.intents[0].grantId=`scv1_grant_${uid}`;assert.equal((await run(b,{execute:async()=>v})).response.status,200);}
});
test('expired authentication cannot execute later; uncertain SQL is not retried or exposed',async()=>{
 let time=clock,calls=0;const out=await run(body(),{now:()=>time,authenticate:async()=>{time+=5000;return actor();},execute:async()=>{calls++;return result();}});assert.equal(out.response.status,503);assert.equal(calls,0);assert.equal(out.value.outcome,'not_sent');
 const failed=await run(body(),{execute:async()=>{calls++;throw Error('private-secret');}});assert.equal(calls,1);assert.equal(failed.value.outcome,'unknown');assert.equal(JSON.stringify(failed.value).includes('private-secret'),false);
});
test('real HTTP deadline cancels a stalled body without reaching authentication or SQL',async()=>{
 let cancelled=false,calls=0;const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 const fn=handler({authenticate:async()=>{calls++;return actor();},execute:async()=>{calls++;return result();}});
 const response=await fn(new Request('https://synthetic.invalid',{method:'POST',body:stream,duplex:'half'}));
 assert.equal(response.status,503);assert.equal((await response.json()).outcome,'not_sent');assert.equal(cancelled,true);assert.equal(calls,0);
});
function edge({auth={user:{id:uid,sessionGeneration:sid}},duringAuth,response=result()}={}){
 const observed={auth:[],rpc:[]};const shared={createAuthClient:()=>({supabaseUrl:'https://synthetic.supabase.invalid',supabaseAnonKey:'synthetic-anon'}),authenticateRequest:async(...args)=>{observed.auth.push(args);await duringAuth?.(...args);return auth;},createAdminClient:()=>({configured:true,client:{rpc:async(...args)=>{observed.rpc.push(args);return {data:response,error:null};}}})};
 return {...load('isolated-paid-video-checkout-v3/index.ts',{'../_shared/stripe-connect.ts':shared}),observed};
}
test('actual entry freezes bearer and calls only the exact preparation RPC',async()=>{
 const req=request();const e=edge({duringAuth:async frozen=>{req.headers.set('authorization',token({sub:uid,session_id:rid}));assert.equal(frozen.headers.get('authorization'),token());}});
 assert.equal((await e.handler(req)).status,200);assert.deepEqual(e.observed.rpc,[['isolated_paid_video_checkout_v3',{p_buyer_id:uid,p_session_id:sid,p_command:'prepare',p_request_id:rid,p_configuration_digest:digest,p_payload:body().payload}]]);
});
test('actual entry routes only explicit abandonment to the dedicated allocation-absence RPC',async()=>{
 const b=abandonBody(),e=edge({response:abandoned(b)});assert.equal((await e.handler(request(b))).status,200);
 assert.deepEqual(e.observed.rpc,[['isolated_paid_video_abandon_v3',{p_buyer_id:uid,p_session_id:sid,p_command:'abandon',p_request_id:rid,p_configuration_digest:digest,p_payload:b.payload}]]);
});
test('actual entry routes prepared closure and its read-only recovery only to their dedicated RPC',async()=>{
 for(const [b,response] of [[closeBody(),closed()],[recoverCloseBody(),recoveredClosure()]]){
  const e=edge({response});assert.equal((await e.handler(request(b))).status,200);
  assert.deepEqual(e.observed.rpc,[['isolated_paid_video_close_prepared_v3',{p_buyer_id:uid,p_session_id:sid,p_command:b.command,
   p_request_id:rid,p_configuration_digest:digest,p_payload:b.payload}]]);}
});
test('actual entry resolves playback only through the dedicated read RPC without provider mutation',async()=>{
 const b=playbackBody(),e=edge({response:playbackResult()});assert.equal((await e.handler(request(b))).status,200);
 assert.deepEqual(e.observed.rpc,[['isolated_paid_video_resolve_playback_v3',{p_buyer_id:uid,p_session_id:sid,p_command:'resolve_playback',
  p_request_id:rid,p_configuration_digest:digest,p_payload:b.payload}]]);
});
test('actual entry rejects token-session/readback mismatch and missing verified identity',async()=>{
 for(const auth of [{user:{id:uid,sessionGeneration:rid}},{user:{id:uid}},{error:new Response(null,{status:401})}]){const e=edge({auth});assert.equal((await e.handler(request())).status,401);assert.equal(e.observed.rpc.length,0);}
 for(const authorization of [token({sub:uid}),token({sub:uid,session_id:null}),'Bearer bad']){const e=edge();assert.equal((await e.handler(request(body(),{headers:{authorization}}))).status,401);assert.equal(e.observed.rpc.length,0);}
});
const capturePath=process.env.PAID_VIDEO_CHECKOUT_V3_CAPTURES;
if(capturePath)test('actual PostgreSQL checkout captures satisfy the HTTP response contract',()=>{
 const captures=JSON.parse(readFileSync(capturePath,'utf8'));assert.ok(Array.isArray(captures)&&captures.length>=6);
 for(const capture of captures)validate(capture.result,capture.input);
 assert.deepEqual(new Set(captures.map(c=>c.input.request.command)),new Set(['offer','prepare','recover','history']));
});
const recoveryCaptures=process.env.PAID_VIDEO_CHECKOUT_V3_RECOVERY_CAPTURES;
if(recoveryCaptures)test('actual PostgreSQL successor captures prove readiness and exact unallocated closure',()=>{
 const captures=JSON.parse(readFileSync(recoveryCaptures,'utf8'));assert.ok(Array.isArray(captures)&&captures.length>=6);
 for(const capture of captures)validate(capture.result,capture.input);
 const offers=captures.filter(c=>c.input.request.command==='offer');assert.deepEqual(new Set(offers.map(c=>c.result.data.preparationAllowed)),new Set([true,false]));
 const closures=captures.filter(c=>c.input.request.command==='abandon');assert.ok(closures.length>=2);assert.deepEqual(new Set(closures.map(c=>c.result.data.replayed)),new Set([true,false]));
});
const preparedClosureCaptures=process.env.PAID_VIDEO_CHECKOUT_V3_PREPARED_CLOSURE_CAPTURES;
if(preparedClosureCaptures)test('actual PostgreSQL prepared closure captures preserve claim absence and lost-response recovery',()=>{
 const captures=JSON.parse(readFileSync(preparedClosureCaptures,'utf8'));assert.ok(Array.isArray(captures)&&captures.length>=6);
 for(const capture of captures)validate(capture.result,capture.input);
 const commands=new Set(captures.map(c=>c.input.request.command));assert.ok(commands.has('close_prepared'));assert.ok(commands.has('recover_close_prepared'));
 assert.ok(captures.some(c=>c.input.request.command==='recover_close_prepared'&&c.result.status==='unknown'));
});
const playbackCaptures=process.env.PAID_VIDEO_CHECKOUT_V3_PLAYBACK_CAPTURES;
if(playbackCaptures)test('actual PostgreSQL playback resolution captures retain historical and current grant distinctions',()=>{
 const captures=JSON.parse(readFileSync(playbackCaptures,'utf8'));assert.ok(Array.isArray(captures)&&captures.length>=4);
 for(const capture of captures)validate(capture.result,capture.input);
 const resolved=captures.filter(c=>c.input.request.command==='resolve_playback');assert.ok(resolved.some(c=>c.result.data.currentGrantId===null));
 assert.ok(resolved.some(c=>c.result.data.currentGrantId!==null&&c.result.data.currentGrantId!==c.result.data.intent.grantId));
});
