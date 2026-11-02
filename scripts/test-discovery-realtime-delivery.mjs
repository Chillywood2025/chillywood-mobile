#!/usr/bin/env node
// Native transport qualification in the owned, ephemeral Actions Supabase
// cluster only. Real Auth, PostgREST, PostgreSQL/RLS and Realtime websocket SDK;
// no hosted-project URL, provider transport replacement or polling success path.
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {seedLiveRoomActor} from '../tests/helpers/live-room-authority-fixture.mjs';
import {assertDiscoveryHintPayload} from './lib/discovery-native-hint-contract.mjs';

if(process.argv.includes('--help')) {
  console.log('Runs real private Broadcast/RLS discovery proof in the cron-paused ephemeral local Supabase Actions cluster. No remote endpoint or arguments accepted.');
  process.exit(0);
}
assert.deepEqual(process.argv.slice(2),[]);
assert.equal(process.env.GITHUB_ACTIONS,'true','owned Actions cluster only');
assert.match(process.env.GITHUB_RUN_ID??'',/^\d+$/);
assert.equal(process.env.GITHUB_REPOSITORY,'Chillywood2025/chillywood-mobile');
assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT,'remote Docker overrides forbidden');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];
assert.equal(project,'chillywood-mobile');
const container=`supabase_db_${project}`;
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024}).trim();
const context=JSON.parse(docker(['context','inspect']))[0];
assert.match(context.Endpoints.docker.Host,/^unix:\/\//,'local Unix Docker daemon required');
const inspected=JSON.parse(docker(['inspect',container]))[0];
assert.equal(inspected.Name,`/${container}`);
assert.equal(inspected.Config.Labels['com.supabase.cli.project'],project);
const query=sql=>docker(['exec','-i',container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','discovery-realtime-native',
  'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],`set statement_timeout='20s';set time zone 'UTC';${sql};`);
assert.equal(query('show cron.launch_active_jobs'),'off','primary proof cannot be satisfied by the scheduled worker');
const managedClock=JSON.parse(query(`select jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid))
  from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='realtime.messages'::regclass and a.attname='inserted_at'`));
assert.equal(managedClock.type,'timestamp without time zone','qualify actual managed timestamp contract, never adapt it in the test');
assert.match(managedClock.default,/timezone\('utc'::text, clock_timestamp\(\)\)/,
  'managed Broadcast insertion must use wall-clock time, not transaction-start now()');
const lit=value=>value==null?'null':`'${String(value).replaceAll("'","''")}'`;
const bind=(sql,values)=>sql.replace(/\$(\d+)/g,(_,n)=>lit(values[Number(n)-1]));
const db={exec:async sql=>query(sql),query:async(sql,values=[])=>{
  const source=bind(sql,values);
  return /^\s*select\b/i.test(source)?{rows:JSON.parse(query(`select coalesce(json_agg(r),'[]') from (${source}) r`))}:(query(source),{rows:[]});
}};
const environment={};
for(const line of execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split(/\r?\n/)) {
  const split=line.indexOf('=');if(split<1)continue;
  const value=line.slice(split+1).trim();environment[line.slice(0,split).trim()]=value.startsWith('"')?JSON.parse(value):value;
}
assert.ok(['127.0.0.1','localhost'].includes(new URL(environment.API_URL).hostname),'local CLI API only');
assert.ok(environment.ANON_KEY&&environment.SERVICE_ROLE_KEY,'local ephemeral CLI keys required');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,
  signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)})}};
const admin=createClient(environment.API_URL,environment.SERVICE_ROLE_KEY,options);
const makeClient=()=>createClient(environment.API_URL,environment.ANON_KEY,options);
const noError=(response,label)=>{assert.equal(response.error,null,`${label}: ${response.error?.message??'unknown'}`);return response.data;};
const friendship=(response,label)=>{
  const data=noError(response,label);
  if(Array.isArray(data)){assert.equal(data.length,1,`${label}: one relationship`);return data[0];}
  assert.ok(data&&typeof data==='object',`${label}: relationship returned`);return data;
};
const timeout=(milliseconds,label)=>new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error(`${label}: timeout`)),milliseconds);timer.unref?.();});
const nonce=randomBytes(8).toString('hex'),party=`RTDISC${nonce}`.toUpperCase(),title=randomUUID();
const clients=[],actors=[],createdUserIds=[],observers=[],samples=[];
const initial=JSON.parse(query(`select jsonb_build_object('config',(select to_jsonb(c) from private.discovery_invalidation_worker_config c where singleton),
  'money',(select jsonb_agg(jsonb_build_object('key',key,'state',state)) from public.platform_money_kill_switches
    where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled'))) `));
