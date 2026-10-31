import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('server lowest qualified tip selection revalidates at native dispatch and tombstones undispatched actions', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority']) await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const buyer=actors.find(x=>x.kind==='buyer1'),creator=actors.find(x=>x.kind==='creator');
  const as=async(role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:buyer.user_id,session_id:buyer.session_id,role}),JSON.stringify({'x-chillywood-platform':'ios'})]);await db.exec(`set role ${role}`);};
  const select=action=>one("select public.select_creator_tip_payment_route($1,$2,299,'ios')",[action,creator.user_id]);
  await as();await assert.rejects(()=>select(randomUUID()),/tip_complete_qualified_fees_required/);
  const snapshot=await one("select public.get_creator_tip_route_costs($1,299,'ios')",[creator.user_id]);
  assert.ok(snapshot.routes.some(r=>r.provider==='app_store'));
  const evidence=route=>({buyer_id:buyer.user_id,session_id:buyer.session_id,creator_id:creator.user_id,amount_minor:299,currency:'usd',platform:'ios',environment:'test',provider:route.provider,purchase_binding_id:route.purchaseBindingId,provider_account_id:route.provider==='stripe_connect'?'acct_fixture':'synthetic-apple-account',qualification_evidence:'synthetic test only',fee_evidence:'synthetic exact fee test only',processor_minor:route.provider==='stripe_connect'?45:0,store_minor:route.provider==='app_store'?20:0,platform_minor:0,other_minor:0,buyer_total_minor:299,tax_minor:0,tax_treatment:'not_taxed',fee_base_minor:299,all_unavoidable_fees_included:true,verified_at:new Date().toISOString(),expires_at:new Date(Date.now()+240000).toISOString()});
  await as('service_role');const feeIds=[];for(const route of snapshot.routes) feeIds.push(await one('select public.record_creator_tip_route_fee_evidence($1)',[evidence(route)]));
  // Exercise the real selected external reservation and final pre-network read.
  await db.exec('reset role');await db.exec('begin');
  await as('service_role');
  const nativeRoute=snapshot.routes.find(r=>r.provider==='app_store');
  const higher={...evidence(nativeRoute),store_minor:60};
  const higherId=await one('select public.record_creator_tip_route_fee_evidence($1)',[higher]);
  await as();const externalAction=randomUUID();assert.equal((await select(externalAction)).provider,'stripe_connect');
  const tip=randomUUID();
  const quote={tipId:tip,creatorId:creator.user_id,amountCents:299,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',capabilityId:'ef000000-0000-4000-8000-000000000001',body:{client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':299,'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  await as('service_role');await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,externalAction,quote]);
  const dispatch=()=>one('select public.read_creator_tip_checkout_dispatch_authority($1,$2,$3)',[buyer.user_id,buyer.session_id,externalAction]);
  assert.equal((await dispatch()).allowed,true);
  await one('select public.revoke_creator_tip_route_fee_evidence($1)',[higherId]);
  assert.equal((await dispatch()).allowed,false,'any revoked alternative invalidates final lowest-cost dispatch authority');
  await db.exec('rollback');
  await as();const abandoned=randomUUID();const selection=await select(abandoned);assert.equal(selection.provider,'app_store');assert.equal(selection.dispatchAuthorized,false);
  assert.equal((await one('select public.resolve_creator_tip_payment_action($1,true)',[abandoned])).abandoned,true);
  await assert.rejects(()=>select(abandoned),/tip_action_abandoned/);
  const action=randomUUID();await select(action);
  const intent=await one("select public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip',$1,'{}')",[creator.user_id]);
  await assert.rejects(()=>one('select public.begin_creator_money_checkout($1,$2)',[intent.id,abandoned]),/tip_action_abandoned/);
  // A selected action with no dispatch can be abandoned even after intent issuance.
  const another=randomUUID();await select(another);
  await one('select public.resolve_creator_tip_payment_action($1,true)',[another]);
  // Revoke one alternative: incomplete fee evidence must block even the selected cheapest route.
  await as('service_role');await one('select public.revoke_creator_tip_route_fee_evidence($1)',[feeIds[0]]);
  await as();await assert.rejects(()=>one('select public.begin_creator_money_checkout($1,$2)',[intent.id,action]),/tip_complete_qualified_fees_required/);
  await db.exec('reset role');assert.equal(await one('select checkout_attempt_id from public.money_purchase_intents where id=$1',[intent.id]),null,'failed dispatch left no started marker');
  await as('service_role');await one('select public.record_creator_tip_route_fee_evidence($1)',[evidence(snapshot.routes[0])]);
  await as();assert.equal((await one('select public.begin_creator_money_checkout($1,$2)',[intent.id,action])).startAuthorized,true);
  assert.equal((await one('select public.begin_creator_money_checkout($1,$2)',[intent.id,action])).startAuthorized,false,'unknown result never reauthorizes SDK dispatch');
  const status=await one('select public.resolve_creator_tip_payment_action($1,true)',[action]);assert.equal(status.dispatched,true);assert.equal(status.terminal,false);assert.equal(status.abandoned,false);
  await assert.rejects(()=>select(randomUUID()),/tip_prior_payment_unresolved/);
  // Unverified failures/expiry cannot retire a dispatched action. Keep these
  // negative controls isolated so the real provider lifecycle starts pending.
  for (const uncertain of ['failed','expired']) {
   await db.exec('reset role');await db.exec('begin');
   await db.query('update public.money_purchase_intents set status=$1 where id=$2',[uncertain,intent.id]);
   await as();
   assert.equal((await one('select public.resolve_creator_tip_payment_action($1,true)',[action])).terminal,false,uncertain);
   await assert.rejects(()=>select(randomUUID()),/tip_prior_payment_unresolved/);
   await db.exec('rollback');
  }
  // Execute actual verified provider projection, not a synthetic status update.
  await as('service_role');
  const purchasedAt=new Date().toISOString();
  const providerEvent=(eventId,type)=>one(`select public.process_revenuecat_app_store_event_atomic(
   $1,$2,$3,'com.chillywood.tip.tier2','sandbox',now(),null,299,'usd',repeat('b',64),$4,null,$5)`,
   [eventId,type,buyer.user_id,`tip-action-original-${action}`,purchasedAt]);
  const consumed=await providerEvent(`tip-action-paid-${action}`,'INITIAL_PURCHASE');
  assert.equal(consumed.status,'processed',JSON.stringify(consumed));
  assert.equal(await one('select status from public.money_purchase_intents where id=$1',[intent.id]),'consumed');
  const refunded=await providerEvent(`tip-action-refunded-${action}`,'REFUND');
  assert.equal(refunded.status,'processed',JSON.stringify(refunded));
  assert.equal(await one('select status from public.money_purchase_intents where id=$1',[intent.id]),'revoked');
  await as();
  const resolvedRefund=await one('select public.resolve_creator_tip_payment_action($1,true)',[action]);
  assert.equal(resolvedRefund.terminal,true,'verified native refund releases the persisted client action');
  assert.equal(resolvedRefund.dispatched,true);assert.equal(resolvedRefund.abandoned,false);
  assert.equal((await select(randomUUID())).provider,'app_store','a new independent tip can be selected after refund');
 } finally {await db.close();}
});
