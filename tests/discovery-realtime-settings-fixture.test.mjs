import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomActor,liveFixtureActors as actors,liveFixtureTitle as title,withLiveRoomActor,liveFixtureClaims} from './helpers/live-room-authority-fixture.mjs';

test('actual native runner settings explicitly unpause after legacy Off; omitted argument remains hidden', {timeout:180000},async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const scalar=async(sql,values=[])=>(Object.values((await db.query(sql,values)).rows[0]??{}))[0];
  const party='NATIVE-SETTINGS-PAUSE',host={...actors.host},friend=actors.friend;
  const auth=(actor,operation)=>withLiveRoomActor(db,actor,operation);
  const room=async()=>(await db.query('select * from public.watch_party_rooms where party_id=$1',[party])).rows[0];
  const script=fs.readFileSync('scripts/test-discovery-realtime-delivery.mjs','utf8');
  const start=script.indexOf('const settings=async('),end=script.indexOf('\n  };',start)+5;
  assert.ok(start>0&&end>start);const source=script.slice(start,end);
  const rpc=async(name,args)=>{
    assert.equal(name,'set_watch_party_room_host_settings');
    const keys=['p_party_id','p_expected_room_generation','p_expected_settings_revision','p_session_generation','p_join_policy',
      'p_discovery_visibility','p_discovery_title','p_expected_source_type','p_expected_source_id','p_publish','p_allow_owner_discovery'];
    if(Object.hasOwn(args,'p_discovery_paused'))keys.push('p_discovery_paused');
    const values=keys.map(key=>args[key]);
    const data=await auth(host,()=>scalar(`select public.set_watch_party_room_host_settings(${values.map((_,i)=>`$${i+1}`).join(',')})`,values));
    return {data,error:null};
  };
  host.client={rpc};
  const load=body=>vm.runInNewContext(`(()=>{${body};return settings;})()`,{room,host,party,noError:response=>{
    assert.equal(response.error,null);return response.data;
  }});
  const settings=load(source);
  const failureLogs=[];
  const diagnosticSource=script.slice(script.indexOf('async function reportMutationFailureState('),script.indexOf('async function observed('));
  const inspect=vm.runInNewContext(`(()=>{${diagnosticSource};return reportMutationFailureState;})()`,{
    assert,party,lit:value=>`'${String(value).replaceAll("'","''")}'`,
    query:async sql=>JSON.stringify(await scalar(sql)),console:{log:value=>failureLogs.push(JSON.parse(value))},
  });
  const observer={topic:`discovery:v1:viewer:${friend.id}`,channel:{state:'joined'}};
  const visible=()=>auth(friend,()=>scalar('select count(*)::int from public.circle_spectator_feed_items where source_id=$1',[party]));
  const reset=()=>db.exec('truncate realtime.fixture_outbox,realtime.messages');
  const topics=async()=>(await db.query('select distinct topic from realtime.fixture_outbox order by topic')).rows.map(row=>row.topic);
  try{
    // Only managed transport is local fixture code. All settings, privacy,
    // exact host/session, relationship and listing authority are real SQL.
    await db.exec(`alter table realtime.messages alter column id type uuid using null::uuid;
      alter table realtime.messages alter column id set default gen_random_uuid();
      alter table realtime.messages alter column inserted_at type timestamp without time zone using inserted_at at time zone 'UTC';
      alter table realtime.messages alter column inserted_at set default now();
      create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin
        insert into realtime.messages(payload,event,topic,private,extension) values($1,$2,$3,$4,'broadcast');
        insert into realtime.fixture_outbox values($1,$2,$3,$4);end$$;`);
    await seedLiveRoomActor(db,host);await seedLiveRoomActor(db,friend,{premium:false});
    await db.query("insert into public.user_profiles(user_id,username,display_name,profile_access_visibility) values($1,'native_settings_friend','Synthetic Circle viewer','private') on conflict(user_id) do update set profile_access_visibility='private'",[friend.id]);
    assert.equal((await auth(host,()=>db.query('select * from public.request_friendship($1)',[friend.id]))).rows[0].status,'pending');
    assert.equal((await auth(friend,()=>db.query("select * from public.respond_to_friendship($1,'accept')",[host.id]))).rows[0].status,'active');
    await db.query("insert into public.titles(id,title,video_url,is_published,status) values($1,'Native source fixture','https://example.invalid/source.mp4',true,'published')",[title]);
    await db.exec("update private.discovery_invalidation_worker_config set collecting=true,enabled=true,primary_delivery_enabled=true,token_sha256=repeat('a',64)");
    await auth(host,()=>db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule) values($1,$2,'title',$3,'platform_title',$3,'premium')",[party,host.id,title]));
    await auth(host,()=>db.query("select public.join_watch_party_room_session($1,'Native host')",[party]));
    assert.equal((await settings('private',{publish:false})).published,false);
    assert.equal((await settings('public')).published,true);
    assert.ok((await topics()).includes('discovery:v1:surface:home'));
    const legacyOff=load(source.replace(/\s*p_discovery_paused:[^,\n]+,/,''));
    const paused=await legacyOff('private');
    assert.equal(paused.discoveryPaused,true);assert.equal(paused.visibility,'public');assert.equal(paused.published,false);
    await reset();await settings('private',{caption:'Still hidden'});assert.deepEqual(await topics(),[]);
    const omitted=await legacyOff('circle');
    assert.equal(omitted.discoveryPaused,true,'old runner exactly reproduces the missing Circle hint');
    assert.equal(omitted.published,false);assert.deepEqual(await topics(),[],'legacy omission never silently widens listing');
    let watermark=await scalar('select clock_timestamp()::text');
    await inspect(observer,'Circle start',watermark,visible);
    assert.equal(failureLogs.at(-1).roomPaused,true);assert.equal(failureLogs.at(-1).canonicalCount,0);
    assert.equal(failureLogs.at(-1).managedReceiptRows,0);assert.deepEqual(failureLogs.at(-1).outbox,[]);
    watermark=await scalar('select clock_timestamp()::text');
    const resumed=await settings('circle');
    assert.equal(resumed.discoveryPaused,false,'native explicit On must not inherit prior pause');
    assert.equal(resumed.published,true);
    assert.deepEqual(await topics(),[`discovery:v1:viewer:${host.id}`,`discovery:v1:viewer:${friend.id}`].sort());
    assert.equal(Number(await auth(friend,()=>scalar('select count(*) from public.circle_spectator_feed_items where source_id=$1',[party]))),1);
    await inspect(observer,'Circle start',watermark,visible);
    assert.equal(failureLogs.at(-1).roomPaused,false);assert.equal(failureLogs.at(-1).canonicalCount,1);
    assert.ok(failureLogs.at(-1).managedReceiptRows>0);assert.ok(failureLogs.at(-1).managedKeyedReceiptRows>0);
    assert.ok(failureLogs.at(-1).outbox.every(row=>row.status==='complete'&&row.keyedRows>0));
    assert.doesNotMatch(JSON.stringify(failureLogs),/[0-9a-f]{8}-[0-9a-f]{4}|NATIVE-SETTINGS-PAUSE|discovery:v1:viewer/);
    await reset();const off=await settings('private');assert.equal(off.visibility,'circle');assert.equal(off.discoveryPaused,true);
    assert.deepEqual(await topics(),[`discovery:v1:viewer:${host.id}`,`discovery:v1:viewer:${friend.id}`].sort(),'Off withdraws only the actual prior Circle audience');
    await reset();assert.equal((await legacyOff('circle')).published,false);assert.deepEqual(await topics(),[]);
    const r=await room();await db.exec('begin');
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[liveFixtureClaims(host)]);
    await db.exec('set local role authenticated');
    const rolledBack=await scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true,false,false)',
      [party,r.room_generation,Number(r.host_settings_revision),host.session,'open','public','Rolled back',r.source_type,r.source_id]);
    assert.equal(rolledBack.published,true);assert.equal(rolledBack.discoveryPaused,false);
    await db.exec('reset role');assert.ok((await topics()).includes('discovery:v1:surface:home'),'rollback negative control genuinely creates transactional primary receipt');
    await db.exec('rollback');assert.deepEqual(await topics(),[]);assert.equal((await room()).discovery_paused,true);
    assert.equal((await settings('public')).published,true);assert.ok((await topics()).includes('discovery:v1:surface:home'));
  }finally{await db.close();}
});
