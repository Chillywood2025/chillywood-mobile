import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Real purchase-intent and provider processors in a full disposable schema.
// Only users, legal acceptance, test product/account qualification and the signed
// provider delivery inputs are fixtures. No provider/earnings ledger is inserted
// by this test. This does not establish a real store receipt or live readiness.
test('canonical iOS and Google sandbox purchases feed test cashout sources and canonical refunds invalidate them', {timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const hostSession='cd000000-0000-4000-8000-000000000001';
 const buyers=['cd000000-0000-4000-8000-000000000010','cd000000-0000-4000-8000-000000000020'];
 const sessions=['cd000000-0000-4000-8000-000000000011','cd000000-0000-4000-8000-000000000021'];
 const service=async()=>{await db.exec('reset role');await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false),set_config('request.jwt.claim.role','service_role',false)");};
 const claim=async(user,session,platform='ios')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.headers',$2,false)",
   [JSON.stringify({role:'authenticated',sub:user,session_id:session}),JSON.stringify({'x-chillywood-platform':platform})]);
  await db.exec('set role authenticated');
 };
 try {
  const host=await scalar("select md5('sandbox-cashout-canonical-host:'||n)::uuid from generate_series(1,10000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('sandbox-cashout-canonical-host:'||n)::uuid::text,20260814),100)=0 limit 1");
  for(const [user,session] of [[host,hostSession],...buyers.map((user,i)=>[user,sessions[i]])]){
   await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now())',[user]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
   await db.query('insert into public.sandbox_monetization_testers(user_id) values($1)',[user]);
  }
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host]);
  await service();
  assert.equal((await scalar(`select public.wave1_evaluate_creator_eligibility($1,
   '{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}',
   'sandbox-cashout-canonical-fixture','local_pgtap')`,[host])).state,'VERIFIED');
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled','creator_monetization_enabled','digital_sales_enabled','stripe_connect_enabled'); update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled')");
  const qualification=await scalar(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values($1,'acct_canonicalSandboxPlatform','acct_canonicalSandboxCreator','ba_canonicalSandboxDestination','scheduled','card',0,0,
   'SYNTHETIC-CANONICAL-TEST-v1',0,1000,0,0,true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 day') returning id`,[host]);
  await claim(host,hostSession);
  const offer=await scalar("select public.set_creator_channel_subscription_offer('Sandbox cashout canonical monthly','Monthly','sandbox')");
  const receipts=[];
  for(const [index,platform] of ['ios','android'].entries()){
   await claim(buyers[index],sessions[index],platform);
   const intent=await scalar('select public.create_creator_channel_subscription_purchase_intent($1)',[offer.id]);
   assert.equal(intent.amountMinor,499);
   assert.equal(intent.provider,platform==='ios'?'revenuecat_app_store':'revenuecat_google_play');
   assert.equal((await scalar('select public.begin_creator_money_checkout($1,gen_random_uuid())',[intent.id])).startAuthorized,true);
   await service();
   const fn=platform==='ios'?'process_revenuecat_app_store_event_atomic':'process_revenuecat_google_play_event_atomic';
   const original=`canonical-cashout-${platform}-original`;
   const process=type=>scalar(`select public.${fn}($1,$2,$3,$4,'sandbox',now(),now()+interval '31 days',$5,'usd',repeat('a',64),$6,null)`,
    [`canonical-cashout-${platform}-${type}`,type,buyers[index],intent.providerProductId,intent.amountMinor,original]);
   const purchased=await process('INITIAL_PURCHASE');
   assert.equal(purchased.status,'processed',JSON.stringify(purchased));
   assert.ok(purchased.ledgerEventId,'canonical processor returned ledger identity');
   const ledger=(await db.query('select * from public.money_access_ledger_events where id=$1',[purchased.ledgerEventId])).rows[0];
   assert.equal(ledger.creator_id,host);assert.equal(ledger.user_id,buyers[index]);
   assert.equal(ledger.environment,'sandbox');assert.equal(ledger.payable_state,'not_payable');
   assert.equal(ledger.amount_minor,499);
   const source=await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]);
   assert.equal(source?.netMinor,449,`${platform} canonical output must satisfy the real source adapter (explicit fixture 10% deduction)`);
   const duplicate=await process('INITIAL_PURCHASE');
   assert.equal(duplicate.ledgerEventId,purchased.ledgerEventId,'duplicate provider delivery must not create a second source');
   receipts.push({platform,purchased,process});
  }
  assert.equal(await scalar("select count(*)::int from public.money_access_ledger_events where creator_id=$1 and environment='sandbox'",[host]),2);
  for(const {platform,purchased,process} of receipts){
   const refund=await process('REFUND');assert.equal(refund.status,'processed',JSON.stringify(refund));
   assert.equal(await scalar('select private.sandbox_cashout_source($1,$2)',[purchased.ledgerEventId,qualification]),null,`${platform} canonical refund must invalidate the original source`);
  }
  assert.equal(await scalar("select count(*)::int from public.money_access_ledger_events where creator_id=$1 and payable_state in ('payable','paid')",[host]),0);
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_executions'),0);
 }finally{await db.close();}
});
