import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('declared shipping mode freezes the proper 30-day clock and never falls back from tracking to purchase',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer=randomUUID(),creator=randomUUID();
 const product=async mode=>{const id=randomUUID();await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
 values($1,$2,'Test shirt','Test shirt','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',2,$3)`,[id,creator,mode]);return id;};
 const order=async productId=>{const id=randomUUID();await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_payment_intent_id,created_at,paid_at)
 values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd',$5,clock_timestamp()-interval '60 days',clock_timestamp()-interval '35 days')`,[id,productId,buyer,creator,'pi_'+id.replaceAll('-','')]);return id;};
 const projection=id=>one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[id]);
 try{
  const missing=await product(null);await assert.rejects(order(missing),/tracking_declaration_required/);
  const trackedProduct=await product('tracked'),untrackedProduct=await product('untracked');
  const tracked=await order(trackedProduct),untracked=await order(untrackedProduct);
  assert.equal((await projection(tracked)).returnPolicyVersion,'physical_merch_declared_tracked_30d_v2');
  assert.equal((await projection(untracked)).returnPolicyVersion,'physical_merch_declared_untracked_30d_v2');
  assert.equal((await projection(untracked)).returnWindowStatus,'awaiting_verified_purchase','paid_at and cart-created dates are not successful-purchase proof');
  await db.query("update public.merch_products set shipping_tracking_mode='untracked' where id=$1",[trackedProduct]);
  await db.query("update public.merch_products set shipping_tracking_mode='tracked' where id=$1",[untrackedProduct]);
  assert.equal((await projection(tracked)).shippingTrackingMode,'tracked');assert.equal((await projection(tracked)).returnWindowStatus,'awaiting_verified_delivery');
  assert.equal((await projection(untracked)).shippingTrackingMode,'untracked');
  for(const id of [tracked,untracked]){
   const before=await one('select to_jsonb(o) from public.merch_orders o where id=$1',[id]);
   await assert.rejects(db.query("update public.merch_orders set shipping_tracking_mode=null where id=$1",[id]),/immutable/);
   assert.deepEqual(await one('select to_jsonb(o) from public.merch_orders o where id=$1',[id]),before);
  }
  // Synthetic private proof tests policy consumption only. The separate real
  // signed-callback suite qualifies issuance; root seeding is not provider proof.
  const purchased=new Date(new Date(await one('select clock_timestamp()')).getTime()-31*86400000).toISOString();
  for(const id of [tracked,untracked]){
   const event='evt_'+id.replaceAll('-','');await db.query("insert into public.stripe_merch_events(stripe_event_id,event_type,status,linked_order_id) values($1,'payment_intent.succeeded','processed',$2)",[event,id]);
   await db.query(`insert into private.merch_purchase_time_evidence(order_id,stripe_event_id,stripe_payment_intent_id,succeeded_at,raw_event_hash)
    select id,$2,stripe_payment_intent_id,$3,repeat('a',64) from public.merch_orders where id=$1`,[id,event,purchased]);
  }
  assert.equal((await projection(tracked)).returnWindowStatus,'awaiting_verified_delivery','even known purchase age never replaces tracked delivery');
  assert.equal((await projection(untracked)).returnWindowStatus,'review_required');assert.equal(new Date((await projection(untracked)).returnWindowEndsAt).getTime(),new Date(purchased).getTime()+30*86400000);
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'untracked-clearance','not_applicable','none','none')`,[untracked]);
  assert.equal((await projection(untracked)).returnWindowStatus,'elapsed');assert.equal((await projection(untracked)).financialAuthority,false);
  assert.equal((await projection(untracked)).verifiedDeliveryAt,null);
  await assert.rejects(db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'tracking-unavailable','not_applicable','none','none')`,[tracked]),/invalid/);
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'untracked-nondelivery-return','not_applicable','open','none')`,[untracked]);
  assert.equal((await projection(untracked)).returnWindowStatus,'review_required');assert.ok((await projection(untracked)).returnHoldReasons.includes('merch_return_unresolved'));
  await db.query("update public.merch_orders set payment_status='disputed' where id=$1",[untracked]);assert.ok((await projection(untracked)).returnHoldReasons.includes('merch_dispute_unresolved'));
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
 }finally{await db.close();}
});
