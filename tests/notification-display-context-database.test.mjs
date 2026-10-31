import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('own-inbox context binds real session, identity, target and current privacy without rewriting history',{timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const as=async(role,actor,fn)=>{await db.exec('begin');try{
  await db.exec(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({role,sub:actor?.user_id,session_id:actor?.session_id}),'{"x-chillywood-platform":"ios"}']);
  return await fn();
 }finally{await db.exec('rollback');}};
 try{
  await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
  const creator=await one("select * from event_reservation_fixture.actors where kind='creator'");
  const buyer=await one("select * from event_reservation_fixture.actors where kind='buyer1'");
  const other=await one("select * from event_reservation_fixture.actors where kind='buyer2'");
  const event=await one("select * from event_reservation_fixture.events where name='show1'");
  await db.query("update public.creator_events set visibility='public' where id=$1",[event.id]);
  await db.query(`insert into public.user_profiles(user_id,username,display_name) values($1,'exact_creator','Shared Name'),($2,'buyer_one','Buyer') on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name`,[creator.user_id,buyer.user_id]);
  const ids=[];
  for(const [type,route,target] of [
    ['vip_access_active','/vip-pass/[creatorId]',creator.user_id],
    ['channel_subscription_active','/channel-subscription/[creatorId]',creator.user_id],
    ['event_pass_active','/event/[eventId]',event.id],
    ['auction_won','/event/[eventId]',event.id],
    ['vip_access_active','/event/[eventId]',event.id],
    ['event_pass_active','/event/[eventId]','00000000-0000-4000-8000-000000000001'],
  ]) ids.push((await one(`insert into public.notifications(user_id,category,notification_type,title,body,target_route,target_entity_id,created_at,target_context)
    values($1,'creator_money_purchase',$2,'VIP Pass active','Generic old text',$3,$4,'2026-07-05T12:00:00Z','{"creatorName":"Forged"}') returning id`,[buyer.user_id,type,route,target])).id);
  await db.query('insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2)',[buyer.user_id,creator.user_id]);
  const social=await one(`select a.id,private.resolve_social_notification_activity(a) plan from public.notification_activity_events a
    where event_kind='social_follow' and actor_user_id=$1 and recipient_user_id=$2`,[creator.user_id,buyer.user_id]);
  assert.equal(social.plan.eligible,true);
  const socialId=(await one(`insert into public.notifications(user_id,actor_user_id,category,notification_type,title,target_route,target_entity_id)
    values($1,$2,$3,'social_follow','Legacy follow',$4,$5) returning id`,[buyer.user_id,creator.user_id,social.plan.category,social.plan.target_route,social.plan.target_entity_id])).id;
  await db.query('update public.notification_activity_events set notification_id=$1 where id=$2',[socialId,social.id]);
  const foreign=(await one(`insert into public.notifications(user_id,category,notification_type,title,target_route,target_entity_id) values($1,'creator_money_purchase','vip_access_active','Other','/vip-pass/[creatorId]',$2) returning id`,[other.user_id,creator.user_id])).id;
  const read=async(actor=buyer,requested=ids)=>as('authenticated',actor,async()=> (await one('select public.read_my_notification_display_context($1::uuid[]) result',[requested])).result);
  assert.equal((await read(buyer,[socialId])).items[0].creatorName,'Shared Name (@exact_creator)','social actor requires exact producer linkage');
  await db.query('update public.notification_activity_events set notification_id=null where id=$1',[social.id]);
  assert.equal((await read(buyer,[socialId])).items[0].resolution,'unavailable','unlinked social actor is not guessed');
  await db.query('update public.notification_activity_events set notification_id=$1 where id=$2',[socialId,social.id]);
  let result=await read(buyer,[...ids,foreign]);
  assert.equal(result.schemaVersion,1);assert.equal(result.items.length,6);
  const byId=Object.fromEntries(result.items.map(i=>[i.notificationId,i]));
  assert.equal(byId[ids[0]].creatorName,'Shared Name (@exact_creator)');
  assert.equal(byId[ids[0]].targetId,creator.user_id);assert.equal(byId[ids[0]].resolution,'resolved');
  assert.equal(byId[ids[2]].targetTitle,'Sunday at 8 – show1');
  assert.equal(byId[ids[3]].targetTitle,'Sunday at 8 – show1');
  assert.equal(byId[ids[4]].resolution,'unavailable','type/route mismatch never hydrates');
  assert.equal(byId[ids[5]].resolution,'unavailable','deleted/missing target never guessed');
  assert.equal((await read(other)).items.length,0);
  await assert.rejects(read({...buyer,session_id:other.session_id}),/notification_display_current_session_required/);
  await assert.rejects(as('anon',null,()=>one('select public.read_my_notification_display_context($1::uuid[])',[ids])),/permission denied/);
  await assert.rejects(read(buyer,Array(101).fill(ids[0])),/notification_display_batch_too_large/);
  await assert.rejects(as('authenticated',buyer,()=>one('select public.read_creator_money_notification_display_context($1,$2,$3)',[ids[0],buyer.user_id,'vip_access_active'])),/permission denied/);
  await assert.rejects(as('authenticated',buyer,()=>one("select private.notification_target_display($1,'/channel/[userId]',$2)",[buyer.user_id,creator.user_id])),/permission denied/);
  // A real full-schema purchase intent and provider ledger exercise push-only
  // recipients without an inbox row. No provider is contacted.
  const video='ad110000-0000-4000-8000-000000000001';
  await db.query(`insert into public.videos(id,owner_id,title,visibility,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
    values($1,$2,'Exact paid film','public','cloudflare_r2','chillywood-media-origin',$3,$3,'video/mp4',1024)`,[video,creator.user_id,`${creator.user_id}/${video}/source.mp4`]);
  await db.query("update public.videos set scan_status='clean',scan_provider='fixture',scanned_at=now() where id=$1",[video]);
  const price=(await one("select price from public.creator_money_supported_prices_internal('paid_content',null,'sandbox') price limit 1")).price;
  const product=await one('select * from public.monetization_products where provider=$1 and provider_product_id=$2 and product_type=$3 limit 1',[price.provider,price.providerProductId,'paid_content_access']);
  const intent=await one(`insert into public.money_purchase_intents(user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,session_generation)
    values($1,$2,$3,$4,$5,$6,'paid_content',$7,$8,'sandbox','pending',$9,$10,'notification-display-ledger-fixture',now()+interval '15 minutes',$11) returning id`,
    [buyer.user_id,product.id,product.product_key,product.product_type,price.provider,price.providerProductId,video,creator.user_id,price.amountMinor,price.currency,buyer.session_id]);
  const provider=await one(`insert into public.provider_events(provider_event_id,provider,product_id,product_key,user_id,environment,event_type,status,idempotency_key)
    values('notification-display-provider',$1,$2,$3,$4,'sandbox','INITIAL_PURCHASE','processed','notification-display-provider') returning id`,[price.provider,product.id,product.product_key,buyer.user_id]);
  const ledger=await one(`insert into public.money_access_ledger_events(user_id,creator_id,product_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,source_id,metadata)
    values($1,$2,$3,$4,'INITIAL_PURCHASE',$5,$6,'sandbox','not_payable','sandbox_only','paid_content',$7,jsonb_build_object('purchase_intent_id',$8::text)) returning id`,[buyer.user_id,creator.user_id,product.id,provider.id,price.amountMinor,price.currency,video,intent.id]);
  const receipt=async(recipient,type)=>as('service_role',null,async()=> (await one('select public.read_creator_money_notification_display_context($1,$2,$3) result',[ledger.id,recipient,type])).result);
  const paid=await receipt(buyer.user_id,'paid_video_unlocked');
  assert.equal(paid.version,1);assert.equal(paid.subject_title,'Exact paid film');assert.equal(paid.target_id,video);
  assert.equal(paid.creator_display_name,'Shared Name (@exact_creator)');
  assert.equal((await receipt(creator.user_id,'paid_video_sold')).target_id,creator.user_id);
  assert.deepEqual(await receipt(other.user_id,'paid_video_unlocked'),{});
  assert.deepEqual(await receipt(buyer.user_id,'vip_access_active'),{});
  assert.deepEqual(await receipt(buyer.user_id,'creator_money_refunded'),{});
  await db.query("update public.videos set visibility='draft' where id=$1",[video]);
  assert.equal((await receipt(buyer.user_id,'paid_video_unlocked')).subject_title,null,'non-public service content gets no private title');
  await db.query("update public.videos set visibility='public' where id=$1",[video]);
  await db.query("update public.money_access_ledger_events set status='refunded',event_type='REFUND' where id=$1",[ledger.id]);
  assert.equal((await receipt(buyer.user_id,'creator_money_refunded')).target_id,video);
  assert.equal((await receipt(creator.user_id,'creator_money_refunded')).target_route,'/channel-studio');
  assert.deepEqual(await receipt(buyer.user_id,'creator_money_revoked'),{});
  assert.deepEqual(await receipt(buyer.user_id,'paid_video_unlocked'),{},'refund ledger cannot masquerade as purchase confirmation');
  await db.query("update public.money_access_ledger_events set status='sandbox_only',event_type='INITIAL_PURCHASE' where id=$1",[ledger.id]);
  const sold=(await one(`insert into public.notifications(user_id,category,notification_type,title,target_route,target_entity_id,target_context)
    values($1::uuid,'creator_money_sale','paid_video_sold','Old sale','/channel-studio',$1::text,jsonb_build_object('ledger_event_id',$2::text)) returning id`,[creator.user_id,ledger.id])).id;
  assert.equal((await read(creator,[sold])).items[0].targetTitle,'Exact paid film','historical creator sale resolves verified exact item');
  await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_title)
    values('EXACT-CONTEXT-STAGE',$1,'live','public','Exact Chicago Stage')`,[creator.user_id]);
  const seatIds=[];
  for(const type of ['live_watch_party_seat_requested','live_watch_party_seat_approved','live_watch_party_seat_rejected']){
    seatIds.push((await one(`insert into public.notifications(user_id,category,notification_type,title,target_route,target_entity_id)
      values($1,'access_granted',$2,'Old seat','/watch-party/live-stage/[partyId]','EXACT-CONTEXT-STAGE') returning id`,[creator.user_id,type])).id);
  }
  const seats=(await read(creator,seatIds)).items;
  assert.equal(seats.length,3);assert.ok(seats.every(i=>i.targetTitle==='Exact Chicago Stage'&&i.creatorName==='Shared Name (@exact_creator)'));
  await db.query("update public.user_profiles set profile_access_visibility='private' where user_id=$1",[creator.user_id]);
  assert.equal((await read(buyer,[socialId])).items[0].resolution,'unavailable','historical social names disappear when actor becomes private');
  assert.deepEqual(await receipt(buyer.user_id,'paid_video_unlocked'),{},'service never uses operator/session to expose private profiles');
  assert.equal((await read()).items.every(i=>i.resolution==='unavailable'),true,'private profile labels and associated title not leaked');
  await db.query("update public.user_profiles set profile_access_visibility='public',display_name=E'Shared\\nName'||chr(8238) where user_id=$1",[creator.user_id]);
  assert.equal((await read()).items.find(i=>i.notificationId===ids[0]).creatorName,'Shared Name (@exact_creator)');
  await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)',[buyer.user_id,creator.user_id]);
  assert.deepEqual(await receipt(buyer.user_id,'paid_video_unlocked'),{},'service respects explicit recipient blocks');
  assert.equal((await read()).items.every(i=>i.resolution==='unavailable'),true,'recipient block hides source and creator');
  await db.query('delete from public.channel_audience_blocks where channel_user_id=$1',[buyer.user_id]);
  await db.query('update public.notifications set dismissed_at=now() where id=$1',[ids[0]]);
  assert.equal((await read()).items.some(i=>i.notificationId===ids[0]),false);
  const unchanged=await one('select title,body,created_at from public.notifications where id=$1',[ids[2]]);
  assert.equal(unchanged.title,'VIP Pass active');assert.equal(unchanged.body,'Generic old text');
  assert.equal(new Date(unchanged.created_at).toISOString(),'2026-07-05T12:00:00.000Z');
  assert.deepEqual(await as('service_role',null,async()=> (await one('select public.read_creator_money_notification_display_context($1,$2,$3) result',[ids[0],buyer.user_id,'vip_access_active'])).result),{});
 }finally{await db.close();}
});
