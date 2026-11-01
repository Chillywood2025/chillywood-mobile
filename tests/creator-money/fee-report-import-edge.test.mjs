import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const contract='e7100000-0000-4000-8000-000000000001';
function fixture(patch={}) {
 let handler; const calls=[];
 const context={contractId:contract,sourceObservationId:'e7100000-0000-4000-8000-000000000002',accountId:'acct_fixture',environment:'test',chargeId:'ch_fixture',refundIds:[],currency:'usd',...patch.context};
 const env={SUPABASE_SERVICE_ROLE_KEY:'service_fixture',STRIPE_FEE_REPORT_TEST_KEY:'rk_test_fixture',STRIPE_FEE_REPORT_TEST_ACCOUNT_ID:'acct_fixture',...patch.env};
 const runtime={exports:{},TextDecoder,Uint8Array,Deno:{serve:fn=>handler=fn},require:path=>{
  if(path.startsWith('jsr:')) return {};
  if(path.endsWith('commerce-fee-accounting-drain.ts'))return loadPureTypeScriptModule('supabase/functions/_shared/commerce-fee-accounting-drain.ts');
  if(path.endsWith('stripe-fee-report-evidence.ts')) return {observeStripeFeeReport:async(c,key)=>{calls.push(['provider',c,key]);return{financialAuthority:false,settlementReady:false};}};
  return {readOptionalEnv:key=>env[key],jsonResponse:(status,body)=>Response.json(body,{status}),createAdminClient:()=>({configured:true,client:{rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='get_commerce_fee_report_import_context'||name==='get_merch_fee_report_import_context') return {data:context};
   if(name==='process_commerce_fee_accounting_jobs')return patch.accountingFailure?{error:{message:'unavailable'}}:{data:{outcomes:[],providerMutationPerformed:false}};
   return patch.recordFailure?{error:{message:'private'}}:{data:{status:'observed_only',financialAuthority:false,settlementReady:false}};
  }}})};
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/stripe-fee-report-import/index.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,runtime);
 const request=(body={},authorization='Bearer service_fixture')=>new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:authorization},body:JSON.stringify({...('order_id' in body?{}:{contract_id:contract}),report_run_id:'frr_fixture',file_id:'file_fixture',interval_start:100,interval_end:200,...body})});
 return {handler,calls,request};
}
test('service report ingestion derives account and objects from private DB then persists observed-only evidence',async()=>{
 const f=fixture(); const response=await f.handler(f.request()); assert.equal(response.status,200);
 assert.deepEqual(f.calls.map(x=>x[0]),['get_commerce_fee_report_import_context','provider','record_commerce_fee_report_observation','process_commerce_fee_accounting_jobs']);
 assert.equal(f.calls[1][1].accountId,'acct_fixture'); assert.equal(f.calls[1][1].chargeId,'ch_fixture');
 assert.equal(f.calls[2][1].p_source_observation_id,'e7100000-0000-4000-8000-000000000002');
 const result=await response.json();assert.equal(result.financialAuthority,false);assert.equal(result.settlementReady,false);
});
test('merch identity uses stored order chain and the merch evidence RPC',async()=>{
 const f=fixture({context:{orderId:contract}});
 assert.equal((await f.handler(f.request({order_id:contract}))).status,200);
 assert.deepEqual(f.calls.map(x=>x[0]),['get_merch_fee_report_import_context','provider','record_merch_fee_report_observation','process_commerce_fee_accounting_jobs']);
 assert.equal(f.calls[0][1].p_order_id,contract);assert.equal(f.calls[2][1].p_order_id,contract);
 assert.equal('p_contract_id' in f.calls[2][1],false);
});
test('ambiguous sale identity is rejected before either provider path',async()=>{
 const f=fixture();assert.equal((await f.handler(f.request({order_id:contract,contract_id:contract}))).status,400);assert.equal(f.calls.length,0);
});
test('accounting failure retains successful immutable import and explicitly exposes deferred recovery',async()=>{
 const f=fixture({accountingFailure:true});const response=await f.handler(f.request());assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.accounting.status,'deferred');assert.equal(result.accounting.reason,'accounting_drain_incomplete');
 assert.equal(f.calls.at(-1)[1].p_limit,1);assert.equal(f.calls.at(-1)[1].p_source_id,contract);
});
test('mismatched stored merchandise identity cannot reach Stripe',async()=>{
 const f=fixture({context:{orderId:'different'}});assert.equal((await f.handler(f.request({order_id:contract}))).status,409);assert.equal(f.calls.some(x=>x[0]==='provider'),false);
});
test('non-service caller cannot reach DB or Stripe',async()=>{
 const f=fixture();assert.equal((await f.handler(f.request({},'Bearer user_jwt'))).status,403);assert.equal(f.calls.length,0);
});
test('GET does not invoke provider or persistence',async()=>{
 const f=fixture();assert.equal((await f.handler(new Request('https://fixture.invalid'))).status,405);assert.equal(f.calls.length,0);
});
for(const field of ['accountId','chargeId','refundIds','secret','financialAuthority'])test(`caller cannot supply ${field}`,async()=>{
 const f=fixture();assert.equal((await f.handler(f.request({[field]:'untrusted'}))).status,400);assert.equal(f.calls.length,0);
});
for(const patch of [{context:{contractId:'different'}},{env:{STRIPE_FEE_REPORT_TEST_ACCOUNT_ID:'acct_other'}},{env:{STRIPE_FEE_REPORT_TEST_KEY:''}},{context:{environment:'unknown'}}])test('invalid stored context or configuration blocks provider',async()=>{
 const f=fixture(patch);assert.notEqual((await f.handler(f.request())).status,200);assert.equal(f.calls.some(x=>x[0]==='provider'),false);
});
test('persistence failure never returns success',async()=>{
 const f=fixture({recordFailure:true});assert.equal((await f.handler(f.request())).status,409);
});
test('oversized request is rejected before DB or provider',async()=>{
 const f=fixture();assert.equal((await f.handler(f.request({file_id:'x'.repeat(5000)}))).status,409);assert.equal(f.calls.length,0);
});
