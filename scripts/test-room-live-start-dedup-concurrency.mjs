#!/usr/bin/env node
// Native PostgreSQL, independent backends, disposable LOCAL full-schema clone.
// No provider request, remote URL, production mutation or historical backfill.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,liveFixtureTitle as title} from '../tests/helpers/live-room-authority-fixture.mjs';

if(process.argv.includes('--help')){console.log('Run after local Supabase reset including 20261101214821. Uses an owned local clone and real independent-backend lock schedules; no provider network.');process.exit(0);}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]+$/);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_live_start_dedup`;
const restore=createBrandGuardCloneRestorer({container});
const lit=x=>x==null?'null':`'${String(x).replaceAll("'","''")}'`;
const args=(db=database,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||r.stderr||''}`);return r.stdout;};
const query=(sql,db=database)=>ok(docker(args(db),`set statement_timeout='25s';set time zone 'UTC';${sql}`),'query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','live-start-dedup-fixture',...a],input,encoding);
const auth=(role='authenticated',actor=actors.host)=>`set local role ${role};set local request.jwt.claim.role=${lit(role)};set local request.jwt.claims=${lit(JSON.stringify({role,sub:actor.id,session_id:actor.session}))};`;
const rpc=(sql,role='authenticated',actor=actors.host)=>query(`begin;${auth(role,actor)}${sql};commit;`);
const row=id=>JSON.parse(query(`select row_to_json(r) from public.watch_party_rooms r where party_id=${lit(id)}`));
const settings=(r,paused)=>`select public.set_watch_party_room_host_settings(${lit(r.party_id)},${lit(r.room_generation)},${Number(r.host_settings_revision)},${lit(actors.host.session)},'open','public','Same creator, same title',${lit(r.source_type)},${lit(r.source_id)},true,false,${paused})`;
const publish=r=>`select public.publish_live_stage_discovery_current(${lit(r.party_id)},${lit(actors.host.id)},${lit(actors.host.session)},${lit(r.room_generation)},${Number(r.host_settings_revision)})`;
const prepare=e=>`select public.prepare_notification_activity(${lit(e.id)},${lit(e.lease_token)})`;
const reserve=(e,token)=>`select public.reserve_notification_activity_push(${lit(e.id)},${lit(e.lease_token)},${lit(token)})`;
const finish=e=>rpc(`select public.finish_notification_activity(${lit(e.id)},${lit(e.lease_token)})`,'service_role');
const complete=(e,token,status,error=null)=>rpc(`select public.complete_notification_activity_push(${lit(e.id)},${lit(e.lease_token)},${lit(token)},${lit(status)},${status==='sent'?lit('native-local-ticket'): 'null'},${lit(error)})`,'service_role');
const notificationCount=id=>Number(query(`select count(*) from public.notifications n join private.room_start_notification_bindings b on b.event_id::text=n.source_id
  where n.source_type='notification_activity' and b.party_id=${lit(id)} and b.recipient_user_id=${lit(actors.friend.id)}`));
const receipt=id=>JSON.parse(query(`select coalesce(jsonb_agg(d),'[]') from private.room_start_notification_deliveries d where party_id=${lit(id)} and recipient_user_id=${lit(actors.friend.id)}`));
const event=id=>JSON.parse(query(`select row_to_json(e) from public.notification_activity_events e where id=${lit(id)}`));
const refresh=ids=>{for(const id of new Set(ids))if(row(id).is_active)rpc(`select count(*) from public.join_watch_party_room_session(${lit(id)})`);};
const sessions=[];let cloned=false,schedules=0;
function session(sql){
  const name='live-start-dedup-'+randomUUID(),child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='30s';begin isolation level read committed;${sql};\n`);
  const s={name,child,done,output:()=>stdout};sessions.push(s);return s;
}
async function until(predicate,label='native lock edge'){
  const end=Date.now()+20000;while(Date.now()<end){if(predicate())return;await delay(25);}throw Error(`${label} was not observed`);
}
async function blocked(holder,waiter,expected){
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)}
    where w.datname=current_database() and h.datname=current_database() and w.application_name=${lit(waiter.name)}
      and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid))`)==='1');
  const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'blockers',pg_blocking_pids(w.pid),'waitEvent',w.wait_event)
    from pg_stat_activity w cross join pg_stat_activity h where w.datname=current_database() and h.datname=current_database()
      and w.application_name=${lit(waiter.name)} and h.application_name=${lit(holder.name)}`));
  assert.notEqual(evidence.holderPid,evidence.waiterPid);assert.ok(evidence.blockers.includes(evidence.holderPid));
  if(expected)assert.equal(evidence.waitEvent,expected,'the intended mutex, not an incidental lock');
  return evidence;
}
async function race(label,first,second,{rooms=[],waitEvent,after}={}){
  refresh(rooms);
  const a=session(`${first};select 'HOLDER_READY'`);await until(()=>a.output().includes('HOLDER_READY'));
  const b=session(`${second};commit;`);b.child.stdin.end();
  const evidence=await blocked(a,b,waitEvent);
  a.child.stdin.end('commit;\n');const ar=await a.done;assert.equal(ar.code,0,ar.stderr);
  const br=await b.done;assert.equal(br.code,0,br.stderr);assert.doesNotMatch(br.stderr,/deadlock detected|statement timeout|lock timeout/i);
  after?.(br);schedules++;console.log(JSON.stringify({schedule:label,...evidence}));
}
function preferences(patch){
  const current=JSON.parse(rpc('select public.read_my_notification_preferences()','authenticated',actors.friend));
  const result=JSON.parse(rpc(`select public.mutate_my_notification_preferences(${lit(randomUUID())},${lit(current.incarnation)},${lit(current.revision)},${lit(JSON.stringify(patch))}::jsonb)`,'authenticated',actors.friend));
  assert.ok(['applied','unchanged'].includes(result.status));
}
function approvedBroadcast(id,broadcastId,playbackId){
  // Only synthetic provider reports; real HLS/source/rights checks and all
  // new INSERT lifecycle-binding triggers remain installed and executable.
  query(`insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,
    hls_playback_url,playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
    values(${lit(broadcastId)},'watch_party_room',${lit(id)},${lit(actors.host.id)},${lit(actors.host.id)},'active_later',
      'https://example.invalid/native-dedup.m3u8','public_safe_available','creator_owned','public_free',true,true,false,false,'{"d7f_public_safe_approved":true}');
    insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,visibility,playback_status,playlist_path,
      rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket)
      values(${lit(playbackId)},${lit(broadcastId)},${lit(id)},${lit(actors.host.id)},'public','live','native/dedup.m3u8',
        'creator_owned','public_free',true,true,false,false)`);
}
function createPair(id,type='live',broadcastFirst=false){
  const create=`insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_title,content_access_rule,title_id,source_type,source_id)
    values(${lit(id)},${lit(actors.host.id)},${lit(type)},'public','Same creator, same title',${lit(type==='title'?'premium':'open')},${lit(type==='title'?title:null)},${lit(type==='title'?'platform_title':null)},${lit(type==='title'?title:null)})`;
  const attempts=Number(query(`select count(*) from public.abuse_rate_limit_events where actor_user_id=${lit(actors.host.id)}
    and action_key='watch_party_room_create' and target_key=${lit(type)} and created_at>now()-interval '10 minutes'`));
  if(attempts>=5){
    assert.throws(()=>rpc(create),/rate_limited/,'the real limiter is retained between independent synthetic cases');
    query(`update public.abuse_rate_limit_events set created_at=now()-interval '11 minutes' where actor_user_id=${lit(actors.host.id)} and action_key='watch_party_room_create' and target_key=${lit(type)}`);
  }
  rpc(`${create};select count(*) from public.join_watch_party_room_session(${lit(id)})`);
  const broadcastId=randomUUID(),playbackId=randomUUID();
  if(broadcastFirst)approvedBroadcast(id,broadcastId,playbackId);
  rpc(settings(row(id),false));if(type==='live')assert.equal(rpc(publish(row(id)),'service_role'),'t');
  if(!broadcastFirst)approvedBroadcast(id,broadcastId,playbackId);
  const bindings=JSON.parse(query(`select jsonb_agg(b) from private.room_start_notification_bindings b where party_id=${lit(id)} and recipient_user_id=${lit(actors.friend.id)}`));
  assert.equal(bindings.length,2,'both real producers create independently bound candidates');
  assert.ok(bindings.every(b=>b.room_generation===row(id).room_generation));
  query("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind not in ('followed_creator_live','circle_friend_live') and status='pending'");
  const wanted=new Set(bindings.map(b=>b.event_id));
  for(let i=0;i<10;i++){
    const claimed=JSON.parse(rpc("select coalesce(jsonb_agg(c.claim),'[]') from public.claim_notification_activity_batch(10) c(claim)",'service_role'));
    for(const c of claimed)if(!wanted.has(c.eventId)){
      const e=event(c.eventId);rpc(prepare(e),'service_role');finish(e);
    }
    if([...wanted].every(e=>event(e).status==='leased'))break;
  }
  const values=bindings.map(b=>({...event(b.event_id),sourceType:b.source_type}));
  assert.ok(values.every(e=>e.status==='leased'&&e.lease_token));
  return {id,type,broadcastId,playbackId,generation:row(id).room_generation,ordinary:values.find(e=>e.sourceType!=='broadcast'),broadcast:values.find(e=>e.sourceType==='broadcast')};
}
const closePair=f=>{
  for(const candidate of [f.ordinary,f.broadcast]){
    const current=event(candidate.id);
    if(current.status==='leased'){rpc(prepare(current),'service_role');finish(current);}
  }
  query(`update public.watch_party_rooms set is_active=false where party_id=${lit(f.id)}`);
};

