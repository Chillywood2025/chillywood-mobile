import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
const shared={exports:{}};
vm.runInNewContext(compile('supabase/functions/_shared/stripe-payment-settlement.ts'),shared);
function harness({signature=true,rpc}={}) {
  let handler; const calls=[],audits=[];
  const admin={rpc:async(name,args)=>{calls.push({name,args});return rpc ? rpc(name,args) :
    {data:{status:'processed',reason:'payment_confirmed',eventStored:true,orderUpdated:true,retryable:false,orderId:order},error:null};},
    from:()=>{throw Error('Non-atomic table access is forbidden');}};
  const context={exports:{},TextEncoder,crypto:webcrypto,Deno:{serve:fn=>{handler=fn;}},
    require:specifier=>{
      if(specifier.startsWith('jsr:'))return {};
      if(specifier.endsWith('/stripe-payment-settlement.ts'))return shared.exports;
      if(specifier.endsWith('/stripe-connect.ts'))return {
        createAdminClient:()=>({configured:true,client:admin}),
        jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status}),
        notConfiguredPayload:(reason,message,rest)=>({reason,message,...rest}),
        optionsResponse:()=>new Response(null,{status:204}),
        parseStripeEvent:JSON.parse,readOptionalEnv:()=> 'whsec_synthetic',
        readStripeWebhookSecret:()=>({configured:true,secret:'whsec_synthetic'}),
        safeWriteAuditLog:async(_client,value)=>{audits.push(value);},
        sanitizeErrorMessage:error=>String(error.message),toText:value=>String(value??'').trim(),
        verifyStripeWebhookSignature:async()=>signature,
      };
      throw Error(`Unexpected module ${specifier}`);
    }};
  vm.runInNewContext(compile('supabase/functions/stripe-merch-webhook/index.ts'),context);
  return {calls,audits,send:async event=>{
    const result=await handler(new Request('https://fixture.invalid/webhook',{method:'POST',body:JSON.stringify(event)}));
    return {status:result.status,body:await result.json()};
  }};
}
const order='ee000000-0000-4000-8000-000000000001';
const buyer='ee000000-0000-4000-8000-000000000002';
const checkout=(type='checkout.session.completed',patch={})=>({id:'evt_merch_paid',type,livemode:false,data:{object:{
  id:'cs_test_merch',object:'checkout.session',mode:'payment',status:'complete',payment_status:'paid',
  livemode:false,payment_intent:'pi_merch',amount_total:1000,currency:'usd',client_reference_id:order,
  metadata:{chillywood_order_id:order,buyer_user_id:buyer,environment:'sandbox',rail:'physical_merch'},...patch}}});
const intent=(patch={})=>({id:'evt_merch_pi',type:'payment_intent.succeeded',livemode:false,data:{object:{
  id:'pi_merch',object:'payment_intent',status:'succeeded',livemode:false,amount:1000,amount_received:1000,
  currency:'usd',metadata:{chillywood_order_id:order,environment:'sandbox',rail:'physical_merch'},...patch}}});

