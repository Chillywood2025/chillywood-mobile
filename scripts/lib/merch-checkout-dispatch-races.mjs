// Used only by the guarded disposable local PostgreSQL concurrency runner.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runMerchCheckoutDispatchRaces({query,rpc,race,auth,actors,lit,json,sequentialReplay=false}) {
 const buyer=actors.buyer1.id,session=actors.buyer1.session,creator=actors.creator.id;
 // Ordinary buyers have no beta/tester membership or Premium entitlement.
 await query(`update public.platform_money_kill_switches set state='sandbox_only' where key='merch_enabled';
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

 // Creator authority and free-buyer account/session revocations must serialize
 // with the actual dispatch, not just with an earlier preflight read. Native
 // race() proves distinct backends and pg_blocking_pids before the commit.
 const mutations=[
  ['creator Premium revocation',`update public.user_entitlements set revoked_at=clock_timestamp() where user_id=${lit(creator)} and entitlement_key='premium'`,
   `update public.user_entitlements set revoked_at=null where user_id=${lit(creator)} and entitlement_key='premium'`],
  ['creator Premium grant refund',`update public.access_grants set refunded_at=clock_timestamp() where user_id=${lit(creator)} and grant_type='premium'`,
   `update public.access_grants set refunded_at=null where user_id=${lit(creator)} and grant_type='premium'`],
  ['free buyer ban',`update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=${lit(buyer)}`,
   `update auth.users set banned_until=null where id=${lit(buyer)}`],
  ['free buyer session expiry',`update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=${lit(session)}`,
   `update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id=${lit(session)}`],
 ];
 for(const [label,change,restore] of mutations) {
  const fixture=await make(),reserved=await rpc(fixture.reserve);await fixture.bind(reserved.id);
  try {
   // PGlite executes sequentially and starts with the actor already revoked.
   // It proves rejection, never fabricates the native after-wait false result.
   const options=sequentialReplay&&label.startsWith('free buyer')?{error:/merch_current_session_required/}:{};
   const result=await race(`${label} before dispatch`,`${change};select '{}'::jsonb;`,
    auth('buyer1','service_role')+`select ${fixture.transition('dispatch')};`,options);
   if(!options.error)assert.equal(result.second.authorized,false,label);
   assert.equal(await query(`select state from private.merch_checkout_dispatch where order_id=${lit(reserved.id)}`),'prepared');
   assert.equal(await fixture.stock(),'1','denial retains unresolved inventory until owned abort');
  }finally{await query(`${restore};`);}
  const aborted=await rpc(fixture.transition('abort'));assert.equal(aborted.aborted,true);assert.equal(await fixture.stock(),'0');
 }
 // Passive expiry is not a revocation writer: the waiter already passed its
 // first authority check when it blocks on the product. Recheck after waiting.
 const premiumRenewal=async duration=>{
  const result=JSON.parse(await query(`select public.process_revenuecat_premium_event_atomic(
   'revenuecat_google_play',${lit('passive-renewal-'+randomUUID())},'RENEWAL',${lit(creator)}::uuid,
   p.provider_product_id,p.provider_base_plan_id,'sandbox','active',clock_timestamp()-interval '1 minute',
   clock_timestamp()+interval '${duration}',clock_timestamp(),999,'usd',repeat('d',64),
   'NORMAL','google_play','android',null,p.id,${lit('live-authority-original-'+creator)})
   from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
    and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1;`));
  assert.equal(result.status,'processed','finite expiry comes from the canonical Premium processor');
 };
 for(const subject of ['free buyer session','creator Premium']) {
  const fixture=await make(),reserved=await rpc(fixture.reserve);await fixture.bind(reserved.id);
  if(subject==='free buyer session')await query(`update auth.sessions set not_after=clock_timestamp()+interval '2 seconds' where id=${lit(session)};`);
  else await premiumRenewal('2 seconds');
  try {
   const stillCurrent=subject==='free buyer session'
    ?`exists(select 1 from auth.sessions where id=${lit(session)} and not_after>clock_timestamp())`
    :`exists(select 1 from public.user_entitlements where user_id=${lit(creator)} and entitlement_key='premium' and expires_at>clock_timestamp())`;
   const options={afterBlocked:`do $expiry_barrier$ begin if not (${stillCurrent}) then raise exception 'passive_expiry_barrier_was_late';end if;end $expiry_barrier$;select pg_sleep(2.2);select '{}'::jsonb;`,
    ...(sequentialReplay&&subject==='free buyer session'?{error:/merch_current_session_required/}:{})};
   const result=await race(`passive ${subject} expiry while dispatch waits on product`,
    `select id from public.merch_products where id=${lit(fixture.product)} for update;select '{}'::jsonb;`,
    auth('buyer1','service_role')+`select ${fixture.transition('dispatch')};`,options);
   // The sequential adapter starts after expiry and can only prove its actual
   // early rejection; it never fabricates an after-wait authorized:false result.
   if(!options.error)assert.equal(result.second.authorized,false);
   assert.equal(await query(`select state from private.merch_checkout_dispatch where order_id=${lit(reserved.id)}`),'prepared');
   assert.equal(await fixture.stock(),'1');
  }finally{
   if(subject==='free buyer session')await query(`update auth.sessions set not_after=clock_timestamp()+interval '1 day' where id=${lit(session)};`);
   else await premiumRenewal('1 day');
  }
  assert.equal((await rpc(fixture.transition('abort'))).aborted,true);assert.equal(await fixture.stock(),'0');
 }
}
