import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedCommerceCreator,acceptCommerceCreatorTerms,withCommerceActor} from '../helpers/automatic-commerce-fixture.mjs';
import {syntheticVideoMarketObservation} from '../helpers/stripe-video-market-fixture.mjs';

test('explicit web fixtures are bounded, default-off, isolated and preserve refund history',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  const buyer={id:randomUUID(),session:randomUUID()},creator=randomUUID();let video=randomUUID();await seedCommerceBuyer(db,buyer);
  const order=async(platform='web',amount=1000)=>one(`insert into private.stripe_paid_video_orders(buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,expires_at,checkout_platform)
   values($1,$2,$3,$4,$5,1,$6,'usd','acct_test','prod_test',$7,'prepared',clock_timestamp()+interval '1 hour',$8) returning id`,[buyer.id,buyer.session,video,creator,randomUUID(),amount,randomUUID(),platform]);
  const bind=id=>one("select public.bind_stripe_video_tax_checkout_policy('paid_video',$1,'prod_test','acct_test','test','worldwide')",[id]);
  const policy=enabled=>one(`insert into private.stripe_video_web_test_policies(account_id,product_id,product_tax_code,buyer_id,creator_id,video_id,disclosure,max_amount_minor,max_orders,expires_at,enabled)
   values('acct_test','prod_test','txcd_100',$1,$2,$3,'Synthetic test only; no tax compliance or exemption qualification',1000,1,clock_timestamp()+interval '1 hour',$4) returning id`,[buyer.id,creator,video,enabled]);
  const first=await order();assert.equal((await bind(first)).ready,false);
  await policy(false);assert.equal((await bind(first)).reason,'synthetic_test_policy_unavailable');
  const p=await policy(true);
  for(const platform of ['ios','android']){
   await assert.rejects(order(platform),/stripe_video_transport_binding/);
   assert.equal(await one('select private.stripe_video_native_checkout_candidate($1)',[platform]),false);
  }
  assert.equal((await bind(await order('web',1001))).ready,false);
  const bound=await bind(first);assert.equal(bound.collectionMode,'synthetic_test_no_collection');assert.equal(bound.policyId,p);
  assert.equal((await bind(first)).policyId,p,'idempotent binding does not spend another slot');
  assert.equal((await bind(await order())).reason,'synthetic_test_budget_exhausted');
  assert.equal(await one('select count(*)::int from private.commerce_tax_qualifications'),0);
  assert.equal(await one('select count(*)::int from private.commerce_tax_checkout_bindings'),0);
  await assert.rejects(db.query('update private.stripe_video_web_test_policies set max_orders=2 where id=$1',[p]),/test_policy_immutable/);
  await db.query('update private.stripe_video_web_test_policies set revoked_at=clock_timestamp() where id=$1',[p]);
  assert.equal((await bind(first)).ready,false);
  await db.query("update private.stripe_paid_video_orders set status='refunded',charge_id='ch_test',tax_policy_id=$2 where id=$1",[first,p]);
  assert.equal((await one('select public.get_stripe_video_cost_context($1)',[first])).taxCollectionMode,'synthetic_test_no_collection');
  video=randomUUID();
  await db.query(`insert into private.stripe_video_web_test_policies(account_id,product_id,product_tax_code,buyer_id,creator_id,video_id,disclosure,max_amount_minor,max_orders,created_at,expires_at,enabled)
   values('acct_test','prod_test','txcd_100',$1,$2,$3,'Synthetic test only; no tax compliance or exemption qualification',1000,1,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',true)`,[buyer.id,creator,video]);
  assert.equal((await bind(await order())).reason,'synthetic_test_policy_unavailable','expired fixture never permits a new order');
  // Exercise the actual guarded dispatch chain and then fresh order reads,
  // rather than only directly calling the tax binder with an inserted order.
  video=randomUUID();const creatorActor={id:creator,session:randomUUID()};
  await seedCommerceCreator(db,creatorActor);await acceptCommerceCreatorTerms(db,creatorActor);
  await withCommerceActor(db,creatorActor,()=>one("select public.declare_creator_money_eligibility(true,'US','CA')"));
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1,$2,'SYNTHETIC fixture dispatch','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  const version=await one('select id from private.native_production_video_versions where source_id=$1 order by revision desc limit 1',[video]);
  await db.query(`insert into private.native_production_source_proofs(version_id,origin_provider,origin_bucket,origin_object,origin_generation,asset_sha256,byte_length,scan_receipt_sha256,adapter_version,evidence_sha256,verified_at,expires_at)
   values($1,'cloudflare_r2','chillywood-media-origin',$2,'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',repeat('a',64),1024,repeat('b',64),'synthetic-only',repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour')`,[version,`${creator}/${video}/source.mp4`]);
  await withCommerceActor(db,creatorActor,()=>one("select public.set_my_stripe_sandbox_video_price($1,1000,'usd',true)",[video]));
  const p2=await policy(true);
  const prepared=await one('select public.prepare_stripe_sandbox_video_order($1,$2,$3,$4,$5,$6)',[buyer.id,buyer.session,video,randomUUID(),'acct_test','prod_test']);
  assert.equal((await bind(prepared.id)).policyId,p2);
  const dispatched=await one('select public.dispatch_stripe_sandbox_video_order($1,$2,$3,$4)',[prepared.id,buyer.id,buyer.session,await syntheticVideoMarketObservation(db,prepared.id)]);
  assert.equal(dispatched.tax.collectionMode,'synthetic_test_no_collection');
  const read=await one('select public.read_stripe_sandbox_video_order($1,$2,$3)',[prepared.id,buyer.id,buyer.session]);
  assert.equal(read.status,'dispatched');assert.equal(read.tax_policy_id,p2);assert.equal(read.tax_evidence_kind,'synthetic_test_no_collection');
  for(const table of ['stripe_video_web_test_policies','stripe_video_web_test_bindings']){
   assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass",['private.'+table]),true);
   for(const role of ['anon','authenticated','service_role'])assert.equal(await one("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",[role,'private.'+table]),false);
  }
 }finally{await db.close();}
});
