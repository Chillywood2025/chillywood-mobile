import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';
import {seedMatureNativeSale} from '../helpers/native-production-mature-fixture.mjs';

test('default-off native actual economics link once to held earnings, qualified release and current cashout fences',{timeout:600000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 try{
  const f=await seedMatureNativeSale(db),one=f.scalar;
  const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
  assert.equal((await f.reconcile()).status,'disabled');
  assert.equal((await f.rpc('select public.process_native_production_accounting_jobs()')).processed,0);
  assert.equal(await one('select count(*)::int from private.native_production_earning_sources'),0);
  assert.ok(await one('select count(*)::int from private.native_production_accounting_jobs where canonical_receipt_id=$1',[f.receipt]));
  for(const name of ['earning_controls','funding_proofs','funding_revocations','earning_releases','accounting_jobs','accounting_attempts']){
   assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass",[`private.native_production_${name}`]),true);
   for(const role of ['anon','authenticated','service_role'])assert.equal(await one('select has_table_privilege($1,$2,\'INSERT\')',[role,`private.native_production_${name}`]),false);
  }
  await db.exec('update private.native_production_earning_controls set materialize_held=true');
  // A failure after both public inserts must roll them back with their link.
  await db.exec(`create function private.synthetic_native_link_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_atomic_failure';end$$;
   create trigger synthetic_native_link_failure before insert on private.native_production_earning_sources for each row execute function private.synthetic_native_link_failure()`);
  await assert.rejects(f.reconcile(),/synthetic_atomic_failure/);
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events where provider_event_id=$1',[f.receipt]),0);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger where provider_event_id=$1',[f.receipt]),0);
  await db.exec('drop trigger synthetic_native_link_failure on private.native_production_earning_sources;drop function private.synthetic_native_link_failure()');
  const worked=await f.rpc('select public.process_native_production_accounting_jobs(20)');assert.equal(worked.processed,1);
  const held=await f.reconcile();assert.equal(held.status,'HELD');assert.equal(held.reason,'native_release_disabled');
  const earning=held.earningsLedgerId;
  const ledger=(await db.query('select * from public.creator_earnings_ledger where id=$1',[earning])).rows[0];
  assert.equal(ledger.gross_amount_cents,19900);assert.equal(ledger.platform_fee_cents,3120);assert.equal(ledger.provider_fee_cents,3300);
  assert.equal(ledger.tax_cents,1000);assert.equal(ledger.net_creator_amount_cents,12480);assert.equal(ledger.reserve_amount_cents,1248);
  assert.equal(ledger.ledger_status,'held');assert.equal(ledger.source_id,f.video);assert.equal(ledger.creator_id,f.creator);
  const snapshot=await one('select snapshot_id from private.native_production_earning_sources where earnings_ledger_id=$1',[earning]);
  const withdraw=()=>one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[earning]);
  assert.equal(Number(await withdraw()),0);assert.equal((await f.reconcile()).earningsLedgerId,earning);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger where provider_event_id=$1',[f.receipt]),1);
  await db.exec('update private.native_production_earning_controls set release_earnings=true');
  assert.equal((await f.reconcile()).reason,'native_funding_or_maturity_unqualified');
  await tx(async()=>{
   await one(`insert into private.native_production_funding_proofs(canonical_receipt_id,snapshot_id,platform_account_id,recipient_account_id,available_proceeds_minor,currency,
    funds_available_at,verified_at,expires_at,basis,evidence_sha256,delivery_receipt_sha256,recovery_acceptance_id)
    select $1,$2,'acct_cashoutPlatform',$3,15600,'usd',clock_timestamp()-interval '50 days',clock_timestamp()-interval '49 days',clock_timestamp()+interval '1 day',
    'authenticated_transaction_available_proceeds_and_delivery_v1',repeat('1',64),repeat('2',64),id
    from private.commerce_creator_fee_acceptances where creator_id=$4 returning id`,[f.receipt,snapshot,f.accountId,f.creator]);
   assert.equal(await one('select private.native_production_funding_current($1,$2)',[f.receipt,snapshot]),null,'funding/delivery read before purchase is not authority');
   assert.equal((await f.reconcile()).reason,'native_funding_or_maturity_unqualified');
  });
  const funding=await f.seedFunding(snapshot);
  // Current subject revocations after admission/materialization block release.
  for(const [name,sql,args] of [
   ['sanctions','update public.wave1_creator_eligibility set sanctions_clear=false where creator_user_id=$1',[f.creator]],
   ['ban',"update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=$1",[f.creator]],
   ['session expiry',"update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[f.session]],
   ['legal invalidation',"update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where user_id=$1 and capability='account'",[f.creator]],
   ['quarantine',"insert into public.revenuecat_terminal_authority_quarantines(provider_scope,environment_scope,event_type,raw_payload_hash,reason) values('revenuecat_global','production','REFUND',repeat('8',64),'synthetic_hold')",[]],
  ])await tx(async()=>{await db.query(sql,args);assert.equal((await f.reconcile()).reason,'native_release_subject_unqualified',name);
   assert.equal(await one('select public.creator_earnings_current_state_internal($1)',[earning]),'held');});
  assert.equal((await f.reconcile()).status,'available');assert.equal((await f.reconcile()).status,'available');
  assert.equal(await one('select count(*)::int from private.native_production_earning_releases where earnings_ledger_id=$1',[earning]),1);
  assert.equal(Number(await withdraw()),12480,'unchanged 7-day hold and 30-day reserve have actually elapsed in synthetic historical state');
  for(const [sql,args] of [
   ['update public.provider_events set product_id=null where id=$1',[f.receipt]],
   ["update public.provider_events set provider='revenuecat_app_store' where id=$1",[f.receipt]],
   ["update public.provider_events set environment='sandbox' where id=$1",[f.receipt]],
   ['update public.provider_events set user_id=$2 where id=$1',[f.receipt,f.creator]],
   ["update public.provider_events set metadata=metadata||'{\"original_transaction_id\":\"changed-chain\"}' where id=$1",[f.receipt]],
  ])await tx(async()=>{await db.query(sql,args);assert.equal(Number(await withdraw()),0);
   assert.equal((await f.reconcile()).reason,'native_canonical_receipt_changed');});
  // Read-only balance and final dispatch share the same current native gate.
  for(const [sql,args] of [
   ['update private.native_production_earning_controls set release_earnings=false',[]],
   ['insert into private.native_production_funding_revocations(proof_id) values($1)',[funding]],
   ['update public.wave1_creator_eligibility set sanctions_clear=false where creator_user_id=$1',[f.creator]],
   ["update public.videos set storage_path=storage_path||'.changed',storage_object_key=storage_object_key||'.changed' where id=$1",[f.video]],
  ])await tx(async()=>{await db.query(sql,args);assert.equal(Number(await withdraw()),0);});
  await f.claims('authenticated');await db.exec('set role authenticated');
  const request=await one("select public.request_qualified_creator_cashout(10000,'instant',$1,$2,200,0,9800)",[f.qualification,randomUUID()]);
  await db.exec('reset role');
  const claim=stage=>f.rpc('select public.claim_creator_cashout_dispatch($1,$2)',[request.requestId,stage]);
  const dispatchCount=()=>one("select count(*)::int from private.creator_cashout_executions where request_id=$1 and phase<>'prepared'",[request.requestId]);
  await tx(async()=>{assert.equal((await claim('funding')).claimed,true);});
  assert.equal(await dispatchCount(),0);
  // Each native positive operation has a fixed lock budget, never waits behind
  // an uncommitted writer and then makes a decision from a stale snapshot.
  if(db.withConnection){
   for(const [name,sql,args] of [
    ['source row locker','select id from public.videos where id=$1 for update',[f.video]],
    ['scope revocation','insert into private.native_production_scope_revocations(qualification_id) values($1)',[f.scopeQualification]],
    ['eligibility writer','update public.wave1_creator_eligibility set sanctions_clear=false where creator_user_id=$1',[f.creator]],
    ['session writer',"update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[f.session]],
    ['quarantine insert',"insert into public.revenuecat_terminal_authority_quarantines(provider_scope,environment_scope,event_type,raw_payload_hash,reason) values('revenuecat_global','production','REFUND',repeat('8',64),'synthetic_hold')",[]],
    ['report overlap','select private.append_native_production_report($1,$2)',[f.receipt,{...f.base,id:'late-refund',kind:'refund',negativeId:'synthetic-refund',effectiveAt:f.base.observedAt,amountMinor:null}]],
    ['global accounting holder',"select pg_advisory_xact_lock(hashtextextended('native-production-accounting',0))",[]],
    ['creator holder',"select pg_advisory_xact_lock(hashtextextended('creator-payout:'||$1,0))",[f.creator]],
   ])await db.withConnection(async holder=>{
    await holder.query('begin');try{
     await holder.query(sql,args);
     await assert.rejects(claim('funding'),error=>error.code==='55P03',`${name} blocks funding before dispatch`);
     assert.equal(await dispatchCount(),0);
    }finally{await holder.query('rollback');}
    await tx(async()=>{assert.equal((await claim('funding')).claimed,true,`${name} rollback permits fresh retry`);});
   });
  }
  await tx(async()=>{
   await db.exec('set transaction isolation level repeatable read');
   await f.claims('service_role');await db.exec('set role service_role');
   await assert.rejects(db.query("select public.claim_creator_cashout_dispatch($1,'funding')",[request.requestId]),/native_production_read_committed_required/);
  });
  assert.equal((await claim('funding')).claimed,true);
  await f.rpc('select public.record_creator_cashout_observation($1,null,$2)',[request.requestId,
   {kind:'transfer',objectId:'tr_syntheticNative',amountMinor:9800,reversedMinor:0,fullyReversed:false,accountId:f.accountId,environment:'live'}]);
  await tx(async()=>{assert.equal((await claim('payout')).claimed,true);});
  // Committed refund overlap must veto funded-but-undispatched bank payout,
  // preserve the original money and require existing correction qualification.
  const negative={...f.base,id:'committed-refund',kind:'refund',negativeId:'synthetic-committed-refund',effectiveAt:f.base.observedAt,amountMinor:null};
  if(db.withConnection)await db.withConnection(async holder=>{
   await holder.query('begin');await holder.query('select private.append_native_production_report($1,$2)',[f.receipt,negative]);
   await assert.rejects(claim('payout'),error=>error.code==='55P03');await holder.query('commit');
  });else await f.append(negative);
  assert.equal(Number(await withdraw()),0);
  const stopped=await claim('payout');assert.equal(stopped.claimed,false);assert.equal(stopped.status,'funding_return_pending');
  assert.equal(await one("select count(*)::int from private.creator_cashout_dispatch_provenance p join private.creator_cashout_executions e on e.id=p.execution_id where e.request_id=$1 and p.event='payout_started'",[request.requestId]),0);
  await assert.rejects(claim('funding_return'),/funding_return_qualification_required/);
  // Distinct receipts share one bounded queue, but not a positive-operation
  // subtransaction. A deterministic bad receipt must not roll back a good one.
  await db.exec('update private.native_production_earning_controls set release_earnings=false');
  const sharedLegalVersion='synthetic-native-isolated-worker';
  const bad=await seedMatureNativeSale(db,{sharedLegalVersion}),good=await seedMatureNativeSale(db,{sharedLegalVersion});
  await db.exec(`create function private.synthetic_bad_receipt_failure() returns trigger language plpgsql as $$begin
   if new.canonical_receipt_id='${bad.receipt}'::uuid then raise exception 'synthetic_per_receipt_failure';end if;return new;end$$;
   create trigger synthetic_bad_receipt_failure before insert on private.native_production_earning_sources for each row execute function private.synthetic_bad_receipt_failure()`);
  assert.equal((await good.rpc('select public.process_native_production_accounting_jobs(20)')).processed,3);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger where provider_event_id=$1',[bad.receipt]),0,'bad receipt subtransaction rolls back both public ledger inserts');
  assert.equal(await one('select count(*)::int from private.native_production_earning_sources where canonical_receipt_id=$1',[good.receipt]),1,'good receipt still commits held earnings');
  assert.equal(await one("select result->>'reason' from private.native_production_accounting_attempts where canonical_receipt_id=$1 order by id desc limit 1",[bad.receipt]),'accounting_attempt_failed');
  await db.exec('drop trigger synthetic_bad_receipt_failure on private.native_production_earning_sources;drop function private.synthetic_bad_receipt_failure()');
  if(db.withConnection)await db.withConnection(async holder=>{
   await holder.query('begin;lock table private.native_production_accounting_attempts in exclusive mode');
   try{await assert.rejects(good.rpc('select public.process_native_production_accounting_jobs(20)'),error=>error.code==='55P03','failed-attempt persistence also obeys NOWAIT');}
   finally{await holder.query('rollback');}
  });
 }finally{await db.close();}
});
