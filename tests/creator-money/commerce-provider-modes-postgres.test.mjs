import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

test('production evidence remains account-bound, mode-separated, held and nonpayable in actual schema',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=()=>db.exec(`reset role;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
 const product=randomUUID(),identity=randomUUID();
 try{
  assert.equal(await one("select private.commerce_provider_mode('production')"),'live');
  assert.equal(await one("select private.commerce_provider_mode('sandbox')"),'test');
  assert.equal(await one("select private.commerce_provider_mode('setup')"),null);
  await db.query(`insert into public.merch_products(id,display_name,provider,shipping_tracking_mode) values($1,'Synthetic mode fixture','stripe_physical_goods','untracked')`,[product]);
  await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,$3,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','production','paid','not_started','paid',1000,1000,'usd','cs_live_merch','pi_merch')`,[identity,product,order.buyer_id]);
  await service();await assert.rejects(one('select public.get_merch_cost_reconciliation_context($1)',[identity]),/live_charge_account_binding_required/);
  const bind=environment=>one(`select public.bind_commerce_tax_checkout_policy('physical_merch',$1,$2,'acct_fixture',$3,'US_all_destinations')`,[identity,product,environment]);
  assert.equal((await bind('sandbox')).reason,'tax_checkout_identity_invalid');
  assert.equal((await bind('production')).reason,'tax_qualification_required');
  await db.exec('reset role');
  await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,
   provider_verified_at,provider_expires_at,expires_at,enabled)
   values('physical_merch',$1,'acct_fixture','production','US_all_destinations','all_supported_platforms',true,
   'SYNTHETIC only','SYNTHETIC only','automatic','self','txcd_99999999','inclusive','SYNTHETIC only','SYNTHETIC only','SYNTHETIC only',
   clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',true)`,[product]);
  await service();assert.equal((await bind('production')).ready,true);
  const context=await one('select public.get_merch_cost_reconciliation_context($1)',[identity]);
  assert.equal(context.environment,'production');assert.equal(context.platform_account_id,'acct_fixture');
  const f=fixture(),facts=JSON.parse(JSON.stringify(await observe(order,'sk_test_synthetic','acct_fixture',f.transport)));
  Object.assign(facts,{order_id:identity,environment:'production',checkout_id:'cs_live_merch'});
  const save=value=>one('select public.record_merch_provider_cost_observation($1,$2)',[identity,JSON.stringify(value)]);
  await assert.rejects(save({...facts,environment:'sandbox'}),/identity_invalid/);
  await assert.rejects(save({...facts,account_id:'acct_other'}),/live_charge_account_binding_required/);
  await db.exec('begin');await save(facts);await db.exec('rollback');
  await db.exec('reset role');assert.equal(await one('select count(*)::int from private.merch_provider_cost_observations'),0);
  await service();const result=await save(facts);assert.equal(result.financialAuthority,false);
  assert.ok(result.holdReasons.includes('live_commerce_release_unqualified'));assert.ok(!result.holdReasons.includes('sandbox_not_payable'));
  const report=await one('select public.get_merch_fee_report_import_context($1)',[identity]);
  assert.equal(report.environment,'live');assert.equal(report.accountId,'acct_fixture');
  const attempt=await one('select public.begin_merch_dispute_observation($1)',[identity]);
  assert.equal(attempt.environment,'production');assert.equal(attempt.platform_account_id,'acct_fixture');
  await db.exec('reset role');
  assert.equal(await one('select return_case_protocol from public.merch_orders where id=$1',[identity]),'app_merch_cases_v1');
  const returnEvidence=()=>db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'SYNTHETIC untracked clearance','not_applicable','none','none')`,[identity]);
  await assert.rejects(returnEvidence(),/live_purchase_evidence_required/);
  // Root fixtures test consumption, not provider issuance. The signed callback
  // tests separately prove that only real canonical successes may issue these.
  await db.query(`insert into public.stripe_merch_events(stripe_event_id,event_type,environment,status,object_id,linked_order_id,raw_event_hash)
   values('evt_live_fixture','payment_intent.succeeded','production','processed','pi_merch',$1,repeat('a',64))`,[identity]);
  await db.query(`insert into private.merch_purchase_time_evidence(order_id,stripe_event_id,stripe_payment_intent_id,succeeded_at,raw_event_hash)
   values($1,'evt_live_fixture','pi_merch',clock_timestamp()-interval '31 days',repeat('a',64))`,[identity]);
  assert.notEqual(await one('select private.merch_verified_purchase_at($1)',[identity]),null);
  await returnEvidence();
  for(const role of ['anon','authenticated']){
   await db.exec(`reset role;set role ${role}`);
   await assert.rejects(one('select public.get_merch_fee_report_import_context($1)',[identity]),/permission denied/);
  }
 }finally{await db.close();}
});