test('paid Checkout forwards exact facts to one atomic RPC without provider or direct table writes',async()=>{
  const h=harness();const out=await h.send(checkout());
  assert.equal(out.status,200);assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].name,'process_stripe_merch_webhook_lifecycle');
  const {p_facts:f,p_raw_event_hash:hash}=h.calls[0].args;
  assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(f.payment_status,'paid');assert.equal(f.amount_minor,1000);
  assert.equal(f.object_id,'cs_test_merch');assert.equal(f.payment_intent_id,'pi_merch');assert.equal(f.metadata_buyer_id,buyer);
  assert.equal(f.event_livemode,false);assert.equal(f.object_livemode,false);assert.equal(out.body.payoutCreated,false);
  assert.equal(out.body.digitalAccessGrantCreated,false);assert.equal(out.body.liveMoneyAction,false);
});
test('unknown or no-payment-required Checkout status cannot reach credit projection',async()=>{
  for(const payment_status of [undefined,null,'unknown','no_payment_required','PAID']){
    const h=harness();const out=await h.send(checkout(undefined,{payment_status}));
    assert.equal(out.body.status,'ignored');assert.equal(h.calls.length,0);
  }
});
test('unpaid completion is pending evidence, while delayed success requires paid and delayed failure requires unpaid',async()=>{
  const h=harness({rpc:async()=>({data:{status:'processed',reason:'payment_pending',eventStored:true,orderUpdated:false,retryable:false},error:null})});
  assert.equal((await h.send(checkout(undefined,{payment_status:'unpaid'}))).body.orderUpdated,false);
  assert.equal(h.calls[0].args.p_facts.payment_status,'unpaid');
  for(const [type,status,accepted] of [
    ['checkout.session.async_payment_succeeded','paid',true],['checkout.session.async_payment_succeeded','unpaid',false],
    ['checkout.session.async_payment_failed','unpaid',true],['checkout.session.async_payment_failed','paid',false],
  ]){const probe=harness();await probe.send(checkout(type,{payment_status:status}));assert.equal(probe.calls.length,accepted?1:0);}
});
test('PaymentIntent success independently requires succeeded and the full actual received amount',async()=>{
  const h=harness();await h.send(intent());assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].args.p_facts.amount_received_minor,1000);
  for(const patch of [{amount_received:undefined},{amount_received:0},{amount_received:500},{amount_received:1001},{status:'processing'}]){
    const probe=harness();assert.equal((await probe.send(intent(patch))).body.status,'ignored');assert.equal(probe.calls.length,0);
  }
});
test('explicit envelope/object sandbox authority and valid signature are required before RPC',async()=>{
  const bad=[checkout(undefined,{livemode:true}),checkout(undefined,{livemode:undefined}),
    {...checkout(),livemode:true},{...checkout(),livemode:undefined},{...checkout(),account:'acct_other'}];
  for(const event of bad){const h=harness();assert.equal((await h.send(event)).body.status,'ignored');assert.equal(h.calls.length,0);
    assert.equal(h.audits[0].metadata.failure_reason,'test_environment_required');}
  const h=harness({signature:false});assert.equal((await h.send(checkout())).status,400);assert.equal(h.calls.length,0);
  assert.equal(h.audits[0].metadata.failure_reason,'signature_verification_failed');
});
test('refund forwards cumulative amount without changing charged amount and rejects malformed cumulative evidence',async()=>{
  const refund=()=>({id:'evt_merch_refund',type:'charge.refunded',livemode:false,data:{object:{
    id:'ch_merch',object:'charge',payment_intent:'pi_merch',amount:1000,amount_refunded:250,
    refunded:false,currency:'usd',livemode:false,metadata:{chillywood_order_id:order}}}});
  const h=harness();await h.send(refund());assert.equal(h.calls[0].args.p_facts.refunded_amount_minor,250);
  assert.equal(h.calls[0].args.p_facts.amount_minor,1000);
  for(const patch of [{amount_refunded:1001},{amount_refunded:1.5},{amount_refunded:0},{refunded:true}]){
    const event=refund();Object.assign(event.data.object,patch);const probe=harness();await probe.send(event);assert.equal(probe.calls.length,0);
  }
});
test('atomic failure and unknown response return non-2xx; replay uses the same hash and reaches the RPC again',async()=>{
  let attempt=0;const h=harness({rpc:async()=>++attempt===1?{data:null,error:{message:'modeled rollback'}}:
    attempt===2?{data:null,error:null}:{data:{status:'duplicate',eventStored:false,orderUpdated:false,retryable:false},error:null}});
  assert.equal((await h.send(checkout())).status,500);assert.equal((await h.send(checkout())).status,500);
  assert.equal((await h.send(checkout())).body.status,'duplicate');assert.equal(h.calls.length,3);
  assert.equal(new Set(h.calls.map(c=>c.args.p_raw_event_hash)).size,1);
});
test('missing stored payment identity remains retryable rather than acknowledging unfinished work',async()=>{
  const h=harness({rpc:async()=>({data:{status:'pending',reason:'payment_identity_pending',eventStored:true,orderUpdated:false,retryable:true},error:null})});
  const out=await h.send(intent());assert.equal(out.status,409);assert.equal(out.body.webhookProcessed,false);
  assert.equal(out.body.orderUpdated,false);assert.equal(out.body.retryable,true);
});
test('legitimate settlement does not query sale eligibility or a current viewer account',async()=>{
  const h=harness();await h.send(intent());
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_facts.metadata_buyer_id,null);
  assert.equal(h.calls[0].args.p_facts.payment_intent_id,'pi_merch');
  assert.equal(h.audits.length,1);
});
