import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase } from '../helpers/database-runtime-authority-fixture.mjs';

test('event broadcast preparation executes full production SQL with exact host, Premium and nonplayable source binding', {timeout:240_000}, async t => {
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  let step='fixture',checks=0;
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
  const claim=async actor=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",
    [JSON.stringify({role:'authenticated',sub:actor.user_id,session_id:actor.session_id})]);await db.exec('set role authenticated');};
  const service=async()=>{await db.exec('reset role');await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");};
  const deny=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
  const isolate=async fn=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const host=actors.find(a=>a.kind==='creator'),other=actors.find(a=>a.kind==='buyer19');
    const event=await one("select id from event_reservation_fixture.events where name='show15'");
    const prepare=()=>one('select public.prepare_creator_event_broadcast($1)',[event]);
    await claim(other);await deny(prepare,/event_creator_required/);
    await claim({...host,session_id:other.session_id});await deny(prepare,/event_creator_session_required/);
    await claim(host);await deny(prepare,/event_broadcast_host_premium_required/);
    await service();
    eq(await one('select count(*)::integer from private.creator_event_broadcast_preparations'),0,'denied requests create no room binding');
    const premium=(await db.query("select * from public.monetization_products where product_type='premium_subscription' and provider='revenuecat_google_play' and environment='sandbox' order by id limit 1")).rows[0];
    assert.ok(premium,'existing Premium product');
    step='actual Premium receipt';
    const receipt=await one("select public.process_revenuecat_premium_event_atomic('revenuecat_google_play','event-host-premium','INITIAL_PURCHASE',$1,$2,$3,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',repeat('a',64),'NORMAL','google_play','android',null,$4,'event-host-premium-original')",[host.user_id,premium.provider_product_id,premium.provider_base_plan_id,premium.id]);
    eq(receipt.status,'processed',JSON.stringify(receipt));
    eq(await one('select public.premium_subject_has_finite_authority_internal($1)',[host.user_id]),true,'actual receipt chain provides host Premium');
    step='prepare and recover';
    await claim(host);
    const prepared=await prepare();eq(prepared.state,'awaiting_operator_setup');eq(prepared.canStart,false);
    assert.match(prepared.roomId,/^EVENT[A-F0-9]{32}$/);checks++;
    eq(await prepare(),prepared,'retry recovers exact binding');
    const hostContext=await one('select public.read_creator_event_for_host_room($1)',[prepared.roomId]);
    eq(hostContext.creatorEvent.id,event);eq(hostContext.creatorEvent.host_user_id,host.user_id);eq(hostContext.roomId,prepared.roomId);
    await claim(other);await deny(()=>one('select public.read_creator_event_for_host_room($1)',[prepared.roomId]),/event_broadcast_host_room_required/);
    await claim({...host,session_id:other.session_id});await deny(()=>one('select public.read_creator_event_for_host_room($1)',[prepared.roomId]),/event_creator_session_required/);
    await service();
    const room=(await db.query('select * from public.watch_party_rooms where party_id=$1',[prepared.roomId])).rows[0];
    eq(room.host_user_id,host.user_id);eq(room.join_policy,'locked');eq(room.discovery_visibility,'private');eq(room.content_access_rule,'premium');
    const member=(await db.query('select * from public.watch_party_room_memberships where party_id=$1 and user_id=$2',[prepared.roomId,host.user_id])).rows[0];
    eq(member.role,'host','canonical host membership created');eq(member.membership_state,'active');
    const broadcast=(await db.query('select * from public.room_broadcast_sessions where id=$1',[prepared.broadcastSessionId])).rows[0];
    eq(broadcast.creator_event_id,event);eq(broadcast.source_room_id,prepared.roomId);eq(broadcast.host_user_id,host.user_id);
    eq(broadcast.egress_id,null);eq(broadcast.hls_playback_url,null);eq(broadcast.is_spectator_playback_enabled,false);eq(broadcast.is_publicly_watchable,false);
    eq(broadcast.rights_status,'unknown_block_public_spectator');eq(broadcast.metadata.event_ticketed_approved,undefined);
    eq(await one('select count(*)::integer from public.creator_event_broadcast_ready_internal($1,$2,false)',[event,host.user_id]),0);
    await claim(host);await deny(()=>one("select public.manage_creator_event_lifecycle($1,'start',(select updated_at from public.creator_events where id=$1))",[event]),/event_verified_broadcast_required/);
    for(const change of ["join_policy='open'","discovery_visibility='public'","content_access_rule='open'"]) {
      await deny(()=>db.query(`update public.watch_party_rooms set ${change} where party_id=$1`,[prepared.roomId]),/event_broadcast_host_room_identity_required/);
    }
    await deny(()=>db.query('select * from private.creator_event_broadcast_preparations'),/permission denied/);
    await deny(()=>db.query("update public.room_broadcast_sessions set rights_status='creator_owned',metadata='{\"event_ticketed_approved\":true}' where id=$1 returning id",[prepared.broadcastSessionId]).then(r=>{if(r.rows.length===0)throw new Error('no operator rows visible');}),/no operator rows visible|permission denied/);
    await claim(other);await deny(()=>one('select public.join_watch_party_room_session($1)',[prepared.roomId]),/locked|authority|access|premium/i);
    await isolate(async()=>{await service();await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[host.session_id]);await claim(host);await deny(prepare,/event_creator_session_required/);});
    await isolate(async()=>{await service();await db.query("update public.room_broadcast_sessions set creator_event_id=null where id=$1",[prepared.broadcastSessionId]);await claim(host);await deny(prepare,/event_broadcast_source_binding_invalid/);});
    await isolate(async()=>{await service();await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[prepared.roomId]);await claim(host);eq((await prepare()).state,'room_closed');});
    await isolate(async()=>{await service();await db.query("update public.creator_events set status='canceled' where id=$1",[event]);await claim(host);await deny(prepare,/event_broadcast_event_closed/);});
    // Negative control establishes that the immutable room assertion observes
    // the new guard rather than an unrelated existing table policy.
    await isolate(async()=>{await service();await db.exec('alter table public.watch_party_rooms disable trigger guard_creator_event_broadcast_room');await claim(host);await db.query("update public.watch_party_rooms set join_policy='open' where party_id=$1",[prepared.roomId]);eq(await one('select join_policy from public.watch_party_rooms where party_id=$1',[prepared.roomId]),'open');});
    t.diagnostic(`${checks} assertions; real session/Premium receipt/room-membership SQL, synthetic provider input, no Egress or external operation`);
  } catch(error){error.message=`${step}: ${error.message}`;throw error;} finally {await db.close();}
});
