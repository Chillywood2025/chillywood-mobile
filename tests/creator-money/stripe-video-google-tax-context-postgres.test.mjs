import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('paid-video refund tax context uses only the existing exact order and historical Google obligation',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const order=randomUUID(),buyer=randomUUID(),session=randomUUID(),video=randomUUID(),creator=randomUUID(),price=randomUUID();
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
   values('com.chillywood.mobile','test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const route=await one(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,google_program_id,verified_at,expires_at,enabled)
   values('android','acct_test','prod_video','synthetic','synthetic',$1,now(),now()+interval '1 hour',true) returning id`,[program]);
  await db.query(`insert into private.stripe_paid_video_orders(id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,checkout_session_id,payment_intent_id,charge_id,expires_at)
   values($1,$2,$3,$4,$5,$6,2,1000,'usd','acct_test','prod_video',$7,'refunded','cs_test_video','pi_video','ch_video',now()+interval '1 hour')`,[order,buyer,session,video,creator,price,randomUUID()]);
  const token='synthetic-paid-video-token',hash=createHash('sha256').update(token).digest('hex');
  const admission=await one(`insert into private.stripe_video_native_admissions(order_id,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,platform,token_hash,external_transaction_token,verification,expires_at)
   values($1,$2,$3,$4,$5,$6,$7,2,1000,'usd','android',$8,$9,'native_sdk_observation_unverified',now()+interval '2 minutes') returning id`,[order,route,buyer,session,video,creator,price,hash,token]);
  const policy=await one(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope)
   values('paid_video','prod_video','acct_test','test','worldwide','all_supported_platforms') returning id`);
  await db.query(`insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
   values('paid_video',$1,$2,'prod_video','acct_test','test','worldwide')`,[order,policy]);
  await db.query("update private.stripe_paid_video_orders set checkout_platform='android',native_admission_id=$2,tax_policy_id=$3 where id=$1",[order,admission,policy]);
  const binding=await one(`insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,capability_id,paid_video_admission_id,program_id,amount_minor,currency,external_transaction_token,token_hash)
   values('paid_video',$1,$2,$3,null,$4,$5,1000,'usd',$6,$7) returning id`,[order,buyer,session,admission,program,token,hash]);
  const tx=await one(`insert into private.google_play_external_transactions(binding_id,feature,quote_id,original_pre_tax_minor,original_tax_minor,transaction_time,remaining_pre_tax_minor,remaining_tax_minor)
   values($1,'paid_video',$2,900,100,now(),900,100) returning id`,[binding,order]);
  const context=()=>one('select private.google_refund_tax_context($1)',[tx]);
  assert.equal(await context(),null,'a transaction without its actual refund obligation is not evidence');
  await db.query(`insert into private.google_play_external_report_outbox(transaction_id,operation,cumulative_refund_minor,occurred_at,state,reason)
   values($1,'refund',200,now(),'blocked_tax','verified_refund_tax_provenance_required')`,[tx]);
  assert.equal(await context(),null,'no verified financial observation');
  for(const [kind,refund] of [['paid',0],['refund',200]])await db.query(`insert into private.stripe_paid_video_observations(order_id,event_id,kind,checkout_session_id,payment_intent_id,charge_id,amount_minor,refund_amount_minor,currency,stripe_account_id)
   values($1,$2,$3,'cs_test_video','pi_video','ch_video',1000,$4,'usd','acct_test')`,[order,`evt_synthetic_${kind}`,kind,refund]);
  const expected=await context();
  assert.equal(expected.quote_id,order);assert.equal(expected.platform_account_id,'acct_test');assert.equal(expected.recipient_account_id,null);
  assert.equal(expected.video_id,video);assert.equal(expected.price_id,price);assert.equal(expected.price_revision,2);assert.equal(expected.tax_policy_id,policy);
  assert.equal(expected.tax_minor,100);assert.equal(expected.buyer_id,buyer);assert.equal(expected.creator_id,creator);
  assert.equal(JSON.stringify(expected).includes(token),false);
  for(const [field,value,original] of [['buyer_id',randomUUID(),buyer],['session_id',randomUUID(),session],['video_id',randomUUID(),video],
   ['creator_id',randomUUID(),creator],['price_id',randomUUID(),price],['price_revision',3,2],['amount_minor',999,1000],
   ['stripe_account_id','acct_wrong','acct_test'],['stripe_product_id','prod_wrong','prod_video'],['tax_policy_id',randomUUID(),policy],
   ['checkout_session_id','cs_test_wrong','cs_test_video'],['payment_intent_id','pi_wrong','pi_video'],['charge_id','ch_wrong','ch_video']]){
   await db.query(`update private.stripe_paid_video_orders set ${field}=$2 where id=$1`,[order,value]);
   assert.equal(await context(),null,`foreign ${field} cannot produce context`);
   await db.query(`update private.stripe_paid_video_orders set ${field}=$2 where id=$1`,[order,original]);
  }
  for(const status of ['prepared','dispatched','checkout_ready','failed','paid']){
   await db.query('update private.stripe_paid_video_orders set status=$2 where id=$1',[order,status]);assert.equal(await context(),null,status);
  }
  await db.query("update private.stripe_paid_video_orders set status='refunded' where id=$1",[order]);
  await db.query('update private.google_play_external_transactions set quote_id=$2 where id=$1',[tx,randomUUID()]);assert.equal(await context(),null);
  await db.query('update private.google_play_external_transactions set quote_id=$2 where id=$1',[tx,order]);
  await db.query('update private.google_play_external_transactions set original_tax_minor=99 where id=$1',[tx]);assert.equal(await context(),null);
  await db.query('update private.google_play_external_transactions set original_tax_minor=100 where id=$1',[tx]);
  // Existing obligations survive expired/revoked sales qualifications.
  await db.query('update private.stripe_video_native_routes set revoked_at=now() where id=$1',[route]);
  await db.query('update private.google_play_external_program_config set revoked_at=now() where id=$1',[program]);
  assert.deepEqual(await context(),expected);
  await assert.rejects(()=>one("select public.begin_google_refund_tax_history($1,'acct_wrong')",[tx]),/account_mismatch/);
  const begun=await one("select public.begin_google_refund_tax_history($1,'acct_test')",[tx]);assert.deepEqual(begun.context,expected);
  const claimed=await one('select public.claim_google_refund_tax_context()');assert.deepEqual(claimed,expected);
  assert.equal(await one('select count(*)::int from private.google_play_external_transactions'),1);
  assert.equal(await one('select count(*)::int from private.stripe_paid_video_orders'),1);
  for(const role of ['anon','authenticated','service_role']){
   for(const fn of ['google_refund_tax_context','google_refund_tax_context_before_paid_video','lock_google_refund_tax_history_context','lock_google_refund_tax_history_context_before_paid_video'])
    assert.equal(await one('select has_function_privilege($1,$2,\'execute\')',[role,`private.${fn}(uuid)`]),false);
  }
  const missing=randomUUID();assert.equal(await one('select private.google_refund_tax_context($1)',[missing]),await one('select private.google_refund_tax_context_before_paid_video($1)',[missing]));
 }finally{await db.close();}
});
