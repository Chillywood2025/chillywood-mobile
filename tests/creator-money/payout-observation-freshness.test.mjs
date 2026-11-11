import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory} from '../helpers/native-deployment-database.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
import {refreshSyntheticPayoutObservation} from '../helpers/refresh-synthetic-payout-observation.mjs';

test('expired synthetic payout observations reject; explicit renewal appends evidence without weakening freshness',{timeout:600000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>databaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 try {
  const f=await seedCashoutExecutionFixture(db);
  await f.rpc('select public.get_creator_cashout_execution_context($1)',[f.request.id]);
  await f.claims('authenticated');await db.exec('set role authenticated');
  await f.scalar('select public.cancel_undispatched_creator_cashout($1)',[f.request.id]);
  await db.exec('reset role');
  const definition=await f.scalar("select pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)");
  const request=async()=>{await f.claims('authenticated');await db.exec('set role authenticated');try{return await f.scalar("select public.create_creator_payout_request_safe(10000,'instant')");}finally{await db.exec('reset role');}};
  const account=await f.scalar('select id from public.creator_payout_accounts where creator_user_id=$1',[f.creator]);
  await db.query("update public.creator_payout_accounts set last_provider_sync_at=now()-interval '16 minutes' where id=$1",[account]);
  await assert.rejects(request(),/fresh_live_payout_provider_proof_required/,'stale account cannot use a fresh audit');
  await db.query('update public.creator_payout_accounts set last_provider_sync_at=clock_timestamp() where id=$1',[account]);
  const staleAudit=await f.scalar(`insert into public.platform_admin_audit_logs(action,action_category,target_type,target_id,target_user_id,metadata,created_at)
   values('stripe_connect_account_synced','payout','creator_payout_account',$1,$2,'{"synthetic_fixture":true}',now()-interval '16 minutes') returning id`,[account,f.creator]);
  await db.query('update public.creator_payout_accounts set last_platform_admin_audit_log_id=$2 where id=$1',[account,staleAudit]);
  const retained=await f.scalar('select to_jsonb(a) from public.platform_admin_audit_logs a where id=$1',[staleAudit]);
  await assert.rejects(request(),/fresh_live_payout_provider_proof_required/,'fresh account cannot use a stale audit');
  // Configuration freshness belongs to other qualified routes, not this
  // cashout observation guard. Do not renew unrelated configuration evidence.
  await db.query("update public.creator_payout_accounts set provider_configuration_observed_at=now()-interval '16 minutes' where id=$1",[account]);
  const configurationTime=await f.scalar('select provider_configuration_observed_at from public.creator_payout_accounts where id=$1',[account]);
  const freshAudit=await refreshSyntheticPayoutObservation(db,f);
  assert.notEqual(freshAudit,staleAudit);
  assert.deepEqual(await f.scalar('select to_jsonb(a) from public.platform_admin_audit_logs a where id=$1',[staleAudit]),retained);
  assert.deepEqual(await f.scalar('select provider_configuration_observed_at from public.creator_payout_accounts where id=$1',[account]),configurationTime);
  assert.ok((await request()).id,'explicit fresh positive evidence permits the normal cashout');
  assert.equal(await f.scalar("select pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)"),definition,'runtime guard definition unchanged');
 } finally {await db.close();}
});
