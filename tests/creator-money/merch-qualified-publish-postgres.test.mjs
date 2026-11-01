import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runMerchPublicationRaces} from '../../scripts/lib/merch-publication-races.mjs';
import {withQualifiedAuctionFixture} from '../helpers/auction-checkout-fixture.mjs';
test('creator first live publication requires exact reviewed revision, current mode-bound authority, and preserves test history',{timeout:240000},async()=>withQualifiedAuctionFixture({},async({db,rpc,actors,rows})=>{
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const id=randomUUID();
 let p=await rpc('creator',`public.save_creator_merch_product_with_tracking('${id}','First listing','Physical item',null,1000,10,'draft',null,'tracked')`);
 const review=()=>rpc('creator',`public.review_creator_merch_live_publication('${p.id}','${p.updatedAt}')`);
 const confirm=r=>rpc('creator',`public.confirm_creator_merch_live_publication('${r.reviewId}')`);
 assert.equal((await review()).ready,false);
 await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);update public.platform_money_kill_switches set state='on' where key='merch_enabled';
 insert into public.provider_readiness_status(provider,capability,status,environment,is_live_money_enabled,proof_source,proof_summary,last_checked_at) values('stripe','platform_commerce','active','production',true,'synthetic','synthetic',now()) on conflict(provider,capability,environment) do update set status='active',is_live_money_enabled=true,proof_source='synthetic',proof_summary='synthetic',last_checked_at=now();
 insert into private.merch_live_checkout_qualifications values('acct_platform',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '1 hour',null);`);
 await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
 full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
 registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
 values('physical_merch',$1,'acct_platform','production','US_all_destinations','all_supported_platforms',true,'SYNTHETIC','SYNTHETIC','automatic','self','txcd_99999999','inclusive','SYNTHETIC','SYNTHETIC','SYNTHETIC',now(),now()+interval '1 hour',now()+interval '1 hour',true)`,[id]);
 let r=await review();assert.equal(r.ready,true,JSON.stringify(r));
 // A->B->A invalidates old confirmation even if visible price is restored.
 await db.query('update public.merch_products set price_minor=1100 where id=$1;',[id]);await db.query('update public.merch_products set price_minor=1000 where id=$1',[id]);
 await assert.rejects(confirm(r),/review_changed/);
 p=await one('select public.merch_product_projection_internal(p) from public.merch_products p where id=$1',[id]);r=await review();
 await db.exec("update private.merch_live_checkout_qualifications set revoked_at=now();update private.merch_live_checkout_qualifications set revoked_at=null");
 await assert.rejects(confirm(r),/eligibility_changed/);
 r=await review();
 await db.query('update public.wave1_creator_eligibility set payout_eligible=false where creator_user_id=$1',[actors.creator.user_id]);
 await assert.rejects(confirm(r),/creator_eligibility_required/);
 await db.query('update public.wave1_creator_eligibility set payout_eligible=true where creator_user_id=$1',[actors.creator.user_id]);
 await assert.rejects(confirm(r),/eligibility_changed/,'restored eligibility still needs a new review');
 r=await review();p=await confirm(r);assert.equal(p.environment,'production');assert.equal(p.publicationStatus,'published');
 assert.equal((await confirm(r)).id,id,'same receipt retry is nonmutating acknowledgement');
 assert.equal(await one('select count(*)::int from private.merch_publication_receipts'),1);
 const testId=randomUUID();let old=await rpc('creator',`public.save_creator_merch_product_with_tracking('${testId}','Test history','Physical item',null,2000,5,'published',null,'untracked')`);
 await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,payment_status,amount_subtotal_minor,amount_total_minor,currency)
 values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','paid',2000,2000,'usd')`,[randomUUID(),testId,actors.buyer1.user_id,actors.creator.user_id]);
 const storefront=await rpc('buyer2',`public.list_creator_merch_products('${actors.creator.user_id}',false,null,20)`);
 assert.ok(storefront.products.some(x=>x.id===id));assert.equal(storefront.products.some(x=>x.id===testId),false,'ordinary buyer never discovers sandbox listing');
 const preview=await rpc('creator',`public.list_creator_merch_products('${actors.creator.user_id}',false,null,20)`);assert.ok(preview.products.some(x=>x.id===testId));
 const ordersBefore=await rows('select to_jsonb(o) value from public.merch_orders o');
 const blocked=await rpc('creator',`public.review_creator_merch_live_publication('${testId}','${old.updatedAt}')`);assert.equal(blocked.copyRequired,true);
 const copied=await rpc('creator',`public.copy_creator_merch_live_draft('${testId}','${old.updatedAt}')`);
 const retryCopy=await rpc('creator',`public.copy_creator_merch_live_draft('${testId}','${old.updatedAt}')`);assert.equal(retryCopy.id,copied.id,'lost copy response resumes the same inventory identity');
 assert.equal(await one('select count(*)::int from private.merch_live_draft_copies'),1);
 assert.notEqual(copied.id,testId);assert.equal(copied.environment,'sandbox');assert.equal(copied.publicationStatus,'draft');assert.equal(copied.photoAssetId,null);
 assert.deepEqual(await rows('select to_jsonb(o) value from public.merch_orders o'),ordersBefore);
 assert.equal(await one('select publication_status from public.merch_products where id=$1',[testId]),'published');
 assert.equal(await one('select count(*)::int from private.commerce_tax_qualifications where product_id=$1',[copied.id]),0);
 // Execute native schedule SQL sequentially solely to validate the fixture;
 // real blocking/backend evidence remains the hosted native runner's job.
 const nativeQuery=async sql=>{const results=await db.exec(sql);const row=results.at(-1)?.rows?.[0];return row?String(Object.values(row)[0]):'';};
 const nativeAuth=()=>`set local request.jwt.claims='${JSON.stringify({role:'authenticated',sub:actors.creator.user_id,session_id:actors.creator.session_id})}';set local role authenticated;`;
 await runMerchPublicationRaces({query:nativeQuery,actors:{creator:{id:actors.creator.user_id,session:actors.creator.session_id}},lit:v=>`'${String(v).replaceAll("'","''")}'`,auth:nativeAuth,
 race:async(_name,first,second,expected)=>{await nativeQuery(`begin;${first}commit;`);await assert.rejects(nativeQuery(`begin;${second}commit;`),expected.error);await db.exec('rollback');}});
 for(const role of ['anon','service_role'])assert.equal(await one("select has_function_privilege($1,'public.confirm_creator_merch_live_publication(uuid)','execute')",[role]),false);
}));
