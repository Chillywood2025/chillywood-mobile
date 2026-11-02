import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomActor,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';
import {createNotificationActivityHandler} from '../supabase/functions/_shared/notification-activity-worker.mjs';

for (const paused of [false,true]) test(`actual ${paused?'paused public':'private'} paid Stage purchase/refund authority controls attendance delivery and retained inbox independently of membership`, {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 try{
  await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
  const actors=Object.fromEntries((await db.query('select * from event_reservation_fixture.actors')).rows.map(a=>[a.kind,{id:a.user_id,session:a.session_id}]));
  const as=(who,fn,role='authenticated')=>withLiveRoomActor(db,actors[who],fn,role);
  const rpc=(who,sql,args=[],role='authenticated')=>as(who,async()=>(await one(`select ${sql} value`,args)).value,role);
  for(const who of ['creator','buyer1','buyer2','buyer3'])await seedLiveRoomActor(db,actors[who]);
  await db.exec("update public.user_profiles set profile_access_visibility='public',display_name='Exact paid-stage person'; update public.platform_money_kill_switches set state='sandbox_only' where key='live_watch_party_access_enabled'");
  for(const viewer of ['buyer1','buyer3']){
   const [low,high]=[actors[viewer].id,actors.buyer2.id].sort();
   await db.query("insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status) values($1,$2,$1,'active')",[low,high]);
  }
  for(const who of ['creator','buyer1','buyer3'])await rpc(who,'public.set_person_notification_preferences($1,null,null,true,0)',[actors.buyer2.id]);
  const room='PAID-STAGE-NOTIFICATION';
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,join_policy,content_access_rule,discovery_title) values($1,$2,'live',$3,'open','open','Private paid Stage')",[room,actors.creator.id,paused?'public':'private']);
  const offer=await rpc('creator',"public.set_my_live_watch_party_offer($1,'live_watch_party_access_pass',true,'live_watch_party_access_pass_sandbox_099')",[room]);
  assert.equal(offer.status,'sandbox');
  const provider=async(who,type,event)=>rpc(who,`public.process_revenuecat_live_watch_party_event_atomic('revenuecat_google_play',$1,$2,$3,$4,'sandbox',clock_timestamp(),99,'usd',repeat('a',64),$5)`,
   [event,type,actors[who].id,offer.providerProductId,`notification-stage-original-${who}`],'service_role');
  assert.equal((await one('select public.resolve_live_watch_party_money_access_as_service_internal($1,$2) value',[room,actors.buyer1.id])).value.allowed,false);
  for(const who of ['buyer1','buyer2']){
   await rpc(who,'public.create_live_watch_party_purchase_intent($1)',[offer.offerId]);
   await provider(who,'NON_RENEWING_PURCHASE',`notification-stage-purchase-${who}`);
   assert.equal((await one('select public.resolve_live_watch_party_money_access_as_service_internal($1,$2) value',[room,actors[who].id])).value.allowed,true);
  }
  await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin
    insert into realtime.messages(extension,topic,payload,event,private,inserted_at,updated_at) values('broadcast',$3,$1,$2,$4,clock_timestamp(),clock_timestamp());
    insert into realtime.fixture_outbox values($1,$2,$3,$4);end$$;
    update private.discovery_invalidation_worker_config set collecting=true,enabled=true,token_sha256=repeat('a',64);
    insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('paid-stage-worker','sha256'),'hex'))
      on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256;`);
  await rpc('creator','public.join_watch_party_room_session($1)',[room]);
  if(paused){
   const r=await one('select * from public.watch_party_rooms where party_id=$1',[room]);
   const result=await rpc('creator','public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,null,null,false,false,true)',
    [room,r.room_generation,r.host_settings_revision,actors.creator.session,r.join_policy,r.discovery_visibility,r.discovery_title]);
   assert.equal(result.discoveryPaused,true);
   assert.equal(result.visibility,'public','listing pause retains its base admission audience');
  }
  for(const who of ['buyer1','buyer3','buyer2'])await rpc(who,'public.join_watch_party_room_session($1)',[room]);
  // Real membership can precede a separately required media-access purchase.
  // Execute the unmodified prior predicate under this buyer's actual JWT;
  // no authority gate is replaced for the negative control.
  await db.exec(`create function event_reservation_fixture.old_attendance(p_party text,p_actor uuid) returns boolean language sql security definer set search_path='' as $$
    select private.live_room_join_recipient_pre_paid_stage(r,p_actor,auth.uid()) from public.watch_party_rooms r where party_id=p_party$$;
    grant execute on function event_reservation_fixture.old_attendance(text,uuid) to authenticated;`);
  assert.equal((await one('select public.resolve_live_watch_party_money_access_as_service_internal($1,$2) value',[room,actors.buyer3.id])).value.allowed,false);
  assert.equal(await rpc('buyer3','event_reservation_fixture.old_attendance($1,$2)',[room,actors.buyer2.id]),true,
   'negative control proves current membership alone formerly qualified an unpaid recipient');
  await new Promise(resolve=>setTimeout(resolve,11000));
  await rpc('buyer2',"public.heartbeat_watch_party_room_session($1,'active',false,false)",[room]);
  const handler=createNotificationActivityHandler({adminClient:{async rpc(name,args){
   const result=await as('creator',()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
   return{data:name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value,error:null};
  }},fetchImpl:async()=>{throw new Error('no push token; no provider transport');}});
  assert.equal((await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'paid-stage-worker'}}))).status,200);
  const notices=(await db.query("select id,user_id from public.notifications where notification_type='live_room_member_joined' and target_entity_id=$1",[room])).rows;
  assert.deepEqual(notices.map(n=>n.user_id).sort(),[actors.creator.id,actors.buyer1.id].sort());
  const ownCount=()=>rpc('buyer1',"(select count(*)::int from public.notifications where notification_type='live_room_member_joined')");
  assert.equal(await ownCount(),1);
  const notice=notices.find(n=>n.user_id===actors.buyer1.id);
  assert.equal((await rpc('buyer1','public.read_my_notification_display_context($1)',[[notice.id]])).items[0].resolution,'resolved');
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await provider('buyer1','REFUND','notification-stage-refund-buyer1');
  assert.equal((await one('select public.resolve_live_watch_party_money_access_as_service_internal($1,$2) value',[room,actors.buyer1.id])).value.allowed,false);
  assert.equal((await one('select membership_state from public.watch_party_room_memberships where party_id=$1 and user_id=$2',[room,actors.buyer1.id])).membership_state,'removed','actual refund also retires membership; preserve that existing authority');
  assert.equal(await ownCount(),0);
  assert.equal((await rpc('buyer1','public.read_my_notification_display_context($1)',[[notice.id]])).items[0].resolution,'unavailable');
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where recipient_user_id=$1',[actors.buyer1.id])).n,0);
  const withdrawals=(await db.query('select * from realtime.fixture_outbox')).rows;
  assert.ok(withdrawals.some(h=>h.topic===`discovery:v1:viewer:${actors.buyer1.id}`));
  assert.ok(withdrawals.every(h=>h.topic.startsWith('discovery:v1:viewer:')),'private/paused paid attendance never broadcasts a public existence hint');
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[room]);
  assert.ok(!(await db.query('select * from realtime.fixture_outbox')).rows.some(h=>h.topic===`discovery:v1:viewer:${actors.buyer1.id}`));
 }finally{await db.close();}
});
