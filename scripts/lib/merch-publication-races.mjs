// Disposable guarded native PostgreSQL only. No listings/provider operations.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runMerchPublicationRaces({query,race,auth,actors,lit}) {
 const creator=actors.creator;
 const make=async()=>{
  const id=randomUUID(),review=randomUUID();
  await query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values(${lit(id)},${lit(creator.id)},'Publish race','Publish race','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'draft',10,'tracked');
   insert into private.merch_publication_reviews(id,product_id,creator_id,session_id,revision,authority_epoch,authority)
   select ${lit(review)},id,creator_id,${lit(creator.session)},publication_revision,0,'{}'::jsonb from public.merch_products where id=${lit(id)};`);
  return {id,review,updated:await query(`select updated_at::text from public.merch_products where id=${lit(id)}`)};
 };
 const first=await make();
 await race('product edit before live review rejects stale displayed price',
  `update public.merch_products set price_minor=1100,updated_at=clock_timestamp() where id=${lit(first.id)};select '{}'::jsonb;`,
  auth('creator')+`select public.review_creator_merch_live_publication(${lit(first.id)},${lit(first.updated)});`,{error:/merch_product_changed_reload/});
 const second=await make();
 await race('product ABA before live confirmation invalidates immutable review',
  `update public.merch_products set price_minor=1100 where id=${lit(second.id)};update public.merch_products set price_minor=1000 where id=${lit(second.id)};select '{}'::jsonb;`,
  auth('creator')+`select public.confirm_creator_merch_live_publication(${lit(second.review)});`,{error:/merch_publish_review_changed/});
 const third=await make();
 await race('creator eligibility revocation blocks live confirmation',
  `update public.wave1_creator_eligibility set payout_eligible=false where creator_user_id=${lit(creator.id)};select '{}'::jsonb;`,
  auth('creator')+`select public.confirm_creator_merch_live_publication(${lit(third.review)});`,{error:/creator_eligibility_required/});
 await query(`update public.wave1_creator_eligibility set payout_eligible=true where creator_user_id=${lit(creator.id)};`);
 assert.equal(await query(`select count(*) from private.merch_publication_receipts where product_id in(${lit(first.id)},${lit(second.id)},${lit(third.id)})`),'0');
}
