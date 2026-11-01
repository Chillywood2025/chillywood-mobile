// Used only by the guarded disposable local PostgreSQL concurrency runner.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runMerchCheckoutDispatchRaces({query,rpc,race,auth,actors,lit,json}) {
 const buyer=actors.buyer1.id,session=actors.buyer1.session,creator=actors.creator.id;
 // These actors are fresh in the disposable clone. Do not infer an
 // unconditional user_id conflict target from the partial beta subject index.
 await query(`insert into public.beta_access_memberships(user_id,access_status) values(${lit(buyer)},'active');
  insert into public.user_profiles(user_id,username,display_name) values(${lit(creator)},'dispatch_race_creator','Creator'),(${lit(buyer)},'dispatch_race_buyer','Buyer') on conflict(user_id) do nothing;`);
 const make=async()=>{
  const product=randomUUID(),attempt=randomUUID();
  await query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,
   environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values(${lit(product)},${lit(creator)},'Dispatch race','Dispatch race','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'tracked');`);
  const facts={productId:product,quantity:1,variantId:null,trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'};
  const reserve=`public.reserve_merch_checkout_dispatch(${lit(buyer)},${lit(session)},${lit(product)},1,${lit(attempt)},null,'tracked',1000,'usd')`;
  const transition=action=>`public.transition_merch_checkout_dispatch(${lit(buyer)},${lit(session)},${lit(attempt)},${lit(action)},${json(facts)})`;
  const stock=async()=>await query(`select reserved_quantity from public.merch_products where id=${lit(product)}`);
  const bind=async order=>await query(`with q as (insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope)
   values('physical_merch',${lit(product)},'acct_synthetic','sandbox','US_all_destinations','all_supported_platforms') returning id)
   insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
   select 'physical_merch',${lit(order)},id,${lit(product)},'acct_synthetic','sandbox','US_all_destinations' from q;`);
  return {product,attempt,reserve,transition,stock,bind};
 };
 const first=await make();
 const duplicate=await race('checkout duplicate reservations serialize to one hold',
  auth('buyer1','service_role')+`select ${first.reserve};`,auth('buyer1','service_role')+`select ${first.reserve};`);
 assert.equal(duplicate.first.id,duplicate.second.id);assert.equal(await first.stock(),'1');await first.bind(duplicate.first.id);
 const aborted=await race('proven no-dispatch abort wins before dispatch, exactly one stock release',
  auth('buyer1','service_role')+`select ${first.transition('abort')};`,auth('buyer1','service_role')+`select ${first.transition('dispatch')};`);
 assert.equal(aborted.first.aborted,true);assert.equal(aborted.second.authorized,false);assert.equal(await first.stock(),'0');
 const second=await make(),order=await rpc(second.reserve);await second.bind(order.id);
 const dispatched=await race('durable dispatch wins before cleanup; ambiguous hold retained',
  auth('buyer1','service_role')+`select ${second.transition('dispatch')};`,auth('buyer1','service_role')+`select ${second.transition('abort')};`);
 assert.equal(dispatched.first.authorized,true);assert.equal(dispatched.second.aborted,false);assert.equal(await second.stock(),'1');
 const third=await make();await rpc(third.reserve);
 const cleanups=await race('duplicate no-dispatch cancellation cannot double-restock',
  auth('buyer1','service_role')+`select ${third.transition('abort')};`,auth('buyer1','service_role')+`select ${third.transition('abort')};`);
 assert.equal(cleanups.first.aborted,true);assert.equal(cleanups.second.aborted,true);assert.equal(await third.stock(),'0');
 assert.equal(await query(`select state from private.merch_checkout_dispatch where order_id=${lit(order.id)}`),'dispatched');

 // Start a retained global-latch owner BEFORE the new RPC. Once the new RPC
 // is actually blocked, let that owner enter the real retained product/buyer
 // path. The inverted implementation deadlocks here; the fixed one has not
 // acquired buyer/product locks while waiting for the global latch.
 const cleanup=await make();await rpc(cleanup.reserve);
 const historical=randomUUID(),cs='cs_test_'+historical.replaceAll('-','');
 await query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,
  amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id)
  values(${lit(historical)},${lit(cleanup.product)},${lit(actors.buyer2.id)},${lit(creator)},'stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd',${lit(cs)});`);
 const expiry={event_livemode:false,object_livemode:false,object_id:cs,object_type:'checkout.session',metadata_order_id:historical,
  client_reference_id:historical,mode:'payment',status:'expired',payment_status:'unpaid',amount_minor:1000,currency:'usd'};
 const webhook=`public.process_stripe_merch_webhook_lifecycle(${lit('evt_'+historical.replaceAll('-',''))},'checkout.session.expired',${lit('a'.repeat(64))},${json(expiry)})`;
 const retained=await race('retained webhook global latch precedes new cancellation product lock',
  "select private.platform_brand_retention_lock();select '{}'::jsonb;",
  auth('buyer1','service_role')+`select ${cleanup.transition('abort')};`,
  {afterBlocked:auth('buyer2','service_role')+`select ${webhook};`});
 assert.equal(retained.first.status,'processed');assert.equal(retained.second.aborted,true);assert.equal(await cleanup.stock(),'0');
 const allocation=await make();
 // The retained RPC is intentionally owner-only after cutover. Invoke it as
 // fixture owner with service claims, never restore its revoked API grants.
 const old=allocation.reserve.replace('reserve_merch_checkout_dispatch','reserve_merch_checkout_for_actor_with_tracking');
 const ownerClaims=auth('buyer1','service_role').replace('set local role service_role;','');
 const interop=await race('retained reservation global latch precedes new reservation buyer lock',
  "select private.platform_brand_retention_lock();select '{}'::jsonb;",
  auth('buyer1','service_role')+`select ${allocation.reserve};`,
  {afterBlocked:ownerClaims+`select ${old};`});
 assert.equal(interop.first.id,interop.second.id);assert.equal(await allocation.stock(),'1');
 assert.equal(await query(`select count(*) from private.merch_checkout_dispatch where order_id=${lit(interop.first.id)}`),'0','no historical provenance inference');
}
