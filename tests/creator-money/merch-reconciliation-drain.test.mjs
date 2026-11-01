import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';

const compile=file=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function driver(rpc,{cost=async()=>true,clock=Date,tracking=false}={}){
 let handler;const calls=[];
 const env={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic_service',MERCH_TRACKING_WORKER_SECRET:tracking?'synthetic_worker':undefined};
 vm.runInNewContext(compile('supabase/functions/merch-reconciliation-driver/index.ts'),{
  exports:{},Date:clock,setTimeout,clearTimeout,AbortSignal,TextDecoder,Deno:{serve:f=>handler=f},
  fetch:async(url,options)=>{
   const body=JSON.parse(options.body);calls.push({url,body});
   if(url.endsWith('/merch-tracking-reconcile'))return Response.json({claimed:0,completed:0,financialAuthority:false});
   assert.ok(url.endsWith('/stripe-merch-cost-reconcile'));assert.equal(options.headers.Authorization,'Bearer synthetic_service');
   return await cost(body.order_id)?Response.json({status:'held',observationId:randomUUID(),payoutCreated:false,financialAuthority:false}):Response.json({error:'provider_incomplete',financialAuthority:false},{status:409});
  },require:name=>{
   if(name.startsWith('jsr:'))return{};
   if(name.endsWith('stripe-connect.ts'))return{readOptionalEnv:k=>env[k],createAdminClient:()=>({configured:true,client:{rpc}}),jsonResponse:(status,body)=>Response.json(body,{status})};
   throw Error(name);
  },
 });
 return{calls,send:async()=>{const r=await handler(new Request('https://synthetic.test',{method:'POST',headers:{Authorization:'Bearer synthetic_service'},body:'{}'}));return{status:r.status,body:await r.json()};}};
}

test('actual driver drains at most30, preserves3-wide concurrency and stops before insufficient worker time',async()=>{
 for(const slow of [false,true]){
  let now=0,admitted=0,inflight=0,maxInflight=0;const runId=randomUUID();
  const rpc=async(name)=>{
   if(name==='complete_merch_cost_refresh')return{data:{stale:false}};
   admitted+=3;return{data:{claimed:true,runId,jobs:Array.from({length:3},()=>({order_id:randomUUID(),lease:randomUUID()})),health:{eligible:180,capacityGuaranteed:false}}};
  };
  const h=driver(rpc,{clock:{now:()=>now},tracking:true,cost:async()=>{
   inflight++;maxInflight=Math.max(maxInflight,inflight);await Promise.resolve();if(slow)now+=20000;inflight--;return true;
  }});
  const r=await h.send();assert.equal(r.status,200);assert.equal(r.body.orders,slow?3:30);
  assert.equal(r.body.completed,r.body.orders);assert.equal(admitted,r.body.orders);assert.equal(maxInflight,3);
  assert.equal(r.body.budget.maxStripeGets,1920);assert.equal(r.body.budget.capacityGuaranteed,false);
  assert.equal(h.calls.filter(c=>c.url.endsWith('/merch-tracking-reconcile')).length,1);
 }
});

test('provider budget is aggregate, GET-only, deadline bounded and closes against late work',async()=>{
 const {createMerchObservationBudget}=loadPureTypeScriptModule('supabase/functions/_shared/merch-observation-budget.ts');
 let reads=0;const b=createMerchObservationBudget(async()=>{reads++;return Response.json({});});
 try{
  await assert.rejects(()=>b.transport('https://api.stripe.com/v1/account',{method:'POST'}),/get_only/);
  await assert.rejects(()=>b.transport('https://attacker.test/account',{method:'GET'}),/get_only/);
  for(let i=0;i<64;i++)await b.transport('https://api.stripe.com/v1/account',{method:'GET'});
  await assert.rejects(()=>b.transport('https://api.stripe.com/v1/account',{method:'GET'}),/budget_exhausted/);assert.equal(reads,64);
  await assert.rejects(()=>b.run(()=>new Promise(()=>{}),5),/deadline/);
 }finally{b.close();}
 await assert.rejects(()=>b.transport('https://api.stripe.com/v1/account',{method:'GET'}),/budget_exhausted/);
 await assert.rejects(()=>b.run(()=>{throw Error('late work must not start');}),/deadline/);
});

test('actual Edge plus full SQL drains180 historic obligations fairly despite failures/new arrivals, with strict run and role bounds',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
 const product=randomUUID(),creator=randomUUID(),historical=[],newcomers=[],attempts=[];
 const insert=async(id,index,old=true)=>db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
  values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd',$5,$6,clock_timestamp()-$7::interval)`,[id,product,randomUUID(),creator,'cs_test_drain_'+index,'pi_drain_'+index,old?'1 day':'0 seconds']);
 const rpc=async(name,args={})=>{
  const query=name==='claim_merch_reconciliation_batch'?['select public.claim_merch_reconciliation_batch()',[]]
   :name==='continue_merch_reconciliation_batch'?['select public.continue_merch_reconciliation_batch($1)',[args.p_run_id]]
   :['select public.complete_merch_cost_refresh($1,$2,$3)',[args.p_order_id,args.p_lease,args.p_complete]];
  return{data:await one(...query)};
 };
 try{
  assert.equal(await one('select enabled from private.merch_reconciliation_driver'),false);
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);await assert.rejects(()=>one('select public.continue_merch_reconciliation_batch($1)',[randomUUID()]),/permission denied/);await root();
  }
  await service();assert.equal((await rpc('claim_merch_reconciliation_batch')).data.claimed,false);await root();
  await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values($1,$2,'Synthetic','Synthetic','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',1000,'untracked')`,[product,creator]);
  for(let i=0;i<180;i++){const id=randomUUID();historical.push(id);await insert(id,i);}
  await db.exec('update private.merch_reconciliation_driver set enabled=true');
  // All role changes and clock manipulation are local fixtures, never provider calls.
  const poison=historical[0];
  for(let round=0;round<6;round++){
   await root();await db.exec("update private.merch_reconciliation_driver set next_run_at='-infinity',lease_until='-infinity'");await service();
   const h=driver(rpc,{cost:async id=>{attempts.push(id);return id!==poison;}});const r=await h.send();
   assert.equal(r.status,200);assert.equal(r.body.orders,30);assert.equal(r.body.health.capacityGuaranteed,false);
   assert.equal((await rpc('claim_merch_reconciliation_batch')).data.claimed,false,'15-minute gate is unchanged');
   const current=await one('select public.continue_merch_reconciliation_batch($1)',[randomUUID()]);assert.equal(current.claimed,false);
   await root();assert.equal(await one('select run_claimed from private.merch_reconciliation_driver'),30);
   const extra=randomUUID();newcomers.push(extra);await insert(extra,180+round,false);
   // A poison retry becomes due but stays behind the older untouched backlog.
   await db.query("update private.merch_cost_refresh_jobs set next_attempt_at=clock_timestamp()-interval '1 minute' where order_id=$1",[poison]);
  }
  assert.deepEqual(new Set(attempts),new Set(historical));assert.equal(attempts.length,180);
  assert.ok(newcomers.every(id=>!attempts.includes(id)));
  assert.equal(await one('select count(*)::int from private.merch_dispute_observations'),0,'driver success does not invent provider evidence');
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  // Exact run token, in-flight batch exclusion, expiry and transactional rollback.
  await db.exec("update private.merch_reconciliation_driver set next_run_at='-infinity',lease_until='-infinity'");await service();
  const batch=(await rpc('claim_merch_reconciliation_batch')).data;assert.equal(batch.jobs.length,3);
  assert.equal((await rpc('continue_merch_reconciliation_batch',{p_run_id:batch.runId})).data.claimed,false,'parallel continuation cannot exceed3 in flight');
  await root();await db.exec("update private.merch_reconciliation_driver set run_until=clock_timestamp()-interval '1 second'");await service();
  assert.equal((await rpc('continue_merch_reconciliation_batch',{p_run_id:batch.runId})).data.claimed,false);
  await root();await db.exec("update private.merch_reconciliation_driver set next_run_at='-infinity',lease_until='-infinity'");
  const before=await one('select to_jsonb(c) from private.merch_reconciliation_driver c');
  await db.exec('begin');await service();await rpc('claim_merch_reconciliation_batch');await db.exec('rollback');await root();
  assert.deepEqual(await one('select to_jsonb(c) from private.merch_reconciliation_driver c'),before);
  await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   select extensions.gen_random_uuid(),$1,extensions.gen_random_uuid(),$2,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_capacity_'||n,'pi_capacity_'||n from generate_series(1,600)n`,[product,creator]);
  const health=await one('select private.merch_reconciliation_backlog_health()');
  assert.equal(health.eligible,786);assert.equal(health.nominalCapacityExceeded,true);assert.equal(health.capacityGuaranteed,false);
  assert.equal(health.nominalMaxOrdersPer6h,720);assert.ok(health.refreshOverdue12h>=600);assert.ok(health.observedAt);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);await assert.rejects(()=>one('select private.merch_reconciliation_backlog_health()'),/permission denied/);await root();
  }
  // Old-source negative control: same schema/data and original SQL only admits3.
  const old=readFileSync('supabase/migrations/20261031012502_merch_reconciliation_driver.sql','utf8');
  await db.exec(old.slice(old.indexOf('create function public.claim_merch_reconciliation_batch'),old.indexOf('create function public.complete_merch_cost_refresh')).replace('create function','create or replace function'));
  await db.exec("update private.merch_cost_refresh_jobs set next_attempt_at='-infinity',lease_until=null,lease=null;update private.merch_reconciliation_driver set next_run_at='-infinity',lease_until='-infinity'");await service();
  assert.equal((await rpc('claim_merch_reconciliation_batch')).data.jobs.length,3);assert.equal((await rpc('claim_merch_reconciliation_batch')).data.claimed,false);
 }finally{await db.close();}
});
