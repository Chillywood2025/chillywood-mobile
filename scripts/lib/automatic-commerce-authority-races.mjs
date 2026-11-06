// Genuine native commit order schedules, run only inside the guarded clone.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {commerceSeedAdapter,seedQualifiedCommerceCreator,seedCommerceBuyer} from '../../tests/helpers/automatic-commerce-fixture.mjs';

export async function runAutomaticCommerceAuthorityRaces({query,race,lit}) {
 const db=commerceSeedAdapter(query);
 for(const kind of ['seller ban','new covering quarantine','new hold row'])for(const changeFirst of [true,false]) {
  await query("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  const creator=await seedQualifiedCommerceCreator(db),buyer=await seedCommerceBuyer(db);
  const product=randomUUID(),attempt=randomUUID();
  const auth=`set local role service_role;set local request.jwt.claims=${lit(JSON.stringify({role:'service_role',sub:buyer.id,session_id:buyer.session}))};`;
  await query(`update public.platform_money_kill_switches set state='sandbox_only' where key='merch_enabled';
   insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,
    environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values(${lit(product)},${lit(creator.id)},'Synthetic authority race','Synthetic authority race','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',5,'tracked');`);
  const reservation=JSON.parse(await query(`begin;${auth}select public.reserve_merch_checkout_dispatch(${lit(buyer.id)},${lit(buyer.session)},${lit(product)},1,${lit(attempt)},null,'tracked',1000,'usd');commit;`));
  await query(`with q as(insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope)
    values('physical_merch',${lit(product)},'acct_synthetic','sandbox','US_all_destinations','all_supported_platforms') returning id)
    insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
    select 'physical_merch',${lit(reservation.id)},id,${lit(product)},'acct_synthetic','sandbox','US_all_destinations' from q;`);
  const request={productId:product,quantity:1,variantId:null,trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'};
  const dispatch=auth+`select public.transition_merch_checkout_dispatch(${lit(buyer.id)},${lit(buyer.session)},${lit(attempt)},'dispatch',${lit(JSON.stringify(request))}::jsonb);`;
  let change;
  if(kind==='seller ban')change=`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${lit(creator.id)};`;
  else if(kind==='new covering quarantine')change=`insert into public.revenuecat_terminal_authority_quarantines(provider_scope,environment_scope,user_id,event_type,raw_payload_hash,reason)
    values('revenuecat_google_play','sandbox',${lit(creator.id)},'REFUND',${lit(createHash('sha256').update(randomUUID()).digest('hex'))},'synthetic_native_fixture');`;
  else {
   const prior=JSON.parse(await query(`select to_jsonb(e) from public.creator_payout_eligibility_records e where creator_user_id=${lit(creator.id)}`));
   // Remove BEFORE either backend starts: no existing eligibility row can
   // accidentally supply the blocking edge attributed to the insertion fence.
   await query(`delete from public.creator_payout_eligibility_records where creator_user_id=${lit(creator.id)};`);
   change=`insert into public.creator_payout_eligibility_records select (jsonb_populate_record(null::public.creator_payout_eligibility_records,
     ${lit(JSON.stringify({...prior,id:randomUUID(),fraud_hold_active:true,eligibility_status:'on_hold'}))}::jsonb)).*;`;
  }
  const changed=change+"select '{}'::jsonb;";
  const result=await race(`${kind}: ${changeFirst?'mutation before dispatch':'dispatch before mutation'}`,changeFirst?changed:dispatch,changeFirst?dispatch:changed);
  const allowed=(changeFirst?result.second:result.first).authorized;
  // An absent eligibility row itself fails strict provider readiness. Reverse
  // insertion order proves fencing and denial, never invents live authority.
  assert.equal(allowed,!changeFirst&&kind!=='new hold row');
  assert.equal(await query(`select state from private.merch_checkout_dispatch where order_id=${lit(reservation.id)}`),allowed?'dispatched':'prepared');
 }
}
