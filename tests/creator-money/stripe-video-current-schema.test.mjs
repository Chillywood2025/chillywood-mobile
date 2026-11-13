import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {syntheticVideoMarketObservation} from '../helpers/stripe-video-market-fixture.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {acceptCommerceCreatorTerms,seedCommerceBuyer,seedCommerceCreator,seedQualifiedCommerceCreator,withCommerceActor} from '../helpers/automatic-commerce-fixture.mjs';

test('current schema: Stripe receipt, held ledger, replay and refund-first are atomic',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()},video=randomUUID();
 try {
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  await seedCommerceBuyer(db,buyer);await seedCommerceCreator(db,creator);await acceptCommerceCreatorTerms(db,creator);
  const declared=await withCommerceActor(db,creator,()=>one("select public.declare_creator_money_eligibility(true,'US','CA')"));
  assert.equal(declared.state,'PENDING_VERIFICATION');
  assert.equal(declared.canCreateMoneyExposure,false);
  assert.equal(declared.sandboxCapability.canUseCreatorTools,true);
  assert.equal(declared.taxComplete,null);assert.equal(declared.sanctionsClear,null);
  assert.equal(await one('select public.wave1_creator_money_subject_authorized_internal($1)',[creator.id]),false,
   'pending creator does not acquire live authority');
  assert.equal(await one("select private.ordinary_creator_subject_for_mode($1,'sandbox')",[creator.id]),true);
  await db.query(`insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes,vip_access_required)
   values($1::uuid,$2::uuid,'SYNTHETIC Stripe video','public','clean','cloudflare_r2','chillywood-media-origin',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4',$2::uuid::text||'/'||$1::uuid::text||'/source.mp4','video/mp4',1024,false)`,[video,creator.id]);
  await db.query("update public.videos set scan_status='clean',scan_provider='pgtap',scan_result='clean',scanned_at=clock_timestamp() where id=$1",[video]);
  // Exercise the actual creator RPC under the authenticated role, not an owner insert.
  const pricing=(actor,amount,currency='usd',paid=true)=>withCommerceActor(db,actor,()=>one(
    'select public.set_my_stripe_sandbox_video_price($1::uuid,$2::integer,$3::text,$4::boolean)',[video,amount,currency,paid]));
  // Mode-aware admission retains the money-off boundary, even for authoring.
  await db.exec("update public.platform_money_kill_switches set state='on' where key='live_money_enabled'");
  await assert.rejects(()=>pricing(creator,1000),/creator_mode_changed|creator_sandbox_authority_required/);
  await db.exec("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  const price=await pricing(creator,1000);assert.equal(price.status,'saved');assert.equal(price.revision,1);
  const sourceCurrent=()=>one('select private.stripe_video_source_current($1,$2)',[video,creator.id]);
  assert.equal(await sourceCurrent(),true);
  for(const flag of ['live_money_enabled','payouts_enabled','cashout_enabled']) {
   await db.query("update public.platform_money_kill_switches set state='on' where key=$1",[flag]);
   assert.equal(await sourceCurrent(),false,`${flag} disables sandbox source authority`);
   await db.query("update public.platform_money_kill_switches set state='off' where key=$1",[flag]);
  }
  await db.query("update public.wave1_creator_eligibility set kyc_complete=false where creator_user_id=$1",[creator.id]);
  assert.equal(await sourceCurrent(),false,'explicit adverse verification is not pending/unknown');
  await db.query("update public.wave1_creator_eligibility set kyc_complete=null where creator_user_id=$1",[creator.id]);
  await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[creator.session]);
  assert.equal(await sourceCurrent(),false,'expired creator session invalidates source');
  await db.query('update auth.sessions set not_after=null where id=$1',[creator.session]);
  assert.equal(await sourceCurrent(),true);
  const otherCreator={id:randomUUID(),session:randomUUID()};await seedQualifiedCommerceCreator(db,otherCreator);
  await assert.rejects(()=>pricing(otherCreator,1000),/creator_pricing_owner_required/);
  for(const amount of [0,49,100000000,null])await assert.rejects(()=>pricing(creator,amount),/creator_pricing_amount_out_of_range/);
  await assert.rejects(()=>pricing(creator,'457.5'),/invalid input syntax for type integer/);
  await assert.rejects(()=>pricing(creator,1000,'eur'),/creator_pricing_currency_invalid/);
  const listed=await withCommerceActor(db,creator,()=>one('select public.list_my_stripe_sandbox_video_prices()'));
  assert.equal(listed.length,1);assert.equal(listed[0].priceCents,1000);assert.equal(listed[0].provider,'stripe');
  assert.equal(listed[0].salesCount,null);assert.equal(listed[0].totalRevenueCents,null);
  assert.equal(await one('select private.stripe_video_delivery_ready($1)',[video]),false);
  const request=randomUUID();
  const reserve=()=>one('select public.prepare_stripe_sandbox_video_order($1,$2,$3,$4,$5,$6)',[buyer.id,buyer.session,video,request,'acct_test','prod_video']);
  const reserved=await reserve();assert.equal(reserved.amount_minor,1000);assert.equal((await reserve()).id,reserved.id);
  const nextSession=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[nextSession,buyer.id]);
  await assert.rejects(()=>one('select public.read_stripe_sandbox_video_order_by_request($1,$2,$3,$4)',[request,video,buyer.id,nextSession]),/buyer_authority_required/);
  await seedCommerceBuyer(db,{id:buyer.id,session:nextSession}); // Complete current-session account authority, including accepted current terms.
  const recovered=await one('select public.read_stripe_sandbox_video_order_by_request($1,$2,$3,$4)',[request,video,buyer.id,nextSession]);
  assert.equal(recovered.id,reserved.id);assert.equal(recovered.session_id,buyer.session);assert.equal(recovered.status,'prepared');
  assert.equal(await one('select public.read_stripe_sandbox_video_order_by_request($1,$2,$3,$4)',[request,video,otherCreator.id,otherCreator.session]),null);
  assert.equal(await one('select public.read_stripe_sandbox_video_order_by_request($1,$2,$3,$4)',[request,randomUUID(),buyer.id,nextSession]),null);
  await assert.rejects(()=>one('select public.read_stripe_sandbox_video_order_by_request($1,$2,$3,$4)',[request,video,buyer.id,randomUUID()]),/buyer_authority_required/);
  assert.equal(await one('select session_id from private.stripe_paid_video_orders where id=$1',[reserved.id]),buyer.session);
  const market=await syntheticVideoMarketObservation(db,reserved.id);
  await assert.rejects(()=>one('select public.dispatch_stripe_sandbox_video_order($1,$2,$3,$4)',[reserved.id,buyer.id,buyer.session,market]),/checkout_dispatch_unavailable/);
  assert.equal(await one('select status from private.stripe_paid_video_orders where id=$1',[reserved.id]),'prepared');
  await db.query("update private.stripe_paid_video_orders set expires_at=clock_timestamp()-interval '1 second' where id=$1",[reserved.id]);
  const expired=await one('select public.read_stripe_sandbox_video_order($1,$2,$3)',[reserved.id,buyer.id,buyer.session]);assert.equal(expired.status,'failed');
  const create=async suffix=>{
   const order=randomUUID();
   await db.query(`insert into private.stripe_paid_video_orders(id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,
   amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,checkout_session_id,expires_at)
   values($1,$2,$3,$4,$5,$6,1,1000,'usd','acct_test','prod_video',$7,'checkout_ready',$8,now()+interval '1 hour')`,
   [order,buyer.id,buyer.session,video,creator.id,price.id,randomUUID(),`cs_test_${suffix}`]);
   const facts={livemode:false,accountId:'acct_test',checkoutSessionId:`cs_test_${suffix}`,orderId:order,buyerId:buyer.id,videoId:video,
    productId:'prod_video',currency:'usd',amountMinor:1000,paymentStatus:'paid',paymentIntentStatus:'succeeded',platformHeld:true,chargePaid:true,
    paymentIntentId:`pi_${suffix}`,chargeId:`ch_${suffix}`,refundAmountMinor:0};
   return {order,facts};
  };
  const observe=(item,event,refund=0)=>one('select public.observe_stripe_sandbox_video_payment($1,$2,$3::jsonb)',[item.order,event,JSON.stringify({...item.facts,refundAmountMinor:refund})]);
  const first=await create('first');
  const revised=await pricing(creator,1234);assert.equal(revised.revision,2);
  const frozen=(await db.query('select price_id,price_revision,amount_minor from private.stripe_paid_video_orders where id=$1',[first.order])).rows[0];
  assert.equal(frozen.price_id,price.id);assert.equal(Number(frozen.price_revision),1);assert.equal(frozen.amount_minor,1000);
  assert.equal((await observe(first,'evt_first')).status,'paid');
  const exactGrant=await one('select access_grant_id from private.stripe_paid_video_orders where id=$1',[first.order]);
  const playerMetadata=()=>withCommerceActor(db,buyer,()=>one('select public.read_stripe_sandbox_video_player_metadata($1)',[video]));
  const metadata=await playerMetadata();assert.equal(metadata.videoId,video);assert.equal(metadata.creatorId,creator.id);
  assert.deepEqual(Object.keys(metadata).sort(),['createdAt','creatorId','description','title','updatedAt','videoId']);
  assert.equal(await withCommerceActor(db,buyer,()=>one('select count(*)::int from public.videos where id=$1',[video])),0,'paid buyer raw source row remains unreadable');
  const ownerAccess=await withCommerceActor(db,creator,()=>one('select public.resolve_stripe_sandbox_video_access($1)',[video]));
  assert.equal(ownerAccess.reason,'owner');assert.equal(ownerAccess.canAccess,true);assert.equal(ownerAccess.checkoutAllowed,false);
  assert.equal(await withCommerceActor(db,creator,()=>one('select count(*)::int from public.videos where id=$1',[video])),1,'owner preview retains original authority');
  assert.equal(await withCommerceActor(db,otherCreator,()=>one('select public.read_stripe_sandbox_video_player_metadata($1)',[video])),null);

  assert.equal(await one('select private.stripe_video_playback_grant_current($1,$2,$3)',[buyer.id,video,exactGrant]),true);
  assert.equal(await one('select private.stripe_video_playback_grant_current($1,$2,$3)',[buyer.id,video,randomUUID()]),false);
  assert.equal(await one('select private.stripe_video_access_current($1,$2)',[buyer.id,video]),true);
  assert.equal((await observe(first,'evt_duplicate')).status,'paid');
  assert.equal(await one('select count(*)::int from private.stripe_paid_video_observations where order_id=$1',[first.order]),1);
  assert.equal((await observe(first,'evt_refund',100)).status,'refunded');
  assert.equal(await playerMetadata(),null,'refund withdraws narrow player metadata');
  assert.equal(await one('select private.stripe_video_playback_grant_current($1,$2,$3)',[buyer.id,video,exactGrant]),false);
  assert.equal(await one('select private.stripe_video_access_current($1,$2)',[buyer.id,video]),false);
  const refundFirst=await create('refundfirst');assert.equal((await observe(refundFirst,'evt_already_refunded',1000)).status,'refunded');
  assert.equal(await one('select count(*)::int from private.stripe_paid_video_observations where order_id=$1',[refundFirst.order]),2);
  assert.equal(await one('select access_grant_id is null from private.stripe_paid_video_orders where id=$1',[refundFirst.order]),true);
  assert.equal(await one("select count(*)::int from public.money_access_ledger_events where metadata?'stripe_video_order_id' and payable_state in ('payable','paid')"),0);
  assert.equal(await one("select count(*)::int from public.creator_earnings_ledger where metadata?'stripe_video_order_id'"),0);
  const invalid=await create('invalid');await assert.rejects(()=>one('select public.observe_stripe_sandbox_video_payment($1,$2,$3::jsonb)',[invalid.order,'evt_live',JSON.stringify({...invalid.facts,livemode:true})]),/payment_identity_mismatch/);
  assert.equal(await one('select count(*)::int from private.stripe_paid_video_observations where order_id=$1',[invalid.order]),0);
  await assert.rejects(()=>one('select public.expire_stripe_sandbox_video_order($1,$2,$3)',[invalid.order,'cs_test_invalid','processing']),/expired_payment_not_terminal/);
  await one('select public.expire_stripe_sandbox_video_order($1,$2,$3)',[invalid.order,'cs_test_invalid','canceled']);
  assert.equal(await one('select status from private.stripe_paid_video_orders where id=$1',[invalid.order]),'failed');
  // A Stripe-only private offer must never fall through old free-row readers.
  const rawRead=()=>withCommerceActor(db,buyer,()=>one(`select public.can_read_creator_video_row($1,'public','clean','clean',$2,$2,null,$3)`,
   [creator.id,`${creator.id}/${video}/source.mp4`,buyer.id]));
  assert.equal(await rawRead(),false);
  await pricing(creator,1234,'usd',false);assert.equal(await rawRead(),false);
  const classified=await one('select public.classify_stripe_paid_video_ids($1::uuid[])',[[video]]);
  assert.deepEqual(classified,[{videoId:video,creatorId:creator.id}]);
  await assert.rejects(()=>db.query("update public.videos set playback_url='https://public.example/video.mp4' where id=$1",[video]),/stripe_video_requires_private_source_without_public_renditions/);
  await assert.rejects(()=>db.query('update public.videos set vip_access_required=true where id=$1',[video]),/stripe_video_requires_private_source_without_public_renditions/);
  // History is a read projection of the same immutable orders/ledger, not new money.
  const history=(actor,limit=100,cursor=null)=>withCommerceActor(db,actor,()=>one(
    'select public.read_my_creator_purchases($1,$2,$3,$4,$5)',[limit,cursor?.createdAt??null,cursor?.id??null,'paid_content',video]));
  const before=await one('select count(*)::int from public.money_access_ledger_events');
  const full=await history(buyer);
  const count=await one('select count(*)::int from private.stripe_paid_video_orders where buyer_id=$1',[buyer.id]);
  assert.equal(full.items.length,count);assert.equal(new Set(full.items.map(x=>x.id)).size,count);
  assert.ok(full.items.every(x=>x.grantsAccess===false&&x.amountMinor===1000&&x.productKey==='stripe_sandbox_video'));
  assert.equal(full.items.find(x=>x.id===first.order).refund.amountMinor,100);
  assert.equal(full.items.find(x=>x.id===first.order).refund.state,'partial');
  const api={};new Function('require','exports',ts.transpileModule(readFileSync('_lib/creatorPurchases.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),api);
  assert.ok(api.parseCreatorPurchasePage(full,buyer.id),'real RPC history passes client contract');
  let cursor=null;const paged=[];
  do {const page=await history(buyer,1,cursor);assert.ok(api.parseCreatorPurchasePage(page,buyer.id));paged.push(...page.items.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
  assert.deepEqual(paged,full.items.map(x=>x.id));
  assert.equal((await history(otherCreator)).items.length,0);
  const creatorHistory=await withCommerceActor(db,creator,()=>one('select public.list_my_paid_video_transactions(100)'));
  assert.equal(creatorHistory.filter(x=>x.provider==='stripe_connect').length,count);
  assert.equal(creatorHistory.find(x=>x.id===first.order).amountCents,1000);
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events'),before,'history cannot create cost/receipt events');
  await assert.rejects(()=>withCommerceActor(db,buyer,()=>one('select public.read_my_creator_purchases(0)')),/cursor_invalid/);
  await db.exec('set role authenticated');
  await assert.rejects(()=>one('select private.stripe_video_purchase_history_item($1)',[first.order]),/permission denied/);
  await db.exec('reset role');
 } finally {await db.close();}
});
