import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {syntheticVideoMarketObservation} from '../helpers/stripe-video-market-fixture.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedCommerceCreator,acceptCommerceCreatorTerms,withCommerceActor} from '../helpers/automatic-commerce-fixture.mjs';

test('Google paid-video uses one exact existing-queue binding through real native dispatch',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()},video=randomUUID();
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  await seedCommerceBuyer(db,buyer);await seedCommerceCreator(db,creator);await acceptCommerceCreatorTerms(db,creator);
  await withCommerceActor(db,creator,()=>one("select public.declare_creator_money_eligibility(true,'US','CA')"));
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'SYNTHETIC Google video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator.id]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  const version=await one('select id from private.native_production_video_versions where source_id=$1 order by revision desc limit 1',[video]);
  await db.query(`insert into private.native_production_source_proofs(version_id,origin_provider,origin_bucket,origin_object,origin_generation,asset_sha256,byte_length,scan_receipt_sha256,adapter_version,evidence_sha256,verified_at,expires_at)
   values($1,'cloudflare_r2','chillywood-media-origin',$2,'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',repeat('a',64),1024,repeat('b',64),'synthetic-only',repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour')`,[version,`${creator.id}/${video}/source.mp4`]);
  assert.equal(await one('select private.stripe_video_delivery_ready($1)',[video]),true);
  await withCommerceActor(db,creator,()=>one("select public.set_my_stripe_sandbox_video_price($1,1000,'usd',true)",[video]));
  const order=await one("select public.prepare_stripe_sandbox_video_order($1,$2,$3,$4,'acct_test','prod_video')",[buyer.id,buyer.session,video,randomUUID()]);
  const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
   values('com.chillywood.mobile','test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const route=await one(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,verified_at,expires_at,enabled,google_program_id)
   values('android','acct_test','prod_video','synthetic','synthetic',now(),now()+interval '1 hour',true,$1) returning id`,[program]);
  const admission=await one("select public.admit_stripe_video_native_order($1,$2,$3,$4,'android',1,null,'synthetic-google-video-token')",[order.id,buyer.id,buyer.session,route]);
  const bind=(token='synthetic-google-video-token',who=buyer.id,session=buyer.session,admissionId=admission.admissionId)=>one('select public.bind_stripe_video_google_checkout($1,$2,$3,$4,$5,1)',[order.id,who,session,admissionId,token]);
  await assert.rejects(bind(),/google_video_automatic_tax_required/);
  assert.equal(await one("select count(*)::int from private.google_play_external_launch_bindings where feature='paid_video'"),0);
  const tax=await one(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('paid_video','prod_video','acct_test','test','worldwide','all_supported_platforms','synthetic','synthetic',true,'automatic','self','txcd_10000000','inclusive',
   'synthetic','synthetic','synthetic',now(),now()+interval '1 hour',now()+interval '1 hour',true) returning id`);
  await assert.rejects(bind('substituted-token'),/google_external_token_domain_reused/);
  await assert.rejects(bind(undefined,creator.id),/google_video_order_unavailable/);
  await assert.rejects(bind(undefined,buyer.id,randomUUID()),/google_video_order_unavailable/);
  await assert.rejects(bind(undefined,buyer.id,buyer.session,randomUUID()),/google_video_order_unavailable/);
  const binding=await bind();assert.equal((await bind()).bindingId,binding.bindingId);
  assert.equal(JSON.stringify(binding).includes('synthetic-google-video-token'),false);
  assert.equal(await one('select capability_id from private.google_play_external_launch_bindings where id=$1',[binding.bindingId]),null);
  assert.equal(await one('select paid_video_admission_id from private.google_play_external_launch_bindings where id=$1',[binding.bindingId]),admission.admissionId);
  // BEFORE INSERT domain check runs before any FK checks. No fake legacy row is inserted.
  await assert.rejects(()=>db.query(`insert into private.google_play_external_admissions(eligibility_id,capability_id,program_id,buyer_id,session_id,creator_id,feature,source_id,amount_minor,token_hash)
   values($1,$2,$3,$4,$5,$6,'creator_tip',$7,1000,encode(extensions.digest('synthetic-google-video-token','sha256'),'hex'))`,[randomUUID(),randomUUID(),program,buyer.id,buyer.session,creator.id,randomUUID()]),/google_external_token_domain_reused/);
  // A separate legacy fixture is ONLY a historical token-domain negative case;
  // the successful paid-video binding above has no legacy capability at all.
  const legacyCap=await one(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at)
   values('event_auction',$1,'acct_legacy','android','google_play','US','android_external_content_link','usd','test','card',50,2000,'synthetic','synthetic',now(),now()+interval '1 hour') returning id`,[creator.id]);
  const legacyEligibility=await one(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
   values($1,$2,$3,'synthetic',now(),now()+interval '2 minutes') returning id`,[legacyCap,buyer.id,buyer.session]);
  await db.query(`insert into private.google_play_external_admissions(eligibility_id,capability_id,program_id,buyer_id,session_id,creator_id,feature,source_id,amount_minor,token_hash)
   values($1,$2,$3,$4,$5,$6,'event_auction',$7,1000,encode(extensions.digest('synthetic-legacy-token','sha256'),'hex'))`,[legacyEligibility,legacyCap,program,buyer.id,buyer.session,creator.id,randomUUID()]);
  await assert.rejects(()=>db.query(`insert into private.stripe_video_native_admissions(order_id,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,platform,token_hash,external_transaction_token,verification,expires_at)
   select order_id,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,platform,encode(extensions.digest('synthetic-legacy-token','sha256'),'hex'),'synthetic-legacy-token',verification,expires_at
   from private.stripe_video_native_admissions where id=$1`,[admission.admissionId]),/google_external_token_domain_reused/);
  await assert.rejects(()=>db.query(`insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,program_id,amount_minor,currency,external_transaction_token,token_hash)
   values('paid_video',$1,$2,$3,$4,1000,'usd','bad',repeat('d',64))`,[randomUUID(),buyer.id,buyer.session,program]),/google_external_binding_domain/);
  const market=await syntheticVideoMarketObservation(db,order.id);
  const dispatch=(id,proof,who=buyer.id,session=buyer.session)=>one('select public.dispatch_stripe_sandbox_video_order($1,$2,$3,$4)',[id,who,session,proof]);
  for(const patch of [{country:'CA'},{country:'XX'},{country:'T1'},{nonce:null},{bodySha256:'bad'},
   {requestId:randomUUID()},{videoId:randomUUID()},{platform:'web'},
   {observedAt:new Date(Date.now()-600000).toISOString(),expiresAt:new Date(Date.now()-300000).toISOString()},
   {observedAt:new Date(Date.now()+60000).toISOString(),expiresAt:new Date(Date.now()+360000).toISOString()}]){
   await assert.rejects(dispatch(order.id,{...market,...patch}),/checkout_market_/);
  }
  await assert.rejects(dispatch(order.id,market,creator.id),/checkout_market_order_mismatch/);
  await assert.rejects(dispatch(order.id,market,buyer.id,randomUUID()),/checkout_market_order_mismatch/);
  assert.equal(await one('select count(*)::int from private.stripe_video_market_admissions'),0);
  // Existing downstream financial checks still run; failure must roll nonce consumption back.
  await db.query('update private.stripe_paid_video_prices set amount_minor=1001 where id=$1',[order.price_id]);
  await assert.rejects(dispatch(order.id,market),/native_admission_required|checkout_dispatch_unavailable/);
  assert.equal(await one('select count(*)::int from private.stripe_video_market_admissions'),0);
  await db.query('update private.stripe_paid_video_prices set amount_minor=1000 where id=$1',[order.price_id]);
  const dispatched=await dispatch(order.id,market);
  assert.equal(dispatched.tax.policyId,tax);
  assert.equal(await one('select status from private.stripe_paid_video_orders where id=$1',[order.id]),'dispatched');
  await assert.rejects(dispatch(order.id,market),/checkout_market_order_mismatch/);
  assert.equal(await one('select count(*)::int from private.stripe_video_market_admissions'),1);
  const other=async()=>one(`insert into private.stripe_paid_video_orders(buyer_id,session_id,video_id,creator_id,price_id,price_revision,
   amount_minor,currency,stripe_account_id,stripe_product_id,request_id,expires_at)
   select buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,$2,expires_at
   from private.stripe_paid_video_orders where id=$1 returning id`,[order.id,randomUUID()]);
  const second=await other();
  await assert.rejects(dispatch(second,await syntheticVideoMarketObservation(db,second,{nonce:market.nonce})),/unique constraint/);
  assert.equal(await one('select status from private.stripe_paid_video_orders where id=$1',[second]),'prepared');
  const third=await other(),nonce=randomUUID();
  const submitted=await Promise.allSettled([dispatch(second,await syntheticVideoMarketObservation(db,second,{nonce})),
   dispatch(third,await syntheticVideoMarketObservation(db,third,{nonce}))]);
  assert.equal(submitted.filter(x=>x.status==='fulfilled').length,1,'one unique nonce authorizes only one dispatch');
  assert.equal(await one('select count(*)::int from private.stripe_video_market_admissions'),2);
  for(const role of ['anon','authenticated','service_role']){
   assert.equal(await one("select has_table_privilege($1,'private.stripe_video_market_admissions','select')",[role]),false);
   assert.equal(await one("select has_function_privilege($1,'public.dispatch_stripe_sandbox_video_order_before_market(uuid,uuid,uuid)','execute')",[role]),false);
  }
  for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid,jsonb)','execute')",[role]),false);
  assert.equal(await one("select to_regprocedure('public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid)') is null"),true);
  await assert.rejects(()=>db.query('delete from private.stripe_video_market_admissions where nonce=$1',[market.nonce]),/immutable/);
  await assert.rejects(bind(),/google_video_order_unavailable/);
  assert.equal(await one("select count(*)::int from private.google_play_external_launch_bindings where feature='paid_video' and quote_id=$1",[order.id]),1);
  assert.equal(await one('select count(*)::int from private.google_play_external_transactions'),0,'binding alone is not a paid transaction');
  for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'public.bind_stripe_video_google_checkout(uuid,uuid,uuid,uuid,text,integer)','execute')",[role]),false);
 }finally{await db.close();}
});
