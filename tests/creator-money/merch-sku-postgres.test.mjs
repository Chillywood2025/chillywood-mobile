import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('size/color inventory preserves exact SKU allocations, price snapshots, and creator authority', {timeout:240000}, async t=>{
  const {db}=await createDatabase({applyRepair:true,includeHeldStudio:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const buyer=randomUUID(),other=randomUUID(),hs=randomUUID(),bs=randomUUID(),os=randomUUID();
  const admin=async()=>{await db.exec('reset role');await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false),set_config('request.jwt.claim.role','service_role',false)`);};
  const claim=async(user,session)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[JSON.stringify({sub:user,session_id:session,role:'authenticated'})]);await db.exec('set role authenticated');};
  let host;
  try {
    host=await one("select md5('merch-host:'||n::text)::uuid from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('merch-host:'||n::text)::uuid::text,20260814),100)=0 limit 1");
    await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now()),($2,false,false,now()),($3,false,false,now())',[host,buyer,other]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',[hs,host,bs,buyer,os,other]);
    await db.query("insert into public.user_profiles(user_id,username,display_name) values($1,'merch_host','Host'),($2,'merch_buyer','Buyer'),($3,'merch_other','Other') on conflict(user_id) do nothing",[host,buyer,other]);
    await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
      select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
      from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2,$3) and d.active and d.market='UNITED_STATES'
      and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[host,buyer,other]);
    await admin();
    await one(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":false,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}','merch-fixture','local_pgtap')`,[host]);
    await db.query("insert into public.beta_access_memberships(user_id,access_status) values($1,'active'),($2,'active')",[buyer,other]);
    await db.query("insert into public.platform_role_memberships(user_id,role,status) values($1,'operator','active')",[host]);
    await claim(host,hs);

    const id=randomUUID(), small=randomUUID(), large=randomUUID();
    const save=(args)=>one('select public.save_creator_merch_product_with_tracking($1,$2,$3,$4,$5,$6,$7,$8,$$tracked$$)',args);
    let product=await save([id,'Option tee','Sandbox options',null,1000,7,'published',null]);
    assert.equal(product.variantMode,'simple');assert.equal(product.availableQuantity,7);assert.deepEqual(product.variants,[]);
    const variants=[
      {id:small,sku:'TEE-S-RED',size:'S',color:'Red',stockQuantity:1,status:'active'},
      {id:large,sku:'TEE-L-BLUE',size:'L',color:'Blue',stockQuantity:5,status:'active'},
    ];
    const configure=(items=variants,mode='options',revision=product.updatedAt)=>
      one('select public.configure_creator_merch_variants($1,$2,$3,$4)',[id,mode,items,revision]);
    await claim(other,os);await assert.rejects(()=>configure(),/(not_found|changed_reload)/);
    await assert.rejects(()=>one('select * from public.merch_product_variants'),/permission denied/);
    await claim(host,hs);
    await assert.rejects(()=>configure([{...variants[0],priceMinor:10}]),/variants_invalid/);
    await assert.rejects(()=>configure([variants[0],{...variants[1],sku:'tee-s-red'}]),/unique constraint/);
    product=await configure();assert.equal(product.variantMode,'options');assert.equal(product.stockQuantity,6);
    assert.equal(product.variants.length,2);assert.equal(product.priceMinor,1000);
    await assert.rejects(()=>configure(variants,'options','2000-01-01T00:00:00Z'),/changed_reload/);
    await assert.rejects(()=>configure([variants[0]]),/archive_instead_of_delete/);
    // A normal description/price save cannot replace aggregate option inventory.
    product=await save([id,'Option tee','Sandbox options',null,1000,999,'published',product.updatedAt]);
    assert.equal(product.stockQuantity,6);
    // Managed Storage supplies only the immutable object catalog fixture. Asset
    // registration, binding, scan jobs and review all use real production SQL.
    const asset=randomUUID(),photoKey=`${host}/merch_product_image/${asset}.png`;
    await admin();
    await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'platform-brand-assets',$2,'sku-photo-v1','{\"size\":79,\"mimetype\":\"image/png\"}')",[randomUUID(),photoKey]);
    await claim(host,hs);
    await db.query("insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,'merch_product_image',$3,$3,'image/png',79)",[asset,host,photoKey]);
    product=await one('select public.assign_merch_product_photo($1,$2,$3)',[id,asset,product.updatedAt]);
    assert.equal(product.photoAssetId,asset);
    await admin();
    const photoJob=await one("select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=$1",[asset]);
    await db.query('update public.media_scan_jobs set priority=-2147483648 where id=$1',[photoJob]);
    await one("select public.claim_media_scan_jobs(1,'sku-photo-clean')");
    assert.equal((await one("select public.complete_media_scan_job($1,'clean','clamav','fixture','fixture',null,null,1)",[photoJob])).targetPropagationComplete,true);
    await claim(host,hs);
    product=await one('select public.read_creator_merch_photo_status($1)',[id]);
    product=await one('select public.approve_creator_merch_photo($1,$2,$3)',[id,asset,product.updatedAt]);
    await claim(buyer,bs);assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),true);
    const shownPrices=new Map();
    const reserve=async(variant,attempt=randomUUID(),quantity=1,user=buyer,session=bs)=>{
      const expectedPrice=shownPrices.get(attempt)??product.priceMinor;
      await admin();const reserved=await one('select public.reserve_merch_checkout_dispatch($1,$2,$3,$4,$5,$6,$$tracked$$,$7,$$usd$$)',[user,session,id,quantity,attempt,variant,expectedPrice]);
      shownPrices.set(attempt,reserved.priceMinor);return reserved;
    };
    await assert.rejects(()=>reserve(null),/variant_unavailable/);
    await assert.rejects(()=>reserve(randomUUID()),/variant_unavailable/);
    const attempt=randomUUID();const order=await reserve(small,attempt);
    assert.equal(order.sku,'TEE-S-RED');assert.equal(order.size,'S');assert.equal(order.color,'Red');assert.equal(order.priceMinor,1000);
    assert.equal((await reserve(small,attempt)).id,order.id);
    // Prospective no-dispatch cancellation restores both SKU and aggregate
    // counts once; transaction rollback restores the exact pending reservation.
    // UUID wire casing must not turn a valid reservation into an uncleanable
    // hold. Compare UUID identity, not its textual capitalization.
    const request={productId:id.toUpperCase(),quantity:1,variantId:small.toUpperCase(),trackingMode:'tracked',unitPriceMinor:1000,currency:'usd'};
    for(const key of ['productId','variantId']){
      await assert.rejects(()=>one('select public.transition_merch_checkout_dispatch($1,$2,$3,$$abort$$,$4)',[buyer,bs,attempt,JSON.stringify({...request,[key]:'not-a-uuid'})]),/uuid/);
      assert.equal((await one('select public.transition_merch_checkout_dispatch($1,$2,$3,$$abort$$,$4)',[buyer,bs,attempt,JSON.stringify({...request,[key]:randomUUID()})])).aborted,false);
      assert.equal(await one('select reserved_quantity from public.merch_product_variants where id=$1',[small]),1);
      assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),1);
    }
    await db.exec('begin');
    for(let duplicate=0;duplicate<2;duplicate++){
      assert.equal((await one('select public.transition_merch_checkout_dispatch($1,$2,$3,$$abort$$,$4)',[buyer,bs,attempt,JSON.stringify(request)])).aborted,true);
      assert.equal(await one('select reserved_quantity from public.merch_product_variants where id=$1',[small]),0);
      assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),0);
    }
    await db.exec('rollback');assert.equal(await one('select reserved_quantity from public.merch_product_variants where id=$1',[small]),1);
    await assert.rejects(()=>reserve(large,attempt),/attempt_conflict/);
    await assert.rejects(()=>reserve(large),/existing_pending_order/);
    await assert.rejects(()=>reserve(small,randomUUID(),1,other,os),/sold_out/);
    const otherOrder=await reserve(large,randomUUID(),2,other,os);
    assert.equal(await one('select reserved_quantity from public.merch_product_variants where id=$1',[small]),1);
    assert.equal(await one('select reserved_quantity from public.merch_product_variants where id=$1',[large]),2);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),3);
    await claim(host,hs);
    product=(await one('select public.list_creator_merch_products(null,true)')).products[0];
    await assert.rejects(()=>configure(variants,'simple'),/has_reserved_stock/);
    await assert.rejects(()=>configure([{...variants[0],stockQuantity:0},variants[1]]),/below_reserved/);
    variants[0]={...variants[0],sku:'TEE-S-RENAMED',color:'Scarlet',status:'paused'};
    product=await configure();
    await claim(buyer,bs);
    let visible=(await one('select public.list_creator_merch_products($1)',[host])).products[0];
    assert.equal(visible.variants.length,1);assert.equal(visible.availableQuantity,3);
    let projected=(await one('select public.list_my_merch_orders()')).orders[0];
    assert.equal(projected.variantId,small);assert.equal(projected.sku,'TEE-S-RED');assert.equal(projected.color,'Red');
    assert.equal(projected.checkoutResumeAvailable,false);
    await assert.rejects(()=>reserve(small,attempt),/variant_unavailable/);
    await claim(host,hs);variants[0].status='active';product=await configure();
    product=await save([id,'Renamed tee','Sandbox options',null,2000,0,'published',product.updatedAt]);
    assert.equal((await reserve(small,attempt)).priceMinor,1000);
    assert.equal((await reserve(small,attempt)).sku,'TEE-S-RED');
    // Seller revocation denies owner published option mutation and buyer checkout.
    await db.query("update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1 and capability='creator_money'",[host]);
    await claim(host,hs);await assert.rejects(()=>configure(),/creator|legal|authority/);
    await admin();await db.query("update public.wave1_legal_acceptances set invalidated_at=null where user_id=$1 and capability='creator_money'",[host]);
    // Quarantine the attached photo while real SKU orders are pending. The
    // following signed-facts expiry/late-payment flows must still reconcile
    // both the exact SKU and aggregate inventory, without direct stock writes.
    await one("select public.enqueue_media_scan_job('platform_brand_assets','merch_product_image',$1,$2,'supabase','platform-brand-assets',$3,'image/png',79,-2147483648,'{}')",[asset,host,photoKey]);
    await one("select public.claim_media_scan_jobs(1,'sku-photo-quarantine')");
    assert.equal((await one("select public.complete_media_scan_job($1,'malware_detected','clamav','fixture','fixture','fixture-detection',null,1)",[photoJob])).targetPropagationComplete,true);
    await claim(buyer,bs);assert.equal(await one('select public.merch_photo_public_access_allowed($1)',[asset]),false);
    await admin();assert.equal(await one('select photo_asset_id from public.merch_products where id=$1',[id]),asset,'quarantine keeps the exact retained reference');
    const stock=async key=>one('select reserved_quantity from public.merch_product_variants where id=$1',[key]);
    await db.query("update public.merch_orders set stripe_checkout_session_id='cs_test_sku_expiry',stripe_payment_intent_id='pi_sku_expiry' where id=$1",[order.id]);
    const facts={event_livemode:false,object_livemode:false,object_id:'cs_test_sku_expiry',object_type:'checkout.session',
      payment_intent_id:'pi_sku_expiry',metadata_order_id:order.id,client_reference_id:order.id,mode:'payment',status:'expired',payment_status:'unpaid',amount_minor:1000,currency:'usd'};
    const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
    const event=(key,type,body)=>one('select public.process_stripe_merch_webhook_lifecycle($1,$2,$3,$4)',[key,type,hash(body),body]);
    assert.equal((await event('evt_sku_expired','checkout.session.expired',facts)).status,'processed');
    assert.equal(await stock(small),0);assert.equal(await stock(large),2);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),2,'quarantined photo cannot strand expiry release');
    await event('evt_sku_expired','checkout.session.expired',facts);assert.equal(await stock(small),0);
    // Consume exactly the released small option. Large option still has stock:
    // a late payment must not borrow its inventory.
    await reserve(small);
    const paid={...facts,status:'complete',payment_status:'paid'};
    await event('evt_sku_late','checkout.session.completed',paid);
    assert.equal(await one('select payment_status from public.merch_orders where id=$1',[order.id]),'paid');
    assert.equal(await one('select fulfillment_status from public.merch_orders where id=$1',[order.id]),'blocked');
    assert.equal(await stock(small),1);assert.equal(await stock(large),2);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),3);
    await claim(host,hs);product=(await one('select public.list_creator_merch_products(null,true)')).products[0];
    variants[0].stockQuantity=2;product=await configure();
    await admin();
    await assert.rejects(()=>one("select public.process_stripe_merch_webhook_lifecycle('evt_sku_late','checkout.session.completed',$1,$2)",['f'.repeat(64),paid]),/identity_conflict/);
    assert.equal(await stock(small),1);
    await event('evt_sku_late','checkout.session.completed',paid);assert.equal(await stock(small),2);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),4,'quarantined photo cannot strand exact-SKU late-payment recovery');
    assert.equal(await one('select reservation_released_at from public.merch_orders where id=$1',[order.id]),null);
    // Refund accounting never assumes a physical return and never restocks.
    const refund={...paid,object_id:'ch_sku_refund',object_type:'charge',refunded_amount_minor:1000,refunded:true};
    assert.equal((await event('evt_sku_refund','charge.refunded',refund)).status,'processed');
    assert.equal(await one('select refunded_amount_minor from public.merch_orders where id=$1',[order.id]),1000);
    await event('evt_sku_late','checkout.session.completed',paid);assert.equal(await stock(small),2);
    assert.equal(await stock(large),2);
    // Safety removal detaches the quarantined asset but preserves retention.
    // Exercise another actual order's expiry + late payment after detachment.
    await claim(host,hs);await one("select public.review_platform_brand_asset($1,'archive','SKU photo safety-removal regression')",[asset]);
    const removedPhoto=await one('select public.read_creator_merch_photo_status($1)',[id]);
    assert.equal(removedPhoto.photoAssetId,null);assert.equal(removedPhoto.photoStatus,'blocked');
    await admin();
    assert.equal(await one('select count(*)::int from private.platform_brand_object_incarnations where asset_id=$1 and removed_at is not null and retain_until=removed_at+interval \'720 hours\'',[asset]),1);
    await db.query("update public.merch_orders set stripe_checkout_session_id='cs_test_sku_removed_photo',stripe_payment_intent_id='pi_sku_removed_photo' where id=$1",[otherOrder.id]);
    const removedFacts={...facts,object_id:'cs_test_sku_removed_photo',payment_intent_id:'pi_sku_removed_photo',metadata_order_id:otherOrder.id,client_reference_id:otherOrder.id,amount_minor:2000};
    assert.equal((await event('evt_sku_removed_expiry','checkout.session.expired',removedFacts)).status,'processed');
    assert.equal(await stock(large),0);assert.equal(await stock(small),2);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),2);
    const removedPaid={...removedFacts,status:'complete',payment_status:'paid'};
    assert.equal((await event('evt_sku_removed_late','checkout.session.completed',removedPaid)).status,'processed');
    assert.equal(await stock(large),2);assert.equal(await stock(small),2);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),4);
    assert.equal(await one('select reservation_released_at from public.merch_orders where id=$1',[otherOrder.id]),null);
    await event('evt_sku_removed_late','checkout.session.completed',removedPaid);assert.equal(await stock(large),2);
    await claim(host,hs);product=(await one('select public.list_creator_merch_products(null,true)')).products[0];
    variants[0].status='archived';product=await configure();
    assert.equal(product.variants.find(v=>v.id===small).status,'archived');
    await claim(buyer,bs);assert.equal((await one('select public.list_my_merch_orders()')).orders.find(o=>o.id===order.id).sku,'TEE-S-RED');
    // Released simple-order history also blocks changing inventory identity.
    await claim(host,hs);
    const simple=await save([randomUUID(),'Simple history','',null,1000,1,'published',null]);
    await admin();const simpleOrder=await one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[other,os,simple.id,randomUUID()]);
    await db.query("update public.merch_orders set stripe_checkout_session_id='cs_test_simple_history' where id=$1",[simpleOrder.id]);
    await event('evt_simple_history','checkout.session.expired',{...facts,object_id:'cs_test_simple_history',payment_intent_id:null,metadata_order_id:simpleOrder.id,client_reference_id:simpleOrder.id});
    await claim(host,hs);const current=(await one('select public.list_creator_merch_products(null,true)')).products.find(p=>p.id===simple.id);
    await assert.rejects(()=>one('select public.configure_creator_merch_variants($1,$2,$3,$4)',[simple.id,'options',[{...variants[0],id:randomUUID()}],current.updatedAt]),/has_order_history/);
    await admin();
    assert.equal(await one("select relrowsecurity and relforcerowsecurity from pg_class where oid='public.merch_product_variants'::regclass"),true);
    for(const role of ['anon','authenticated','service_role'])assert.equal(await one("select has_table_privilege($1,'public.merch_product_variants','insert')",[role]),false);
    assert.equal(await one("select has_function_privilege('authenticated','public.reserve_merch_checkout(uuid,integer,uuid,uuid)','execute')"),false);
    t.diagnostic('Full-schema PGlite with actual SKU/session/eligibility functions, not a model of SQL. Serialized database tests do not prove native multi-connection concurrency.');
  } finally { await db.close(); }
});
