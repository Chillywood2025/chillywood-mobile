import test from 'node:test';
import assert from 'node:assert/strict';
import {withQualifiedAuctionFixture} from '../helpers/auction-checkout-fixture.mjs';
test('live auction full refund resolves monetary exposure without ignoring current fraud or granting new proceeds',{timeout:240000},async()=>{
 await withQualifiedAuctionFixture({mode:'live',lane:'room'},async({db,rpc,actors,contractId})=>{
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const service=()=>db.exec(`reset role;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
  const root=()=>db.exec('reset role;reset request.jwt.claim.role;reset request.jwt.claims');
  const facts={account_id:'acct_platform',environment:'live',currency:'usd',charge_id:'ch_LiveFixture',payment_intent_id:'pi_LiveFixture',balance_id:'txn_LiveFixture',balance_status:'available',disputed:false,financial_authority:false,gross_minor:237,provider_fee_minor:37,tax_minor:0,store_fee_minor:0,refunded_minor:0,refund_net_minor:0,tax_reversal_minor:0,refunds:[]};
  await service();await one('select public.record_auction_platform_cost_observation($1,$2)',[contractId,JSON.stringify(facts)]);await root();
  await rpc('buyer1',"public.join_watch_party_room_session('LIVE-AUCTION-FIXTURE')");
  await rpc('creator',`public.set_creator_room_participant_authority_service('LIVE-AUCTION-FIXTURE','${actors.creator.user_id}','${actors.creator.session_id}','${actors.buyer1.user_id}','speaker',false,'active')`,'service_role');
  await rpc('buyer1',"public.heartbeat_watch_party_room_session('LIVE-AUCTION-FIXTURE','active',false,false,true)");
  await db.exec("update public.watch_party_rooms set is_active=false where party_id='LIVE-AUCTION-FIXTURE'");
  await db.query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
   values($1,'known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),$2)`,[actors.creator.user_id,actors.creator.session_id]);
  await db.exec(`insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified)
   values('acct_platform','live','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','SYNTHETIC',now(),now()+interval '1 hour',true)`);
  await db.query(`insert into private.commerce_earnings_qualifications(creator_id,platform_account_id,recipient_account_id,environment,currency,platform_held_funding_verified,no_automatic_transfer_verified,evidence_reference,verified_at,expires_at)
   values($1,'acct_platform','acct_fixture','live','usd',true,true,'SYNTHETIC',now(),now()+interval '1 hour')`,[actors.creator.user_id]);
  await db.exec("begin;set local request.jwt.claim.role='service_role';update public.platform_money_kill_switches set state='on' where key='payouts_enabled';commit");
  await service();
  const evidence={schemaVersion:1,accountId:'acct_platform',environment:'live',reportRunId:'frr_LiveRoom',fileId:'file_LiveRoom',reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
   chargeId:'ch_LiveFixture',refundIds:[],rows:[],unattributedRows:0,observedRowCount:0,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
   holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300};
  const report=async patch=>{const context=await one('select public.get_commerce_fee_report_import_context($1)',[contractId]);return one('select public.record_commerce_fee_report_observation($1,$2,$3)',[contractId,context.sourceObservationId,JSON.stringify({...evidence,...patch})]);};
  await report({});const release=()=>one("select public.release_commerce_known_earnings('room_auction',$1)",[contractId]);
  const initial=await release();assert.equal(Number(initial.delta_minor),160);
  await root();await db.query(`insert into private.auction_room_delivery_issues(claim_id,reason) select s.id,'membership_removed' from private.creator_room_seat_claims s join private.auction_platform_settlement_contracts c on c.purchase_intent_id=s.purchase_intent_id where c.id=$1`,[contractId]);
  const available=()=>one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[initial.earnings_ledger_id]);
  assert.equal(await available(),0);
  const partialRefund={id:'re_LivePartial',balance_id:'txn_LivePartial',amount:100,fee:0,net:-100,status:'available'};
  await service();await one('select public.record_auction_platform_cost_observation($1,$2)',[contractId,JSON.stringify({...facts,refunded_minor:100,refund_net_minor:-100,refunds:[partialRefund]})]);
  await report({reportRunId:'frr_LivePartial',refundIds:['re_LivePartial']});
  assert.equal(Number((await release()).delta_minor),-80);
  await root();assert.equal(await available(),0,'partial refund does not resolve historical delivery remedy');
  await service();await one('select public.record_auction_platform_cost_observation($1,$2)',[contractId,JSON.stringify({...facts,refunded_minor:237,refund_net_minor:-237,refunds:[partialRefund,{id:'re_LiveRoom',balance_id:'txn_LiveRoomRefund',amount:137,fee:0,net:-137,status:'available'}]})]);
  await report({reportRunId:'frr_LiveRoomRefund',refundIds:['re_LivePartial','re_LiveRoom']});
  const debt=await release();assert.equal(Number(debt.delta_minor),-117);
  await root();assert.equal(await available(),160);
  assert.equal(await one("select private.creator_fee_recovery_outstanding($1,'usd')",[actors.creator.user_id]),true,'money dispatch still blocked until debt covered');
  await one("select private.record_creator_verified_fee_credit($1,$2,'cashout_fee',gen_random_uuid(),repeat('7',64),197,'acct_platform','acct_fixture')",[actors.creator.user_id,initial.earnings_ledger_id]);
  assert.equal(Number(await one("select private.consume_creator_fee_recovery($1,'usd')",[actors.creator.user_id])),197);
  assert.equal(await available(),160);
  assert.equal(await one("select private.creator_fee_recovery_outstanding($1,'usd')",[actors.creator.user_id]),false);
  await service();await report({reportRunId:'frr_LiveCredit',refundIds:['re_LivePartial','re_LiveRoom'],rows:[{feeTransactionId:'fee_LiveCredit',incurredBy:'ch_LiveFixture',incurredByType:'charge',amountMinor:-37,taxMinor:0,currency:'usd',product:'Payments',suite:'Payments',featureName:'Fee credit',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_LiveCredit'}],observedRowCount:1});
  const correction=await release();assert.equal(Number(correction.delta_minor),37,'full-refund fee correction is not lost behind historical delivery issue');
  await root();assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[correction.earnings_ledger_id]),37);
  await db.query("update public.creator_payout_eligibility_records set fraud_hold_active=true where creator_user_id=$1",[actors.creator.user_id]);
  assert.equal(await available(),0,'current financial safety never bypassed');
  assert.equal(await one('select count(*)::int from public.creator_payout_requests'),0);
 });
});
