import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
for(const state of ['finalized_paid','observed_paid','never_paid'])test(`returning payout fee policy uses durable bank evidence, not phase: ${state}`,{timeout:240000},async()=>{
 const paid=state!=='never_paid';
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try{
  const {scalar,rpc,request,creator,earning}=await seedCashoutExecutionFixture(db);
  const c=await rpc('select public.get_creator_cashout_execution_context($1)',[request.id]);
  const claim=stage=>rpc('select public.claim_creator_cashout_dispatch($1,$2)',[request.id,stage]);
  const observe=facts=>rpc('select public.record_creator_cashout_observation($1,null,$2)',[request.id,JSON.stringify(facts)]);
  await claim('funding');await observe({kind:'transfer',objectId:'tr_returnFee',amountMinor:9800,reversedMinor:0,fullyReversed:false,accountId:c.accountId,environment:'live'});
  await claim('payout');
  const payout={kind:'payout',objectId:'po_returnFee',status:'paid',amountMinor:9800,accountId:c.accountId,destinationId:c.destinationId,environment:'live',balanceTransactionId:'txn_returnFeePaid',failureBalanceTransactionId:null};
  if(paid)await observe(payout);
  const component={feeTransactionId:'fee_returnBaseline',incurredBy:payout.objectId,incurredByType:'payout',amountMinor:0,taxMinor:0,currency:'usd',product:'Connect',suite:'Payments',featureName:'Payout',pricingTier:'',settledVia:'balance'};
  const report={schemaVersion:1,accountId:c.platformAccountId,environment:'live',payoutId:payout.objectId,reportType:'all_fees.incurred_at.itemized.2',reportRunId:'frr_returnBaseline',fileId:'file_returnBaseline',contentSha256:'a'.repeat(64),providerBinding:'authenticated_report',rows:[component]};
  const fee=payload=>rpc('select public.record_creator_cashout_fee_report($1,$2)',[request.id,JSON.stringify(payload)]);
  if(state==='finalized_paid')assert.equal((await fee(report)).accountingComplete,true);
  assert.equal((await observe({...payout,status:'failed',failureBalanceTransactionId:'txn_returnPrincipal'})).status,'return_pending');
  const late={...report,reportRunId:'frr_returnLater',rows:[{...component,feeTransactionId:'fee_returnLater',amountMinor:25}]};
  assert.equal((await fee(late)).status,'return_pending','known bank failure cannot revert to paid');
  assert.equal(Number(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator])),paid?25:0,'only durable paid evidence establishes the prior paid baseline');
  assert.equal((await fee(late)).status,'return_pending','replay preserves return state');
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_fee_adjustment_checkpoints'),paid?1:0);
  await observe({...payout,status:'failed',failureBalanceTransactionId:'txn_returnPrincipal',returnTransactionId:'txn_returnPrincipal',returnedMinor:9800});
  assert.equal((await fee({...report,reportRunId:'frr_returnConfirmedFee',rows:[{...component,feeTransactionId:'fee_returnConfirmed',amountMinor:10}]})).status,'return_confirmed');
  assert.equal(Number(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator])),paid?35:0);
  await claim('reversal');
  assert.equal((await fee({...report,reportRunId:'frr_reversalPendingCredit',rows:[{...component,feeTransactionId:'fee_reversalCredit',amountMinor:-10}]})).status,'reversal_unknown','fee credit cannot erase uncertain reversal status');
  assert.equal(Number(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator])),paid?25:0);
  assert.equal((await observe({kind:'reversal',objectId:'trr_returnFee',transferId:'tr_returnFee',amountMinor:9800,accountId:c.accountId,environment:'live'})).fundsReleased,true);
  assert.equal(await scalar('select released_minor from private.creator_cashout_return_accounting'),paid?10000:9975,'old paid principal is not retroactively offset; never-paid initial costs still reconcile');
  assert.equal(await scalar('select public.creator_earnings_withdrawable_cents_internal($1,now())',[earning]),10000);
  assert.equal(Number(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator])),paid?25:0);
 }finally{await db.close();}
});