assert.equal(typeof initial.config.primary_delivery_enabled,'boolean','transactional primary-hint migration required');
let roomCreated=false;
const canonicalKeys=new Map();
async function subscribe(client,topic,{denied=false}={}) {
  const channel=client.channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}});
  const observer={client,channel,topic,messages:[],pending:null,error:null};observers.push(observer);
  channel.on('broadcast',{event:'discovery:invalidate'},message=>{
    try {
      assertDiscoveryHintPayload(message.payload,[party,title,...actors.flatMap(a=>[a.id,a.session])]);
      observer.messages.push({payload:structuredClone(message.payload),at:performance.now()});
      observer.pending?.(observer.messages.at(-1));
    }catch(error){observer.error=error;observer.pending?.({error});}
  });
  const status=await Promise.race([new Promise((resolve,reject)=>channel.subscribe((value,error)=>{
    if(value==='SUBSCRIBED')resolve(value);
    else if(value==='CHANNEL_ERROR'){
      if(denied)resolve(value);else reject(error??Error('channel authorization failed'));
    }
    else if(value==='TIMED_OUT'||value==='CLOSED')reject(error??Error(`subscription ${value}`));
  })),timeout(8000,'private channel subscription')]);
  assert.equal(status,denied?'CHANNEL_ERROR':'SUBSCRIBED',`${topic}: exact receive-only RLS`);
  if(denied)await client.removeChannel(channel);
  return observer;
}
async function count(client,audience='public') {
  const result=await client.from(audience==='circle'?'circle_spectator_feed_items':'discovery_feed_items')
    .select('id',{count:'exact',head:true}).eq('source_type','party_room').eq('source_id',party);
  noError(result,`${audience} canonical viewer read`);return result.count;
}
async function observed(observer,label,mutation,read,expected) {
  assert.equal(observer.error,null);
  await delay(150);
  const watermark=query('select clock_timestamp()::text');
  const started=performance.now();let resolve,reject;
  const received=new Promise((yes,no)=>{resolve=yes;reject=no;});
  observer.pending=message=>{
    if(message.error){reject(message.error);return;}
    // A delayed earlier transaction cannot satisfy the current mutation. This
    // is an actual managed Broadcast row receipt, not a fabricated callback.
    const current=query(`select exists(select 1 from realtime.messages where extension='broadcast' and private is true
      and topic=${lit(observer.topic)} and event='discovery:invalidate' and payload=${lit(JSON.stringify(message.payload))}::jsonb
      and inserted_at>=(${lit(watermark)}::timestamptz at time zone 'UTC'))`)==='t';
    if(current) {
      const table=observer.topic.includes(':viewer:')?'circle_spectator_feed_items':'discovery_feed_items';
      const source=JSON.parse(query(`select jsonb_build_object('id',id,'key',discovery_hint_key) from public.${table}
        where source_type='party_room' and source_id=${lit(party)}`));
      assert.ok(source?.key,`${label}: exact canonical source retains its random footprint`);
      assert.ok(message.payload.keys.includes(source.key),`${label}: actual receipt carries the affected canonical source key`);
      assert.ok(!message.payload.keys.includes(source.id),'raw projection row identity never substitutes for an opaque key');
      if(canonicalKeys.has(table))assert.equal(source.key,canonicalKeys.get(table),'canonical key remains stable across settings, withdrawal and restart');
      canonicalKeys.set(table,source.key);
      if(table==='discovery_feed_items') {
        const titleKey=query(`select party_count_hint_key from public.titles where id=${lit(title)}`);
        assert.ok(message.payload.keys.includes(titleKey),`${label}: public title-count scope is reconciled by its opaque key`);
      }
      resolve(message);
    }
  };
  try {
    const primary=Promise.race([received,timeout(3000,`${label} primary Broadcast`)]);
    primary.catch(()=>undefined); // Retain the actual failure if the HTTP mutation also fails.
    await mutation();
    const receipt=await primary;
    const value=await read();assert.equal(value,expected,`${label}: fresh RLS projection, not hint content`);
    const receiptMs=Math.round(receipt.at-started),projectionMs=Math.round(performance.now()-started);
    assert.ok(receiptMs<3000,`${label}: healthy primary transport must not wait for the 10s scheduler`);
    samples.push({label,receiptMs,projectionMs});
  }finally{observer.pending=null;}
}
async function silent(observersToCheck,label,mutation) {
  await delay(200);const before=observersToCheck.map(o=>o.messages.length);
  await mutation();await delay(650);
  observersToCheck.forEach((o,i)=>{assert.equal(o.error,null);assert.equal(o.messages.length,before[i],`${label}: no unauthorized existence hint`);});
}

