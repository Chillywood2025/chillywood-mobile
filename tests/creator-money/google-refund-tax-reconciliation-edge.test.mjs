import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
import {fixture as taxFixture} from './refund-tax-evidence-edge.test.mjs';
const module={exports:{}};
new Function('require','module','exports',ts.transpileModule(readFileSync('supabase/functions/_shared/google-refund-tax-reconciliation.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
  assert.equal(name,'./stripe-refund-tax-evidence.ts');return loadPureTypeScriptModule('supabase/functions/_shared/stripe-refund-tax-evidence.ts');
 },module,module.exports);
const {observeGoogleRefundTax}=module.exports;
const context={transaction_id:'synthetic-transaction',feature:'creator_tip',quote_id:'synthetic-tip',buyer_id:'synthetic-buyer',creator_id:'synthetic-creator',
 checkout_id:'cs_test_sale',payment_intent_id:'pi_sale',gross_minor:1001,tax_minor:91,currency:'usd',recipient_account_id:'acct_creator',platform_account_id:null};
function fixture(){
 const f=taxFixture();Object.assign(f.data,{
  '/account':{id:'acct_platform',object:'account'},
  '/checkout/sessions/cs_test_sale':{id:'cs_test_sale',object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',
   client_reference_id:'synthetic-tip',payment_intent:'pi_sale',currency:'usd',amount_total:1001,automatic_tax:{enabled:true,status:'complete'},
   total_details:{amount_tax:91,amount_discount:0,amount_shipping:0},metadata:{chillywood_tip_id:'synthetic-tip',fan_user_id:'synthetic-buyer',creator_user_id:'synthetic-creator'}},
  '/payment_intents/pi_sale':{id:'pi_sale',object:'payment_intent',livemode:false,status:'succeeded',currency:'usd',amount:1001,amount_received:1001,
   latest_charge:'ch_sale',transfer_data:{destination:'acct_creator'}},
  '/charges/ch_sale':{id:'ch_sale',object:'charge',livemode:false,payment_intent:'pi_sale',currency:'usd',paid:true,captured:true,amount:1001,
   amount_captured:1001,amount_refunded:555,disputed:false},
  '/refunds?charge=ch_sale&limit=100':{object:'list',has_more:false,data:[{id:'re_first',charge:'ch_sale',payment_intent:'pi_sale',currency:'usd',status:'succeeded',amount:333},
   {id:'re_second',charge:'ch_sale',payment_intent:'pi_sale',currency:'usd',status:'succeeded',amount:222}]},
 });return {...f,observe:()=>observeGoogleRefundTax(context,'sk_test_synthetic','acct_platform',f.transport)};
}
test('actual Google tax repair observes exact stored buyer/payment/refund chain then actual tax adapter',async()=>{
 const f=fixture(),facts=await f.observe();assert.equal(facts.tax_reversal_minor,50);assert.equal(facts.refunded_minor,555);
 assert.equal(facts.refund_tax_evidence.provenance,'stripe_tax_association_get_v1');
 assert.equal(facts.charge_id,'ch_sale');assert.equal(f.calls.filter(p=>p==='/charges/ch_sale').length,2);
});
for(const [path,key,value] of [
 ['/account','id','acct_other'],['/checkout/sessions/cs_test_sale','client_reference_id','wrong'],
 ['/checkout/sessions/cs_test_sale','total_details',{amount_tax:90,amount_shipping:0,amount_discount:0}],
 ['/checkout/sessions/cs_test_sale','livemode',true],['/payment_intents/pi_sale','amount_received',1000],
 ['/payment_intents/pi_sale','transfer_data',{destination:'acct_wrong'}],['/charges/ch_sale','amount_refunded',554],
 ['/charges/ch_sale','captured',false],
])test(`Google repair rejects ${path} ${key}`,async()=>{
 const f=fixture();f.data[path][key]=value;await assert.rejects(f.observe());
});
test('failed/pending refund and metadata mismatch never produce tax proof',async()=>{
 const f=fixture();f.data['/refunds?charge=ch_sale&limit=100'].data[0].status='pending';await assert.rejects(f.observe());
 const g=fixture();g.data['/checkout/sessions/cs_test_sale'].metadata.fan_user_id='wrong';await assert.rejects(g.observe());
});
test('missing association leaves a durable unknown rather than emitting proof',async()=>{
 const f=fixture();f.data['/tax/associations/find?payment_intent=pi_sale']=new Response('{}',{status:404});assert.equal(await f.observe(),null);
});
test('charge refund racing tax reads rejects stale aggregate',async()=>{
 const f=fixture();let charges=0;
 const transport=async(url,init)=>{if(url.endsWith('/charges/ch_sale')&&++charges===2)f.data['/charges/ch_sale'].amount_refunded=600;return f.transport(url,init);};
 await assert.rejects(observeGoogleRefundTax(context,'sk_test_synthetic','acct_platform',transport));
});

function videoFixture(){
 const f=fixture(),uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
 const ctx={...context,feature:'paid_video',quote_id:uuid(1),buyer_id:uuid(2),creator_id:uuid(3),
  video_id:uuid(4),price_id:uuid(5),price_revision:2,tax_policy_id:uuid(6),recipient_account_id:null,platform_account_id:'acct_platform'};
 const metadata={chillywoodFlow:'stripe_paid_video_sandbox',orderId:ctx.quote_id,buyerId:ctx.buyer_id,
  videoId:ctx.video_id,priceId:ctx.price_id,priceRevision:'2',commerce_tax_policy_id:ctx.tax_policy_id};
 Object.assign(f.data['/checkout/sessions/cs_test_sale'],{client_reference_id:ctx.quote_id,metadata:{...metadata}});
 Object.assign(f.data['/payment_intents/pi_sale'],{metadata:{...metadata},transfer_data:null,application_fee_amount:null,on_behalf_of:null});
 return {...f,ctx,observe:()=>observeGoogleRefundTax(ctx,'sk_test_synthetic','acct_platform',f.transport)};
}
test('paid-video tax repair validates its own stored order metadata on session and intent',async()=>{
 const f=videoFixture(),facts=await f.observe();assert.equal(facts.tax_reversal_minor,50);assert.equal(facts.account_id,'acct_platform');
});
for(const key of ['orderId','buyerId','videoId','priceId','priceRevision','commerce_tax_policy_id','chillywoodFlow'])
 for(const path of ['/checkout/sessions/cs_test_sale','/payment_intents/pi_sale'])
 test(`paid-video rejects substituted ${key} on ${path}`,async()=>{
  const f=videoFixture();f.data[path].metadata[key]='wrong';await assert.rejects(f.observe());
 });
test('paid-video context requires explicit platform identity and complete stored price/tax binding before reads',async()=>{
 for(const patch of [{platform_account_id:null},{platform_account_id:'acct_other'},{recipient_account_id:'acct_creator'},
  {video_id:undefined},{price_id:undefined},{tax_policy_id:undefined},{price_revision:0},{price_revision:1.5},{feature:'unknown'}]){
  const f=videoFixture();Object.assign(f.ctx,patch);await assert.rejects(f.observe());assert.equal(f.calls.length,0);
 }
});
test('paid-video cannot use auction metadata or transferred/disputed charge',async()=>{
 const f=videoFixture();f.data['/checkout/sessions/cs_test_sale'].metadata={auction_quote_id:f.ctx.quote_id,buyer_user_id:f.ctx.buyer_id};await assert.rejects(f.observe());
 for(const patch of [{transfer:'tr_other'},{transfer_data:{destination:'acct_other'}},{on_behalf_of:'acct_other'},
  {application_fee:'fee_other'},{application_fee_amount:1},{disputed:true}]){
  const g=videoFixture();Object.assign(g.data['/charges/ch_sale'],patch);await assert.rejects(g.observe());
 }
});
