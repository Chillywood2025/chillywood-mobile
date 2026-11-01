import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const loaded={exports:{},AbortSignal,require:name=>{
 if(name==='./stripe-refund-tax-evidence.ts')return loadPureTypeScriptModule('supabase/functions/_shared/stripe-refund-tax-evidence.ts');
 throw Error(`Unexpected production dependency ${name}`);
}};
vm.runInNewContext(compile('supabase/functions/_shared/stripe-auction-cost-observation.ts'),loaded);
export const observe=loaded.exports.observeStripeAuctionCosts;
export const order={id:'e7100000-0000-4000-8000-000000000001',quote_id:'e7100000-0000-4000-8000-000000000003',lane:'event',platform_product_id:'prod_Platform',buyer_id:'e7100000-0000-4000-8000-000000000002',stripe_checkout_session_id:'cs_test_merch',stripe_payment_intent_id:'pi_merch',stripe_charge_id:null,amount_total_minor:1000,currency:'usd',environment:'test'};
// Explicit synthetic provider transport; actual production adapter runs intact.
export function fixture(patch={}){
 const data={
  '/account':{id:'acct_fixture',object:'account'},
  '/checkout/sessions/cs_test_merch':{id:'cs_test_merch',object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',client_reference_id:order.quote_id,payment_intent:'pi_merch',amount_total:1000,currency:'usd',metadata:{auction_quote_id:order.quote_id,settlement_contract_id:order.id,settlement_policy:"auction_platform_net_80_20_v1",provider_product_id:order.platform_product_id,buyer_user_id:order.buyer_id,environment:'test',rail:'stripe_event_auction'},automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:100}},
  '/payment_intents/pi_merch':{id:'pi_merch',object:'payment_intent',livemode:false,status:'succeeded',currency:'usd',amount:1000,amount_received:1000,latest_charge:'ch_merch',transfer_data:null,application_fee_amount:null,on_behalf_of:null},
  '/charges/ch_merch':{id:'ch_merch',object:'charge',livemode:false,payment_intent:'pi_merch',paid:true,captured:true,currency:'usd',amount:1000,amount_captured:1000,amount_refunded:0,refunded:false,disputed:false,balance_transaction:'txn_sale'},
  '/balance_transactions/txn_sale':{id:'txn_sale',object:'balance_transaction',source:'ch_merch',type:'charge',currency:'usd',amount:1000,fee:30,net:970,status:'available'},
  '/refunds?charge=ch_merch&limit=100':{object:'list',data:[],has_more:false},...patch};
 const calls=[];
 return {data,calls,transport:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer sk_test_synthetic');
  assert.equal(options.headers['Stripe-Version'],'2026-10-28.endive');assert.equal(options.headers['Stripe-Account'],undefined);
  const key=url.replace('https://api.stripe.com/v1','');calls.push(key);
  if(key.startsWith('/tax/associations/find?')&&!data[key])return new Response('{}',{status:404});
  assert.ok(data[key],`Unexpected synthetic transport request ${key}`);
  return new Response(JSON.stringify(data[key]),{status:200});
 }};
}
test('actual GET adapter verifies account, exact stored order chain and known fees/tax without granting money',async()=>{
 const f=fixture(),e=await observe(order,'sk_test_synthetic','acct_fixture',f.transport);
 assert.equal(e.provider_fee_minor,30);assert.equal(e.charge_net_minor,970);assert.equal(e.tax_minor,100);
 assert.equal(e.store_fee_minor,null);assert.equal(e.financial_authority,false);assert.equal(e.adjustments_qualified,false);
 assert.equal(f.calls.filter(x=>x==='/charges/ch_merch').length,2);
});
for(const [path,key,value] of [
 ['/account','id','acct_wrong'],['/checkout/sessions/cs_test_merch','client_reference_id','another-order'],
 ['/checkout/sessions/cs_test_merch','payment_intent','pi_wrong'],['/checkout/sessions/cs_test_merch','livemode',true],
 ['/payment_intents/pi_merch','amount_received',999],['/payment_intents/pi_merch','transfer_data',{destination:'acct_bad'}],['/payment_intents/pi_merch','application_fee_amount',10],['/charges/ch_merch','currency','eur'],
 ['/charges/ch_merch','payment_intent','pi_wrong'],['/charges/ch_merch','amount_captured',999],
 ['/charges/ch_merch','balance_transaction',null],['/balance_transactions/txn_sale','source','ch_wrong'],
 ['/balance_transactions/txn_sale','fee',null],['/balance_transactions/txn_sale','net',971],
 ['/balance_transactions/txn_sale','amount',999],['/balance_transactions/txn_sale','currency','eur'],
 ['/balance_transactions/txn_sale','type','adjustment'],['/charges/ch_merch','disputed',undefined],
]) test(`rejects provider mismatch/unknown ${path} ${key}`,async()=>{
 const f=fixture();f.data[path][key]=value;await assert.rejects(observe(order,'sk_test_synthetic','acct_fixture',f.transport));
});
test('disabled tax stays unknown; zero known tax is distinct',async()=>{
 const f=fixture();f.data['/checkout/sessions/cs_test_merch'].automatic_tax.enabled=false;
 assert.equal((await observe(order,'sk_test_synthetic','acct_fixture',f.transport)).tax_minor,null);
 f.data['/checkout/sessions/cs_test_merch'].automatic_tax.enabled=true;f.data['/checkout/sessions/cs_test_merch'].total_details.amount_tax=0;
 assert.equal((await observe(order,'sk_test_synthetic','acct_fixture',f.transport)).tax_minor,0);
});
test('refund cash movements are disjoint and partial tax reversal remains unknown',async()=>{
 const f=fixture();f.data['/charges/ch_merch'].amount_refunded=500;
 f.data['/refunds?charge=ch_merch&limit=100'].data=[{id:'re_partial',charge:'ch_merch',payment_intent:'pi_merch',currency:'usd',status:'succeeded',amount:500,balance_transaction:'txn_refund'}];
 f.data['/balance_transactions/txn_refund']={id:'txn_refund',object:'balance_transaction',source:'re_partial',type:'refund',amount:-500,fee:0,net:-500,currency:'usd',status:'available'};
 const e=await observe(order,'sk_test_synthetic','acct_fixture',f.transport);assert.equal(e.refunded_minor,500);assert.equal(e.tax_reversal_minor,null);assert.equal(e.refunds[0].net,-500);
 f.data['/balance_transactions/txn_refund'].net=-400;await assert.rejects(observe(order,'sk_test_synthetic','acct_fixture',f.transport));
});
test('service endpoint requires exact service credential before provider reads and forbids caller fee proof',async()=>{
 let handler,calls=0;const runtime={exports:{},Deno:{serve:fn=>handler=fn},require:specifier=>{
  if(specifier.startsWith('jsr:'))return{};
  if(specifier.endsWith('stripe-auction-cost-observation.ts'))return{observeStripeAuctionCosts:async()=>{calls++;return{};}};
  return{readOptionalEnv:key=>key==='SUPABASE_SERVICE_ROLE_KEY'?'service_synthetic':key==='STRIPE_AUCTION_PLATFORM_TEST_KEY'?'sk_test_synthetic':'acct_fixture',readStripeTestSecret:()=>({configured:true,secret:'sk_test_synthetic'}),jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),createAdminClient:()=>{throw Error('must not reach database');}};
 }};
 vm.runInNewContext(compile('supabase/functions/stripe-auction-cost-reconcile/index.ts'),runtime);
 assert.equal((await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer user_jwt'},body:'{}'}))).status,403);
 assert.equal((await handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer service_synthetic'},body:JSON.stringify({contract_id:order.id,provider_fee_minor:0})}))).status,400);
 assert.equal(calls,0);assert.match(fs.readFileSync('supabase/config.toml','utf8'),/\[functions\.stripe-auction-cost-reconcile\][\s\S]*?verify_jwt = true/);
});
