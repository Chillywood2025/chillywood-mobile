import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';
import { createNotificationActivityHandler } from '../supabase/functions/_shared/notification-activity-worker.mjs';

test('event reminders keep canonical event authority, not standalone discovery Off on private ticketed transport', {timeout:180000},async t=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    const actors=Object.fromEntries((await db.query('select * from event_reservation_fixture.actors')).rows.map(a=>[a.kind,{id:a.user_id,session:a.session_id}]));
    // Modern PostgREST supplies one canonical JWT-claims object. The event
    // service helper rebinds that object internally for exact actor authority;
    // do not add an unrelated legacy role claim that masks that real rebind.
    const as=async(who,fn,role='authenticated')=>{
      const actor=actors[who];await db.exec('begin');
      try {
        await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor.id,session_id:actor.session})]);
        await db.exec(`set local role ${role}`);
        const result=await fn();await db.exec('commit');return result;
      } catch(error){await db.exec('rollback');throw error;}
    };
    const rpc=(who,sql,args=[],role='authenticated')=>as(who,async()=>(await one(`select ${sql} value`,args)).value,role);
    await seedLiveRoomActor(db,actors.creator);
    await db.query("update public.user_profiles set display_name='Canonical Event Host',username='event_host',profile_access_visibility='public' where user_id=$1",[actors.creator.id]);
    await db.exec("insert into public.livekit_servers(server_id,display_name,provider,region,public_ws_url,status) values('notification-event-fixture','Synthetic notification event','other','test','wss://live.example.test','active')");
    const planRows=event=>db.query("select e.*,private.resolve_notification_activity(e) plan from public.notification_activity_events e where source_id=$1 and event_kind='event_starts_soon' order by recipient_user_id",[event]);
    const fixtures=[];
    for(const visibility of ['public','private']) {
      const event=randomUUID();
      await db.query(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,visibility,starts_at,ends_at,reminder_ready,time_zone,replay_policy)
        values($1,$2,$3,'live_first','scheduled',$4,now()+interval '10 minutes',now()+interval '1 hour',true,'America/New_York','none')`,
        [event,actors.creator.id,`${visibility} ticketed event`,visibility]);
      const sale=await rpc('creator',"public.configure_paid_creator_event_sale($1,'Exact event admission',99,5,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '9 minutes')",[event]);
      if(visibility==='private') {
        const intent=await as('buyer1',async()=>{
          await db.exec("select set_config('request.headers','{\"x-chillywood-platform\":\"ios\"}',true)");
          return (await one('select public.create_reserved_creator_event_purchase_intent($1,$2) value',[sale.id,sale.termsRevisionId])).value;
        });
        const receipt=await rpc('buyer1',"public.process_revenuecat_app_store_event_atomic('notification-private-event','NON_RENEWING_PURCHASE',$1,$2,'sandbox',now(),null,99,'usd',repeat('b',64),'notification-private-event-original',null,$3)",
          [actors.buyer1.id,intent.providerProductId,intent.createdAt],'service_role');
        assert.equal(receipt.status,'processed','private positive audience has real bound purchase/entitlement, not a fabricated active pass');
      }
      const prepared=await rpc('creator','public.prepare_creator_event_broadcast($1)',[event]);
      const room=await one('select * from public.watch_party_rooms where party_id=$1',[prepared.roomId]);
      assert.equal(room.discovery_visibility,'private');assert.equal(room.join_policy,'locked');assert.equal(room.content_access_rule,'premium');
      await assert.rejects(()=>rpc('creator',"public.set_watch_party_room_host_settings($1,$2,$3,$4,'open','public','Cannot bypass ticket entry',null,null,true)",
        [prepared.roomId,room.room_generation,room.host_settings_revision,actors.creator.session]),/event_broadcast_host_room_identity_required/,
        'ordinary host discovery controls cannot publish an event-managed transport');
      await rpc('creator','public.heartbeat_creator_event_broadcast_worker()',[],'service_role');
      const unqualified=await rpc('creator','public.claim_creator_event_broadcast_start($1,$2,$3)',[event,actors.creator.id,actors.creator.session],'service_role');
      assert.equal(unqualified.reason,'event_broadcast_approval_required');
      assert.equal((await one('select count(*)::int n from public.creator_event_broadcast_ready_internal($1,$2,false)',[event,actors.creator.id])).n,0);
      await db.query(`insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,private_origin,approved_by,approved_session_id)
        values($1,$2,'creator_owned',30,now()+interval '1 hour','https://private.example.test',$3,$4)`,[actors.creator.id,event,actors.buyer19.id,actors.buyer19.session]);
      await db.query(`insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
        select $1,$1,id,'synthetic event notification authority','live_stage' from public.livekit_servers where server_id='notification-event-fixture'`,[prepared.roomId]);
      const source=await rpc('creator','public.claim_creator_event_broadcast_start($1,$2,$3)',[event,actors.creator.id,actors.creator.session],'service_role');
      assert.equal(source.claimed,true,JSON.stringify(source));
      const provider=await rpc('creator',`public.record_creator_event_broadcast_provider($1,$2,$3,$4,$5,'ACTIVE',$6,$7,true,true)`,
        [event,actors.creator.id,actors.creator.session,source.attemptId,`EG_${visibility}`,`${source.privateOrigin}/${source.outputPrefix}/live.m3u8`,`${source.outputPrefix}/live.m3u8`],'service_role');
      assert.equal(provider.state,'active');
      assert.equal((await one('select count(*)::int n from public.creator_event_broadcast_ready_internal($1,$2,false)',[event,actors.creator.id])).n,1,'real current event provider binding is ready despite private transport');
      for(const resolver of ['discovery_notification_source_pre_room_visibility','discovery_notification_source'])
        assert.equal((await one(`select private.${resolver}('broadcast',$1) value`,[source.broadcastId])).value.eligible,false,'ticketed event was never an ordinary free-room broadcast notification');
      for(const who of ['buyer1','buyer2']) await db.query('insert into public.event_reminders(event_id,user_id) values($1,$2)',[event,actors[who].id]);
      const plans=(await planRows(event)).rows;
      assert.equal(plans.filter(p=>p.plan.eligible).length,visibility==='public'?2:1,'event audience, not private transport, controls enrolled recipients');
      for(const row of plans.filter(p=>p.plan.eligible)) {
        assert.equal(row.plan.title,'Starting soon · Canonical Event Host (@event_host)');
        assert.equal(row.plan.body,`${visibility} ticketed event starts soon.`);
        assert.equal(row.plan.target_route,'/event/[eventId]');assert.equal(row.plan.target_entity_id,event);
      }
      fixtures.push({event,source,prepared,visibility});
    }
    await db.exec("insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('event-fixture-worker','sha256'),'hex')) on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256");
    const handler=createNotificationActivityHandler({adminClient:{async rpc(name,args){
      const result=await as('creator',()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
      return {data:name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value,error:null};
    }},fetchImpl:async()=>{throw new Error('fixture has no push tokens; must not contact a provider');}});
    const response=await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'event-fixture-worker'}}));
    assert.equal(response.status,200);
    assert.equal((await one("select count(*)::int n from public.notifications where notification_type='event_starts_soon'")).n,3,'actual handler materializes exactly the authorized event reminders');
    const [pub,priv]=fixtures;
    await db.query("update public.paid_creator_event_passes set status='revoked',revoked_at=now() where creator_event_id=$1 and buyer_id=$2",[priv.event,actors.buyer1.id]);
    assert.equal((await planRows(priv.event)).rows.filter(p=>p.plan.eligible).length,0,'lost exact private-event entitlement prevents pending/retry disclosure');
    await db.query("update public.creator_events set visibility='private' where id=$1",[pub.event]);
    assert.equal((await planRows(pub.event)).rows.filter(p=>p.plan.eligible).length,0,'actual event privacy loss retires its old public revision');
    await db.query("update public.creator_events set status='canceled' where id=$1",[pub.event]);
    assert.equal((await planRows(pub.event)).rows.filter(p=>p.plan.eligible).length,0,'canceled event cannot keep announcing a start');
    const unknown=await rpc('creator',"public.record_creator_event_broadcast_provider($1,$2,$3,$4,'EG_public','UNKNOWN',null,null,false,false)",
      [pub.event,actors.creator.id,actors.creator.session,pub.source.attemptId],'service_role');
    assert.equal(unknown.state,'uncertain');
    assert.equal((await one('select count(*)::int n from public.creator_event_broadcast_ready_internal($1,$2,false)',[pub.event,actors.creator.id])).n,0,'uncertain provider source loses event playback authority');
    assert.equal((await one("select private.discovery_notification_source('broadcast',$1) value",[pub.source.broadcastId])).value.eligible,false);
    t.diagnostic('Event reminders are not live playback claims. Canonical event enrollment/access is preserved; private transport never becomes a generic free-room invite. No provider network or production mutation.');
  } finally {await db.close();}
});
