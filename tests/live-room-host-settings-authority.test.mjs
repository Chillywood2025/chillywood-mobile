import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,liveFixtureTitle as title,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

test('full schema: versioned host settings, private/code/Circle admission, canonical counts and lifecycle freshness', {timeout:180000}, async()=>{
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const scalar=async(sql,args=[])=>(Object.values((await db.query(sql,args)).rows[0]??{}))[0];
  const auth=(who,fn,role='authenticated')=>withLiveRoomActor(db,actors[who],fn,role);
  const room=async(id)=>(await db.query('select * from public.watch_party_rooms where party_id=$1',[id])).rows[0];
  const setting=(r,{visibility=r.discovery_visibility,join=r.join_policy,caption=r.discovery_title,paused=visibility==='private'}={})=>
    scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true,false,$10)',
      [r.party_id,r.room_generation,Number(r.host_settings_revision),actors.host.session,join,visibility,caption,
        r.room_type==='title'?(r.source_type||'platform_title'):r.source_type,r.source_id||r.title_id,paused]);
  const join=async(id,who='host')=>auth(who,()=>db.query('select * from public.join_watch_party_room_session($1)',[id]));
  const publish=async(r)=>auth('host',()=>scalar('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5)',
    [r.party_id,actors.host.id,actors.host.session,r.room_generation,Number(r.host_settings_revision)]),'service_role');
  // This suite verifies aggregate authority; the progress-key suite separately
  // verifies the additive exact public-title `scopes` footprint.
  const count=async(id)=>{const {total,byTitle}=await auth('stranger',()=>scalar('select public.read_public_party_room_counts($1)',[id?[id]:null]));return {total,byTitle};};
  try {
    assert.ok(replayReport.files.length>590,'complete chronological migration chain, no reduced authority schema');
    await seedLiveRoomAuthority(db);
    await auth('host',()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule)
      values('VERSION-PARTY',$1,'title',$2,'platform_title',$2,'premium'),('HIDDEN-PARTY',$1,'title',$2,'platform_title',$2,'premium')`,[actors.host.id,title]));
    let initial=await room('VERSION-PARTY');
    assert.equal(initial.discovery_visibility,'private');
    assert.equal(await auth('stranger',()=>scalar('select count(*)::int from public.watch_party_rooms')),0,'raw browse cannot enumerate private codes/hosts/titles');
    await db.exec('begin;drop policy watch_party_rooms_scoped_read on public.watch_party_rooms;create policy fixture_old_public on public.watch_party_rooms for select to authenticated using(true);set local role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({role:'authenticated',sub:actors.stranger.id,session_id:actors.stranger.session})]);
    assert.equal(await scalar('select count(*)::int from public.watch_party_rooms'),2,'negative control reproduces historical private enumeration');
    await db.exec('rollback');
    assert.equal((await auth('stranger',()=>db.query('select * from public.resolve_watch_party_room_entry($1,$2)',['VERSION-PARTY',actors.stranger.session]))).rows.length,1,'known private/unlisted code can preview without listing');
    await assert.rejects(auth('host',()=>db.query("update public.watch_party_rooms set discovery_visibility='public' where party_id='VERSION-PARTY'")),/room_versioned_host_settings_required/);
    await assert.rejects(auth('stranger',()=>setting(initial,{visibility:'public'})),/room_current_session_required|room_exact_host_required/);
    let ack=await auth('host',()=>setting(initial,{visibility:'public',caption:'Exact Party'}));
    assert.equal(ack.settingsRevision,1);assert.equal(ack.published,false,'settings before actual host join are preparation only');
    await assert.rejects(auth('host',()=>setting(initial,{visibility:'circle'})),/room_host_settings_conflict/);
    await assert.rejects(auth('host',()=>scalar('select public.set_party_room_discovery($1,$2,$3,$4,$5,$6)',
      ['VERSION-PARTY','private',null,'platform_title',title,actors.host.session])),/room_versioned_host_settings_required/);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.publish_party_room_discovery(text,text,text,text)','EXECUTE')"),false,'unversioned delayed publisher is not exposed');
    await join('VERSION-PARTY');
    let current=await room('VERSION-PARTY');ack=await auth('host',()=>setting(current));
    assert.equal(ack.settingsRevision,1,'no-op publication retry retains exact version');assert.equal(ack.published,true);
    assert.deepEqual(await count(title),{total:1,byTitle:[{titleId:title,count:1}]},'canonical public count never includes another private room');
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)',[actors.host.id,actors.stranger.id]);
    assert.deepEqual(await count(title),{total:0,byTitle:[]},'count excludes exact viewer blocked by host');
    await db.query('delete from public.channel_audience_blocks where channel_user_id=$1 and blocked_user_id=$2',[actors.host.id,actors.stranger.id]);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[actors.stranger.session]);
    assert.deepEqual(await count(title),{total:0,byTitle:[]},'retired caller session cannot retrieve discovery counts');
    await db.query("update auth.sessions set not_after=now()+interval '1 day' where id=$1",[actors.stranger.session]);
    assert.equal(await auth('stranger',()=>scalar('select count(*)::int from public.watch_party_rooms')),1,'public canonical metadata is browsable');
    await join('VERSION-PARTY','friend');
    await join('VERSION-PARTY','follower');
    await auth('host',()=>db.query("insert into public.watch_party_room_messages(party_id,user_id,username,text) values('VERSION-PARTY',$1,'Room host','Current room only')",[actors.host.id]));
    assert.equal(await auth('stranger',()=>scalar("select count(*)::int from public.watch_party_room_messages where party_id='VERSION-PARTY'")),0,'public listing is not private conversation access');
    await auth('host',()=>db.query("select * from public.set_watch_party_participant_authority('VERSION-PARTY',$1,'speaker',false,'active')",[actors.friend.id]));
    current=await room('VERSION-PARTY');ack=await auth('host',()=>setting(current,{visibility:'circle',join:'open'}));
    assert.equal(ack.published,true);assert.equal(ack.joinPolicy,'open');
    assert.deepEqual(await count(title),{total:0,byTitle:[]});
    assert.equal((await auth('stranger',()=>db.query('select * from public.resolve_watch_party_room_entry($1,$2)',['VERSION-PARTY',actors.stranger.session]))).rows.length,0,'Circle code does not reveal metadata to outsider');
    assert.equal(await auth('follower',()=>scalar("select count(*)::int from public.watch_party_rooms where party_id='VERSION-PARTY'")),0,'previous active member loses raw room read immediately after Circle narrowing');
    assert.equal(await auth('follower',()=>scalar("select count(*)::int from public.watch_party_room_memberships where party_id='VERSION-PARTY'")),0,'Circle removal also hides the actual attendee roster');
    assert.equal(await auth('friend',()=>scalar("select count(*)::int from public.watch_party_room_memberships where party_id='VERSION-PARTY'")),3,'actual current Circle member retains roster access');
    assert.equal(await auth('follower',()=>scalar("select count(*)::int from public.watch_party_room_messages where party_id='VERSION-PARTY'")),0,'previous attendee loses message text after audience narrowing');
    assert.equal(await auth('friend',()=>scalar("select count(*)::int from public.watch_party_room_messages where party_id='VERSION-PARTY'")),1,'actual Circle attendee retains messages');
    const childDefinition=await scalar("select pg_get_functiondef('public.can_read_watch_party_room_authority(text)'::regprocedure)");
    const circleGuard="r.discovery_visibility<>'circle' or public.is_active_chilly_circle_member(r.host_user_id::text,auth.uid()::text)";
    assert.ok(childDefinition.includes(circleGuard));
    await db.exec('begin');await db.exec(childDefinition.replace(circleGuard,'true'));
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actors.follower.id,session_id:actors.follower.session})]);
    await db.exec('set local role authenticated');
    assert.equal(await scalar("select count(*)::int from public.watch_party_room_messages where party_id='VERSION-PARTY'"),1,'negative control: removing only current Circle guard leaks prior member message');
    await db.exec('rollback');
    current=await room('VERSION-PARTY');ack=await auth('host',()=>setting(current,{join:'locked'}));
    assert.equal(ack.joinPolicy,'locked');
    await assert.rejects(join('VERSION-PARTY','stranger'),/party_room_viewer_authority_required|circle_live_authority_required/);
    assert.equal((await auth('friend',()=>db.query('select * from public.resolve_watch_party_room_entry($1,$2)',['VERSION-PARTY',actors.friend.session]))).rows.length,1,'current Circle can preview, locked joining remains separate');
    await assert.rejects(auth('friend',()=>scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      ['VERSION-PARTY',ack.roomGeneration,ack.settingsRevision,actors.friend.session,'open','public','Escalation','platform_title',title])),/room_exact_host_required/);
    await db.query("update public.user_friendships set status='removed' where user_low_id=$1 and user_high_id=$2",[actors.host.id,actors.friend.id]);
    assert.equal(await auth('friend',()=>scalar("select count(*)::int from public.circle_spectator_feed_items where source_id='VERSION-PARTY'")),0,'revoked Circle membership immediately loses projection');
    assert.equal(await auth('friend',()=>scalar("select count(*)::int from public.watch_party_room_memberships where party_id='VERSION-PARTY'")),0,'removed Circle loses attendee roster even with fresh session membership');
    current=await room('VERSION-PARTY');ack=await auth('host',()=>setting(current,{visibility:'private',join:'locked'}));
    assert.equal(ack.published,false);assert.deepEqual(await count(title),{total:0,byTitle:[]});
    await assert.rejects(join('VERSION-PARTY','follower'),/locked|authority|required/,'Off does not turn locked room into public access');
    await auth('host',()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule)
      values('VERSION-LIVE',$1,'live','open')`,[actors.host.id]));
    await join('VERSION-LIVE');
    current=await room('VERSION-LIVE');ack=await auth('host',()=>setting(current,{visibility:'public',caption:'Actual Live'}));
    assert.equal(ack.published,false,'settings cannot forge a provider-confirmed live publication');
    current=await room('VERSION-LIVE');assert.equal(await publish(current),true);
    assert.equal(await auth('stranger',()=>scalar("select count(*)::int from public.discovery_feed_items where source_id='VERSION-LIVE'")),1);
    await auth('host',()=>db.query("update public.watch_party_room_memberships set last_seen_at=now()-interval '46 seconds' where party_id='VERSION-LIVE'"),'service_role');
    assert.equal(await auth('stranger',()=>scalar("select count(*)::int from public.discovery_feed_items where source_id='VERSION-LIVE'")),0,'stale host is removed at read time without source update');
    await join('VERSION-LIVE');assert.equal(await publish(current),true);
    ack=await auth('host',()=>setting(current,{visibility:'private'}));
    assert.equal(await publish(current),false,'stale callback cannot reverse a newer Off decision');
    current=await room('VERSION-LIVE');await auth('host',()=>setting(current,{visibility:'public'}));current=await room('VERSION-LIVE');
    assert.equal(await publish(current),true);
    const former=current;
    await auth('host',()=>db.query("update public.watch_party_rooms set is_active=false where party_id='VERSION-LIVE'"));
    await auth('host',()=>db.query("update public.watch_party_rooms set is_active=true where party_id='VERSION-LIVE'"));
    current=await room('VERSION-LIVE');assert.notEqual(current.room_generation,former.room_generation);assert.equal(current.discovery_started_at,null);
    assert.equal(await publish(former),false,'old lifecycle provider callback cannot publish same-code restart');
    await assert.rejects(auth('host',()=>setting(former,{visibility:'public'})),/room_host_settings_conflict/);
    assert.equal(await auth('stranger',()=>scalar("select count(*)::int from public.discovery_feed_items where source_id='VERSION-LIVE'")),0,'restart never inherits old discovery');
    await join('VERSION-LIVE');assert.equal(await publish(current),true);
    await db.query('delete from auth.sessions where id=$1',[actors.host.session]);
    assert.equal(await auth('stranger',()=>scalar("select count(*)::int from public.discovery_feed_items where source_id='VERSION-LIVE'")),0,'revoked exact host session removes discovery');
  } finally {await db.close();}
});
