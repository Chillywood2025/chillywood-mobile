import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedCommerceCreator,acceptCommerceCreatorTerms,withCommerceActor} from '../helpers/automatic-commerce-fixture.mjs';

test('platform-aware reads gate new checkout without revoking historical access',{timeout:1200000},async()=>{
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

  const read=(platform)=>withCommerceActor(db,buyer,()=>one(platform===undefined
   ?'select public.resolve_stripe_sandbox_video_access($1)':'select public.resolve_stripe_sandbox_video_access($1,$2)',platform===undefined?[video]:[video,platform]));
  const web=await read();assert.equal(web.checkoutAllowed,true);
  assert.deepEqual(await read('web'),{...web,checkoutPlatform:'web'});
  for(const p of ['ios','android']){assert.equal((await read(p)).checkoutAllowed,false);assert.equal((await read(p)).canAccess,false);}
  await assert.rejects(read(null),/checkout_platform_invalid/);await assert.rejects(read('other'),/checkout_platform_invalid/);
  const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
   values('com.chillywood.mobile','test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const route=async(platform,enabled=false)=>one(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,verified_at,expires_at,enabled,google_program_id)
   values($1,'acct_test','prod_video','synthetic','synthetic',now(),now()+interval '1 hour',$2,$3) returning id`,[platform,enabled,platform==='android'?program:null]);
  await route('ios');const android=await route('android',true);
  assert.equal((await read('android')).checkoutAllowed,false,'route alone cannot bypass missing tax qualification');
  const tax=await one(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('paid_video','prod_video','acct_test','test','worldwide','all_supported_platforms','synthetic','synthetic',true,'automatic','self','txcd_10000000','inclusive',
   'synthetic','synthetic','synthetic',now(),now()+interval '1 hour',now()+interval '1 hour',true) returning id`);
  assert.equal((await read('ios')).checkoutAllowed,false,'default disabled route stays disabled');
  assert.equal((await read('android')).checkoutAllowed,true);
  const ios=await route('ios',true);
  assert.equal((await read('ios')).checkoutAllowed,true);
  await db.exec('begin');
  await db.query('update private.stripe_video_native_routes set revoked_at=now() where id=$1',[ios]);
  for(const [verified,expires] of [["-2 hours","-1 hour"],["1 hour","2 hours"]]){
   await db.query(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,verified_at,expires_at,enabled)
    values('ios','acct_test','prod_video','synthetic','synthetic',now()+$1::interval,now()+$2::interval,true)`,[verified,expires]);
   assert.equal(await one("select private.stripe_video_native_checkout_candidate('ios')"),false,'expired/future route is not current');
  }
  await db.exec('rollback');
  const exact=(id=android,account='acct_test',product='prod_video',session=buyer.session)=>one(
   "select public.read_stripe_video_native_checkout_eligibility($1,$2,$3,'android',$4,$5,$6)",[buyer.id,session,video,id,account,product]);
  assert.equal((await exact()).checkoutAllowed,true);
  assert.equal((await exact(ios)).checkoutAllowed,false);
  assert.equal((await exact(android,'acct_wrong')).checkoutAllowed,false);
  assert.equal((await exact(android,'acct_test','prod_wrong')).checkoutAllowed,false);
  await assert.rejects(exact(android,'acct_test','prod_video',randomUUID()),/buyer_authority_required/);
  const output=JSON.stringify(await exact());
  for(const secret of ['acct_test','prod_video','synthetic',android,program,tax,'token','qualification_reference'])assert.equal(output.includes(secret),false);
  await db.query('update private.google_play_external_program_config set revoked_at=now() where id=$1',[program]);
  assert.equal((await read('android')).checkoutAllowed,false);
  assert.equal((await read('ios')).checkoutAllowed,true);
  await db.query('update private.commerce_tax_qualifications set revoked_at=now() where id=$1',[tax]);
  assert.equal((await read('ios')).checkoutAllowed,false);
  assert.equal((await read()).checkoutAllowed,true,'web legacy contract remains unchanged');
  await db.query('update private.stripe_video_native_routes set revoked_at=now() where id=$1',[ios]);
  const order=await one("select public.prepare_stripe_sandbox_video_order($1,$2,$3,$4,'acct_test','prod_video')",[buyer.id,buyer.session,video,randomUUID()]);
  await db.query("update private.stripe_paid_video_orders set status='checkout_ready',checkout_session_id='cs_test_read' where id=$1",[order.id]);
  await one('select public.observe_stripe_sandbox_video_payment($1,$2,$3)',[order.id,'evt_synthetic_read',{livemode:false,accountId:'acct_test',checkoutSessionId:'cs_test_read',
   orderId:order.id,buyerId:buyer.id,videoId:video,productId:'prod_video',currency:'usd',amountMinor:1000,paymentStatus:'paid',paymentIntentStatus:'succeeded',
   platformHeld:true,chargePaid:true,paymentIntentId:'pi_read',chargeId:'ch_read',refundAmountMinor:0}]);
  for(const platform of ['web','ios','android']){
   const granted=await read(platform);assert.equal(granted.canAccess,true);assert.equal(granted.checkoutAllowed,false);assert.equal(granted.reason,'sandbox_grant');
  }
  assert.equal((await exact()).canAccess,true,'exact route revocation does not erase grant');
  assert.equal((await withCommerceActor(db,creator,()=>one("select public.resolve_stripe_sandbox_video_access($1,'ios')",[video]))).reason,'owner');
  for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'public.read_stripe_video_native_checkout_eligibility(uuid,uuid,uuid,text,uuid,text,text)','execute')",[role]),false);
  assert.equal(await one("select has_function_privilege('anon','public.resolve_stripe_sandbox_video_access(uuid,text)','execute')"),false);
 }finally{await db.close();}
});

