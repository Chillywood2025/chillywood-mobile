import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';
import {seedMatureNativeSale} from '../helpers/native-production-mature-fixture.mjs';
import {seedQualifiedCommerceMerch} from '../helpers/qualified-commerce-merch-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';

const finalizerOnly=process.env.NATIVE_CORRECTION_FINALIZER_ONLY==='1';
const timezoneOnly=process.env.NATIVE_CORRECTION_TIMEZONE_ONLY==='1';
const excludeRetainedCapacity=process.env.NATIVE_CORRECTION_EXCLUDE_RETAINED_CAPACITY==='1';
// Full PGlite retained-history run took 1903s locally; bound that slow-engine
// mode at one hour. Native/focused work starts at ten minutes; capture guards stay unchanged.
const fullPglite=!process.env.NATIVE_DEPLOYMENT_PG_BIN&&!finalizerOnly&&!timezoneOnly&&!excludeRetainedCapacity;
const parentTimeoutMs=fullPglite?3600000:600000;
test(timezoneOnly?'focused native correction timezone diagnostic (later correctness and capacity excluded)':finalizerOnly?'focused native correction multi-allocation finalizer diagnostic (capacity and later groups excluded)':excludeRetainedCapacity?'native correction correctness diagnostic (retained-capacity block excluded)':'signed native corrections account only actual issued liability, retain current authority and fence final dispatch',{timeout:parentTimeoutMs},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 try{
  const f=await seedMatureNativeSale(db),one=f.scalar;
  const tx=async fn=>{await db.exec('reset role;begin');try{await fn();}finally{await db.exec('rollback;reset role');}};
  const qualify=async sale=>one(`insert into private.native_production_correction_qualifications(scope_id,report_schema,basis,evidence_sha256,verified_at,expires_at)
   values($1,'synthetic-signed-v1','authenticated_transaction_signed_deltas_and_cumulative_proceeds_v1',repeat('a',64),clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour') returning id`,[sale.scopeQualification]);
  const report=async(sale,qualification,revision,components,proceeds,patch={})=>{
   const stamp=new Date().toISOString();
   const snapshot=await one("select id from private.native_production_economic_snapshots where canonical_receipt_id=$1 and projection->'economicCoverageComplete'='true'::jsonb order by created_at desc,id desc limit 1",[sale.receipt]);
   return {protocol:'native-production-signed-correction-v1',id:`correction-${revision}`,revision,baselineSnapshotId:snapshot,
    initialJournalSha256:await one('select private.native_production_initial_journal_hash($1)',[sale.receipt]),qualificationId:qualification,
    reportSchema:'synthetic-signed-v1',evidenceSha256:'e'.repeat(64),observedAt:stamp,through:stamp,
    ...Object.fromEntries(['provider','environment','projectId','appId','storeAccountId','productId','currency','buyerId','transactionId','originalTransactionId'].map(key=>[key,sale.base[key]])),
    creatorId:sale.creator,admissionId:sale.admission,sourceVersionId:sale.version,sourceProofId:sale.proof,reportedProceedsMinor:String(proceeds),components,
    negativeBindings:(await one('select private.native_production_negative_manifest($1)',[sale.receipt])).map(row=>{
     const refund=components.find(item=>item.category==='refund_gross'&&Number(item.amountMinor)>0);
     return {...row,economicEventId:refund?.economicEventId??'refund-one',amountMinor:refund?.amountMinor??'1',effectiveAt:refund?.occurredAt??stamp};
    }),...patch};
  };
  const component=(id,category,amount,reverses=null,event=id)=>({componentId:id,economicEventId:event,category,amountMinor:String(amount),occurredAt:new Date().toISOString(),reversesComponentId:reverses});
  const append=(sale,row)=>one('select private.append_native_production_correction($1,$2)',[sale.receipt,row]);
  const evaluate=sale=>one('select private.evaluate_native_production_correction($1)',[sale.receipt]);
  const capture=(sale=f)=>one('select private.capture_native_production_global_liability($1)',[sale.creator]);
  const funding=async(sale,available=null)=>one(`insert into private.native_production_corrected_funding_proofs(checkpoint_id,liability_generation,liability_sha256,actual_available_minor,currency,
   platform_account_id,recipient_account_id,basis,evidence_sha256,delivery_receipt_sha256,verified_at,expires_at)
   select point.id,(liability->>'generation')::bigint,liability->>'sha256',coalesce($3::bigint,(liability->>'amountMinor')::bigint),'usd','acct_cashoutPlatform',$2,
    'authenticated_single_platform_usd_global_creator_liability_v1',repeat('f',64),repeat('d',64),clock_timestamp(),clock_timestamp()+interval '1 hour'
   from private.native_production_correction_checkpoints point cross join lateral(select private.capture_native_production_global_liability($4) liability) current_liability
   where point.canonical_receipt_id=$1 order by point.id desc limit 1 returning id`,[sale.receipt,sale.accountId,available,sale.creator]);
  const withdraw=earning=>one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[earning]);
  const currentAuthority=earning=>one(`select jsonb_build_object('correctionReasons',private.evaluate_native_production_correction($1)->'reasons',
   'originalIntegrity',private.native_production_original_integrity($1),'currentDomain',private.native_production_current_earning_domain_ready($2),
   'currentFunding',private.native_production_corrected_funding_current($1,(select max(id) from private.native_production_correction_checkpoints where canonical_receipt_id=$1)) is not null,
   'maturity', (select jsonb_build_object('normalDeltaSeconds',extract(epoch from (c.purchased_at+p.normal_hold-e.normal_eligible_at)),
    'reserveDeltaSeconds',extract(epoch from (c.purchased_at+p.normal_hold+p.reserve_duration-e.reserve_release_at)))
    from public.creator_earnings_ledger e join private.native_production_purchase_correlations c on c.canonical_receipt_id=e.provider_event_id
    join public.creator_money_settlement_policies p on p.source_type=e.source_type where e.id=$2))`,[f.receipt,earning]);
  const syntheticLiabilities=async({count=1,environment='production',currency='usd',createdAt='2000-01-01T00:00:00Z',ledgerStatus='held',amount=1}={})=>(await db.query(`with keys as materialized(
   select gen_random_uuid()::text key from generate_series(1,$4)),canonical as(
   insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key)
    select 'stripe_connect',key,$1,$2,'synthetic_liability_fixture','processed',key from keys returning id),money as(
   insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
    select $1,$1,canonical.id,'synthetic_liability_fixture',$7,$3,$2,case when $2='sandbox' then 'not_payable' when $6='available' then 'payable' else 'pending_verification' end,
     case when $2='sandbox' then 'sandbox_only' when $6='available' then 'verified' else 'pending' end,'tip',
     case when $6='available' then '{"payout_readiness_proved":true,"live_money_enabled_at_verification":true,"synthetic_fixture":true}'::jsonb else '{}'::jsonb end
     from canonical returning id,provider_event_id)
   insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,currency,ledger_status,money_ledger_event_id,provider_event_id,created_at,
    settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version)
    select $1,'tip',$7,$7,$3,$6,money.id,money.provider_event_id,$5::timestamptz,$5::timestamptz,$5::timestamptz+interval '7 days',1,
     $5::timestamptz+interval '37 days','2026-08-31-v1' from money returning id,money_ledger_event_id,provider_event_id`,[f.creator,environment,currency,count,createdAt,ledgerStatus,amount])).rows;
  const financialFingerprint=()=>one(`select jsonb_build_object('canonical',(select count(*) from public.provider_events),
   'money',(select count(*) from public.money_access_ledger_events),'earnings',(select count(*) from public.creator_earnings_ledger),
   'originalLinks',(select count(*) from private.native_production_earning_sources),'creditLinks',(select count(*) from private.native_production_credit_sources),
   'checkpoints',(select count(*) from private.native_production_correction_checkpoints),'offsets',(select count(*) from private.commerce_creator_fee_offsets),
   'history',(select count(*) from private.native_production_liability_history),'generation',(select to_jsonb(g) from private.native_production_liability_generation g),
   'observations',(select count(*) from private.native_production_paid_video_observations),'holds',(select count(*) from private.native_production_paid_video_ledger_holds),
   'jobs',(select count(*) from private.native_production_accounting_jobs),
   'reportJobs',(select count(*) from private.native_production_report_jobs))`);
  const seedLateObservation=async({linked=true}={})=>{
   const suffix=randomUUID(),facts={...f.facts,providerEventId:`late-${suffix}`,transactionId:`late-transaction-${suffix}`,originalTransactionId:`late-original-${suffix}`};
   await f.rpc('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[facts.providerEventId,facts.rawPayloadHash]);
   const receipt=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
    select $2,provider,product_id,product_key,user_id,app_user_id,environment,event_type,'processed',occurred_at,$2,raw_payload_hash,
     metadata||jsonb_build_object('original_transaction_id',$3::text) from public.provider_events where id=$1 returning id`,[f.receipt,facts.providerEventId,facts.originalTransactionId]);
   facts.canonicalReceiptId=receipt;
   if(linked){
    const money=await one(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type)
     values($1,$2,$3,'synthetic_legacy_generic',19900,'usd','production','pending_verification','pending','tip') returning id`,[f.buyer,f.creator,receipt]);
    await db.query(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,currency,ledger_status,money_ledger_event_id,provider_event_id)
     values($1,'tip',19900,19900,'usd','held',$2,$3)`,[f.creator,money,receipt]);
   }
   return {receipt,facts,append:()=>f.rpc('select public.record_native_production_ingress_observation($1)',[facts])};
  };
  await db.exec('update private.native_production_earning_controls set materialize_held=true');
  const earning=(await f.reconcile()).earningsLedgerId;
  const snapshot=await one('select snapshot_id from private.native_production_earning_sources where earnings_ledger_id=$1',[earning]);
  await f.seedFunding(snapshot);await db.exec('update private.native_production_earning_controls set release_earnings=true');
  assert.equal((await f.reconcile()).status,'available');assert.equal(Number(await withdraw(earning)),12480);
  const qualification=await qualify(f),fee=component('fee-add','store_fee',1000),first=await report(f,qualification,1,[fee],14600);
  const reportId=await append(f,first);
  assert.equal(await append(f,first),reportId,'exact report retry is immutable/idempotent');
  const firstEvaluation=await evaluate(f);
  assert.equal(firstEvaluation.complete,true,JSON.stringify({complete:firstEvaluation.complete,reasons:firstEvaluation.reasons,targetMinor:firstEvaluation.targetMinor,
   retainedGrossMinor:firstEvaluation.retainedGrossMinor,providerFeeMinor:firstEvaluation.providerFeeMinor,taxMinor:firstEvaluation.taxMinor}));
  assert.equal(firstEvaluation.providerFeeMinor,'4300');assert.equal(firstEvaluation.taxMinor,'1000');
  assert.equal(firstEvaluation.targetMinor,'11680');
  assert.equal(Number(await withdraw(earning)),0,'new correction immediately holds the existing earning even with correction worker OFF');
  assert.equal((await f.reconcile()).reason,'native_correction_accounting_disabled');
  assert.equal(await one('select count(*)::int from private.native_production_correction_checkpoints'),0);
  await db.exec('update private.native_production_earning_controls set account_corrections=true');
  assert.equal((await f.reconcile()).reason,'corrected_funding_required');
  const point=await one('select id from private.native_production_correction_checkpoints where report_id=$1',[reportId]);
  assert.equal(Number(await one('select private.creator_fee_recovery_amount($1,\'usd\')',[f.creator])),800);
  assert.equal((await one('select private.native_production_unpaid_liability($1)',[f.receipt])).amountMinor,'12480','unpaid old liability does not shrink merely because an unconsumed debt exists');
  await f.reconcile();assert.equal(await one('select count(*)::int from private.native_production_correction_checkpoints where report_id=$1',[reportId]),1);
  assert.equal(await one('select net_creator_amount_cents from public.creator_earnings_ledger where id=$1',[earning]),12480);
  assert.equal(await one('select status from public.provider_events where id=$1',[f.receipt]),'ignored','normal held ingress is not rewritten to processed');
  assert.equal(await one('select private.native_production_liability_provenance(e) from public.creator_earnings_ledger e where id=$1',[earning]),'production');
  await funding(f);assert.equal((await f.reconcile()).status,'accounted');assert.equal(Number(await withdraw(earning)),12480);
  const reversal=component('fee-return','store_fee',-1000,'fee-add'),second=await report(f,qualification,2,[fee,reversal],15600);
  await append(f,second);
  await db.exec(`create function private.synthetic_credit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_credit_atomic_failure';end$$;
   create trigger synthetic_credit_failure before insert on private.native_production_credit_sources for each row execute function private.synthetic_credit_failure()`);
  const publicCount=await one('select count(*)::int from public.creator_earnings_ledger'),atomicBefore=await financialFingerprint();
  await assert.rejects(f.reconcile(),/synthetic_credit_atomic_failure/);
  assert.deepEqual(await financialFingerprint(),atomicBefore,'mid-credit failure rolls back every canonical/money/earning/link/checkpoint/generation effect');
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),publicCount,'failed mid-credit write rolls back canonical, money, earning and checkpoint together');
  assert.equal(await one("select count(*)::int from public.provider_events where event_type='native_verified_correction_credit'"),0);
  await db.exec('drop trigger synthetic_credit_failure on private.native_production_credit_sources;drop function private.synthetic_credit_failure()');
  assert.equal((await f.reconcile()).reason,'corrected_funding_required');
  const credit=await one('select credit_earnings_id from private.native_production_correction_checkpoints where canonical_receipt_id=$1 order by id desc limit 1',[f.receipt]);
  assert.ok(credit);assert.equal(await one('select source_type from public.creator_earnings_ledger where id=$1',[credit]),'paid_content');
  assert.equal(Number(await withdraw(credit)),0);
  for(const issued of [earning,credit])await tx(async()=>{
   const before=await capture(),row=await one('select to_jsonb(e) from public.creator_earnings_ledger e where id=$1',[issued]);
   const money=await one('select to_jsonb(m) from public.money_access_ledger_events m where id=$1',[row.money_ledger_event_id]);
   await db.query("update public.money_access_ledger_events set environment='sandbox',status='sandbox_only',payable_state='not_payable' where id=$1",[money.id]);
   await db.query("update public.provider_events set environment='sandbox' where id=$1",[row.provider_event_id]);
   assert.equal(await capture(),null,'paired mutable sandbox labels cannot erase an immutable original or positive credit liability');
   assert.equal(await one('select private.native_production_liability_provenance(e) from public.creator_earnings_ledger e where id=$1',[issued]),'unknown');
   assert.equal(await one('select private.native_production_global_usd_liability()'),null);
   await db.query('update public.money_access_ledger_events set environment=$2,status=$3,payable_state=$4 where id=$1',[money.id,money.environment,money.status,money.payable_state]);
   await db.query("update public.provider_events set environment='production' where id=$1",[row.provider_event_id]);
   const restored=await capture();assert.equal(restored.amountMinor,before.amountMinor);assert.notEqual(restored.sha256,before.sha256,'restored production labels cannot revive the earlier proof');
  });
  await db.exec('update private.native_production_earning_controls set release_correction_credits=true');await funding(f);
  const released=await f.reconcile();assert.equal(released.status,'accounted');assert.equal(released.recoveryConsumedMinor,'800');assert.equal(released.fundingRefreshRequired,true);
  assert.equal(Number(await one("select private.creator_fee_recovery_amount($1,'usd')",[f.creator])),0);
  assert.equal(Number(await withdraw(earning)),0,'actual offset changes liability hash and requires fresh funding read');
  await funding(f);await f.reconcile();assert.equal(Number(await withdraw(earning)),12480);assert.equal(Number(await withdraw(credit)),0,'issued credit was consumed once by future-only debt');
  assert.equal((await one('select private.native_production_unpaid_liability($1)',[f.receipt])).amountMinor,'12480');
  await tx(async()=>{
   const rebate=component('original-store-rebate','store_fee',-1000,'initial:store_fee');
   await append(f,await report(f,qualification,3,[fee,reversal,rebate],16600));
   const opening=await evaluate(f);assert.equal(opening.complete,true,JSON.stringify({stage:'multi-allocation actual baseline rebate',reasons:opening.reasons}));
   await f.reconcile();await funding(f);await f.reconcile();
   const extra=await one('select credit_earnings_id from private.native_production_correction_checkpoints where canonical_receipt_id=$1 order by id desc limit 1',[f.receipt]);
   assert.equal(Number(await withdraw(extra)),800);
   await f.claims('authenticated');await db.exec('set role authenticated');
   const request=await one("select public.request_qualified_creator_cashout(13000,'instant',$1,$2,260,0,12740)",[f.qualification,randomUUID()]);await db.exec('reset role');
   assert.equal(await one('select count(*)::int from public.creator_payout_allocations where payout_request_id=$1',[request.requestId]),2,'normal cashout reserves both original and correction credit');
   const context=await f.rpc('select public.get_creator_cashout_execution_context($1)',[request.requestId]);
   const claim=stage=>f.rpc('select public.claim_creator_cashout_dispatch($1,$2)',[request.requestId,stage]);
   const observe=(facts,token=null)=>f.rpc('select public.record_creator_cashout_observation($1,$2,$3)',[request.requestId,token,JSON.stringify(facts)]);
   const funded=await claim('funding');assert.equal(funded.claimed,true);
   await observe({kind:'transfer',objectId:'tr_nativeMultiFunding',amountMinor:12740,reversedMinor:0,fullyReversed:false,accountId:context.accountId,environment:'live'},funded.token);
   const payout=await claim('payout');assert.equal(payout.claimed,true);
   await observe({kind:'payout',objectId:'po_nativeMultiBank',status:'paid',amountMinor:12740,accountId:context.accountId,destinationId:context.destinationId,
    environment:'live',balanceTransactionId:'txn_nativeMultiBank',failureBalanceTransactionId:null},payout.token);
   const reportFacts={schemaVersion:1,accountId:context.platformAccountId,environment:'live',payoutId:'po_nativeMultiBank',
    reportType:'all_fees.incurred_at.itemized.2',reportRunId:'frr_nativeMultiActual',fileId:'file_nativeMultiActual',contentSha256:'a'.repeat(64),providerBinding:'authenticated_report',rows:[]};
   const recordFee=facts=>f.rpc('select public.record_creator_cashout_fee_report($1,$2)',[request.requestId,JSON.stringify(facts)]);
   assert.equal((await recordFee(reportFacts)).observedProviderFeeMinor,null,'missing fee rows cannot finalize even after provider paid');
   const actual={...reportFacts,reportRunId:'frr_nativeMultiExplicitZero',rows:[{feeTransactionId:'fee_nativeMultiCost',incurredBy:'po_nativeMultiBank',incurredByType:'payout',
    amountMinor:0,taxMinor:0,currency:'usd',product:'Connect',suite:'Payments',featureName:'Instant payout',pricingTier:'',settledVia:'balance'}]};
   const before=await one('select generation::text from private.native_production_liability_generation');
   assert.equal((await recordFee(actual)).accountingComplete,true,'normal verified-fee finalizer atomically pays two native allocations');
   assert.equal(await one("select count(*)::int from public.creator_payout_allocations where payout_request_id=$1 and state='paid'",[request.requestId]),2);
   const paid=await one('select generation::text from private.native_production_liability_generation');assert.ok(BigInt(paid)>BigInt(before));
   assert.equal((await recordFee(actual)).accountingComplete,true,'verified paid result replay is idempotent');
   assert.equal(await one('select generation::text from private.native_production_liability_generation'),paid);
  });
  process.stdout.write('native correction normal two-allocation fund/payout/actual-fee finalizer and replay passed\n');
  if(finalizerOnly)return;
  await tx(async()=>{const baseline=await currentAuthority(earning);await db.exec("set timezone='America/Los_Angeles'");
    const changed=await currentAuthority(earning);process.stdout.write(`native timezone authority ${JSON.stringify({baseline,changed})}\n`);
    assert.equal(Number(await withdraw(earning)),12480,JSON.stringify(changed));
    assert.equal(await one("select private.native_production_policy_deadline('2025-10-15T12:00:00Z'::timestamptz,interval '37 days')='2025-11-21T12:00:00Z'::timestamptz"),true,'fixed DST-crossing policy remains exactly 37 UTC days');
    assert.equal(await one("select current_setting('TimeZone')"),'America/Los_Angeles','native arithmetic does not alter the caller or nested legacy domain timezone');});
  // A fixed historical October purchase crosses November DST regardless of
  // today's season. All synthetic admission/proof/terms dates precede purchase.
  const dstPurchaseAge=`${Math.floor((Date.now()-Date.parse('2025-10-15T12:00:00Z'))/1000)} seconds`;
  for(const corrected of [false,true])await tx(async()=>{
   await db.exec("set timezone='UTC'");const sale=await seedMatureNativeSale(db,{purchaseAge:dstPurchaseAge});
   await db.exec("set timezone='America/Los_Angeles'");
   let issued;
   if(corrected){const q=await qualify(sale);await append(sale,await report(sale,q,1,[component('dst-opening-fee','store_fee',1000)],14600));
    assert.equal((await sale.reconcile()).reason,'corrected_funding_required');
    issued=await one('select earnings_ledger_id from private.native_production_earning_sources where canonical_receipt_id=$1',[sale.receipt]);
    await funding(sale);await sale.reconcile();
   }else{issued=(await sale.reconcile()).earningsLedgerId;
    await sale.seedFunding(await one('select snapshot_id from private.native_production_earning_sources where earnings_ledger_id=$1',[issued]));await sale.reconcile();}
   const duration=await one(`select jsonb_build_object('normal',extract(epoch from normal_eligible_at-settlement_started_at),'reserve',extract(epoch from reserve_release_at-settlement_started_at))
    from public.creator_earnings_ledger where id=$1`,[issued]);
   assert.deepEqual(duration,{normal:7*86400,reserve:37*86400},'creation in DST timezone uses exact native UTC policy durations');
   assert.equal(await one("select current_setting('TimeZone')"),'America/Los_Angeles');
   assert.equal(Number(await withdraw(issued)),corrected?11680:12480);
   await db.exec("set timezone='UTC'");assert.equal(Number(await withdraw(issued)),corrected?11680:12480,'original and corrected openings recheck identically after caller timezone changes');
  });
  process.stdout.write('native fixed-DST original and corrected opening creation/rechecks passed\n');
  if(timezoneOnly)return;
  await tx(async()=>{
   const before=await capture(),proofBefore=await one('select clock_timestamp()::text');
   // Recorded wall time deliberately cannot distinguish these changes. The
   // monotonic counter, not a timestamp or business created_at, is authority.
   await db.exec(`create function private.synthetic_same_generation_time() returns trigger language plpgsql as $$begin new.recorded_at:=old.recorded_at;return new;end$$;
    create trigger synthetic_same_generation_time before update on private.native_production_liability_generation for each row execute function private.synthetic_same_generation_time()`);
   const recordedAt=await one('select recorded_at::text from private.native_production_liability_generation');
   let expected=BigInt(before.generation);const moneyIds=[];
   for(let index=0;index<2;index++){
    const canonical=await one(`insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key)
     values('stripe_connect',$2,$1,'production','synthetic_liability_fixture','processed',$2) returning id`,[f.creator,randomUUID()]);
    const moneyId=await one(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type)
     values($1,$1,$2,'synthetic_liability_fixture',1,'usd','production','pending_verification','pending','tip') returning id`,[f.creator,canonical]);
    moneyIds.push(moneyId);
    assert.equal(BigInt(await one('select generation::text from private.native_production_liability_generation')),expected,'unlinked money alone is not an earning liability');
    await db.query(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,currency,ledger_status,money_ledger_event_id,provider_event_id,created_at)
     values($1,'tip',1,1,'usd','held',$2,$3,'2000-01-01T00:00:00Z')`,[f.creator,moneyId,canonical]);
    expected+=1n;
    assert.equal(BigInt(await one('select generation::text from private.native_production_liability_generation')),expected,'each new earning identity advances generation once');
    assert.equal(await one('select private.native_production_global_usd_liability()'),null,'each business-backdated earning invalidates the cached snapshot');
    await db.query('update public.money_access_ledger_events set environment=environment where id=$1',[moneyId]);
    await db.exec('savepoint immutable_earning');
    await assert.rejects(db.query('update public.creator_earnings_ledger set net_creator_amount_cents=net_creator_amount_cents where money_ledger_event_id=$1',[moneyId]),/creator_earnings_ledger_is_append_only/);
    await db.exec('rollback to savepoint immutable_earning;release savepoint immutable_earning');
    assert.equal(BigInt(await one('select generation::text from private.native_production_liability_generation')),expected,'supported provenance no-op and rejected earning UPDATE leave generation unchanged');
   }
   const inserted=await capture();assert.equal(BigInt(inserted.generation),BigInt(before.generation)+2n);
   await db.query("update public.money_access_ledger_events set environment='sandbox',payable_state='not_payable',status='sandbox_only' where id=$1",[moneyIds[0]]);expected+=1n;
   assert.equal(BigInt(await one('select generation::text from private.native_production_liability_generation')),expected,'linked money provenance change advances independently');
   assert.equal(await one('select private.native_production_global_usd_liability()'),null);
   await db.query("update public.money_access_ledger_events set environment='production',payable_state='pending_verification',status='pending' where id=$1",[moneyIds[0]]);expected+=1n;
   assert.equal(BigInt(await one('select generation::text from private.native_production_liability_generation')),expected,'restored provenance still has a new identity');
   assert.equal(await one('select recorded_at::text from private.native_production_liability_generation'),recordedAt,'all four changes share identical recorded wall time');
   const after=await capture();assert.equal(BigInt(after.generation),expected);assert.equal(after.amountMinor,inserted.amountMinor);
   assert.notEqual(after.sha256,inserted.sha256,'same-time provenance ABA cannot revive the earlier proof');
   await db.exec('drop trigger synthetic_same_generation_time on private.native_production_liability_generation;drop function private.synthetic_same_generation_time()');
   await db.query(`insert into private.native_production_corrected_funding_proofs(checkpoint_id,liability_generation,liability_sha256,actual_available_minor,currency,
    platform_account_id,recipient_account_id,basis,evidence_sha256,delivery_receipt_sha256,verified_at,expires_at)
    select id,$2,$3,$4,'usd','acct_cashoutPlatform',$5,'authenticated_single_platform_usd_global_creator_liability_v1',repeat('c',64),repeat('d',64),$6::timestamptz,clock_timestamp()+interval '1 hour'
    from private.native_production_correction_checkpoints where canonical_receipt_id=$1 order by id desc limit 1`,
    [f.receipt,after.generation,after.sha256,after.amountMinor,f.accountId,proofBefore]);
   assert.equal(Number(await withdraw(earning)),0,'current hash with pre-generation balance observation is insufficient');
   await funding(f);assert.equal(Number(await withdraw(earning)),12480);
  });
  await tx(async()=>{
   const before=await capture(),sandbox=await syntheticLiabilities({environment:'sandbox'});
   assert.deepEqual(await capture(),before,'genuine sandbox liability does not enter the pool or advance generation');
   await db.query("update public.money_access_ledger_events set environment='production' where id=$1",[sandbox[0].money_ledger_event_id]);
   assert.equal(await capture(),null,'changing only the money environment cannot promote canonical sandbox provenance');
   assert.equal(await one('select reason from private.native_production_liability_capture_failures order by id desc limit 1'),'unknown_provenance');
   await db.query("update public.money_access_ledger_events set environment='sandbox' where id=$1",[sandbox[0].money_ledger_event_id]);
   const restored=await capture();assert.equal(restored.amountMinor,before.amountMinor);assert.notEqual(restored.sha256,before.sha256,'pool provenance ABA cannot restore an earlier proof');
  });
  for(const key of ['native_snapshot_id','native_correction_report_id','native_opening_report_id'])await tx(async()=>{
   const row=(await syntheticLiabilities({environment:'sandbox'}))[0],before=await capture();
   for(const marker of [null,randomUUID()]){
    await db.query('update public.money_access_ledger_events set metadata=metadata||jsonb_build_object($2::text,$3::jsonb) where id=$1',[row.money_ledger_event_id,key,JSON.stringify(marker)]);
    const generation=await one('select generation::text from private.native_production_liability_generation');
    assert.ok(BigInt(generation)>BigInt(before.generation));assert.equal(await one('select private.native_production_global_usd_liability()'),null);
    assert.equal(await capture(),null,'present native marker, including JSON null, contradicts generic sandbox exclusion');
    await db.query('update public.money_access_ledger_events set metadata=metadata||jsonb_build_object($2::text,$3::jsonb) where id=$1',[row.money_ledger_event_id,key,JSON.stringify(marker)]);
    assert.equal(await one('select generation::text from private.native_production_liability_generation'),generation,'identical marker presence/value is a no-op');
    await db.query('update public.money_access_ledger_events set metadata=metadata-$2::text where id=$1',[row.money_ledger_event_id,key]);
    const restored=await capture();assert.equal(restored.amountMinor,before.amountMinor);assert.notEqual(restored.sha256,before.sha256,'absent/present/null/absent cannot revive an old proof');
   }
  });
  for(const environment of ['sandbox','production'])await tx(async()=>{
   const row=(await syntheticLiabilities({environment}))[0],before=await capture();
   await db.query('update public.money_access_ledger_events set provider_event_id=null where id=$1',[row.money_ledger_event_id]);
   assert.equal(await one('select private.native_production_liability_provenance(e) from public.creator_earnings_ledger e where id=$1',[row.id]),'unknown');
   assert.equal(await capture(),null,'missing canonical money pointer cannot qualify sandbox or pending production');
   await db.query('update public.money_access_ledger_events set provider_event_id=$2 where id=$1',[row.money_ledger_event_id,row.provider_event_id]);
   const restored=await capture();assert.equal(restored.amountMinor,before.amountMinor);assert.notEqual(restored.sha256,before.sha256);
  });
  await tx(async()=>{
   const before=await capture(),money=await one('select to_jsonb(m) from public.money_access_ledger_events m where id=(select money_ledger_event_id from public.creator_earnings_ledger where id=$1)',[earning]);
   await db.query("update public.money_access_ledger_events set payable_state='pending_verification',status='pending',provider_event_id=null where id=$1",[money.id]);
   assert.equal(await capture(),null,'native ignored identity also requires the exact money-to-receipt pointer');
   const wrong=await one("insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key) values('stripe_connect',$2,$1,'production','synthetic_unlinked','processed',$2) returning id",[f.buyer,randomUUID()]);
   await db.query('update public.money_access_ledger_events set provider_event_id=$2 where id=$1',[money.id,wrong]);
   assert.equal(await capture(),null,'a non-null but mismatched pointer remains unknown');
   await db.query('update public.money_access_ledger_events set provider_event_id=$2,payable_state=$3,status=$4 where id=$1',[money.id,money.provider_event_id,money.payable_state,money.status]);
   const restored=await capture();assert.equal(restored.amountMinor,before.amountMinor);assert.notEqual(restored.sha256,before.sha256);
  });
  await tx(async()=>{
   const late=await seedLateObservation(),before=await capture();await late.append();
   assert.equal(await one('select private.native_production_global_usd_liability()'),null,'normal late observer invalidates previously generic production coverage');
   assert.ok(BigInt(await one('select generation::text from private.native_production_liability_generation'))>BigInt(before.generation));assert.equal(await capture(),null);
  });
  await tx(async()=>{
   const late=await seedLateObservation({linked:false}),before=await capture();await late.append();assert.deepEqual(await capture(),before,'an observation without an earning creates no liability generation');
  });
  await tx(async()=>{
   const late=await seedLateObservation();await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   const generation=await one('select generation::text from private.native_production_liability_generation');await late.append();
   assert.equal(await one('select generation::text from private.native_production_liability_generation'),generation,'OFF late observation does not touch generation');
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');assert.equal(await capture(),null);
  });
  await tx(async()=>{await syntheticLiabilities({currency:'eur'});assert.equal(await capture(),null,'non-USD liability is not converted or ignored');
   assert.equal(await one('select reason from private.native_production_liability_capture_failures order by id desc limit 1'),'unsupported_currency');});
  await tx(async()=>{
   await db.query("insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,currency,ledger_status) values($1,'tip',1,1,'usd','held')",[f.creator]);
   assert.equal(await capture(),null,'unbound production provenance cannot be assumed');
  });
  await tx(async()=>{
   const generic=(await syntheticLiabilities())[0];await db.query("update public.provider_events set status='ignored' where id=$1",[generic.provider_event_id]);
   assert.equal(await capture(),null,'generic ignored receipts are not accepted by the narrow native exception');
   const count=await one('select count(*)::int from private.native_production_liability_capture_failures');
   assert.equal(await capture(),null);assert.equal(await one('select count(*)::int from private.native_production_liability_capture_failures'),count,'same generation/reason diagnostic is deduplicated');
  });
  await tx(async()=>{
   await db.query("update public.provider_events set product_key='wrong-native-product' where id=$1",[f.receipt]);
   assert.equal(await capture(),null,'ignored native receipt still requires its exact immutable canonical tuple');
  });
  await tx(async()=>{
   const before=await capture();await db.query('insert into private.native_production_source_revocations values($1)',[f.proof]);
   assert.equal(Number(await withdraw(earning)),0);assert.deepEqual(await capture(),before,'source revocation holds release without extinguishing issued liability');
  });
  await tx(async()=>{
   const sandbox=(await syntheticLiabilities({environment:'sandbox'}))[0],before=await capture();
   await db.query(`insert into private.creator_fee_credit_sources(earnings_ledger_id,creator_id,original_earnings_ledger_id,source_type,source_id,evidence_hash,amount_minor,platform_account_id,recipient_account_id,acceptance_id)
    select $1,$2,$3,'cashout_fee',$4,repeat('a',64),1,'acct_cashoutPlatform',$5,id from private.commerce_creator_fee_acceptances where creator_id=$2 limit 1`,
    [sandbox.id,f.creator,earning,randomUUID(),f.accountId]);
   assert.equal(await one('select private.native_production_global_usd_liability()'),null,'later immutable production lineage invalidates a cached sandbox exclusion');
   assert.ok(BigInt(await one('select generation::text from private.native_production_liability_generation'))>BigInt(before.generation));
   assert.equal(await capture(),null,'contradictory commerce production lineage is not silently excluded');
  });
  await tx(async()=>{
   const before=await capture();await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   const offGeneration=await one('select generation::text from private.native_production_liability_generation');await syntheticLiabilities();
   assert.equal(await one('select generation::text from private.native_production_liability_generation'),offGeneration,'OFF does not serialize unrelated earning writes on global generation');
   assert.equal(await one('select private.native_production_global_usd_liability()'),null);
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');
   assert.ok(BigInt((await capture()).generation)>BigInt(before.generation));assert.equal(Number(await withdraw(earning)),0,'OFF/ON cannot revive an old snapshot');
  });
  if(!excludeRetainedCapacity)await tx(async()=>{
   const baseline=await capture();
   await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   const dormantGeneration=await one('select generation::text from private.native_production_liability_generation'),seedStart=performance.now();
   const historical=await syntheticLiabilities({count:12000,ledgerStatus:'available'});
   assert.equal(Number(await withdraw(historical[0].id)),1,'historical fixture starts as mature verified available money');
   const historicalRequest=await one("insert into public.creator_payout_requests(creator_id,amount_cents,payout_type,status) values($1,12000,'scheduled','paid') returning id",[f.creator]);
   await db.query("insert into public.creator_payout_allocations(payout_request_id,earnings_ledger_id,amount_cents,state) select $1,unnest($2::uuid[]),1,'paid'",[historicalRequest,historical.map(row=>row.id)]);
   await db.query(`select public.record_creator_earnings_lifecycle_internal(id,'paid','provider_payout_paid','synthetic-history-paid:'||id,$2,null,'{"synthetic_fixture":true}')
    from unnest($1::uuid[]) id`,[historical.map(row=>row.id),historicalRequest]);
   assert.equal(await one('select public.creator_earnings_current_state_internal($1)',[historical[0].id]),'paid','historical payment uses append-only lifecycle after valid allocation');
   await syntheticLiabilities({count:5000,environment:'sandbox'});
   const maturityHeld=await syntheticLiabilities({count:2500,createdAt:new Date(Date.now()-86400000).toISOString()});
   const reserveHeld=await syntheticLiabilities({count:2500,createdAt:new Date(Date.now()-10*86400000).toISOString()});
   assert.equal(await one('select generation::text from private.native_production_liability_generation'),dormantGeneration,'retained history seeded while OFF has no generation writer serialization');
   const seedMs=performance.now()-seedStart;
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');
   const start=performance.now(),snapshot=await capture(),captureMs=performance.now()-start;
   process.stdout.write(`native liability seed completed in ${seedMs.toFixed(1)}ms; initial capture returned ${snapshot?'complete':'held'} in ${captureMs.toFixed(1)}ms\n`);
   if(!snapshot)assert.fail(JSON.stringify(await one('select (select to_jsonb(d) from private.native_production_liability_capture_failures d order by id desc limit 1) diagnostic')));
   assert.equal(BigInt(snapshot.amountMinor),BigInt(baseline.amountMinor)+5000n,'paid history and canonical sandbox do not count toward active production liability');
   const shape=await one('select jsonb_build_object(\'active\',earning_count,\'examined\',examined_count,\'captureMs\',construction_ms) from private.native_production_liability_snapshots where generation=$1',[snapshot.generation]);
   assert.ok(shape.active>=maturityHeld.length+reserveHeld.length&&shape.examined>=22000);
   const auditBefore=await one('select count(*)::int from private.native_production_liability_history');
   await db.exec('savepoint historical_return');
   await db.query("update public.creator_payout_allocations set state='released' where payout_request_id=$1 and earnings_ledger_id=$2",[historicalRequest,historical[0].id]);
   assert.equal(await one('select private.native_production_global_usd_liability()'),null,'a return on fully paid history invalidates the complete cached generation');
   const returned=await capture();assert.equal(BigInt(returned.amountMinor),BigInt(snapshot.amountMinor)+1n);
   assert.equal(await one('select count(*)::int from private.native_production_liability_history'),auditBefore+1,'fully paid historical rows retain immutable return audit effects');
   // Re-paying a finalized earning requires separately verified returned-lifecycle
   // authority. Do not forge that authority to restore the capacity fixture.
   await db.exec('rollback to savepoint historical_return;release savepoint historical_return');
   assert.deepEqual(await capture(),snapshot,'rolled-back historical return leaves its original snapshot and audit unchanged');
   const readsStart=performance.now();
   const snapshotsBefore=await one('select count(*)::int from private.native_production_liability_snapshots');
   assert.equal(await one('select count(*)::int from generate_series(1,2000) where private.native_production_global_usd_liability() is not null'),2000);
   assert.equal(await one('select count(*)::int from private.native_production_liability_snapshots'),snapshotsBefore,'repeated classifier inputs reuse one exact generation snapshot');
   const cachedReadMs=performance.now()-readsStart;
   await funding(f);await f.reconcile();assert.equal(await one('select private.native_production_current_earning_domain_ready($1)',[earning]),true,'scale classifier is positively qualified with current funding');
   const classifyStart=performance.now();
   assert.equal(await one('select count(*)::int from generate_series(1,50) where private.native_production_current_earning_domain_ready($1) is true',[earning]),50);
   const classifierMs=performance.now()-classifyStart;
   process.stdout.write(`compact native liability: 12000 paid + 5000 verified sandbox + 5000 maturity/reserve-held; seed ${seedMs.toFixed(1)}ms; capture ${captureMs.toFixed(1)}ms (${JSON.stringify(shape)}); 2000 cached reads ${cachedReadMs.toFixed(1)}ms; 50 current classifiers ${classifierMs.toFixed(1)}ms\n`);
   assert.ok(captureMs<5000&&cachedReadMs<5000&&classifierMs<5000,'bounded fixture stays below explicit per-phase five-second local test budget');
   await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   await syntheticLiabilities({count:5000,createdAt:new Date(Date.now()-86400000).toISOString()});
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');
   const growthStart=performance.now(),growth=await capture();
   if(!growth)assert.fail(JSON.stringify(await one('select (select to_jsonb(d) from private.native_production_liability_capture_failures d order by id desc limit 1) diagnostic')));
   assert.equal(BigInt(growth.amountMinor),BigInt(snapshot.amountMinor)+5000n);
   process.stdout.write(`compact native liability growth: 27000 retained rows / 10000 current synthetic liabilities, capture ${(performance.now()-growthStart).toFixed(1)}ms\n`);
   await syntheticLiabilities();
   assert.equal(await one('select private.capture_native_production_global_liability_bounded($1,1,5000)',[f.creator]),null,'explicit examination budget returns no partial snapshot');
   assert.equal(await one('select reason from private.native_production_liability_capture_failures order by id desc limit 1'),'examined_budget_exceeded');
   assert.equal(await one('select private.native_production_global_usd_liability()'),null,'overflow generation is not eligible through old cached data');
  });
  await tx(async()=>{
   await syntheticLiabilities();
   const provenanceDefinition=await one("select pg_get_functiondef('private.native_production_liability_provenance(public.creator_earnings_ledger)'::regprocedure)");
   const delayedDefinition=provenanceDefinition.replace(/\nbegin\n/, '\nbegin\n perform pg_sleep(0.005);\n');assert.notEqual(delayedDefinition,provenanceDefinition);
   await db.exec(delayedDefinition);
   assert.equal(await one('select private.capture_native_production_global_liability_bounded($1,250000,1)',[f.creator]),null,'construction duration is enforced without publishing partial coverage');
   assert.equal(await one('select reason from private.native_production_liability_capture_failures order by id desc limit 1'),'duration_budget_exceeded');
   assert.equal(await one('select private.native_production_global_usd_liability()'),null);
  });
  await tx(async()=>{
   await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   const ordinary=(await syntheticLiabilities({ledgerStatus:'available',amount:5000}))[0];
   assert.equal(Number(await withdraw(ordinary.id)),5000,'allocation fanout uses independently available ordinary money, not disabled native release');
   await db.query(`with requests as(insert into public.creator_payout_requests(creator_id,amount_cents,payout_type,status)
    select $1,1,'scheduled','paid' from generate_series(1,4097) returning id)
    insert into public.creator_payout_allocations(payout_request_id,earnings_ledger_id,amount_cents,state)
    select id,$2,1,'paid' from requests`,[f.creator,ordinary.id]);
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');
   assert.equal(await capture(),null,'pathological single-earning allocation fanout holds without a partial sum');
   assert.equal(await one('select reason from private.native_production_liability_capture_failures order by id desc limit 1'),'allocation_budget_exceeded');
  });
  await tx(async()=>{
   await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   await db.query(`with adjustments as(insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
    select $1,accepted.id,'usd',1,'later_verified_fee','native_paid_video',$2,encode(extensions.digest(g::text,'sha256'),'hex')
    from generate_series(1,4097) g cross join (select id from private.commerce_creator_fee_acceptances where creator_id=$1 limit 1) accepted returning id)
    insert into private.commerce_creator_fee_offsets(adjustment_id,earnings_ledger_id,amount_minor) select id,$3,1 from adjustments`,[f.creator,randomUUID(),earning]);
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');
   assert.equal(await capture(),null);assert.equal(await one('select reason from private.native_production_liability_capture_failures order by id desc limit 1'),'offset_budget_exceeded');
  });
  await tx(async()=>{
   const before=await capture();
   const request=await one("insert into public.creator_payout_requests(creator_id,amount_cents,payout_type,status) values($1,12481,'scheduled','paid') returning id",[f.creator]);
   await db.exec('savepoint over_allocation');
   await assert.rejects(db.query("insert into public.creator_payout_allocations(payout_request_id,earnings_ledger_id,amount_cents,state) values($1,$2,12481,'paid')",[request,earning]),/payout_allocation_exceeds_available_after_reserve/);
   await db.exec('rollback to savepoint over_allocation;release savepoint over_allocation');
   assert.deepEqual(await capture(),before,'existing allocation guard prevents manufacturing a negative residual');
  });
  // Under the input ceiling, maximum int4 net * 250000 is below int8. The
  // defensive aggregate-overflow branch is mathematically unreachable without
  // changing schema/budgets; do not forge an impossible earning to claim it ran.
  assert.ok(2147483647n*250000n<9223372036854775807n);
  await tx(async()=>{
   const initial=await capture(),firstPoint=await one('select max(id) from private.native_production_correction_checkpoints where canonical_receipt_id=$1',[f.receipt]);
   const initialFunding=await funding(f,initial.amountMinor);
   assert.equal(await one('select private.native_production_corrected_funding_current($1,$2)',[f.receipt,firstPoint]),initialFunding,'one receipt plus helper tip is genuinely fully covered before competition');
   const shared=await one('select legal_document_version from private.native_production_scope_qualifications where id=$1',[f.scopeQualification]);
   const other=await seedMatureNativeSale(db,{sharedLegalVersion:shared}),q=await qualify(other);
   await append(other,await report(other,q,1,[component('other-fee','store_fee',1000)],14600));await other.reconcile();
   const otherPoint=await one('select id from private.native_production_correction_checkpoints where canonical_receipt_id=$1',[other.receipt]);
   await funding(f,initial.amountMinor);await funding(other,initial.amountMinor);
   assert.equal(await one('select private.native_production_corrected_funding_current($1,$2)',[f.receipt,await one('select max(id) from private.native_production_correction_checkpoints where canonical_receipt_id=$1',[f.receipt])]),null);
   assert.equal(await one('select private.native_production_corrected_funding_current($1,$2)',[other.receipt,otherPoint]),null,'one account balance cannot separately cover two competing receipts');
   const enoughFirst=await funding(f),enoughOther=await funding(other);
   assert.equal(await one('select private.native_production_corrected_funding_current($1,$2)',[f.receipt,firstPoint]),enoughFirst);
   assert.equal(await one('select private.native_production_corrected_funding_current($1,$2)',[other.receipt,otherPoint]),enoughOther,'full unchanged one-account aggregate coverage can qualify both');
   await db.query("update public.money_access_ledger_events set environment='sandbox',payable_state='not_payable',status='sandbox_only' where id=(select money_ledger_event_id from public.creator_earnings_ledger where id=$1)",[earning]);
   await db.query("update public.provider_events set environment='sandbox' where id=$1",[f.receipt]);
   assert.equal(await capture(),null);
   assert.equal(await one('select private.native_production_corrected_funding_current($1,$2)',[other.receipt,otherPoint]),null,'another receipt cannot reuse coverage that omits the relabeled original');
  });
  await tx(async()=>{
   await f.claims('authenticated');await db.exec('set role authenticated');
   const reserved=await one("select public.request_qualified_creator_cashout(10000,'instant',$1,$2,200,0,9800)",[f.qualification,randomUUID()]);await db.exec('reset role');
   const before=await capture();
   assert.equal(Number(await withdraw(earning)),12480,'reservation does not change the proof liability');
   await db.query("update public.creator_payout_allocations set state='paid' where payout_request_id=$1",[reserved.requestId]);
   assert.equal(Number(await withdraw(earning)),0,'payment invalidates old funding');
   const paidBefore=await capture();
   const prior=(await db.query('select earnings_ledger_id,amount_cents from public.creator_payout_allocations where payout_request_id=$1',[reserved.requestId])).rows;
   await db.query("update public.creator_payout_allocations set state='released' where payout_request_id=$1",[reserved.requestId]);
   await funding(f);
   const replacement=await one("insert into public.creator_payout_requests(creator_id,amount_cents,payout_type,status) values($1,10000,'scheduled','paid') returning id",[f.creator]);
   for(const row of prior)await db.query("insert into public.creator_payout_allocations(payout_request_id,earnings_ledger_id,amount_cents,state) values($1,$2,$3,'paid')",[replacement,row.earnings_ledger_id,row.amount_cents]);
   const paidAfter=await capture();
   assert.equal(paidAfter.amountMinor,paidBefore.amountMinor);assert.notEqual(paidAfter.sha256,paidBefore.sha256,'equal paid sums with different identities cannot share funding proof');
   await db.query("update public.creator_payout_allocations set state='released' where payout_request_id=$1",[replacement]);
   const after=await capture();
   assert.equal(after.amountMinor,before.amountMinor);assert.notEqual(after.sha256,before.sha256,'paid-to-returned ABA retains immutable history');
   assert.equal(Number(await withdraw(earning)),0,'restored amount cannot revive stale proof');
   await funding(f);assert.equal(Number(await withdraw(earning)),12480);
   const utc=await capture();await db.exec("set timezone='America/Los_Angeles'");
   assert.deepEqual(await capture(),utc,'cache with offsets and paid history is timezone independent');
   assert.equal(Number(await withdraw(earning)),12480,JSON.stringify(await currentAuthority(earning)));await db.exec("set timezone='UTC'");
  });
  await tx(async()=>{
   const detached=await one(`with canonical as(insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
    select receipt.provider,$2,receipt.user_id,'production','native_verified_correction_credit','processed',$2,receipt.metadata
    from public.creator_earnings_ledger e join public.provider_events receipt on receipt.id=e.provider_event_id where e.id=$1 returning id),
    money as(insert into public.money_access_ledger_events(user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
     select m.user_id,m.creator_id,m.product_id,canonical.id,m.event_type,m.amount_minor,m.currency,'production','pending_verification','pending','product',m.source_id,m.metadata
     from public.creator_earnings_ledger e join public.money_access_ledger_events m on m.id=e.money_ledger_event_id cross join canonical where e.id=$1 returning id,provider_event_id)
    insert into public.creator_earnings_ledger(creator_id,source_type,source_id,gross_amount_cents,net_creator_amount_cents,currency,ledger_status,money_ledger_event_id,provider_event_id,metadata)
     select e.creator_id,'product',e.source_id,e.gross_amount_cents,e.net_creator_amount_cents,e.currency,'held',money.id,money.provider_event_id,e.metadata
     from public.creator_earnings_ledger e cross join money where e.id=$1 returning id`,[credit,`detached-${randomUUID()}`]);
   assert.equal(await one('select private.native_production_earning_in_domain($1)',[detached]),true,'canonical credit marker cannot escape through a generic source type');
   assert.equal(await one('select private.commerce_current_earning_domain_ready($1)',[detached]),false,'missing dedicated credit link is not generic non-commerce authority');
   assert.equal(await one('select private.native_production_liability_provenance(e) from public.creator_earnings_ledger e where id=$1',[detached]),'unknown');
   assert.equal(await capture(),null,'native-looking receipt without exact immutable link cannot qualify the pool');
  });
  if(db.withConnection){
   const seedOrdinary=async()=>{
    const creator=randomUUID(),ordinary=await seedCashoutExecutionFixture(db,{creatorId:creator,sessionId:randomUUID(),recipientAccountId:`acct_${creator.replaceAll('-','')}`,reserveInitialRequest:false});
    const debt=await one(`insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash,created_at)
     select $1,id,'usd',100,'later_verified_fee','cashout_fee',$2,repeat('c',64),clock_timestamp() from private.commerce_creator_fee_acceptances where creator_id=$1 returning id`,[creator,randomUUID()]);
    const receipt=await one(`insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key)
     values('stripe_connect',$2,$1,'production','synthetic_settlement','processed',$2) returning id`,[creator,randomUUID()]);
    const money=await one(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
     values($1,$1,$2,'synthetic_settlement',10000,'usd','production','payable','verified','tip','{"payout_readiness_proved":true,"live_money_enabled_at_verification":true}') returning id`,[creator,receipt]);
    const mature=await one(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,ledger_status,money_ledger_event_id,provider_event_id,
     settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,created_at)
     values($1,'tip',10000,10000,'available',$2,$3,clock_timestamp()-interval '40 days',clock_timestamp()-interval '33 days',0,clock_timestamp()-interval '3 days','2026-08-31-v1',clock_timestamp()) returning id`,[creator,money,receipt]);
    const request=await one("insert into public.creator_payout_requests(creator_id,amount_cents,payout_type,status) values($1,1,'scheduled','paid') returning id",[creator]);
    const allocation=await one("insert into public.creator_payout_allocations(payout_request_id,earnings_ledger_id,amount_cents,state) values($1,$2,1,'paid') returning id",[request,mature]);
    return {...ordinary,debt,receipt,money,mature,allocation,recover:()=>ordinary.rpc('select public.reconcile_creator_fee_recovery($1)',[creator])};
   };
   const a=await seedOrdinary(),b=await seedOrdinary(),late=await seedLateObservation();
   for(const ordinary of [a,b])await tx(async()=>assert.equal(Number((await ordinary.recover()).offsetMinor),100,'ordinary future-unpaid recovery is positive before testing contention'));
   const boundedFailure=async operation=>{const start=performance.now();await assert.rejects(operation(),error=>error.code==='55P03');
    assert.ok(performance.now()-start<1000,'production NOWAIT, not the test timeout, bounds generation contention');};
   for(const fence of ['row','relation'])for(const commit of [false,true])await db.withConnection(async holder=>{
    await holder.query('begin');await holder.query(fence==='row'?'select 1 from private.native_production_liability_generation where singleton for update':
     'lock table private.native_production_liability_generation in exclusive mode');
    const before=await financialFingerprint();
    for(const operation of [a.recover,b.recover,late.append,()=>syntheticLiabilities(),
     ()=>db.query("update public.provider_events set status='ignored' where id=$1",[b.receipt]),
     ()=>db.query("update public.money_access_ledger_events set environment='sandbox',payable_state='not_payable',status='sandbox_only' where id=$1",[b.money]),
     ()=>db.query("update public.creator_payout_allocations set state='released' where id=$1",[b.allocation]),
     ()=>db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false')]){
     await boundedFailure(operation);assert.deepEqual(await financialFingerprint(),before,'contended generation never leaves partial authority/accounting writes');
    }
    assert.equal(await one('select status from public.provider_events where id=$1',[b.receipt]),'processed');
    assert.equal(await one('select environment from public.money_access_ledger_events where id=$1',[b.money]),'production');
    assert.equal(await one('select state from public.creator_payout_allocations where id=$1',[b.allocation]),'paid');
    assert.equal(await one('select account_corrections from private.native_production_earning_controls'),true);
    assert.equal(await one('select count(*)::int from private.native_production_report_jobs where canonical_receipt_id=$1',[late.receipt]),0,'failed observer append leaves no report job');
    await holder.query(commit?'commit':'rollback');
    await tx(async()=>assert.equal(Number((await b.recover()).offsetMinor),100,'retry after holder commit/rollback rechecks and consumes exactly once'));
    await tx(async()=>{await late.append();assert.equal(await one('select count(*)::int from private.native_production_paid_video_observations where canonical_receipt_id=$1',[late.receipt]),1,'late observer retries atomically after holder completion');
     assert.equal(await one('select count(*)::int from private.native_production_report_jobs where canonical_receipt_id=$1',[late.receipt]),1,'successful observer retry enqueues exactly one report job');});
   });
   for(const commit of [false,true])await db.withConnection(async holder=>{
    await holder.query('begin');await holder.query('lock table private.native_production_liability_history in exclusive mode');
    const before=await financialFingerprint();
    await boundedFailure(()=>db.query("update public.creator_payout_allocations set state='released' where id=$1",[b.allocation]));
    assert.deepEqual(await financialFingerprint(),before);assert.equal(await one('select state from public.creator_payout_allocations where id=$1',[b.allocation]),'paid');
    await holder.query(commit?'commit':'rollback');
    await tx(async()=>{const history=await one('select count(*)::int from private.native_production_liability_history');
     await db.query("update public.creator_payout_allocations set state='released' where id=$1",[b.allocation]);
     assert.equal(await one('select count(*)::int from private.native_production_liability_history'),history+1,'successful return retry records audit and generation together');});
   });
   // A real ordinary recovery owns creator A, its earning rows and generation.
   // B must fail atomically at generation, release its creator lock, and allow
   // A's following batch visit to B without a reverse-order deadlock.
   for(const commit of [false,true])await db.withConnection(async holder=>{
    await holder.query('begin');await holder.query("select set_config('request.jwt.claim.role','service_role',true)");
    const result=(await holder.query('select public.reconcile_creator_fee_recovery($1) result',[a.creator])).rows[0].result;
    assert.equal(Number(result.offsetMinor),100);const before=await financialFingerprint();
    await boundedFailure(b.recover);assert.deepEqual(await financialFingerprint(),before);
    assert.equal((await holder.query("select pg_try_advisory_xact_lock(hashtextextended('creator-payout:'||$1::text,0)) locked",[b.creator])).rows[0].locked,true,'failed B recovery released its business lock before A visits B');
    await holder.query(commit?'commit':'rollback');
    assert.equal(await one('select count(*)::int from private.commerce_creator_fee_offsets where adjustment_id=$1',[a.debt]),commit?1:0);
    await tx(async()=>assert.equal(Number((await b.recover()).offsetMinor),100));
   });
   await db.exec('update private.native_production_earning_controls set release_correction_credits=false,account_corrections=false');
   await db.withConnection(async holder=>{
    await holder.query('begin');await holder.query('select 1 from private.native_production_liability_generation where singleton for update');
    await holder.query('lock table private.native_production_liability_history in exclusive mode');
    const generation=await one('select generation::text from private.native_production_liability_generation'),start=performance.now();
    await tx(async()=>{await b.recover();await syntheticLiabilities();await late.append();
     await db.query("update public.creator_payout_allocations set state='released' where id=$1",[b.allocation]);
     await db.query("update public.provider_events set status='ignored' where id=$1",[b.receipt]);});
    assert.ok(performance.now()-start<1000,'OFF ordinary workload does not wait on the generation holder');
    assert.equal(await one('select generation::text from private.native_production_liability_generation'),generation);
    await boundedFailure(()=>db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true'));
    assert.equal(await one('select account_corrections from private.native_production_earning_controls'),false,'contended OFF-to-ON is rolled back');
    await holder.query('rollback');
   });
   await db.exec('update private.native_production_earning_controls set account_corrections=true,release_correction_credits=true');
   await funding(f);await f.reconcile();assert.equal(Number(await withdraw(earning)),12480);
  }
  for(const [name,patch] of [['buyer',{buyerId:f.creator}],['creator',{creatorId:f.buyer}],['currency',{currency:'eur'}],['product',{productId:'wrong'}],
   ['source',{sourceVersionId:randomUUID()}],['app',{appId:'wrong'}],['environment',{environment:'sandbox'}]])await tx(async()=>{
    await assert.rejects(append(f,{...second,id:`wrong-${name}`,...patch}),/native_correction_identity_mismatch/);
   });
  await tx(async()=>{await append(f,await report(f,qualification,3,[fee,reversal],15599));assert.equal((await evaluate(f)).complete,false);assert.equal(Number(await withdraw(earning)),0,'newest incomplete report never falls back');});
  await tx(async()=>{await append(f,await report(f,qualification,3,[fee],14600));assert.ok((await evaluate(f)).reasons.includes('signed_component_coverage_incomplete'));});
  await tx(async()=>{await append(f,await report(f,qualification,3,[{...fee,amountMinor:'1001'},reversal],15599));assert.ok((await evaluate(f)).reasons.includes('signed_component_conflict'));});
  await tx(async()=>{await db.query('insert into private.native_production_correction_revocations values($1)',[qualification]);assert.equal(Number(await withdraw(earning)),0);});
  for(const reverse of [false,true])await tx(async()=>{
   const q=await qualify(f),stamp=new Date().toISOString();
   const rows=[await report(f,qualification,3,[fee,reversal],15600,{id:'tie-old',observedAt:stamp,through:stamp}),
    await report(f,q,3,[fee,reversal],15600,{id:'tie-new',observedAt:stamp,through:stamp})];
   await db.query('insert into private.native_production_correction_revocations values($1)',[qualification]);
   for(const row of reverse?rows.reverse():rows)await append(f,row);
   assert.ok((await evaluate(f)).reasons.includes('correction_current_tie'),'same-time different issuer copies never elect authority by UUID');
  });
  await tx(async()=>{await db.query("update public.videos set storage_path=storage_path||'.changed',storage_object_key=storage_object_key||'.changed' where id=$1",[f.video]);assert.equal(Number(await withdraw(earning)),0);});
  // Reported refund aliases must bind exact canonical/report/watermark evidence.
  await tx(async()=>{
   await f.append({...f.base,id:'actual-refund',kind:'refund',negativeId:'refund-one',effectiveAt:f.base.observedAt,amountMinor:'1000'});
   const refund={...component('refund-component','refund_gross',1000,null,'refund-one'),occurredAt:f.base.observedAt};
   const row=await report(f,qualification,3,[fee,reversal,refund],14600);await append(f,row);
   assert.equal((await evaluate(f)).complete,true);assert.equal((await evaluate(f)).targetMinor,'11680');
   await append(f,await report(f,qualification,4,[fee,reversal,refund],14600,{negativeBindings:[]}));
   assert.ok((await evaluate(f)).reasons.includes('negative_identity_coverage_incomplete'));
  });
  for(const mismatch of ['amount','time','identity'])await tx(async()=>{
   await f.append({...f.base,id:'known-refund',kind:'refund',negativeId:'refund-one',effectiveAt:f.base.observedAt,amountMinor:'1000'});
   const refund={...component('refund-component','refund_gross',mismatch==='amount'?1:1000,null,mismatch==='identity'?'other-refund':'refund-one'),
    occurredAt:mismatch==='time'?new Date().toISOString():f.base.observedAt};
   await append(f,await report(f,qualification,3,[fee,reversal,refund],mismatch==='amount'?15599:14600));
   assert.ok((await evaluate(f)).reasons.includes('negative_financial_facts_mismatch'),mismatch);
  });
  await tx(async()=>{
   for(const id of ['refund-alias-a','refund-alias-b'])await f.append({...f.base,id,kind:'refund',negativeId:'refund-one',effectiveAt:f.base.observedAt,amountMinor:'1000'});
   const refund={...component('one-refund','refund_gross',1000,null,'refund-one'),occurredAt:f.base.observedAt};
   await append(f,await report(f,qualification,3,[fee,reversal,refund],14600));assert.equal((await evaluate(f)).targetMinor,'11680','two genuine aliases count once');
   await f.append({...f.base,id:'contradictory-alias',kind:'refund',negativeId:'refund-one',effectiveAt:f.base.observedAt,amountMinor:'1001'});
   await append(f,await report(f,qualification,4,[fee,reversal,refund],14600));assert.ok((await evaluate(f)).reasons.includes('negative_financial_facts_mismatch'));
  });
  await tx(async()=>{
   const older=new Date(Date.parse(f.base.observedAt)-1000).toISOString();
   await f.append({...f.base,id:'known-time',kind:'refund',negativeId:'refund-one',effectiveAt:f.base.observedAt,amountMinor:'1000'});
   const refund={...component('one-refund','refund_gross',1000,null,'refund-one'),occurredAt:older};
   await append(f,await report(f,qualification,3,[{...fee,occurredAt:older},{...reversal,occurredAt:older},refund],14600,{through:older}));
   assert.ok((await evaluate(f)).reasons.includes('negative_financial_facts_mismatch'),'a manifest cannot close before known negative effective time');
  });
  await tx(async()=>{
   const huge=component('above-gross','store_fee',20000);await append(f,await report(f,qualification,3,[fee,reversal,huge],-4400));
   assert.equal((await evaluate(f)).targetMinor,'-4400');await f.reconcile();
   const giveBack=component('partial-return','store_fee',-1000,'above-gross');await append(f,await report(f,qualification,4,[fee,reversal,huge,giveBack],-3400));
   await f.reconcile();assert.equal(Number(await one('select delta_minor from private.native_production_correction_checkpoints where canonical_receipt_id=$1 order by id desc limit 1',[f.receipt])),1000,'less-negative target is a positive correction, not zero');
  });
  // Actual qualification INSERT, revocation and report locks fence final dispatch.
  await f.claims('authenticated');await db.exec('set role authenticated');
  const request=await one("select public.request_qualified_creator_cashout(10000,'instant',$1,$2,200,0,9800)",[f.qualification,randomUUID()]);await db.exec('reset role');
  const claim=()=>f.rpc("select public.claim_creator_cashout_dispatch($1,'funding')",[request.requestId]);
  if(db.withConnection)for(const commit of [false,true])await db.withConnection(async holder=>{
   await holder.query('begin');await holder.query(`insert into private.native_production_correction_qualifications(scope_id,report_schema,basis,evidence_sha256,verified_at,expires_at)
    values($1,'synthetic-signed-v1','authenticated_transaction_signed_deltas_and_cumulative_proceeds_v1',repeat('b',64),clock_timestamp(),clock_timestamp()+interval '1 hour')`,[f.scopeQualification]);
   await assert.rejects(claim(),error=>error.code==='55P03');await holder.query(commit?'commit':'rollback');
   await tx(async()=>assert.equal((await claim()).claimed,true));
  });
  if(db.withConnection)await db.withConnection(async holder=>{
   await holder.query('begin');await holder.query('insert into private.native_production_correction_revocations values($1)',[qualification]);
   await assert.rejects(claim(),error=>error.code==='55P03');await holder.query('rollback');
  });
  if(db.withConnection)for(const commit of [false,true])await db.withConnection(async holder=>{
   const next=await report(f,qualification,3,[fee,reversal],15599);
   await holder.query('begin');await holder.query('select private.append_native_production_correction($1,$2)',[f.receipt,next]);
   await assert.rejects(claim(),error=>error.code==='55P03','an uncommitted new report fences final dispatch');await holder.query(commit?'commit':'rollback');
   if(commit){assert.equal(Number(await withdraw(earning)),0);await assert.rejects(claim(),/cashout_reserved_earnings_reduced/);}
   else await tx(async()=>assert.equal((await claim()).claimed,true,'rolled-back report permits a fresh current recheck'));
  });
  assert.equal(await one('select count(*)::int from private.native_production_correction_checkpoints where id=$1',[point]),1);
  // ACLs and append-only facts remain independent of service auth.
  for(const table of ['correction_reports','correction_components','correction_checkpoints','credit_sources','corrected_openings','corrected_funding_proofs','corrected_releases']){
   assert.equal(await one('select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass',[`private.native_production_${table}`]),true);
   for(const role of ['anon','authenticated','service_role'])assert.equal(await one("select has_table_privilege($1,$2,'INSERT')",[role,`private.native_production_${table}`]),false);
  }
  // A real future commerce earning shares the debt consumer. Its report writer
  // does not use the creator mutex, so table/namespace fences are indispensable.
  const mixed=await seedMatureNativeSale(db),mixedQ=await qualify(mixed);
  const mixedEarning=(await mixed.reconcile()).earningsLedgerId;
  const mixedSnapshot=await one('select snapshot_id from private.native_production_earning_sources where earnings_ledger_id=$1',[mixedEarning]);
  await mixed.seedFunding(mixedSnapshot);await mixed.reconcile();
  const mixedFee=component('mixed-fee','store_fee',1000);
  await append(mixed,await report(mixed,mixedQ,1,[mixedFee],14600));await mixed.reconcile();
  await db.exec("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','stripe_connect_enabled')");
  const merch=await seedQualifiedCommerceMerch(db,undefined,{creatorId:mixed.creator,platformAccountId:'acct_cashoutPlatform',recipientAccountId:mixed.accountId});
  await merch.service();const commerce=await merch.release();await merch.root();
  assert.ok(commerce.earnings_ledger_id);
  const recover=()=>mixed.rpc('select public.reconcile_creator_fee_recovery($1)',[mixed.creator]);
  const offsets=()=>one('select count(*)::int from private.commerce_creator_fee_offsets where earnings_ledger_id=$1',[commerce.earnings_ledger_id]);
  if(db.withConnection)for(const commit of [false,true])await db.withConnection(async holder=>{
   await holder.query('begin');await holder.query("select set_config('request.jwt.claim.role','service_role',true)");
   await holder.query('select public.record_merch_fee_report_observation($1,$2,$3)',[merch.identity,merch.context.sourceObservationId,
    {...merch.evidence,reportRunId:'frr_MixedNew',fileId:'file_MixedNew',contentSha256:'b'.repeat(64)}]);
   await assert.rejects(recover(),error=>error.code==='55P03','current commerce report INSERT fences native debt recovery');
   await holder.query(commit?'commit':'rollback');assert.equal(await offsets(),0);
   if(commit){assert.equal((await recover()).offsetMinor,0,'committed new unaccounted report cannot fund a debt offset');}
   else await tx(async()=>assert.ok(Number((await recover()).offsetMinor)>0,'rollback permits fresh valid current-domain recovery'));
  });
  // Both adapters need a real new report to requeue the deliberately blocked
  // seed job. The native-only concurrency INSERT above cannot be its prerequisite.
  await merch.service();await merch.report({reportRunId:'frr_MixedDrain',fileId:'file_MixedDrain',contentSha256:'c'.repeat(64)});await merch.root();
  const job=(await db.query("select state,next_attempt_at<=clock_timestamp() due from private.commerce_fee_accounting_jobs where source_id=$1",[merch.identity])).rows[0];
  assert.equal(job.state,'pending');assert.equal(job.due,true);
  const beforeDrain=Number(await one("select private.creator_fee_recovery_amount($1,'usd')",[mixed.creator]));
  const offsetAmount=()=>one('select coalesce(sum(amount_minor),0) from private.commerce_creator_fee_offsets where earnings_ledger_id=$1',[commerce.earnings_ledger_id]);
  const beforeOffset=Number(await offsetAmount());
  await merch.service();const drained=await merch.drain();await merch.root();
  assert.equal(drained.providerMutationPerformed,false);assert.equal(drained.payoutCreated,false);
  assert.equal(drained.outcomes.length,1);assert.equal(drained.outcomes[0].sourceId,merch.identity);
  assert.equal(drained.outcomes[0].status,'completed');
  assert.equal(await one('select state from private.commerce_fee_accounting_jobs where source_id=$1',[merch.identity]),'completed');
  const afterDrain=Number(await one("select private.creator_fee_recovery_amount($1,'usd')",[mixed.creator]));
  assert.ok(beforeDrain>afterDrain);assert.equal(beforeDrain-afterDrain,Number(await offsetAmount())-beforeOffset);
  const partial=await recover();assert.equal(Number(partial.offsetMinor),0,'queue already consumed the eligible tranche; explicit retry is idempotent');
  assert.equal(Number((await recover()).offsetMinor),0,'repeated explicit recovery cannot consume the tranche twice');
  assert.ok(Number(partial.remainingMinor)>0&&Number(partial.remainingMinor)<beforeDrain,'future commerce earning only partially covers the original debt');
  const mixedReturn=component('mixed-return','store_fee',-1000,'mixed-fee');
  await append(mixed,await report(mixed,mixedQ,2,[mixedFee,mixedReturn],15600));await mixed.reconcile();await funding(mixed);
  assert.equal(Number((await mixed.reconcile()).recoveryConsumedMinor),Number(partial.remainingMinor),'later native credit covers only remaining debt, not the already consumed tranche');
  await funding(mixed);await mixed.reconcile();
  if(db.withConnection)await db.withConnection(async holder=>{
   await holder.query('begin');await holder.query('insert into private.native_production_correction_revocations values($1)',[mixedQ]);
   await assert.rejects(mixed.reconcile(),error=>error.code==='55P03');await holder.query('commit');
  });else await db.query('insert into private.native_production_correction_revocations values($1)',[mixedQ]);
  assert.equal(Number(await withdraw(mixedEarning)),0,'committed correction qualification revocation stays closed');
  // Independent synthetic opening cases: no diagnostic debt, explicit corrected
  // positive opening, and unchanged product maturity/reserve rules.
  for(const [age,expected] of [['1 day',0],['10 days',10512],['40 days',11680]])await tx(async()=>{
   const sale=await seedMatureNativeSale(db,{purchaseAge:age}),q=await qualify(sale),extra=component('opening-fee','store_fee',1000);
   await append(sale,await report(sale,q,1,[extra],14600));assert.equal((await evaluate(sale)).complete,true);
   const result=await sale.reconcile();assert.equal(result.reason,'corrected_funding_required');
   const opened=await one('select earnings_ledger_id from private.native_production_earning_sources where canonical_receipt_id=$1',[sale.receipt]);assert.ok(opened);
   assert.equal(await one('select count(*)::int from private.commerce_creator_fee_adjustments where creator_id=$1',[sale.creator]),0);
   await funding(sale);await sale.reconcile();assert.equal(Number(await withdraw(opened)),expected,`${age} corrected opening respects original 7-day hold and 10%/30-day reserve`);
  });
  await tx(async()=>{
   const sale=await seedMatureNativeSale(db),q=await qualify(sale),extra=component('unissued-huge-fee','store_fee',20000);
   await append(sale,await report(sale,q,1,[extra],-4400));assert.equal((await sale.reconcile()).reason,'corrected_opening_positive_representable_target_required');
   assert.equal(await one('select count(*)::int from private.native_production_earning_sources where canonical_receipt_id=$1',[sale.receipt]),0);
   assert.equal(await one('select count(*)::int from private.commerce_creator_fee_adjustments where creator_id=$1',[sale.creator]),0);
  });
 }finally{await db.close();}
});
