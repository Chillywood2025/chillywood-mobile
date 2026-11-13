import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer} from '../helpers/automatic-commerce-fixture.mjs';

test('explicit web fixtures are bounded, default-off, isolated and preserve refund history',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  const buyer={id:randomUUID(),session:randomUUID()},creator=randomUUID();let video=randomUUID();await seedCommerceBuyer(db,buyer);
  const order=async(platform='web',amount=1000)=>one(`insert into private.stripe_paid_video_orders(buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,expires_at,checkout_platform)
   values($1,$2,$3,$4,$5,1,$6,'usd','acct_test','prod_test',$7,'prepared',clock_timestamp()+interval '1 hour',$8) returning id`,[buyer.id,buyer.session,video,creator,randomUUID(),amount,randomUUID(),platform]);
  const bind=id=>one("select public.bind_stripe_video_tax_checkout_policy('paid_video',$1,'prod_test','acct_test','test','worldwide')",[id]);
  const policy=enabled=>one(`insert into private.stripe_video_web_test_policies(account_id,product_id,buyer_id,creator_id,video_id,disclosure,max_amount_minor,max_orders,expires_at,enabled)
   values('acct_test','prod_test',$1,$2,$3,'Synthetic test only; no tax compliance or exemption qualification',1000,1,clock_timestamp()+interval '1 hour',$4) returning id`,[buyer.id,creator,video,enabled]);
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
  await db.query(`insert into private.stripe_video_web_test_policies(account_id,product_id,buyer_id,creator_id,video_id,disclosure,max_amount_minor,max_orders,created_at,expires_at,enabled)
   values('acct_test','prod_test',$1,$2,$3,'Synthetic test only; no tax compliance or exemption qualification',1000,1,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',true)`,[buyer.id,creator,video]);
  assert.equal((await bind(await order())).reason,'synthetic_test_policy_unavailable','expired fixture never permits a new order');
  for(const table of ['stripe_video_web_test_policies','stripe_video_web_test_bindings']){
   assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass",['private.'+table]),true);
   for(const role of ['anon','authenticated','service_role'])assert.equal(await one("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",[role,'private.'+table]),false);
  }
 }finally{await db.close();}
});
