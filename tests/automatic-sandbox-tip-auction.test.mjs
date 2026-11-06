import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceCreator,seedCommerceBuyer,acceptCommerceCreatorTerms,seedSyntheticStrictCreatorProvider,withCommerceActor,assertBuyerHasNoPremium} from './helpers/automatic-commerce-fixture.mjs';

// Full migration chain and real entrypoints. Disposable provider observations
// are synthetic test-mode inputs, never live qualification or verified tax.
test('declared Premium author uses test tips and auctions without verified live facts or buyer Premium', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 const rpc=(actor,sql,args=[],role='authenticated',platform='ios')=>withCommerceActor(db,actor,async()=>{
  await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-chillywood-platform':platform})]);
  return scalar(sql,args);
 },role);
 try {
  const creator=await seedCommerceCreator(db),buyer=await seedCommerceBuyer(db),android=await seedCommerceBuyer(db);
  await acceptCommerceCreatorTerms(db,creator);
  await db.exec(`update public.platform_money_kill_switches set state='sandbox_only' where key in
   ('tips_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled','revenuecat_app_store_enabled')`);
  const declared=await rpc(creator,"select public.declare_creator_money_eligibility(true,'US','CA') value");
  assert.equal(declared.state,'PENDING_VERIFICATION');
  assert.equal(declared.sandboxCapability.canUseCreatorTools,true);
  assert.equal(declared.canCreateMoneyExposure,false);
  // Real authoring can save settings, but it must not manufacture test provider
  // readiness. External checkout remains unavailable until genuine route facts.
  const initial=await rpc(creator,"select to_jsonb(public.upsert_my_creator_tip_settings(true,array[100,300],300,100,1000,'usd')) value");
  assert.equal(initial.tips_enabled,true);
  assert.equal(initial.provider_charges_enabled,false);
  assert.equal(initial.provider_payouts_enabled,false);
  assert.equal(initial.status,'setup_incomplete');
  const nativeStatus=await rpc(buyer,'select public.get_creator_tip_public_status($1) value',[creator.id]);
  assert.equal(nativeStatus.canTip,false,'external readiness is not fabricated');
  assert.equal(nativeStatus.nativeSandboxAvailable,true);
  assert.deepEqual(nativeStatus.nativeSandboxPlatforms,{ios:true,android:true});
  assert.equal(nativeStatus.nativeSandboxEnvironment,'sandbox');
  assert.equal(nativeStatus.nativeFinancialAuthority,false);
  const iosTip=await rpc(buyer,"select public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip',$1,'{}') value",[creator.id]);
  assert.equal(iosTip.environment,'sandbox');assert.equal(iosTip.amountMinor,299);
  assert.equal((await rpc(buyer,'select public.begin_creator_money_checkout($1,$2) value',[iosTip.id,randomUUID()])).startAuthorized,true);
  const androidTip=await rpc(android,"select public.create_money_purchase_intent('creator_tip_sandbox_099','creator_tip',$1,'{}') value",[creator.id],'authenticated','android');
  assert.equal(androidTip.environment,'sandbox');assert.equal(androidTip.amountMinor,99);
  assert.equal((await rpc(android,'select public.begin_creator_money_checkout($1,$2) value',[androidTip.id,randomUUID()],'authenticated','android')).startAuthorized,true);
  const nativeRoutes=await scalar("select private.read_creator_tip_route_costs_for_subject($1,$2,$3,299,'ios') value",[buyer.id,buyer.session,creator.id]);
  assert.equal(nativeRoutes.available,true);
  assert.deepEqual(nativeRoutes.routes.map(route=>route.provider),['app_store']);
  assert.equal(await scalar('select count(*)::int value from public.creator_payout_accounts where creator_user_id=$1',[creator.id]),0);
  for(const [platform,actor,intent] of [['ios',buyer,iosTip],['android',android,androidTip]]) {
   const fn=platform==='ios'?'process_revenuecat_app_store_event_atomic':'process_revenuecat_google_play_event_atomic';
   const result=await rpc(actor,`select public.${fn}($1,'NON_RENEWING_PURCHASE',$2,$3,'sandbox',now(),null,$4,'usd',repeat('b',64),$5,null) value`,
    [`synthetic-native-tip-${platform}`,actor.id,intent.providerProductId,intent.amountMinor,`synthetic-native-tip-original-${platform}`],'service_role',platform);
   assert.equal(result.status,'processed',JSON.stringify(result));
   const ledger=await scalar('select to_jsonb(l) value from public.money_access_ledger_events l where id=$1',[result.ledgerEventId]);
   assert.equal(ledger.environment,'sandbox');assert.equal(ledger.payable_state,'not_payable');
   assert.equal(ledger.amount_minor,intent.amountMinor);
   assert.equal(await scalar('select count(*)::int value from public.access_grants where provider_event_id=$1',[result.providerEventId]),0,'native tips never unlock access');
  }
  assert.equal((await rpc(buyer,'select public.get_creator_tip_amount_quote($1,300,null) value',[creator.id])).available,false);

  await db.query(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
   provider_account_type,provider_controller_type,provider_is_controller,provider_dashboard_type,provider_fees_payer,
   provider_fees_payer_raw,provider_losses_collector,provider_requirements_collection,provider_configuration_observed_at,
   provider_configuration_account_id,provider_configuration_status,provider_expected_configuration_key,
   charges_enabled,payouts_enabled,details_submitted,onboarding_status)
   values($1,'stripe_connect','test','acct_AutomaticSandbox','none','application',true,'express','platform','application',
   'platform','stripe',now(),'acct_AutomaticSandbox','match','stripe_connect_test_express_controller_v1',
   true,true,true,'ready_for_payouts')`,[creator.id]);
  const current=await rpc(creator,'select public.wave1_creator_eligibility_readback() value');
  assert.equal(current.state,'PENDING_VERIFICATION');
  assert.equal(current.taxComplete,null);assert.equal(current.sanctionsClear,null);
  assert.equal(current.canCreateMoneyExposure,false);
  assert.equal(await scalar('select public.wave1_creator_money_subject_authorized_internal($1) value',[creator.id]),false);
  const settings=await rpc(creator,"select to_jsonb(public.upsert_my_creator_tip_settings(true,array[100,300],300,100,1000,'usd')) value");
  assert.equal(settings.status,'active');
  const publicStatus=await rpc(buyer,'select public.get_creator_tip_public_status($1) value',[creator.id]);
  assert.equal(publicStatus.canTip,true);assert.equal(publicStatus.testMode,true);
  const qualify=async feature=>{
   const cap=await scalar(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
    platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
    provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values($1,$2,'acct_AutomaticSandbox','ios','apple_app_store','US','external_browser_checkout','usd','test','card',50,100000,
    'synthetic test fixture','synthetic test fixture',now(),now()+interval '2 hours',true) returning id value`,[feature,creator.id]);
   await db.query(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    values($1,$2,$3,'synthetic test fixture',now(),now()+interval '10 minutes')`,[cap,buyer.id,buyer.session]);
   return cap;
  };
  const tipCap=await qualify('creator_tip');
  const quote=await rpc(buyer,'select public.get_creator_tip_amount_quote($1,300,$2) value',[creator.id,tipCap]);
  assert.equal(quote.available,true,JSON.stringify(quote));
  assert.equal(quote.environment,'test');
  await seedSyntheticStrictCreatorProvider(db,creator,{environment:'production',providerAccountId:'acct_IndependentLive'});
  assert.equal(await scalar(`select a.provider_environment value from public.creator_payout_eligibility_records e
   join public.creator_payout_accounts a on a.id=e.payout_account_id where e.creator_user_id=$1`,[creator.id]),'live');
  const dualModeQuote=await rpc(buyer,'select public.get_creator_tip_amount_quote($1,300,$2) value',[creator.id,tipCap]);
  assert.equal(dualModeQuote.available,true,'canonical common live pointer cannot suppress independently ready test recipient');
  assert.equal(dualModeQuote.environment,'test');
  assert.equal(dualModeQuote.capabilityId,tipCap);
  const event=randomUUID();
  await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy,visibility)
   values($1,$2,'Automatic sandbox auction','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 2 hours',
   'America/New_York','none','public')`,[event,creator.id]);
  const sale=await rpc(creator,"select public.configure_paid_creator_event_sale($1,'Online admission',99,10,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day') value",[event]);
  assert.equal(await rpc(creator,"select public.read_creator_auction_creation_mode('event_auction') value"),'test');
  const auction=await rpc(creator,"select public.create_creator_event_auction($1,$2,100,25,now()+interval '1 hour',now()+interval '2 hours','test') value",[event,sale.termsRevisionId]);
  assert.equal(auction.environment,'test');
  await qualify('event_auction');
  const bid=await rpc(buyer,'select public.place_creator_event_auction_bid($1,100,$2,null) value',[auction.id,randomUUID()]);
  assert.equal(bid.isHighestBidder,true);
  await withCommerceActor(db,creator,()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
   values('AUTOMATIC-STAGE',$1,'live','open','open',true,'private')`,[creator.id]));
  const prepared=await rpc(creator,"select public.prepare_creator_room_seat_auction('AUTOMATIC-STAGE') value");
  const stage=await rpc(creator,"select public.create_creator_room_seat_auction('AUTOMATIC-STAGE','stage_reserved_seat',100,25,now()+interval '1 hour',now()+interval '2 hours','test',$1,$2) value",[randomUUID(),prepared.roomSessionId]);
  await qualify('room_seat_auction');
  assert.equal((await rpc(buyer,'select public.place_creator_room_seat_auction_bid($1,100,$2,null) value',[stage.id,randomUUID()])).isHighestBidder,true);
  assert.equal((await rpc(buyer,"select public.list_creator_room_seat_auctions('AUTOMATIC-STAGE') value")).length,1);
  await assert.rejects(()=>rpc(creator,"select public.create_creator_event_auction($1,$2,100,25,now()+interval '1 hour',now()+interval '2 hours','live') value",[event,sale.termsRevisionId]),/creator|eligibility|mode|authority/);
  await assertBuyerHasNoPremium(db,buyer);
  await assertBuyerHasNoPremium(db,android);
  assert.equal(await scalar("select count(*)::int value from public.sandbox_monetization_testers where user_id in($1,$2)",[creator.id,buyer.id]),0);
  for(const change of ["provider_eligible=false","tax_complete=false","sanctions_clear=false"]) {
   await db.exec('begin');
   try {
    await db.query(`update public.wave1_creator_eligibility set ${change} where creator_user_id=$1`,[creator.id]);
    assert.equal(await scalar("select private.ordinary_creator_subject_for_mode($1,'sandbox') value",[creator.id]),false,change);
    assert.equal(await scalar("select private.creator_tip_native_sandbox_available($1,'ios') value",[creator.id]),false,change);
   }finally{await db.exec('rollback');}
  }
  for(const key of ['live_money_enabled','payouts_enabled','cashout_enabled']) {
   await db.exec('begin');
   try {
    await db.exec(`set local request.jwt.claim.role='service_role';set local request.jwt.claims='{"role":"service_role"}'`);
    await db.query("update public.platform_money_kill_switches set state='on' where key=$1",[key]);
    assert.equal(await scalar("select private.creator_tip_native_sandbox_available($1,'ios') value",[creator.id]),false,key);
    assert.equal(await scalar("select private.creator_tip_native_sandbox_available($1,'android') value",[creator.id]),false,key);
   }finally{await db.exec('rollback');}
  }
  assert.equal(await scalar('select count(*)::int value from public.money_access_ledger_events where creator_id=$1 and payable_state in (\'payable\',\'paid\')',[creator.id]),0);
  await db.query("update public.creator_payout_accounts set charges_enabled=false where creator_user_id=$1 and provider_environment='test'",[creator.id]);
  assert.equal((await rpc(buyer,'select public.get_creator_tip_amount_quote($1,300,$2) value',[creator.id,tipCap])).available,false,'actual test provider readiness stays mandatory');
 }finally{await db.close();}
});
