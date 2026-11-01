// Local guarded clone only. Actual independently blocked backends are provided
// by the canonical runner; no provider request or real transaction is issued.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runMerchLiveCheckoutRaces({query,race,auth,actors,lit,json}){
 const buyer=actors.buyer2.id,session=actors.buyer2.session,creator=actors.creator.id;
 await query(`set request.jwt.claim.role='service_role';update public.platform_money_kill_switches set state='on' where key in('merch_enabled','live_money_enabled');
 insert into public.provider_readiness_status(provider,capability,status,environment,is_live_money_enabled,proof_source,proof_summary,last_checked_at)
 values('stripe','platform_commerce','active','production',true,'SYNTHETIC clone','SYNTHETIC clone',now())
 on conflict(provider,capability,environment) do update set status='active',is_live_money_enabled=true,proof_source='SYNTHETIC clone',proof_summary='SYNTHETIC clone',last_checked_at=now();
 insert into private.merch_live_checkout_qualifications values('acct_nativerace',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '1 hour',null);`);
 const make=async()=>{
  const product=randomUUID(),order=randomUUID(),attempt=randomUUID();
  await query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,reserved_quantity,shipping_tracking_mode)
   values(${lit(product)},${lit(creator)},'Synthetic native','Synthetic native','stripe_physical_goods','active','manual',1000,'usd','production',true,false,'published',10,1,'tracked');
   insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,quantity,checkout_attempt_id)
   values(${lit(order)},${lit(product)},${lit(buyer)},${lit(creator)},'stripe_physical_goods','production','pending','not_started','pending',1000,1000,'usd',1,${lit(attempt)});
   insert into private.merch_checkout_dispatch(order_id,state) values(${lit(order)},'prepared');
   insert into private.merch_checkout_provider_bindings(order_id,environment,account_id,quote) select id,environment,'acct_nativerace',private.merch_checkout_quote(o) from public.merch_orders o where id=${lit(order)};
   with q as(insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
    values('physical_merch',${lit(product)},'acct_nativerace','production','US_all_destinations','all_supported_platforms',true,'SYNTHETIC','SYNTHETIC','automatic','self','txcd_99999999','inclusive','SYNTHETIC','SYNTHETIC','SYNTHETIC',now(),now()+interval '1 hour',now()+interval '1 hour',true) returning id)
   insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
    select 'physical_merch',${lit(order)},id,${lit(product)},'acct_nativerace','production','US_all_destinations' from q;`);
  const facts={productId:product,quantity:1,variantId:null,trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'};
  return{order,dispatch:auth('buyer2','service_role')+`select public.transition_merch_checkout_dispatch(${lit(buyer)},${lit(session)},${lit(attempt)},'dispatch',${json(facts)});`};
 };
 for(const kind of ['switch','qualification']){
  const stop=kind==='switch'?"update public.platform_money_kill_switches set state='off' where key='live_money_enabled';":"update private.merch_live_checkout_qualifications set revoked_at=clock_timestamp() where account_id='acct_nativerace';";
  const reset=kind==='switch'?"update public.platform_money_kill_switches set state='on' where key='live_money_enabled';":"update private.merch_live_checkout_qualifications set revoked_at=null where account_id='acct_nativerace';";
  const first=await make();await race(`live ${kind} stop before dispatch`,stop+"select '{}'::jsonb;",first.dispatch,{error:/merch_live_checkout_unqualified/});
  assert.equal(await query(`select state from private.merch_checkout_dispatch where order_id=${lit(first.order)}`),'prepared');
  await query("set request.jwt.claim.role='service_role';"+reset);const second=await make();const result=await race(`live dispatch before ${kind} stop`,second.dispatch,stop+"select '{}'::jsonb;");
  assert.equal(result.first.authorized,true);assert.equal(await query(`select state from private.merch_checkout_dispatch where order_id=${lit(second.order)}`),'dispatched');
  await query("set request.jwt.claim.role='service_role';"+reset);
 }
}
