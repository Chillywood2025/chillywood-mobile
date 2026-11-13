import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedCommerceCreator,acceptCommerceCreatorTerms,withCommerceActor} from '../helpers/automatic-commerce-fixture.mjs';
test('native creation atomically selects original transport and cannot convert web orders',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()},video=randomUUID(),request=randomUUID();
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  await seedCommerceBuyer(db,buyer);await seedCommerceCreator(db,creator);await acceptCommerceCreatorTerms(db,creator);
  await withCommerceActor(db,creator,()=>one("select public.declare_creator_money_eligibility(true,'US','CA')"));
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'SYNTHETIC atomic video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator.id]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  await withCommerceActor(db,creator,()=>one("select public.set_my_stripe_sandbox_video_price($1,1000,'usd',true)",[video]));
  const route=await one(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,verified_at,expires_at,enabled)
   values('ios','acct_test','prod_video','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const web=()=>one("select public.prepare_stripe_sandbox_video_order($1,$2,$3,$4,'acct_test','prod_video')",[buyer.id,buyer.session,video,request]);
  const native=(routeId=route,session=buyer.session)=>one("select public.prepare_stripe_video_native_order($1,$2,$3,$4,'acct_test','prod_video',$5,'ios',1,'USA',null)",[buyer.id,session,video,request,routeId]);
  // Failed qualification cannot leave behind a web order or partial admission.
  await assert.rejects(native(randomUUID()),/native_route_unqualified/);
  assert.equal(await one('select count(*)::int from private.stripe_paid_video_orders where request_id=$1',[request]),0);
  await db.exec('begin');await web();await assert.rejects(native(),/native_order_transport_or_identity_mismatch/);await db.exec('rollback');
  // Exercise actual API grants, not only owner claims.
  await db.exec('set role service_role');
  const result=await native();assert.equal(result.order.checkout_platform,'ios');assert.equal(result.order.native_admission_id,result.admission.admissionId);
  assert.equal((await native()).order.id,result.order.id);
  assert.equal((await web()).checkout_platform,'ios','web retry cannot change native order transport');
  await assert.rejects(native(route,randomUUID()),/native_order_authority_required|native_order_transport_or_identity_mismatch/);
  await assert.rejects(()=>one("select public.admit_stripe_video_native_order($1,$2,$3,$4,'ios',1,'USA',null)",[result.order.id,buyer.id,buyer.session,route]),/permission denied/);
  await db.exec('reset role');
  assert.equal(await one('select count(*)::int from private.stripe_paid_video_orders where request_id=$1',[request]),1);
  assert.equal(await one('select checkout_platform from private.stripe_paid_video_orders where id=$1',[result.order.id]),'ios');
  assert.equal(await one("select has_function_privilege('authenticated','public.prepare_stripe_video_native_order(uuid,uuid,uuid,uuid,text,text,uuid,text,integer,text,text)','execute')"),false);
 }finally{await db.close();}
});
