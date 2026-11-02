#!/usr/bin/env node
// Real PostgreSQL sessions in an owned disposable LOCAL full-schema clone.
// No remote URL, credential change, provider call, publication or deployment.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,liveFixtureTitle as title} from '../tests/helpers/live-room-authority-fixture.mjs';
import {approvedOrdinaryBroadcastSQL} from '../tests/helpers/ordinary-broadcast-discovery-fixture.mjs';
if(process.argv.includes('--help')){console.log('Run after local Supabase reset. Actual lock schedules and CAS negative control in generated disposable clone only.');process.exit(0);}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]+$/);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_live_settings`;
const restore=createBrandGuardCloneRestorer({container}),lit=x=>x==null?'null':`'${String(x).replaceAll("'","''")}'`;
const args=(db=database,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||r.stderr||''}`);return r.stdout;};
const query=(sql,db=database)=>ok(docker(args(db),`set statement_timeout='25s';set time zone 'UTC';${sql}`),'query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','live-settings-fixture',...a],input,encoding);
const auth=(role='authenticated',actor=actors.host)=>`set local role ${role};set local request.jwt.claim.role=${lit(role)};set local request.jwt.claims=${lit(JSON.stringify({role,sub:actor.id,session_id:actor.session}))};`;
const rpc=(sql,role='authenticated',actor=actors.host)=>query(`begin;${auth(role,actor)}${sql};commit;`);
const row=id=>JSON.parse(query(`select row_to_json(r) from public.watch_party_rooms r where party_id=${lit(id)}`));
const settings=(r,visibility,publish=true,caption='Native exact room',paused=visibility==='private')=>`select public.set_watch_party_room_host_settings(${lit(r.party_id)},${lit(r.room_generation)},${Number(r.host_settings_revision)},${lit(actors.host.session)},'open',${lit(visibility)},${lit(caption)},${lit(r.source_type)},${lit(r.source_id)},${publish},false,${paused})`;
const publish=r=>`select public.publish_live_stage_discovery_current(${lit(r.party_id)},${lit(actors.host.id)},${lit(actors.host.session)},${lit(r.room_generation)},${Number(r.host_settings_revision)})`;
const sessions=[];let cloned=false,count=0;
function session(sql){
  const name='live-settings-native-'+randomUUID(),child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='30s';begin isolation level read committed;${sql};\n`);
  const s={child,name,done,output:()=>stdout};sessions.push(s);return s;
}
async function until(fn){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error('actual backend blocking edge not observed');}
async function race(label,first,second,{error,after,waitEvent}={}){
  // Refresh through the real join boundary so slow hosted provisioning does
  // not turn this row-lock test into an unrelated 45-second presence expiry.
  rpc(`select count(*) from public.watch_party_rooms r
    cross join lateral public.join_watch_party_room_session(r.party_id) m
    where r.host_user_id=${lit(actors.host.id)} and r.is_active`);
  const a=session(`${first};select 'HOLDER_READY'`);await until(()=>a.output().includes('HOLDER_READY'));
  const b=session(`${second};commit;`);b.child.stdin.end();
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(a.name)}
    where w.datname=current_database() and h.datname=current_database() and w.application_name=${lit(b.name)}
      and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1');
  const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'blockers',pg_blocking_pids(w.pid),'waitEvent',w.wait_event)
    from pg_stat_activity w cross join pg_stat_activity h where w.datname=current_database() and h.datname=current_database()
      and w.application_name=${lit(b.name)} and h.application_name=${lit(a.name)}`));
  assert.notEqual(evidence.holderPid,evidence.waiterPid);assert.ok(evidence.blockers.includes(evidence.holderPid));
  if(waitEvent)assert.equal(evidence.waitEvent,waitEvent,'the intended authority lock, not an incidental row wait');
  a.child.stdin.end('commit;\n');const ar=await a.done;assert.equal(ar.code,0,ar.stderr);
  const br=await b.done;assert.doesNotMatch(br.stderr,/deadlock detected|statement timeout|lock timeout/i);
  if(error){assert.notEqual(br.code,0);assert.match(br.stderr,error);}else assert.equal(br.code,0,br.stderr);
  after?.(br);count++;console.log(JSON.stringify({schedule:label,...evidence}));
}
try {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
  assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//);
  assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').split('\n').includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101194927')",'postgres'),'t');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101202330')",'postgres'),'t');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101211908')",'postgres'),'t');
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101210306')",'postgres'),'t');
  ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  ok(dump,'local read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  query('update private.discovery_invalidation_worker_config set collecting=false,enabled=false');
  const bind=(sql,params)=>sql.replace(/\$(\d+)/g,(_,n)=>lit(params[Number(n)-1]));
  await seedLiveRoomAuthority({exec:async sql=>query(sql),query:async(sql,params=[])=>{
    const text=bind(sql,params);return /^\s*select\b/i.test(text)?{rows:JSON.parse(query(`select coalesce(json_agg(t),'[]') from (${text}) t`))}:(query(text),{rows:[]});
  }});
  rpc(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,source_type,source_id,title_id,content_access_rule)
    values('NATIVE-SETTINGS-PARTY',${lit(actors.host.id)},'title','platform_title',${lit(title)},${lit(title)},'premium');
    select count(*) from public.join_watch_party_room_session('NATIVE-SETTINGS-PARTY')`);
  let r=row('NATIVE-SETTINGS-PARTY');rpc(settings(r,'public'));r=row(r.party_id);
  await race('newer Off wins over stale concurrent Public',auth()+settings(r,'private'),auth()+settings(r,'public'),{error:/room_host_settings_conflict/});
  assert.equal(row(r.party_id).discovery_visibility,'public');assert.equal(row(r.party_id).discovery_paused,true);assert.equal(query(`select private.party_room_publication_current(${lit(r.party_id)})`),'f');
  r=row(r.party_id);rpc(settings(r,'public'));r=row(r.party_id);
  const countBefore=query(`select count(*) from public.notification_activity_events where source_id=${lit(r.party_id)} and context->>'sourceType'='party_room'`);
  await race('duplicate explicit publication retries serialize on exact room',auth()+settings(r,'public'),auth()+settings(r,'public'));
  assert.equal(query(`select count(*) from public.notification_activity_events where source_id=${lit(r.party_id)} and context->>'sourceType'='party_room'`),countBefore);
  rpc(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule,discovery_visibility)
    values('NATIVE-SETTINGS-LIVE',${lit(actors.host.id)},'live','open','public');select count(*) from public.join_watch_party_room_session('NATIVE-SETTINGS-LIVE')`);
  r=row('NATIVE-SETTINGS-LIVE');
  await race('Off commits before delayed provider confirmation',auth()+settings(r,'private'),auth('service_role')+publish(r),{after:b=>assert.equal(b.stdout.trim(),'f')});
  r=row(r.party_id);rpc(settings(r,'public'));r=row(r.party_id);
  await race('provider publication commits before Off',auth('service_role')+publish(r),auth()+settings(r,'private'));
  assert.equal(query(`select private.live_stage_publication_current(${lit(r.party_id)})`),'f');
  r=row(r.party_id);rpc(settings(r,'public'));r=row(r.party_id);
  await race('same-code End and restart invalidate delayed provider confirmation',auth()+`update public.watch_party_rooms set is_active=false where party_id=${lit(r.party_id)};
    update public.watch_party_rooms set is_active=true where party_id=${lit(r.party_id)}`,auth('service_role')+publish(r),{after:b=>assert.equal(b.stdout.trim(),'f')});
  assert.notEqual(row(r.party_id).room_generation,r.room_generation);
  // The negative control removes ONLY the compare-and-set condition in this
  // owned clone transaction. All real session/role/host/source/RLS gates remain.
  const signature='public.set_watch_party_room_host_settings(text,uuid,bigint,text,text,text,text,text,text,boolean,boolean,boolean)';
  const original=query(`select pg_get_functiondef(${lit(signature)}::regprocedure)`);
  const needle='r.room_generation is distinct from p_expected_room_generation or r.host_settings_revision is distinct from p_expected_settings_revision';
  assert.equal(original.split(needle).length,2);
  const stale=row('NATIVE-SETTINGS-PARTY');rpc(settings(stale,'private'));
  rpc(`select count(*) from public.join_watch_party_room_session(${lit(stale.party_id)})`);
  assert.throws(()=>rpc(settings(stale,'public')),/room_host_settings_conflict/);
  const mutant=original.replace(needle,'false');
  const negative=query(`begin;${mutant};${auth()}${settings(stale,'public')};rollback;`);
  assert.match(negative,/"visibility": "public"/,'removing the CAS guard admits the forbidden stale mutation');
  assert.match(negative,/"discoveryPaused": false/,'stale mutation genuinely reverses the latest listing pause, not merely its audience label');
  assert.equal(row(stale.party_id).discovery_visibility,'public');assert.equal(row(stale.party_id).discovery_paused,true,'negative control rolled back');
  assert.equal(count,5,'original room CAS/provider-lock schedules remain intact');

  // Recipient bookkeeping runs against actual publication and friendship
  // authority. Dispatch is intentionally disabled: this clone excludes managed
  // Realtime; a separate native SDK runner proves actual Broadcast delivery.
  // These synthetic recipients choose private Profiles so the supported
  // request path is pending -> recipient acceptance, not instant public add.
  query(`insert into public.user_profiles(user_id,username,display_name,profile_access_visibility)
    values(${lit(actors.friend.id)},'hint_circle_friend','Native Circle recipient','private'),(${lit(actors.follower.id)},'hint_circle_second','Native second recipient','private')
    on conflict(user_id) do update set profile_access_visibility='private'`);
  query('update private.discovery_invalidation_worker_config set collecting=true,enabled=false');
  const restoreFriend=actor=>{
    rpc(`select public.request_friendship(${lit(actor.id)})`);
    rpc(`select public.respond_to_friendship(${lit(actors.host.id)},'accept')`,'authenticated',actor);
  };
  const removeFriend=actor=>auth('authenticated',actor)+`select public.respond_to_friendship(${lit(actors.host.id)},'remove')`;
  const receiptCount=actor=>query(`select count(*) from private.circle_discovery_hint_recipients h
    join public.circle_spectator_feed_items d on d.id=h.item_id where d.source_id='NATIVE-SETTINGS-PARTY'
      and h.recipient_user_id=${lit(actor.id)}`);
  r=row('NATIVE-SETTINGS-PARTY');rpc(settings(r,'circle'));assert.equal(receiptCount(actors.friend),'1');
  r=row(r.party_id);
  await race('Circle removal commits before source republication',removeFriend(actors.friend),auth()+settings(r,'circle',true,'After exact Circle removal'),{waitEvent:'advisory'});
  assert.equal(receiptCount(actors.friend),'0','new source snapshot cannot re-add removed Circle recipient');
  restoreFriend(actors.friend);r=row(r.party_id);
  await race('Circle publication commits before recipient removal',auth()+settings(r,'circle',true,'Before exact Circle removal'),removeFriend(actors.friend),{waitEvent:'advisory'});
  assert.equal(receiptCount(actors.friend),'0','withdrawal retires the committed publication recipient');
  restoreFriend(actors.friend);restoreFriend(actors.follower);
  assert.equal(receiptCount(actors.friend),'1');assert.equal(receiptCount(actors.follower),'1');
  await race('two different same-host Circle relationship updates serialize without row-lock cycle',removeFriend(actors.friend),removeFriend(actors.follower),{waitEvent:'advisory'});
  assert.equal(receiptCount(actors.friend),'0');assert.equal(receiptCount(actors.follower),'0');
  restoreFriend(actors.friend);
  const lockSQL=`select private.lock_discovery_hint_hosts(array[${lit(actors.host.id)}])`;
  await race('recipient mutation really waits for the exact host snapshot mutex',lockSQL,removeFriend(actors.friend),{waitEvent:'advisory'});
  restoreFriend(actors.friend);

  // Negative control changes ONLY the advisory-lock statement inside this
  // connection's rollback transaction. Other connections retain the real
  // function; session, friendship and recipient-authority checks are unchanged.
  const lockSignature='private.lock_discovery_hint_hosts(text[])';
  const lockDefinition=query(`select pg_get_functiondef(${lit(lockSignature)}::regprocedure)`);
  const lockNeedle='perform pg_advisory_xact_lock(190731,hashtext(host_text))';
  assert.equal(lockDefinition.split(lockNeedle).length,2);
  const lockMutant=lockDefinition.replace(lockNeedle,'perform 1');
  const holder=session(`${lockSQL};select 'HOLDER_READY'`);await until(()=>holder.output().includes('HOLDER_READY'));
  const bypass=session(`${lockMutant};${removeFriend(actors.friend)};select 'MUTANT_FINISHED_WHILE_MUTEX_HELD';rollback;`);
  bypass.child.stdin.end();
  await until(()=>bypass.output().includes('MUTANT_FINISHED_WHILE_MUTEX_HELD'));
  assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid
    where a.datname=current_database() and a.application_name=${lit(holder.name)} and l.locktype='advisory' and l.granted`),'1');
  const bypassResult=await bypass.done;assert.equal(bypassResult.code,0,bypassResult.stderr);
  holder.child.stdin.end('rollback;\n');const holderResult=await holder.done;assert.equal(holderResult.code,0,holderResult.stderr);
  assert.equal(receiptCount(actors.friend),'1','negative control recipient mutation rolled back');
  assert.equal(query(`select pg_get_functiondef(${lit(lockSignature)}::regprocedure)`),lockDefinition,'negative control lock definition rolled back');
  assert.equal(count,9);

  // Genuine private attendance: actual opt-in, Circle acceptance, session join,
  // sustained heartbeat, worker claim and worker preparation. No forged event,
  // notification, receipt, authority gate or caller identity substitutes.
  for(const [key,actor] of Object.entries(actors))query(`insert into public.user_profiles(user_id,username,display_name,profile_access_visibility)
    values(${lit(actor.id)},${lit(`attendance_${key}`)},${lit(`Native attendance ${key}`)},'private')
    on conflict(user_id) do update set profile_access_visibility='private',display_name=excluded.display_name`);
  const connect=(from,to)=>{
    rpc(`select public.request_friendship(${lit(to.id)})`,'authenticated',from);
    rpc(`select public.respond_to_friendship(${lit(from.id)},'accept')`,'authenticated',to);
  };
  connect(actors.friend,actors.stranger);connect(actors.friend,actors.follower);connect(actors.host,actors.stranger);
  const attendance=[
    {id:'NATIVE-ATTENDANCE-LEAVE-FIRST',host:actors.host,actor:actors.stranger,viewer:actors.friend},
    {id:'NATIVE-ATTENDANCE-PREPARE-FIRST',host:actors.host,actor:actors.stranger,viewer:actors.friend},
    {id:'NATIVE-ATTENDANCE-THIRD-HOST-A',host:actors.host,actor:actors.friend,viewer:actors.follower},
    {id:'NATIVE-ATTENDANCE-THIRD-HOST-C',host:actors.follower,actor:actors.stranger,viewer:actors.host},
    {id:'NATIVE-ATTENDANCE-MUTANT',host:actors.host,actor:actors.stranger,viewer:actors.friend},
  ];
  const optedIn=new Set();
  for(const f of attendance){
    const preferenceKey=f.actor.id+':'+f.viewer.id;
    if(!optedIn.has(preferenceKey)){
      rpc(`select public.set_person_notification_preferences(${lit(f.actor.id)},null,null,true,0)`,'authenticated',f.viewer);
      optedIn.add(preferenceKey);
    }
    rpc(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,join_policy,content_access_rule)
      values(${lit(f.id)},${lit(f.host.id)},'live','private','open','open')`,'authenticated',f.host);
    for(const person of [f.host,f.viewer,f.actor])rpc(`select count(*) from public.join_watch_party_room_session(${lit(f.id)},${lit('Native attendance member')})`,'authenticated',person);
  }
  await delay(11000);
  for(const f of attendance)rpc(`select public.heartbeat_watch_party_room_session(${lit(f.id)},'active',false,false)`,'authenticated',f.actor);
  query(`insert into public.notification_activity_worker_config(singleton,enabled,token_sha256)
    values(true,true,repeat('a',64)) on conflict(singleton) do update set enabled=true,token_sha256=excluded.token_sha256`);
  // The real RPC intentionally caps each claim batch at ten. Earlier public
  // fixture events remain intact; drain claims rather than rewriting statuses.
  for(let attempt=0;attempt<10;attempt++){
    rpc('select count(*) from public.claim_notification_activity_batch(10)','service_role');
    if(query(`select count(*) from public.notification_activity_events where source_id in(${attendance.map(f=>lit(f.id)).join(',')}) and status='pending'`)==='0')break;
  }
  for(const f of attendance){
    f.event=JSON.parse(query(`select row_to_json(e) from public.notification_activity_events e
      where e.event_kind='live_room_member_joined' and e.source_id=${lit(f.id)} and e.actor_user_id=${lit(f.actor.id)}
        and e.recipient_user_id=${lit(f.viewer.id)}`));
    assert.equal(f.event.status,'leased');assert.ok(f.event.lease_token);
  }
  const prepare=f=>auth('service_role',f.host)+`select public.prepare_notification_activity(${lit(f.event.id)},${lit(f.event.lease_token)})`;
  const leave=f=>auth('authenticated',f.viewer)+`select public.heartbeat_watch_party_room_session(${lit(f.id)},'left',false,false)`;
  const receipt=f=>query(`select count(*) from private.room_attendance_hint_receipts where event_id=${lit(f.event.id)}`);
  await race('private recipient leave commits before in-flight materialization receipt',leave(attendance[0]),prepare(attendance[0]),{waitEvent:'advisory'});
  assert.equal(receipt(attendance[0]),'0','fresh read after materialization mutex must not retain the already-left recipient');
  assert.equal(query(`select materialized_at is not null from public.notification_activity_events where id=${lit(attendance[0].event.id)}`),'t',
    'actual worker reached materialization; receipt authority, not a fake preparation rejection, closed the race');
  await race('private materialization commits before recipient leave',prepare(attendance[1]),leave(attendance[1]),{waitEvent:'advisory'});
  assert.equal(receipt(attendance[1]),'0','committed receipt is withdrawn and retired by the real member mutation');
  for(const f of attendance.slice(2,4)){rpc(`select public.prepare_notification_activity(${lit(f.event.id)},${lit(f.event.lease_token)})`,'service_role',f.host);assert.equal(receipt(f),'1');}
  await race('crossing actor pairs acquire sorted third-party attendance host union without deadlock',
    auth('authenticated',actors.friend)+`select public.respond_to_friendship(${lit(actors.follower.id)},'remove')`,
    auth('authenticated',actors.stranger)+`select public.respond_to_friendship(${lit(actors.host.id)},'remove')`,{waitEvent:'advisory'});
  for(const f of attendance.slice(2,4))assert.equal(receipt(f),'0','Circle withdrawal retires third-host attendance receipt');
  const attendanceHolder=session(`${leave(attendance[4])};select 'HOLDER_READY'`);
  await until(()=>attendanceHolder.output().includes('HOLDER_READY'));
  const attendanceBypass=session(`${lockMutant};${prepare(attendance[4])};reset role;
    select 'MUTANT_ATTENDANCE_RECEIPT_'||count(*) from private.room_attendance_hint_receipts
      where event_id=${lit(attendance[4].event.id)};rollback;`);
  attendanceBypass.child.stdin.end();
  await until(()=>attendanceBypass.output().includes('MUTANT_ATTENDANCE_RECEIPT_1'));
  assert.equal(query(`select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid
    where a.datname=current_database() and a.application_name=${lit(attendanceHolder.name)} and l.locktype='advisory' and l.granted
      and l.classid=190731::oid and l.objid=(hashtext(${lit(actors.host.id)})::bigint & 4294967295)::oid and l.objsubid=2`),'1',
    'removing only the mutex retains a receipt from the pre-leave snapshot while the real retirement transaction is uncommitted');
  const attendanceBypassResult=await attendanceBypass.done;assert.equal(attendanceBypassResult.code,0,attendanceBypassResult.stderr);
  attendanceHolder.child.stdin.end('rollback;\n');assert.equal((await attendanceHolder.done).code,0);
  assert.equal(receipt(attendance[4]),'0','mutated worker materialization rolled back');
  assert.equal(query(`select pg_get_functiondef(${lit(lockSignature)}::regprocedure)`),lockDefinition);
  assert.equal(count,12);
  rpc(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule)
    values('NATIVE-REJOIN',${lit(actors.host.id)},'live','open');select count(*) from public.join_watch_party_room_session('NATIVE-REJOIN')`);
  rpc("select count(*) from public.join_watch_party_room_session('NATIVE-REJOIN')",'authenticated',actors.friend);
  rpc("select public.heartbeat_watch_party_room_session('NATIVE-REJOIN','left',false,false)",'authenticated',actors.friend);
  await race('two current-session rejoin requests serialize one new attendance interval',
    auth('authenticated',actors.friend)+"select count(*) from public.join_watch_party_room_session('NATIVE-REJOIN')",
    auth('authenticated',actors.friend)+"select count(*) from public.join_watch_party_room_session('NATIVE-REJOIN')",{waitEvent:'advisory'});
  assert.equal(query(`select membership_state='active' and left_at is null and role='viewer' and stage_role='listener' and not can_speak
    from public.watch_party_room_memberships where party_id='NATIVE-REJOIN' and user_id=${lit(actors.friend.id)}`),'t');
  const identitySignature='public.enforce_watch_party_membership_identity()',identityFixed=query(`select pg_get_functiondef(${lit(identitySignature)}::regprocedure)`);
  const identitySource=readFileSync('supabase/migrations/202608250001_chilly_chat_room_authority_closure.sql','utf8');
  const identityOld=identitySource.slice(identitySource.indexOf('create or replace function public."enforce_watch_party_membership_identity"()'),
    identitySource.indexOf('\ndrop trigger if exists "enforce_watch_party_membership_identity"'));
  rpc("select public.heartbeat_watch_party_room_session('NATIVE-REJOIN','left',false,false)",'authenticated',actors.friend);
  const oldIdentityResult=docker(args(),`begin;${identityOld}${auth('authenticated',actors.friend)}select count(*) from public.join_watch_party_room_session('NATIVE-REJOIN');commit;`);
  assert.notEqual(oldIdentityResult.status,0);assert.match(oldIdentityResult.stderr,/watch_party_membership_identity_immutable/,'original guard must reproduce actual rejoin failure');
  assert.equal(query(`select pg_get_functiondef(${lit(identitySignature)}::regprocedure)`),identityFixed,'failed original-guard transaction rolled back');
  rpc("select count(*) from public.join_watch_party_room_session('NATIVE-REJOIN')",'authenticated',actors.friend);
  const forgedRejoin=docker(args(),`begin;${auth('authenticated',actors.friend)}set local app.watch_party_membership_authority='server';
    update public.watch_party_room_memberships set joined_at=now() where party_id='NATIVE-REJOIN' and user_id=${lit(actors.friend.id)};commit;`);
  assert.notEqual(forgedRejoin.status,0);assert.match(forgedRejoin.stderr,/permission denied|row-level security/);
  assert.equal(count,13);
  r=row('NATIVE-SETTINGS-PARTY');rpc(settings(r,'circle',true,'Current admitted Circle',false));
  rpc("select count(*) from public.join_watch_party_room_session('NATIVE-SETTINGS-PARTY')",'authenticated',actors.friend);
  r=row(r.party_id);
  await race('Circle listing pause commits before stale unpause without expanding admission',
    auth()+settings(r,'circle',true,'Current admitted Circle',true),auth()+settings(r,'circle',true,'Current admitted Circle',false),{error:/room_host_settings_conflict/});
  assert.equal(row(r.party_id).discovery_visibility,'circle');assert.equal(row(r.party_id).discovery_paused,true);
  assert.equal(query(`select private.party_room_admission_source_current(${lit(r.party_id)})`),'t');
  const viewerAdmission=()=>JSON.parse(rpc(`select public.resolve_watch_party_livekit_viewer_authority(${lit(r.party_id)},${lit(actors.friend.id)},${lit(actors.friend.session)})`,'service_role',actors.friend));
  assert.equal(viewerAdmission().allowed,true,'pause preserves current Circle member source/session/Premium admission');
  const admissionSignature='public.resolve_watch_party_livekit_pre_reserved_claim(text,uuid,uuid)';
  const admissionDefinition=query(`select pg_get_functiondef(${lit(admissionSignature)}::regprocedure)`);
  assert.equal(admissionDefinition.split('private.party_room_admission_source_current').length,3);
  const oldAdmission=admissionDefinition.replaceAll('private.party_room_admission_source_current','private.party_room_publication_current');
  const wronglyEjected=JSON.parse(query(`begin;${oldAdmission};${auth('service_role',actors.friend)}
    select public.resolve_watch_party_livekit_viewer_authority(${lit(r.party_id)},${lit(actors.friend.id)},${lit(actors.friend.session)});rollback;`));
  assert.equal(wronglyEjected.allowed,false,'old publication dependency reproduces actual paused Circle ejection');
  assert.equal(query(`select pg_get_functiondef(${lit(admissionSignature)}::regprocedure)`),admissionDefinition);
  assert.equal(viewerAdmission().allowed,true);
  await race('exact host join proof commits before same-code End and restart',
    auth()+`select count(*) from public.join_watch_party_room_session(${lit(r.party_id)})`,
    auth()+`update public.watch_party_rooms set is_active=false where party_id=${lit(r.party_id)};
      update public.watch_party_rooms set is_active=true where party_id=${lit(r.party_id)}`);
  assert.equal(query(`select private.party_room_admission_source_current(${lit(r.party_id)})`),'f','earlier join proof cannot authorize the restarted generation');
  await race('same-code End and restart commit before a fresh canonical host join',
    auth()+`update public.watch_party_rooms set is_active=false where party_id=${lit(r.party_id)};
      update public.watch_party_rooms set is_active=true where party_id=${lit(r.party_id)}`,
    auth()+`select count(*) from public.join_watch_party_room_session(${lit(r.party_id)})`);
  assert.equal(query(`select private.party_room_admission_source_current(${lit(r.party_id)})`),'t','the actual fresh join binds the latest generation');
  assert.equal(query(`select private.party_room_publication_current(${lit(r.party_id)})`),'f','admission proof never publishes a paused room');
  assert.equal(count,16);
  rpc(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule)
    values('NATIVE-BROADCAST',${lit(actors.host.id)},'live','open');select public.join_watch_party_room_session('NATIVE-BROADCAST')`);
  r=row('NATIVE-BROADCAST');rpc(settings(r,'public',false,'Ordinary broadcast',false));
  const broadcastId='ac520000-0000-4000-8000-000000000101';
  query(approvedOrdinaryBroadcastSQL({partyId:r.party_id,hostId:actors.host.id,broadcastId,
    playbackId:'ac520001-0000-4000-8000-000000000101'}));
  const broadcastListed=()=>query("select is_publicly_discoverable from public.discovery_feed_items where source_type='watch_party_room' and source_id='NATIVE-BROADCAST'");
  assert.equal(broadcastListed(),'t');r=row(r.party_id);
  const providerRefresh=`update public.room_broadcast_sessions set metadata=metadata||'{"native_frame":1}'::jsonb where id=${lit(broadcastId)}`;
  await race('ordinary broadcast pause commits before concurrent provider projection',
    auth()+settings(r,'public',false,'Ordinary broadcast',true),auth('service_role')+providerRefresh);
  assert.equal(broadcastListed(),'f','publisher waits for actual source room and observes pause');
  r=row(r.party_id);rpc(settings(r,'public',false,'Ordinary broadcast',false));r=row(r.party_id);
  await race('ordinary broadcast provider projection commits before listing pause',
    auth('service_role')+providerRefresh,auth()+settings(r,'public',false,'Ordinary broadcast',true));
  assert.equal(broadcastListed(),'f','pause cannot finish before an older publisher and leave its projection active');
  const staleProjection=query(`begin;
    select public.sync_spectator_broadcast_discovery_pre_listing_pause(${lit(broadcastId)});
    select is_publicly_discoverable from public.discovery_feed_items where source_type='watch_party_room' and source_id='NATIVE-BROADCAST';rollback;`);
  assert.equal(staleProjection.trim(),'t','rollback-only missing pause check reproduces stale public producer state');
  assert.equal(broadcastListed(),'f');
  assert.equal(count,18);console.log('PASS native: eighteen actual independent-backend row/advisory lock schedules, real attendance materialization, rejoin, pause/admission/broadcast lifecycle, and rollback-only CAS/mutex/old-publication/producer negative controls. No provider transport.');
} finally {
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try{if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop owned clone');}finally{restore.assertSourceUnchanged();}
}
