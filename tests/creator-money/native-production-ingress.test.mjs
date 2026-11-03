import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as policy from '../../supabase/functions/revenuecat-webhook/store-policy.mjs';

const user='cb000000-0000-4000-8000-000000000010';
const event={id:'production-renewal',type:'REFUND',store:'PLAY_STORE',environment:'PRODUCTION',
 app_id:'app_fixture',product_id:'creator_monthly:monthly',app_user_id:user,
 original_transaction_id:'GPA.fixture',transaction_id:'GPA.fixture..3',event_timestamp_ms:Date.now()};
const receipt='cb000000-0000-4000-8000-000000000099';
const context={creatorMoney:true,canonicalReceiptId:receipt,premium:false,configuredProjectId:'proj_server',
 eventId:event.id,rawPayloadHash:'a'.repeat(64),eventType:event.type,productId:event.product_id,
 originalTransactionId:event.original_transaction_id,userId:user};

test('native production facts keep exact cycle/base plan and never trust payload project/account claims',()=>{
 const facts=policy.nativeProductionIngressFacts({...event,project_id:'attacker',subscriber_attributes:{project_id:'attacker'}},context);
 assert.equal(facts.configuredProjectId,'proj_server');assert.equal(facts.reportedAppId,'app_fixture');
 assert.equal(facts.reportedProductId,'creator_monthly:monthly');assert.equal(facts.transactionId,'GPA.fixture..3');
 assert.equal(facts.originalTransactionId,'GPA.fixture');
 assert.equal(policy.nativeProductionIngressFacts(event,{...context,configuredProjectId:null}).configuredProjectId,null);
 for(const app_id of [undefined,42,{},' bad','bad\n', 'x'.repeat(513)])
  assert.equal(policy.nativeProductionIngressFacts({...event,app_id},context).reportedAppId,null);
 for(const patch of [{environment:'SANDBOX'},{store:'MAC_APP_STORE'},{store:'STRIPE'}])
  assert.equal(policy.nativeProductionIngressFacts({...event,...patch},context),null);
 assert.equal(policy.nativeProductionIngressFacts(event,{...context,premium:true}),null);
 assert.equal(policy.nativeProductionIngressFacts(event,{...context,creatorMoney:false}),null);
});

