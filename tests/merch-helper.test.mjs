import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

test('known fee metadata remains nonfinal and fails closed for unsafe amounts or unsupported policy',()=>{
 const h=harness();
 const known={policyVersion:'known_costs_future_unpaid_adjustments_v1',knownFeeMinor:36,knownCreatorShareMinor:778,
  currentEvidence:true,released:false,finalFees:false,futureAdjustmentsPossible:true,bankDebitAllowed:false};
 const parsed=h.api.parseMerchTaxFeeMetadata({knownCostPolicy:known});
 assert.equal(parsed.knownCostPolicy.knownFeeMinor,36);assert.equal(parsed.knownCostPolicy.knownCreatorShareMinor,778);
 assert.equal(parsed.finalCreatorShareMinor,null);assert.equal(parsed.financialAuthority,false);
 for(const patch of [{finalFees:true},{futureAdjustmentsPossible:false},{bankDebitAllowed:true},{knownFeeMinor:-1},
  {knownCreatorShareMinor:Number.MAX_SAFE_INTEGER+1},{policyVersion:'unknown'},{currentEvidence:'true'}])
  assert.equal(h.api.parseMerchTaxFeeMetadata({knownCostPolicy:{...known,...patch}}).knownCostPolicy,null);
 assert.equal(h.api.parseMerchTaxFeeMetadata({knownCostPolicy:{...known,currentEvidence:false}}).knownCostPolicy.currentEvidence,false);
});

