import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

const migration='20261030200156_physical_merch_return_window.sql';
test('30-day verified-delivery terms are prospective, immutable, and cannot confer settlement authority',{timeout:240000},async()=>{
 // Replay the tracking-dependent address successor after the historical seed, never omit it.
 const successors=['20261030201916_merch_verified_purchase_time.sql','20261030202009_merch_declared_tracking_return_terms.sql','20261030202330_merch_automatic_tracking.sql',
  '20261030210200_merch_private_fulfillment_address.sql','20261030212744_merch_return_cases.sql',
  '20261031011531_merch_provider_dispute_observations.sql','20261031011906_merch_return_buyer_replies.sql',
  '20261031012501_merch_return_case_queues.sql','20261031012502_merch_reconciliation_driver.sql',
  '20261031033820_commerce_tax_readiness.sql','20261031033911_merch_tracking_correction_intake.sql',
  '20261031034904_merch_tracking_reviewed_supersession.sql',
  '20261101045810_merch_checkout_dispatch_provenance.sql',
  '20261101045816_merch_reconciliation_bounded_drain.sql'];
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration,...successors]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const insert=id=>db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
 values($1,$2,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','sandbox','paid','delivered','paid',1000,1000,'usd',$3,$4,clock_timestamp()-interval '60 days')`,[id,order.buyer_id,id===order.id?'cs_test_merch':'cs_test_historical',id===order.id?'pi_merch':'pi_historical']);
 const historical='e7100000-0000-4000-8000-000000000099';
 const projection=()=>one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[order.id]);
 const state=asof=>one('select private.merch_return_hold_state(o,$2::timestamptz) from public.merch_orders o where id=$1',[order.id,asof]);
 const evidence=(reference,delivered,observed,returns='none',dispute='none',delivery='verified')=>db.query(`insert into private.merch_return_evidence(order_id,delivered_at,observed_at,evidence_reference,delivery_state,return_state,dispute_state) values($1,$2,$3,$4,$5,$6,$7)`,[order.id,delivered,observed,reference,delivery,returns,dispute]);
 try{
  await insert(historical);
  await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${migration}`,import.meta.url),'utf8'));
  for(const successor of successors)await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${successor}`,import.meta.url),'utf8'));
  assert.equal(await one('select return_policy_version from public.merch_orders where id=$1',[historical]),null);
  assert.equal(await one('select fulfillment_address_policy_version from public.merch_orders where id=$1',[historical]),null);
  assert.equal(await one('select return_case_protocol from public.merch_orders where id=$1',[historical]),null);
  await assert.rejects(db.query("update public.merch_orders set return_policy_version='physical_merch_verified_delivery_30d_v1',return_window_days=30 where id=$1",[historical]),/immutable/);
  await insert(order.id);
  const initial=await projection();
  assert.equal(initial.returnPolicyVersion,'physical_merch_verified_delivery_30d_v1');assert.equal(initial.returnWindowDays,30);
  assert.equal(initial.returnWindowStatus,'awaiting_verified_delivery','creator-marked delivered does not verify delivery');
  assert.equal(initial.returnWindowEndsAt,null);assert.equal(initial.financialAuthority,false);
  await assert.rejects(db.query('update public.merch_orders set return_window_days=1 where id=$1',[order.id]),/immutable/);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   for(const sql of ['select * from private.merch_return_evidence','delete from private.merch_return_evidence','update private.merch_return_evidence set return_state=\'resolved\''])await assert.rejects(db.exec(sql),/permission denied/);
   await assert.rejects(evidence('forged','2026-10-01','2026-10-01'),/permission denied/);
   await db.exec('reset role');
  }
  const now=new Date(await one('select clock_timestamp()'));const delivered=new Date(now.getTime()-31*86400000).toISOString();
  const observed=new Date(new Date(delivered).getTime()+3600000).toISOString();
  const boundary=new Date(new Date(delivered).getTime()+30*86400000).toISOString();
  await db.exec('begin');await evidence('rollback',delivered,observed);await db.exec('rollback');
  assert.equal(await one('select count(*)::int from private.merch_return_evidence'),0);
  await evidence('delivery-proof',delivered,observed);
  assert.equal((await state(new Date(new Date(boundary).getTime()-1).toISOString())).returnWindowStatus,'open');
  assert.equal((await state(boundary)).returnWindowStatus,'elapsed');
  assert.deepEqual((await state(boundary)).returnHoldReasons,[]);
  const productionHelper=await one("select pg_get_functiondef('private.merch_return_hold_state_before_tracking(public.merch_orders,timestamptz)'::regprocedure)");
  await db.exec('begin');await db.exec(productionHelper.replace("interval '720 hours'","interval '24 hours'"));
  const brokenWindow=await state(new Date(new Date(boundary).getTime()-1).toISOString());
  assert.throws(()=>assert.equal(brokenWindow.returnWindowStatus,'open'),'one-day-window mutation is rejected by the production assertion');
  await db.exec('rollback');assert.equal((await state(new Date(new Date(boundary).getTime()-1).toISOString())).returnWindowStatus,'open');
  await db.exec("set time zone 'America/Chicago'");assert.equal(new Date((await state(boundary)).returnWindowEndsAt).getTime(),new Date(boundary).getTime(),'deadline is independent of session time zone');await db.exec("set time zone 'UTC'");
  await assert.rejects(evidence('changed-delivery',new Date(new Date(delivered).getTime()+1).toISOString(),now.toISOString()),/identity_or_order/);
  await assert.rejects(evidence('stale',delivered,delivered),/identity_or_order/);
  await assert.rejects(evidence('future',delivered,new Date(now.getTime()+86400000).toISOString()),/invalid/);
  await assert.rejects(db.exec('delete from private.merch_return_evidence'),/append_only/);
  await assert.rejects(db.exec("update private.merch_return_evidence set return_state='resolved'"),/append_only/);
  await evidence('return-open',delivered,now.toISOString(),'open');
  assert.equal((await projection()).returnWindowStatus,'review_required');assert.ok((await projection()).netSettlementHoldReasons.includes('merch_return_unresolved'));
  await db.exec('begin');await db.exec(productionHelper.replace("e.return_state='open'","false"));
  const brokenReturn=await projection();assert.throws(()=>assert.ok(brokenReturn.netSettlementHoldReasons.includes('merch_return_unresolved')),'ignored open-return mutation is rejected');
  await db.exec('rollback');assert.ok((await projection()).netSettlementHoldReasons.includes('merch_return_unresolved'));
  await evidence('dispute-open',delivered,now.toISOString(),'resolved','open');
  assert.ok((await projection()).netSettlementHoldReasons.includes('merch_dispute_unresolved'));
  await evidence('cleared',delivered,now.toISOString(),'resolved','resolved');
  assert.equal((await projection()).returnWindowStatus,'elapsed');
  await db.query("update public.merch_orders set payment_status='disputed' where id=$1",[order.id]);
  assert.ok((await projection()).netSettlementHoldReasons.includes('merch_dispute_unresolved'),'provider dispute cannot be cleared by return evidence');
  await db.query("update public.merch_orders set payment_status='paid' where id=$1",[order.id]);
  const f=fixture();const facts=JSON.parse(JSON.stringify(await observe(order,'sk_test_synthetic','acct_fixture',f.transport)));
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);select set_config('request.jwt.claim.role','service_role',false);set role service_role`);
  const saved=await one('select public.record_merch_provider_cost_observation($1,$2)',[order.id,JSON.stringify(facts)]);
  assert.equal(saved.platformShareMinor,87);assert.equal(saved.creatorShareMinor,783);assert.equal(saved.financialAuthority,false);
  assert.ok(saved.holdReasons.includes('sandbox_not_payable'));assert.ok(saved.holdReasons.includes('adjustments_unqualified'));
  assert.ok(!saved.holdReasons.includes('merch_return_window_policy_unqualified'));
  await db.exec('reset role');
  await evidence('revoked',delivered,now.toISOString(),'resolved','resolved','revoked');
  assert.equal((await projection()).returnWindowStatus,'awaiting_verified_delivery');assert.ok((await projection()).netSettlementHoldReasons.includes('verified_delivery_required'));
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  assert.equal(await one('select bool_or(financial_authority) from private.merch_held_net_allocations'),false);
  assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid='private.merch_return_evidence'::regclass"),true);
 }finally{await db.close();}
});
