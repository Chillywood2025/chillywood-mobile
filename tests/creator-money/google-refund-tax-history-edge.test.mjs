import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGoogleRefundModule,googleRefundFixture,googleHistoryClient,googleVerificationCheckpoint} from '../helpers/google-refund-tax-history-fixture.mjs';

const {reconcileGoogleRefundTax}=loadGoogleRefundModule();
const {observeGoogleRefundTax}=loadGoogleRefundModule('google-refund-tax-reconciliation');
const {projectStripeHistoryFacts}=loadGoogleRefundModule('stripe-history-checkpoint');
const saves=h=>h.calls.filter(call=>call.name==='save_google_refund_tax_history');
const completed=h=>saves(h).filter(call=>call.args.p_facts);
async function invoke(f,h,reconcile=reconcileGoogleRefundTax){
  const before=f.calls.length;
  const result=await reconcile(h.client,f.context,'sk_test_synthetic','acct_platform',f.transport);
  assert.ok(f.calls.length-before<=64,'one worker invocation cannot spend more than 64 provider GETs');
  return result;
}
async function finish(f,h,reconcile=reconcileGoogleRefundTax){
  let rounds=0;
  while(!completed(h).length){
    assert.ok(rounds++<12,'finite stable history must eventually complete, not restart at the GET cap');
    await invoke(f,h,reconcile);
  }
  return rounds;
}

test('28-refund Google history exceeding 64 GETs resumes, verifies twice, and records only complete facts',async()=>{
  const baseline=googleRefundFixture();
  const expected=await observeGoogleRefundTax(baseline.context,'sk_test_synthetic','acct_platform',baseline.transport);
  assert.equal(baseline.calls.length,66,'regression fixture must exceed the worker GET ceiling');
  const f=googleRefundFixture(),h=googleHistoryClient();
  await invoke(f,h);
  assert.equal(completed(h).length,0);assert.ok(h.state.checkpoint.entries.length>0);
  const firstCursor=h.state.checkpoint.cursor;
  assert.equal(firstCursor,64);assert.equal(saves(h)[0].args.p_facts,null);
  const rounds=1+await finish(f,h);assert.ok(rounds>=3);
  const {p_facts:facts,p_checkpoint:checkpoint}=completed(h)[0].args;
  for(const [key,value] of Object.entries(expected))assert.deepEqual(facts[key],value);
  assert.equal(completed(h)[0].args.p_generation,h.generation);
  assert.equal(checkpoint.phase,'verify');assert.equal(checkpoint.cursor,checkpoint.entries.length);
  assert.ok(checkpoint.entries.length>64);assert.ok(checkpoint.verificationStartedAt>0);
  assert.equal(completed(h).length,1);
  for(const path of new Set(baseline.calls))assert.ok(f.calls.filter(p=>p===path).length>=2,`${path} needs independent verification`);
  for(const path of ['/account','/checkout/sessions/cs_test_sale','/payment_intents/pi_sale','/charges/ch_sale',
    '/refunds?charge=ch_sale&limit=100','/tax/associations/find?payment_intent=pi_sale']){
    assert.ok(f.calls.filter(p=>p===path).length>=3,`${path} needs a final mutable-frontier read`);
  }
});

for(const kind of ['checkout','refund','association','tax_reversal'])test(`Google history invalidates changed ${kind} instead of mixing saved facts`,async()=>{
  const f=googleRefundFixture(),h=googleHistoryClient();await invoke(f,h);
  // Finish collection so the next invocation independently verifies the saved snapshot.
  await invoke(f,h);assert.equal(h.state.checkpoint.phase,'verify');
  if(kind==='checkout')f.data['/checkout/sessions/cs_test_sale'].metadata.fan_user_id='different-buyer';
  if(kind==='refund')f.data['/refunds?charge=ch_sale&limit=100'].data[0].status='pending';
  if(kind==='association')f.data['/tax/associations/find?payment_intent=pi_sale'].id='taxa_changed';
  if(kind==='tax_reversal')f.data['/tax/transactions/tax_000/line_items?limit=100'].data[0].amount_tax=0;
  await invoke(f,h);
  assert.equal(completed(h).length,0);assert.equal(h.state.checkpoint.entries.length,0);
  assert.equal(h.state.checkpoint.phase,'collect');
});

test('final frontier mutation after independent verification prevents Google tax evidence',async()=>{
  const f=googleRefundFixture({count:1}),h=googleHistoryClient({checkpoint:await googleVerificationCheckpoint(f)});
  const transport=f.transport;let associationReads=0;
  f.transport=async(url,init)=>{
    if(url.includes('/tax/associations/find?')&&++associationReads===3)
      f.data['/tax/associations/find?payment_intent=pi_sale'].id='taxa_raced';
    return transport(url,init);
  };
  await invoke(f,h);assert.equal(associationReads,3);
  assert.equal(completed(h).length,0);assert.equal(h.state.checkpoint.entries.length,0);
});

