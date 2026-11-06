// Guarded native clone only. Proves SKIP LOCKED with concurrent live backends;
// no HTTP, provider mutation, or source database writes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commerceSeedAdapter,seedCommerceCreator} from '../../tests/helpers/automatic-commerce-fixture.mjs';

// Shared exact input cohort for native SKIP LOCKED and sequential nested-setup
// regression. These accounts are deliberately UNKNOWN, never qualified MATCH.
export async function seedAutomaticCommerceObserverFixture({query,lit}) {
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
 return accounts;
}

// Data-only setup for each real native scenario. Exposing this separately lets
// preflight exercise both fresh and expired rows without faking a peer backend.
export async function prepareAutomaticCommerceObserverSkipLockedFixture({query,lit,accounts,expired}) {
 const expiredToken=randomUUID();
 if(expired) await query(`update private.creator_provider_observation_control set last_claimed_at=null where id=true;
  update private.creator_provider_observation_jobs set lease_token=null,leased_at=null,lease_until=null,due_at=clock_timestamp()-interval '5 minutes'
   where account_id in(${accounts.map(lit).join(',')});
  update private.creator_provider_observation_jobs set lease_token=${lit(expiredToken)},
   leased_at=clock_timestamp()-interval '5 minutes',lease_until=clock_timestamp()-interval '1 minute'
   where account_id=${lit(accounts[0])};`);
 return expiredToken;
}

export async function runAutomaticCommerceObserverRaces({query,session,until,race,actors,lit}) {
 const accounts=await seedAutomaticCommerceObserverFixture({query,lit});
 for(const expired of [false,true]) {
 const expiredToken=await prepareAutomaticCommerceObserverSkipLockedFixture({query,lit,accounts,expired});
 const holder=session(`begin;select private.lock_ordinary_commerce_authority_gate();select account_id from private.creator_provider_observation_jobs where account_id=${lit(accounts[0])} for update;
  select jsonb_build_object('holderPid',pg_backend_pid());select 'OBSERVER_HOLDER_READY';`);
 await until(()=>holder.output().includes('OBSERVER_HOLDER_READY'),'observer job lock holder not ready');
 const worker=session(`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
  select jsonb_build_object('workerPid',pg_backend_pid(),'jobs',public.claim_creator_provider_observations());commit;`);
 worker.child.stdin.end();
 try {
  // Worker must finish while the holder remains open. Waiting for holder
  // commit would erase the SKIP LOCKED property this schedule is testing.
  await until(()=>worker.output().includes('workerPid'),expired
   ? 'expired-lease maintenance must skip a locked expired job without waiting'
   : 'observer must skip the locked row without waiting');
  const result=await worker.done;assert.equal(result.code,0,result.stderr);
  const record=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('{')));
  const held=JSON.parse(holder.output().split('\n').find(line=>line.startsWith('{')));
  assert.notEqual(record.workerPid,held.holderPid,'independent PostgreSQL backends');
  assert.equal(record.jobs.length,5,'bounded batch fills from unlocked eligible jobs');
  assert.ok(record.jobs.every(job=>job.account_id!==accounts[0]),'locked oldest row excluded');
  assert.equal(query(`select count(*) from pg_stat_activity where pid=${held.holderPid} and state='idle in transaction'`),'1','holder is still open when peer completed');
 }finally{holder.child.stdin.end('rollback;\n');const result=await holder.done;assert.equal(result.code,0,result.stderr);}
 if(expired) assert.equal(query(`select lease_token=${lit(expiredToken)} and failure_count=0
  from private.creator_provider_observation_jobs where account_id=${lit(accounts[0])}`),'t','skipped expired job keeps its token and backoff');
 else assert.equal(query(`select lease_token is null from private.creator_provider_observation_jobs where account_id=${lit(accounts[0])}`),'t','skipped job remains unclaimed');
 }
 await runAutomaticCommerceObserverLeaseRaces({query,race,lit,account:accounts[0]});
}

