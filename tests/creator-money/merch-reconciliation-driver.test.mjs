import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
function endpoint({claimed=true,configured=true,tracking=true,fail=false,count=1,malformed=false,project="https://synthetic.supabase.co"}={}){
 let handler;const runId=randomUUID(),calls=[],jobs=Array.from({length:count},()=>({order_id:randomUUID(),lease:randomUUID()}));
 const env={SUPABASE_URL:project,SUPABASE_SERVICE_ROLE_KEY:'service_synthetic',MERCH_TRACKING_WORKER_SECRET:tracking?'worker_synthetic':undefined};
 const runtime={exports:{},setTimeout,clearTimeout,AbortSignal,TextDecoder,fetch:async(url,opts)=>{
  calls.push({url,opts});assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.ok(opts.signal);
  return new Response(JSON.stringify(malformed?{financialAuthority:false,error:'incomplete'}:url.endsWith('/merch-tracking-reconcile')?{financialAuthority:false,claimed:1,completed:1}:{financialAuthority:false,payoutCreated:false,status:'held',observationId:randomUUID()}),{status:fail?503:200});
 },Deno:{serve:f=>handler=f},require:name=>{
  if(name.startsWith('jsr:'))return{};
  if(name.endsWith('stripe-connect.ts'))return{readOptionalEnv:k=>env[k],createAdminClient:()=>({configured,client:{rpc:async(name,args)=>{
   calls.push({name,args});if(name==='claim_merch_reconciliation_batch')return{data:{claimed,runId,jobs:claimed?jobs:[]}};
   if(name==='continue_merch_reconciliation_batch')return{data:{claimed:true,runId,jobs:[]}};
   assert.equal(name,'complete_merch_cost_refresh');return{data:{stale:false}};
  }}}),jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status})};throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/merch-reconciliation-driver/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,runtime);
 return {calls,jobs,send:(token='service_synthetic',body='{}')=>handler(new Request('https://synthetic.test',{method:'POST',headers:{Authorization:'Bearer '+token},body}))};
}
test('actual driver rejects caller authority/input and disabled/missing config has no network side effects',async()=>{
 for(const opts of [{claimed:false},{configured:false},{project:'https://attacker.example'}]){const h=endpoint(opts);await h.send();assert.equal(h.calls.filter(c=>c.url).length,0);}
 const h=endpoint();assert.equal((await h.send('user')).status,403);assert.equal((await h.send('service_synthetic','{"order_id":"caller"}')).status,400);assert.deepEqual(h.calls,[]);assert.equal((await h.send('service_synthetic',' '.repeat(100))).status,503);assert.deepEqual(h.calls,[]);
});
test('actual driver fixed destinations, exact distinct credentials, failure completion and no invented clearance',async()=>{
 for(const fail of [false,true]){
  const h=endpoint({fail});const res=await(await h.send()).json();const network=h.calls.filter(c=>c.url);
  assert.equal(network.length,2);
  const tracking=network.find(c=>c.url.endsWith('/merch-tracking-reconcile')),cost=network.find(c=>c.url.endsWith('/stripe-merch-cost-reconcile'));
  assert.equal(tracking.opts.headers.Authorization,'Bearer worker_synthetic');assert.equal(cost.opts.headers.Authorization,'Bearer service_synthetic');
  assert.equal(cost.url,'https://synthetic.supabase.co/functions/v1/stripe-merch-cost-reconcile');assert.deepEqual(JSON.parse(cost.opts.body),{order_id:h.jobs[0].order_id});
  const finished=h.calls.find(c=>c.name==='complete_merch_cost_refresh');assert.equal(finished.args.p_complete,!fail);assert.equal(finished.args.p_lease,h.jobs[0].lease);
  assert.equal(res.financialAuthority,false);assert.equal(res.completed,fail?0:1);
 }
 const bad=endpoint({malformed:true});assert.equal((await(await bad.send()).json()).completed,0);assert.equal(bad.calls.find(c=>c.name==='complete_merch_cost_refresh').args.p_complete,false);
 const h=endpoint({tracking:false});await h.send();assert.equal(h.calls.filter(c=>c.url).length,1);
 const batch=endpoint({count:3});await batch.send();assert.equal(batch.calls.filter(c=>c.url).length,4);
 const oversized=endpoint({count:4});assert.equal((await oversized.send()).status,503);assert.equal(oversized.calls.filter(c=>c.url).length,0);
});
test('actual full-schema service leases, dormant control, bounded fairness, retries, expiry and stale completions',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');const service=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role;`);
 const claim=()=>one('select public.claim_merch_reconciliation_batch()');
 const finish=(j,ok)=>one('select public.complete_merch_cost_refresh($1,$2,$3)',[j.order_id,j.lease,ok]);
 try{
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(claim(),/permission denied/);await root();}
  await service();assert.equal((await claim()).claimed,false);await root();
  const product=randomUUID(),creator=randomUUID();
  await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode) values($1,$2,'Synthetic','Synthetic','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'untracked')`,[product,creator]);
  const ids=[];for(let i=0;i<5;i++){
   const id=randomUUID();ids.push(id);await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id) values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd',$5,$6)`,[id,product,randomUUID(),creator,'cs_test_'+i,'pi_'+i]);
  }
  assert.equal(await one('select count(*)::int from private.merch_cost_refresh_jobs'),0);
  await db.exec('update private.merch_reconciliation_driver set enabled=true');await service();
  const first=await claim();assert.equal(first.jobs.length,3);assert.equal((await claim()).claimed,false);
  assert.equal((await finish({...first.jobs[0],lease:randomUUID()},true)).stale,true);
  await root();await db.query('update private.merch_cost_refresh_jobs set lease_until=null where order_id=$1',[first.jobs[0].order_id]);await service();
  assert.equal((await finish(first.jobs[0],true)).stale,true,'null expiry cannot authorize completion');
  await root();await db.query("update private.merch_cost_refresh_jobs set lease_until=clock_timestamp()+interval '5 minutes' where order_id=$1",[first.jobs[0].order_id]);await service();
  assert.equal((await finish(first.jobs[0],true)).stale,false);assert.equal((await finish(first.jobs[0],false)).stale,true);
  assert.equal((await finish(first.jobs[1],false)).stale,false);
  await root();assert.equal(await one("select last_result from private.merch_cost_refresh_jobs where order_id=$1",[first.jobs[1].order_id]),'incomplete');
  assert.ok(await one("select next_attempt_at>=checked_at+interval '15 minutes' from private.merch_cost_refresh_jobs where order_id=$1",[first.jobs[1].order_id]));
  await db.exec("update private.merch_reconciliation_driver set next_run_at='-infinity',lease_until='-infinity'");await service();
  const second=await claim();assert.equal(second.jobs.length,2);assert.ok(second.jobs.every(j=>!first.jobs.some(k=>k.order_id===j.order_id)),'older due backlog not starved by failures');
  await root();await db.query("update private.merch_cost_refresh_jobs set lease_until=clock_timestamp()-interval '1 second',next_attempt_at='-infinity' where order_id=$1",[first.jobs[2].order_id]);
  await service();assert.equal((await finish(first.jobs[2],true)).stale,true);
  await root();await db.exec("update private.merch_reconciliation_driver set next_run_at='-infinity',lease_until='-infinity'");await service();
  const retry=await claim();assert.equal(retry.jobs[0].order_id,first.jobs[2].order_id);assert.notEqual(retry.jobs[0].lease,first.jobs[2].lease);assert.equal((await finish(first.jobs[2],true)).stale,true);
  await root();assert.equal(await one('select count(*)::int from private.merch_dispute_observations'),0);assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  for(const role of ['anon','authenticated','service_role']){await db.exec(`set role ${role}`);await assert.rejects(db.exec('update private.merch_reconciliation_driver set enabled=true'),/permission denied/);await root();}
 }finally{await db.close();}
});
