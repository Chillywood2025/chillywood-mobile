import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {harness,buyer,session,product,attempt} from '../helpers/merch-checkout-edge-harness.mjs';

const migration='20261101045810_merch_checkout_dispatch_provenance.sql';
test('real Edge + full SQL: no-dispatch proof, actor gates, retries, rollback and ambiguous holds', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=async()=>{await root();await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false);set role service_role`);};
 const claim=async(user,s)=>{await root();await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[JSON.stringify({sub:user,session_id:s,role:'authenticated'})]);await db.exec('set role authenticated');};
 const stock=async()=>{await root();return one('select reserved_quantity from public.merch_products where id=$1',[product]);};
 const requestFacts={productId:product,quantity:1,variantId:null,trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'};
 const transition=async(key,action,s=session,u=buyer,facts=requestFacts)=>{await service();return one('select public.transition_merch_checkout_dispatch($1,$2,$3,$4,$5)',[u,s,key,action,JSON.stringify(facts)]);};
 const reserve=async(key,price=1000)=>{await service();return one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,$5,$$usd$$)',[buyer,session,product,key,price]);};
 const rpc=async(name,args)=>{
  assert.ok(['reserve_merch_checkout_dispatch','reserve_merch_checkout_for_actor_with_tracking','transition_merch_checkout_dispatch','bind_commerce_tax_checkout_policy'].includes(name));
  await service();
  try {return {data:await one(`select public.${name}(${Object.keys(args).map((key,i)=>`${key} => $${i+1}`).join(',')})`,Object.values(args)),error:null};}
  catch(error){return {data:null,error:{message:error.message}};}
 };
 const edge=options=>harness({rpc,readRow:async()=>{await root();return one('select to_jsonb(p) from public.merch_products p where id=$1',[product]);},
  writeRow:async(body,id)=>{await service();await db.query('update public.merch_orders set provider_order_id=$1,stripe_checkout_session_id=$2,stripe_payment_intent_id=$3 where id=$4',[body.provider_order_id,body.stripe_checkout_session_id,body.stripe_payment_intent_id,id]);return {error:null};},...options});
 const body=key=>({product_id:product,quantity:1,attempt_id:key,tracking_mode:'tracked',expected_unit_price_minor:1000,expected_currency:'usd'});
 try {
  const host=await one("select md5('merch-host:'||n::text)::uuid from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('merch-host:'||n::text)::uuid::text,20260814),100)=0 limit 1"),hs=randomUUID();
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now()),($2,false,false,now())',[host,buyer]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[hs,host,session,buyer]);
  await db.query("insert into public.user_profiles(user_id,username,display_name) values($1,'dispatch_host','Host'),($2,'dispatch_buyer','Buyer') on conflict(user_id) do nothing",[host,buyer]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2) and d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host,buyer]);
  await service();await one(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}','dispatch-fixture','local_pgtap')`,[host]);
  await root();await db.query("insert into public.beta_access_memberships(user_id,access_status) values($1,'active')",[buyer]);
  await claim(host,hs);await one('select public.save_creator_merch_product_with_tracking($1,$$Test$$,$$Physical only$$,null,1000,20,$$published$$,null,$$tracked$$)',[product]);

  // Cutover: matching new RPC is absent on old schema. New Edge cannot fall
  // back to the unsafe old reserve or reach any provider request.
  const beforeUpgrade=edge(),unavailable=await beforeUpgrade.send(body(attempt));
  assert.equal(unavailable.status,409);assert.equal(unavailable.body.checkoutRetrySafe,undefined);
  assert.equal(beforeUpgrade.provider.length,0);assert.ok(!beforeUpgrade.calls.some(c=>c[0]==='provider-account'));assert.equal(await stock(),0);
  // Execute the exact base Edge source with real predecessor SQL as a negative
  // control. Old source leaves the hold; rollback only this synthetic proof.
  await root();await db.exec('begin');await service();
  const oldSource=fs.readFileSync('tests/fixtures/stripe-merch-checkout-before-dispatch.ts.txt','utf8');
  assert.equal(createHash('sha256').update(oldSource).digest('hex'),'1b57a825110e50ecbfc2950594f187696aae9cfb3b006a304626059ba91bd116','exact bf682f64 predecessor Edge fixture');
  const priorEdge=edge({source:oldSource});const priorRefusal=await priorEdge.send(body(attempt));
  assert.equal(priorRefusal.status,409);assert.equal(priorRefusal.body.checkoutRetrySafe,undefined);assert.equal(priorEdge.provider.length,0);
  await root();const old=await one('select to_jsonb(o) from public.merch_orders o where checkout_attempt_id=$1',[attempt]);
  assert.equal(old.payment_status,'pending');assert.equal(old.stripe_checkout_session_id,null);
  assert.equal(await stock(),1);
  const forward=fs.readFileSync(`supabase/migrations/${migration}`,'utf8');
  await root();await db.exec(forward);
  assert.equal(await one('select count(*)::int from private.merch_checkout_dispatch where order_id=$1',[old.id]),0,'upgrade never classifies pre-existing holds');
  assert.equal((await transition(attempt,'abort')).aborted,false);assert.equal(await stock(),1);
  await db.exec('rollback');assert.equal(await stock(),0);
  await root();
  await db.exec('begin');await db.exec(forward);
  assert.equal(await one("select has_function_privilege('service_role','public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)','execute')"),false);
  await db.exec('rollback');assert.equal(await one("select to_regclass('private.merch_checkout_dispatch')"),null);
  assert.equal(await one("select has_function_privilege('service_role','public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)','execute')"),true);
  await db.exec(forward);
  for(const identity of ['public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)',
   'public.transition_merch_checkout_dispatch(uuid,uuid,uuid,text,jsonb)']){
   const definition=await one('select pg_get_functiondef($1::regprocedure)',[identity]);
   assert.ok(definition.indexOf('perform private.platform_brand_retention_lock()')<definition.indexOf('perform pg_advisory_xact_lock('),'global latch precedes buyer lock');
   assert.ok(definition.includes('perform private.platform_brand_retention_lock()'));
  }

  const preflight=edge({envAccount:null});assert.equal((await preflight.send(body(attempt))).status,409);assert.equal(await stock(),0);
  assert.equal(preflight.calls.filter(c=>c[0].startsWith('reserve')).length,0);
  const failed=edge();const refusal=await failed.send(body(attempt));assert.equal(refusal.status,409);assert.equal(refusal.body.checkoutRetrySafe,true);assert.equal(refusal.body.abortedAttemptId,attempt);
  assert.equal(failed.provider.length,0);assert.equal(await stock(),0);
  assert.equal((await transition(attempt,'abort')).aborted,true,'duplicate abort is idempotent');
  const repeated=await edge().send(body(attempt));assert.equal(repeated.body.checkoutRetrySafe,true,'lost abort response recoverable by same attempt');
  await assert.rejects(()=>reserve(attempt),/attempt_closed/);
  await root();await db.exec('begin');
  await db.query("update public.merch_orders set payment_status='paid',stripe_payment_intent_id='pi_late_truth' where checkout_attempt_id=$1",[attempt]);
  assert.equal((await transition(attempt,'abort')).aborted,false,'later payment truth overrides stale aborted marker');
  await root();await db.exec('rollback');
  await assert.rejects(()=>reserve(randomUUID(),999),/displayed_price_changed/);assert.equal(await stock(),0,'whole reservation rolls back with stale price');
  await root();assert.equal(await one('select count(*)::int from private.merch_checkout_dispatch'),1,'no leaked provenance on rollback');
  const uppercaseAttempt='ABCDEF00-0000-4000-8000-000000000004';
  const uppercaseAbort=await edge().send(body(uppercaseAttempt));
  assert.equal(uppercaseAbort.body.checkoutRetrySafe,true);assert.equal(uppercaseAbort.body.abortedAttemptId,uppercaseAttempt,'SQL canonical UUID acknowledgement binds and echoes exact wire attempt');
  assert.equal(await stock(),0);

  // Establish synthetic reviewed evidence locally; never contact a provider.
  await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('physical_merch',$1,'acct_fixture','sandbox','US_all_destinations','all_supported_platforms','local','local',true,'automatic','self','txcd_99999999','inclusive','local','local','local',now(),now()+interval '1 day',now()+interval '1 day',true)`,[product]);
  const accountKey=randomUUID(),account=edge({accountError:true});assert.equal((await account.send(body(accountKey))).body.checkoutRetrySafe,true);assert.equal(await stock(),0);
  const key=randomUUID();const reserved=await reserve(key);assert.equal((await reserve(key)).id,reserved.id);assert.equal(await stock(),1);
  // Repeated/concurrent calls to the real atomic function serialize to one hold.
  await service();const same=await Promise.all([one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,session,product,key]),one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,session,product,key])]);
  assert.equal(same[0].id,same[1].id);assert.equal(await stock(),1);
  assert.equal((await transition(key,'abort',session,buyer,{...requestFacts,quantity:2})).aborted,false,'conflicting request cannot cancel original hold');
  assert.equal((await edge().send({...body(key),quantity:2})).body.checkoutRetrySafe,undefined);assert.equal(await stock(),1);
  await assert.rejects(()=>transition(key,'abort',randomUUID()),/current_session_required/);assert.equal(await stock(),1);
  assert.equal((await transition(key,'abort')).aborted,true);assert.equal(await stock(),0);
  await service();await assert.rejects(()=>one('select public.reserve_merch_checkout_for_actor_with_tracking($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,session,product,randomUUID()]),/permission denied/);
  for(const role of ['anon','authenticated','service_role']){
   await root();await db.exec(`set role ${role}`);await assert.rejects(()=>one('select count(*) from private.merch_checkout_dispatch'),/permission denied/);
   if(role!=='service_role')await assert.rejects(()=>one('select public.transition_merch_checkout_dispatch($1,$2,$3,$$abort$$,$4)',[buyer,session,key,JSON.stringify(requestFacts)]),/permission denied/);
  }
  await root();assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid='private.merch_checkout_dispatch'::regclass"),true);

  // Historical order with no provenance: no null-session inference, no backfill.
  const legacyKey=randomUUID();await service();await root();const legacy=await one('select public.reserve_merch_checkout_for_actor_with_tracking($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,session,product,legacyKey]);
  assert.equal((await transition(legacyKey,'abort')).aborted,false);assert.equal(await stock(),1);
  const legacyEdge=edge({providerError:true});assert.equal((await legacyEdge.send(body(legacyKey))).status,500);assert.equal(legacyEdge.provider.length,1,'exact legacy retry retained');
  await root();assert.equal(await one('select count(*)::int from private.merch_checkout_dispatch where order_id=$1',[legacy.id]),0);
  await db.query("update public.merch_orders set created_at=now()-interval '2 hours' where id=$1",[legacy.id]);
  assert.equal((await transition(legacyKey,'dispatch')).authorized,false);assert.equal((await transition(legacyKey,'abort')).aborted,false);assert.equal(await stock(),1);
  // Retained session persistence and signed-facts webhook remain compatible
  // with historical rows. Only actual provider expiry, not provenance cleanup,
  // releases this unclassified order (synthetic facts, no HTTP transaction).
  await root();await db.query("update public.merch_orders set stripe_checkout_session_id='cs_test_legacy_expiry' where id=$1",[legacy.id]);
  const facts={event_livemode:false,object_livemode:false,object_id:'cs_test_legacy_expiry',object_type:'checkout.session',
   metadata_order_id:legacy.id,client_reference_id:legacy.id,mode:'payment',status:'expired',payment_status:'unpaid',amount_minor:1000,currency:'usd'};
  await service();assert.equal((await one("select public.process_stripe_merch_webhook_lifecycle('evt_legacy_dispatch_fixture','checkout.session.expired',$1,$2)",[createHash('sha256').update(JSON.stringify(facts)).digest('hex'),facts])).status,'processed');
  assert.equal(await stock(),0);assert.equal((await transition(legacyKey,'abort')).aborted,false);
  const uncertainKey=randomUUID(),uncertain=edge({providerError:true});const unknown=await uncertain.send(body(uncertainKey));assert.equal(unknown.status,500);assert.equal(unknown.body.checkoutRetrySafe,undefined);
  assert.equal((await transition(uncertainKey,'abort')).aborted,false);assert.equal(await stock(),1);
  const retry=edge();assert.equal((await retry.send(body(uncertainKey))).status,200);assert.equal(await stock(),1);
  assert.equal(retry.provider[0].options.headers['Idempotency-Key'],uncertain.provider[0].options.headers['Idempotency-Key']);
  assert.equal(String(retry.provider[0].options.body),String(uncertain.provider[0].options.body),'immutable provider parameters on retry');
  assert.equal((await transition(uncertainKey,'abort')).aborted,false);
 }finally{await db.close();}
});
