import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as a,liveFixtureTitle,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

test('opaque progress keys: immutable assignment, exact public/count scopes, multiple-source commit, Circle withdrawal and retry', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  const scalar=async(sql,p=[])=>(Object.values((await db.query(sql,p)).rows[0]??{}))[0];
  const auth=(actor,fn)=>withLiveRoomActor(db,actor,fn);
  const row=async id=>(await db.query('select * from public.watch_party_rooms where party_id=$1',[id])).rows[0];
  const save=async(id,visibility,title='Keyed current room')=>{const r=await row(id);return scalar(
    'select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',
    [id,r.room_generation,Number(r.host_settings_revision),a.host.session,'open',visibility,title,r.source_type,r.source_id]);};
  const reset=()=>db.exec('truncate realtime.fixture_outbox,realtime.messages');
  const keys=async(topic='discovery:v1:surface:home')=>(await db.query('select payload from realtime.fixture_outbox where topic=$1',[topic])).rows.flatMap(r=>r.payload.keys??[]);
  const projection=async(id,lane='discovery_feed_items')=>(await db.query(`select * from public.${lane} where source_type='party_room' and source_id=$1`,[id])).rows[0];
  try {
    await db.exec(`alter table realtime.messages alter column id type uuid using null::uuid;
      alter table realtime.messages alter column id set default gen_random_uuid();
      alter table realtime.messages alter column inserted_at type timestamp without time zone using inserted_at at time zone 'UTC';
      alter table realtime.messages alter column inserted_at set default timezone('utc',clock_timestamp());
      create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin
        insert into realtime.messages(payload,event,topic,private,extension) values($1,$2,$3,$4,'broadcast');
        insert into realtime.fixture_outbox values($1,$2,$3,$4);end$$;`);
    await seedLiveRoomAuthority(db);
    for(const fn of ['private.notification_discovery_hint_key(uuid,uuid)','private.discovery_projection_hint_keys(public.discovery_feed_items)',
      'private.bind_discovery_invalidation_keys()','private.guard_discovery_hint_key()',
      'public.read_public_party_room_counts_pre_hint_keys(text[])']) {
      assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')",[fn]),false,`${fn}: no direct helper authority`);
    }
    await db.exec("update private.discovery_invalidation_worker_config set collecting=true,enabled=true,token_sha256=repeat('a',64)");
    for(const id of ['KEY-A','KEY-B']) await auth(a.host,async()=>{
      await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule) values($1,$2,'title',$3,'platform_title',$3,'premium')",[id,a.host.id,liveFixtureTitle]);
      await db.query('select * from public.join_watch_party_room_session($1,\'Synthetic host\')',[id]);
    });
    await reset();await auth(a.host,async()=>{assert.equal((await save('KEY-A','public')).published,true);assert.equal((await save('KEY-B','public')).published,true);});
    const pA=await projection('KEY-A'),pB=await projection('KEY-B');
    const titleKey=await scalar('select party_count_hint_key from public.titles where id=$1',[liveFixtureTitle]);
    assert.notEqual(pA.discovery_hint_key,pA.id);assert.notEqual(pA.discovery_hint_key,pB.discovery_hint_key);
    assert.deepEqual(new Set(await keys()),new Set([pA.discovery_hint_key,pB.discovery_hint_key,titleKey]),'one transaction does not suppress unrelated source keys');
    assert.equal(await scalar("select count(*)::int from realtime.fixture_outbox where topic='discovery:v1:surface:home'"),2);
    const counts=await auth(a.friend,()=>scalar('select public.read_public_party_room_counts($1)',[[liveFixtureTitle]]));
    assert.equal(counts.total,2);assert.deepEqual(counts.scopes,[{titleId:liveFixtureTitle,key:titleKey}]);
    await db.query('update public.discovery_feed_items set discovery_hint_key=$2 where id=$1',[pA.id,pB.discovery_hint_key]);
    assert.equal((await projection('KEY-A')).discovery_hint_key,pA.discovery_hint_key,'even privileged assignment cannot rotate or collide an existing key');
    const newTitle='ac510002-0000-4000-8000-000000000002';
    await db.query("insert into public.titles(id,title,category,video_url,party_count_hint_key,is_published,status) values($1,'Second public title','test','https://example.invalid/second.mp4',$2,true,'published')",[newTitle,titleKey]);
    const newTitleKey=await scalar('select party_count_hint_key from public.titles where id=$1',[newTitle]);assert.notEqual(newTitleKey,titleKey,'caller-supplied INSERT keys are ignored');
    const zero=await auth(a.friend,()=>scalar('select public.read_public_party_room_counts($1)',[[newTitle]]));assert.equal(zero.total,0);assert.deepEqual(zero.scopes,[{titleId:newTitle,key:newTitleKey}]);
    await db.query("update public.titles set is_published=false where id=$1",[newTitle]);
    assert.deepEqual((await auth(a.friend,()=>scalar('select public.read_public_party_room_counts($1)',[[newTitle]]))).scopes,[],'hidden title has no key footprint');
    await db.query('update public.titles set is_published=true where id=$1',[newTitle]);await reset();
    await auth(a.host,async()=>{
      await db.query('update public.watch_party_rooms set title_id=$2,source_id=$2 where party_id=$1',['KEY-B',newTitle]);
      await db.query("select * from public.join_watch_party_room_session('KEY-B','Synthetic host')");
      assert.equal((await save('KEY-B','public','Changed underlying title')).published,true);
    });
    assert.ok((await keys()).includes(titleKey),'source change withdraws OLD public title count');
    assert.ok((await keys()).includes(newTitleKey),'same source transaction also identifies NEW public title count');
    await reset();
    const event=(await db.query(`insert into public.creator_events(host_user_id,event_title,event_type,status,starts_at,ends_at,visibility)
      values($1,'Synthetic upcoming key','live_first','scheduled',now()+interval '1 hour',now()+interval '2 hours','public') returning *`,[a.host.id])).rows[0];
    assert.ok((await keys()).includes(event.discovery_hint_key),'canonical upcoming events carry their independent progress key');
    await db.query('update public.creator_events set discovery_hint_key=$2 where id=$1',[event.id,pA.discovery_hint_key]);
    assert.equal(await scalar('select discovery_hint_key from public.creator_events where id=$1',[event.id]),event.discovery_hint_key);
    await reset();
    const primary=await scalar("select pg_get_functiondef('private.deliver_discovery_primary_hint()'::regprocedure)");
    const mutant=primary.replace(/ and o.source_table=new.source_table\s+and o.source_id=new.source_id and o.hint_keys @> new.hint_keys/u,'');
    assert.notEqual(mutant,primary,'negative control changes the actual source/key coalescing guard');
    await db.exec('begin');await db.exec(mutant);
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:a.host.id,session_id:a.host.session})]);
    await db.exec('set local role authenticated');await save('KEY-A','public','Mutant A');await save('KEY-B','public','Mutant B');
    await db.exec('reset role');
    assert.equal(await scalar("select count(*)::int from realtime.fixture_outbox where topic='discovery:v1:surface:home'"),1,'old topic-only dedupe reproduces loss of the second source hint');
    await db.exec('rollback');assert.equal(await scalar("select pg_get_functiondef('private.deliver_discovery_primary_hint()'::regprocedure)"),primary);
    await reset();await auth(a.host,()=>save('KEY-A','circle'));
    const circle=await projection('KEY-A','circle_spectator_feed_items');
    assert.notEqual(circle.discovery_hint_key,pA.discovery_hint_key,'audience lanes are independent opaque scopes');
    assert.ok((await keys()).includes(pA.discovery_hint_key));
    assert.ok((await keys(`discovery:v1:viewer:${a.friend.id}`)).includes(circle.discovery_hint_key));
    await reset();await db.query("update public.user_friendships set status='removed' where user_low_id=$1 and user_high_id=$2",[a.host.id,a.friend.id]);
    assert.ok((await keys(`discovery:v1:viewer:${a.friend.id}`)).includes(circle.discovery_hint_key),'relationship-only removal identifies the affected canonical row without changing its key');
    await reset();await auth(a.host,()=>save('KEY-A','private'));await reset();await auth(a.host,()=>save('KEY-A','private','Secret edit'));
    assert.equal(await scalar('select count(*)::int from realtime.fixture_outbox'),0);
    await reset();await db.exec('update private.discovery_invalidation_worker_config set primary_delivery_enabled=false');
    await auth(a.host,()=>save('KEY-B','public','Retry carries affected keys'));
    assert.equal(await scalar('select count(*)::int from realtime.fixture_outbox'),0);
    assert.ok((await scalar('select public.flush_discovery_invalidations(100)')).completed>0);
    assert.ok((await keys()).includes(pB.discovery_hint_key),'actual retry preserves keys, not a global dirty fence');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[a.friend.session]);
    assert.deepEqual((await auth(a.friend,()=>scalar('select public.read_public_party_room_counts($1)',[[liveFixtureTitle]]))).scopes,[]);
  } finally {await db.close();}
});
