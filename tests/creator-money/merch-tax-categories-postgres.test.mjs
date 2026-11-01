import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withQualifiedAuctionFixture} from '../helpers/auction-checkout-fixture.mjs';
import {runMerchTaxCategoryRaces} from '../../scripts/lib/merch-tax-category-races.mjs';

test('reusable reviewed categories derive exact immutable policies only with independent current provider/creator/liability proof',{timeout:240000},async()=>withQualifiedAuctionFixture({},async({db,rpc,actors,rows})=>{
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const lit=v=>`'${String(v).replaceAll("'","''")}'`;
 const service=async(expr)=>{try{const r=await db.exec(`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select ${expr} result;commit;`);return r.flatMap(x=>x.rows).at(-1).result;}catch(e){await db.exec('rollback');throw e;}};
 const product=randomUUID(),sourceProduct=randomUUID();
 let p=await rpc('creator',`public.save_creator_merch_product_with_tracking('${product}','Synthetic physical item','Classification-specific description',null,1000,10,'draft',null,'tracked')`);
 const select=(category,note='')=>rpc('creator',`public.select_creator_merch_tax_category('${product}',${category?lit(category):'null'},${lit(p.updatedAt)},${lit(note)})`);
 const refresh=async()=>{p=await one(`select public.merch_product_projection_internal(p) from public.merch_products p where id='${product}'`);};
 const review=(revision=0,label='Synthetic category')=>rpc('creator',`public.review_owner_merch_tax_category('synthetic',${lit(label)},'Explicit synthetic category applicability','txcd_12345678','inclusive','SYNTHETIC official classification basis','SYNTHETIC reviewed US destination coverage',now()+interval '1 hour',${revision})`);
 assert.equal(await one('select count(*)::int from private.merch_tax_categories'),0);
 assert.equal(await one('select count(*)::int from private.merch_tax_category_contexts'),0);
 await assert.rejects(review(),/owner_current_session_required/);
 await db.query("insert into public.platform_role_memberships(user_id,role,status) values($1,'owner','active')",[actors.creator.user_id]);
 await assert.rejects(review(),/catalog_refresh_required/);
 await service(`public.record_merch_tax_code_catalog('[{"id":"txcd_12345678","name":"Synthetic provider taxonomy","description":"Not a legal classification","supported":true}]')`);
 const category=await review();assert.equal(category.providerReady,false);
 await assert.rejects(review(),/revision_changed/);
 assert.equal(await one('select count(*)::int from private.merch_tax_category_contexts'),0,'human review cannot create provider evidence');
 assert.equal(await one("select count(*)::int from private.commerce_tax_qualifications where feature='physical_merch'"),0);
 const unknown=await select(null,'Item does not fit any reviewed category');assert.equal(unknown.status,'review_required');await refresh();
 const queue=await rpc('creator','public.get_owner_merch_tax_review_queue(1,null,null)');
 assert.equal(queue.requests[0].id,unknown.requestId);assert.equal(queue.requests[0].providerStatus,'missing');assert.equal(queue.requests[0].accountStatus,'unknown');
 assert.equal(queue.requests[0].current,true);assert.equal(queue.requests[0].description,'Classification-specific description');
 await assert.rejects(rpc('buyer1',`public.list_creator_merch_tax_categories('${product}')`),/product_not_found/);
 await assert.rejects(rpc('buyer1','public.get_owner_merch_tax_review_queue()'),/owner_current_session_required/);
 await assert.rejects(rpc('creator',`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${randomUUID()}','forged',now()+interval '1 hour')`),/permission denied/);
 assert.equal((await rpc('creator',`public.resolve_owner_merch_tax_request('${unknown.requestId}','${category.id}','Synthetic reviewed classification')`)).status,'reviewed');
 const suggested=await rpc('creator',`public.list_creator_merch_tax_categories('${product}')`);assert.equal(suggested.selection.suggestedCategoryId,category.id);assert.equal(suggested.selection.status,'review_required');
 const missing=await select(category.id);assert.equal(missing.status,'provider_evidence_required');
 await assert.rejects(select(category.id),/changed_reload/);await refresh();
 await assert.rejects(rpc('creator',`public.resolve_owner_merch_tax_request('${unknown.requestId}','${category.id}','Synthetic reviewed classification')`),/product_changed/);
 assert.equal((await rpc('creator','public.get_owner_merch_tax_review_queue()')).requests.find(x=>x.id===unknown.requestId).current,false);
 const policy=await one(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
 full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
 registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
 values('physical_merch','${sourceProduct}','acct_platform','production','US_all_destinations','all_supported_platforms',true,'SYNTHETIC independent basis','SYNTHETIC full coverage','automatic','self','txcd_12345678','inclusive',
 'SYNTHETIC registration evidence','SYNTHETIC authenticated settings proof','SYNTHETIC source product proof',now(),now()+interval '1 hour',now()+interval '1 hour',true) returning id`);
 const context=await service(`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${policy}','SYNTHETIC independently verified inline product_data tax_code applicability',now()+interval '30 minutes')`);
 assert.equal(await one(`select private.merch_tax_context_current('${context}')`),true);
 const sourceListing=await rpc('creator',`public.save_creator_merch_product_with_tracking('${sourceProduct}','Original evidenced listing','Synthetic inline category scope',null,1000,10,'draft',null,'tracked')`);
 const sameSource=await rpc('creator',`public.select_creator_merch_tax_category('${sourceProduct}','${category.id}',${lit(sourceListing.updatedAt)},'')`);
 assert.equal(sameSource.status,'ready');
 assert.equal(await one(`select private.merch_tax_category_policy_current(policy_id) from private.merch_tax_category_policy_links where request_id='${sameSource.requestId}'`),true,'source listing can consume its own independently verified reusable evidence without self-supersession');
 const contextExpiry=await one(`select expires_at::text from private.merch_tax_category_contexts where id='${context}'`);
 const replayContext=()=>service(`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${policy}','SYNTHETIC independently verified inline product_data tax_code applicability',${lit(contextExpiry)})`);
 assert.equal(await replayContext(),context,'same provider receipt is idempotent');
 await assert.rejects(service(`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${policy}','SYNTHETIC independently verified inline product_data tax_code applicability',${lit(contextExpiry)}::timestamptz+interval '1 second')`),/evidence_conflict/);
 const originalLiveProof=await one(`select provider_live_observation from public.creator_payout_accounts where creator_user_id='${actors.creator.user_id}' and provider_environment='live'`);
 await db.query(`update public.creator_payout_accounts set provider_live_observation=jsonb_set(provider_live_observation,'{platformAccountId}','"acct_other"') where creator_user_id=$1 and provider_environment='live'`,[actors.creator.user_id]);
 assert.equal(await one(`select private.merch_tax_context_current('${context}')`),false,'switched platform cannot reuse account evidence');
 await assert.rejects(service(`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${policy}','SYNTHETIC wrong platform',now()+interval '1 hour')`),/unqualified/);
 await db.query(`update public.creator_payout_accounts set provider_live_observation=$2 where creator_user_id=$1 and provider_environment='live'`,[actors.creator.user_id,JSON.stringify(originalLiveProof)]);
 assert.equal(await one(`select private.merch_tax_context_current('${context}')`),true);
 const beforeRevision=await one(`select publication_revision from public.merch_products where id='${product}'`);
 const ready=await select(category.id);assert.equal(ready.status,'ready');await refresh();
 assert.ok(await one(`select publication_revision>${beforeRevision} from public.merch_products where id='${product}'`));
 const derived=await one(`select policy_id from private.merch_tax_category_policy_links where request_id='${ready.requestId}'`);
 assert.equal(await one(`select private.merch_tax_category_policy_current('${derived}')`),true);
 await assert.rejects(service(`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${derived}','SYNTHETIC forbidden recursive qualification',now()+interval '10 minutes')`),/unqualified/);
 // Actual creator category -> derived policy -> reviewed live publication.
 // Local synthetic platform qualifications only; never provider activation.
 await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);
 update public.platform_money_kill_switches set state='on' where key='merch_enabled';
 insert into public.provider_readiness_status(provider,capability,status,environment,is_live_money_enabled,proof_source,proof_summary,last_checked_at)
 values('stripe','platform_commerce','active','production',true,'SYNTHETIC','SYNTHETIC',now()) on conflict(provider,capability,environment)
 do update set status='active',is_live_money_enabled=true,proof_source='SYNTHETIC',proof_summary='SYNTHETIC',last_checked_at=now();
 insert into private.merch_live_checkout_qualifications values('acct_platform',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '1 hour',null);`);
 const publication=await rpc('creator',`public.review_creator_merch_live_publication('${product}',${lit(p.updatedAt)})`);
 assert.equal(publication.ready,true,JSON.stringify(publication));
 const published=await rpc('creator',`public.confirm_creator_merch_live_publication('${publication.reviewId}')`);
 assert.equal(published.environment,'production');assert.equal(published.publicationStatus,'published');await refresh();
 assert.equal(await one(`select private.merch_tax_category_policy_current('${derived}')`),true,'publication preserves exact selected category lineage');
 const order=randomUUID();await db.exec(`insert into public.merch_orders(id,product_id,provider,environment) values('${order}','${product}','stripe_physical_goods','production')`);
 const bind=()=>service(`public.bind_commerce_tax_checkout_policy('physical_merch','${order}','${product}','acct_platform','production','US_all_destinations')`);
 assert.equal((await bind()).policyId,derived);
 const accepted=await rows(`select to_jsonb(b) value from private.commerce_tax_checkout_bindings b where identity_id='${order}'`);
 // Unknown selection supersedes current classification without mutating terms.
 const unknownAgain=await select(null,'Needs different classification');await refresh();assert.equal((await bind()).reason,'tax_category_review_required');
 assert.deepEqual(await rows(`select to_jsonb(b) value from private.commerce_tax_checkout_bindings b where identity_id='${order}'`),accepted);
 const again=await select(category.id);await refresh();assert.equal(again.status,'ready');assert.equal((await bind()).reason,'tax_policy_changed');
 const againPolicy=await one(`select policy_id from private.merch_tax_category_policy_links where request_id='${again.requestId}'`);
 // Category-sensitive source changes invalidate lineage; stock changes do not.
 await db.exec(`update public.merch_products set stock_quantity=11 where id='${product}'`);
 assert.equal(await one(`select private.merch_tax_category_policy_current('${againPolicy}')`),true);
 await db.exec(`update public.merch_products set description='Different item' where id='${product}'`);
 assert.equal(await one(`select private.merch_tax_category_policy_current('${againPolicy}')`),false);await refresh();
 await select(category.id);await refresh();
 const latest=await one(`select policy_id from private.merch_tax_category_policy_links where product_id='${product}' order by created_at desc limit 1`);
 await db.exec(`update private.merch_tax_category_contexts set revoked_at=clock_timestamp() where id='${context}'`);
 assert.equal(await replayContext(),context,'old evidence retry cannot resurrect revoked context');
 assert.equal(await one(`select private.merch_tax_category_policy_current('${latest}')`),false);
 assert.equal((await select(category.id)).status,'provider_evidence_required');await refresh();
 await assert.rejects(db.exec(`update private.merch_tax_category_contexts set revoked_at=null where id='${context}'`),/immutable/);
 const shortContext=await service(`public.record_merch_tax_category_context('${category.id}','${actors.creator.user_id}','${policy}','SYNTHETIC expiring newer review',clock_timestamp()+interval '100 milliseconds')`);
 await new Promise(r=>setTimeout(r,120));
 assert.equal(await one(`select private.merch_tax_context_current('${shortContext}')`),false);
 assert.equal((await select(category.id)).status,'provider_evidence_required','expired successor cannot fall back to old provider context');await refresh();
 const revision2=await review(1,'Synthetic revised category');assert.equal(revision2.revision,2);
 await assert.rejects(rpc('creator',`public.revoke_owner_merch_tax_category('${category.id}')`),/revision_changed/);
 await assert.rejects(select(category.id),/review_expired/);
 assert.equal((await rpc('creator',`public.revoke_owner_merch_tax_category('${revision2.id}')`)).status,'revoked');
 assert.equal((await rpc('creator',`public.list_creator_merch_tax_categories('${product}')`)).categories.length,0);
 // Page through every request without duplicates, with deterministic tuple cursor.
 for(let i=0;i<2;i++)await db.exec(`insert into private.merch_tax_category_requests(product_id,creator_id,product_snapshot,note,created_at)
  select id,creator_id,private.merch_tax_product_snapshot(p),'SYNTHETIC equal-time historical cursor fixture','2026-01-01T00:00:00Z' from public.merch_products p where id='${product}'`);
 const found=[];let cursor=null;
 do{const page=await rpc('creator',`public.get_owner_merch_tax_review_queue(1,${cursor?lit(cursor.createdAt):'null'},${cursor?lit(cursor.id):'null'})`);found.push(...page.requests.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(new Set(found).size,found.length);assert.equal(found.length,await one('select count(*)::int from private.merch_tax_category_requests'));
 assert.ok(found.includes(unknownAgain.requestId));
 await assert.rejects(rpc('creator',`public.get_owner_merch_tax_review_queue(2,now(),null)`),/cursor_invalid/);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from private.merch_tax_category_contexts'),/permission denied/);await db.exec('reset role');
 }
 assert.equal(await one("select has_function_privilege('anon','public.get_owner_merch_tax_review_queue(integer,timestamptz,uuid)','execute')"),false);
 assert.deepEqual(await rows(`select to_jsonb(b) value from private.commerce_tax_checkout_bindings b where identity_id='${order}'`),accepted);
 // Validate the native schedule SQL sequentially. This is not concurrent
 // PostgreSQL lock proof; hosted guarded runner establishes actual blocking.
 const nativeQuery=async sql=>{const results=await db.exec(sql);const row=results.at(-1)?.rows?.[0];const v=row?Object.values(row)[0]:'';return typeof v==='boolean'?(v?'t':'f'):String(v);};
 const nativeAuth=()=>`set local request.jwt.claims='${JSON.stringify({role:'authenticated',sub:actors.creator.user_id,session_id:actors.creator.session_id})}';set local role authenticated;`;
 await runMerchTaxCategoryRaces({query:nativeQuery,actors:{creator:{id:actors.creator.user_id,session:actors.creator.session_id}},lit,auth:nativeAuth,
  race:async(_name,first,second,expected={})=>{await nativeQuery(`begin;${first}commit;`);if(expected.error){await assert.rejects(nativeQuery(`begin;${second}commit;`),expected.error);await db.exec('rollback');}else await nativeQuery(`begin;${second}commit;`);}});
}));
