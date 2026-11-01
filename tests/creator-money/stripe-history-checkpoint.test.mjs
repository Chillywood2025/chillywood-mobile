import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';
import {context as taxContext,fixture as taxFixture} from './refund-tax-evidence-edge.test.mjs';
const {createStripeHistoryCheckpoint,projectStripeHistoryFacts}=loadPureTypeScriptModule('supabase/functions/_shared/stripe-history-checkpoint.ts');
const {createMerchObservationBudget}=loadPureTypeScriptModule('supabase/functions/_shared/merch-observation-budget.ts');
const init={method:'GET',redirect:'error',headers:{Authorization:'Bearer sk_test_synthetic','Stripe-Version':'2026-10-28.endive'}};

function largeFixture(count=100){
 const f=fixture();f.data['/charges/ch_merch'].amount_refunded=count;
 for(let i=0;i<count;i++){
  f.data['/refunds?charge=ch_merch&limit=100'].data.push({id:`re_${i}`,charge:'ch_merch',payment_intent:'pi_merch',currency:'usd',status:'succeeded',amount:1,balance_transaction:`txn_refund_${i}`});
  f.data[`/balance_transactions/txn_refund_${i}`]={id:`txn_refund_${i}`,object:'balance_transaction',source:`re_${i}`,type:'refund',amount:-1,fee:0,net:-1,currency:'usd',status:'available'};
 }
 return f;
}
async function step(f,saved={}){
 const before=f.calls.length,budget=createMerchObservationBudget(f.transport),history=createStripeHistoryCheckpoint(saved,budget.transport,budget.remaining);
 let facts=null,complete=false,error=null;
 try{
  facts=await observe(order,'sk_test_synthetic','acct_fixture',history.transport,true);
  complete=await history.finish(init);
 }catch(e){error=e;}
 finally{budget.close();}
 assert.ok(f.calls.length-before<=64,'one invocation never exceeds64 GETs');
 return {facts,complete,error,checkpoint:history.checkpoint(),reads:f.calls.length-before};
}
test('expanded100-refund history finishes only after a fresh verification pass and final balance-page rereads',async()=>{
 const f=largeFixture();let saved={},result,rounds=0;
 do{
  result=await step(f,saved);saved=result.checkpoint;rounds++;
  if(result.error)assert.match(result.error.message,/budget_exhausted/);
  assert.ok(rounds<10,'bounded source eventually progresses rather than restarting at64');
 }while(!result.complete);
 assert.ok(rounds>=2);assert.equal(result.facts.refunds.length,100);assert.equal(result.facts.refunded_minor,100);
 assert.equal(result.facts.tax_reversal_minor,null,'missing tax association stays unknown across resumes');
 assert.equal(result.facts.financial_authority,false);
 assert.equal(f.calls.filter(p=>p==='/balance_transactions/txn_refund_99').length,0);
 assert.ok(f.calls.filter(p=>p.includes('expand%5B%5D=data.balance_transaction')).length>=3);
 assert.ok(f.calls.filter(p=>p==='/charges/ch_merch').length>=3);
});
test('source, history and final frontier changes invalidate generations instead of mixing evidence',async()=>{
 const f=largeFixture(80);const second=await step(f);assert.equal(second.complete,false);assert.equal(second.checkpoint.phase,'verify');
 // A changed first balance is discovered by the new full verification pass.
 f.data['/balance_transactions/txn_refund_0'].fee=1;f.data['/balance_transactions/txn_refund_0'].net=-2;
 const changed=await step(f,second.checkpoint);assert.match(changed.error.message,/history_snapshot_changed/);assert.equal(changed.checkpoint.entries.length,0);
 const small=fixture();const collected=await step(small);assert.equal(collected.complete,false);
 const original=small.transport;let chargeReads=0;
 small.transport=async(url,opts)=>{
  if(url.endsWith('/charges/ch_merch')&&++chargeReads===3)small.data['/charges/ch_merch'].disputed=true;
  return original(url,opts);
 };
 const frontierChanged=await step(small,collected.checkpoint);assert.match(frontierChanged.error.message,/history_snapshot_changed/);assert.equal(frontierChanged.complete,false);
});
test('expanded final refund reread catches balance mutation after its verification page',async()=>{
 const f=largeFixture(),first=await step(f),original=f.transport;let expandedReads=0;
 f.transport=async(url,opts)=>{
  if(url.includes('expand%5B%5D=data.balance_transaction')&&++expandedReads===2){
   f.data['/balance_transactions/txn_refund_0'].fee=1;f.data['/balance_transactions/txn_refund_0'].net=-2;
  }
  return original(url,opts);
 };
 const result=await step(f,first.checkpoint);
 assert.match(result.error.message,/history_snapshot_changed/);assert.equal(result.complete,false);assert.equal(result.checkpoint.entries.length,0);
});
test('checkpoint projection drops raw private customer/payment fields',()=>{
 const result=projectStripeHistoryFacts('/v1/charges/ch_a',{id:'ch_a',object:'charge',billing_details:{name:'private'},payment_method:'pm_private',description:'private',amount:1});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{id:'ch_a',object:'charge',amount:1});
 assert.throws(()=>projectStripeHistoryFacts('/v1/customers/cus_private',{object:'customer'}),/path_not_allowed/);
});