for(const kind of ['404','pending_attempt'])test(`missing ${kind} stays pending but is fetched again rather than pinned indefinitely`,async()=>{
  const f=googleRefundFixture({count:1}),h=googleHistoryClient();
  const path='/tax/associations/find?payment_intent=pi_sale',ready=structuredClone(f.data[path]);
  f.data[path]=kind==='404'?new Response('{}',{status:404}):{...ready,tax_transaction_attempts:[{source:'pi_sale',status:'pending'}]};
  await invoke(f,h);assert.equal(completed(h).length,0);
  assert.equal(h.state.checkpoint.entries.length,0,'unknown provider association must not be immortal cached state');
  f.data[path]=ready;await finish(f,h);
  assert.ok(f.calls.filter(p=>p===path).length>=4);assert.equal(completed(h).length,1);
});

test('busy claims do not make provider calls or save a checkpoint',async()=>{
  const f=googleRefundFixture(),h=googleHistoryClient({busy:true});await invoke(f,h);
  assert.equal(f.calls.length,0);assert.equal(saves(h).length,0);
});

test('ineligible, failed, and mismatched claims cannot dispatch provider reads or persist facts',async()=>{
  for(const outcome of ['ineligible','error','wrong_transaction','wrong_feature']){
    const f=googleRefundFixture(),h=googleHistoryClient(),rpc=h.client.rpc;
    h.client.rpc=async(name,args)=>{
      const result=await rpc(name,args);
      assert.equal(name,'begin_google_refund_tax_history');
      if(outcome==='ineligible')return {error:null,data:{eligible:false,financialAuthority:false}};
      if(outcome==='error')return {error:{message:'synthetic-claim-failed'},data:null};
      result.data.context[outcome==='wrong_transaction'?'transaction_id':'feature']='unrelated';return result;
    };
    if(outcome==='ineligible')await invoke(f,h);else await assert.rejects(()=>invoke(f,h),/claim/);
    assert.equal(f.calls.length,0);assert.equal(saves(h).length,0);
  }
});

for(const [path,key,value] of [
  ['/account','id','acct_other'],['/checkout/sessions/cs_test_sale','livemode',true],
  ['/checkout/sessions/cs_test_sale','total_details',{amount_tax:91,amount_discount:1,amount_shipping:0}],
  ['/checkout/sessions/cs_test_sale','total_details',{amount_tax:91,amount_discount:0,amount_shipping:1}],
  ['/payment_intents/pi_sale','transfer_data',{destination:'acct_wrong'}],
])test(`checkpointed observer rejects ${path} ${key} mismatch`,async()=>{
  const f=googleRefundFixture({count:1}),h=googleHistoryClient();f.data[path][key]=value;
  await invoke(f,h);assert.equal(completed(h).length,0);
});

test('checkpoint projection preserves only required tip identity and zero discount/shipping checks',()=>{
  const f=googleRefundFixture({count:1}),checkout=f.data['/checkout/sessions/cs_test_sale'];
  const result=projectStripeHistoryFacts('/v1/checkout/sessions/cs_test_sale',{
    ...checkout,customer:'cus_private',customer_details:{email:'private@example.invalid'},
    metadata:{...checkout.metadata,unrelated_private_note:'do not retain'},
    total_details:{...checkout.total_details,breakdown:{private:'do not retain'}},
  });
  assert.deepEqual(result.metadata,checkout.metadata);assert.deepEqual(result.total_details,checkout.total_details);
  assert.equal(JSON.stringify(result).includes('private'),false);
});

test('omitted unused refund balance transactions survive checkpoint JSON roundtrips',async()=>{
  const f=googleRefundFixture({count:1}),h=googleHistoryClient();
  delete f.data['/refunds?charge=ch_sale&limit=100'].data[0].balance_transaction;
  const checkpoint=await googleVerificationCheckpoint(f);
  h.state.checkpoint=JSON.parse(JSON.stringify(checkpoint));
  await finish(f,h);assert.equal(completed(h).length,1);
});

