import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
import {seedCommerceCreator,assertBuyerHasNoPremium} from '../helpers/automatic-commerce-fixture.mjs';

// The sale and refund receipts come from the real canonical Stripe lifecycle
// processor. No digital provider or earnings rows are synthesized for merch.
// Account/tax policy and delivery inputs are disposable fixtures, not live proof.
test('canonical sandbox physical purchase supplies isolated cashout earnings and refunds preserve held accounting',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 try{
  const f=await seedCashoutExecutionFixture(db,{reserveInitialRequest:false});
  const {scalar,claims,rpc,creator}=f;
  await seedCommerceCreator(db,{id:creator,session:f.session});
  const buyer='ce000000-0000-4000-8000-000000000001',product='ce000000-0000-4000-8000-000000000002';
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'sandbox-merch-buyer@example.test',now(),false,false)",[buyer]);
  await assertBuyerHasNoPremium(db,{id:buyer});
  await db.exec("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled'); update public.platform_money_kill_switches set state='sandbox_only' where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled'); update private.sandbox_cashout_control set enabled=true");
  await db.query("insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country) values($1,'stripe_connect','test','acct_merchSandboxCreator','US')",[creator]);
  const q=await scalar(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values($1,'acct_merchSandboxPlatform','acct_merchSandboxCreator','ba_merchSandboxDestination','scheduled','card',0,0,'synthetic-merch-test-v1',0,1000,0,0,
   true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 day') returning id`,[creator]);
  await db.query(`insert into public.merch_products(id,display_name,product_key,provider,status,environment,price_minor,currency,inventory_status,shipping_tracking_mode)
   values($1,'Synthetic physical merch','sandbox_cashout_merch_test','stripe_physical_goods','sandbox','sandbox',1000,'usd','in_stock','tracked')`,[product]);
  await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,enabled,provider_verified_at,provider_expires_at,expires_at)
   values('physical_merch',$1,'acct_merchSandboxPlatform','sandbox','US_all_destinations','all_supported_platforms',
   'SYNTHETIC TEST ONLY','SYNTHETIC TEST ONLY',true,'automatic','self','txcd_99999999','inclusive','SYNTHETIC TEST ONLY',
   'SYNTHETIC TEST ONLY','SYNTHETIC TEST ONLY',true,now(),now()+interval '1 hour',now()+interval '1 hour')`,[product]);
  const user=async(sql,args=[])=>{await claims('authenticated');await db.exec('set role authenticated');try{return await scalar(sql,args);}finally{await db.exec('reset role');}};
  const make=async({bind=true,self=false}={})=>{
   const id=randomUUID(),suffix=id.replaceAll('-','');
   const o={id,buyer_id:self?creator:buyer,creator_id:creator,product_id:product,provider:'stripe_physical_goods',environment:'sandbox',
    order_status:'pending',fulfillment_status:'not_started',payment_status:'pending',amount_subtotal_minor:1000,amount_total_minor:1000,
    currency:'usd',stripe_checkout_session_id:`cs_test_${suffix}`,stripe_payment_intent_id:`pi_${suffix}`};
   await db.query(`insert into public.merch_orders(${Object.keys(o).join(',')}) values(${Object.keys(o).map((_,i)=>`$${i+1}`).join(',')})`,Object.values(o));
   if(bind)assert.equal((await rpc('select public.bind_commerce_tax_checkout_policy($1,$2,$3,$4,$5,$6)',
    ['physical_merch',id,product,'acct_merchSandboxPlatform','sandbox','US_all_destinations'])).ready,true);
   return o;
  };
  const facts=(o,patch={})=>({event_livemode:false,object_livemode:false,object_id:o.stripe_checkout_session_id,object_type:'checkout.session',
   payment_intent_id:o.stripe_payment_intent_id,metadata_order_id:o.id,metadata_buyer_id:o.buyer_id,client_reference_id:o.id,
   mode:'payment',status:'complete',payment_status:'paid',amount_minor:1000,currency:'usd',...patch});
  const send=(o,type,patch={})=>{const body=facts(o,patch);return rpc('select public.process_stripe_merch_webhook_lifecycle($1,$2,$3,$4)',
   [`evt_${randomUUID().replaceAll('-','')}`,type,createHash('sha256').update(JSON.stringify(body)).digest('hex'),body]);};
  const source=o=>scalar('select private.sandbox_cashout_merch_source($1,$2)',[o.id,q]);
  const beforeMoney=await scalar('select count(*)::int from public.money_access_ledger_events');
  const beforeProvider=await scalar('select count(*)::int from public.provider_events');
  for(const options of [{bind:false},{self:true}]){
   const o=await make(options);assert.equal((await send(o,'checkout.session.completed')).reason,'payment_confirmed');
   assert.equal(await source(o),null,'unbound account and self-purchase cannot fund test cashout');
  }
  const o=await make();assert.equal(await source(o),null,'pending order is not earnings');
  assert.equal((await send(o,'checkout.session.completed')).reason,'payment_confirmed');
  assert.equal((await source(o)).netMinor,900,'exact canonical paid order plus bound platform account uses explicit fixture economics');
  const quote=await user("select public.preview_sandbox_creator_cashout(900,'scheduled')");assert.equal(quote.ready,true);
  const request=()=>user('select public.request_sandbox_creator_cashout($1,$2,$3,$4,$5,$6,$7)',[900,'scheduled',q,randomUUID(),0,0,900]);
  const first=await request();
  assert.equal(await scalar('select count(*)::int from private.sandbox_cashout_allocations'),0,'merch did not create a digital allocation');
  assert.equal(await scalar('select count(*)::int from private.sandbox_cashout_merch_allocations'),1);
  assert.equal((await user('select public.cancel_undispatched_sandbox_creator_cashout($1)',[first.requestId])).status,'canceled');
  const second=await request();
  const claim=stage=>rpc('select public.claim_sandbox_creator_cashout_dispatch($1,$2)',[second.requestId,stage]);
  const observe=(body,token=null)=>rpc('select public.record_sandbox_creator_cashout_observation($1,$2,$3)',[second.requestId,token,body]);
  // Ordinary shipping progress must not strand unchanged payment economics.
  await db.query("update public.merch_orders set fulfillment_status='shipped' where id=$1",[o.id]);
  assert.equal((await user('select public.get_my_sandbox_creator_cashout_execution($1)',[second.requestId])).sourceHeld,false);
  const funding=await claim('funding');assert.equal(funding.claimed,true);
  await observe({kind:'transfer',objectId:'tr_merchSandboxFunding',amountMinor:900,reversedMinor:0,fullyReversed:false,accountId:'acct_merchSandboxCreator',environment:'test'},funding.token);
  const payout=await claim('payout');assert.equal(payout.claimed,true);
  const payoutFacts={kind:'payout',objectId:'po_merchSandboxBank',amountMinor:900,accountId:'acct_merchSandboxCreator',destinationId:'ba_merchSandboxDestination',environment:'test'};
  await observe({...payoutFacts,status:'failed',returnedMinor:900,returnTransactionId:'txn_merchSandboxReturn'},payout.token);
  const reversal=await claim('reversal');assert.equal(reversal.claimed,true);
  await observe({kind:'reversal',objectId:'trr_merchSandboxReturn',transferId:'tr_merchSandboxFunding',amountMinor:900,accountId:'acct_merchSandboxCreator',environment:'test'},reversal.token);
  assert.equal(await scalar('select sum(released_minor)::int from private.sandbox_cashout_merch_simulated_returns'),900);
  const third=await request();
  const refund=amount=>send(o,'charge.refunded',{object_type:'charge',object_id:`ch_${o.id.replaceAll('-','')}`,refunded_amount_minor:amount,refunded:amount===1000});
  assert.equal((await refund(250)).reason,'partial_refund_recorded');
  assert.equal(await source(o),null,'partial refunds do not guess tax or recycled net earnings');
  assert.equal((await user('select public.get_my_sandbox_creator_cashout_execution($1)',[third.requestId])).sourceHeld,true);
  await assert.rejects(rpc('select public.claim_sandbox_creator_cashout_dispatch($1,$2)',[third.requestId,'funding']),/sandbox_source_reconciliation_required/);
  assert.equal((await refund(1000)).reason,'full_refund_recorded');
  await send(o,'checkout.session.completed');assert.equal(await source(o),null,'stale paid callback cannot reopen fully refunded source');
  assert.equal(await scalar('select count(*)::int from public.money_access_ledger_events'),beforeMoney);
  assert.equal(await scalar('select count(*)::int from public.provider_events'),beforeProvider);
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_executions'),0);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   await assert.rejects(db.query('select * from private.sandbox_cashout_merch_allocations'),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});
