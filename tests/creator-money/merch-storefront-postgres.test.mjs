import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('merch catalog and orders use real session, creator, stock and participant authority', {timeout:240000}, async t=>{
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
    await db.query("insert into public.beta_access_memberships(user_id,access_status) values($1,'active')",[buyer]);
    await claim(host,hs);
    const id=randomUUID();
    const save=(args)=>one('select public.save_creator_merch_product_with_tracking($1,$2,$3,$4,$5,$6,$7,$8,$$tracked$$)',args);
    let product=await save([id,'Test tee','Physical test only',null,1000,2,'published',null]);
    assert.equal(product.id,id);assert.equal(product.checkoutAvailable,false);
    assert.equal((await save([id,'Test tee','Physical test only',null,1000,2,'published',null])).id,id);
    await assert.rejects(()=>save([id,'Conflict','Physical test only',null,1000,2,'published',null]),/changed_reload/);
    assert.equal((await one('select public.list_creator_merch_products(null,true,null,20)')).products.length,1);
    await claim(other,os);
    assert.deepEqual((await one('select public.list_creator_merch_products($1)',[host])).products,[],'non-beta buyers cannot discover sandbox listings');
    await assert.rejects(()=>save([id,'Stolen','',null,1000,2,'draft',product.updatedAt]),/(not_found|changed_reload)/);
    await assert.rejects(()=>one('select public.reserve_merch_checkout($1,1,$2)',[id,randomUUID()]),/permission denied/);
    await admin();
    await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[other,os,id,randomUUID()]),/sandbox_tester_required/);
    await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,os,id,randomUUID()]),/current_session_required/);
    await claim(buyer,bs);
    assert.equal((await one('select public.list_creator_merch_products($1)',[host])).products[0].checkoutAvailable,true);
    await admin();await db.query("update public.user_profiles set platform_access_visibility='private' where user_id=$1",[host]);
    await claim(buyer,bs);await assert.rejects(()=>one('select public.list_creator_merch_products($1)',[host]),/platform_unavailable/);
    await admin();await db.query("update public.user_profiles set platform_access_visibility='public' where user_id=$1",[host]);
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)',[host,buyer]);
    await claim(buyer,bs);await assert.rejects(()=>one('select public.list_creator_merch_products($1)',[host]),/platform_unavailable/);
    await admin();await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,bs,id,randomUUID()]),/platform_unavailable/);
    await db.query('delete from public.channel_audience_blocks where channel_user_id=$1 and blocked_user_id=$2',[host,buyer]);
    await db.query("update public.wave1_legal_acceptances set invalidated_at=now() where user_id=$1 and capability='creator_money'",[host]);
    await claim(buyer,bs);assert.equal((await one('select public.list_creator_merch_products($1)',[host])).products[0].checkoutAvailable,false);
    await admin();await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,bs,id,randomUUID()]),/creator_not_ready/);
    await db.query("update public.wave1_legal_acceptances set invalidated_at=null where user_id=$1 and capability='creator_money'",[host]);
    await claim(buyer,bs);
    const attempt=randomUUID();
    await admin();
    const inventoryBefore=await one('select to_jsonb(p) from public.merch_products p where id=$1',[id]);
    await db.exec('set role service_role');
    await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$untracked$$,1000,$$usd$$)',[buyer,bs,id,randomUUID()]),/declaration_changed/);
    await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,999,$$usd$$)',[buyer,bs,id,randomUUID()]),/displayed_price_changed/);
    await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$eur$$)',[buyer,bs,id,randomUUID()]),/displayed_price_changed/);
    for(const args of ['$1,$2,$3,1,$4','$1,$2,$3,1,$4,null'])await assert.rejects(()=>one(`select public.reserve_merch_checkout_for_actor(${args})`,[buyer,bs,id,randomUUID()]),/permission denied/);
    await db.exec('reset role');
    assert.deepEqual(await one('select to_jsonb(p) from public.merch_products p where id=$1',[id]),inventoryBefore,'stale buyer declaration rolls back the whole inventory row');
    await claim(buyer,bs);
    const reserve=async(quantity=1,key=attempt)=>{
      await admin();
      try { return await one('select public.reserve_merch_checkout_dispatch($1,$2,$3,$4,$5,null,$$tracked$$,1000,$$usd$$)',[buyer,bs,id,quantity,key]); }
      finally { await claim(buyer,bs); }
    };
    const order=await reserve();assert.equal((await reserve()).id,order.id);
    assert.equal(order.shippingTrackingMode,'tracked');assert.equal(order.returnPolicyVersion,'physical_merch_declared_tracked_30d_v2');
    assert.equal(order.netSharePolicyVersion,"physical_merch_net_90_10_v1");assert.equal(order.platformNetShareBps,1000);assert.equal(order.creatorNetShareBps,9000);assert.deepEqual(await reserve(),order,"retry preserves accepted terms");
    const resumable=(await one('select public.list_my_merch_orders()')).orders[0];
    assert.equal(resumable.checkoutAttemptId,attempt);assert.equal(resumable.checkoutResumeAvailable,true);
    assert.ok(resumable.checkoutExpiresAt);
    await admin();assert.notEqual(await one('select updated_at from public.merch_products where id=$1',[id]),product.updatedAt);
    await db.query("update public.merch_orders set created_at=now()-interval '2 hours' where id=$1",[order.id]);
    await claim(buyer,bs);assert.equal((await one('select public.list_my_merch_orders()')).orders[0].checkoutResumeAvailable,false);
    await assert.rejects(()=>reserve(),/attempt_closed/);
    await admin();await db.query('update public.merch_orders set created_at=now() where id=$1',[order.id]);await claim(buyer,bs);
    await assert.rejects(()=>reserve(2),/attempt_conflict/);
    await assert.rejects(()=>reserve(1,randomUUID()),/existing_pending_order/);
    await admin();await db.query("insert into public.beta_access_memberships(user_id,access_status) values($1,'active')",[other]);
    await assert.rejects(()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,2,$4,null,$$tracked$$,1000,$$usd$$)',[other,os,id,randomUUID()]),/sold_out/);
    const otherOrder=await one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[other,os,id,randomUUID()]);
    await claim(host,hs);const pageProduct=await save([randomUUID(),'Another product','Physical test only',null,1000,10,'published',null]);
    await admin();const secondOrder=await one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,bs,pageProduct.id,randomUUID()]);
    await claim(buyer,bs);
    assert.equal((await one("select public.list_my_merch_orders('buyer',null,1)")).orders.length,1);
    const page=await one("select public.list_my_merch_orders('buyer',null,1)");assert.ok(page.nextCursor);
    assert.equal(page.orders[0].id,secondOrder.id);
    const next=await one("select public.list_my_merch_orders('buyer',$1,1)",[page.nextCursor]);assert.equal(next.orders.length,1);assert.notEqual(next.orders[0].id,page.orders[0].id);
    await admin();
    await db.query("update public.merch_orders set stripe_checkout_session_id='cs_test_merch_expiry',stripe_payment_intent_id='pi_merch_expiry' where id=$1",[order.id]);
    const facts={event_livemode:false,object_livemode:false,object_id:'cs_test_merch_expiry',object_type:'checkout.session',
      payment_intent_id:'pi_merch_expiry',metadata_order_id:order.id,client_reference_id:order.id,mode:'payment',status:'expired',payment_status:'unpaid',amount_minor:1000,currency:'usd'};
    const hash=createHash('sha256').update(JSON.stringify(facts)).digest('hex');
    const expire=()=>one("select public.process_stripe_merch_webhook_lifecycle('evt_merch_stock_expiry','checkout.session.expired',$1,$2)",[hash,facts]);
    assert.equal((await expire()).status,'processed');
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),1);
    await expire();assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),1);
    assert.ok(await one('select reservation_released_at from public.merch_orders where id=$1',[order.id]));
    await claim(buyer,bs);
    await claim(other,os);assert.deepEqual((await one('select public.list_my_merch_orders()')).orders.map(o=>o.id),[otherOrder.id]);
    await assert.rejects(()=>one("select public.list_my_merch_orders('buyer',$1,1)",[order.id]),/cursor_unavailable/);
    await assert.rejects(()=>one("select public.update_creator_merch_fulfillment($1,'processing','not_started')",[order.id]),/(not_found|changed_reload)/);
    await claim(host,hs);
    assert.equal((await one("select public.list_my_merch_orders('creator')")).orders.length,3);
    assert.equal((await one("select public.list_my_merch_orders('creator')")).orders[0].checkoutAttemptId,null);
    await assert.rejects(()=>one("select public.update_creator_merch_fulfillment($1,'processing','not_started')",[order.id]),/not_available/);
    const paidOrder=page.orders[0].id===order.id?next.orders[0].id:page.orders[0].id;
    await admin();await db.query("update public.merch_orders set payment_status='paid',order_status='paid' where id=$1",[paidOrder]);
    await claim(host,hs);
    assert.equal((await one("select public.update_creator_merch_fulfillment($1,'processing','not_started')",[paidOrder])).fulfillmentStatus,'processing');
    await assert.rejects(()=>one("select public.update_creator_merch_fulfillment($1,'delivered','processing')",[paidOrder]),/transition_invalid/);
    await admin();await db.query('update public.merch_orders set refunded_amount_minor=100 where id=$1',[paidOrder]);
    await claim(host,hs);await assert.rejects(()=>one("select public.update_creator_merch_fulfillment($1,'shipped','processing')",[paidOrder]),/not_available/);
    // A delayed success after a verified expiry must preserve paid truth without
    // allocating stock that a later checkout already consumed.
    await claim(buyer,bs);await reserve(1,randomUUID());
    await admin();const late={...facts,status:'complete',payment_status:'paid'};
    const lateHash=createHash('sha256').update(JSON.stringify(late)).digest('hex');
    await one("select public.process_stripe_merch_webhook_lifecycle('evt_merch_late_success','checkout.session.completed',$1,$2)",[lateHash,late]);
    assert.equal(await one('select payment_status from public.merch_orders where id=$1',[order.id]),'paid');
    assert.equal(await one('select fulfillment_status from public.merch_orders where id=$1',[order.id]),'blocked');
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),2);
    await db.query('update public.merch_products set stock_quantity=3 where id=$1',[id]);
    const ignored=await one("select public.process_stripe_merch_webhook_lifecycle('evt_merch_late_success','checkout.session.completed',$1,$2)",[lateHash,{...late,event_livemode:true}]);
    assert.equal(ignored.status,'ignored');assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),2);
    await assert.rejects(()=>one("select public.process_stripe_merch_webhook_lifecycle('evt_merch_late_success','checkout.session.completed',$1,$2)",['a'.repeat(64),late]),/identity_conflict/);
    assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),2);
    await db.query('update public.merch_products set stock_quantity=2 where id=$1',[id]);
    await expire();assert.equal(await one('select reserved_quantity from public.merch_products where id=$1',[id]),2);
    await claim(host,hs);await assert.rejects(()=>one("select public.update_creator_merch_fulfillment($1,'processing','blocked')",[order.id]),/not_available/);
    product=(await one('select public.list_creator_merch_products(null,true)')).products.find(p=>p.id===id);
    await save([id,'Test tee','Physical test only',null,1000,2,'paused',product.updatedAt]);
    await claim(buyer,bs);await assert.rejects(()=>reserve(),/unavailable/);
    for(let n=0;n<3;n++){
      await claim(host,hs);const another=await save([randomUUID(),`More stock ${n}`,'Physical test only',null,1000,10,'published',null]);
      await admin();const create=()=>one('select public.reserve_merch_checkout_dispatch($1,$2,$3,1,$4,null,$$tracked$$,1000,$$usd$$)',[buyer,bs,another.id,randomUUID()]);
      if(n<2)await create();else await assert.rejects(create,/pending_order_limit/);
    }
    await admin();await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[bs]);
    await claim(buyer,bs);await assert.rejects(()=>one('select public.list_my_merch_orders()'),/current_session_required/);
    await admin();
    assert.equal(await one("select has_function_privilege('anon','public.reserve_merch_checkout(uuid,integer,uuid)','execute')"),false);
    assert.equal(await one("select has_table_privilege('authenticated','public.merch_products','insert')"),false);
    t.diagnostic('Real full migrated schema/session/eligibility/RLS; provider transport not invoked. PGlite serialized stock tests are not multi-connection concurrency proof.');
  } finally { await db.close(); }
});