try{
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
  assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//);
  assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').split('\n').includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101214821')",'postgres'),'t');
  ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  ok(dump,'read-only local dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  query('update private.discovery_invalidation_worker_config set collecting=false,enabled=false');
  const bind=(sql,params)=>sql.replace(/\$(\d+)/g,(_,n)=>lit(params[Number(n)-1]));
  await seedLiveRoomAuthority({exec:async sql=>query(sql),query:async(sql,params=[])=>{
    const text=bind(sql,params);return /^\s*select\b/i.test(text)?{rows:JSON.parse(query(`select coalesce(json_agg(t),'[]') from (${text}) t`))}:(query(text),{rows:[]});
  }});
  query(`update public.user_profiles set display_name='Native same creator',username='native_same_creator',profile_access_visibility='public' where user_id=${lit(actors.host.id)};
    delete from public.channel_followers where follower_user_id=${lit(actors.follower.id)} and channel_user_id=${lit(actors.host.id)}`);
  preferences({in_app_enabled:true,push_enabled:false});

  for(const type of ['live','title'])for(const reverse of [false,true]){
    const f=createPair(`NATIVE-DEDUP-${type.toUpperCase()}-${reverse?'BROADCAST':'ROOM'}`,type,reverse);
    const first=reverse?f.broadcast:f.ordinary,second=reverse?f.ordinary:f.broadcast;
    await race(`${type} and broadcast prepare serialize (${first.sourceType} first)`,auth('service_role')+prepare(first),auth('service_role')+prepare(second),{rooms:[f.id],waitEvent:'advisory'});
    assert.equal(notificationCount(f.id),1);assert.equal(receipt(f.id).length,1);assert.equal(receipt(f.id)[0].winner_event_id,first.id);
    assert.equal(event(second.id).status,'suppressed');closePair(f);
  }

  // Equal creator/title is not a deduplication domain. The second actual room
  // can materialize while the first room's delivery transaction remains open.
  const independentA=createPair('NATIVE-DEDUP-INDEPENDENT-A'),independentB=createPair('NATIVE-DEDUP-INDEPENDENT-B');
  refresh([independentA.id,independentB.id]);
  const independentHolder=session(`${auth('service_role')}${prepare(independentA.ordinary)};select 'HOLDER_READY'`);
  await until(()=>independentHolder.output().includes('HOLDER_READY'));
  const independentWaiter=session(`${auth('service_role')}${prepare(independentB.ordinary)};select 'INDEPENDENT_FINISHED';commit;`);independentWaiter.child.stdin.end();
  await until(()=>independentWaiter.output().includes('INDEPENDENT_FINISHED'),'independent room completion before holder release');
  assert.equal((await independentWaiter.done).code,0);independentHolder.child.stdin.end('commit;\n');assert.equal((await independentHolder.done).code,0);
  assert.equal(notificationCount(independentA.id),1);assert.equal(notificationCount(independentB.id),1);schedules++;
  console.log(JSON.stringify({schedule:'distinct rooms sharing creator/title do not block or coalesce'}));closePair(independentA);closePair(independentB);

  // Exact push ownership is synthetic but fully current: normal SQL ownership,
  // token fingerprint and actual auth.sessions gate; no provider call is made.
  const token=randomUUID();
  query(`insert into public.wave1_push_installation_ownership(platform,install_id,user_id,account_id,session_generation,ownership_state,revocation_credential_hash,last_operation_key,last_reason)
    values('ios','native-dedup-install',${lit(actors.friend.id)},${lit(actors.friend.id)},${lit(actors.friend.session)},'ACCOUNT_BOUND',repeat('a',64),'fixture','fixture');
    insert into public.user_push_tokens(id,user_id,platform,provider,token,token_hash,token_fingerprint,install_id,session_generation,ownership_state)
    values(${lit(token)},${lit(actors.friend.id)},'ios','expo','ExponentPushToken[native-dedup]','native-dedup-token','native-dedup-token','native-dedup-install',${lit(actors.friend.session)},'ACCOUNT_BOUND')`);
  preferences({in_app_enabled:false,push_enabled:true});
  for(const result of ['failed','unknown']){
    const f=createPair(`NATIVE-DEDUP-PUSH-${result.toUpperCase()}`);
    for(const e of [f.ordinary,f.broadcast])assert.equal(JSON.parse(rpc(prepare(e),'service_role')).eligible,true);
    assert.equal(receipt(f.id).length,0,'preparation with no in-app delivery consumes nothing');
    await race(`two push-only source reservations serialize before ${result} result`,auth('service_role')+reserve(f.ordinary,token),auth('service_role')+reserve(f.broadcast,token),{rooms:[f.id],waitEvent:'advisory'});
    assert.equal(Number(query(`select count(*) from public.notification_activity_pushes p join private.room_start_notification_bindings b on b.event_id=p.event_id where b.party_id=${lit(f.id)}`)),1);
    assert.equal(event(f.broadcast.id).status,'pending','possible send defers, not permanently suppresses, its competitor');
    assert.equal(complete(f.ordinary,token,result,result==='failed'?'MessageTooBig':'provider_result_unknown'),'t');finish(f.ordinary);
    await delay(5100);
    rpc('select count(*) from public.claim_notification_activity_batch(10)','service_role');f.broadcast=event(f.broadcast.id);
    assert.equal(f.broadcast.status,'leased');
    const prepared=JSON.parse(rpc(prepare(f.broadcast),'service_role'));
    if(result==='failed'){
      assert.equal(prepared.eligible,true);assert.equal(JSON.parse(rpc(reserve(f.broadcast,token),'service_role')).eligible,true);
      assert.equal(receipt(f.id)[0].winner_event_id,f.broadcast.id,'definitive push-only no-send allows the later authorized source');
      assert.equal(complete(f.broadcast,token,'sent'),'t');
    }else{
      assert.equal(prepared.eligible,false);assert.equal(event(f.broadcast.id).status,'suppressed');
      assert.equal(receipt(f.id)[0].winner_event_id,f.ordinary.id,'unknown send is fenced permanently');
    }
    assert.equal(notificationCount(f.id),0);closePair(f);
  }

  preferences({in_app_enabled:true,push_enabled:false});
  const paused=createPair('NATIVE-DEDUP-PAUSE');let r=row(paused.id);
  await race('pause commits before queued materialization',auth()+settings(r,true),auth('service_role')+prepare(paused.ordinary),{rooms:[paused.id]});
  assert.equal(notificationCount(paused.id),0);assert.equal(receipt(paused.id).length,0);
  assert.equal(JSON.parse(rpc(prepare(paused.broadcast),'service_role')).eligible,false);closePair(paused);
  const materialized=createPair('NATIVE-DEDUP-PREPARE-PAUSE');r=row(materialized.id);
  await race('materialization commits before pause without exposing a stale current CTA',auth('service_role')+prepare(materialized.ordinary),auth()+settings(r,true),{rooms:[materialized.id]});
  assert.equal(notificationCount(materialized.id),1,'audit row retained');
  const notice=JSON.parse(query(`select jsonb_agg(notification_id) from public.notification_activity_events where id=${lit(materialized.ordinary.id)}`));
  assert.equal(JSON.parse(rpc(`select public.read_my_notification_display_context(array[${lit(notice[0])}]::uuid[])`,'authenticated',actors.friend)).items[0].resolution,'unavailable');closePair(materialized);
  const restarted=createPair('NATIVE-DEDUP-RESTART'),oldGeneration=restarted.generation;
  await race('same-code end/restart wins before old candidate preparation',auth()+`update public.watch_party_rooms set is_active=false where party_id=${lit(restarted.id)};update public.watch_party_rooms set is_active=true where party_id=${lit(restarted.id)}`,
    auth('service_role')+prepare(restarted.ordinary),{rooms:[restarted.id]});
  assert.notEqual(row(restarted.id).room_generation,oldGeneration);assert.equal(notificationCount(restarted.id),0);assert.equal(receipt(restarted.id).length,0);
  assert.equal(JSON.parse(rpc(prepare(restarted.broadcast),'service_role')).eligible,false,'old HLS identity cannot bind itself to a new room generation');
  rpc(`select count(*) from public.join_watch_party_room_session(${lit(restarted.id)})`);rpc(settings(row(restarted.id),false));assert.equal(rpc(publish(row(restarted.id)),'service_role'),'t');
  const fresh=JSON.parse(query(`select row_to_json(e) from public.notification_activity_events e join private.room_start_notification_bindings b on b.event_id=e.id
    where b.party_id=${lit(restarted.id)} and b.room_generation=${lit(row(restarted.id).room_generation)} and b.source_type='live_stage' and b.recipient_user_id=${lit(actors.friend.id)}`));
  assert.ok(fresh);rpc('select count(*) from public.claim_notification_activity_batch(10)','service_role');const freshLease=event(fresh.id);
  assert.equal(JSON.parse(rpc(prepare(freshLease),'service_role')).eligible,true);assert.equal(notificationCount(restarted.id),1,'genuine new generation is independent');finish(freshLease);closePair(restarted);

  preferences({in_app_enabled:false,push_enabled:true});
  const reservePaused=createPair('NATIVE-DEDUP-RESERVE-PAUSE');r=row(reservePaused.id);
  assert.equal(JSON.parse(rpc(prepare(reservePaused.ordinary),'service_role')).eligible,true);
  await race('pause commits before push reservation',auth()+settings(r,true),auth('service_role')+reserve(reservePaused.ordinary,token),{rooms:[reservePaused.id]});
  assert.equal(query(`select count(*) from public.notification_activity_pushes where event_id=${lit(reservePaused.ordinary.id)}`),'0');
  assert.equal(receipt(reservePaused.id).length,0,'a newly ineligible reservation cannot consume the announcement');closePair(reservePaused);
  const reserveFirst=createPair('NATIVE-DEDUP-RESERVE-FIRST');r=row(reserveFirst.id);
  assert.equal(JSON.parse(rpc(prepare(reserveFirst.ordinary),'service_role')).eligible,true);
  await race('possible push reservation commits before pause',auth('service_role')+reserve(reserveFirst.ordinary,token),auth()+settings(r,true),{rooms:[reserveFirst.id]});
  assert.equal(query(`select status from public.notification_activity_pushes where event_id=${lit(reserveFirst.ordinary.id)}`),'sending');
  assert.equal(complete(reserveFirst.ordinary,token,'unknown','provider_result_unknown'),'t');finish(reserveFirst.ordinary);
  rpc(settings(row(reserveFirst.id),false));assert.equal(rpc(publish(row(reserveFirst.id)),'service_role'),'t');
  assert.equal(JSON.parse(rpc(prepare(reserveFirst.broadcast),'service_role')).eligible,false,'pause/resume cannot duplicate a possible prior OS send');closePair(reserveFirst);
  const reserveRestart=createPair('NATIVE-DEDUP-RESERVE-RESTART');
  assert.equal(JSON.parse(rpc(prepare(reserveRestart.broadcast),'service_role')).eligible,true);
  await race('end/restart commits before old broadcast push reservation',auth()+`update public.watch_party_rooms set is_active=false where party_id=${lit(reserveRestart.id)};update public.watch_party_rooms set is_active=true where party_id=${lit(reserveRestart.id)}`,
    auth('service_role')+reserve(reserveRestart.broadcast,token),{rooms:[reserveRestart.id]});
  assert.equal(query(`select count(*) from public.notification_activity_pushes where event_id=${lit(reserveRestart.broadcast.id)}`),'0');assert.equal(receipt(reserveRestart.id).length,0);closePair(reserveRestart);
  preferences({in_app_enabled:true,push_enabled:false});

  // Rollback-only removal of ONLY the advisory statement. The unmodified
  // first worker commits one legitimate materialization. The mutant second
  // worker reaches the receipt uniqueness wait instead of the intended mutex,
  // then sees TWO notices inside its own transaction; its mutation and extra
  // notice are rolled back. All original source/session/paid/privacy gates run.
  const negative=createPair('NATIVE-DEDUP-MUTEX-CONTROL');refresh([negative.id]);
  const signature='private.room_start_notification_delivery_state(private.room_start_notification_bindings)';
  const original=query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
  const needle="perform pg_advisory_xact_lock(hashtextextended('room-live-start:'||jsonb_build_array(b.party_id,b.room_generation,b.recipient_user_id)::text,0))";
  assert.equal(original.split(needle).length,2,'exact negative-control target');const mutant=original.replace(needle,'perform 1');
  const holder=session(`${auth('service_role')}${prepare(negative.ordinary)};select 'HOLDER_READY'`);await until(()=>holder.output().includes('HOLDER_READY'));
  const bypass=session(`${mutant};${auth('service_role')}${prepare(negative.broadcast)};reset role;
    select 'MUTANT_NOTICES_'||count(*) from public.notifications n join private.room_start_notification_bindings b on b.event_id::text=n.source_id
      where b.party_id=${lit(negative.id)} and b.recipient_user_id=${lit(actors.friend.id)};rollback;`);bypass.child.stdin.end();
  const edge=await blocked(holder,bypass,'transactionid');holder.child.stdin.end('commit;\n');assert.equal((await holder.done).code,0);
  const bypassResult=await bypass.done;assert.equal(bypassResult.code,0,bypassResult.stderr);assert.match(bypassResult.stdout,/MUTANT_NOTICES_2/);
  assert.equal(notificationCount(negative.id),1);assert.equal(query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`),original,'mutex removal rolled back');schedules++;
  console.log(JSON.stringify({schedule:'rollback-only missing mutex reproduces duplicate materialization',...edge}));closePair(negative);
  assert.equal(schedules,14);console.log('PASS native: fourteen independent-backend schedules; actual producer/claim/prepare/reserve/complete RPCs; source lifecycle/privacy fences and rollback-only duplicate negative control. No provider transport.');
}finally{
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try{if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop owned clone');}finally{restore.assertSourceUnchanged();}
}
