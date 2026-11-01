import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('actual SQL journals exact terminal leases once and owner health never supplies financial authority', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
 try{
  for(const role of ['anon','service_role']){
   await db.exec(`set role ${role}`);
   await assert.rejects(()=>one('select public.get_owner_merch_reconciliation_health()'),/permission denied/);await root();
  }
  await db.exec(`set role authenticated`);
  await assert.rejects(()=>one('select public.get_owner_merch_reconciliation_health()'),/owner_current_session_required/);await root();
  // Only identity/role authority is doubled for owner projection tests. All
  // queue, trigger, statistics and RPC implementation remains actual SQL.
  await db.exec(`create or replace function public.whole_app_exact_current_session_authority_internal() returns boolean language sql as $$select true$$;
   create or replace function public.has_platform_role(required_roles text[]) returns boolean language sql as $$select true$$;`);
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({role:'authenticated',sub:randomUUID()})]);
  await db.exec('set role authenticated');
  let health=await one('select public.get_owner_merch_reconciliation_health()');
  assert.deepEqual(health.alerts,['driver_disabled']);assert.equal(health.driverEnabled,false);assert.equal(health.financialAuthority,false);
  assert.equal(health.liveActivationAllowed,false);assert.equal(health.measured.capacityGuaranteed,false);await root();
  const product=randomUUID(),creator=randomUUID();
  await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values($1,$2,'Synthetic','Synthetic','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'untracked')`,[product,creator]);
  for(let i=0;i<3;i++)await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd',$5,$6)`,[randomUUID(),product,randomUUID(),creator,'cs_test_health_'+i,'pi_health_'+i]);
  await db.exec('update private.merch_reconciliation_driver set enabled=true');await service();
  const claimed=await one('select public.claim_merch_reconciliation_batch()');assert.equal(claimed.jobs.length,3);
  const finish=(job,ok)=>one('select public.complete_merch_cost_refresh($1,$2,$3)',[job.order_id,job.lease,ok]);
  assert.equal((await finish(claimed.jobs[0],true)).stale,false);
  assert.equal((await finish(claimed.jobs[0],true)).stale,true);
  assert.equal((await finish(claimed.jobs[1],false)).stale,false);
  assert.equal((await finish({...claimed.jobs[2],lease:randomUUID()},true)).stale,true);
  await root();
  const row=await one('select to_jsonb(o) from private.merch_reconciliation_run_observations o');
  assert.equal(row.claimed,3);assert.equal(row.completed,1);assert.equal(row.incomplete,1);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   await assert.rejects(()=>db.exec('update private.merch_reconciliation_run_observations set completed=30'),/permission denied/);await root();
  }
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({role:'authenticated',sub:randomUUID()})]);await db.exec('set role authenticated');
  health=await one('select public.get_owner_merch_reconciliation_health()');
  assert.equal(health.measured.runs,1);assert.equal(health.measured.completed,1);assert.equal(health.measured.incomplete,1);
  assert.ok(health.alerts.includes('provider_refresh_failures'));assert.ok(health.alerts.includes('cost_refresh_overdue'));
  assert.ok(!health.alerts.includes('observed_capacity_shortfall'),'not enough window evidence to infer capacity');
  assert.ok(!JSON.stringify(health).includes('cs_test_'));assert.ok(!JSON.stringify(health).includes(claimed.runId));
  await root();await db.exec("update private.merch_reconciliation_run_observations set started_at=now()-interval '31 minutes'");
  await db.exec('set role authenticated');health=await one('select public.get_owner_merch_reconciliation_health()');
  assert.ok(health.alerts.includes('driver_heartbeat_missing'));await root();
  assert.equal(await one('select count(*)::int from private.merch_dispute_observations'),0);
 }finally{await db.close();}
});
