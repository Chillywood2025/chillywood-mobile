import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as a,liveFixtureTitle as title,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

test('owner session visibility requires new room-scoped consent and never exposes owner profile/history', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const scalar=async(sql,p=[])=>(Object.values((await db.query(sql,p)).rows[0]??{}))[0];
  const auth=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
  const get=async(id)=>(await db.query('select * from public.watch_party_rooms where party_id=$1',[id])).rows[0];
  const save=async(id,{visibility='public',caption='Explicit owner room',consent=false,publish=true,paused=visibility==='private'}={})=>{
    const r=await get(id);return auth(a.host,()=>scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [id,r.room_generation,Number(r.host_settings_revision),a.host.session,r.join_policy,visibility,caption,r.source_type,r.source_id,publish,consent,paused]));
  };
  const visible=id=>auth(a.stranger,()=>scalar('select count(*)::int from public.discovery_feed_items where source_id=$1',[id]));
  try {
    await seedLiveRoomAuthority(db);
    await db.query("update auth.users set email='owner-live-fixture@example.test' where id=$1",[a.host.id]);
    await db.query("insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values('owner',$1,'owner-live-fixture@example.test','active','Synthetic scoped consent test','fixture')",[a.host.id]);
    assert.equal(await scalar('select public.is_platform_owner_user($1)',[a.host.id]),true,'actual exact owner role authority, not a stub');
    await db.query("insert into public.user_profiles(user_id,display_name,username) values($1,'Private admin identity','private_owner') on conflict(user_id) do update set display_name=excluded.display_name,username=excluded.username",[a.host.id]);
    for(const [id,type] of [['OWNER-LIVE','live'],['OWNER-PARTY','title'],['OWNER-HISTORICAL','title']]) {
      await auth(a.host,()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule,discovery_visibility,discovery_title)
        values($1,$2,$3,$4,$5,$4,$6,'public','Historical flag is not consent')`,[id,a.host.id,type,type==='title'?title:null,type==='title'?'platform_title':null,type==='title'?'premium':'open']));
      await auth(a.host,()=>db.query("select * from public.join_watch_party_room_session($1,'Chosen room identity')",[id]));
    }
    assert.equal(await visible('OWNER-LIVE'),0);assert.equal(await visible('OWNER-HISTORICAL'),0);
    assert.equal((await save('OWNER-PARTY')).published,false,'ordinary Public save cannot waive owner invisibility');
    await assert.rejects(save('OWNER-PARTY',{consent:true,caption:''}),/room_owner_discovery_title_required/);
    let ack=await save('OWNER-PARTY',{consent:true});assert.equal(ack.ownerDiscoveryConsent,true);assert.equal(ack.published,true);
    assert.equal(await visible('OWNER-PARTY'),1);assert.equal(await visible('OWNER-HISTORICAL'),0,'opt-in affects only the selected room');
    assert.equal(await auth(a.stranger,()=>scalar('select count(*)::int from public.user_profiles where user_id=$1',[a.host.id])),0,'owner profile remains hidden');
    assert.equal(await scalar("select private.room_discovery_host_label(r) from public.watch_party_rooms r where party_id='OWNER-PARTY'"),'Chosen room identity','consent never reads private profile identity');
    ack=await save('OWNER-PARTY',{consent:false});assert.equal(ack.ownerDiscoveryConsent,true,'exact no-op retry preserves current consent');
    ack=await save('OWNER-PARTY',{visibility:'private',caption:null});assert.equal(ack.ownerDiscoveryConsent,false);assert.equal(await visible('OWNER-PARTY'),0);
    assert.equal(ack.discoveryPaused,true);assert.equal(ack.visibility,'public','Off retains the current base audience');
    ack=await save('OWNER-PARTY',{consent:false});assert.equal(ack.published,false,'Off revokes consent; public flag alone cannot restore it');
    ack=await save('OWNER-PARTY',{visibility:'circle',consent:true});assert.equal(ack.published,true,'owner Circle opt-in uses actual preexisting eligible relationship');
    assert.equal(await visible('OWNER-PARTY'),0,'Circle owner is not a public exception');
    assert.equal(await auth(a.friend,()=>scalar("select count(*)::int from public.circle_spectator_feed_items where source_id='OWNER-PARTY'")),1,'actual Circle sees only explicit owner room');
    await save('OWNER-LIVE',{consent:true});
    let r=await get('OWNER-LIVE');
    const publish=row=>auth(a.host,()=>scalar('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5)',
      [row.party_id,a.host.id,a.host.session,row.room_generation,Number(row.host_settings_revision)]),'service_role');
    assert.equal(await publish(r),true);assert.equal(await visible('OWNER-LIVE'),1,'separate canonical owner Live policy respects explicit consent');
    assert.equal(await auth(a.stranger,()=>scalar('select count(*)::int from public.user_profiles where user_id=$1',[a.host.id])),0);
    await save('OWNER-LIVE',{visibility:'circle',consent:true});r=await get('OWNER-LIVE');assert.equal(await publish(r),true);
    assert.equal(await visible('OWNER-LIVE'),0);
    assert.equal(await auth(a.friend,()=>scalar("select count(*)::int from public.circle_spectator_feed_items where source_id='OWNER-LIVE'")),1,'current Circle sees consent-bound Live publication');
    await auth(a.host,()=>db.query("update public.watch_party_rooms set is_active=false where party_id='OWNER-LIVE'"));
    await auth(a.host,()=>db.query("update public.watch_party_rooms set is_active=true where party_id='OWNER-LIVE'"));
    await auth(a.host,()=>db.query("select * from public.join_watch_party_room_session('OWNER-LIVE','Chosen room identity')"));
    r=await get('OWNER-LIVE');assert.equal(await publish(r),false,'room restart invalidates explicit consent even if host session is unchanged');
    await db.query('delete from public.user_friendships where $1 in(user_low_id,user_high_id)',[a.host.id]);
    await assert.rejects(save('OWNER-LIVE',{consent:true,visibility:'circle'}),/room_owner_circle_unavailable/,'owner Circle opt-in cannot fabricate relationships');
    await save('OWNER-LIVE',{consent:true});r=await get('OWNER-LIVE');assert.equal(await publish(r),true);
    await db.query('delete from auth.sessions where id=$1',[a.host.session]);assert.equal(await visible('OWNER-LIVE'),0,'owner session revocation removes scoped discovery');
  } finally {await db.close();}
});
