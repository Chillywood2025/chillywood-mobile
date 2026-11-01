// Synthetic disposable native database only. Never an actual tax decision.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runMerchTaxCategoryRaces({query,race,auth,actors,lit}) {
 const creator=actors.creator;
 await query(`insert into public.platform_role_memberships(user_id,role,status) values(${lit(creator.id)},'owner','active') on conflict do nothing;
  insert into private.merch_tax_code_catalog values('txcd_12345678','SYNTHETIC taxonomy','SYNTHETIC only',true,clock_timestamp()) on conflict(code) do update set observed_at=excluded.observed_at;`);
 const make=async()=>{
  const id=randomUUID(),category=randomUUID(),key=`synthetic_${randomUUID().replaceAll('-','')}`;
  await query(`insert into public.merch_products(id,creator_id,display_name,title,description,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values(${lit(id)},${lit(creator.id)},'Tax race','Tax race','Original category-sensitive description','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'draft',10,'tracked');
   insert into private.merch_tax_categories(id,category_key,revision,label,scope_description,tax_code,tax_behavior,professional_basis_reference,coverage_evidence_reference,reviewed_by,expires_at)
   values(${lit(category)},${lit(key)},1,'SYNTHETIC category','SYNTHETIC category applicability','txcd_12345678','inclusive','SYNTHETIC basis','SYNTHETIC coverage',${lit(creator.id)},clock_timestamp()+interval '1 hour');`);
  return {id,category,key,updated:await query(`select updated_at::text from public.merch_products where id=${lit(id)}`)};
 };
 const a=await make();
 await race('category revoke before selection blocks derived authority',
  auth('creator')+`select public.revoke_owner_merch_tax_category(${lit(a.category)});`,
  auth('creator')+`select public.select_creator_merch_tax_category(${lit(a.id)},${lit(a.category)},${lit(a.updated)},'');`,{error:/tax_category_review_expired/});
 const b=await make();
 await race('category revision supersedes selector before derivation',
  auth('creator')+`select public.review_owner_merch_tax_category(${lit(b.key)},'SYNTHETIC revision','SYNTHETIC new applicability','txcd_12345678','inclusive','SYNTHETIC basis','SYNTHETIC coverage',clock_timestamp()+interval '1 hour',1);`,
  auth('creator')+`select public.select_creator_merch_tax_category(${lit(b.id)},${lit(b.category)},${lit(b.updated)},'');`,{error:/tax_category_review_expired/});
 const c=await make();
 const request=randomUUID();
 await query(`insert into private.merch_tax_category_requests(id,product_id,creator_id,product_snapshot,note)
  select ${lit(request)},p.id,p.creator_id,private.merch_tax_product_snapshot(p),'SYNTHETIC unknown category' from public.merch_products p where p.id=${lit(c.id)};`);
 await race('source edit before owner review rejects stale category request',
  `update public.merch_products set description='Different material/category' where id=${lit(c.id)};select '{}'::jsonb;`,
  auth('creator')+`select public.resolve_owner_merch_tax_request(${lit(request)},${lit(c.category)},'SYNTHETIC review');`,{error:/tax_review_product_changed/});
 const d=await make();
 await race('selection serializes later category revocation without inventing provider readiness',
  auth('creator')+`select public.select_creator_merch_tax_category(${lit(d.id)},${lit(d.category)},${lit(d.updated)},'');`,
  auth('creator')+`select public.revoke_owner_merch_tax_category(${lit(d.category)});`);
 assert.equal(await query(`select count(*) from private.merch_tax_category_policy_links where product_id in(${[a,b,c,d].map(x=>lit(x.id)).join(',')})`),'0');
 assert.equal(await query(`select revoked_at is not null from private.merch_tax_categories where id=${lit(d.category)}`),'t');
 const e=await make();
 await race('retained brand latch precedes category product row lock',
  `select private.platform_brand_retention_lock();select '{}'::jsonb;`,
  auth('creator')+`select public.select_creator_merch_tax_category(${lit(e.id)},${lit(e.category)},${lit(e.updated)},'');`,
  {afterBlocked:`select id from public.merch_products where id=${lit(e.id)} for update nowait;select '{}'::jsonb;`});
}
