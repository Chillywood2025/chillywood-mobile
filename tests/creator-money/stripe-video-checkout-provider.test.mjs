import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const exports={};
new Function('exports',ts.transpileModule(readFileSync('supabase/functions/_shared/stripe-paid-video-checkout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const order={id:'order',buyer_id:'buyer',video_id:'video',price_id:'price',price_revision:1,amount_minor:1000,currency:'usd',environment:'sandbox',stripe_account_id:'acct_test',stripe_product_id:'prod_video',checkout_session_id:'cs_test_one',expires_at:'2027-01-01T00:31:00Z'};
const tax={ready:true,taxBehavior:'inclusive',taxCode:'txcd_10000000',collectionMode:'automatic',liabilityType:'self',policyId:'policy'};
const metadata={chillywoodFlow:'stripe_paid_video_sandbox',orderId:'order',buyerId:'buyer',videoId:'video',priceId:'price',priceRevision:'1'};
const session={id:'cs_test_one',livemode:false,mode:'payment',payment_status:'paid',status:'complete',client_reference_id:'order',payment_intent:'pi_one',amount_total:1000,currency:'usd',metadata};
const intent={id:'pi_one',livemode:false,status:'succeeded',latest_charge:'ch_one',amount_received:1000,currency:'usd',metadata};
const charge={id:'ch_one',livemode:false,paid:true,captured:true,payment_intent:'pi_one',amount:1000,currency:'usd',amount_refunded:0};
const product={id:'prod_video',livemode:false,active:true};
test('Stripe form uses documented payment_method_types, fixed server amount, inclusive tax and no destination',()=>{
 const form=exports.videoCheckoutForm(order,tax,'https://example.com/stripe-video/return');
 assert.equal(form.get('payment_method_types[0]'),'card');assert.equal(form.get('line_items[0][price_data][unit_amount]'),'1000');
 assert.equal(form.get('line_items[0][price_data][tax_behavior]'),'inclusive');
 assert.ok(!form.toString().includes('transfer_data'));assert.ok(!form.toString().includes('application_fee'));
 for(const bad of [{...tax,taxBehavior:'exclusive'},{...tax,ready:false}])assert.throws(()=>exports.videoCheckoutForm(order,bad,'https://example.com/return'));
 assert.throws(()=>exports.videoCheckoutForm(order,tax,'chillywoodmobile://return'));
});
test('exact test platform charge accepted; wrong identity, live, diversion, refund ambiguity fail closed',()=>{
 assert.equal(exports.paidVideoFacts(order,session,intent,charge,product).refundAmountMinor,0);
 for(const patch of [{livemode:true},{amount_received:999},{transfer_data:{destination:'acct_other'}},{application_fee_amount:1},{on_behalf_of:'acct_other'},{metadata:{...metadata,buyerId:'other'}}])
 assert.throws(()=>exports.paidVideoFacts(order,session,{...intent,...patch},charge,product));
 for(const patch of [{disputed:true},{amount_refunded:null},{amount_refunded:-1},{transfer:'tr_other'},{captured:false}])
 assert.throws(()=>exports.paidVideoFacts(order,session,intent,{...charge,...patch},product));
 assert.throws(()=>exports.paidVideoFacts(order,{...session,client_reference_id:'other'},intent,charge,product));
 assert.equal(exports.paidVideoFacts(order,session,intent,{...charge,amount_refunded:100},product).refundAmountMinor,100);
});
test('lost response GET recovery binds only a unique exact session after bounded exhaustive pages',async()=>{
 const recovering={...order,status:'dispatched',checkout_session_id:null,created_at:'2026-11-12T00:00:00Z'};
 const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:{},error:null};}};
 const candidate={...session,metadata};
 const run=async(items,more=false)=>{let pages=0;const result=await exports.recoverStripeVideoSession(admin,recovering,'sk_test_value',async(_secret,path)=>{
  if(path==='/account')return {id:'acct_test'};
  if(path.includes('line_items'))return {has_more:false,data:[{quantity:1,price:{product:'prod_video',unit_amount:1000,tax_behavior:'inclusive'}}]};
  pages++;return {has_more:more,data:items};
 });return {result,pages};};
 assert.equal((await run([candidate])).result,'cs_test_one');assert.equal(calls.length,1);
 calls.length=0;assert.equal((await run([])).result,null);
 assert.equal((await run([candidate,{...candidate,id:'cs_test_two'}])).result,null);
 assert.equal((await run([{...candidate,metadata:{...metadata,buyerId:'other'}}])).result,null);
 const bounded=await run([candidate],true);assert.equal(bounded.result,null);assert.equal(bounded.pages,10);assert.equal(calls.length,0);
});
test('expired checkout releases a retry only with conclusively absent or canceled payment intent',async()=>{
 for(const state of ['absent','canceled','processing','requires_action','succeeded']){
  const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:{},error:null};}};
  const result=await exports.reconcileStripeVideoOrder(admin,order,'sk_test_value',undefined,async(_secret,path)=>{
   if(path==='/account')return {id:'acct_test'};
   if(path.startsWith('/checkout/'))return {...session,status:'expired',payment_status:'unpaid',payment_intent:state==='absent'?null:'pi_one'};
   return {id:'pi_one',status:state};
  });
  const terminal=['absent','canceled'].includes(state);
  assert.equal(calls.length,terminal?1:0);if(terminal)assert.equal(result.status,'failed');
 }
});
