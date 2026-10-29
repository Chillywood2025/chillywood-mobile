import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Entire source migration chain, actual RLS/session/scan/reference functions.
// PGlite substitutes managed auth/storage catalogs, not business authority.
test('merch photos preserve real ownership, private scanning, binding and retained references',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,includeHeldStudio:true,implicitApiGrants:false});
 const owner=randomUUID(),buyer=randomUUID(),session=randomUUID(),buyerSession=randomUUID();
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const admin=async()=>{await db.exec('reset role');await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);};
 const actor=async(user,s)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[JSON.stringify({sub:user,session_id:s,role:'authenticated'})]);await db.exec('set role authenticated');};
 try {
  await admin();
  // Managed Storage infrastructure is catalog-only in this fixture. Model its
  // normal API SELECT grant and RLS switch, without adding/changing any policy.
  await db.exec('alter table storage.objects enable row level security; grant select on storage.objects to authenticated');
  await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now()),($2,false,false,now())',[owner,buyer]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[session,owner,buyerSession,buyer]);
  await db.query("insert into public.user_profiles(user_id,username,display_name) values($1,'photo_owner','Photo owner'),($2,'photo_buyer','Photo buyer') on conflict(user_id) do nothing",[owner,buyer]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2) and d.active and d.market='UNITED_STATES' and d.capability='account'`,[owner,buyer]);
  await db.query("insert into public.platform_role_memberships(user_id,role,status) values($1,'operator','active')",[owner]);
  await actor(owner,session);
  const product=await one("select public.save_creator_merch_product($1,'Photo shirt','Draft',null,1200,3,'draft',null)",[randomUUID()]);
  assert.equal(await one('select public.check_creator_merch_photo_target($1)',[product.id]),true);
  const asset=randomUUID(),key=`${owner}/merch_product_image/${asset}.png`;
  // Immutable upload object fixture; registration and queue use actual SQL.
  await admin();await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'photo-v1','{\"size\":79,\"mimetype\":\"image/png\"}')",[randomUUID(),key]);
  await actor(owner,session);
  await db.query("insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'merch_product_image',$3,$3,'image/png',79)",[asset,owner,key]);
  let bound=await one('select public.assign_merch_product_photo($1,$2,$3)',[product.id,asset,product.updatedAt]);
  assert.equal(bound.photoAssetId,asset);assert.equal(bound.photoStatus,'pending_review');
  assert.equal(bound.photoCanApprove,false);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[product.id,asset,bound.updatedAt]),/approval_unavailable/);
  assert.equal((await one('select public.assign_merch_product_photo($1,$2,$3)',[product.id,asset,product.updatedAt])).updatedAt,bound.updatedAt);
  await assert.rejects(()=>one('select public.remove_platform_brand_asset($1)',[asset]),/merch_photo_in_use/);
  await actor(buyer,buyerSession);
  assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),false);
  assert.equal(await one('select count(*)::int from public.platform_brand_assets where id=$1',[asset]),0);
  await assert.rejects(()=>one('select public.read_creator_merch_photo_status($1)',[product.id]),/owner_required/);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[product.id,asset,bound.updatedAt]),/owner_required/);
  await assert.rejects(()=>one('select public.assign_merch_product_photo($1,$2,$3)',[product.id,asset,bound.updatedAt]),/owner_required/);
  await admin();
  await db.query("update public.merch_products set publication_status='published' where id=$1",[product.id]);
  const job=await one("select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=$1",[asset]);
  await db.query('update public.media_scan_jobs set priority=-2147483648 where id=$1',[job]);
  await one("select public.claim_media_scan_jobs(1,'merch-photo-test')");
  await one("select public.complete_media_scan_job($1,'clean','clamav','fixture','fixture',null,null,1)",[job]);
  await actor(buyer,buyerSession);
  assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),false,'clean scan alone does not approve content');
  await admin();await db.query("update public.merch_products set publication_status='draft' where id=$1",[product.id]);
  await actor(owner,session);
  const approval=await one('select public.read_creator_merch_photo_status($1)',[product.id]);
  assert.equal(approval.photoCanApprove,true);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[product.id,asset,bound.updatedAt]),/changed_reload/);
  assert.equal((await one('select public.approve_creator_merch_photo($1,$2,$3)',[product.id,asset,approval.updatedAt])).photoStatus,'ready');
  assert.equal((await one('select public.approve_creator_merch_photo($1,$2,$3)',[product.id,asset,approval.updatedAt])).photoCanApprove,false,'acknowledgement retry is idempotent');
  await db.query("update public.platform_brand_assets set asset_state='published' where id=$1",[asset]);
  await actor(buyer,buyerSession);
  assert.equal(await one('select count(*)::int from public.platform_brand_assets where id=$1',[asset]),0,'published asset state cannot override draft product');
  assert.equal(await one("select count(*)::int from storage.objects where bucket_id='platform-brand-assets' and name=$1",[key]),0,'old permissive storage policy cannot bypass merch publication');
  await admin();
  await assert.rejects(()=>db.query('insert into public.platform_brand_profiles(owner_user_id,hero_image_asset_id) values($1,$2) on conflict(owner_user_id) do update set hero_image_asset_id=excluded.hero_image_asset_id',[owner,asset]),/merch_photo_product_reference_only/);
  await admin();await db.query("update public.merch_products set publication_status='published' where id=$1",[product.id]);
  await actor(buyer,buyerSession);
  assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),true,'reviewed clean photo on visible published listing');
  assert.equal(await one('select count(*)::int from public.platform_brand_assets where id=$1',[asset]),1);
  assert.equal(await one("select count(*)::int from storage.objects where bucket_id='platform-brand-assets' and name=$1",[key]),1,'actual storage RLS permits the reviewed visible product photo');
  await admin();await db.query("update public.user_profiles set platform_access_visibility='private' where user_id=$1",[owner]);
  await actor(buyer,buyerSession);
  assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),false);
  assert.equal(await one("select count(*)::int from storage.objects where bucket_id='platform-brand-assets' and name=$1",[key]),0,'private Platform revokes new signed delivery');
  await admin();await db.query("update public.user_profiles set platform_access_visibility='public' where user_id=$1",[owner]);
  await admin();
  // Restore the deliberately manipulated asset-state fixture, then exercise
  // the real scanner requeue/claim/completion transition (no scan flag bypass).
  await db.query("update public.platform_brand_assets set asset_state='draft' where id=$1",[asset]);
  await one("select public.enqueue_media_scan_job('platform_brand_assets','merch_product_image',$1,$2,'supabase','platform-brand-assets',$3,'image/png',79,-2147483648,'{}')",[asset,owner,key]);
  await one("select public.claim_media_scan_jobs(1,'merch-photo-rescan')");
  const rescan=await one("select public.complete_media_scan_job($1,'malware_detected','clamav','fixture','fixture','fixture-detection',null,1)",[job]);
  assert.equal(rescan.targetPropagationComplete,true);
  await actor(buyer,buyerSession);
  assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),false);
  await admin();
  await db.query('update public.merch_products set reserved_quantity=1 where id=$1',[product.id]);
  assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[product.id]),1,'quarantined photo does not block inventory settlement');
  await actor(owner,session);
  bound=(await one('select public.list_creator_merch_products(null,true)')).products[0];
  await assert.rejects(()=>one('select public.assign_merch_product_photo($1,null,$2)',[product.id,bound.updatedAt]),/creator|legal|authority|eligible|denied/,'published photo changes retain canonical creator-money authority');
  bound=await one("select public.save_creator_merch_product($1,'Photo shirt','Still editable',null,1200,3,'draft',$2)",[product.id,bound.updatedAt]);
  const second=await one("select public.save_creator_merch_product($1,'Second','Draft',null,1200,3,'draft',null)",[randomUUID()]);
  await assert.rejects(()=>one('select public.assign_merch_product_photo($1,$2,$3)',[second.id,asset,second.updatedAt]),/unavailable/);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[product.id,asset,bound.updatedAt]),/approval_unavailable/);
  await actor(owner,session);
  await assert.rejects(()=>one('select public.assign_merch_product_photo($1,null,$2)',[product.id,product.updatedAt]),/changed_reload/);
  await assert.rejects(()=>one('select public.assign_merch_product_photo($1,$2,$3)',[product.id,randomUUID(),bound.updatedAt]),/unavailable/);
  const cleared=await one('select public.assign_merch_product_photo($1,null,$2)',[product.id,bound.updatedAt]);
  assert.equal(cleared.photoAssetId,null);
  await assert.rejects(()=>one('select public.discard_creator_merch_photo($1)',[randomUUID()]),/owner_required/);
  const removed=await one('select public.remove_platform_brand_asset($1)',[asset]);assert.ok(removed.deletedAt);
  await assert.rejects(()=>one('select public.assign_merch_product_photo($1,$2,$3)',[product.id,asset,cleared.updatedAt]),/unavailable/);
  // Safety removal clears any latent external-image fallback and visibly marks
  // the listing, while stock updates and source retention continue normally.
  const flagged=randomUUID(),flaggedKey=`${owner}/merch_product_image/${flagged}.png`;
  await admin();
  await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'flagged-v1','{\"size\":79,\"mimetype\":\"image/png\"}')",[randomUUID(),flaggedKey]);
  await db.query("update public.merch_products set image_url='https://legacy.invalid/fallback.png' where id=$1",[second.id]);
  await actor(owner,session);
  await db.query("insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'merch_product_image',$3,$3,'image/png',79)",[flagged,owner,flaggedKey]);
  const secondCurrent=await one('select public.read_creator_merch_photo_status($1)',[second.id]);
  await one('select public.assign_merch_product_photo($1,$2,$3)',[second.id,flagged,secondCurrent.updatedAt]);
  await one("select public.review_platform_brand_asset($1,'archive','Safety removal fixture')",[flagged]);
  const takenDown=await one('select public.read_creator_merch_photo_status($1)',[second.id]);
  assert.equal(takenDown.photoAssetId,null);assert.equal(takenDown.imageUrl,null);assert.equal(takenDown.photoStatus,'blocked');
  await admin();await db.query('update public.merch_products set reserved_quantity=1 where id=$1',[second.id]);
  assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[second.id]),1);
  const rejected=randomUUID(),rejectedKey=`${buyer}/merch_product_image/${rejected}.png`;
  await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'rejected-v1','{\"size\":79,\"mimetype\":\"image/png\"}')",[randomUUID(),rejectedKey]);
  await db.query("insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'merch_product_image',$3,$3,'image/png',79)",[rejected,buyer,rejectedKey]);
  await actor(owner,session);await one("select public.review_platform_brand_asset($1,'reject','Rejected photo fixture')",[rejected]);
  await actor(buyer,buyerSession);
  await assert.rejects(()=>one("select public.review_platform_brand_asset($1,'approve',null)",[rejected]),/merch_photo_approval_unavailable/,'generic owner review cannot override merch rejection');
  await admin();
  // Ordinary creator positive: this subject has NEVER held an operator role.
  // Its finite Premium entitlement is produced by the real receipt processor,
  // not an entitlement/auth function double or a handwritten entitlement row.
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled')");
  const premiumReceipt=await one(`select public.process_revenuecat_premium_event_atomic(
    'revenuecat_google_play','merch-photo-ordinary-premium','INITIAL_PURCHASE',$1,
    p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',
    now()+interval '1 day',now(),999,'usd',repeat('b',64),'NORMAL','google_play','android',null,p.id,
    'merch-photo-ordinary-original') from public.monetization_products p
    where p.provider='revenuecat_google_play' and p.environment='sandbox'
      and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1`,[buyer]);
  assert.equal(premiumReceipt.status,'processed');
  await actor(buyer,buyerSession);
  assert.equal(await one("select public.has_platform_role(array['owner','operator'])"),false);
  assert.equal(await one("select public.has_platform_permission('content_moderation') or public.has_platform_permission('reports_review')"),false);
  assert.equal(await one('select public.has_active_premium_creator_tool_access($1)',[buyer]),true);
  const ordinaryProduct=await one("select public.save_creator_merch_product($1,'Ordinary creator photo','Draft',null,1200,2,'draft',null)",[randomUUID()]);
  const ordinaryPhoto=randomUUID(),ordinaryKey=`${buyer}/merch_product_image/${ordinaryPhoto}.png`;
  await admin();
  await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'ordinary-v1','{\"size\":79,\"mimetype\":\"image/png\"}')",[randomUUID(),ordinaryKey]);
  await actor(buyer,buyerSession);
  await db.query("insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'merch_product_image',$3,$3,'image/png',79)",[ordinaryPhoto,buyer,ordinaryKey]);
  const ordinaryBound=await one('select public.assign_merch_product_photo($1,$2,$3)',[ordinaryProduct.id,ordinaryPhoto,ordinaryProduct.updatedAt]);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[ordinaryProduct.id,ordinaryPhoto,ordinaryBound.updatedAt]),/approval_unavailable/);
  await admin();
  const ordinaryJob=await one("select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=$1",[ordinaryPhoto]);
  await db.query('update public.media_scan_jobs set priority=-2147483648 where id=$1',[ordinaryJob]);
  await one("select public.claim_media_scan_jobs(1,'ordinary-photo-scan')");
  assert.equal((await one("select public.complete_media_scan_job($1,'clean','clamav','fixture','fixture',null,null,1)",[ordinaryJob])).targetPropagationComplete,true);
  await actor(buyer,buyerSession);
  assert.equal((await one('select public.read_creator_merch_photo_status($1)',[ordinaryProduct.id])).photoCanApprove,true);
  assert.equal((await one('select public.approve_creator_merch_photo($1,$2,$3)',[ordinaryProduct.id,ordinaryPhoto,ordinaryBound.updatedAt])).photoStatus,'ready');
  await admin();
  const creatorReview=(await db.query("select actor_user_id,actor_role,action,before_state->>'moderation_status' as previous,after_state->>'moderation_status' as next from public.platform_brand_asset_review_events where asset_id=$1 and action='approve'",[ordinaryPhoto])).rows;
  assert.deepEqual(creatorReview,[{actor_user_id:buyer,actor_role:'creator',action:'approve',previous:'pending_review',next:'clean'}],'canonical audit records creator branch, not operator privilege');
  await actor(owner,session);await one("select public.review_platform_brand_asset($1,'reject','Reviewer rejects ordinary photo')",[ordinaryPhoto]);
  await actor(buyer,buyerSession);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[ordinaryProduct.id,ordinaryPhoto,ordinaryBound.updatedAt]),/approval_unavailable/);
  await assert.rejects(()=>one("select public.review_platform_brand_asset($1,'approve',null)",[ordinaryPhoto]),/merch_photo_approval_unavailable/,'ordinary Premium owner cannot override staff rejection even via generic RPC');
  await admin();
  await db.query("update public.platform_brand_assets set moderation_status='hidden' where id=$1",[ordinaryPhoto]);
  await actor(buyer,buyerSession);
  await assert.rejects(()=>one('select public.approve_creator_merch_photo($1,$2,$3)',[ordinaryProduct.id,ordinaryPhoto,ordinaryBound.updatedAt]),/approval_unavailable/);
  await assert.rejects(()=>one("select public.review_platform_brand_asset($1,'approve',null)",[ordinaryPhoto]),/merch_photo_approval_unavailable/,'ordinary Premium owner cannot override hidden state');
  await admin();
  for(const signature of [
   'public.save_creator_merch_product_before_photo_lock(uuid,text,text,text,integer,integer,text,timestamptz)',
   'public.configure_creator_merch_variants_before_photo_lock(uuid,text,jsonb,timestamptz)',
   'public.reserve_merch_checkout_for_actor_before_photo_lock(uuid,uuid,uuid,integer,uuid,uuid)',
   'public.process_stripe_merch_webhook_before_photo_lock(text,text,text,jsonb)',
  ]) for(const role of ['anon','authenticated','service_role']) {
   assert.equal(await one("select has_function_privilege($1,$2,'EXECUTE')",[role,signature]),false,'lock ordering predecessor is not exposed');
  }
  assert.equal(await one('select count(*)::int from private.platform_brand_object_incarnations where asset_id=$1 and removed_at is not null and retain_until=removed_at+interval \'720 hours\'',[asset]),1);
  assert.equal(await one('select count(*)::int from media_scan_jobs where target_table=\'platform_brand_assets\' and target_id=$1',[asset]),1);
 } finally {await db.close();}
});
