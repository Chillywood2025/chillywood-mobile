#!/usr/bin/env node
// Independent native PostgreSQL backends; real queue APIs retain their own
// locks. Only an owned disposable clone is written. No providers or paid work.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {seedClipPoolSource} from '../tests/helpers/clip-export-pool-fixture.mjs';
import {seedPreparedClipExport} from '../tests/helpers/clip-export-authority-fixture.mjs';
import {proveNativeClipScaleLedger} from '../tests/helpers/clip-export-pool-native-ledger.mjs';

if(process.argv.includes('--help')){
 console.log('After full local Supabase reset, prove bounded Clip pool contention in an owned disposable clone. No remote endpoints or provider calls.');process.exit(0);
}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_clip_pool`;
const restore=createBrandGuardCloneRestorer({container});
const lit=x=>x===null?'null':`'${String(x).replaceAll("'","''")}'`;
const json=x=>`${lit(JSON.stringify(x))}::jsonb`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db=database)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'owned clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','clip-pool-fixture-admin',...a],input,encoding);
const auth=(f={},role='service_role')=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,...(f.owner?{sub:f.owner,session_id:f.session}:{})}))};`;
const parse=value=>{const line=value.trim().split('\n').at(-1);if(line==='t')return true;if(line==='f')return false;if(!line)return null;try{return JSON.parse(line);}catch{return line;}};
const call=(sql,f,role)=>parse(query(`begin;${auth(f,role)}select ${sql};commit;`));
const sessions=[],fixtures=[];
let cloned=false,checks=0,prefix='';
const remember=sql=>{for(const statement of sql.split(';'))if(/^\s*(?:set role|reset role|select set_config\()/iu.test(statement))prefix+=`${statement};`;};
const db={exec:async sql=>{query(`${prefix}${sql};`);remember(sql);},query:async(sql,values=[])=>{
 const expanded=sql.replace(/\$(\d+)/gu,(_,i)=>lit(values[Number(i)-1]));
 const output=query(`${prefix}${expanded};`);remember(expanded);return {rows:output?[{value:parse(output)}]:[]};
}};
function start(sql){
 const name=`clip-pool-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${lit(name)};set statement_timeout='25s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;
}
async function until(predicate,label){const end=Date.now()+20000;while(Date.now()<end){if(predicate())return;await delay(25);}throw Error(label);}
const blocked=(h,w)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w
 where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(h.name)}
 and w.application_name=${lit(w.name)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
const pass=label=>console.log(`PASS ${++checks} ${label}`);
async function race(label,holderSql,waiterSql,{error=null,rollback=false,waiterRelation=null}={}){
 const h=start(`begin;${holderSql}select 'HOLDING';`);
 await until(()=>h.output().includes('HOLDING'),`${label}: holder did not reach real API result`);
 const w=start(`begin;${waiterSql}commit;`);w.child.stdin.end();
 await until(()=>blocked(h,w),`${label}: no actual pg_blocking_pids edge`);
 if(waiterRelation)assert.equal(query(`select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid
  where a.application_name=${lit(w.name)} and a.datname=current_database() and l.relation=${lit(waiterRelation)}::regclass
  and l.mode='RowShareLock' and l.granted);`),'t',`${label}: waiter reached the real row-locking statement`);
 h.child.stdin.end(`${rollback?'rollback':'commit'};\n`);
 const holder=await h.done,waiter=await w.done;assert.equal(holder.code,0,holder.stderr);
 if(error){assert.notEqual(waiter.code,0,label);assert.match(waiter.stderr,error,label);}else assert.equal(waiter.code,0,`${label}: ${waiter.stderr}`);
 const result=s=>parse(s.split('\n').filter(x=>x!=='HOLDING').join('\n'));
 return [result(holder.stdout),result(waiter.stdout)];
}
const svc=sql=>`${auth()}select ${sql};`;
const claim=w=>`public.claim_creator_clip_export(${lit(w.id)},${lit(w.session)})`;
const heartbeat=j=>`public.heartbeat_creator_clip_export(${lit(j.id)},${lit(j.lease)})`;
const fail=j=>call(`public.fail_creator_clip_export(${lit(j.id)},${lit(j.lease)},'worker_failed')`);
const request=f=>`public.request_creator_clip_export(${lit(f.video)},${lit(f.request)},${json(f.edit)})`;
const active=()=>Number(query("select count(*) from private.creator_clip_export_jobs where status='rendering' and lease_until>clock_timestamp();"));
async function source(actor){prefix='';const f=await seedClipPoolSource(db,actor);fixtures.push(f);return f;}
async function enqueue(actor){const f=await source(actor);f.job=call(request(f),f,'authenticated');assert.equal(f.job.status,'queued');return f;}
function worker(capacity=1){
 const w={id:randomUUID(),session:randomUUID()};
 query(`insert into private.creator_clip_export_workers(id,capacity,enabled,qualification_note) values(${lit(w.id)},${capacity},true,'SYNTHETIC DATABASE FIXTURE ONLY');`);
 const opened=call(`public.open_creator_clip_export_worker(${lit(w.id)},${lit(w.session)})`);
 assert.equal(opened.accepted,true);assert.equal(opened.capacity,capacity);return w;
}
function reset(maxActive=1){
 // Terminalize only our admitted fixture jobs through the real owner API.
 if(fixtures.length){
  const actors=new Map(fixtures.map(f=>[f.owner,f]));
  const pending=parse(query(`select coalesce(jsonb_agg(jsonb_build_object('id',id,'owner',owner_id)),'[]'::jsonb)
   from private.creator_clip_export_jobs where owner_id in(${[...actors.keys()].map(lit).join(',')}) and status in('queued','rendering');`));
  for(const job of pending)call(`public.cancel_creator_clip_export(${lit(job.id)})`,actors.get(job.owner),'authenticated');
 }
 query(`update private.creator_clip_export_worker set enabled=true,accepting_requests=true,max_active_jobs=${maxActive},max_pending_jobs=1000,max_pending_media_ms=900000000,last_heartbeat_at=clock_timestamp() where singleton;`);
 assert.equal(active(),0);
}
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 assert.equal(query("begin read only;select to_regprocedure('public.claim_creator_clip_export(uuid,uuid)') is not null;commit;",'postgres'),'t','full bounded-pool migration reset required');
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned disposable clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'read-only local source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore owned clone');

 // Defaults do not activate rendering, register identities or provision hosts.
 assert.equal(query('select enabled from private.creator_clip_export_worker where singleton;'),'f');
 assert.equal(query('select max_active_jobs from private.creator_clip_export_worker where singleton;'),'1');
 assert.equal(query('select count(*) from private.creator_clip_export_workers;'),'0');
 assert.equal(call('public.claim_creator_clip_export()'),null,'old unregistered CLI is fail-closed');
 pass('safe default one capacity remains off with no registered workers');

 reset(2);const a=worker(),b=worker(),one=await enqueue();
 const [same1,same2]=await race('same job cannot be claimed twice',svc(claim(a)),svc(claim(b)));
 assert.equal(same1.id,one.job.id);assert.equal(same2,null);assert.equal(active(),1);
 assert.equal(query(`select attempts from private.creator_clip_export_jobs where id=${lit(one.job.id)};`),'1');
 pass('same job cannot be claimed twice');

 reset(2);const ga=worker(2),gb=worker(2);await enqueue();await enqueue();await enqueue();
 const [global1,global2]=await race('global capacity cannot overshoot',svc(claim(ga)),svc(claim(gb)));
 assert.ok(global1&&global2);assert.notEqual(global1.id,global2.id);assert.equal(active(),2);
 assert.equal(call(claim(ga)),null);assert.equal(call(claim(gb)),null);assert.equal(active(),2);
 pass('global capacity cannot overshoot');

 reset(3);const single=worker(1);await enqueue();await enqueue();
 const [worker1,worker2]=await race('per-worker capacity cannot overshoot',svc(claim(single)),svc(claim(single)));
 assert.ok(worker1);assert.equal(worker2,null);assert.equal(active(),1);
 pass('per-worker capacity cannot overshoot');

 reset(2);const reduced=worker(2);await enqueue();await enqueue();await enqueue();
 const first=call(claim(reduced));assert.ok(first);
 const [second]=await race('capacity reduction drains existing claims',svc(claim(reduced)),
  'update private.creator_clip_export_worker set max_active_jobs=1 where singleton;');
 assert.ok(second);assert.equal(active(),2,'reduction does not revoke already-running work');
 assert.equal(call(heartbeat(first)),true);assert.equal(call(heartbeat(second)),true);
 assert.equal(call(claim(reduced)),null);fail(first);assert.equal(call(claim(reduced)),null);fail(second);
 assert.ok(call(claim(reduced)),'capacity becomes available only below reduced cap');
 pass('capacity reduction drains existing claims');

 reset(4);const wr=worker(2);await enqueue();await enqueue();await enqueue();
 const wra=call(claim(wr)),wrb=call(claim(wr));assert.ok(wra&&wrb);
 query(`update private.creator_clip_export_workers set capacity=1 where id=${lit(wr.id)};`);
 assert.equal(call(heartbeat(wra)),true);assert.equal(call(heartbeat(wrb)),true);assert.equal(call(claim(wr)),null);
 fail(wra);assert.equal(call(claim(wr)),null);fail(wrb);assert.ok(call(claim(wr)));
 pass('per-worker reduction also drains without replacement overshoot');

 reset(2);worker();const admissionA=await source(),admissionB=await source();
 query('update private.creator_clip_export_worker set max_pending_jobs=1 where singleton;');
 const [admitted]=await race('admission cap serializes concurrent creators',`${auth(admissionA,'authenticated')}select ${request(admissionA)};`,
  `${auth(admissionB,'authenticated')}select ${request(admissionB)};`,{error:/clip_export_capacity_exhausted/});
 assert.equal(admitted.status,'queued');admissionA.job=admitted;
 assert.equal(call(request(admissionA),admissionA,'authenticated').id,admitted.id,'lost-response retry succeeds at capacity');
 assert.equal(query("select count(*) from private.creator_clip_export_jobs where status in('queued','rendering');"),'1');
 pass('admission cap serializes concurrent creators');

 reset();worker();const revokedRequest=await source();
 await race('admission rechecks session after waiting for configuration',
  `update private.creator_clip_export_worker set max_pending_jobs=1000 where singleton;
   update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=${lit(revokedRequest.session)};`,
  `${auth(revokedRequest,'authenticated')}select ${request(revokedRequest)};`,
  {error:/clip_export_current_session_required/,waiterRelation:'private.creator_clip_export_worker'});
 assert.equal(query(`select count(*) from private.creator_clip_export_jobs where owner_id=${lit(revokedRequest.owner)};`),'0');
 pass('admission rechecks session after waiting for configuration');

 reset();const fair=worker(),creatorA=await enqueue();await enqueue(creatorA);await enqueue(creatorA);const creatorB=await enqueue();
 const turnA=call(claim(fair));assert.equal(turnA.owner_id,creatorA.owner);fail(turnA);
 const turnB=call(claim(fair));assert.equal(turnB.owner_id,creatorB.owner,'unserved creator beats older queued work of already-served creator');
 fail(turnB);await enqueue();
 const backlogged=call(claim(fair));assert.equal(backlogged.owner_id,creatorA.owner,'continuous new arrivals cannot jump an older serviced turn forever');
 pass('creator fairness survives an older backlog');

 reset(2);const fairA=worker(),fairB=worker(),sameOwner=await enqueue();await enqueue(sameOwner);
 assert.ok(call(claim(fairA)));assert.equal(call(claim(fairB)),null,'one creator cannot occupy multiple active slots');
 const otherOwner=await enqueue();assert.equal(call(claim(fairB)).owner_id,otherOwner.owner);
 pass('per-creator active limit does not strand other creators');

 reset(2);const restart={id:randomUUID(),session:randomUUID()},replacement=randomUUID();
 query(`insert into private.creator_clip_export_workers(id,capacity,enabled,qualification_note) values(${lit(restart.id)},1,true,'SYNTHETIC DATABASE FIXTURE ONLY');`);
 const [opened,notStolen]=await race('worker restart cannot steal a live session',svc(`public.open_creator_clip_export_worker(${lit(restart.id)},${lit(restart.session)})`),
  svc(`public.open_creator_clip_export_worker(${lit(restart.id)},${lit(replacement)})`));
 assert.equal(opened.accepted,true);assert.equal(notStolen.accepted,false);
 assert.equal(call(`public.open_creator_clip_export_worker(${lit(restart.id)},${lit(restart.session)})`).accepted,true,'live same-session open is idempotent');
 await enqueue();const old=call(claim(restart));assert.ok(old);
 query(`update private.creator_clip_export_workers set lease_until=clock_timestamp()-interval '1 second' where id=${lit(restart.id)};
  update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=${lit(old.id)};`);
 assert.equal(call(heartbeat(old)),false);
 assert.equal(call(`public.open_creator_clip_export_worker(${lit(restart.id)},${lit(restart.session)})`).accepted,false,'expired process cannot resurrect its own session');
 assert.throws(()=>call(`public.finish_creator_clip_export(${lit(old.id)},${lit(old.lease)},'bad','{}'::jsonb)`),/clip_export_stale_lease/);
 assert.equal(call(`public.open_creator_clip_export_worker(${lit(restart.id)},${lit(replacement)})`).accepted,true);
 assert.equal(call(claim(restart)),null,'retired process cannot claim through new session');
 const recovered=call(claim({...restart,session:replacement}));assert.equal(recovered.id,old.id);assert.equal(recovered.attempts,2);
 assert.notEqual(recovered.lease,old.lease);assert.notEqual(recovered.output_video_id,old.output_video_id);
 assert.equal(call(heartbeat(old)),false);assert.equal(fail(old),false);assert.equal(call(heartbeat(recovered)),true);
 pass('worker restart cannot steal a live session');pass('expired lease cannot complete or heartbeat');

 reset();const reused=worker(),successor=randomUUID();
 assert.equal(call(`public.close_creator_clip_export_worker(${lit(reused.id)},${lit(reused.session)})`),true);
 assert.equal(call(`public.open_creator_clip_export_worker(${lit(reused.id)},${lit(successor)})`).accepted,true);
 assert.equal(call(`public.close_creator_clip_export_worker(${lit(reused.id)},${lit(successor)})`),true);
 assert.equal(call(`public.open_creator_clip_export_worker(${lit(reused.id)},${lit(reused.session)})`).accepted,false,'durable tombstone rejects old session after multiple closed generations');

 reset();const lost=worker();await enqueue();const lostJob=call(claim(lost));
 query(`update private.creator_clip_export_workers set lease_until=clock_timestamp()-interval '1 second' where id=${lit(lost.id)};`);
 assert.equal(call(heartbeat(lostJob)),false,'job heartbeat cannot rescue an expired process session');
 assert.equal(call(claim(lost)),null,'lost process identity cannot claim more jobs');
 pass('lost worker heartbeat fences its still-unexpired job');

 reset();const abandoned=worker();await enqueue();let attempt=call(claim(abandoned));
 for(let number=1;number<=3;number++){
  assert.equal(attempt.attempts,number);
  query(`update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=${lit(attempt.id)};`);
  const next=call(claim(abandoned));
  if(number<3){assert.equal(next.id,attempt.id);assert.notEqual(next.lease,attempt.lease);attempt=next;}else assert.equal(next,null);
 }
 assert.equal(query(`select status||':'||error_code from private.creator_clip_export_jobs where id=${lit(attempt.id)};`),'failed:retry_limit');
 pass('abandoned leases retain the existing three-attempt bound');

 reset();const uncertain=worker();await enqueue();const putJob=call(claim(uncertain));
 const producer=call(`public.begin_creator_clip_export_output(${lit(putJob.id)},${lit(putJob.lease)})`);
 const key=`${putJob.owner_id}/${putJob.output_video_id}/${putJob.lease}/export.mp4`;
 const inventory={inventorySha256:'b'.repeat(64),objectCount:1,objects:[{objectKey:key,kind:'render',sizeBytes:100,sha256:'a'.repeat(64),dependencies:[]}]};
 assert.equal(call(`public.reserve_secondary_media_objects(${lit(putJob.lease)},${lit(producer.claimToken)},${json(inventory)})`).reserved,true);
 assert.ok(call(`public.begin_secondary_media_object_write(${lit(putJob.lease)},${lit(producer.claimToken)},${lit(key)})`).writeToken);
 // Dispatch exists but no provider receipt. Expiry MUST NOT guess PUT absence.
 query(`update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=${lit(putJob.id)};`);
 assert.equal(call(claim(uncertain)),null);
 assert.equal(query(`select status||':'||error_code||':'||attempts from private.creator_clip_export_jobs where id=${lit(putJob.id)};`),'failed:output_reconciliation_required:1');
 assert.equal(query(`select count(*) from videos where id=${lit(putJob.output_video_id)};`),'0');
 assert.throws(()=>call(`public.begin_creator_clip_export_output(${lit(putJob.id)},${lit(putJob.lease)})`),/clip_export_stale_lease/);
 reset();const lateWorker=worker();await enqueue();const lateOld=call(claim(lateWorker));
 query(`update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=${lit(lateOld.id)};`);
 const lateNew=call(claim(lateWorker));assert.equal(lateNew.id,lateOld.id);assert.notEqual(lateNew.lease,lateOld.lease);
 assert.throws(()=>call(`public.begin_creator_clip_export_output(${lit(lateOld.id)},${lit(lateOld.lease)})`),/clip_export_stale_lease/);
 assert.equal(query(`select count(*) from private.secondary_media_producers where id=${lit(lateOld.lease)};`),'0','retired attempt cannot create a producer after reclaim');
 pass('unknown PUT remains reconciliation-only and late old output admission is fenced');

 reset(2);const drain=worker(2);await enqueue();await enqueue();const drainJob=call(claim(drain));
 query(`update private.creator_clip_export_workers set draining=true where id=${lit(drain.id)};`);
 assert.equal(call(claim(drain)),null);assert.equal(call(heartbeat(drainJob)),true);
 assert.equal(call(`public.heartbeat_creator_clip_export_worker(${lit(drain.id)},${lit(drain.session)})`).draining,true);
 fail(drainJob);pass('drain stops new claims without canceling held work');

 reset();const cancelWorker=worker(),cancelFixture=await enqueue();
 const [,canceled]=await race('cancel after claim fences the claimed attempt',svc(claim(cancelWorker)),
  `${auth(cancelFixture,'authenticated')}select public.cancel_creator_clip_export(${lit(cancelFixture.job.id)});`);
 assert.equal(canceled.status,'canceled');assert.equal(active(),0);
 assert.equal(query(`select count(*) from videos where id in(select output_video_id from private.creator_clip_export_jobs where id=${lit(cancelFixture.job.id)});`),'0');
 pass('cancellation after a contended claim creates no draft');

 reset();prefix='';const prepared=await seedPreparedClipExport(db);fixtures.push(prepared);
 const finish=`public.finish_creator_clip_export(${lit(prepared.job.id)},${lit(prepared.job.lease)},${lit(prepared.key)},${json(prepared.result)})`;
 const [done1,done2]=await race('duplicate completion returns one private output',svc(finish),svc(finish));
 assert.equal(done1.status,'ready');assert.deepEqual(done2,done1);
 assert.equal(query(`select count(*) from videos where id=${lit(prepared.job.output_video_id)} and visibility='draft' and scan_status='pending_scan';`),'1');
 assert.equal(query(`select count(*) from private.secondary_media_bindings where object_id=${lit(prepared.identity.objectId)};`),'2');
 pass('duplicate completion returns one private output');

 for(const role of ['anon','authenticated','service_role']){
  for(const table of ['private.creator_clip_export_worker','private.creator_clip_export_workers','private.creator_clip_scale_ledger','private.creator_clip_export_worker_sessions']){
   assert.equal(query(`select has_table_privilege(${lit(role)},${lit(table)},'INSERT,UPDATE,DELETE');`),'f',`${role}: config mutation denied`);
   const mutation=table==='private.creator_clip_scale_ledger'?'revision=revision+1':table==='private.creator_clip_export_worker_sessions'?'session_id=session_id':'enabled=true';
   assert.throws(()=>query(`begin;set local role ${role};update ${table} set ${mutation};rollback;`),/permission denied/);
  }
 }
 assert.equal(call(`public.open_creator_clip_export_worker(${lit(randomUUID())},${lit(randomUUID())})`).accepted,false,'random unregistered worker cannot self-admit');
 assert.throws(()=>query('update private.creator_clip_export_worker set max_active_jobs=33 where singleton;'),/check constraint/);
 assert.throws(()=>query(`update private.creator_clip_export_workers set capacity=9 where id=${lit(drain.id)};`),/check constraint/);
 pass('unauthorized capacity configuration and hard-cap spoofing rejected');

 assert.equal(query("select relrowsecurity and relforcerowsecurity from pg_class where oid='private.creator_clip_scale_ledger'::regclass;"),'t');
 await proveNativeClipScaleLedger({container,database,query,until});
 pass('actual durable ledger serializes two controllers and preserves uncertain cost reservations');

 assert.equal(checks,20,'every bounded-pool schedule must execute');
 console.log('PASS all bounded Clip pool native PostgreSQL schedules; synthetic rows only, no mass-scale or provider qualification claim.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned){try{restore.assertSourceUnchanged();}finally{success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');}}
}
