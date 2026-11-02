import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Existing external-auction qualification and provider deliveries are synthetic
// inputs to the actual current checkout/receipt processors. No storefront,
// product, financial provider or live switch is changed outside this database.
test('fulfilled event and room test-platform auction receipts enter sandbox cashout only with exact immutable bindings',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const rows=async sql=>(await db.query(sql)).rows;
 try{
  await db.exec(fs.readFileSync(new URL('../fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
  await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events); update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled'); update public.platform_money_kill_switches set state='sandbox_only' where key='stripe_connect_enabled'; update private.sandbox_cashout_control set enabled=true");
  const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
  const eventId=await one("select id from event_reservation_fixture.events where name='show1'");
  const lit=x=>`'${String(x).replaceAll("'","''")}'`;
  const rpc=async(actor,expression,role='authenticated')=>{
   const a=actors[actor];try{
    const result=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
     set local request.headers='{"x-chillywood-platform":"ios"}';select ${expression} result;commit;`);
    return result.flatMap(x=>x.rows).at(-1).result;
   }catch(error){await db.exec('rollback');throw error;}
  };
  const qualify=async(platform='acct_platform',recipient='acct_fixture')=>one(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values($1,$2,$3,'ba_sandboxAuctionDestination','scheduled','card',0,0,'SYNTHETIC-AUCTION-80-20',0,2000,0,0,
   true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 hour') returning id`,[actors.creator.user_id,platform,recipient]);
  const wrongPlatform=await qualify('acct_otherPlatform'),wrongRecipient=await qualify('acct_platform','acct_otherRecipient');
  const qualification=await qualify();
  const receipts=[];
  for(const lane of ['event','room']){
   const feature=lane==='event'?'event_auction':'room_seat_auction',sku=`prod_Auction${lane}`;
   const capability=await one(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
    platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
    provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
    values($1,$2,'acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
    'SYNTHETIC TEST ONLY','SYNTHETIC TEST ONLY',now(),now()+interval '2 hours',true) returning id`,[feature,actors.creator.user_id]);
   await db.query(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
    values($1,$2,$3,'SYNTHETIC TEST ONLY',now(),now()+interval '10 minutes')`,[capability,actors.buyer1.user_id,actors.buyer1.session_id]);
   const product=await one(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,
    environment,status,is_android_digital,is_physical_good) values($1,$2,'Synthetic auction',$3,$4,'sandbox','sandbox',false,false) returning id`,
    [`sandbox_cashout_auction_${lane}`,lane==='event'?'event_pass':'room_seat_pass',`stripe_${lane}_auction`,sku]);
   await db.query(`insert into private.creator_${lane}_auction_product_bindings values($1,$2,'SYNTHETIC TEST ONLY',now())`,[capability,product]);
   await db.query(`insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,product_id,
    platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
    values($1,'acct_platform','acct_fixture',$2,$3,'SYNTHETIC TEST ONLY','active',true,now(),now()+interval '10 minutes')`,[capability,product,sku]);
   await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
    professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
    registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
    values($1,$2,'acct_platform','test','worldwide','all_supported_platforms','SYNTHETIC ONLY','SYNTHETIC ONLY',true,'automatic','self',
    'txcd_99999999','inclusive','SYNTHETIC ONLY','SYNTHETIC ONLY','SYNTHETIC ONLY',now(),now()+interval '1 hour',now()+interval '1 hour',true)`,[`${lane}_auction`,sku]);
   let auction;
   if(lane==='event'){
    const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${eventId}','Sandbox show',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
    auction=await rpc('creator',`public.create_creator_event_auction('${eventId}','${offer.termsRevisionId}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test')`);
    await rpc('buyer1',`public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
   }else{
    await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility) values('SANDBOX-AUCTION-CASHOUT',$1,'live','open','open',true,'private')",[actors.creator.user_id]);
    const setup=await rpc('creator',"public.prepare_creator_room_seat_auction('SANDBOX-AUCTION-CASHOUT')");
    auction=await rpc('creator',`public.create_creator_room_seat_auction('SANDBOX-AUCTION-CASHOUT','stage_reserved_seat',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test','${randomUUID()}','${setup.roomSessionId}')`);
    await rpc('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
   }
   await new Promise(resolve=>setTimeout(resolve,650));
   const quote=await rpc('buyer1',`public.create_creator_${lane==='event'?'event_auction':'room_seat_auction'}_award_quote('${auction.id}',null)`);
   const attempt=randomUUID();
   const checkout=await rpc('buyer1',`public.prepare_creator_${lane}_auction_platform_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${attempt}')`,'service_role');
   assert.equal(checkout.startAuthorized,true);
   await rpc('buyer1',`public.bind_creator_${lane}_auction_checkout('${quote.id}','${attempt}','cs_test_Auction${lane}','pi_Auction${lane}','acct_platform',237,'usd')`,'service_role');
   const evidence={eventId:`evt_Auction${lane}`,eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),accountId:'acct_platform',environment:'test',
    objectId:`cs_test_Auction${lane}`,paymentIntentId:`pi_Auction${lane}`,checkoutSessionId:`cs_test_Auction${lane}`,quoteId:quote.id,
    buyerId:actors.buyer1.user_id,creatorId:actors.creator.user_id,auctionId:auction.id,amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,
    providerProductId:sku,settlementContractId:checkout.settlementContractId,settlementPolicy:checkout.settlementPolicy};
   const receive=e=>rpc('buyer1',`public.process_stripe_${lane}_auction_receipt(${lit(JSON.stringify(e))}::jsonb,'${createHash('sha256').update(JSON.stringify(e)).digest('hex')}')`,'service_role');
   assert.equal((await receive({...evidence,eventId:`evt_WrongAccount${lane}`,accountId:'acct_other'})).status,'reconciliation_required');
   assert.equal((await receive({...evidence,eventId:`evt_WrongMode${lane}`,environment:'live'})).status,'reconciliation_required');
   assert.equal((await receive(evidence)).status,'fulfilled');
   const ledger=await one(`select ledger_event_id from private.creator_${lane}_auction_receipts where provider_event_id=$1`,[evidence.eventId]);
   assert.equal((await one('select private.sandbox_cashout_source($1,$2)',[ledger,qualification]))?.netMinor,189,'actual canonical receipt supplies explicitly simulated 80/20 source');
   assert.equal(await one('select private.sandbox_cashout_source($1,$2)',[ledger,wrongPlatform]),null);
   assert.equal(await one('select private.sandbox_cashout_source($1,$2)',[ledger,wrongRecipient]),null);
   assert.equal((await receive(evidence)).duplicate,true);
   assert.equal((await receive({...evidence,eventId:`evt_SecondPaid${lane}`})).duplicate,true,'another provider event for the same payment is not a second earning');
   assert.equal(await one(`select count(*)::int from public.money_access_ledger_events where provider_event_id in(select id from public.provider_events where provider=$1)`,[`stripe_${lane}_auction`]),1);
   receipts.push({lane,ledger,evidence,receive});
  }
  assert.equal((await rpc('creator',"public.preview_sandbox_creator_cashout(378,'scheduled')")).ready,true);
  for(const {lane,ledger,evidence,receive} of receipts){
   const refund={...evidence,eventId:`evt_AuctionRefund${lane}`,eventType:'charge.refunded',objectId:`ch_Auction${lane}`,checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:100};
   assert.equal((await receive(refund)).status,'refunded');
   assert.equal(await one('select private.sandbox_cashout_source($1,$2)',[ledger,qualification]),null,'canonical partial refund invalidates original source');
  }
  assert.equal((await rpc('creator',"public.preview_sandbox_creator_cashout(1,'scheduled')")).reason,'sandbox_earnings_insufficient');
  assert.equal(await one("select count(*)::int from public.money_access_ledger_events where payable_state in ('payable','paid')"),0);
  assert.equal(await one('select count(*)::int from private.creator_cashout_executions'),0);
 }finally{await db.close();}
});