function paidVideoHistoryFixture(){
 const base=googleRefundFixture(),context={...base.context,feature:'paid_video',recipient_account_id:null,platform_account_id:'acct_platform',
  video_id:'a7100000-0000-4000-8000-000000000005',price_id:'a7100000-0000-4000-8000-000000000006',price_revision:1,
  tax_policy_id:'a7100000-0000-4000-8000-000000000007'};
 const f=googleRefundFixture({context});
 const metadata={chillywoodFlow:'stripe_paid_video_sandbox',orderId:context.quote_id,buyerId:context.buyer_id,
  videoId:context.video_id,priceId:context.price_id,priceRevision:'1',commerce_tax_policy_id:context.tax_policy_id};
 f.data['/checkout/sessions/cs_test_sale'].metadata={...metadata};
 f.data['/payment_intents/pi_sale'].metadata={...metadata};
 return f;
}
test('paid-video tax history resumes through serialized checkpoints with exact session and intent identity',async()=>{
 const f=paidVideoHistoryFixture(),h=googleHistoryClient({context:f.context});
 await invoke(f,h);assert.equal(completed(h).length,0);assert.ok(h.state.checkpoint.entries.length>0);
 h.state.checkpoint=JSON.parse(JSON.stringify(h.state.checkpoint));
 await finish(f,h);assert.equal(completed(h).length,1);
 const facts=completed(h)[0].args.p_facts;assert.equal(facts.refunded_minor,280);assert.equal(facts.tax_reversal_minor,28);
 for(const path of ['/v1/checkout/sessions/cs_test_sale','/v1/payment_intents/pi_sale']){
  const projection=projectStripeHistoryFacts(path,{...f.data[path.slice(3)],metadata:{...f.data[path.slice(3)].metadata,private_note:'omit'}});
  assert.deepEqual(projection.metadata,f.data[path.slice(3)].metadata);assert.equal(JSON.stringify(projection).includes('private_note'),false);
 }
});
test('paid-video history rejects changed intent price identity and transferred charge after checkpoint',async()=>{
 for(const change of ['price','transfer']){
  const f=paidVideoHistoryFixture(),h=googleHistoryClient({context:f.context});await invoke(f,h);
  if(change==='price')f.data['/payment_intents/pi_sale'].metadata.priceRevision='2';
  else f.data['/charges/ch_sale'].transfer='tr_unexpected';
  for(let i=0;i<3;i++)await invoke(f,h);
  assert.equal(completed(h).length,0);
 }
});

test('failed durable saves reject without acknowledging completion or recording outside the lease',async()=>{
  for(const failure of [{error:{message:'synthetic-save-failed'},data:null},{error:null,data:false},
    {error:null,data:{status:'reported',financialAuthority:false}},{error:null,data:null}]){
    const f=googleRefundFixture({count:1}),saved=await googleVerificationCheckpoint(f);
    const failed=googleHistoryClient({checkpoint:saved,save:async()=>failure});
    await assert.rejects(()=>invoke(f,failed),/commit|save|pending|invalid/);
    assert.equal(saves(failed).length,1,'a failed/uncertain RPC must not trigger an unleased secondary record');
  }
});

// Keep the real budget implementation, but shorten only its private timers.
// Never patch global timers or AbortSignal used by other concurrently run tests.
test('late save after the owned deadline cannot be acknowledged and can be retried safely',async()=>{
  const timers=new Set(),durations=[];
  const schedule=(fn,ms)=>{assert.equal(ms,5000);const timer=setTimeout(()=>{timers.delete(timer);fn();},20);timers.add(timer);return timer;};
  const cancel=timer=>{clearTimeout(timer);timers.delete(timer);};
  const {createMerchObservationBudget}=loadGoogleRefundModule('merch-observation-budget');
  const {reconcileGoogleRefundTax:bounded}=loadGoogleRefundModule('google-refund-tax-history',{
    'merch-observation-budget':{createMerchObservationBudget:(transport,ms)=>{durations.push(ms);return createMerchObservationBudget(transport,ms);}},
  },{'google-refund-tax-history':{setTimeout:schedule,clearTimeout:cancel}});
  const f=googleRefundFixture({count:1}),checkpoint=await googleVerificationCheckpoint(f);
  let resolve;
  const late=googleHistoryClient({checkpoint,save:()=>new Promise(r=>{resolve=r;})});
  await assert.rejects(()=>invoke(f,late,bounded),/deadline|commit|pending/);
  assert.ok(durations.includes(65000),'helper reserves a bounded 65-second observation window');
  assert.equal(saves(late).length,1);assert.equal(timers.size,0);
  resolve({error:null,data:{status:'history_complete',evidenceRecorded:true,financialAuthority:false}});
  await new Promise(r=>setImmediate(r));assert.equal(saves(late).length,1,'late result cannot cause another durable mutation');
  const retry=googleHistoryClient({checkpoint});await finish(f,retry);
  assert.equal(completed(retry).length,1);
});

test('aggregate abort from signal-aware transport preserves parsed progress and resumes instead of restarting',async()=>{
  const timers=new Set();
  const schedule=(fn,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms>=60000?30:ms);timers.add(timer);return timer;};
  const cancel=timer=>{clearTimeout(timer);timers.delete(timer);};
  const {reconcileGoogleRefundTax:bounded}=loadGoogleRefundModule('google-refund-tax-history',{},
    {'merch-observation-budget':{setTimeout:schedule,clearTimeout:cancel}});
  const f=googleRefundFixture({count:1}),h=googleHistoryClient(),transport=f.transport;
  let aborted=false;
  f.transport=(url,init)=>{
    if(!url.endsWith('/payment_intents/pi_sale'))return transport(url,init);
    return new Promise((_resolve,reject)=>{
      init.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Synthetic canceled fetch','AbortError'));},{once:true});
    });
  };
  await invoke(f,h,bounded);
  assert.equal(aborted,true);assert.equal(completed(h).length,0);
  assert.equal(h.state.checkpoint.cursor,2,'successfully parsed account and Checkout reads survive the aggregate abort');
  assert.equal(h.state.checkpoint.entries.length,2);assert.equal(timers.size,0);
  f.transport=transport;await finish(f,h);assert.equal(completed(h).length,1);
});
