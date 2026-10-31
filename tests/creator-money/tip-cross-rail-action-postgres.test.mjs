import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('cross-rail action identity is immutable, session scoped, transaction atomic and allows distinct actions', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority']) await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const buyer=actors.find(x=>x.kind==='buyer1'),other=actors.find(x=>x.kind==='buyer2'),creator=actors.find(x=>x.kind==='creator');
  const action=randomUUID(),ref=randomUUID();
  const args=[buyer.user_id,action,buyer.session_id,creator.user_id,299,'usd','revenuecat_app_store',ref];
  const claim=(a=args)=>one('select private.claim_creator_tip_action($1,$2,$3,$4,$5,$6,$7,$8)',a);
  await claim();await claim();
  for(const change of [{2:other.session_id},{4:300},{6:'stripe_connect'},{7:randomUUID()}]) {
   const a=[...args];for(const [key,value] of Object.entries(change))a[key]=value;
   await assert.rejects(()=>claim(a),/tip_action_(route_conflict|session_authority_required)/);
  }
  const distinct=[...args];distinct[1]=randomUUID();distinct[7]=randomUUID();await claim(distinct);
  assert.equal(await one('select count(*)::integer from private.creator_tip_action_claims'),2);
  await assert.rejects(()=>db.exec('delete from private.creator_tip_action_claims'),/tip_action_claim_immutable/);
  await assert.rejects(()=>db.exec("update private.creator_tip_action_claims set provider='stripe_connect'"),/tip_action_claim_immutable/);
  await db.exec('begin');const rolled=[...args];rolled[1]=randomUUID();await claim(rolled);await db.exec('rollback');
  assert.equal(await one('select count(*)::integer from private.creator_tip_action_claims'),2);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);await assert.rejects(()=>claim(),/permission denied/);
   await assert.rejects(()=>one('select count(*) from private.creator_tip_action_claims'),/permission denied/);await db.exec('reset role');
  }
  assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid='private.creator_tip_action_claims'::regclass"),true);
  // Real Stripe reservation inserts its action binding in the same transaction.
  const tip=randomUUID(),externalAction=randomUUID();
  const quote={tipId:tip,creatorId:creator.user_id,amountCents:299,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',capabilityId:'ef000000-0000-4000-8000-000000000001',body:{client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':299,'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  const reserve=id=>one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,id,quote]);
  await assert.rejects(()=>reserve(action),/tip_action_route_conflict/);
  assert.equal(await one('select count(*)::integer from public.creator_tip_transactions where id=$1',[tip]),0,'conflicting claim rolls back transaction and attempt');
  await reserve(externalAction);await reserve(externalAction);
  assert.equal(await one('select provider from private.creator_tip_action_claims where action_id=$1',[externalAction]),'stripe_connect');
  const switched=[...args];switched[1]=externalAction;await assert.rejects(()=>claim(switched),/tip_action_route_conflict|tip_prior_payment_unresolved/);
 } finally {await db.close();}
});

test('historical Stripe attempt without a shared claim cannot be mistaken for undispatched or abandoned', {timeout:240000}, async()=>{
 const migration='20261030190449_creator_tip_cross_rail_action_claim.sql';
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority']) await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows,buyer=actors.find(x=>x.kind==='buyer1'),creator=actors.find(x=>x.kind==='creator');
  const action=randomUUID(),tip=randomUUID();
  const quote={tipId:tip,creatorId:creator.user_id,amountCents:299,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',capabilityId:'ef000000-0000-4000-8000-000000000001',body:{client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':299,'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,action,quote]);
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
  assert.equal(await one('select count(*)::integer from private.creator_tip_action_claims'),0);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:buyer.user_id,session_id:buyer.session_id,role:'authenticated'})]);await db.exec('set role authenticated');
  const outcome=await one('select public.resolve_creator_tip_payment_action($1,true)',[action]);
  assert.equal(outcome.dispatched,true);assert.equal(outcome.terminal,false);assert.equal(outcome.abandoned,false);assert.equal(outcome.providerReferenceId,tip);
  await db.exec('reset role');assert.equal(await one('select count(*)::integer from private.creator_tip_abandoned_actions'),0);
 } finally {await db.close();}
});
