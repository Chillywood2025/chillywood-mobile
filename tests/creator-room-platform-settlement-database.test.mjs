import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('platform room-auction receipt preserves reserved seat and rejects direct-account payment', {timeout:180000}, async()=>{
  const realDateNow=Date.now;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const rows=async s=>(await db.query(s)).rows;
    const bindBody=(await rows("select pg_get_functiondef('public.bind_creator_room_auction_checkout(uuid,uuid,text,text,text,integer,text)'::regprocedure) body"))[0].body;
    const roomLock=bindBody.indexOf('perform private.lock_creator_room_inventory(a.party_id)');
    const auctionLock=bindBody.indexOf('perform 1 from private.creator_room_seat_auctions where id=a.id for update');
    const quoteLock=bindBody.indexOf('select * into q from private.creator_room_auction_quotes where id=p_quote_id for update');
    assert.ok(roomLock>=0&&auctionLock>roomLock&&quoteLock>auctionLock,'installed binder follows room → auction → quote lock order');
    const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const lit=x=>`'${String(x).replaceAll("'","''")}'`;
    const rpc=async(actor,expression,role='authenticated',platform='ios')=>{
      const a=actors[actor];
      try {const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
        set local request.headers=${lit(JSON.stringify({'x-chillywood-platform':platform}))}; select ${expression} result;commit;`);
        return r.flatMap(x=>x.rows).at(-1).result;
      }catch(e){await db.exec('rollback');throw e;}
    };
    const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('room_seat_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
        'synthetic test only','synthetic test only',now(),now()+interval '2 hours',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic test only',now(),now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,
      provider_product_id,environment,status,is_android_digital,is_physical_good)
      values('auction_fixture_only','room_seat_pass','Synthetic auction event','stripe_room_auction','prod_AuctionFixture',
        'sandbox','sandbox',false,false) returning id`))[0].id;
    await db.exec(`insert into private.creator_room_auction_product_bindings values('${cap}','${product}','synthetic test only',now())`);
    await db.exec(`insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,
      product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
      values('${cap}','acct_platform','acct_fixture','${product}','prod_AuctionFixture','synthetic platform product','active',true,now(),now()+interval '10 minutes')`);
    const prepare=async(name,buyer='buyer1',platform='ios')=>{
      await db.exec(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
       values('PAYMENT-${name}','${actors.creator.user_id}','live','open','open',true,'private')`);
      const setup=await rpc('creator',`public.prepare_creator_room_seat_auction('PAYMENT-${name}')`);
      const auction=await rpc('creator',`public.create_creator_room_seat_auction('PAYMENT-${name}','stage_reserved_seat',237,1,
        clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test','${randomUUID()}','${setup.roomSessionId}')`);
      const token='synthetic-room-native-'+randomUUID();
      if(platform==='android') await rpc(buyer,`public.admit_google_play_external_session('room_seat_auction',
        '${actors.creator.user_id}',237,'${auction.id}','${token}',1)`,'authenticated',platform);
      await rpc(buyer,`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`,'authenticated',platform);
      await new Promise(r=>setTimeout(r,650));
      const quote=await rpc(buyer,`public.create_creator_room_seat_auction_award_quote('${auction.id}',null)`,'authenticated',platform);
      const attempt=randomUUID();
      const call=`public.prepare_creator_room_auction_platform_checkout('${quote.id}','${actors[buyer].user_id}','${actors[buyer].session_id}','${attempt}')`;
      await assert.rejects(()=>rpc(buyer,call),/permission denied/);
      const claim=await rpc(buyer,call,'service_role',platform);
      assert.equal(claim.startAuthorized,true);
      assert.equal((await rpc(buyer,call,'service_role')).startAuthorized,false,'lost dispatch response never authorizes a second call');
      return {auction,quote,claim,buyer,name,token};
    };
    const evidence=(s,suffix,extra={})=>({eventId:`evt_${suffix}`,eventType:'checkout.session.completed',
      occurredAt:new Date(Date.now()).toISOString(),accountId:'acct_platform',environment:'test',objectId:`cs_test_${suffix}`,
      paymentIntentId:`pi_${suffix}`,checkoutSessionId:`cs_test_${suffix}`,quoteId:s.quote.id,
      buyerId:actors[s.buyer].user_id,creatorId:actors.creator.user_id,auctionId:s.auction.id,
      amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_AuctionFixture',
      settlementContractId:s.claim.settlementContractId,settlementPolicy:s.claim.settlementPolicy,...extra});
    const receive=(e,hash=createHash('sha256').update(JSON.stringify(e)).digest('hex'))=>rpc('buyer1',
      `public.process_stripe_room_auction_receipt(${lit(JSON.stringify(e))}::jsonb,'${hash}')`,'service_role');
    const count=async(table,where='true')=>Number((await rows(`select count(*) n from ${table} where ${where}`))[0].n);
    const s=await prepare('ONE');
    assert.equal(s.claim.providerAccountId,'acct_platform');assert.equal(s.claim.recipientAccountId,'acct_fixture');
    const good=evidence(s,'Platform');
    await rpc('buyer1',`public.bind_creator_room_auction_checkout('${s.quote.id}','${s.claim.checkoutAttemptId}',
      'cs_test_Platform','pi_Platform','acct_platform',237,'usd')`,'service_role');
    assert.equal((await receive({...good,eventId:'evt_WrongOwner',accountId:'acct_fixture'})).status,'reconciliation_required');
    assert.equal(await count('public.access_grants'),0);
    assert.equal((await receive(good)).status,'fulfilled');
    assert.equal(await count('public.access_grants'),1);
    assert.equal((await rows(`select private.creator_room_seat_payment_verified('${s.claim.claimId}') ok`))[0].ok,true);
    const contract=s.claim.settlementContractId;
    const facts={account_id:'acct_platform',environment:'test',currency:'usd',charge_id:'ch_Platform',payment_intent_id:'pi_Platform',
      balance_id:'txn_Platform',balance_status:'available',disputed:false,financial_authority:false,gross_minor:237,provider_fee_minor:37,
      tax_minor:0,store_fee_minor:0,refunded_minor:0,refund_net_minor:0,tax_reversal_minor:0,refunds:[]};
    await rpc('buyer1',`public.record_auction_platform_cost_observation('${contract}',${lit(JSON.stringify(facts))}::jsonb)`,'service_role');
    const reserve=()=>rpc('buyer1',`public.reserve_auction_test_transfer('${contract}')`,'service_role');
    assert.equal((await reserve()).status,'held','no operational positive release issuer exists');
    const qualify=()=>rpc('buyer1',`public.qualify_auction_room_release_from_domain('${contract}')`,'service_role');
    assert.equal((await qualify()).status,'held','paid access without objective place availability never releases');
    // Disposable synthetic domain facts, NOT operational provider proof.
    // Actual grants/RLS and immutable guards remain enabled; the issuer takes
    // only contract identity and derives the original place/session facts.
    await rpc('buyer1',"public.join_watch_party_room_session('PAYMENT-ONE')");
    await rpc('creator',`public.set_creator_room_participant_authority_service('PAYMENT-ONE','${actors.creator.user_id}',
      '${actors.creator.session_id}','${actors.buyer1.user_id}','speaker',false,'active')`,'service_role');
    await rpc('buyer1',"public.heartbeat_watch_party_room_session('PAYMENT-ONE','active',false,false,true)");
    assert.equal((await qualify()).status,'held','available place while session remains open is not mature');
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='PAYMENT-ONE'");
    assert.equal((await reserve()).status,'held','release reservation requires the exact issuer record');
    const qualification=await qualify();assert.equal(qualification.status,'qualified_test_only');
    assert.equal((await qualify()).releaseEvidenceId,qualification.releaseEvidenceId);
    const reserved=await reserve();assert.equal(reserved.status,'reserved');
    assert.equal((await reserve()).operationId,reserved.operationId);
    const dispatch=()=>rpc('buyer1',`public.claim_auction_test_transfer_dispatch('${reserved.operationId}')`,'service_role');
    const permitted=await dispatch();assert.equal(permitted.dispatchAuthorized,true);assert.equal(permitted.state,'unknown');
    assert.equal((await dispatch()).dispatchAuthorized,false,'no second dispatch after lost response');
    const transfer={id:'tr_Platform',object:'transfer',livemode:false,platform_account_id:'acct_platform',destination:'acct_fixture',
      source_transaction:'ch_Platform',amount:160,currency:'usd',transfer_group:permitted.transfer_group,amount_reversed:0,
      metadata:{auction_operation_id:reserved.operationId,auction_contract_id:contract}};
    const record=t=>rpc('buyer1',`public.record_auction_test_transfer_result('${reserved.operationId}',${lit(JSON.stringify(t))}::jsonb)`,'service_role');
    await assert.rejects(()=>record({...transfer,amount:161}),/transfer_evidence_mismatch/);
    assert.equal((await record(transfer)).status,'confirmed');
    assert.equal((await record(transfer)).status,'confirmed');
    // Newly detected domain drift must persist the same reconciliation state
    // returned by result recording, not read the old false flag in UPDATE RHS.
    await db.exec(`update private.creator_room_seat_claims set reason='synthetic_domain_drift_probe' where id='${s.claim.claimId}'`);
    assert.equal((await record(transfer)).status,'reconciliation_required');
    const drifted=(await rows(`select state,recovery_required from private.auction_transfer_operations where id='${reserved.operationId}'`))[0];
    assert.deepEqual(drifted,{state:'reconciliation_required',recovery_required:true});
    const refund={...good,eventId:'evt_Refund',eventType:'charge.refunded',objectId:'ch_Platform',
      checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:100};
    assert.equal((await receive(refund)).status,'refunded');
    const after=(await rows(`select * from private.auction_transfer_operations where id='${reserved.operationId}'`))[0];
    assert.equal(after.recovery_required,true);assert.equal(after.state,'reconciliation_required');
    assert.equal((await dispatch()).dispatchAuthorized,false);
    assert.equal((await record(transfer)).status,'reconciliation_required','late success cannot erase refund obligation');
    const qualifyRecovery=()=>rpc('buyer1',`public.qualify_auction_refund_recovery_from_net('${contract}')`,'service_role');
    assert.equal((await qualifyRecovery()).status,'held','buyer refund alone does not establish recoverable creator net');
    const refundFacts={...facts,refunded_minor:100,refund_net_minor:-105,
      refunds:[{id:'re_Platform',balance_id:'txn_Refund',amount:100,fee:5,net:-105,status:'available'}]};
    await rpc('buyer1',`public.record_auction_platform_cost_observation('${contract}',${lit(JSON.stringify({...refundFacts,tax_reversal_minor:null}))}::jsonb)`,'service_role');
    assert.equal((await qualifyRecovery()).status,'held','unknown tax adjustment never becomes guessed zero');
    await rpc('buyer1',`public.record_auction_platform_cost_observation('${contract}',${lit(JSON.stringify(refundFacts))}::jsonb)`,'service_role');
    const qualifiedRecovery=await qualifyRecovery();assert.equal(qualifiedRecovery.status,'qualified_test_only');
    assert.equal(qualifiedRecovery.amountMinor,84,'160 transferred minus 76 remaining creator net, not 80% of gross refund');
    const recovery=qualifiedRecovery.reversalEvidenceId;
    assert.equal((await qualifyRecovery()).reversalEvidenceId,recovery);
    const rr=()=>rpc('buyer1',`public.reserve_auction_test_reversal('${recovery}')`,'service_role');
    const reversal=await rr();assert.equal(reversal.status,'reserved');assert.equal((await rr()).operationId,reversal.operationId);
    const rd=()=>rpc('buyer1',`public.claim_auction_test_reversal_dispatch('${reversal.operationId}')`,'service_role');
    assert.equal((await rd()).dispatchAuthorized,true);assert.equal((await rd()).dispatchAuthorized,false);
    const reversalEvidence={id:'trr_Platform',object:'transfer_reversal',platform_account_id:'acct_platform',transfer:'tr_Platform',amount:84,currency:'usd',
      metadata:{auction_reversal_id:reversal.operationId,auction_operation_id:reserved.operationId},
      parent_transfer:{...transfer,amount_reversed:84},cumulative_reconciled:true};
    const result=await rpc('buyer1',`public.record_auction_test_reversal_result('${reversal.operationId}',${lit(JSON.stringify(reversalEvidence))}::jsonb)`,'service_role');
    assert.equal(result.status,'confirmed');assert.equal(result.buyerRefundCompleted,false);
    const externalDrift=await rpc('buyer1',`public.record_auction_test_reversal_result('${reversal.operationId}',${lit(JSON.stringify({
      ...reversalEvidence,parent_transfer:{...transfer,amount_reversed:124},cumulative_reconciled:false}))}::jsonb)`,'service_role');
    assert.equal(externalDrift.status,'reconciliation_required');assert.equal(externalDrift.reversalConfirmed,true);
    assert.equal((await rows(`select state from private.auction_reversal_operations where id='${reversal.operationId}'`))[0].state,'confirmed',
      'actual own reversal is retained even when cumulative provider amount conflicts');
    assert.equal((await qualifyRecovery()).reason,'transfer_reversals_not_reconciled');
    const extra=(await rows(`insert into private.auction_reversal_evidence(operation_id,amount_minor,evidence_reference,policy_version,qualified_at,expires_at)
      values('${reserved.operationId}',77,'synthetic over-reservation probe','synthetic_auction_reversal_test_v1',clock_timestamp(),clock_timestamp()+interval '1 minute') returning id`))[0].id;
    assert.equal((await rpc('buyer1',`public.reserve_auction_test_reversal('${extra}')`,'service_role')).status,'held');
    for(const role of ['anon','authenticated','service_role'])for(const table of ['auction_release_evidence','auction_transfer_operations','auction_reversal_evidence',
      'auction_reversal_operations','auction_transfer_result_observations','auction_room_delivery_issues']){
      try{await assert.rejects(()=>db.exec(`begin;set local role ${role};select * from private.${table};commit`),/permission denied/);}
      finally{await db.exec('rollback');}
    }
    const issue=await prepare('ISSUE','buyer2');
    await rpc('buyer2',`public.bind_creator_room_auction_checkout('${issue.quote.id}','${issue.claim.checkoutAttemptId}',
      'cs_test_Issue','pi_Issue','acct_platform',237,'usd')`,'service_role');
    assert.equal((await receive(evidence(issue,'Issue'))).status,'fulfilled');
    await rpc('buyer2',"public.join_watch_party_room_session('PAYMENT-ISSUE')");
    await rpc('creator',`public.set_creator_room_participant_authority_service('PAYMENT-ISSUE','${actors.creator.user_id}',
      '${actors.creator.session_id}','${actors.buyer2.user_id}','speaker',false,'active')`,'service_role');
    await rpc('buyer2',"public.heartbeat_watch_party_room_session('PAYMENT-ISSUE','active',false,false,true)");
    await rpc('creator',`public.set_creator_room_participant_authority_service('PAYMENT-ISSUE','${actors.creator.user_id}',
      '${actors.creator.session_id}','${actors.buyer2.user_id}','listener',false,'removed')`,'service_role');
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='PAYMENT-ISSUE'");
    assert.equal(await count('private.auction_room_delivery_issues',`claim_id='${issue.claim.claimId}'`),1);
    assert.equal((await rpc('buyer2',`public.qualify_auction_room_release_from_domain('${issue.claim.settlementContractId}')`,'service_role')).reason,
      'objective_fulfillment_unproved','observed removal remains an issue after nominal closure');
    assert.equal((await rows(`select private.creator_room_seat_payment_verified('${s.claim.claimId}') ok`))[0].ok,false);
    assert.equal(await count('private.auction_transfer_plans'),0);
  }finally{Date.now=realDateNow;await db.close();}
});
