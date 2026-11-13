import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {syntheticVideoMarketObservation} from '../helpers/stripe-video-market-fixture.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedCommerceCreator,acceptCommerceCreatorTerms,withCommerceActor} from '../helpers/automatic-commerce-fixture.mjs';

test('native sandbox admission binds the shared order without live Connect authority',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()},video=randomUUID();
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  await seedCommerceBuyer(db,buyer);await seedCommerceCreator(db,creator);await acceptCommerceCreatorTerms(db,creator);
  await withCommerceActor(db,creator,()=>one("select public.declare_creator_money_eligibility(true,'US','CA')"));
  assert.equal(await one('select public.wave1_creator_money_subject_authorized_internal($1)',[creator.id]),false);
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'SYNTHETIC native video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator.id]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  const price=await withCommerceActor(db,creator,()=>one('select public.set_my_stripe_sandbox_video_price($1,1000,\'usd\',true)',[video]));
  const order=await one("select public.prepare_stripe_sandbox_video_order($1,$2,$3,$4,'acct_test','prod_video')",[buyer.id,buyer.session,video,randomUUID()]);
  const route=async(platform='ios',enabled=true,account='acct_test',program=null)=>one(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,verified_at,expires_at,enabled,google_program_id)
   values($1,$2,'prod_video','synthetic only','synthetic only',now(),now()+interval '1 hour',$3,$4) returning id`,[platform,account,enabled,program]);
  const admit=(id,platform='ios',who=buyer.id,session=buyer.session,token=null,orderId=order.id)=>one('select public.admit_stripe_video_native_order($1,$2,$3,$4,$5,1,$6,$7)',[orderId,who,session,id,platform,platform==='ios'?'USA':null,token]);
  await assert.rejects(admit(await route('ios',false)),/native_route_unqualified/);
  await assert.rejects(admit(await route('ios',true,'acct_wrong')),/native_route_unqualified/);
  const ios=await route();
  for(const args of [[null,buyer.id,buyer.session,ios],[order.id,null,buyer.session,ios],[order.id,buyer.id,null,ios],[order.id,buyer.id,buyer.session,null]]) {
   await assert.rejects(()=>one("select public.admit_stripe_video_native_order($1,$2,$3,$4,'ios',1,'USA',null)",args),/native_order_authority_required/);
  }
  await assert.rejects(()=>one("select public.admit_stripe_video_native_order($1,$2,$3,$4,'ios',1,'CAN',null)",[order.id,buyer.id,buyer.session,ios]),/native_observation_invalid/);
  await assert.rejects(admit(ios,'ios',creator.id),/native_order_authority_required/);
  await assert.rejects(admit(ios,'ios',buyer.id,randomUUID()),/native_order_authority_required/);
  const a=await admit(ios);assert.equal(a.financialAuthority,false);assert.equal(a.accessGranted,false);
  assert.equal(a.verification,'native_storefront_observation_unverified');assert.equal((await admit(ios)).admissionId,a.admissionId);
  assert.equal(await one('select checkout_platform from private.stripe_paid_video_orders where id=$1',[order.id]),'ios');
  assert.equal(await one('select private.stripe_video_native_admission_current($1)',[order.id]),true);
  await assert.rejects(()=>db.query('update private.stripe_video_native_admissions set amount_minor=1 where id=$1',[a.admissionId]),/immutable/);
  await db.query("update public.wave1_creator_eligibility set kyc_complete=false where creator_user_id=$1",[creator.id]);
  assert.equal(await one('select private.stripe_video_native_admission_current($1)',[order.id]),false);
  await db.query('update public.wave1_creator_eligibility set kyc_complete=null where creator_user_id=$1',[creator.id]);
  await db.query('update private.stripe_video_native_routes set revoked_at=now() where id=$1',[ios]);
  const iosMarket=await syntheticVideoMarketObservation(db,order.id);
  await assert.rejects(()=>one('select public.dispatch_stripe_sandbox_video_order($1,$2,$3,$4)',[order.id,buyer.id,buyer.session,iosMarket]),/native_admission_required/);
  assert.equal(await one('select status from private.stripe_paid_video_orders where id=$1',[order.id]),'prepared');
  const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
   values('com.chillywood.mobile','test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const android=await route('android',true,'acct_test',program);
  const makeOrder=async()=>one(`insert into private.stripe_paid_video_orders(buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,expires_at)
   values($1,$2,$3,$4,$5,1,1000,'usd','acct_test','prod_video',$6,now()+interval '1 hour') returning id`,[buyer.id,buyer.session,video,creator.id,price.id,randomUUID()]);
  const second=await makeOrder(),third=await makeOrder();
  const native=await admit(android,'android',buyer.id,buyer.session,'opaque-synthetic-token',second);
  assert.equal(native.platform,'android');assert.equal(JSON.stringify(native).includes('opaque-synthetic-token'),false);
  const androidMarket=await syntheticVideoMarketObservation(db,second);
  await assert.rejects(()=>one('select public.dispatch_stripe_sandbox_video_order($1,$2,$3,$4)',[second,buyer.id,buyer.session,androidMarket]),/native_reporting_binding_required/);
  await assert.rejects(admit(android,'android',buyer.id,buyer.session,'opaque-synthetic-token',third),/unique constraint/);
  assert.equal(await one('select checkout_platform from private.stripe_paid_video_orders where id=$1',[third]),'web');
  assert.equal(await one('select count(*)::int from private.stripe_video_native_admissions where order_id=$1',[third]),0);
  const future=await one(`insert into private.stripe_video_native_admissions(order_id,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,platform,token_hash,external_transaction_token,verification,created_at,expires_at)
   select $1,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,platform,repeat('f',64),'synthetic-future-token',verification,now()+interval '1 minute',now()+interval '2 minutes'
   from private.stripe_video_native_admissions where id=$2 returning id`,[third,native.admissionId]);
  await db.query("update private.stripe_paid_video_orders set checkout_platform='android',native_admission_id=$2 where id=$1",[third,future]);
  assert.equal(await one('select private.stripe_video_native_admission_current($1)',[third]),false,'future native observation is not current');
  await db.query('update private.stripe_paid_video_prices set revision=revision+1 where id=$1',[price.id]);
  assert.equal(await one('select private.stripe_video_native_admission_current($1)',[second]),false);
  for(const role of ['anon','authenticated','service_role'])assert.equal(await one("select has_table_privilege($1,'private.stripe_video_native_admissions','select')",[role]),false);
  assert.equal(await one("select has_function_privilege('service_role','public.dispatch_stripe_sandbox_video_order_before_native(uuid,uuid,uuid)','execute')"),false);
 }finally{await db.close();}
});
