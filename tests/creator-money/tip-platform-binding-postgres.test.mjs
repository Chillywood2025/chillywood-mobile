import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('future test checkout atomically binds platform without relabeling old unknown attempts',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority'])
   await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const buyer=actors.find(x=>x.kind==='buyer1'),creator=actors.find(x=>x.kind==='creator');
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  const request=randomUUID(),tip=randomUUID();
  const quote={tipId:tip,creatorId:creator.user_id,amountCents:300,currency:'usd',privateNote:null,
   providerAccountId:'acct_fixture',capabilityId:'ef000000-0000-4000-8000-000000000001',body:{
    client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,
    'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd',
    'line_items[0][price_data][unit_amount]':300,'payment_intent_data[transfer_data][destination]':'acct_fixture',
    'payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  const bound=(platform='acct_platform',q=quote)=>one('select public.reserve_platform_bound_test_tip_checkout($1,$2,$3,$4,$5)',[buyer.user_id,buyer.session_id,request,q,platform]);
  // A preexisting pending quote could already have an unknown provider POST.
  // Current platform lookup must never manufacture its historical binding.
  await db.exec('begin');
  await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,request,quote]);
  await db.exec('savepoint old');await assert.rejects(bound(),/tip_historical_platform_unbound/);await db.exec('rollback to old');
  assert.equal(await one('select count(*)::int from private.sandbox_tip_checkout_platform_bindings'),0);
  await db.exec('rollback');
  const first=await bound();assert.equal(first.platformBound,true);assert.equal(first.platformAccountId,'acct_platform');
  assert.equal(first.amountCents,300);assert.deepEqual((await bound()).body,first.body);
  assert.equal(await one('select count(*)::int from private.sandbox_tip_checkout_platform_bindings'),1);
  assert.equal(await one("select request_body_sha256=encode(extensions.digest($1::jsonb::text,'sha256'),'hex') from private.sandbox_tip_checkout_platform_bindings",[first.body]),true);
  await assert.rejects(bound('acct_other'),/tip_platform_binding_conflict/);
  await assert.rejects(bound(null),/tip_platform_binding_invalid/);
  await assert.rejects(bound('acct_platform',{...quote,amountCents:301}),/tip_checkout_request_conflict/);
  await assert.rejects(db.exec("update private.sandbox_tip_checkout_platform_bindings set platform_account_id='acct_other'"),/tip_platform_binding_immutable/);
  await assert.rejects(db.exec('delete from private.sandbox_tip_checkout_platform_bindings'),/tip_platform_binding_immutable/);
  await db.exec('begin');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[buyer.session_id]);
  await db.exec('savepoint retired');await assert.rejects(bound(),/tip_buyer_authority_required/);await db.exec('rollback');
  assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid='private.sandbox_tip_checkout_platform_bindings'::regclass"),true);
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal(await one("select has_table_privilege($1,'private.sandbox_tip_checkout_platform_bindings','INSERT')",[role]),false);
   assert.equal(await one("select has_table_privilege($1,'private.sandbox_tip_checkout_platform_bindings','SELECT')",[role]),false);
   assert.equal(await one("select has_function_privilege($1,'public.reserve_platform_bound_test_tip_checkout(uuid,uuid,uuid,jsonb,text)','EXECUTE')",[role]),role==='service_role');
  }
 } finally {await db.close();}
});
