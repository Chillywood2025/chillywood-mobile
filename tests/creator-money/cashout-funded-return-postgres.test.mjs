import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
test('funded cancellation permanently freezes bank dispatch; exact returned principal and known costs release once',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try{
  const {scalar,rpc,claims,request,creator,earning}=await seedCashoutExecutionFixture(db,{fundingReturnQualified:true});
  const c=await rpc('select public.get_creator_cashout_execution_context($1)',[request.id]);
  const claim=stage=>rpc('select public.claim_creator_cashout_dispatch($1,$2)',[request.id,stage]);
  const available=()=>scalar("select public.creator_earnings_withdrawable_cents_internal($1,now())-coalesce((select sum(amount_cents) from public.creator_payout_allocations where earnings_ledger_id=$1 and state in ('reserved','processing','paid')),0)",[earning]);
  const observe=facts=>rpc('select public.record_creator_cashout_observation($1,null,$2)',[request.id,JSON.stringify(facts)]);
  assert.equal(await scalar('select private.cashout_bank_never_dispatched($1)',[c.executionId]),true);
  await claim('funding');
  await observe({kind:'transfer',objectId:'tr_fundedCancel',amountMinor:9800,reversedMinor:0,fullyReversed:false,accountId:c.accountId,environment:'live'});
  await claims('authenticated');await db.exec('set role authenticated');
  await assert.rejects(scalar('select public.get_owner_commerce_fee_accounting_health()'),/owner_current_session_required/);
  const cancel=()=>scalar('select public.cancel_undispatched_creator_cashout($1)',[request.id]);
  assert.equal((await cancel()).status,'funding_return_pending');
  assert.equal((await cancel()).status,'funding_return_pending','cancel replay cannot release or enqueue another return');
  await db.exec('reset role');
  assert.equal(await scalar("select count(*)::int from public.creator_payout_allocations where state='released'"),0);
  assert.equal((await claim('payout')).claimed,false);
  await assert.rejects(db.query("update private.creator_cashout_executions set phase='payout_unknown' where id=$1",[c.executionId]),/permanently_frozen/);
  assert.equal((await claim('funding_return')).claimed,true);
  assert.equal((await claim('funding_return')).claimed,false,'uncertain return never redispatches');
  const facts={kind:'funding_return',objectId:'trr_fundedCancel',transferId:'tr_fundedCancel',amountMinor:9800,
   accountId:c.accountId,platformAccountId:c.platformAccountId,environment:'live',
   fundingBalance:{transactionId:'txn_funding',sourceId:'tr_fundedCancel',amountMinor:-9800,feeMinor:12,netMinor:-9812,currency:'usd',status:'available',type:'transfer'},
   returnBalance:{transactionId:'txn_return',sourceId:'trr_fundedCancel',amountMinor:9800,feeMinor:3,netMinor:9797,currency:'usd',status:'available',type:'transfer_refund'}};
  for(const mutation of [{amountMinor:9799},{platformAccountId:'acct_other'},{returnBalance:{...facts.returnBalance,sourceId:'trr_other'}},
   {returnBalance:{...facts.returnBalance,status:'pending'}},{returnBalance:{...facts.returnBalance,netMinor:9800}}]){
   await assert.rejects(observe({...facts,...mutation}),/funding_return_(binding|balance)_invalid/);
  }
  await db.exec('begin');
  await observe({...facts,returnBalance:{...facts.returnBalance,feeMinor:-12,netMinor:9812}});
  const signed=await rpc('select public.record_creator_cashout_fee_report($1,$2)',[request.id,JSON.stringify({schemaVersion:1,accountId:c.platformAccountId,
   environment:'live',transferId:'tr_fundedCancel',reportType:'all_fees.incurred_at.itemized.2',reportRunId:'frr_signedInline',fileId:'file_signedInline',
   contentSha256:'b'.repeat(64),providerBinding:'authenticated_report',rows:[]})]);
  assert.equal(signed.observedProviderFeeMinor,0,'canonical negative inline return fee offsets exact original cost');
  assert.equal(await scalar('select released_minor from private.creator_cashout_return_accounting'),10000);
  await db.exec('rollback');
  assert.equal((await observe(facts)).fundsReleased,false,'actual returned principal alone does not establish cost coverage');
  assert.equal(await scalar('select bank_return_transaction_id from private.creator_cashout_executions where id=$1',[c.executionId]),null,'no invented bank payout/return');
  const report={schemaVersion:1,accountId:c.platformAccountId,environment:'live',transferId:'tr_fundedCancel',reportType:'all_fees.incurred_at.itemized.2',
   reportRunId:'frr_fundingCosts',fileId:'file_fundingCosts',contentSha256:'a'.repeat(64),providerBinding:'authenticated_report',rows:[]};
  const fee=r=>rpc('select public.record_creator_cashout_fee_report($1,$2)',[request.id,JSON.stringify(r)]);
  const result=await fee(report);assert.equal(result.accountingComplete,true);assert.equal(result.observedProviderFeeMinor,15);
  assert.equal(await scalar('select released_minor from private.creator_cashout_return_accounting'),9985,'appfee200 returned; only actual provider15 retained');
  assert.equal(Number(await available()),9985);
  assert.equal((await observe(facts)).fundsReleased,true);assert.equal((await fee(report)).accountingComplete,true);
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_return_accounting'),1);
  const row={feeTransactionId:'fee_fundingInline',incurredBy:'tr_fundedCancel',incurredByType:'transfer',amountMinor:12,taxMinor:0,currency:'usd',
   product:'Connect',suite:'Payments',featureName:'Transfer',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_funding'};
  assert.equal((await fee({...report,reportRunId:'frr_inlineRepeat',rows:[row]})).observedProviderFeeMinor,15,'inline fee is not charged twice');
  await assert.rejects(fee({...report,reportRunId:'frr_badInline',rows:[{...row,feeTransactionId:'fee_inlineConflict',amountMinor:1}]}),/inline_fee_conflict/);
  const late={...row,feeTransactionId:'fee_lateTransfer',balanceTransactionId:'txn_lateTransfer',amountMinor:7};
  assert.equal((await fee({...report,reportRunId:'frr_lateTransfer',rows:[late]})).observedProviderFeeMinor,22);
  assert.equal(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator]),7);
  assert.equal(Number(await available()),9985,'existing earnings not retroactively reduced');
  assert.equal((await fee({...report,reportRunId:'frr_transferCredit',rows:[{...late,feeTransactionId:'fee_creditTransfer',balanceTransactionId:'txn_creditTransfer',amountMinor:-7}]})).observedProviderFeeMinor,15);
  assert.equal(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator]),0);
  assert.equal((await fee({...report,reportRunId:'frr_aboveGross',rows:[{...late,feeTransactionId:'fee_aboveGross',balanceTransactionId:'txn_aboveGross',amountMinor:10000}]})).observedProviderFeeMinor,10015);
  assert.equal(await scalar("select private.creator_fee_recovery_amount($1,'usd')",[creator]),10000,'later verified cost above original gross is future-only debt, not a permanently rejected import');
  assert.equal(Number(await available()),9985);
  assert.equal((await claim('payout')).claimed,false);assert.equal((await claim('funding_return')).claimed,false);
 }finally{await db.close();}
});
test('legacy funded execution without prospective provenance cannot become a no-bank-dispatch return',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try{
  const {scalar,claims,rpc,request,qualification,creator}=await seedCashoutExecutionFixture(db);
  const execution=await scalar(`insert into private.creator_cashout_executions(request_id,qualification_id,creator_id,gross_minor,app_fee_minor,
   expected_provider_fee_minor,bank_minor,phase,transfer_id,dispatched_at) values($1,$2,$3,10000,200,0,9800,'funded','tr_legacy',now()) returning id`,[request.id,qualification,creator]);
  assert.equal(await scalar('select private.cashout_bank_never_dispatched($1)',[execution]),false);
  await claims('authenticated');await db.exec('set role authenticated');
  assert.equal((await scalar('select public.get_my_creator_cashout_execution($1)',[request.id])).canCancel,false);
  await assert.rejects(scalar('select public.cancel_undispatched_creator_cashout($1)',[request.id]),/no_bank_dispatch_proof_required/);
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_funding_cancellations'),0);
  assert.equal((await rpc("select public.claim_creator_cashout_dispatch($1,'funding_return')",[request.id])).claimed,false);
 }finally{await db.close();}
});
