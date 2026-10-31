import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

function load(file,{Deno={},modules={}}={}){
 const module={exports:{}};
 const require=name=>{if(name in modules)return modules[name];if(name.startsWith('jsr:'))return {};throw Error(name);};
 new Function('require','module','exports','Deno',ts.transpileModule(readFileSync('supabase/functions/'+file,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports,Deno);
 return module.exports;
}
test('signed successful purchase event supplies immutable real-role SQL timestamp, not arrival or object creation',{timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 let serial=0,handler;
 const env={STRIPE_MERCH_WEBHOOK_SECRET:'whsec_synthetic',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 const Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn;}};
 const admin={rpc:async(name,args)=>{
  assert.equal(name,'process_stripe_merch_webhook_lifecycle');
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
  try{return {data:await one('select public.process_stripe_merch_webhook_lifecycle($1,$2,$3,$4)',
   [args.p_event_id,args.p_event_type,args.p_raw_event_hash,args.p_facts]),error:null};}
  catch(error){return {data:null,error:{message:error.message}};}finally{await db.exec('reset role');}
 }};
 const stripe=load('_shared/stripe-connect.ts',{Deno,modules:{'npm:@supabase/supabase-js@2':{createClient:()=>admin},
  './exact-subject-authority.ts':load('_shared/exact-subject-authority.ts')}});
 load('stripe-merch-webhook/index.ts',{Deno,modules:{'../_shared/stripe-connect.ts':{...stripe,safeWriteAuditLog:async()=>{}},
  '../_shared/stripe-payment-settlement.ts':load('_shared/stripe-payment-settlement.ts')}});
 const make=async()=>{
  const n=++serial,id=`e7220000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  await db.query(`insert into public.merch_orders(id,buyer_id,provider,environment,order_status,fulfillment_status,payment_status,
   amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
   values($1,'e7000000-0000-4000-8000-000000000001','stripe_physical_goods','sandbox','pending','not_started','pending',
   1000,1000,'usd',$2,$3,clock_timestamp()-interval '2 days')`,[id,`cs_test_time_${n}`,`pi_time_${n}`]);
  return {id,pi:`pi_time_${n}`,cs:`cs_test_time_${n}`};
 };
 const stamp=async o=>one('select private.merch_verified_purchase_at($1)',[o.id]);
 const event=(o,created)=>({id:`evt_time_${++serial}`,type:'payment_intent.succeeded',created,livemode:false,data:{object:{
  id:o.pi,object:'payment_intent',created:1,status:'succeeded',livemode:false,amount:1000,amount_received:1000,currency:'usd',
  metadata:{chillywood_order_id:o.id,environment:'sandbox',rail:'physical_merch'}}}});
 const send=async(e,{wrongSignature=false}={})=>{
  const raw=JSON.stringify(e),now=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256',env.STRIPE_MERCH_WEBHOOK_SECRET).update(`${now}.${wrongSignature?raw+' ':raw}`).digest('hex');
  const response=await handler(new Request('https://fixture.test',{method:'POST',body:raw,headers:{'stripe-signature':`t=${now},v1=${signature}`}}));
  return {status:response.status,body:await response.json()};
 };
 try{
  const now=Math.floor(new Date(await one('select clock_timestamp()')).getTime()/1000),paid=now-86400;
  const o=await make(),e=event(o,paid);
  assert.equal((await send(e,{wrongSignature:true})).status,400);assert.equal(await stamp(o),null);
  assert.equal((await send(e)).body.reason,'payment_confirmed');assert.equal(new Date(await stamp(o)).getTime(),paid*1000);
  const arrival=await one('select paid_at from public.merch_orders where id=$1',[o.id]);assert.ok(new Date(arrival).getTime()>paid*1000);
  assert.equal((await send(e)).body.status,'duplicate');assert.equal(new Date(await stamp(o)).getTime(),paid*1000);
  const conflict=event(o,paid+1);assert.equal((await send(conflict)).status,500);assert.equal(new Date(await stamp(o)).getTime(),paid*1000);
  assert.equal(await one('select count(*)::int from public.stripe_merch_events where stripe_event_id=$1',[conflict.id]),0,'conflict rolls back receipt');
  const refund={...event(o,now),type:'charge.refunded',data:{object:{id:'ch_time',object:'charge',livemode:false,
   payment_intent:o.pi,amount:1000,amount_refunded:1000,refunded:true,currency:'usd',metadata:{chillywood_order_id:o.id}}}};
  assert.equal((await send(refund)).status,200);assert.equal(new Date(await stamp(o)).getTime(),paid*1000);
  assert.equal((await send(event(o,now))).body.reason,'terminal_removal_preserved');assert.equal(new Date(await stamp(o)).getTime(),paid*1000);
  for(const invalid of [undefined,null,'123',1.5,-1]){const x=await make();assert.equal((await send(event(x,invalid))).status,200);assert.equal(await stamp(x),null);}
  for(const invalid of [now+86400,1]){const x=await make();assert.equal((await send(event(x,invalid))).status,500);assert.equal(await stamp(x),null);}
  const bad=await make();const wrong=event(bad,paid);wrong.data.object.amount_received=500;
  assert.equal((await send(wrong)).body.status,'ignored');assert.equal(await stamp(bad),null);
  const checkout=await make();const ce={...event(checkout,paid),type:'checkout.session.completed',data:{object:{id:checkout.cs,
   object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',payment_intent:checkout.pi,
   amount_total:1000,currency:'usd',client_reference_id:checkout.id,metadata:{chillywood_order_id:checkout.id}}}};
  assert.equal((await send(ce)).body.reason,'payment_confirmed');assert.equal(await stamp(checkout),null);
  assert.equal((await send(event(checkout,paid))).body.reason,'payment_confirmed');assert.equal(new Date(await stamp(checkout)).getTime(),paid*1000);
  const delayed=await make();await db.query('update public.merch_orders set stripe_payment_intent_id=null where id=$1',[delayed.id]);
  const early=event(delayed,paid);assert.equal((await send(early)).body.retryable,true);assert.equal(await stamp(delayed),null);
  const binding={...event(delayed,paid-1),type:'checkout.session.completed',data:{object:{id:delayed.cs,
   object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'unpaid',payment_intent:delayed.pi,
   amount_total:1000,currency:'usd',client_reference_id:delayed.id,metadata:{chillywood_order_id:delayed.id}}}};
  assert.equal((await send(binding)).body.reason,'payment_pending');assert.equal(await stamp(delayed),null);
  assert.equal((await send(early)).body.reason,'payment_confirmed');assert.equal(new Date(await stamp(delayed)).getTime(),paid*1000);
  const original=await one("select pg_get_functiondef('public.process_stripe_merch_before_destination(text,text,text,jsonb)'::regprocedure)");
  await db.exec('begin');await db.exec(original.replace("succeeded:=to_timestamp((p_facts->>'event_created_seconds')::bigint);","succeeded:=clock_timestamp();"));
  const mutant=await make();await send(event(mutant,paid));
  const mutantTime=new Date(await stamp(mutant)).getTime();
  assert.throws(()=>assert.equal(mutantTime,paid*1000),'arrival-time substitution is detected');
  await db.exec('rollback');
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   await assert.rejects(one('select private.merch_verified_purchase_at($1)',[o.id]),/permission denied/);
   await assert.rejects(db.exec('update private.merch_purchase_time_evidence set succeeded_at=clock_timestamp()'),/permission denied/);
   await db.exec('reset role');
  }
  await assert.rejects(db.exec('update private.merch_purchase_time_evidence set succeeded_at=clock_timestamp()'),/immutable/);
  await assert.rejects(db.exec('delete from private.merch_purchase_time_evidence'),/immutable/);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
 }finally{await db.close();}
});

test('pre-policy orders remain historical after migration and do not acquire purchase-time authority',{timeout:180000},async()=>{
 // Address evidence depends on tracking: defer it too, then replay every successor in order.
 const names=['20261030200156_physical_merch_return_window.sql','20261030201916_merch_verified_purchase_time.sql',
  '20261030202009_merch_declared_tracking_return_terms.sql','20261030202330_merch_automatic_tracking.sql',
  '20261030210200_merch_private_fulfillment_address.sql','20261030212744_merch_return_cases.sql',
  '20261031011531_merch_provider_dispute_observations.sql','20261031011906_merch_return_buyer_replies.sql',
  '20261031012501_merch_return_case_queues.sql','20261031012502_merch_reconciliation_driver.sql'];
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:names});
 try{
  const id='e7330000-0000-4000-8000-000000000001';
  await db.exec(`insert into public.merch_orders(id,buyer_id,provider,environment,order_status,fulfillment_status,payment_status,
   amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values('${id}','e7000000-0000-4000-8000-000000000001','stripe_physical_goods','sandbox','pending','not_started','pending',
   1000,1000,'usd','cs_test_historical','pi_historical')`);
  for(const name of names)await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
  await db.query('select public.process_stripe_merch_webhook_lifecycle($1,$2,$3,$4)',[
   'evt_historical','payment_intent.succeeded','a'.repeat(64),{event_livemode:false,object_livemode:false,
    event_created_seconds:Math.floor(Date.now()/1000),object_id:'pi_historical',payment_intent_id:'pi_historical',
    object_type:'payment_intent',status:'succeeded',amount_minor:1000,amount_received_minor:1000,currency:'usd',metadata_order_id:id}]);
  await db.exec('reset role');
  const order=(await db.query('select return_policy_version,fulfillment_address_policy_version,paid_at from public.merch_orders where id=$1',[id])).rows[0];
  assert.equal(order.return_policy_version,null);assert.ok(order.paid_at);
  assert.equal(order.fulfillment_address_policy_version,null);
  assert.equal((await db.query('select return_case_protocol from public.merch_orders where id=$1',[id])).rows[0].return_case_protocol,null);
  assert.equal((await db.query('select private.merch_verified_purchase_at($1) as stamp',[id])).rows[0].stamp,null);
  assert.equal((await db.query('select count(*)::int as count from private.merch_purchase_time_evidence')).rows[0].count,0);
 }finally{await db.close();}
});