const source=fs.readFileSync('supabase/functions/revenuecat-webhook/index.ts','utf8');
const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
const code=ts.transpileModule(ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function harness({signature=true,domain='creator_money',observationFailure=false,project='proj_server'}={}) {
 let handler;const calls=[];let terminalApplied=false;let terminalCount=0;let observations=0;
 const client={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='reserve_revenuecat_webhook_ingress_event')return {data:{status:'reserved',providerEventId:args.p_provider_event_id,duplicateEvent:false,authorityGranted:false}};
  if(name==='process_revenuecat_terminal_event_atomic') {
   terminalApplied=true;terminalCount++;
   return {data:{status:'processed',domain,authorityGranted:false,entitlementActive:false,
    providerEventId:receipt,duplicateEvent:terminalCount>1,
    ...(terminalCount===1?{productType:domain==='creator_money'?'channel_subscription':'premium_subscription'}:{}),grantStatus:'revoked'}};
  }
  if(['process_revenuecat_app_store_event_atomic','process_revenuecat_google_play_event_atomic'].includes(name)) {
   terminalApplied=true;return {data:{status:'ignored',providerEventId:receipt,productKey:'fixture',environment:'production'}};
  }
  if(name==='record_native_production_ingress_observation') {
   assert.equal(terminalApplied,true,'terminal cleanup precedes evidence-only observation');
   observations++;
   return observationFailure&&observations===1?{data:null,error:{message:'unavailable'}}:{data:{status:'recorded',financialAuthority:false}};
  }
  throw Error(`Unexpected RPC ${name}`);
 },from:table=>{
  const product={id:'fixture-product',product_key:'fixture',product_type:'channel_subscription',provider_product_id:'creator_monthly',provider_base_plan_id:'monthly'};
  const mapping={product_id:product.id,provider_product_id:'creator_monthly:monthly',concept:'channel_subscription',
   provider:'revenuecat_app_store',platform:'ios',store:'app_store',grants_livekit_authority:false,creates_payable_balance:false};
  const q={select:()=>q,eq:()=>q,is:()=>q,limit:()=>q,maybeSingle:async()=>({data:product}),
   then:resolve=>resolve({data:table==='monetization_product_store_mappings'?[mapping]:[product]})};return q;
 }};
 vm.runInNewContext(code,{...policy,Request,Response,Headers,URL,TextEncoder,console,Date,setTimeout,clearTimeout,AbortController,
  Deno:{serve:fn=>{handler=fn;},env:{get:()=>undefined}},
  RevenueCatAdapter:class {getSafeStatus(){return {safeSummary:'synthetic configuration'};}},
  createAdminClient:()=>({configured:true,client}),readOptionalEnv:key=>key==='REVENUECAT_PROJECT_ID'?project:'synthetic-secret',
  verifySharedWebhookSecret:()=>signature,hashText:async text=>createHash('sha256').update(text).digest('hex'),
  jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),optionsResponse:()=>new Response(null,{status:204}),
  toText:value=>typeof value==='string'?value.trim():'',sanitizeErrorMessage:error=>error?.message??String(error),
  writeProviderReadinessAudit:async()=>{},
 });
 return {calls,get terminalApplied(){return terminalApplied;},send:async payload=>{
  const response=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({event:payload})}));
  return {status:response.status,body:await response.json()};
 }};
}
for(const store of ['APP_STORE','PLAY_STORE'])test(`actual ${store} terminal handler preserves cleanup and records production provenance`,async()=>{
 const h=harness();const result=await h.send({...event,store});
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(h.terminalApplied,true);
 assert.deepEqual(h.calls.map(c=>c.name),['reserve_revenuecat_webhook_ingress_event','process_revenuecat_terminal_event_atomic','record_native_production_ingress_observation']);
 const facts=h.calls[2].args.p_facts;
 assert.equal(facts.reportedAppId,event.app_id);assert.equal(facts.transactionId,event.transaction_id);
 assert.equal(facts.configuredProjectId,'proj_server');assert.equal(result.body.authorityGranted,false);
 assert.equal(facts.canonicalReceiptId,receipt);
});
for(const store of ['APP_STORE','PLAY_STORE'])test(`actual ${store} nonterminal writer records canonical identity despite no productType in its result`,async()=>{
 const h=harness();const result=await h.send({...event,store,type:'RENEWAL',price:4.99,currency:'USD'});
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(h.calls.at(-1).name,'record_native_production_ingress_observation');
 assert.equal(h.calls.at(-1).args.p_facts.canonicalReceiptId,receipt);
});
test('actual handler leaves Premium and sandbox unchanged and authenticates before observation',async()=>{
 for(const options of [{domain:'premium'},{}]) {
  const h=harness(options);const result=await h.send(options.domain?event:{...event,environment:'SANDBOX'});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(h.calls.some(c=>c.name==='record_native_production_ingress_observation'),false);
 }
 const h=harness({signature:false});assert.equal((await h.send(event)).status,401);assert.equal(h.calls.length,0);
});
test('missing configuration is recorded as unknown; observation failure cannot roll back terminal cleanup',async()=>{
 const unknown=harness({project:null});assert.equal((await unknown.send({...event,app_id:undefined})).status,200);
 assert.equal(unknown.calls.at(-1).args.p_facts.configuredProjectId,null);
 assert.equal(unknown.calls.at(-1).args.p_facts.reportedAppId,null);
 const failed=harness({observationFailure:true});const result=await failed.send(event);
 assert.equal(result.status,500);assert.equal(failed.terminalApplied,true);
 assert.equal(result.body.webhookProcessed,false);
 const retry=await failed.send(event);
 assert.equal(retry.status,200,JSON.stringify(retry.body));
 assert.equal(failed.calls.filter(c=>c.name==='record_native_production_ingress_observation').length,2,
  'duplicate terminal response has no productType, but canonical receipt still retries evidence');
});
