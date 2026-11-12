import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import ts from 'typescript';
const load=path=>{const module={exports:{}};new Function('exports','module',ts.transpileModule(readFileSync(path,'utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module.exports,module);return module.exports;};
const {authenticateNativeProduction}=load('supabase/functions/_shared/native-production-auth.ts');
const {nativeProductionLaunchWindow}=load('supabase/functions/_shared/native-production-launch-window.ts');
const {object}=load('supabase/functions/_shared/native-production-store-verification.ts');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
function fixture({canonical=false,sessionMismatch=false,apple=false,deadlineSignal,tokenHook,storeHook,rpcHook}={}){
 const now=Date.now(),calls=[];let serve,stored=null;
 const native={dispatchId:id(1),admissionId:id(2),quoteId:'a'.repeat(64),challenge:'b'.repeat(64),buyerId:id(3),sessionId:id(4),
  productId:'video',grossMinor:'199',currency:'USD',configurationSha256:'c'.repeat(64),applicationId:'fixture.app',nativeBuild:'1',sdkVersion:'10.28.1',launchBeforeMs:String(now+60000)};
 const witness={...native,state:'completed',preparationId:id(5),launchedAtMs:String(now-1000),completedAtMs:String(now),
  transactionId:'exact-tx',elapsedToLaunchMs:'1000',purchaseToken:'synthetic-private-token'};
 const context={nativeContext:native,provider:'revenuecat_google_play',projectId:'project',appId:'app',storeAccountId:'store',
  checkoutStartedAt:new Date(now-1800).toISOString(),launchReady:{preparationId:id(5),serverReceivedAt:new Date(now-2000).toISOString(),elapsedLimitMs:30000},googleCertificateSha256:'cert'};
 const facts={transactionId:'exact-tx',originalTransactionId:'exact-tx',productId:'video',grossMinor:215,currency:'USD',quantity:1,purchasedAt:new Date(now-500).toISOString(),
  pricing:{protocol:'google-orders-usd-v1',listingMinor:199,paidTotalMinor:215,taxMinor:16,taxInclusive:false,adjustmentMinor:0,pointsPresent:false,pointsCouponMinor:null,allocation:'unknown'}};
 if(apple){delete witness.purchaseToken;witness.keyId='synthetic-key';context.provider='revenuecat_app_store';context.appleAppId=123;context.verifiedWitnessSha256=createHash('sha256').update(JSON.stringify(witness),'utf8').digest('hex');facts.grossMinor=199;delete facts.pricing;}
 const client={auth:{getClaims:async()=>({data:{claims:{sub:id(3),session_id:sessionMismatch?id(8):id(4)}},error:null}),
  getUser:async()=>({data:{user:{id:id(3)}},error:null})},rpc:async(name,args)=>{
  calls.push({name,args});if(rpcHook)await rpcHook(name);let data;
  if(name==='resolve_native_production_witness_context')data=context;
  else if(name==='accept_native_production_verified_witness')data={canonicalReceiptId:canonical?id(7):null};
  else if(name==='accept_native_production_verified_store_facts'){
   stored=JSON.parse(args.p_assertion);assert.equal(stored.grossMinor,apple?199:215);if(!apple)assert.equal(stored.pricing.listingMinor,199);
   assert.equal(args.p_signature_sha256,createHmac('sha256',Buffer.from('d'.repeat(64),'hex')).update(args.p_assertion).digest('hex'));
   assert.ok(!args.p_assertion.includes('synthetic-private-token'));
   data={status:canonical?'ACCESS_VERIFIED':'HELD',accessGranted:canonical,financialAuthority:false,payable:false};
  }else if(name==='reconcile_native_production_dispatch')data={status:canonical&&stored?'ACCESS_VERIFIED':'HELD',accessGranted:canonical&&!!stored,financialAuthority:false,payable:false};
  else throw Error('unexpected RPC '+name);
  return {data,error:null};
 }};
 const source=readFileSync('supabase/functions/native-production-store-witness/index.ts','utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const unavailable=()=>{throw Error('Apple must not run in Google fixture');};
 new Function('Deno','createClient','GoogleAuth','Buffer','createHash','createHmac','readCashoutBody','object','decodeGoogleIntegrity','readGooglePurchase',
  'verifyProductionAppleEnrollment','verifyProductionAppleAssertion','readProductionAppleTransaction','nativeProductionLaunchWindow','authenticateNativeProduction','AbortSignal',code)(
  {serve:fn=>{serve=fn;},env:{get:name=>name==='NATIVE_PRODUCTION_STORE_WITNESS_ENABLED'?'true':name==='NATIVE_PRODUCTION_RECEIPT_KEY_ID'?id(9):
   name==='NATIVE_PRODUCTION_RECEIPT_SIGNING_KEY_HEX'?'d'.repeat(64):name==='NATIVE_PRODUCTION_GOOGLE_SERVICE_ACCOUNT'?'{}':name==='NATIVE_PRODUCTION_APPLE_ROOTS_BASE64_JSON'?'["c3ludGhldGlj"]':'synthetic'}},()=>client,
  class {async getAccessToken(){if(tokenHook)await tokenHook();return 'synthetic';}},Buffer,createHash,createHmac,async stream=>new Response(stream).text(),object,async()=>{},async()=>{if(storeHook)await storeHook();return facts;},
  unavailable,unavailable,async()=>{assert.ok(apple);if(storeHook)await storeHook();return facts;},nativeProductionLaunchWindow,authenticateNativeProduction,deadlineSignal?{any:AbortSignal.any.bind(AbortSignal),timeout:ms=>{assert.equal(ms,15000);return deadlineSignal;}}:AbortSignal);
 return {calls,webhook:()=>{canonical=true;},run:async(action='complete',signal)=>{
  const body=action==='complete'?{action,dispatchId:id(1),witness:JSON.stringify(witness),...(apple?{keyId:'synthetic-key',assertionBase64:'synthetic'}:{integrityToken:'synthetic'})}:{action,dispatchId:id(1)};
  const response=await serve(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','X-Chillywood-Auth-Session':id(4)},body:JSON.stringify(body),signal}));
  return {status:response.status,body:await response.json()};
 }};
}
test('actual witness issuer durably queues taxed Store facts in either canonical event order',async()=>{
 for(const canonical of [false,true]){
  const f=fixture({canonical});const first=await f.run();assert.equal(first.status,200);assert.equal(first.body.accessGranted,canonical);
  assert.ok(f.calls.some(call=>call.name==='accept_native_production_verified_store_facts'));
  f.webhook();assert.equal((await f.run('reconcile')).body.accessGranted,true);
  assert.equal((await f.run()).body.accessGranted,true,'duplicate or interrupted acceptance is recoverable without purchase');
 }
});
test('actual witness adapter rejects same-buyer cross-session header before privileged RPC',async()=>{
 const f=fixture({sessionMismatch:true});assert.equal((await f.run()).status,401);assert.deepEqual(f.calls,[]);
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('actual witness pre-abort issues no privileged RPC',async()=>{
 const c=new AbortController();c.abort();const f=fixture();
 assert.equal((await f.run('complete',c.signal)).status,409);assert.equal(f.calls.length,0);
});
for(const stage of ['token','store','rpc'])test(`actual witness rejects late ${stage} result without further acceptance`,async()=>{
 const started=deferred(),finish=deferred(),c=new AbortController();
 const wait=async()=>{started.resolve();await finish.promise;};
 const f=fixture(stage==='token'?{tokenHook:wait}:stage==='store'?{storeHook:wait}:{rpcHook:wait});
 const pending=f.run('complete',c.signal);await started.promise;c.abort();finish.resolve();
 const result=await pending;assert.equal(result.status,409);assert.equal(result.body.financialAuthority,false);
 assert.deepEqual(f.calls.map(x=>x.name),['resolve_native_production_witness_context']);
});

test('actual Apple witness rejects uncancellable SDK late result without durable acceptance',async()=>{
 const started=deferred(),finish=deferred(),c=new AbortController();
 const f=fixture({apple:true,storeHook:async()=>{started.resolve();await finish.promise;}});
 const pending=f.run('complete',c.signal);await started.promise;c.abort();finish.resolve();
 assert.equal((await pending).status,409);
 assert.deepEqual(f.calls.map(x=>x.name),['resolve_native_production_witness_context']);
});

test('actual witness preserves 15-second deadline and rejects late SDK result',async()=>{
 const started=deferred(),finish=deferred(),deadline=new AbortController();
 const f=fixture({deadlineSignal:deadline.signal,tokenHook:async()=>{started.resolve();await finish.promise;}});
 const pending=f.run();await started.promise;deadline.abort();finish.resolve();
 assert.equal((await pending).status,409);
 assert.deepEqual(f.calls.map(x=>x.name),['resolve_native_production_witness_context']);
});