function harness({reply,request,open,timers,rpcReply}={}) {
  let current=true;
  const calls=[],opened=[],subject={accessToken:'synthetic-token',authority:{userId:'buyer'}};
  const assertCurrent=()=>{if(!current)throw Error('account_changed');};
  const context={exports:{},URL,Uint8Array,crypto:webcrypto,AbortController,
    setTimeout:timers?.setTimeout??setTimeout,clearTimeout:timers?.clearTimeout??clearTimeout,fetch:async(url,options)=>{
    calls.push({url,options});
    if(request)return request(()=>{current=false;});
    return {ok:true,json:async()=>reply??{checkoutCreated:true,orderId:'order',url:'https://checkout.stripe.com/c/pay/test'}};
  },require:name=>{
    if(name==='react-native')return {Linking:{openURL:async url=>{opened.push(url);return open?.(url);}}};
    if(name==='./supabase')return {SUPABASE_URL:'https://example.invalid'};
    if(name==='./merchProductPhotos')return {resolveMerchProductPhotos:async products=>products};
    if(name==='./accountBoundSupabaseMutation')return {
      captureAccountBoundSupabaseMutationSubject:async()=>subject,
      assertAccountBoundSupabaseMutationSubjectCurrent:assertCurrent,
      runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{assertCurrent();calls.push({name,args});return {data:rpcReply??{products:[],orders:[],nextCursor:null},error:null};},
    };
    throw Error(name);
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('_lib/creatorMerch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {api:context.exports,calls,opened};
}
const input={productId:'product',quantity:1,attemptId:'70000000-0000-4000-8000-000000000001'};
test('only exact durable abort acknowledgement grants a new explicit checkout attempt',async()=>{
 const reply={checkoutCreated:false,checkoutRetrySafe:true,abortedAttemptId:input.attemptId};
 const h=harness({reply});await assert.rejects(h.api.launchMerchCheckout(input),e=>e instanceof h.api.MerchCheckoutAbortedError&&e.attemptId===input.attemptId);
 assert.equal(h.calls.length,1);assert.equal(h.opened.length,0,'no automatic retry or browser launch');
 for(const patch of [{abortedAttemptId:'other'},{checkoutRetrySafe:false},{checkoutCreated:true},{abortedAttemptId:undefined}]){
  const bad=harness({reply:{...reply,...patch}});await assert.rejects(bad.api.launchMerchCheckout(input),e=>!(e instanceof bad.api.MerchCheckoutAbortedError));
 }
});
test('production helper sends exact catalog, owner and paging arguments to bound RPC',async()=>{
  const h=harness();await h.api.readMerchProducts({creatorId:'creator',owner:true,cursor:'last'});
  assert.equal(h.calls[0].name,'list_creator_merch_products');assert.equal(h.calls[0].args.p_manage,true);
  assert.equal(h.calls[0].args.p_creator_id,'creator');assert.equal(h.calls[0].args.p_before_id,'last');
  await h.api.readMerchOrders({role:'buyer',orderId:'order'});
  assert.equal(h.calls[1].name,'list_my_merch_orders');assert.equal(h.calls[1].args.p_order_id,'order');
});
test('checkout preserves stable attempt and opens only validated provider checkout',async()=>{
  const h=harness();assert.equal((await h.api.launchMerchCheckout(input)).orderId,'order');
  assert.equal(JSON.parse(h.calls[0].options.body).attempt_id,input.attemptId);
  assert.equal(h.opened.length,1);
  assert.match(h.api.createMerchCheckoutAttemptId(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('checkout rejects unsafe redirect, malformed success and account change before opening',async()=>{
  for(const url of ['http://checkout.stripe.com/x','https://evil.invalid/x','https://checkout.stripe.com.evil.invalid/x','https://user:pass@checkout.stripe.com/x']){
    const h=harness({reply:{checkoutCreated:true,orderId:'o',url}});
    await assert.rejects(h.api.launchMerchCheckout(input));assert.equal(h.opened.length,0);
  }
  const malformed=harness({reply:{checkoutCreated:false}});
  await assert.rejects(malformed.api.launchMerchCheckout(input));assert.equal(malformed.opened.length,0);
  const changed=harness({request:async change=>{change();return {ok:true,json:async()=>({checkoutCreated:true,orderId:'o',url:'https://checkout.stripe.com/x'})};}});
  await assert.rejects(changed.api.launchMerchCheckout(input),/account_changed/);assert.equal(changed.opened.length,0);
});
test('invalid quantity never starts network work',async()=>{
  for(const quantity of [0,11,1.5,NaN]){const h=harness();await assert.rejects(h.api.launchMerchCheckout({...input,quantity}));assert.equal(h.calls.length,0);}
});
test('SKU configuration and checkout retain exact option identity',async()=>{
  const h=harness();const variant={id:'variant',sku:'TEE-M-BLUE',size:'M',color:'Blue',stockQuantity:5,status:'active'};
  await h.api.configureMerchVariants({productId:'product',variantMode:'options',variants:[variant],expectedUpdatedAt:'2026-10-29T19:00:00Z'});
  assert.equal(h.calls[0].name,'configure_creator_merch_variants');assert.equal(h.calls[0].args.p_variants[0].id,'variant');assert.equal(h.calls[0].args.p_variant_mode,'options');
  await h.api.launchMerchCheckout({...input,variantId:'variant'});
  assert.equal(JSON.parse(h.calls[1].options.body).variant_id,'variant');
});

function fakeTimers() {
  const pending = new Map(); let id = 0;
  return { pending, setTimeout(fn, ms) { assert.equal(ms, 20_000); pending.set(++id, fn); return id; },
    clearTimeout(key) { pending.delete(key); }, expire() { for (const fn of [...pending.values()]) fn(); } };
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise,resolve}; };
const tick = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
const goodReply = {checkoutCreated:true,orderId:'order',url:'https://checkout.stripe.com/c/pay/test'};
for (const stage of ['fetch','body','native launch']) test(`checkout deadline releases an uncooperative ${stage} without a replacement attempt`, async () => {
  const waiting = deferred(), timers = fakeTimers(); let slow = true;
  const h = harness({timers,
    request:async()=>stage==='fetch'&&slow ? waiting.promise : {ok:true,json:async()=>stage==='body'&&slow ? waiting.promise : goodReply},
    open:()=>stage==='native launch'&&slow ? waiting.promise : Promise.resolve(),
  });
  const first=h.api.launchMerchCheckout(input); const rejection=assert.rejects(first,/may still be pending.*resume the same order/);
  await tick(); if(stage==='native launch') { for(let i=0;i<100 && !h.opened.length;i++)await Promise.resolve(); assert.equal(h.opened.length,1); }
  assert.equal(timers.pending.size,1); timers.expire(); await rejection;
  assert.equal(timers.pending.size,0);
  if(stage!=='native launch')assert.equal(h.calls[0].options.signal.aborted,true);
  assert.equal(h.opened.length,stage==='native launch'?1:0);
  waiting.resolve(stage==='fetch'?{ok:true,json:async()=>goodReply}:stage==='body'?goodReply:undefined);
  await tick(); assert.equal(h.opened.length,stage==='native launch'?1:0,'late transport never opens another browser');
  slow=false;
  assert.equal((await h.api.launchMerchCheckout(input)).orderId,'order');
  assert.equal(h.calls.length,2);assert.equal(JSON.parse(h.calls[1].options.body).attempt_id,input.attemptId,'explicit recovery retains attempt');
  assert.equal(timers.pending.size,0);
});
test('checkout success and rejected response clear all deadline timers',async()=>{
  for(const reply of [goodReply,{checkoutCreated:false}]){
    const timers=fakeTimers(),h=harness({timers,reply});
    if(reply.checkoutCreated)await h.api.launchMerchCheckout(input);else await assert.rejects(h.api.launchMerchCheckout(input));
    assert.equal(timers.pending.size,0);
  }
});

test('real order read normalizes dispute observation freshness without granting clearance',async()=>{
 const now=Date.now();const checked=new Date(now-1000).toISOString(),until=new Date(now+60_000).toISOString();
 const metadata={providerDisputeState:'open',providerDisputeRefreshStatus:'fresh',providerDisputeCheckedAt:checked,providerDisputeFreshUntil:until};
 const h=harness({rpcReply:{orders:[{id:'order',...metadata,returnHoldReasons:['merch_dispute_unresolved']}],nextCursor:null}});
 const page=await h.api.readMerchOrders({role:'buyer'});
 assert.equal(page.orders[0].providerDisputeState,'open');assert.equal(page.orders[0].providerDisputeRefreshStatus,'fresh');
 assert.deepEqual(page.orders[0].returnHoldReasons,['merch_dispute_unresolved']);assert.equal(page.orders[0].financialAuthority,false);
 const parse=h.api.parseMerchDisputeMetadata;
 assert.equal(parse({},now).providerDisputeRefreshStatus,'unknown');
 for(const patch of [{providerDisputeState:'cleared'},{providerDisputeRefreshStatus:'cleared'},{providerDisputeCheckedAt:'bad'},{providerDisputeFreshUntil:null},{providerDisputeCheckedAt:new Date(now+1000).toISOString()},{providerDisputeFreshUntil:new Date(now+13*60*60*1000).toISOString()}])assert.equal(parse({...metadata,...patch},now).providerDisputeRefreshStatus,'unknown');
 assert.equal(parse({...metadata,providerDisputeFreshUntil:new Date(now-1).toISOString()},now).providerDisputeRefreshStatus,'stale');
 assert.equal(parse({providerDisputeState:'unknown',providerDisputeRefreshStatus:'pending',providerDisputeCheckedAt:null,providerDisputeFreshUntil:null},now).providerDisputeRefreshStatus,'pending');
});

test('real order read preserves historical observed amounts while tax service fees and final net stay unknown',async()=>{
 const history={id:'old-order',providerFeeMinor:30,netBaseMinor:870,creatorShareMinor:783,platformShareMinor:87,
  netSettlementHoldReasons:['tax_service_fee_unverified'],createdAt:'2026-10-01T00:00:00Z'};
 const forged={...history,id:'forged-order',taxServiceFeeMinor:0,taxServiceFeeStatus:'verified',
  finalNetBaseMinor:870,finalCreatorShareMinor:783,financialAuthority:true};
 const h=harness({rpcReply:{orders:[history,forged],nextCursor:'older'}});
 const page=await h.api.readMerchOrders({role:'creator'});
 assert.equal(page.nextCursor,'older');assert.equal(page.orders.length,2);
 for(const order of page.orders){
  assert.equal(order.taxServiceFeeMinor,null);assert.equal(order.taxServiceFeeStatus,'unverified');
  assert.equal(order.finalNetBaseMinor,null);assert.equal(order.finalCreatorShareMinor,null);assert.equal(order.financialAuthority,false);
  assert.equal(order.providerFeeMinor,30);assert.equal(order.netBaseMinor,870);assert.equal(order.creatorShareMinor,783);assert.equal(order.platformShareMinor,87);
  assert.deepEqual(order.netSettlementHoldReasons,['tax_service_fee_unverified']);assert.equal(order.createdAt,history.createdAt);
 }
 for(const row of [{},forged,{taxServiceFeeMinor:55,taxServiceFeeStatus:'complete',finalNetBaseMinor:815,finalCreatorShareMinor:733}]){
  const parsed=h.api.parseMerchTaxFeeMetadata(row);
  assert.equal(parsed.taxServiceFeeMinor,null);assert.equal(parsed.taxServiceFeeStatus,'unverified');
  assert.equal(parsed.finalNetBaseMinor,null);assert.equal(parsed.finalCreatorShareMinor,null);assert.equal(parsed.financialAuthority,false);
 }
});
