import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
test('all six native cashout actors seed independently under managed auth email uniqueness',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try{
  // The local auth double omits this managed GoTrue partial index. Add the
  // actual uniqueness boundary; never remove it or hide conflicts via upsert.
  await db.exec('create unique index if not exists users_email_partial_key on auth.users(email) where is_sso_user=false');
  const actors=[];
  for(let i=0;i<6;i++){
   await db.exec('reset role');
   const actor=await seedCashoutExecutionFixture(db,{creatorId:randomUUID(),sessionId:randomUUID(),recipientAccountId:`acct_nativeFixture${i}`,reserveInitialRequest:i<5});
   actors.push(actor);
   if(actor.request){
    const context=await actor.rpc('select public.get_creator_cashout_execution_context($1)',[actor.request.id]);
    assert.equal(context.accountId,actor.accountId);assert.equal(context.phase,'prepared');
   }
  }
  const one=actors[0].scalar;
  const counts=(await db.query("select count(*)::int total,count(distinct email)::int emails from auth.users where email like 'cashout-%@example.test'")).rows[0];
  assert.deepEqual(counts,{total:6,emails:6});
  assert.equal(await one("select count(distinct provider_account_id)::int from public.creator_payout_accounts where provider_account_id like 'acct_nativeFixture%'"),6);
  assert.equal(await one('select count(*)::int from public.creator_payout_requests'),5);
  assert.equal(await one('select count(distinct originating_session_id)::int from public.creator_payout_requests'),5);
  for(const actor of actors){
   assert.equal(await one('select email from auth.users where id=$1',[actor.creator]),`cashout-${actor.creator}@example.test`);
  }
  await assert.rejects(db.query("insert into auth.users(id,email,is_sso_user,is_anonymous) values($1,$2,false,false)",[randomUUID(),`cashout-${actors[0].creator}@example.test`]),/users_email_partial_key/,'duplicate email still fails under the real constraint');
  await actors[1].claims('authenticated');await db.exec('set role authenticated');
  await assert.rejects(one('select public.cancel_undispatched_creator_cashout($1)',[actors[0].request.id]),/cashout_request_not_found/,'fixture isolation preserves cross-user authorization denial');
 }finally{await db.close();}
});
