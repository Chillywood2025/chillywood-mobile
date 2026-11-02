import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as a,liveFixtureTitle as title,withLiveRoomActor,liveFixtureClaims} from './helpers/live-room-authority-fixture.mjs';

test('listing pause retains exact Party admission, Circle privacy and independent host-source proof', {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const scalar=async(sql,p=[])=>(Object.values((await db.query(sql,p)).rows[0]??{}))[0];
 const auth=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
 const room=async(id)=>(await db.query('select * from public.watch_party_rooms where party_id=$1',[id])).rows[0];
 const join=(id,actor=a.host)=>auth(actor,()=>db.query("select public.join_watch_party_room_session($1,'Current admitted member')",[id]));
 const save=async(r,visibility=r.discovery_visibility,paused,caption=r.discovery_title)=>auth(a.host,()=>scalar(
  'select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true,false'+(paused===undefined?'':',$10')+')',
  [r.party_id,r.room_generation,Number(r.host_settings_revision),a.host.session,'open',visibility,caption,r.source_type,r.source_id,
   ...(paused===undefined?[]:[paused])]));
 const token=(id,actor=a.friend)=>auth(actor,()=>scalar('select public.resolve_watch_party_livekit_viewer_authority($1,$2,$3)',[id,actor.id,actor.session]),'service_role');
 const admit=id=>scalar('select private.party_room_admission_source_current($1)',[id]);
 const listed=(id,actor=a.friend)=>auth(actor,()=>scalar("select (select count(*) from public.discovery_feed_items where source_id=$1)+(select count(*) from public.circle_spectator_feed_items where source_id=$1)",[id]));
 const exact=(id,actor)=>auth(actor,()=>db.query('select * from public.resolve_watch_party_room_entry($1,$2)',[id,actor.session]));
 try{
  await seedLiveRoomAuthority(db);
  for(const id of ['PAUSE-CIRCLE','PAUSE-PUBLIC','PAUSE-NO-HOST'])await auth(a.host,()=>db.query(
   "insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule) values($1,$2,'title',$3,'platform_title',$3,'premium')",[id,a.host.id,title]));
  assert.equal((await room('PAUSE-NO-HOST')).discovery_paused,false,'no historical/default audience broadening');
  assert.equal(await admit('PAUSE-NO-HOST'),false,'room fields without a real host join are not admission proof');
  await assert.rejects(auth(a.host,()=>db.query("update public.watch_party_rooms set discovery_paused=true where party_id='PAUSE-CIRCLE'")),/room_versioned_host_settings_required/);
  assert.equal(await scalar("select has_table_privilege('authenticated','private.party_room_admission_sessions','INSERT')"),false);
  assert.equal(await scalar("select has_table_privilege('service_role','private.party_room_admission_sessions','INSERT')"),false);
  await join('PAUSE-CIRCLE');
  assert.equal(await admit('PAUSE-CIRCLE'),true,'exact actual host join creates admission proof even before listing');
  let current=await room('PAUSE-CIRCLE');
  assert.equal((await save(current,'circle',false,'Circle admission remains private')).published,true);
  await join('PAUSE-CIRCLE',a.friend);
  await auth(a.host,()=>db.query("insert into public.watch_party_room_messages(party_id,user_id,username,text) values('PAUSE-CIRCLE',$1,'Host','Current Circle message')",[a.host.id]));
  assert.equal((await token('PAUSE-CIRCLE')).allowed,true);
  assert.equal(Number(await listed('PAUSE-CIRCLE')),1);
  await db.query("delete from private.party_room_admission_sessions where party_id='PAUSE-CIRCLE'");
  assert.equal(await admit('PAUSE-CIRCLE'),true,'actual current pre-cutover publication still proves its joined host/source');
  current=await room('PAUSE-CIRCLE');
  const paused=await save(current,'private');
  assert.equal(paused.visibility,'circle','legacy Off preserves the actual admission audience');
  assert.equal(paused.discoveryPaused,true);assert.equal(paused.published,false);
  assert.ok(paused.settingsRevision>current.host_settings_revision);
  assert.equal((await room('PAUSE-CIRCLE')).room_generation,current.room_generation,'listing change is not a room restart');
  assert.equal(await admit('PAUSE-CIRCLE'),true,'admission never binds listing revision or listing consent');
  assert.equal(await scalar("select count(*)::int from private.party_room_admission_sessions where party_id='PAUSE-CIRCLE'"),1,
   'new exact host settings preserve only an already-current explicit publication proof across cutover');
  assert.equal(await scalar("select private.party_room_publication_current('PAUSE-CIRCLE')"),false);
  assert.equal(Number(await listed('PAUSE-CIRCLE')),0);
  assert.equal((await token('PAUSE-CIRCLE')).allowed,true,'a current Circle member stays admitted when the card is hidden');
  assert.equal(await auth(a.friend,()=>scalar("select count(*)::int from public.watch_party_room_messages where party_id='PAUSE-CIRCLE'")),1);
  assert.equal((await exact('PAUSE-CIRCLE',a.follower)).rows.length,0,'following does not reveal a paused Circle room');
  assert.equal((await exact('PAUSE-CIRCLE',a.stranger)).rows.length,0);
  await assert.rejects(join('PAUSE-CIRCLE',a.follower),/circle|viewer_authority|unavailable/i);
  assert.equal((await token('PAUSE-CIRCLE',a.follower)).allowed,false);
  await assert.rejects(save(current,'circle',false),/room_host_settings_conflict/,'stale unpause cannot reverse the latest hidden decision');
  const noOp=await save(await room('PAUSE-CIRCLE'),'circle');
  assert.equal(noOp.discoveryPaused,true,'omitted new argument cannot silently unpause a legacy retry');
  assert.equal(noOp.published,false);

  // Restore only the old publication-as-admission dependency in an isolated
  // rollback transaction. Real caller, membership, source and Premium gates
  // remain, demonstrating the actual ejection this repair prevents.
  const sig='public.resolve_watch_party_livekit_pre_reserved_claim(text,uuid,uuid)';
  const definition=await scalar('select pg_get_functiondef($1::regprocedure)',[sig]);
  assert.equal(definition.split('private.party_room_admission_source_current').length,3);
  await db.exec('begin');await db.exec(definition.replaceAll('private.party_room_admission_source_current','private.party_room_publication_current'));
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role','service_role',true)",[liveFixtureClaims(a.friend,'service_role')]);
  await db.exec('set local role service_role');
  assert.equal((await scalar("select public.resolve_watch_party_livekit_viewer_authority('PAUSE-CIRCLE',$1,$2)",[a.friend.id,a.friend.session])).allowed,false,
   'negative control: old discovery coupling ejects a still-authorized paused Circle member');
  await db.exec('rollback');
  assert.equal(await scalar('select pg_get_functiondef($1::regprocedure)',[sig]),definition);
  assert.equal((await token('PAUSE-CIRCLE')).allowed,true);
  await auth(a.friend,()=>db.query("select public.heartbeat_watch_party_room_session('PAUSE-CIRCLE','left',false,false)"));
  await join('PAUSE-CIRCLE',a.friend);
  assert.equal((await token('PAUSE-CIRCLE')).allowed,true,'actual canonical rejoin works while the listing stays paused');
  assert.equal(Number(await listed('PAUSE-CIRCLE')),0);

  await db.exec('begin');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[a.host.session]);
  assert.equal(await admit('PAUSE-CIRCLE'),false,'admission proof is fenced to the exact surviving host session');
  await db.exec('rollback');
  await db.exec('begin');await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role','service_role',true)",[liveFixtureClaims(a.host,'service_role')]);
  await db.exec('set local role service_role');
  await db.query("update public.watch_party_room_memberships set last_seen_at=now()-interval '46 seconds' where party_id='PAUSE-CIRCLE' and user_id=$1",[a.host.id]);
  await db.exec('reset role');
  assert.equal(await admit('PAUSE-CIRCLE'),false,'host presence freshness remains required');await db.exec('rollback');
  await auth(a.host,()=>db.query("select public.heartbeat_watch_party_room_session('PAUSE-CIRCLE','left',false,false)"));
  assert.equal(await admit('PAUSE-CIRCLE'),false);assert.equal((await token('PAUSE-CIRCLE')).allowed,false);
  await join('PAUSE-CIRCLE');assert.equal(await admit('PAUSE-CIRCLE'),true);
  await auth(a.friend,()=>db.query("select public.respond_to_friendship($1,'remove')",[a.host.id]));
  assert.equal((await token('PAUSE-CIRCLE')).allowed,false,'pause does not freeze old Circle membership into lasting access');
  assert.equal((await exact('PAUSE-CIRCLE',a.friend)).rows.length,0);

  await join('PAUSE-PUBLIC');await save(await room('PAUSE-PUBLIC'),'public',false,'Known-link room');
  await save(await room('PAUSE-PUBLIC'),'public',true);
  assert.equal(Number(await listed('PAUSE-PUBLIC',a.stranger)),0);
  assert.equal((await exact('PAUSE-PUBLIC',a.stranger)).rows.length,1,'paused Public remains unlisted/open, not fake invite-only');
  await join('PAUSE-PUBLIC',a.stranger);assert.equal((await token('PAUSE-PUBLIC',a.stranger)).allowed,true);
  const old=await room('PAUSE-PUBLIC');
  await auth(a.host,()=>db.query("update public.watch_party_rooms set is_active=false where party_id='PAUSE-PUBLIC'"));
  await auth(a.host,()=>db.query("update public.watch_party_rooms set is_active=true where party_id='PAUSE-PUBLIC'"));
  assert.notEqual((await room('PAUSE-PUBLIC')).room_generation,old.room_generation);
  assert.equal(await admit('PAUSE-PUBLIC'),false,'a retained same-code admission row never authenticates a restarted generation');
  await join('PAUSE-PUBLIC');assert.equal(await admit('PAUSE-PUBLIC'),true);
  await db.query("insert into public.titles(id,title,video_url,is_published,status) values('ac510002-0000-4000-8000-000000000099','Next exact source','https://example.invalid/next.mp4',true,'published')");
  await auth(a.host,()=>db.query("update public.watch_party_rooms set title_id='ac510002-0000-4000-8000-000000000099',source_id='ac510002-0000-4000-8000-000000000099' where party_id='PAUSE-PUBLIC'"));
  assert.equal(await admit('PAUSE-PUBLIC'),false,'source/title changes invalidate old admission proof independently of listing state');
  await join('PAUSE-PUBLIC');assert.equal(await admit('PAUSE-PUBLIC'),true);
 }finally{await db.close();}
});