try {
  for(const kind of ['host','circle','outsider']) {
    const client=makeClient();clients.push(client);
    const email=`discovery-${kind}-${nonce}@example.invalid`,password=`Local-${randomBytes(16).toString('hex')}!`;
    const created=noError(await admin.auth.admin.createUser({email,password,email_confirm:true}),`create ${kind}`);
    createdUserIds.push(created.user.id);
    const session=noError(await client.auth.signInWithPassword({email,password}),`sign in ${kind}`).session;
    const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString('utf8'));
    assert.equal(claims.sub,created.user.id);assert.ok(claims.session_id);
    const actor={id:created.user.id,session:claims.session_id,client,token:session.access_token};actors.push(actor);
    await seedLiveRoomActor(db,actor,{premium:kind==='host'});
    await client.realtime.setAuth(actor.token);
  }
  const [host,friend,outsider]=actors;
  // Public target profiles intentionally permit instant-add. Make this
  // synthetic target private to exercise genuine pending/accept transitions.
  query(`insert into public.user_profiles(user_id,username,display_name,profile_access_visibility)
    values(${lit(friend.id)},${lit(`rt_circle_${nonce.slice(0,12)}`)},'Synthetic Circle viewer','private')
    on conflict(user_id) do update set profile_access_visibility='private'`);
  assert.equal(friendship(await host.client.rpc('request_friendship',{target_user_id:friend.id}),'actual Circle request').status,'pending');
  assert.equal(friendship(await friend.client.rpc('respond_to_friendship',{target_user_id:host.id,next_action:'accept'}),'actual Circle acceptance').status,'active');
  query(`insert into public.titles(id,title,video_url,is_published,status) values(${lit(title)},'Synthetic Realtime title','https://example.invalid/realtime.mp4',true,'published')`);
  query(`update private.discovery_invalidation_worker_config set collecting=true,enabled=true,primary_delivery_enabled=true,
    token_sha256=encode(extensions.digest(repeat('n',32),'sha256'),'hex') where singleton`);
  const home=await subscribe(outsider.client,'discovery:v1:surface:home');
  const circle=await subscribe(friend.client,`discovery:v1:viewer:${friend.id}`);
  const other=await subscribe(outsider.client,`discovery:v1:viewer:${outsider.id}`);
  await subscribe(outsider.client,`discovery:v1:viewer:${friend.id}`,{denied:true});
  const anonymous=makeClient();clients.push(anonymous);
  await subscribe(anonymous,'discovery:v1:surface:home',{denied:true});
  await subscribe(anonymous,`discovery:v1:viewer:${friend.id}`,{denied:true});
  const room=async()=>noError(await host.client.from('watch_party_rooms').select('*').eq('party_id',party).single(),'exact host room read');
  const settings=async(visibility,{publish=true,caption='Native discovery room'}={})=>{
    const r=await room();return noError(await host.client.rpc('set_watch_party_room_host_settings',{
      p_party_id:party,p_expected_room_generation:r.room_generation,p_expected_settings_revision:r.host_settings_revision,
      p_session_generation:host.session,p_join_policy:'open',p_discovery_visibility:visibility,p_discovery_title:caption,
      p_expected_source_type:r.source_type,p_expected_source_id:r.source_id,p_publish:publish,p_allow_owner_discovery:false,
    }),'actual versioned host settings');
  };
  await silent([home,other],'private preparation',async()=>{
    noError(await host.client.from('watch_party_rooms').insert({party_id:party,host_user_id:host.id,room_type:'title',title_id:title,
      source_type:'platform_title',source_id:title,content_access_rule:'premium'}),'actual private room creation');roomCreated=true;
    noError(await host.client.rpc('join_watch_party_room_session',{p_party_id:party,p_display_name:'Synthetic room host'}),'actual host join');
    await settings('private',{publish:false});
  });
  await observed(home,'public start',()=>settings('public'),()=>count(outsider.client),1);
  await observed(home,'delayed-transaction public Off withdrawal',async()=>{
    const r=await room(),claims=JSON.stringify({role:'authenticated',sub:host.id,session_id:host.session});
    query(`begin;set local role authenticated;set local request.jwt.claims=${lit(claims)};select pg_sleep(0.25);
      select public.set_watch_party_room_host_settings(${lit(party)},${lit(r.room_generation)},${r.host_settings_revision},${lit(host.session)},
        'open','private','Native discovery room',${lit(r.source_type)},${lit(r.source_id)},true,false);commit`);
  },()=>count(outsider.client),0);
  await silent([home,other],'private-only edit',()=>settings('private',{caption:'Still hidden'}));
  await observed(circle,'Circle start',()=>settings('circle'),()=>count(friend.client,'circle'),1);
  assert.equal(await count(outsider.client,'circle'),0,'outsider cannot hydrate Circle session');
  await silent([home,other],'Circle-only edit',async()=>{
    await observed(circle,'Circle title update',()=>settings('circle',{caption:'Current Circle title'}),()=>count(friend.client,'circle'),1);
  });
  await observed(circle,'Circle membership removed',()=>friend.client.rpc('respond_to_friendship',{target_user_id:host.id,next_action:'remove'})
    .then(r=>noError(r,'actual Circle removal')),()=>count(friend.client,'circle'),0);
  assert.equal(friendship(await host.client.rpc('request_friendship',{target_user_id:friend.id}),'actual Circle re-request').status,'pending');
  await observed(circle,'Circle membership accepted',()=>friend.client.rpc('respond_to_friendship',{target_user_id:host.id,next_action:'accept'})
    .then(r=>assert.equal(friendship(r,'actual Circle reacceptance').status,'active')),()=>count(friend.client,'circle'),1);
  await observed(circle,'Circle Off withdrawal',()=>settings('private'),()=>count(friend.client,'circle'),0);
  await silent([home,other,circle],'rolled-back publication',async()=>{
    const r=await room(),claims=JSON.stringify({role:'authenticated',sub:host.id,session_id:host.session});
    query(`begin;set local role authenticated;set local request.jwt.claims=${lit(claims)};
      select public.set_watch_party_room_host_settings(${lit(party)},${lit(r.room_generation)},${r.host_settings_revision},${lit(host.session)},
        'open','public','Rolled back',${lit(r.source_type)},${lit(r.source_id)},true,false);rollback`);
  });
  assert.equal(await count(outsider.client),0,'rollback retained private source and no websocket publication');
  await observed(home,'public restart listing',()=>settings('public'),()=>count(outsider.client),1);
  await observed(home,'host ends room',()=>host.client.from('watch_party_rooms').update({is_active:false}).eq('party_id',party)
    .then(r=>noError(r,'actual host end')),()=>count(outsider.client),0);
  await outsider.client.removeChannel(home.channel);
  noError(await host.client.from('watch_party_rooms').update({is_active:true}).eq('party_id',party),'actual same-code restart');
  noError(await host.client.rpc('join_watch_party_room_session',{p_party_id:party,p_display_name:'Synthetic room host'}),'fresh restart join');
  await settings('public');
  const reconnected=await subscribe(outsider.client,'discovery:v1:surface:home');
  assert.equal(await count(outsider.client),1,'reconnect read recovers current source without replaying a missed hint');
  await observed(reconnected,'post-reconnect Off',()=>settings('private'),()=>count(outsider.client),0);
  // An explicit local transport pause is the negative control. Without primary
  // delivery there is no callback until the REAL service-only retry worker runs.
  query('update private.discovery_invalidation_worker_config set primary_delivery_enabled=false where singleton');
  await silent([reconnected,other],'primary-disabled negative control',()=>settings('public'));
  assert.ok(Number(query(`select count(*) from private.discovery_invalidation_outbox o join public.discovery_feed_items d on d.id=o.source_id
    where d.source_type='party_room' and d.source_id=${lit(party)} and o.topic='discovery:v1:surface:home' and o.status='pending'`))>0,
    'undelivered source commit remains durable pending work');
  await observed(reconnected,'explicit durable fallback dispatch',()=>admin.rpc('flush_discovery_invalidations',{p_limit:100})
    .then(r=>noError(r,'actual service-only durable fallback')),()=>count(outsider.client),1);
  query('update private.discovery_invalidation_worker_config set primary_delivery_enabled=true where singleton');
  const peer=makeClient();clients.push(peer);await peer.realtime.setAuth(outsider.token);
  const peerObserver=await subscribe(peer,`discovery:v1:viewer:${outsider.id}`);
  const before=peerObserver.messages.length;
  const sent=await other.channel.send({type:'broadcast',event:'discovery:invalidate',payload:{id:randomUUID(),keys:[randomUUID()]}},{timeout:1000});
  assert.notEqual(sent,'ok','receive-only viewer channel cannot forge server invalidations');
  await delay(200);assert.equal(peerObserver.messages.length,before,'another real same-user socket received no forged message');
  await observed(circle,'Circle before viewer retirement',()=>settings('circle'),()=>count(friend.client,'circle'),1);
  await friend.client.removeChannel(circle.channel);
  query(`delete from auth.sessions where id=${lit(friend.session)}`);
  await subscribe(friend.client,`discovery:v1:viewer:${friend.id}`,{denied:true});
  assert.equal(await count(friend.client,'circle'),0,'revoked session cannot hydrate Circle data');
  await observed(reconnected,'public before host retirement',()=>settings('public'),()=>count(outsider.client),1);
  await observed(reconnected,'host session revoked',()=>query(`delete from auth.sessions where id=${lit(host.session)}`),
    ()=>count(outsider.client),0);
  console.log(JSON.stringify({proof:'native discovery primary transport',samples,cronLauncher:'off',
    assertions:'public/Circle start, privacy/end, actual membership loss, private/no-outside hints, exact RLS, rollback, reconnect, receive-only, viewer/host session retirement'}));
} finally {
  const cleanupFailures=[];
  const cleanup=async(label,operation)=>{try{await operation();}catch{cleanupFailures.push(label);}};
  for(const o of observers)await cleanup('remove synthetic channel',()=>o.client.removeChannel(o.channel));
  for(const client of clients)await client.auth.signOut({scope:'local'}).catch(()=>undefined);
  if(roomCreated)await cleanup('delete synthetic room',()=>query(`delete from public.watch_party_rooms where party_id=${lit(party)}`));
  await cleanup('delete synthetic title',()=>query(`delete from public.titles where id=${lit(title)}`));
  for(const id of createdUserIds)await cleanup('delete synthetic Auth user',async()=>noError(await admin.auth.admin.deleteUser(id),'synthetic user cleanup'));
  await cleanup('restore local discovery configuration',()=>query(`update private.discovery_invalidation_worker_config set collecting=${initial.config.collecting},enabled=${initial.config.enabled},
    primary_delivery_enabled=${initial.config.primary_delivery_enabled},token_sha256=${lit(initial.config.token_sha256)} where singleton`));
  for(const row of initial.money)await cleanup('restore local sandbox switch',()=>query(`update public.platform_money_kill_switches set state=${lit(row.state)} where key=${lit(row.key)}`));
  assert.deepEqual(cleanupFailures,[],'local fixture cleanup and operational settings restoration are required');
}
