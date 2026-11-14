import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const exports=loadPureTypeScriptModule('supabase/functions/_shared/stripe-paid-video-checkout.ts',{
 './google-play-stripe-tax-evidence.ts':loadPureTypeScriptModule('supabase/functions/_shared/google-play-stripe-tax-evidence.ts'),
});
const order={id:'order',buyer_id:'buyer',video_id:'video',price_id:'price',price_revision:1,amount_minor:1000,currency:'usd',environment:'sandbox',stripe_account_id:'acct_test',stripe_product_id:'prod_video',checkout_session_id:'cs_test_one',expires_at:'2027-01-01T00:31:00Z'};
const tax={ready:true,taxBehavior:'inclusive',taxCode:'txcd_10000000',collectionMode:'automatic',liabilityType:'self',policyId:'policy'};
const metadata={chillywoodFlow:'stripe_paid_video_sandbox',orderId:'order',buyerId:'buyer',videoId:'video',priceId:'price',priceRevision:'1'};
const session={id:'cs_test_one',livemode:false,mode:'payment',payment_status:'paid',status:'complete',client_reference_id:'order',payment_intent:'pi_one',amount_total:1000,currency:'usd',metadata};
const intent={id:'pi_one',livemode:false,status:'succeeded',latest_charge:'ch_one',amount_received:1000,currency:'usd',metadata};
const charge={id:'ch_one',livemode:false,paid:true,captured:true,payment_intent:'pi_one',amount:1000,currency:'usd',amount_refunded:0};
const product={id:'prod_video',livemode:false,active:true};
test('synthetic web mechanics require explicit exact binding and remain visibly synthetic',()=>{
 const web={...order,checkout_platform:'web',tax_evidence_kind:'synthetic_test_no_collection'};
 const policy={ready:true,taxBehavior:'inclusive',taxCode:'txcd_100',collectionMode:'synthetic_test_no_collection',evidenceKind:'synthetic_test_no_collection',
  environment:'test',platform:'web',orderId:order.id,accountId:order.stripe_account_id,productId:order.stripe_product_id,
  policyId:'fixture',disclosure:'Synthetic test only; no tax compliance or exemption qualification'};
 const form=exports.videoCheckoutForm(web,policy,'https://example.com/return');
 assert.equal(form.get('automatic_tax[enabled]'),'false');
 assert.equal(form.get('metadata[tax_evidence_kind]'),'synthetic_test_no_collection');
 assert.match(form.get('custom_text[submit][message]'),/No real payment or tax qualification/);
 for(const patch of [{environment:'live'},{platform:'android'},{orderId:'other'},{accountId:'acct_other'},{productId:'prod_other'},{disclosure:''},{evidenceKind:'qualified'}])
  assert.throws(()=>exports.videoCheckoutForm(web,{...policy,...patch},'https://example.com/return'));
 for(const checkout_platform of ['ios','android',undefined])assert.throws(()=>exports.videoCheckoutForm({...web,checkout_platform},policy,'https://example.com/return'));
 const md={...metadata,tax_evidence_kind:'synthetic_test_no_collection'};
 const s={...session,metadata:md,automatic_tax:{enabled:false},total_details:{amount_tax:0}};
 const i={...intent,metadata:md};
 assert.equal(exports.paidVideoFacts(web,s,i,charge,product).livemode,false);
 assert.throws(()=>exports.paidVideoFacts(order,s,i,charge,product));
 for(const patch of [{livemode:true},{automatic_tax:{enabled:true}},{total_details:{amount_tax:1}},{metadata}])
  assert.throws(()=>exports.paidVideoFacts(web,{...s,...patch},i,charge,product));
 assert.throws(()=>exports.paidVideoFacts({...web,checkout_platform:'android'},s,i,charge,product));
});
test('archived products still reconcile provider-confirmed partial and full historical refunds',async()=>{
 for(const amount of [300,1000]){
  const calls=[],reads=[];
  const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'refunded'},error:null};}};
  // Stripe retains paid/succeeded on refunded payments; refunded is true only
  // when the entire charge has been refunded. Product active is mutable catalog state.
  const historicalCharge={...charge,object:'charge',amount_refunded:amount,refunded:amount===1000};
  const get=async(_secret,path)=>{
   reads.push(path);
   if(path==='/account')return {id:'acct_test',object:'account'};
   if(path.includes('/line_items'))return {object:'list',has_more:false,data:[{quantity:1,price:{product:'prod_video',unit_amount:1000,tax_behavior:'inclusive'}}]};
   if(path.startsWith('/checkout/sessions/'))return {...session,object:'checkout.session'};
   if(path.startsWith('/payment_intents/'))return {...intent,object:'payment_intent'};
   if(path.startsWith('/charges/'))return historicalCharge;
   if(path.startsWith('/products/'))return {...product,object:'product',active:false};
   throw Error(`unexpected read: ${path}`);
  };
  await exports.reconcileStripeVideoOrder(admin,order,'sk_test_value',`evt_refund${amount}`,get);
  assert.equal(reads.length,6);assert.equal(calls.length,1);
  assert.equal(calls[0].name,'observe_stripe_sandbox_video_payment');
  assert.equal(calls[0].args.p_event_id,`evt_refund${amount}`);
  assert.equal(calls[0].args.p_facts.refundAmountMinor,amount);
  assert.equal(calls[0].args.p_facts.productId,'prod_video');
  assert.equal(calls[0].args.p_facts.paymentStatus,'paid');
 }
});
test('archived historical products do not weaken provider identity or payment validation',()=>{
 const archived={...product,active:false};
 assert.equal(exports.paidVideoFacts(order,session,intent,charge,archived).refundAmountMinor,0);
 for(const patch of [{id:'prod_other'},{livemode:true},{active:null},{active:undefined}])
  assert.throws(()=>exports.paidVideoFacts(order,session,intent,charge,{...archived,...patch}));
 for(const patch of [{amount_refunded:1001},{amount_refunded:null},{payment_intent:'pi_other'},{captured:false}])
  assert.throws(()=>exports.paidVideoFacts(order,session,intent,{...charge,...patch},archived));
 assert.throws(()=>exports.paidVideoFacts(order,session,{...intent,metadata:{...metadata,buyerId:'other'}},charge,archived));
});
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
test('Google reporting uses original charge time and complete refund time, never conflates them',async()=>{
 const paid={...session,object:'checkout.session',automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:100,amount_discount:0,amount_shipping:0},customer_details:{address:{country:'US'}}};
 const refunded={...charge,created:1000,amount_refunded:300};
 const refund={object:'refund',id:'re_one',charge:'ch_one',payment_intent:'pi_one',currency:'usd',amount:300,status:'succeeded',created:2000};
 const read=async patch=>exports.stripeVideoGoogleReportEvidence(paid,refunded,async()=>({object:'list',has_more:false,data:[{...refund,...patch}]}));
 const valid=await read({});assert.equal(valid.paidOccurredAt,new Date(1000000).toISOString());assert.equal(valid.refundOccurredAt,new Date(2000000).toISOString());assert.equal(valid.tax.taxAmountMinor,100);
 for(const patch of [{charge:'ch_other'},{payment_intent:'pi_other'},{amount:301},{created:999},{created:null},{currency:'eur'}])assert.equal((await read(patch)).refundOccurredAt,null);
 const missing=await exports.stripeVideoGoogleReportEvidence(session,{...refunded,created:null},async()=>{throw Error('unavailable')});
 assert.equal(missing.paidOccurredAt,null);assert.equal(missing.refundOccurredAt,null);assert.equal(missing.tax,null);
});
test('report enrichment runs after committed observation, including repeated polls and missing evidence',async()=>{
 const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'refunded'},error:null}}};
 const nativeOrder={...order,checkout_platform:'android'};
 const get=async(_secret,path)=>path==='/account'?{id:'acct_test'}:path.includes('/line_items')?{has_more:false,data:[{quantity:1,price:{product:'prod_video',unit_amount:1000,tax_behavior:'inclusive'}}]}:path.includes('/checkout/')?session:path.includes('/payment_intents/')?intent:path.includes('/charges/')?{...charge,amount_refunded:100}:path.includes('/products/')?product:(()=>{throw Error('tax unavailable')})();
 await exports.reconcileStripeVideoOrder(admin,nativeOrder,'sk_test_value',undefined,get);
 await exports.reconcileStripeVideoOrder(admin,nativeOrder,'sk_test_value',undefined,get);
 assert.deepEqual(calls.map(c=>c.name),['observe_stripe_sandbox_video_payment','repair_stripe_video_google_reporting','observe_stripe_sandbox_video_payment','repair_stripe_video_google_reporting']);
 const args=calls[1].args;assert.equal(args.p_refund_amount_minor,100);assert.equal(args.p_original_occurred_at,null);assert.equal(args.p_refund_occurred_at,null);assert.equal(args.p_tax,null);
});
test('reporting RPC failure cannot happen before financial refund observation is committed',async()=>{
 const calls=[];const admin={rpc:async(name)=>{calls.push(name);return name==='repair_stripe_video_google_reporting'?{error:true}:{data:{status:'refunded'}}}};
 const get=async(_secret,path)=>path==='/account'?{id:'acct_test'}:path.includes('/line_items')?{has_more:false,data:[{quantity:1,price:{product:'prod_video',unit_amount:1000,tax_behavior:'inclusive'}}]}:path.includes('/checkout/')?session:path.includes('/payment_intents/')?intent:path.includes('/charges/')?{...charge,amount_refunded:100}:path.includes('/products/')?product:(()=>{throw Error('missing')})();
 await assert.rejects(exports.reconcileStripeVideoOrder(admin,{...order,checkout_platform:'android'},'sk_test_value',undefined,get),/video_authority_unavailable/);
 assert.deepEqual(calls,['observe_stripe_sandbox_video_payment','repair_stripe_video_google_reporting']);
});
