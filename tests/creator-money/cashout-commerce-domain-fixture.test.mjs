import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceMerch} from '../helpers/qualified-commerce-merch-fixture.mjs';
import {seedCashoutExecutionFixture,creator} from '../helpers/cashout-execution-fixture.mjs';
import {randomUUID} from 'node:crypto';
test('native cashout source-domain fixture reaches real funded hold and never starts a bank payout',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try{
  const merch=await seedQualifiedCommerceMerch(db,undefined,{creatorId:creator,platformAccountId:'acct_cashoutPlatform',recipientAccountId:'acct_cashoutCreator'});
  await merch.root();const f=await seedCashoutExecutionFixture(db,{reserveInitialRequest:false});
  await merch.service();const released=await merch.release();await merch.root();
  const gross=Number(await f.scalar('select net_creator_amount_cents from public.creator_earnings_ledger where id=$1',[released.earnings_ledger_id]));
  const app=Math.ceil(gross*0.02),bank=gross-app;
  await f.claims('authenticated');await db.exec('set role authenticated');
  const request=await f.scalar("select public.request_qualified_creator_cashout($1,'instant',$2,gen_random_uuid(),$3,0,$4)",[gross,f.qualification,app,bank]);
  await db.exec('reset role');
  const claim=stage=>f.rpc('select public.claim_creator_cashout_dispatch($1,$2)',[request.requestId,stage]);
  assert.equal((await claim('funding')).claimed,true);
  await f.rpc('select public.record_creator_cashout_observation($1,null,$2)',[request.requestId,JSON.stringify({kind:'transfer',objectId:'tr_domain',amountMinor:bank,reversedMinor:0,fullyReversed:false,accountId:'acct_cashoutCreator',environment:'live'})]);
  await db.exec('begin');await db.query("update public.merch_orders set fulfillment_status='blocked' where id=$1",[merch.identity]);await db.exec('rollback');
  await db.exec('begin');assert.equal((await claim('payout')).claimed,true);await db.exec('rollback');
  await db.query("update public.merch_orders set fulfillment_status='blocked' where id=$1",[merch.identity]);
  const held=await claim('payout');assert.equal(held.claimed,false);assert.equal(held.status,'funding_return_pending');
  await assert.rejects(claim('funding_return'),/funding_return_qualification_required/,'source hold does not grant provider correction authority');
  assert.equal(await f.scalar("select count(*)::int from private.creator_cashout_dispatch_provenance where event='payout_started'"),0);
  assert.equal(await f.scalar("select count(*)::int from public.creator_payout_allocations where payout_request_id=$1 and state='released'",[request.requestId]),0);
  await db.exec('reset role');
  const other=await seedCashoutExecutionFixture(db,{creatorId:randomUUID(),sessionId:randomUUID(),recipientAccountId:'acct_secondNative'});
  const otherContext=await other.rpc('select public.get_creator_cashout_execution_context($1)',[other.request.id]);
  assert.equal(otherContext.accountId,'acct_secondNative','independent native schedules have separate pending-request authority');
 }finally{await db.close();}
});
