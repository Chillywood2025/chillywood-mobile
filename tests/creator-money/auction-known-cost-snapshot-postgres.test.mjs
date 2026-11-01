import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {createFeeReportAuctionFixture} from '../helpers/fee-report-auction-fixture.mjs';

test('auction fee snapshots preserve 80/20 and independent store/domain/sandbox holds',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  const auction=await createFeeReportAuctionFixture(db);
  await db.exec('reset role;reset request.jwt.claim.role;reset request.jwt.claims');
  const contract=(await db.query('select * from private.auction_platform_settlement_contracts where id=$1',[auction.contract])).rows[0];
  await db.query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
   values($1,'known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),gen_random_uuid())`,[contract.creator_id]);
  await db.query(`insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified)
   values('acct_platform','test','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','SYNTHETIC',now(),now()+interval '1 hour',true)`);
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role`);
  const context=await one('select public.get_commerce_fee_report_import_context($1)',[auction.contract]);
  const row={feeTransactionId:'fee_Auction',incurredBy:context.chargeId,incurredByType:'charge',amountMinor:3,taxMinor:0,currency:'usd',product:'Tax',suite:'Revenue',featureName:'Automatic tax',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_AuctionTax'};
  const evidence={schemaVersion:1,accountId:'acct_platform',environment:'test',reportRunId:'frr_Auction',fileId:'file_Auction',reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
   chargeId:context.chargeId,refundIds:[],rows:[row],unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
   holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300};
  await one('select public.record_commerce_fee_report_observation($1,$2,$3)',[auction.contract,context.sourceObservationId,JSON.stringify(evidence)]);
  const snapshot=await one("select public.reconcile_commerce_known_costs('room_auction',$1)",[auction.contract]);
  assert.equal(Number(snapshot.fee_minor),40);assert.equal(Number(snapshot.net_minor),197);assert.equal(Number(snapshot.platform_minor),39);assert.equal(Number(snapshot.creator_minor),158);
  await assert.rejects(one("select public.release_commerce_known_earnings('room_auction',$1)",[auction.contract]),/sandbox_not_payable/);
  await db.exec('reset role');
  assert.equal(await one("select private.commerce_tax_fee_settlement_ready('room_auction',$1)",[contract.quote_id]),true);
  assert.ok((await one('select hold_reasons from private.auction_held_net_allocations where fee_snapshot_id=$1',[snapshot.id])).includes('sandbox_not_payable'));
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  assert.equal(await one('select count(*)::int from private.auction_transfer_operations'),0);
 }finally{await db.close();}
});
