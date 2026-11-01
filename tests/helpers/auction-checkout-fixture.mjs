import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './database-runtime-authority-fixture.mjs';

// Synthetic disposable full-schema fixture. No external provider or hosted writes.
export async function withQualifiedAuctionFixture({mode='live',lane='event',sourceKind='stage_reserved_seat'}={},use=async()=>{}) {
 const rawMode=mode==='live'?'production':'sandbox';
 const feature=lane==='event'?'event_auction':'room_seat_auction';
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const lit=x=>`'${String(x).replaceAll("'","''")}'`;
 try{
  await db.exec(fs.readFileSync(new URL('../fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
  // Disposable local fixture only; never a credential, provider account or launch approval.
  let recipientFixture=fs.readFileSync(new URL('../fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8');
  if(mode==='live'){
   const observation={accountId:'acct_fixture',environment:'live',platformAccountId:'acct_platform',modeVerified:true,
    v2Dashboard:'express',v2FeesCollector:'application',v2LossesCollector:'application',source:'authenticated_stripe_get_v1_v2',
    pendingVerification:[],requirementsComplete:true,recipientTransfers:'active',payoutSchedule:'manual'};
   recipientFixture=recipientFixture.replaceAll("'test'","'live'")
    .replaceAll('stripe_connect_test_express_controller_v1','stripe_connect_live_express_recipient_controller_v1')
    .replace('charges_enabled,payouts_enabled,details_submitted,onboarding_status)',
     'charges_enabled,payouts_enabled,details_submitted,onboarding_status,country,default_currency,provider_live_observation)')
    .replace("true,true,true,'ready_for_payouts'",`true,true,true,'ready_for_payouts','US','usd',${lit(JSON.stringify(observation))}::jsonb`);
  }
  await db.exec(recipientFixture);
  await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
  const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
  const event=(await rows("select id from event_reservation_fixture.events where name='show1'"))[0].id;
  const rpc=async(actor,expression,role='authenticated')=>{
   const a=actors[actor];try{
    const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
     set local request.headers='{"x-chillywood-platform":"ios"}';select ${expression} result;commit;`);
    return r.flatMap(x=>x.rows).at(-1).result;
   }catch(e){await db.exec('rollback');throw e;}
  };
  assert.equal((await rows("select private.auction_checkout_mode_allowed('live') allowed"))[0].allowed,false);
  const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,
   route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
   values('${feature}',$1,'acct_fixture','ios','apple_app_store','US','external_browser_checkout','usd','${mode}','card',50,100000,
    'SYNTHETIC provider bounds','SYNTHETIC route approval',now(),now()+interval '2 hours',true) returning id`,[actors.creator.user_id]))[0].id;
  await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
   values('${cap}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','SYNTHETIC exact session',now(),now()+interval '10 minutes')`);
  const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,provider_product_id,environment,status,is_android_digital,is_physical_good,metadata)
   values('live_auction_fixture','${lane==='event'?'event_pass':'room_seat_pass'}','Synthetic live-mode auction','stripe_${lane}_auction','prod_LiveFixture','${rawMode}','${mode==='live'?'active':'sandbox'}',false,false,'{"provider_proof":true,"live_money_enabled_at_activation":true,"evidence":"SYNTHETIC DISPOSABLE LOCAL TEST ONLY"}') returning id`))[0].id;
  await db.exec(`insert into private.creator_${lane}_auction_product_bindings values('${cap}','${product}','SYNTHETIC product',now());
   insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,evidence_reference,recipient_transfer_capability,environment,enabled,verified_at,expires_at)
   values('${cap}','acct_platform','acct_fixture','${product}','prod_LiveFixture','SYNTHETIC platform ownership','active','${mode}',true,now(),now()+interval '10 minutes');`);
  // Turn on only synthetic disposable database controls to exercise the dormant
  // positive path. No hosted database, provider or real-money operation is used.
  if(mode==='live') await db.exec(`begin; set local request.jwt.claim.role='service_role'; update public.platform_money_kill_switches set state='on',reason='SYNTHETIC LOCAL TEST ONLY'
   where key in('live_money_enabled','provider_webhooks_enabled','digital_sales_enabled','creator_monetization_enabled','stripe_connect_enabled'); commit;`);
  let auction,quote;
  if(lane==='event'){
   const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${event}','Virtual show',99,1,'sandbox',
    'America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
   assert.equal(await rpc('creator',`public.read_creator_auction_creation_mode('event_auction')`),mode);
   await assert.rejects(rpc('creator',`public.create_creator_event_auction('${event}','${randomUUID()}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','${mode}')`),/revision_required/);
   await assert.rejects(rpc('buyer1',`public.create_creator_event_auction('${event}','${offer.termsRevisionId}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','${mode}')`));
   if(mode==='live'){
    await db.exec(`update private.auction_platform_qualifications set revoked_at=now() where capability_id='${cap}'`);
    await assert.rejects(rpc('creator',`public.create_creator_event_auction('${event}','${offer.termsRevisionId}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','live')`),/mode_unavailable/);
    assert.equal((await rows(`select status from public.paid_creator_events where creator_event_id='${event}'`))[0].status,'sandbox','failed live review cannot promote source');
    await db.exec(`insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,product_id,platform_product_id,
     evidence_reference,recipient_transfer_capability,environment,enabled,verified_at,expires_at)
     values('${cap}','acct_platform','acct_fixture','${product}','prod_LiveFixture','SYNTHETIC fresh qualification after revocation','active','live',true,clock_timestamp(),clock_timestamp()+interval '10 minutes')`);
    await db.exec("update public.platform_money_kill_switches set state='off' where key='stripe_connect_enabled'");
    await assert.rejects(rpc('creator',`public.create_creator_event_auction('${event}','${offer.termsRevisionId}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','live')`),/mode_unavailable/);
    await db.exec("begin;set local request.jwt.claim.role='service_role';update public.platform_money_kill_switches set state='on' where key='stripe_connect_enabled';commit;");
   }
   auction=await rpc('creator',`public.create_creator_event_auction('${event}','${offer.termsRevisionId}',237,1,clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','${mode}')`);
   assert.equal((await rows(`select provider,status from public.paid_creator_events where creator_event_id='${event}'`))[0].provider,mode==='live'?'stripe_event_auction':'revenuecat_google_play');
   await rpc('buyer1',`public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
   await new Promise(r=>setTimeout(r,650));
   quote=await rpc('buyer1',`public.create_creator_event_auction_award_quote('${auction.id}',null)`);
  }else{
   if(sourceKind==='party_admission'){
    await db.exec("insert into public.titles(id,title,video_url,is_published,status) values('12121212-1212-4212-8212-121212121212','Synthetic room title','https://fixture.invalid/title.mp4',true,'published')");
    await db.exec(`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
     values('LIVE-AUCTION-FIXTURE','12121212-1212-4212-8212-121212121212','${actors.creator.user_id}','title','open','party_pass',true,'private')`);
    await rpc('creator',`public.set_paid_watch_party_offer('LIVE-AUCTION-FIXTURE','Limited admission',99,1,'sandbox')`);
   }else await db.exec(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
    values('LIVE-AUCTION-FIXTURE','${actors.creator.user_id}','live','open','open',true,'private')`);
   const setup=await rpc('creator',`public.prepare_creator_room_seat_auction('LIVE-AUCTION-FIXTURE')`);
   if(mode==='live'&&sourceKind==='party_admission'){
    await assert.rejects(rpc('creator',`public.create_creator_room_seat_auction('LIVE-AUCTION-FIXTURE','party_admission',237,1,
     clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','live','${randomUUID()}','${randomUUID()}')`),/room_session_changed/);
    assert.equal((await rows("select status from public.paid_watch_party_offers where party_id='LIVE-AUCTION-FIXTURE'"))[0].status,'sandbox');
   }
   auction=await rpc('creator',`public.create_creator_room_seat_auction('LIVE-AUCTION-FIXTURE','${sourceKind}',237,1,
    clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','${mode}','${randomUUID()}','${setup.roomSessionId}')`);
   if(sourceKind==='party_admission'){
    const original=(await rows("select status,provider,price_cents,seat_limit from public.paid_watch_party_offers where party_id='LIVE-AUCTION-FIXTURE'"))[0];
    assert.equal(original.provider,mode==='live'?'stripe_room_auction':'revenuecat_google_play');
    assert.equal(original.price_cents,99);assert.equal(original.seat_limit,1);
   }
   await rpc('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
   await new Promise(r=>setTimeout(r,650));
   quote=await rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${auction.id}',null)`);
  }
  const attempt=randomUUID();
  const args=`'${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${attempt}'`;
  if(mode==='live') await assert.rejects(rpc('buyer1',`public.prepare_creator_${lane}_auction_checkout(${args})`,'service_role'),/live_platform_admission_required/);
  await assert.rejects(rpc('buyer1',`public.prepare_creator_${lane}_auction_platform_checkout(${args})`,'service_role'),/tax_qualification_required/);
  assert.equal((await rows(`select checkout_started_at from private.creator_${lane}_auction_quotes where id='${quote.id}'`))[0].checkout_started_at,null);
  await db.exec(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,professional_basis_reference,
   coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,registration_evidence_reference,
   provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('${lane}_auction','prod_LiveFixture','acct_platform','${mode}','worldwide','all_supported_platforms','SYNTHETIC scope','SYNTHETIC coverage',true,
   'automatic','self','txcd_99999999','inclusive','SYNTHETIC registration','SYNTHETIC provider settings','SYNTHETIC product',now(),now()+interval '1 hour',now()+interval '1 hour',true);`);
  const context=await rpc('buyer1',`public.get_auction_checkout_provider_context('${lane}','${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}')`,'service_role');
  assert.equal(context.environment,mode);assert.equal(context.platformAccountId,'acct_platform');
  const claim=await rpc('buyer1',`public.prepare_creator_${lane}_auction_platform_checkout(${args})`,'service_role');
  assert.equal(claim.startAuthorized,true);assert.equal(claim.environment,mode);
  assert.equal((await rows('select count(*)::int n from private.auction_live_checkout_admissions'))[0].n,0);
  if(mode==='live') await assert.rejects(db.exec(`insert into public.money_purchase_intents
   select (jsonb_populate_record(null::public.money_purchase_intents,to_jsonb(i)||jsonb_build_object('id','${randomUUID()}','idempotency_key','forged-${randomUUID()}','checkout_attempt_id','${randomUUID()}'))).*
   from public.money_purchase_intents i where id='${claim.purchaseIntentId}'`),/auction|authority|terms|qualified|intent|permission/i,
   'a production-shaped intent is not authority without the private exact award admission');
  await assert.rejects(rpc('buyer1',`public.bind_creator_${lane}_auction_checkout('${quote.id}','${attempt}','cs_${mode==='live'?'test':'live'}_Wrong',null,'acct_platform',237,'usd')`,'service_role'),/response_mismatch/);
  await rpc('buyer1',`public.bind_creator_${lane}_auction_checkout('${quote.id}','${attempt}','cs_${mode}_Fixture','pi_LiveFixture','acct_platform',237,'usd')`,'service_role');
  const evidence={eventId:'evt_LiveFixture',eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),accountId:'acct_platform',environment:mode,
   objectId:`cs_${mode}_Fixture`,paymentIntentId:'pi_LiveFixture',checkoutSessionId:`cs_${mode}_Fixture`,quoteId:quote.id,buyerId:actors.buyer1.user_id,
   creatorId:actors.creator.user_id,auctionId:auction.id,amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_LiveFixture',
   settlementContractId:claim.settlementContractId,settlementPolicy:claim.settlementPolicy};
  const receive=e=>rpc('buyer1',`public.process_stripe_${lane}_auction_receipt(${lit(JSON.stringify(e))}::jsonb,'${createHash('sha256').update(JSON.stringify(e)).digest('hex')}')`,'service_role');
  assert.equal((await receive(evidence)).status,'fulfilled');
  assert.equal((await rows(`select status from public.access_grants where provider='stripe_${lane}_auction'`))[0].status,mode==='live'?'active':'sandbox_only');
  assert.equal((await rows(`select status from public.money_access_ledger_events where source_type='${lane==='event'?'event':'room_seat_auction'}'`))[0].status,mode==='live'?'verified':'sandbox_only');
  assert.equal((await rows('select count(*)::int n from private.auction_transfer_operations'))[0].n,0);
  assert.equal((await rows('select count(*)::int n from public.creator_earnings_ledger'))[0].n,0);
  return await use({db,rows,rpc,actors,contractId:claim.settlementContractId,quote,auction,claim,evidence,receive,cap,product});
 }finally{await db.close();}
}