test('full schema checkpoints bind source/account/mode/lease and atomically preserve the existing held-cost recorder', {timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try{
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,
   amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_merch','pi_merch')`,[order.id,order.buyer_id]);
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);`);
  const begin=()=>one(`select public.begin_stripe_cost_history('merch',$1,'acct_fixture')`,[order.id]);
  let lease=await begin();assert.equal((await begin()).busy,true);
  await db.exec(`insert into private.merch_cost_refresh_jobs(order_id,lease,lease_until,consecutive_failures)
   values('${order.id}','e7100000-0000-4000-8000-000000000099',clock_timestamp()+interval '5 minutes',3)`);
  const partial=await step(fixture());
  const save=(facts=null)=>one(`select public.save_stripe_cost_history('merch',$1,$2,$3,$4::jsonb,$5::jsonb)`,[order.id,lease.generation,lease.lease,JSON.stringify(partial.checkpoint),facts&&JSON.stringify(facts)]);
  assert.equal((await save()).status,'history_pending');
  assert.equal(await one('select count(*)::int from private.merch_provider_cost_observations'),0);
  const progress=await one(`select public.continue_merch_cost_history_refresh($1,'e7100000-0000-4000-8000-000000000099')`,[order.id]);
  assert.equal(progress.historyProgress,true);
  const progressRow=(await db.query(`select consecutive_failures,last_success_at,next_attempt_at between clock_timestamp()+interval '14 minutes' and clock_timestamp()+interval '16 minutes' timely from private.merch_cost_refresh_jobs where order_id=$1`,[order.id])).rows[0];
  assert.equal(progressRow.consecutive_failures,3);assert.equal(progressRow.last_success_at,null);assert.equal(progressRow.timely,true);
  const old=lease;lease=await begin();assert.equal(lease.generation,old.generation);assert.notEqual(lease.lease,old.lease);
  await assert.rejects(one(`select public.save_stripe_cost_history('merch',$1,$2,$3,'{}',null)`,[order.id,old.generation,old.lease]),/stale_lease/);
  await db.exec(`begin;update public.merch_orders set stripe_payment_intent_id='pi_changed' where id='${order.id}'`);
  await assert.rejects(save(),/source_changed/);await db.exec('rollback');
  const verified=await step(fixture(),lease.checkpoint);assert.equal(verified.complete,true);
  // Model a long verification pass: completion must never launder its age.
  verified.checkpoint.verificationStartedAt-=20*60*1000;
  for(const entry of verified.checkpoint.entries)entry.observedAt-=20*60*1000;
  const facts={...verified.facts,history_generation:lease.generation,history_revalidated:true};
  const completed=()=>one(`select public.save_stripe_cost_history('merch',$1,$2,$3,$4::jsonb,$5::jsonb)`,[order.id,lease.generation,lease.lease,JSON.stringify(verified.checkpoint),JSON.stringify(facts)]);
  const result=await completed();assert.equal(result.financialAuthority,false);assert.equal(result.status,'held');assert.equal((await completed()).observationId,result.observationId);
  assert.equal(result.historyFreshForMoney,false);assert.equal(result.historyHoldReason,'history_facts_stale_collect_fresh_provider_evidence_before_release');
  await db.exec(`update private.merch_cost_refresh_jobs set lease='e7100000-0000-4000-8000-000000000099',lease_until=clock_timestamp()+interval '5 minutes' where order_id='${order.id}'`);
  await one(`select public.complete_merch_cost_refresh($1,'e7100000-0000-4000-8000-000000000099',true)`,[order.id]);
  assert.equal(await one("select last_success_at<clock_timestamp()-interval '15 minutes' from private.merch_cost_refresh_jobs"),true,'owner freshness cannot be reset by history completion');
  assert.equal(await one('select count(*)::int from private.merch_provider_cost_observations'),1);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  assert.equal(await one('select count(*)::int from private.stripe_cost_history_receipts'),1);
  assert.equal(await one("select verified_at<clock_timestamp()-interval '15 minutes' from private.commerce_cost_verification_reads order by id desc limit 1"),true);
  assert.equal(await one("select oldest_verified_at<clock_timestamp()-interval '15 minutes' from private.stripe_cost_history_receipts"),true);
  assert.equal(await one("select exists(select 1 from private.commerce_cost_verification_reads where verified_at>=clock_timestamp()-interval '15 minutes')"),false,'completed stale history cannot qualify financial freshness');
  await assert.rejects(db.exec('update private.stripe_cost_history_receipts set entry_count=0'),/history_receipt_immutable/);
  await assert.rejects(db.exec('delete from private.stripe_cost_history_receipts'),/history_receipt_immutable/);
  for(const role of ['anon','authenticated'])assert.equal(await one(`select has_function_privilege($1,'public.save_stripe_cost_history(text,uuid,uuid,uuid,jsonb,jsonb)','execute')`,[role]),false);
 }finally{await db.close();}
});

// Inject only this module's timer functions, never mutate AbortSignal or global
// timers used by other tests. The real deadline branch runs with a short clock.
function deadlineHistory(){
 const active=new Set();let fired=0,cleared=0;
 const schedule=(callback,milliseconds)=>{
  assert.equal(milliseconds,15000);
  const timer=setTimeout(()=>{active.delete(timer);fired++;callback();},20);active.add(timer);return timer;
 };
 const cancel=timer=>{clearTimeout(timer);active.delete(timer);cleared++;};
 const module={exports:{}};
 const compiled=ts.transpileModule(readFileSync('supabase/functions/_shared/stripe-history-checkpoint.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
 }).outputText;
 new Function('module','exports','setTimeout','clearTimeout',compiled)(module,module.exports,schedule,cancel);
 return {create:module.exports.createStripeHistoryCheckpoint,active,counts:()=>({fired,cleared})};
}
test('stalled provider headers and bodies cannot escape the owned history deadline',async()=>{
 for(const stall of ['headers','body']){
  const clock=deadlineHistory();let signal,response,canceled=0;
  const transport=async(_url,options)=>{
   signal=options.signal;
   if(stall==='headers')return new Promise(()=>{});
   response=new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>{canceled++;return new Promise(()=>{});}}));
   return response;
  };
  const history=clock.create({},transport,()=>64);
  await assert.rejects(history.transport('https://api.stripe.com/v1/account',init),/history_body_deadline/);
  assert.equal(signal.aborted,true);assert.equal(history.checkpoint().entries.length,0);
  assert.deepEqual(clock.counts(),{fired:1,cleared:1});assert.equal(clock.active.size,0);
  if(stall==='body'){assert.equal(canceled,1);assert.equal(response.body.locked,false,'unsettled cancel cannot retain the reader lock');}
 }
});
test('late transport response after the deadline is canceled and cannot advance history',async()=>{
 const clock=deadlineHistory();let resolve,canceled=0;
 const history=clock.create({},()=>new Promise(r=>{resolve=r;}),()=>64);
 await assert.rejects(history.transport('https://api.stripe.com/v1/account',init),/history_body_deadline/);
 resolve(new Response(new ReadableStream({cancel(){canceled++;return new Promise(()=>{});}})));
 await new Promise(r=>setImmediate(r));
 assert.equal(canceled,1);assert.equal(history.checkpoint().entries.length,0);assert.equal(clock.active.size,0);
});
test('history deadline respects external abort without dispatching already-aborted work',async()=>{
 const clock=deadlineHistory(),controller=new AbortController();controller.abort();let calls=0;
 const stopped=clock.create({},async()=>{calls++;return Response.json({id:'acct_never',object:'account'});},()=>64);
 await assert.rejects(stopped.transport('https://api.stripe.com/v1/account',{...init,signal:controller.signal}),/history_body_deadline/);
 assert.equal(calls,0);assert.deepEqual(clock.counts(),{fired:0,cleared:0});assert.equal(clock.active.size,0);
 const queued=new AbortController();queueMicrotask(()=>queued.abort());
 await assert.rejects(stopped.transport('https://api.stripe.com/v1/account',{...init,signal:queued.signal}),/history_body_deadline/);
 assert.equal(calls,0,'an abort queued ahead of dispatch must suppress the transport too');
 assert.equal(clock.active.size,0);
 const during=new AbortController();let response;
 const active=clock.create({},async()=>{
  response=new Response(new ReadableStream({pull(){during.abort();return new Promise(()=>{});},cancel(){return Promise.reject(Error('cancel_failed'));}},{highWaterMark:0}));
  return response;
 },()=>64);
 await assert.rejects(active.transport('https://api.stripe.com/v1/account',{...init,signal:during.signal}),/history_body_deadline/);
 assert.equal(active.checkpoint().entries.length,0);assert.equal(response.body.locked,false);assert.equal(clock.active.size,0);assert.equal(clock.counts().cleared,2);
});
test('history deadline timers are cleared on success, provider failure, missing association, and malformed bodies',async()=>{
 for(const kind of ['success','provider_error','missing','malformed','oversized']){
  const clock=deadlineHistory();let canceled=0;
  const response=kind==='success'?Response.json({id:'acct_ok',object:'account'}):kind==='provider_error'?new Response(new ReadableStream({cancel(){canceled++;return new Promise(()=>{});}}),{status:503})
   :kind==='missing'?new Response(new ReadableStream({cancel(){canceled++;return new Promise(()=>{});}}),{status:404})
   :new Response(kind==='malformed'?'{':new Uint8Array(2*1024*1024+1));
  const history=clock.create({},async()=>response,()=>64);
  const path=kind==='missing'?'/v1/tax/associations/find?payment_intent=pi_test':'/v1/account';
  const read=()=>history.transport(`https://api.stripe.com${path}`,init);
  if(kind==='malformed'||kind==='oversized')await assert.rejects(read());
  else assert.equal((await read()).status,kind==='provider_error'?503:kind==='missing'?404:200);
  assert.equal(clock.active.size,0);assert.deepEqual(clock.counts(),{fired:0,cleared:1});
  if(kind==='missing'||kind==='provider_error')assert.equal(canceled,1);
  if(kind==='malformed'||kind==='oversized')assert.equal(response.body.locked,false);
 }
});

test('checkpoint tax projection preserves exact authoritative rounded reversals without immutability assumptions',async()=>{
 const {observeStripeRefundTax}=loadPureTypeScriptModule('supabase/functions/_shared/stripe-refund-tax-evidence.ts');
 const f=taxFixture(),first=createStripeHistoryCheckpoint({},f.transport,()=>64);
 const initial=await observeStripeRefundTax(taxContext,'sk_test_synthetic',first.transport);
 assert.equal(await first.finish(init),false);
 const verify=createStripeHistoryCheckpoint(first.checkpoint(),f.transport,()=>64);
 const result=await observeStripeRefundTax(taxContext,'sk_test_synthetic',verify.transport);
 assert.equal(await verify.finish(init),true);assert.deepEqual(result,initial);
 assert.equal(result.tax_reversal_minor,50);assert.deepEqual(result.refunds.map(r=>r.tax_reversal_minor),[31,19]);
 const changed=createStripeHistoryCheckpoint(first.checkpoint(),f.transport,()=>64);
 f.data['/tax/transactions/tax_first/line_items?limit=100'].data[0].amount_tax=-30;
 await assert.rejects(observeStripeRefundTax(taxContext,'sk_test_synthetic',changed.transport),/history_snapshot_changed/);
});
