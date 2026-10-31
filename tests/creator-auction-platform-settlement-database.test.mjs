import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('platform auction contracts keep exact receipts and 80/20 earnings held without transfers', {timeout:180000}, async()=>{
  const realDateNow=Date.now;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const rows=async s=>(await db.query(s)).rows;
    const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const events=Object.fromEntries((await rows('select * from event_reservation_fixture.events')).map(a=>[a.name,a.id]));
    const lit=x=>`'${String(x).replaceAll("'","''")}'`;
    const rpc=async(actor,expression,role='authenticated')=>{
      const a=actors[actor];
      try {const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
        set local request.headers='{"x-chillywood-platform":"ios"}'; select ${expression} result;commit;`);
        return r.flatMap(x=>x.rows).at(-1).result;
      }catch(e){await db.exec('rollback');throw e;}
    };
    const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('event_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
        'synthetic test only','synthetic test only',now(),now()+interval '2 hours',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic test only',now(),now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,
      provider_product_id,environment,status,is_android_digital,is_physical_good)
      values('auction_fixture_only','event_pass','Synthetic auction event','stripe_event_auction','prod_AuctionFixture',
        'sandbox','sandbox',false,false) returning id`))[0].id;
    await db.exec(`insert into private.creator_event_auction_product_bindings values('${cap}','${product}','synthetic test only',now())`);

    const configure = async(name,buyer='buyer1')=>{
      const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${events[name]}','Virtual show',99,1,'sandbox',
        'America/New_York',now()-interval '1 hour',least(now()+interval '1 day',(select starts_at from public.creator_events where id='${events[name]}')))`);
      const auction=await rpc('creator',`public.create_creator_event_auction('${events[name]}','${offer.termsRevisionId}',237,1,
        clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test')`);
      await rpc(buyer,`public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
      await new Promise(r=>setTimeout(r,650));
      const quote=await rpc(buyer,`public.create_creator_event_auction_award_quote('${auction.id}',null)`);
      const attempt=randomUUID();
      return {auction,quote,attempt,buyer,call:`public.prepare_creator_event_auction_platform_checkout('${quote.id}','${actors[buyer].user_id}','${actors[buyer].session_id}','${attempt}')`};
    };
    const s=await configure('show1');
    await assert.rejects(()=>rpc('buyer1',s.call),/permission denied/);
    await assert.rejects(()=>rpc('buyer1',s.call,'service_role'),/platform_qualification_required/);
    assert.equal((await rows(`select checkout_started_at from private.creator_event_auction_quotes where id='${s.quote.id}'`))[0].checkout_started_at,null);
    await db.exec(`insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,
      product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
      values('${cap}','acct_platform','acct_fixture','${product}','prod_AuctionFixture','synthetic platform-owned product verification','active',true,now(),now()+interval '10 minutes')`);
    const claim=await rpc('buyer1',s.call,'service_role');
    assert.equal(claim.providerAccountId,'acct_platform');assert.equal(claim.recipientAccountId,'acct_fixture');
    assert.equal(claim.chargePattern,'platform_separate_transfer');assert.equal(claim.financialAuthority,false);
    assert.equal((await rpc('buyer1',s.call,'service_role')).startAuthorized,false);
    assert.equal((await rows("select count(*) n from private.auction_platform_settlement_contracts"))[0].n,1);
    const bind=(account='acct_platform')=>rpc('buyer1',`public.bind_creator_event_auction_checkout('${s.quote.id}','${s.attempt}',
      'cs_test_Platform','pi_Platform','${account}',237,'usd')`,'service_role');
    await assert.rejects(()=>bind('acct_fixture'),/checkout_response_mismatch/);await bind();
    const recover=`public.recover_creator_event_auction_platform_checkout('${s.quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${s.attempt}')`;
    assert.equal((await rpc('buyer1',recover,'service_role')).providerCheckoutSessionId,'cs_test_Platform');
    const evidence={eventId:'evt_Platform',eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),
      accountId:'acct_platform',environment:'test',objectId:'cs_test_Platform',paymentIntentId:'pi_Platform',
      checkoutSessionId:'cs_test_Platform',quoteId:s.quote.id,buyerId:actors.buyer1.user_id,
      creatorId:actors.creator.user_id,auctionId:s.auction.id,amountMinor:237,currency:'usd',
      outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_AuctionFixture',
      settlementContractId:claim.settlementContractId,settlementPolicy:claim.settlementPolicy};
    const receive=e=>rpc('buyer1',`public.process_stripe_event_auction_receipt(${lit(JSON.stringify(e))}::jsonb,
      '${createHash('sha256').update(JSON.stringify(e)).digest('hex')}')`,'service_role');
    assert.equal((await receive({...evidence,eventId:'evt_Wrong',accountId:'acct_fixture'})).status,'reconciliation_required');
    assert.equal((await receive(evidence)).status,'fulfilled');
    assert.equal((await receive({...evidence,eventId:'evt_WrongContract',settlementContractId:randomUUID()})).status,'reconciliation_required');
    assert.equal((await rpc('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,true);
    const facts={account_id:'acct_platform',environment:'test',currency:'usd',charge_id:'ch_Platform',
      payment_intent_id:'pi_Platform',balance_id:'txn_Platform',balance_status:'available',disputed:false,
      financial_authority:false,gross_minor:237,provider_fee_minor:37,tax_minor:0,store_fee_minor:0,
      refunded_minor:0,refund_net_minor:0,tax_reversal_minor:0,refunds:[]};
    const observe=(patch={})=>rpc('buyer1',`public.record_auction_platform_cost_observation('${claim.settlementContractId}',
      ${lit(JSON.stringify({...facts,...patch}))}::jsonb)`,'service_role');
    const plan=()=>rpc('buyer1',`public.prepare_auction_held_transfer_plan('${claim.settlementContractId}')`,'service_role');
    assert.equal((await plan()).status,'unqualified');
    const unknown=await observe({tax_minor:null,store_fee_minor:null});
    assert.equal(unknown.netMinor,null);assert.equal(unknown.creatorMinor,null);
    assert.ok(unknown.holdReasons.includes('tax_unverified'));assert.ok(unknown.holdReasons.includes('store_obligation_unverified'));
    assert.equal((await plan()).status,'unqualified');
    const allocation=await observe();
    assert.equal(allocation.netMinor,200);assert.equal(allocation.platformMinor,40);assert.equal(allocation.creatorMinor,160);
    assert.equal(allocation.status,'held');assert.equal(allocation.financialAuthority,false);assert.equal(allocation.transferCreated,false);
    for(const hold of ['sandbox_not_payable','fulfillment_clearance_unqualified','adjustments_unqualified'])
      assert.ok(allocation.holdReasons.includes(hold));
    assert.equal((await observe()).status,'duplicate');
    const planned=await plan();assert.equal(planned.status,'held');assert.equal(planned.transferCreated,false);
    assert.equal((await plan()).planId,planned.planId);
    const stored=(await rows('select * from private.auction_transfer_plans'))[0];
    assert.equal(stored.source_charge_id,'ch_Platform');assert.equal(stored.recipient_account_id,'acct_fixture');
    assert.equal(Number(stored.amount_minor),160);assert.equal(stored.financial_authority,false);
    assert.equal((await rpc('buyer1',`public.reserve_auction_test_transfer('${claim.settlementContractId}')`,'service_role')).status,'held');
    for(const role of ['anon','authenticated']){
      await assert.rejects(()=>rpc('buyer1',`public.reserve_auction_test_transfer('${claim.settlementContractId}')`,role),/permission denied/);
    }
    for(const patch of [{account_id:'acct_fixture'},{gross_minor:238},{provider_fee_minor:-1},{charge_id:'ch_Changed'},
      {payment_intent_id:'pi_Wrong'},{financial_authority:true},{refunded_minor:238},{tax_minor:-1},{tax_minor:1},{store_fee_minor:1},
      {refunded_minor:100,refund_net_minor:0}]){
      await assert.rejects(()=>observe(patch));
    }
    for(const role of ['anon','authenticated','service_role']){
      for(const table of ['auction_platform_qualifications','auction_platform_settlement_contracts','auction_settlement_observations','auction_held_net_allocations','auction_transfer_plans']){
        try{await assert.rejects(()=>db.exec(`begin;set local role ${role};select * from private.${table};commit`),/permission denied/);}
        finally{await db.exec('rollback');}
      }
    }
    await db.exec(`update private.auction_platform_qualifications set revoked_at=clock_timestamp() where capability_id='${cap}'`);
    await assert.rejects(()=>rpc('buyer1',recover,'service_role'),/platform_qualification_required/);
    const refund={...evidence,eventId:'evt_PlatformRefund',eventType:'charge.refunded',objectId:'ch_Platform',
      checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:100};
    assert.equal((await receive(refund)).status,'refunded','revoked new-sale qualification never suppresses historical refunds');
    assert.equal((await rpc('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,false);
    const after=await observe({refunded_minor:100,refund_net_minor:-100,tax_reversal_minor:0,
      refunds:[{id:'re_Partial',balance_id:'txn_Refund',amount:100,fee:0,net:-100,status:'available'}]});
    assert.equal(after.status,'held');assert.equal(after.netMinor,null,'revoked payment stays reconciliation, not payable');
    assert.equal((await plan()).status,'reconciliation_required','old plan cannot be silently reused after refund');
    await assert.rejects(()=>observe(),/stale_or_changed|behind_payment_evidence/);
    await assert.rejects(()=>db.exec("update private.auction_transfer_plans set state='dispatched'"),/immutable|check constraint/);
    assert.equal((await rows("select count(*) n from private.auction_transfer_plans where financial_authority"))[0].n,0);
    const legacy=await configure('show2','buyer2');
    await rpc('buyer2',legacy.call.replace('prepare_creator_event_auction_platform_checkout','prepare_creator_event_auction_checkout'),'service_role');
    await assert.rejects(()=>rpc('buyer2',legacy.call,'service_role'),/legacy_auction_reconciliation_only/);
  } finally {Date.now=realDateNow;await db.close();}
});
