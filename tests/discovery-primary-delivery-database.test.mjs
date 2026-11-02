import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as a,liveFixtureTitle,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

// Managed Realtime transport is the only local double. Real publication,
// source/audience/session/relationship authority and transaction rollback run
// against the complete schema. Hosted SDK proof separately measures delivery.
test('transactional discovery primary: immediate exact audience hints, withdrawal, current sessions and durable failure', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const scalar=async(sql,p=[])=>(Object.values((await db.query(sql,p)).rows[0]??{}))[0];
  const auth=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
  const room=async()=>(await db.query("select * from public.watch_party_rooms where party_id='PRIMARY-PARTY'")).rows[0];
  const save=async(visibility,caption='Current chosen room')=>{const r=await room();return auth(a.host,()=>scalar(
    'select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true,false,$10)',
    [r.party_id,r.room_generation,Number(r.host_settings_revision),a.host.session,'open',visibility,caption,r.source_type,r.source_id,visibility==='private']));};
  const reset=()=>db.exec('truncate realtime.fixture_outbox,realtime.messages');
  const topics=async()=>(await db.query('select distinct topic from realtime.fixture_outbox order by topic')).rows.map(r=>r.topic);
  const viewer=id=>`discovery:v1:viewer:${id}`;
  const managedSend=`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
    begin begin insert into realtime.messages(payload,event,topic,private,extension) values($1,$2,$3,$4,'broadcast');
      insert into realtime.fixture_outbox values($1,$2,$3,$4);
    exception when others then raise warning 'managed transport swallowed failure';end;end$$`;
  try {
    await db.exec(`alter table realtime.messages alter column id type uuid using null::uuid;
      alter table realtime.messages alter column id set default gen_random_uuid();
      alter table realtime.messages alter column inserted_at type timestamp without time zone using inserted_at at time zone 'UTC';
      alter table realtime.messages alter column inserted_at set default timezone('utc',clock_timestamp());
      create index messages_inserted_at_topic_index on realtime.messages(inserted_at desc,topic) where extension='broadcast' and private is true;`);
    await db.exec(managedSend);await seedLiveRoomAuthority(db);
    assert.equal(await scalar('select primary_delivery_enabled from private.discovery_invalidation_worker_config'),true);
    await db.exec("update private.discovery_invalidation_worker_config set collecting=true,enabled=true,token_sha256=repeat('a',64)");
    await auth(a.host,()=>db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule) values('PRIMARY-PARTY',$1,'title',$2,'platform_title',$2,'premium')",[a.host.id,liveFixtureTitle]));
    await auth(a.host,()=>db.query("select * from public.join_watch_party_room_session('PRIMARY-PARTY','Chosen room host')"));
    assert.deepEqual(await topics(),[],'private preparation never emits a global or personal existence hint');
    assert.equal((await save('public')).published,true);
    assert.ok((await topics()).includes('discovery:v1:surface:home'),'source commit sends primary without any worker invocation');
    assert.equal(await scalar("select count(*)::int from private.discovery_invalidation_outbox where status='pending'"),0);
    assert.equal(await scalar("select bool_and(payload-'id'-'keys'='{}'::jsonb and payload->>'id'~'^[0-9a-f-]{36}$' and jsonb_array_length(payload->'keys') between 1 and 256 and private and event='discovery:invalidate') from realtime.fixture_outbox"),true);
    await reset();await save('public','Changed current room');
    assert.equal(await scalar('select count(*)::int=count(distinct topic)::int from realtime.fixture_outbox'),true,'hide/republish in one settings transaction coalesces per topic');
    await reset();const r=await room();
    await db.exec('begin');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:a.host.id,session_id:a.host.session})]);await db.exec('set local role authenticated');
    await scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',[r.party_id,r.room_generation,Number(r.host_settings_revision),a.host.session,'open','private','Rollback',r.source_type,r.source_id]);
    await db.exec('rollback');assert.deepEqual(await topics(),[],'rolled-back privacy change and Broadcast insertion both disappear');
    await save('circle');let t=await topics();assert.ok(t.includes('discovery:v1:surface:home'),'old Public audience receives withdrawal');
    assert.ok(t.includes(viewer(a.friend.id)));assert.ok(t.includes(viewer(a.host.id)));
    assert.ok(!t.includes(viewer(a.follower.id))&&!t.includes(viewer(a.stranger.id)),'following/guessing never enters Circle fanout');
    await reset();await save('circle','Only Circle metadata changed');
    assert.deepEqual(await topics(),[viewer(a.host.id),viewer(a.friend.id)].sort(),'Circle-only writes never signal a broad public channel');
    await reset();await save('private');assert.deepEqual(await topics(),[viewer(a.host.id),viewer(a.friend.id)].sort(),'old Circle receives only opaque withdrawal');
    await reset();await save('private','New hidden detail');assert.deepEqual(await topics(),[],'subsequent private-only edits disclose no existence');
    await save('circle');await reset();
    await db.query("update public.user_friendships set status='removed' where user_low_id=$1 and user_high_id=$2",[a.host.id,a.friend.id]);
    assert.ok((await topics()).includes(viewer(a.friend.id)),'former authorized Circle viewer receives removal reconciliation');
    await reset();await save('circle','After membership removal');assert.deepEqual(await topics(),[viewer(a.host.id)],'removed member cannot observe later Circle changes');
    await db.query("update public.user_friendships set status='active' where user_low_id=$1 and user_high_id=$2",[a.host.id,a.friend.id]);await reset();
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)',[a.host.id,a.friend.id]);
    assert.ok((await topics()).includes(viewer(a.friend.id)),'blocking withdraws formerly authorized recipient');
    await reset();await save('circle','After block');assert.deepEqual(await topics(),[viewer(a.host.id)]);
    assert.equal(await auth(a.friend,()=>scalar('select public.can_receive_discovery_invalidation($1)',[viewer(a.friend.id)])),true);
    assert.equal(await auth(a.stranger,()=>scalar('select public.can_receive_discovery_invalidation($1)',[viewer(a.friend.id)])),false);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[a.friend.session]);
    assert.equal(await auth(a.friend,()=>scalar('select public.can_receive_discovery_invalidation($1)',[viewer(a.friend.id)])),false,'expired session cannot authorize even its old viewer topic');
    await reset();await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin raise warning 'swallowed transport failure';end$$`);
    await save('public','Transport failed but authority saved');
    assert.deepEqual(await topics(),[]);
    assert.ok(await scalar("select count(*)::int from private.discovery_invalidation_outbox where status='pending' and attempts=1")>0,'unconfirmed primary remains durable retry, never completed');
    await db.exec(managedSend);const result=await scalar('select public.flush_discovery_invalidations(100)');
    assert.ok(result.completed>0,'existing real retry dispatcher recovers primary transport failure');
    for(const audience of ['public','circle']){
      const party=`HOST-LEAVE-${audience.toUpperCase()}`;
      await auth(a.host,()=>db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule) values($1,$2,'title',$3,'platform_title',$3,'premium')",[party,a.host.id,liveFixtureTitle]));
      await auth(a.host,()=>db.query("select public.join_watch_party_room_session($1,'Chosen room host')",[party]));
      const leaving=(await db.query('select * from public.watch_party_rooms where party_id=$1',[party])).rows[0];
      await auth(a.host,()=>db.query('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',
        [party,leaving.room_generation,Number(leaving.host_settings_revision),a.host.session,'open',audience,'Host presence fixture',leaving.source_type,leaving.source_id]));
      await reset();await auth(a.host,()=>db.query("select public.heartbeat_watch_party_room_session($1,'left',false,false)",[party]));
      if(audience==='public'){
        assert.ok((await topics()).includes('discovery:v1:surface:home'),'host membership loss immediately invalidates its prior public projection without a source-row write');
        assert.equal(await auth(a.stranger,()=>scalar('select count(*)::int from public.discovery_feed_items where source_id=$1',[party])),0);
      }else assert.deepEqual(await topics(),[viewer(a.host.id)],'Circle host loss withdraws only its actual prior audience, never broad public topics');
    }
    await reset();await db.query('delete from auth.sessions where id=$1',[a.host.session]);
    assert.ok((await topics()).includes('discovery:v1:surface:home'),'exact host-session revocation withdraws immediately without polling');
    assert.equal(await auth(a.stranger,()=>scalar("select count(*)::int from public.discovery_feed_items where source_id='PRIMARY-PARTY'")),0);
  } finally {await db.close();}
});
