import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from '../helpers/native-deployment-database.mjs';

test('full-schema native provenance is immutable evidence only, and dispatch rechecks global live mode', {timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>nativeDatabaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=async()=>{await db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false);set role service_role`);};
 const owner=async()=>{await db.exec('reset role');};
 const base={providerEventId:'native-prod-1',canonicalReceiptId:'cb000000-0000-4000-8000-000000000099',rawPayloadHash:'a'.repeat(64),provider:'revenuecat_google_play',environment:'production',
  eventType:'RENEWAL',reportedAppId:'app_fixture',configuredProjectId:'proj_fixture',reportedProductId:'creator_monthly:monthly',
  originalTransactionId:'GPA.original',transactionId:'GPA.original..3',userId:'cb000000-0000-4000-8000-000000000010'};
 const record=async facts=>one('select public.record_native_production_ingress_observation($1)',[facts]);
 const reserve=async facts=>{
  await one('select public.reserve_revenuecat_webhook_ingress_event($1,$2)',[facts.providerEventId,facts.rawPayloadHash]);
  await owner();
  facts.canonicalReceiptId=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,app_user_id,
   environment,event_type,status,occurred_at,idempotency_key,raw_payload_hash,metadata)
   select $1,$2,id,product_key,$3::uuid,$3,'production',$4,'processed',clock_timestamp(),'native-provenance:'||$1,$5,
    jsonb_build_object('original_transaction_id',$6::text) from public.monetization_products
   where product_type='channel_subscription' order by id limit 1 returning id`,
   [facts.providerEventId,facts.provider,facts.userId,facts.eventType,facts.rawPayloadHash,facts.originalTransactionId]);
  await service();
 };
 try {
  const balances=await one('select count(*)::int from public.creator_earnings_ledger');
  const qualifications=await one('select count(*)::int from private.native_production_ingress_qualifications');assert.equal(qualifications,0);
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous) values($1,false,false)',[base.userId]);
  await service();
  await assert.rejects(()=>record(base),/native_ingress_authenticated_receipt_required/);
  await reserve(base);assert.deepEqual(await record(base),{status:'recorded',financialAuthority:false});
  for(const field of ['reportedAppId','provider','reportedProductId','originalTransactionId','transactionId','userId']) {
   const value=field==='provider'?'revenuecat_app_store':field==='userId'?'cb000000-0000-4000-8000-000000000011':'changed';
   await assert.rejects(()=>record({...base,[field]:value}),/native_ingress_observation_identity_conflict|native_ingress_canonical_receipt_required/);
  }
  assert.equal((await record({...base,configuredProjectId:'changed-config'})).status,'duplicate');
  for(const facts of [{...base,environment:'sandbox'},{...base,financialAuthority:true},{...base,transactionId:23},null])
   await assert.rejects(()=>record(facts),/native_ingress_observation_invalid/);
  for(const table of ['qualifications','revocations','observations']) {
   await assert.rejects(()=>db.query(`select * from private.native_production_ingress_${table}`),/permission denied/);
   await assert.rejects(()=>db.query(`insert into private.native_production_ingress_${table} default values`),/permission denied/);
  }
  await owner();
  assert.equal(await one(`select configured_project_id from private.native_production_ingress_observations where provider_event_id=$1`,[base.providerEventId]),'proj_fixture');
  assert.equal(await one(`select qualification_id from private.native_production_ingress_observations where provider_event_id=$1`,[base.providerEventId]),null);
  const q=await one(`insert into private.native_production_ingress_qualifications(project_id,app_id,provider,provider_product_id,evidence_reference,verified_at,expires_at)
   values('proj_fixture','app_fixture','revenuecat_google_play','creator_monthly:monthly','synthetic-only',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour') returning id`);
  await service();assert.equal((await record(base)).status,'duplicate'); // no retroactive qualification
  const qualified={...base,providerEventId:'native-prod-qualified'};await reserve(qualified);await record(qualified);
  await owner();assert.equal(await one(`select qualification_id from private.native_production_ingress_observations where provider_event_id=$1`,[qualified.providerEventId]),q);
  await db.query('insert into private.native_production_ingress_revocations(qualification_id) values($1)',[q]);
  await assert.rejects(()=>db.query('delete from private.native_production_ingress_qualifications where id=$1',[q]),/append_only/);
  await assert.rejects(()=>db.query('update private.native_production_ingress_observations set transaction_id=\'rewrite\''),/append_only/);
  await db.exec(`insert into private.native_production_ingress_qualifications(project_id,app_id,provider,provider_product_id,evidence_reference,verified_at,expires_at)
   values('proj_fixture','app_fixture','revenuecat_google_play','creator_monthly:monthly','synthetic-still-valid-older',clock_timestamp()-interval '45 minutes',clock_timestamp()+interval '1 hour')`);
  const newer=await one(`insert into private.native_production_ingress_qualifications(project_id,app_id,provider,provider_product_id,evidence_reference,verified_at,expires_at)
   values('proj_fixture','app_fixture','revenuecat_google_play','creator_monthly:monthly','synthetic-expired',clock_timestamp()-interval '30 minutes',clock_timestamp()-interval '1 minute') returning id`);
  assert.ok(newer);
  await service();
  for(const type of ['REFUND','REVOCATION','EXPIRATION']) {
   const terminal={...base,providerEventId:`native-prod-${type}`,eventType:type};await reserve(terminal);await record(terminal);
  }
  await owner();
  assert.equal(await one(`select count(*)::int from private.native_production_ingress_observations where event_type in ('REFUND','REVOCATION','EXPIRATION') and qualification_id is null and original_transaction_id='GPA.original' and transaction_id='GPA.original..3'`),3);
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),balances);
  assert.equal(await one(`select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='private' and c.relname like 'native_production_ingress_%' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity`),3);
  await db.exec(`set role authenticated`);
  await assert.rejects(()=>record(base),/permission denied/);
  await assert.rejects(()=>db.query(`select private.assert_creator_native_dispatch_environment('production')`),/permission denied/);
  await owner();
  for(const state of ['off','sandbox_only','on']) {
   await db.query(`update public.platform_money_kill_switches set state=$1 where key='live_money_enabled'`,[state]);
   for(const mode of ['sandbox','production']) {
    const call=()=>db.query('select private.assert_creator_native_dispatch_environment($1)',[mode]);
    if(state===(mode==='sandbox'?'off':'on'))await call();else await assert.rejects(call,/creator_money_checkout_rail_unavailable/);
   }
  }
  for(const mode of [null,'setup','live'])await assert.rejects(()=>db.query('select private.assert_creator_native_dispatch_environment($1)',[mode]),/creator_money_checkout_rail_unavailable/);
  const body=await one(`select pg_get_functiondef('public.begin_creator_money_checkout(uuid,uuid)'::regprocedure)`);
  assert.match(body,/return public\.begin_creator_money_checkout_before_native\(p_purchase_intent_id,p_checkout_attempt_id\)/);
  const retained=await one(`select pg_get_functiondef('public.begin_creator_money_checkout_before_native(uuid,uuid)'::regprocedure)`);
  const guard=retained.indexOf('assert_creator_native_dispatch_environment(i.environment)'),claim=retained.indexOf('update public.money_purchase_intents set checkout_attempt_id=');
  assert.ok(guard>=0&&claim>guard,'retained shared owner checks current rail before one-shot claim');
  for(const role of ['anon','authenticated','service_role'])assert.equal(await one("select has_function_privilege($1,'public.begin_creator_money_checkout_before_native(uuid,uuid)','EXECUTE')",[role]),false);
  const constraint=await one(`select pg_get_constraintdef(oid) from pg_constraint where conname='money_purchase_intents_sandbox_only_check'`);
  assert.match(constraint,/stripe_event_auction/);
  assert.equal(await one('select not checkout_enabled and not access_enabled from private.native_production_checkout_controls'),true);
 } finally {await db.close();}
});
