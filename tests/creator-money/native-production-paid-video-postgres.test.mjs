import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';

test('normal native production ingress appends immutable paid-video economic holds without opening admission', {timeout:600000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const owner=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false);set role service_role`);
 const base={providerEventId:'synthetic-paid-production',canonicalReceiptId:'ca000000-0000-4000-8000-000000000099',rawPayloadHash:'a'.repeat(64),provider:'revenuecat_google_play',environment:'production',
  eventType:'NON_RENEWING_PURCHASE',reportedAppId:'synthetic-app',configuredProjectId:'synthetic-project',reportedProductId:'synthetic-video',
  originalTransactionId:'synthetic-original',transactionId:'synthetic-transaction',userId:'ca000000-0000-4000-8000-000000000010'};
 const record=facts=>one('select public.record_native_production_ingress_observation($1)',[facts]);
 const hold=facts=>one('select public.get_native_production_paid_video_hold($1)',[facts.canonicalReceiptId]);
 async function reserve(facts,{domain='paid_content_access',metadata={}}={}) {
  await service();await one('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[facts.providerEventId,facts.rawPayloadHash]);
  await owner();
  facts.canonicalReceiptId=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,
   environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
   select $1,$2,id,product_key,$3::uuid,$3,'production',$4,'ignored',clock_timestamp(),'native-economics:'||$1,$5,$6
   from public.monetization_products where product_type=$7 order by id limit 1 returning id`,
   [facts.providerEventId,facts.provider,facts.userId,facts.eventType,facts.rawPayloadHash,{
    provider_product_id:facts.reportedProductId,original_transaction_id:facts.originalTransactionId,reported_amount_minor:199,reported_currency:'usd',...metadata},domain]);
  assert.ok(facts.canonicalReceiptId,`fixture product ${domain}`);await service();
 }
 function closed(result){assert.equal(result.status,'HELD');for(const key of ['dispatchAllowed','settlementAllowed','financialAuthority','payable'])assert.equal(result[key],false);
  for(const key of ['actualGrossMinor','actualStoreFeeMinor','actualFeeTaxMinor','actualSalesTaxMinor','actualDeveloperProceedsMinor','actualQuantity','creatorCandidateMinor'])assert.equal(result[key],null);}
 try {
  const balances=await one('select count(*)::int from public.creator_earnings_ledger');
  const switches=await one('select jsonb_object_agg(key,state) from public.platform_money_kill_switches');
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous) values($1,false,false)',[base.userId]);
  await service();await assert.rejects(()=>record(base),/native_ingress_authenticated_receipt_required/);
  const refund={...base,providerEventId:'refund-before-purchase',eventType:'REFUND'};
  await one('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[refund.providerEventId,refund.rawPayloadHash]);
  const terminal=await one(`select public.process_revenuecat_terminal_event_atomic($1,$2,'REFUND',$3::uuid,$4,null,
   'production','revoked',null,null,clock_timestamp(),$5,null,'google_play','android',$6)`,
   [refund.provider,refund.providerEventId,refund.userId,refund.reportedProductId,refund.rawPayloadHash,refund.originalTransactionId]);
  assert.equal(terminal.domain,'missing');refund.canonicalReceiptId=terminal.providerEventId;
  await owner();assert.equal(await one('select product_id from public.provider_events where id=$1',[refund.canonicalReceiptId]),null);
  await service();assert.equal((await record(refund)).status,'out_of_scope','missing domain is never guessed to be paid video');
  await reserve(base);assert.deepEqual(await record(base),{status:'recorded',financialAuthority:false});
  let h=await hold(base);closed(h);assert.equal(h.negativeLifecycleHold,true);assert.equal(h.canonicalQuoteBound,false);assert.equal(h.ingressQualificationCurrent,false);
  assert.deepEqual(await record({...base,configuredProjectId:'changed-server-config'}),{status:'duplicate',financialAuthority:false});
  for(const field of ['transactionId','reportedAppId','reportedProductId','userId','originalTransactionId'])
   await assert.rejects(()=>record({...base,[field]:field==='userId'?'ca000000-0000-4000-8000-000000000011':'changed'}),/identity_conflict|canonical_receipt_required|canonical_product_mismatch/);
  for(const patch of [{environment:'sandbox'},{financialAuthority:true},{creatorId:base.userId},{rawPayloadHash:'b'.repeat(64)}])await assert.rejects(()=>record({...base,...patch}));
  await owner();const tableOids={};
  for(const table of ['native_production_paid_video_observations','native_production_paid_video_ledger_holds'])
   tableOids[table]=await one('select $1::regclass::oid',[`private.${table}`]);
  for(const role of ['anon','authenticated','service_role']){
   await owner();await db.exec(`set role ${role}`);
   for(const table of ['native_production_paid_video_observations','native_production_paid_video_ledger_holds']){
    await assert.rejects(()=>db.query(`select * from private.${table}`),/permission denied/);
    await assert.rejects(()=>db.query(`insert into private.${table} default values`),/permission denied/);
    assert.equal(await one('select has_table_privilege(current_user,$1::oid,\'TRUNCATE\')',[tableOids[table]]),false);
   }
   await assert.rejects(()=>db.query('select public.record_native_production_ingress_observation_channel_internal($1)',[base]),/permission denied/);
   if(role!=='service_role'){await assert.rejects(()=>record(base),/permission denied/);await assert.rejects(()=>hold(base),/permission denied/);}
  }
  await owner();
  assert.equal(await one(`select configured_project_id from private.native_production_paid_video_observations where canonical_receipt_id=$1`,[base.canonicalReceiptId]),'synthetic-project');
  assert.equal(await one(`select reported_gross_minor::text from private.native_production_paid_video_observations where canonical_receipt_id=$1`,[base.canonicalReceiptId]),'199');
  for(const table of ['native_production_paid_video_observations','native_production_paid_video_ledger_holds']){
   assert.equal(await one('select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass',[`private.${table}`]),true);
   await assert.rejects(()=>db.query(`delete from private.${table}`),/append_only/);
  }
  await assert.rejects(()=>db.query('update private.native_production_paid_video_ledger_holds set payable=true'),/append_only/);
  await db.exec(`insert into private.native_production_ingress_qualifications(project_id,app_id,provider,provider_product_id,evidence_reference,verified_at,expires_at)
   values('synthetic-project','synthetic-app','revenuecat_google_play','synthetic-video','SYNTHETIC ONLY',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`);
  await service();await record(base);assert.equal((await hold(base)).ingressQualificationCurrent,false,'retry cannot retroactively qualify');
  const fresh={...base,providerEventId:'fresh-qualified',originalTransactionId:'separate-original'};
  await reserve(fresh);await record(fresh);h=await hold(fresh);closed(h);assert.equal(h.ingressQualificationCurrent,true);assert.equal(h.negativeLifecycleHold,false);
  await owner();await db.exec(`insert into private.native_production_ingress_qualifications(project_id,app_id,provider,provider_product_id,evidence_reference,verified_at,expires_at)
   values('synthetic-project','synthetic-app','revenuecat_google_play','synthetic-video','SYNTHETIC EXPIRED NEWER',clock_timestamp()-interval '5 minutes',clock_timestamp()-interval '1 minute')`);
  await service();assert.equal((await hold(fresh)).ingressQualificationCurrent,false,'newest expired cannot fall back');
  const changedApp={...base,providerEventId:'purchase-with-changed-app-config',reportedAppId:'changed-app',configuredProjectId:'changed-project'};
  await reserve(changedApp);await record(changedApp);assert.equal((await hold(changedApp)).negativeLifecycleHold,true,'project/app drift cannot erase original-chain negative');
  for(const reportedProductId of [null,'stale-product']) {
   const removal={...base,providerEventId:`historical-terminal-${reportedProductId}`,eventType:'REVOCATION',reportedProductId};
   await reserve(removal,{metadata:{provider_product_id:'historically-bound-product'}});
   assert.equal((await record(removal)).status,'recorded');closed(await hold(removal));assert.equal((await hold(removal)).negativeLifecycleHold,true);
   await owner();assert.equal(await one('select canonical_provider_product_id from private.native_production_paid_video_observations where canonical_receipt_id=$1',[removal.canonicalReceiptId]),'historically-bound-product');
  }
  const channel={...base,providerEventId:'channel-regression',reportedProductId:'channel-product',eventType:'RENEWAL'};
  await reserve(channel,{domain:'channel_subscription'});await record(channel);
  await owner();assert.equal(await one('select count(*)::int from private.native_production_ingress_observations where canonical_receipt_id=$1',[channel.canonicalReceiptId]),1);
  assert.equal(await one('select count(*)::int from private.native_production_paid_video_observations where canonical_receipt_id=$1',[channel.canonicalReceiptId]),0);
  // Failure of the second append rolls back the first append in the same RPC.
  const atomic={...base,providerEventId:'atomic-failure'};await reserve(atomic);await owner();
  await db.exec(`create function public.synthetic_native_hold_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_hold_failure';end$$;
   create trigger synthetic_failure before insert on private.native_production_paid_video_ledger_holds for each row execute function public.synthetic_native_hold_failure()`);
  await service();await assert.rejects(()=>record(atomic),/synthetic_hold_failure/);await owner();
  assert.equal(await one('select count(*)::int from private.native_production_paid_video_observations where canonical_receipt_id=$1',[atomic.canonicalReceiptId]),0);
  await db.exec('drop trigger synthetic_failure on private.native_production_paid_video_ledger_holds;drop function public.synthetic_native_hold_failure()');
  await service();assert.equal((await record(atomic)).status,'recorded');closed(await hold(atomic));
  if(process.env.NATIVE_DEPLOYMENT_PG_BIN) {
   assert.match(db.nativeVersion,/PostgreSQL\) 17\.6/u);
   for(const outcome of ['commit','rollback']) {
    const race={...base,providerEventId:`concurrent-${outcome}`};await reserve(race);
    await db.withConnection(async holder=>{
     await holder.query(`begin;set local request.jwt.claims='{"role":"service_role"}';set local request.jwt.claim.role='service_role';set local role service_role`);
     await holder.query('select public.record_native_production_ingress_observation($1)',[race]);
     const pending=record(race);
     try {
      await holder.query('reset role');let blocked=false;
      for(let attempt=0;attempt<100;attempt++){
       await holder.query('select pg_stat_clear_snapshot()');
       blocked=(await holder.query('select pg_backend_pid()=any(pg_blocking_pids($1)) blocked',[db.backendPid])).rows[0].blocked;
       if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(blocked,true,'competing exact receipt really waits on the shared event lock');
      await holder.query(outcome);assert.equal((await pending).status,outcome==='commit'?'duplicate':'recorded');
     } finally {await holder.query('rollback');await pending;}
    });
    await owner();
    assert.equal(await one('select count(*)::int from private.native_production_paid_video_observations where canonical_receipt_id=$1',[race.canonicalReceiptId]),1);
    assert.equal(await one('select count(*)::int from private.native_production_paid_video_ledger_holds where observation_id=$1',[race.canonicalReceiptId]),1);
   }
  }
  await owner();
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),balances);
  assert.deepEqual(await one('select jsonb_object_agg(key,state) from public.platform_money_kill_switches'),switches);
  const constraint=await one(`select pg_get_constraintdef(oid) from pg_constraint where conname='money_purchase_intents_sandbox_only_check'`);
  assert.match(constraint,/stripe_event_auction/);
  assert.equal(await one('select not materialize_held and not release_earnings from private.native_production_earning_controls'),true,
   'receipt observation never enables production earning materialization or release');
  assert.equal(await one('select not checkout_enabled and not access_enabled from private.native_production_checkout_controls'),true,
   'qualified production checkout support does not make ingress a checkout activation path');
 } finally {await db.close();}
});
