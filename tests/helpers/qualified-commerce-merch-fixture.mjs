import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
// Synthetic fixture only: caller must supply a disposable database adapter.
// Never use this helper against a hosted database. It deliberately enables
// local switches and inserts explicit synthetic legal/provider qualifications.
export async function seedQualifiedCommerceMerch(db, factsSeed=JSON.parse(fs.readFileSync(new URL('../fixtures/commerce-merch-provider-facts.json',import.meta.url),'utf8')), options={}) {
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
 const product=randomUUID(),identity=randomUUID(),creator=options.creatorId??randomUUID();
 const platform=options.platformAccountId??'acct_fixture',recipient=options.recipientAccountId??'acct_recipient';
 assert.match(platform,/^acct_[A-Za-z0-9]+$/);assert.match(recipient,/^acct_[A-Za-z0-9]+$/);
  await db.query(`insert into public.merch_products(id,display_name,provider,shipping_tracking_mode) values($1,'Synthetic release fixture','stripe_physical_goods','untracked')`,[product]);
  await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
   values($1,$2,$3,$4,'stripe_physical_goods','production','paid','delivered','paid',1000,1000,'usd','cs_live_merch','pi_merch',now()-interval '40 days')`,[identity,product,'e7100000-0000-4000-8000-000000000002',creator]);
  await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('physical_merch',$1,'${platform}','production','US_all_destinations','all_supported_platforms',true,'SYNTHETIC only','SYNTHETIC only','automatic','self','txcd_99999999','inclusive',
   'SYNTHETIC only','SYNTHETIC only','SYNTHETIC only',now(),now()+interval '1 hour',now()+interval '1 hour',true)`,[product]);
  await service();assert.equal((await one(`select public.bind_commerce_tax_checkout_policy('physical_merch',$1,$2,'${platform}','production','US_all_destinations')`,[identity,product])).ready,true);
  const facts=JSON.parse(JSON.stringify(factsSeed));
  Object.assign(facts,{order_id:identity,environment:'production',checkout_id:'cs_live_merch',account_id:platform});
  const saveFacts=()=>one('select public.record_merch_provider_cost_observation($1,$2)',[identity,JSON.stringify(facts)]);
  await saveFacts();const context=await one('select public.get_merch_fee_report_import_context($1)',[identity]);
  const release=()=>one("select public.release_commerce_known_earnings('physical_merch',$1)",[identity]);
  await root();
  await db.query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
   values($1,'known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),gen_random_uuid()) on conflict do nothing`,[creator]);
  await db.query(`insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified)
   values('${platform}','live','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','SYNTHETIC only',now(),now()+interval '1 hour',true)`);
  const row={feeTransactionId:'fee_Inline',incurredBy:context.chargeId,incurredByType:'charge',amountMinor:30,taxMinor:0,currency:'usd',product:'Payments',suite:'Payments',featureName:'Processing',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_sale'};
  const evidence={schemaVersion:1,accountId:platform,environment:'live',reportRunId:'frr_Release',fileId:'file_Release',reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
   chargeId:context.chargeId,refundIds:[],rows:[row],unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
   holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300};
  const report=(patch={})=>one('select public.record_merch_fee_report_observation($1,$2,$3)',[identity,context.sourceObservationId,JSON.stringify({...evidence,...patch})]);
  await service();await report();await assert.rejects(release(),/activation_disabled/);
  const drain=()=>one('select public.process_commerce_fee_accounting_jobs(1,$1)',[identity]);
  const blocked=await drain();assert.equal(blocked.outcomes[0].status,'blocked');assert.equal(blocked.outcomes[0].reason,'commerce_earnings_activation_disabled');
  await root();assert.equal(await one('select state from private.commerce_fee_accounting_jobs where source_id=$1',[identity]),'blocked');
  await root();await db.exec("update public.platform_money_kill_switches set state='on' where key in ('live_money_enabled','payouts_enabled','stripe_connect_enabled')");
  await service();await assert.rejects(release(),/clearance_required/);
  await root();
  await db.query(`insert into public.stripe_merch_events(stripe_event_id,event_type,status,linked_order_id,object_id,raw_event_hash,environment)
   values('evt_Purchase','payment_intent.succeeded','processed',$1,'pi_merch',repeat('a',64),'production')`,[identity]);
  await db.query(`insert into private.merch_purchase_time_evidence(order_id,stripe_event_id,stripe_payment_intent_id,succeeded_at,raw_event_hash)
   values($1,'evt_Purchase','pi_merch',clock_timestamp()-interval '31 days',repeat('a',64))`,[identity]);
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'SYNTHETIC CLEARANCE ONLY','not_applicable','none','none')`,[identity]);
  const state=await one('select private.merch_return_hold_state(o,clock_timestamp()) from public.merch_orders o where id=$1',[identity]);
  assert.equal(state.returnWindowStatus,'elapsed',JSON.stringify(state));
  await service();await assert.rejects(release(),/clearance_required/,'canonical fulfillment receipt is independently required');
  await root();await db.query(`insert into private.commerce_earnings_qualifications(creator_id,platform_account_id,recipient_account_id,environment,currency,platform_held_funding_verified,no_automatic_transfer_verified,evidence_reference,verified_at,expires_at)
   values($1,'${platform}','${recipient}','live','usd',true,true,'SYNTHETIC only',now(),now()+interval '1 hour')`,[creator]);
  await service();await assert.rejects(release(),/clearance_required/,'a status string alone is not canonical fulfillment evidence');
  await root();
  await db.query("update public.merch_orders set fulfillment_status='not_started' where id=$1",[identity]);
  await service();await assert.rejects(release(),/clearance_required/,'elapsed untracked return window cannot fulfill an unshipped order');
  await root();await db.query("update public.merch_orders set fulfillment_status='delivered' where id=$1",[identity]);
  await db.query(`insert into private.merch_fulfillment_receipts(order_id,creator_id,actor_session_id,fulfillment_revision,previous_status,status)
   select id,creator_id,gen_random_uuid(),fulfillment_revision,'processing','shipped' from public.merch_orders where id=$1`,[identity]);
  await service();await assert.rejects(release(),/clearance_required/,'inconsistent receipt and current status cannot release');
  await root();await db.query("update public.merch_orders set fulfillment_status='shipped' where id=$1",[identity]);
  await db.query(`insert into private.merch_fulfillment_receipts(order_id,creator_id,actor_session_id,fulfillment_revision,previous_status,status)
   select id,creator_id,gen_random_uuid(),fulfillment_revision,'processing','shipped' from public.merch_orders where id=$1`,[identity]);
 return {one,root,service,product,identity,creator,facts,context,release,report,drain,evidence,row};
}
