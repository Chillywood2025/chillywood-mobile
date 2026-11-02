import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';
import {createNotificationActivityHandler} from '../supabase/functions/_shared/notification-activity-worker.mjs';

test('actual private attendance delivery withdraws through exact recipient hints, never public discovery', {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const as=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
 try {
  await seedLiveRoomAuthority(db);
  for(const [name,actor] of Object.entries(actors))await db.query("update public.user_profiles set display_name=$2,username=$3,profile_access_visibility='public' where user_id=$1",[actor.id,`Private fixture ${name}`,`fixture_${name}`]);
  await db.query("insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status) values($1,$2,$1,'active')",[actors.friend.id,actors.follower.id]);
  for(const viewer of [actors.host,actors.friend])await as(viewer,()=>db.query('select public.set_person_notification_preferences($1,null,null,true,0)',[actors.follower.id]));
  // Managed Realtime is the only transport double. Application source gates,
  // producer, outbox, RLS, trigger and durable insertion confirmation are real.
  await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin
    insert into realtime.messages(extension,topic,payload,event,private,inserted_at,updated_at)
      values('broadcast',$3,$1,$2,$4,clock_timestamp(),clock_timestamp());
    insert into realtime.fixture_outbox values($1,$2,$3,$4);
  end$$;
  update private.discovery_invalidation_worker_config set collecting=true,enabled=true,token_sha256=repeat('a',64);
  insert into public.notification_activity_worker_config(singleton,enabled,token_sha256)
    values(true,true,encode(extensions.digest('private-attendance-worker','sha256'),'hex'))
    on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256;`);
  const room='PRIVATE-ATTENDANCE-HINT';
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,join_policy,content_access_rule,discovery_title) values($1,$2,'live','private','open','open','Unlisted private attendance')",[room,actors.host.id]);
  for(const actor of [actors.host,actors.friend,actors.follower])await as(actor,()=>db.query('select public.join_watch_party_room_session($1,$2)',[room,`Room ${actor.id.slice(-1)}`]));
  await new Promise(resolve=>setTimeout(resolve,11000));
  await as(actors.follower,()=>db.query("select public.heartbeat_watch_party_room_session($1,'active',false,false)",[room]));
  await db.exec("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind<>'live_room_member_joined' and status='pending'");
  const handler=createNotificationActivityHandler({adminClient:{async rpc(name,args){
   const result=await as(actors.host,()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
   return {data:name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value,error:null};
  }},fetchImpl:async()=>{throw new Error('no push tokens exist; no provider call is authorized in this fixture');}});
  assert.equal((await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'private-attendance-worker'}}))).status,200);
  const notices=(await db.query("select n.id,n.user_id,n.title from public.notifications n join public.notification_activity_events e on e.notification_id=n.id where e.event_kind='live_room_member_joined' and e.source_id=$1",[room])).rows;
  assert.deepEqual(notices.map(n=>n.user_id).sort(),[actors.host.id,actors.friend.id].sort());
  assert.ok(notices.every(n=>n.title.includes('Private fixture follower')),'actual handler identifies the joining person, not merely the host');
  const ownCount=actor=>as(actor,()=>one("select count(*)::int n from public.notifications where notification_type='live_room_member_joined'"));
  assert.equal((await ownCount(actors.friend)).n,1);
  const receiptKeys=(await db.query('select recipient_user_id,discovery_hint_key from private.room_attendance_hint_receipts')).rows;
  for(const viewer of [actors.host,actors.friend]){
   const actual=await as(viewer,()=>one('select public.read_my_notification_display_context($1) value',[[notices.find(n=>n.user_id===viewer.id).id]]));
   assert.equal(actual.value.items[0].discoveryHintKey,receiptKeys.find(r=>r.recipient_user_id===viewer.id).discovery_hint_key);
  }
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  const hints=async()=>(await db.query('select * from realtime.fixture_outbox')).rows;
  const assertPrivateHints=async (requiredViewer,allowedViewers=[actors.host,actors.friend])=>{
   const values=await hints();assert.ok(values.length>0,'primary path confirms durable managed Broadcast insertion');
   const allowed=new Set(allowedViewers.map(a=>`discovery:v1:viewer:${a.id}`));
   assert.ok(values.every(v=>allowed.has(v.topic)&&v.private&&v.event==='discovery:invalidate'));
   assert.ok(values.some(v=>v.topic===`discovery:v1:viewer:${requiredViewer.id}`));
   assert.ok(values.every(v=>v.payload.keys.every(k=>!Object.values(actors).some(a=>a.id===k)&&!notices.some(n=>n.id===k))),'opaque correlation never reuses an actor or notification identifier');
   assert.ok(values.every(v=>Object.keys(v.payload).every(k=>['id','keys'].includes(k))&&typeof v.payload.id==='string'
     && Array.isArray(v.payload.keys)&&v.payload.keys.every(k=>/^[0-9a-f-]{36}$/i.test(k))));
   assert.doesNotMatch(JSON.stringify(values),/PRIVATE-ATTENDANCE-HINT|Unlisted private attendance|Private fixture follower/);
   assert.equal((await one("select count(*)::int n from private.discovery_invalidation_outbox where status<>'complete'")).n,0,'not merely queued for the scheduled fallback');
  };
  // Recording-only probe invokes the unchanged helper from a real membership
  // trigger. No caller JWT/role is rewritten and no application gate is replaced.
  await db.exec(`create table private.fixture_attendance_helper_probe(recipient uuid,caller uuid,depth int,allowed boolean,error text);
    create function private.fixture_probe_attendance_helper() returns trigger language plpgsql security definer set search_path='' as $$
    declare s record;r public.watch_party_rooms;ok boolean;begin
      select * into r from public.watch_party_rooms where party_id=new.party_id;
      for s in select * from private.room_attendance_hint_receipts where party_id=new.party_id loop
        begin
          ok:=private.live_room_join_recipient_allowed(r,s.actor_user_id,s.recipient_user_id);
          insert into private.fixture_attendance_helper_probe values(s.recipient_user_id,auth.uid(),pg_trigger_depth(),ok,null);
        exception when others then
          insert into private.fixture_attendance_helper_probe values(s.recipient_user_id,auth.uid(),pg_trigger_depth(),null,sqlerrm);
        end;
      end loop;return new;end$$;
    create trigger fixture_attendance_helper_probe before update of membership_state on public.watch_party_room_memberships
      for each row execute function private.fixture_probe_attendance_helper();`);
  await as(actors.friend,()=>db.query("select public.heartbeat_watch_party_room_session($1,'left',false,false)",[room]));
  const probe=(await db.query('select * from private.fixture_attendance_helper_probe where recipient=$1',[actors.host.id])).rows;
  assert.ok(probe.some(p=>p.caller===actors.friend.id&&p.depth>0&&p.error==='room_block_check_forbidden'),
    'existing recipient helper cannot safely replace explicit-subject reconciliation: real nonhost member trigger still rejects another recipient');
  await db.exec('drop trigger fixture_attendance_helper_probe on public.watch_party_room_memberships; drop function private.fixture_probe_attendance_helper();');
  await assertPrivateHints(actors.friend);assert.equal((await ownCount(actors.friend)).n,0,'recipient membership loss immediately rechecks to invisible in-app activity');
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[room]);
  await assertPrivateHints(actors.host,[actors.host]);assert.equal((await ownCount(actors.host)).n,0);
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts')).n,0,'one final withdrawal retires all attendance receipts');
  assert.equal((await one("select count(*)::int n from public.notifications where notification_type='live_room_member_joined'")).n,2,'withdrawal does not destroy historical audit evidence');
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await db.query("update public.watch_party_rooms set discovery_title='Later private edit',is_active=true where party_id=$1",[room]);
  await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[room]);
  assert.deepEqual(await hints(),[],'retained history does not subscribe former recipients to private edits/end/same-code restart');
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility) values('NEVER-NOTIFIED-PRIVATE',$1,'live','private')",[actors.host.id]);
  await db.exec("update public.watch_party_rooms set is_active=false where party_id='NEVER-NOTIFIED-PRIVATE'");
  assert.deepEqual(await hints(),[],'a private room without producer-bound materialized notices creates no recipient or public existence signal');
  const premiumRoom='PRIVATE-PREMIUM-ATTENDANCE';
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,join_policy,content_access_rule,discovery_title) values($1,$2,'live','private','open','premium','Private Premium attendance')",[premiumRoom,actors.host.id]);
  for(const actor of [actors.host,actors.friend,actors.follower])await as(actor,()=>db.query('select public.join_watch_party_room_session($1)',[premiumRoom]));
  await new Promise(resolve=>setTimeout(resolve,11000));
  await as(actors.follower,()=>db.query("select public.heartbeat_watch_party_room_session($1,'active',false,false)",[premiumRoom]));
  assert.equal((await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'private-attendance-worker'}}))).status,200);
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where party_id=$1',[premiumRoom])).n,2);
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  const expired=await one(`select public.process_revenuecat_premium_event_atomic('revenuecat_google_play','fixture-premium-expired','EXPIRATION',$1::uuid,
    p.provider_product_id,p.provider_base_plan_id,'sandbox','expired',now()-interval '1 day',now()-interval '1 second',now(),999,'usd',repeat('a',64),
    'NORMAL','google_play','android',null,p.id,$2) result
    from public.monetization_products p where p.provider='revenuecat_google_play' and p.environment='sandbox'
      and p.product_type='premium_subscription' and p.status='sandbox' order by p.created_at,p.id limit 1`,
    [actors.friend.id,`live-authority-original-${actors.friend.id}`]);
  assert.equal(expired.result.status,'processed',JSON.stringify(expired.result));
  assert.equal((await one('select public.premium_subject_has_finite_authority_internal($1) allowed',[actors.friend.id])).allowed,false);
  await assertPrivateHints(actors.friend);assert.equal((await ownCount(actors.friend)).n,0);
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where party_id=$1 and recipient_user_id=$2',[premiumRoom,actors.friend.id])).n,0);
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[premiumRoom]);
  await assertPrivateHints(actors.host,[actors.host]);
  assert.ok(!(await hints()).some(h=>h.topic===`discovery:v1:viewer:${actors.friend.id}`),'entitlement loss retires the receipt, not merely one delivery');
  const preferenceRoom='PRIVATE-PREFERENCE-ATTENDANCE';
  await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,join_policy,content_access_rule,discovery_title) values($1,$2,'live','private','open','open','Private preference attendance')",[preferenceRoom,actors.host.id]);
  for(const actor of [actors.host,actors.friend,actors.follower])await as(actor,()=>db.query('select public.join_watch_party_room_session($1)',[preferenceRoom]));
  await new Promise(resolve=>setTimeout(resolve,11000));
  await as(actors.follower,()=>db.query("select public.heartbeat_watch_party_room_session($1,'active',false,false)",[preferenceRoom]));
  assert.equal((await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'private-attendance-worker'}}))).status,200);
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where party_id=$1',[preferenceRoom])).n,2);
  const preference=await as(actors.friend,()=>one('select public.read_person_notification_preferences($1) value',[actors.follower.id]));
  const previousNotice=await one('select notification_id from private.room_attendance_hint_receipts where party_id=$1 and recipient_user_id=$2',[preferenceRoom,actors.friend.id]);
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await as(actors.friend,()=>db.query('select public.set_person_notification_preferences($1,null,null,false,$2)',[actors.follower.id,preference.value.revision]));
  await assertPrivateHints(actors.friend,[actors.friend]);
  assert.equal((await ownCount(actors.friend)).n,0,'current Joined live Off immediately retires its own in-app disclosure');
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where party_id=$1 and recipient_user_id=$2',[preferenceRoom,actors.friend.id])).n,0);
  const optedOut=await as(actors.friend,()=>one('select public.read_person_notification_preferences($1) value',[actors.follower.id]));
  await as(actors.friend,()=>db.query('select public.set_person_notification_preferences($1,null,null,true,$2)',[actors.follower.id,optedOut.value.revision]));
  assert.equal((await ownCount(actors.friend)).n,0,'On again cannot revive a retired private materialization or rearm its subscription');
  await db.exec(`create schema receipt_retirement_fixture;grant usage on schema receipt_retirement_fixture to authenticated;
    create function receipt_retirement_fixture.prior_read(p_notice uuid) returns boolean language sql security definer set search_path='' as $$
      select private.live_notification_read_context_pre_hint_receipts(p_notice,auth.uid())->>'allowed'='true'$$;
    grant execute on function receipt_retirement_fixture.prior_read(uuid) to authenticated;`);
  assert.equal((await as(actors.friend,()=>one('select receipt_retirement_fixture.prior_read($1) allowed',[previousNotice.notification_id]))).allowed,true,
    'negative control executes the old read predicate and proves it revived the notice without a surviving receipt');
  await db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
  await db.exec('update private.discovery_invalidation_worker_config set collecting=false');
  let hostPreference=await as(actors.host,()=>one('select public.read_person_notification_preferences($1) value',[actors.follower.id]));
  await as(actors.host,()=>db.query('select public.set_person_notification_preferences($1,null,null,false,$2)',[actors.follower.id,hostPreference.value.revision]));
  hostPreference=await as(actors.host,()=>one('select public.read_person_notification_preferences($1) value',[actors.follower.id]));
  await as(actors.host,()=>db.query('select public.set_person_notification_preferences($1,null,null,true,$2)',[actors.follower.id,hostPreference.value.revision]));
  assert.deepEqual(await hints(),[],'paused collector emits no preference signal');
  assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where party_id=$1',[preferenceRoom])).n,0,
    'transport pause cannot keep invalid receipts alive through Off then On');
  assert.equal((await ownCount(actors.host)).n,0);
  await db.exec('update private.discovery_invalidation_worker_config set collecting=true');
  await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[preferenceRoom]);
  assert.deepEqual(await hints(),[],'resume never backfills retired private subscriptions');

 } finally {await db.close();}
});
