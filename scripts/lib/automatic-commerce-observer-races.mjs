// Guarded native clone only. Proves SKIP LOCKED with concurrent live backends;
// no HTTP, provider mutation, or source database writes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commerceSeedAdapter,seedCommerceCreator} from '../../tests/helpers/automatic-commerce-fixture.mjs';

export async function runAutomaticCommerceObserverRaces({query,session,until,actors,lit}) {
 const accounts=Array.from({length:6},()=>randomUUID());
 await query(`update private.creator_provider_observation_control set enabled=true,last_claimed_at=null where id=true;`);
 for(const [index,account] of accounts.entries()) {
  const actor=await seedCommerceCreator(commerceSeedAdapter(query),undefined,{environment:'production'}),creator=actor.id;
  await query(`begin;set local role authenticated;set local request.jwt.claims=${lit(JSON.stringify({role:'authenticated',sub:actor.id,session_id:actor.session}))};
    select public.declare_creator_money_eligibility(true,'US','CA','adult-us-creator-v1');commit;`);
  await query(`
  insert into public.creator_payout_accounts(id,creator_user_id,provider,provider_environment,provider_account_id,country)
  values(${lit(account)},${lit(creator)},'stripe_connect','live',${lit('acct_skiplocked'+account.replaceAll('-',''))},'US');
  insert into private.creator_provider_observation_jobs(account_id,creator_id,environment,provider_account_id,due_at)
  values(${lit(account)},${lit(creator)},'live',${lit('acct_skiplocked'+account.replaceAll('-',''))},clock_timestamp()-interval '${10-index} minutes');`);
 }
 const holder=session(`begin;select account_id from private.creator_provider_observation_jobs where account_id=${lit(accounts[0])} for update;
  select jsonb_build_object('holderPid',pg_backend_pid());select 'OBSERVER_HOLDER_READY';`);
 await until(()=>holder.output().includes('OBSERVER_HOLDER_READY'),'observer job lock holder not ready');
 const worker=session(`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
  select jsonb_build_object('workerPid',pg_backend_pid(),'jobs',public.claim_creator_provider_observations());commit;`);
 worker.child.stdin.end();
 try {
  // Worker must finish while the holder remains open. Waiting for holder
  // commit would erase the SKIP LOCKED property this schedule is testing.
  await until(()=>worker.output().includes('workerPid'),'observer must skip the locked row without waiting');
  const result=await worker.done;assert.equal(result.code,0,result.stderr);
  const record=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('{')));
  const held=JSON.parse(holder.output().split('\n').find(line=>line.startsWith('{')));
  assert.notEqual(record.workerPid,held.holderPid,'independent PostgreSQL backends');
  assert.equal(record.jobs.length,5,'bounded batch fills from unlocked eligible jobs');
  assert.ok(record.jobs.every(job=>job.account_id!==accounts[0]),'locked oldest row excluded');
  assert.equal(query(`select count(*) from pg_stat_activity where pid=${held.holderPid} and state='idle in transaction'`),'1','holder is still open when peer completed');
 }finally{holder.child.stdin.end('rollback;\n');const result=await holder.done;assert.equal(result.code,0,result.stderr);}
 assert.equal(query(`select lease_token is null from private.creator_provider_observation_jobs where account_id=${lit(accounts[0])}`),'t','skipped job remains unclaimed');
}