// Also reusable for explicit sequential SQL preflight. Only the native race
// implementation proves waiting on a separate backend; no adapter fabricates it.
export async function runAutomaticCommerceObserverLeaseRaces({query,race,lit,account}) {
 const token=randomUUID();
 const service="set local role service_role;set local request.jwt.claims='{\"role\":\"service_role\"}';";
 // All completion evidence is valid before the lease expires. A rollback-only
 // successful control ensures a stale-clock implementation cannot pass this
 // schedule merely because some unrelated completion precondition was absent.
 await query(`begin;select private.lock_ordinary_commerce_authority_gate();update private.creator_provider_observation_jobs set lease_token=${lit(token)},leased_at=clock_timestamp()-interval '1 minute',
  lease_until=clock_timestamp()+interval '1 hour',previous_observed_at=null,observed_at=null where account_id=${lit(account)};
  update public.creator_payout_accounts set provider_configuration_account_id=provider_account_id,
   provider_configuration_observed_at=statement_timestamp(),last_provider_sync_at=statement_timestamp(),
   -- Observation freshness is not configuration verification. Normalize only
   -- the existing raw payer, preserving UNKNOWN and all readiness restrictions.
   provider_fees_payer=case
    when provider_fees_payer_raw in ('application','application_express','application_custom') then 'platform'
    when provider_fees_payer_raw='account' then 'account' else 'unknown' end
   where id=${lit(account)};
  insert into public.platform_admin_audit_logs(action,action_category,target_type,target_id,target_user_id,actor_role,metadata)
  select 'creator_provider_observation_persisted','payout','creator_payout_account',id::text,creator_user_id,'system',
   jsonb_build_object('source','creator-provider-observation-worker','provider_environment',provider_environment)
  from public.creator_payout_accounts where id=${lit(account)};commit;`);
 const complete=`select public.complete_creator_provider_observation(${lit(account)},${lit(token)});`;
 assert.equal(JSON.parse(await query(`begin;${service}${complete}rollback;`)).completed,true,'valid pre-expiry completion control');
 await query(`update private.creator_provider_observation_jobs set lease_until=clock_timestamp()+interval '2 seconds' where account_id=${lit(account)};`);
 const waitPastExpiry=`do $expiry_barrier$ begin if not exists(select 1 from private.creator_provider_observation_jobs
  where account_id=${lit(account)} and lease_until>clock_timestamp()) then raise exception 'observer_expiry_barrier_was_late';end if;
  end $expiry_barrier$;select pg_sleep(2.2);select '{}'::jsonb;`;
 const completion=await race('provider completion lease expires while waiting on canonical account prefix',
  `select private.lock_ordinary_commerce_authority_gate();select id from public.creator_payout_accounts where id=${lit(account)} for update;select '{}'::jsonb;`,
  service+complete,{afterBlocked:waitPastExpiry});
 assert.equal(completion.second.completed,false);
 assert.ok(['t','true'].includes(await query(`select observed_at is null and lease_token=${lit(token)} from private.creator_provider_observation_jobs where account_id=${lit(account)}`)),'expired completion cannot mint freshness or consume lease');
 const failureToken=randomUUID();
 await query(`update private.creator_provider_observation_jobs set lease_token=${lit(failureToken)},lease_until=clock_timestamp()+interval '1 hour',failure_count=0 where account_id=${lit(account)};`);
 assert.equal(JSON.parse(await query(`begin;${service}select public.fail_creator_provider_observation(${lit(account)},${lit(failureToken)});rollback;`)).recorded,true,'valid pre-expiry failure control');
 await query(`update private.creator_provider_observation_jobs set lease_until=clock_timestamp()+interval '2 seconds' where account_id=${lit(account)};`);
 const failure=await race('provider failure lease expires while waiting on job',
  `select account_id from private.creator_provider_observation_jobs where account_id=${lit(account)} for update;select '{}'::jsonb;`,
  service+`select public.fail_creator_provider_observation(${lit(account)},${lit(failureToken)});`,
  {afterBlocked:waitPastExpiry});
 assert.equal(failure.second.recorded,false);
 assert.ok(['t','true'].includes(await query(`select observed_at is null and failure_count=0 and lease_token=${lit(failureToken)} from private.creator_provider_observation_jobs where account_id=${lit(account)}`)),'expired failure cannot consume another lease or alter backoff');
}
