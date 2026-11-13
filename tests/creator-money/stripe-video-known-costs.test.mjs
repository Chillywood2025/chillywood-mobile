import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';

const math=loadPureTypeScriptModule('supabase/functions/_shared/commerce-known-cost-accounting.ts');
const checkout=loadPureTypeScriptModule('supabase/functions/_shared/stripe-paid-video-checkout.ts',{
 './google-play-stripe-tax-evidence.ts':loadPureTypeScriptModule('supabase/functions/_shared/google-play-stripe-tax-evidence.ts'),
});
function fixture({mode='automatic',tax=100,refund=0,changedFinal=false,oversizedHistory=false}={}){
 const order={id:'order',buyer_id:'buyer',video_id:'video',price_id:'price',price_revision:1,environment:'sandbox',currency:'usd',amount_minor:1000,
  stripe_account_id:'acct_test',stripe_product_id:'prod_one',checkout_session_id:'cs_test_one',payment_intent_id:'pi_one',charge_id:'ch_one',taxCollectionMode:mode};
 const metadata={chillywoodFlow:'stripe_paid_video_sandbox',orderId:'order',buyerId:'buyer',videoId:'video',priceId:'price',priceRevision:'1'};
 const session={id:'cs_test_one',livemode:false,mode:'payment',payment_status:'paid',status:'complete',client_reference_id:'order',payment_intent:'pi_one',amount_total:1000,currency:'usd',metadata,
  automatic_tax:{enabled:mode==='automatic',status:'complete'},total_details:{amount_tax:tax}};
 const intent={id:'pi_one',livemode:false,status:'succeeded',latest_charge:'ch_one',amount_received:1000,currency:'usd',metadata};
 const charge={id:'ch_one',livemode:false,paid:true,captured:true,payment_intent:'pi_one',amount:1000,currency:'usd',disputed:false,amount_refunded:refund,balance_transaction:'txn_charge'};
 const product={id:'prod_one',livemode:false,active:true};
 let taxCalls=0,chargeReads=0;const paths=[];
 const transport=async(url,init)=>{
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.ok(init.signal);
  const path=new URL(url).pathname;paths.push(path);
  const data=path==='/v1/account'?{id:'acct_test'}:path.includes('/checkout/sessions/')?session:path.includes('/payment_intents/')?intent:
   path.includes('/products/')?product:path.includes('/charges/')?{...charge,...(++chargeReads>1&&changedFinal?{livemode:true}:{} )}:
   path.endsWith('/txn_charge')?{id:'txn_charge',source:'ch_one',currency:'usd',amount:1000,fee:40,net:960,status:'available'}:
   path.endsWith('/txn_refund')?{id:'txn_refund',source:'re_one',currency:'usd',amount:-refund,fee:0,net:-refund,status:'available'}:
   path==='/v1/refunds'?{object:'list',has_more:false,data:oversizedHistory?Array(9).fill({}):refund?[{id:'re_one',charge:'ch_one',payment_intent:'pi_one',currency:'usd',status:'succeeded',amount:refund,balance_transaction:'txn_refund'}]:[]}:
   null;
  if(!data)throw Error(path);return new Response(JSON.stringify(data),{status:200});
 };
 const report={reportRunId:'frr_one',fileId:'file_one',intervalStart:1,intervalEnd:2};
 const deps={
  './commerce-known-cost-accounting.ts':math,'./stripe-paid-video-checkout.ts':checkout,
  './stripe-refund-tax-evidence.ts':{observeStripeRefundTax:async(_context,_key,_transport,options)=>{assert.equal(options.timeoutMs,60000);assert.ok(options.signal);taxCalls++;return {tax_reversal_minor:10};}},
  './stripe-fee-report-evidence.ts':{observeStripeFeeReport:async(context,_key,_transport,options)=>{assert.equal(options.timeoutMs,60000);assert.ok(options.signal);return {...context,rows:[],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:3};}},
 };
 const code=ts.transpileModule(readFileSync('supabase/functions/_shared/stripe-video-known-costs.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(name=>{if(!deps[name])throw Error(name);return deps[name];},module,module.exports);
 return {run:(options={})=>module.exports.observeStripeVideoKnownCosts(order,[report],'sk_test_value',transport,options),paths,taxCalls:()=>taxCalls,order};
}
test('provider GET cost observer reuses shared net math and real fee balances',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.calculation.creatorMinor,688);assert.equal(result.calculation.platformMinor,172);
 assert.equal(result.calculation.totalFeeMinor,40);assert.equal(result.calculation.financialAuthority,false);
 assert.equal(f.paths.filter(p=>p.includes('/charges/')).length,2);
});
test('verified no-collection needs explicit zero and never fabricates refund tax',async()=>{
 const f=fixture({mode:'verified_no_collection',tax:0,refund:100});const result=await f.run();
 assert.equal(result.input.taxReversalMinor,0);assert.equal(f.taxCalls(),0);assert.equal(result.calculation.creatorMinor,688);
 await assert.rejects(fixture({mode:'verified_no_collection',tax:1}).run(),/binding_invalid/);
 const unknown=fixture({mode:'unknown'});await assert.rejects(unknown.run(),/binding_invalid/);
});
test('automatic refund uses tax evidence and final changed provider state is rejected',async()=>{
 const f=fixture({refund:100});assert.equal((await f.run()).input.taxReversalMinor,10);assert.equal(f.taxCalls(),1);
 await assert.rejects(fixture({changedFinal:true}).run(),/provider_payment_not_exact/);
 const live=fixture();live.order.environment='production';await assert.rejects(live.run(),/binding_invalid/);
});
test('history bounds and caller cancellation prevent incomplete cost materialization',async()=>{
 await assert.rejects(fixture({oversizedHistory:true}).run(),/refund_history_requires_continuation/);
 const f=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(f.run({signal:controller.signal}),/abort/i);assert.equal(f.paths.length,0);
});
