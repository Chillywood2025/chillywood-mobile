import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import ts from 'typescript';
const load=path=>{const module={exports:{}};new Function('exports','module',ts.transpileModule(readFileSync(path,'utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module.exports,module);return module.exports;};
const {authenticateNativeProduction}=load('supabase/functions/_shared/native-production-auth.ts');
const {nativeProductionLaunchWindow}=load('supabase/functions/_shared/native-production-launch-window.ts');
const {object}=load('supabase/functions/_shared/native-production-store-verification.ts');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
function fixture({canonical=false,sessionMismatch=false}={}){
 const now=Date.now(),calls=[];let serve,stored=null;
 const native={dispatchId:id(1),admissionId:id(2),quoteId:'a'.repeat(64),challenge:'b'.repeat(64),buyerId:id(3),sessionId:id(4),
  productId:'video',grossMinor:'199',currency:'USD',configurationSha256:'c'.repeat(64),applicationId:'fixture.app',nativeBuild:'1',sdkVersion:'10.28.1',launchBeforeMs:String(now+60000)};
 const witness={...native,state:'completed',preparationId:id(5),launchedAtMs:String(now-1000),completedAtMs:String(now),
  transactionId:'exact-tx',elapsedToLaunchMs:'1000',purchaseToken:'synthetic-private-token'};
 const context={nativeContext:native,provider:'revenuecat_google_play',projectId:'project',appId:'app',storeAccountId:'store',
  checkoutStartedAt:new Date(now-1800).toISOString(),launchReady:{preparationId:id(5),serverReceivedAt:new Date(now-2000).toISOString(),elapsedLimitMs:30000},googleCertificateSha256:'cert'};
 const facts={transactionId:'exact-tx',originalTransactionId:'exact-tx',productId:'video',grossMinor:215,currency:'USD',quantity:1,purchasedAt:new Date(now-500).toISOString(),
  pricing:{protocol:'google-orders-usd-v1',listingMinor:199,paidTotalMinor:215,taxMinor:16,taxInclusive:false,adjustmentMinor:0,pointsPresent:false,pointsCouponMinor:null,allocation:'unknown'}};
 const client={auth:{getClaims:async()=>({data:{claims:{sub:id(3),session_id:sessionMismatch?id(8):id(4)}},error:null}),
  getUser:async()=>({data:{user:{id:id(3)}},error:null})},rpc:async(name,args)=>{
  calls.push({name,args});let data;
  if(name==='resolve_native_production_witness_context')data=context;
  else if(name==='accept_native_production_verified_witness')data={canonicalReceiptId:canonical?id(7):null};
  else if(name==='accept_native_production_verified_store_facts'){
   stored=JSON.parse(args.p_assertion);assert.equal(stored.grossMinor,215);assert.equal(stored.pricing.listingMinor,199);
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
  'verifyProductionAppleEnrollment','verifyProductionAppleAssertion','readProductionAppleTransaction','nativeProductionLaunchWindow','authenticateNativeProduction',code)(
  {serve:fn=>{serve=fn;},env:{get:name=>name==='NATIVE_PRODUCTION_STORE_WITNESS_ENABLED'?'true':name==='NATIVE_PRODUCTION_RECEIPT_KEY_ID'?id(9):
   name==='NATIVE_PRODUCTION_RECEIPT_SIGNING_KEY_HEX'?'d'.repeat(64):name==='NATIVE_PRODUCTION_GOOGLE_SERVICE_ACCOUNT'?'{}':'synthetic'}},()=>client,
  class {async getAccessToken(){return 'synthetic';}},Buffer,createHash,createHmac,async stream=>new Response(stream).text(),object,async()=>{},async()=>facts,
  unavailable,unavailable,unavailable,nativeProductionLaunchWindow,authenticateNativeProduction);
 return {calls,webhook:()=>{canonical=true;},run:async(action='complete')=>{
  const body=action==='complete'?{action,dispatchId:id(1),witness:JSON.stringify(witness),integrityToken:'synthetic'}:{action,dispatchId:id(1)};
  const response=await serve(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','X-Chillywood-Auth-Session':id(4)},body:JSON.stringify(body)}));
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
