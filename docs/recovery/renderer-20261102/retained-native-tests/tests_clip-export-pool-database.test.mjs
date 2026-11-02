import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedClipPoolSource} from './helpers/clip-export-pool-fixture.mjs';
import {seedPreparedClipExport} from './helpers/clip-export-authority-fixture.mjs';
import {createPostgresClipScaleLedger} from '../scripts/lib/clip-export-scale-ledger.mjs';
import {runClipScaleControllerTick} from '../scripts/lib/clip-export-scale-controller.mjs';
import {CLIP_EXPORT_FAILURE_CODES} from '../scripts/lib/clip-export-health.mjs';
import {syntheticClipHealthEvidence} from './helpers/clip-export-health-fixture.mjs';

// Full-chain SQL semantics and burst admission only. PGlite is NOT independent
// native backends and cannot establish the contention proof required in CI.
test('bounded pool full-chain SQL semantics, fences and 1000-request admission burst (not native contention)',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});const fixtures=[];
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const service=()=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 const call=async(sql,args=[],actor=null)=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(actor?{role:'authenticated',sub:actor.owner,session_id:actor.session}:{role:'service_role'})]);
  await db.exec(`set role ${actor?'authenticated':'service_role'}`);
  try{return await scalar(sql,args);}finally{await db.exec('reset role');await service();}
 };
 const request=(f,id=f.request)=>call('select request_creator_clip_export($1,$2,$3)',[f.video,id,JSON.stringify(f.edit)],f);
 const claim=w=>call('select claim_creator_clip_export($1,$2)',[w.id,w.session]);
 const heartbeat=j=>call('select heartbeat_creator_clip_export($1,$2)',[j.id,j.lease]);
 const fail=j=>call("select fail_creator_clip_export($1,$2,'worker_failed')",[j.id,j.lease]);
 const active=()=>scalar("select count(*)::int from private.creator_clip_export_jobs where status='rendering' and lease_until>clock_timestamp()");
 const source=async actor=>{await service();const f=await seedClipPoolSource(db,actor);fixtures.push(f);return f;};
 const enqueue=async actor=>{const f=await source(actor);f.job=await request(f);assert.equal(f.job.status,'queued');return f;};
 const worker=async(capacity=1)=>{
  const w={id:randomUUID(),session:randomUUID()};
  await db.query("insert into private.creator_clip_export_workers(id,capacity,enabled,qualification_note) values($1,$2,true,'SYNTHETIC DATABASE FIXTURE ONLY')",[w.id,capacity]);
  const opened=await call('select open_creator_clip_export_worker($1,$2)',[w.id,w.session]);assert.equal(opened.accepted,true);assert.equal(opened.capacity,capacity);return w;
 };
 const reset=async(maxActive=1)=>{
  for(const f of fixtures){
   const {rows}=await db.query("select id from private.creator_clip_export_jobs where owner_id=$1 and status in('queued','rendering')",[f.owner]);
   for(const row of rows)await call('select cancel_creator_clip_export($1)',[row.id],f);
  }
  await db.query('update private.creator_clip_export_worker set enabled=true,accepting_requests=true,max_active_jobs=$1,max_pending_jobs=1000,max_pending_media_ms=900000000,last_heartbeat_at=clock_timestamp() where singleton',[maxActive]);
  assert.equal(await active(),0);
 };
 try{
  await service();
  for(const [code,category] of Object.entries(CLIP_EXPORT_FAILURE_CODES))assert.equal(await scalar('select private.clip_export_failure_class($1)',[code]),category,`SQL/JS exact failure classification: ${code}`);
  assert.equal(await scalar("select private.clip_export_failure_class('untrusted raw error')"),'unknown');
  const config=(await db.query('select enabled,max_active_jobs,max_pending_jobs,max_pending_media_ms from private.creator_clip_export_worker')).rows[0];
  assert.equal(config.enabled,false);assert.equal(config.max_active_jobs,1);assert.equal(config.max_pending_jobs,1000);assert.equal(Number(config.max_pending_media_ms),900000000);
  assert.equal(await scalar('select count(*)::int from private.creator_clip_export_workers'),0);
  assert.equal(await call('select claim_creator_clip_export()'),null);
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[randomUUID(),randomUUID()])).accepted,false);
  for(const table of ['private.creator_clip_export_workers','private.creator_clip_export_fairness','private.creator_clip_scale_ledger','private.creator_clip_export_worker_sessions']){
   const flags=(await db.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',[table])).rows[0];
   assert.deepEqual(flags,{relrowsecurity:true,relforcerowsecurity:true});
   for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar("select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE')",[role,table]),false);
  }

  await reset(2);const wa=await worker(),wb=await worker(),only=await enqueue();
  const first=await claim(wa);assert.equal(first.id,only.job.id);assert.equal(await claim(wb),null);assert.equal(first.attempts,1);
  assert.equal(await active(),1,'same job has one active lease');

  await reset(2);const ga=await worker(2),gb=await worker(2);await enqueue();await enqueue();await enqueue();
  const g1=await claim(ga),g2=await claim(gb);assert.ok(g1&&g2);assert.notEqual(g1.id,g2.id);
  assert.equal(await active(),2);assert.equal(await claim(ga),null);assert.equal(await claim(gb),null);

  await reset(3);const pw=await worker();await enqueue();await enqueue();assert.ok(await claim(pw));assert.equal(await claim(pw),null);
  assert.equal(await active(),1,'per-worker limit is not caller supplied');

  await reset(3);const reduction=await worker(3);await enqueue();await enqueue();await enqueue();
  const r1=await claim(reduction),r2=await claim(reduction);
  await db.exec('update private.creator_clip_export_worker set max_active_jobs=1');
  assert.equal(await active(),2);assert.equal(await heartbeat(r1),true);assert.equal(await heartbeat(r2),true);assert.equal(await claim(reduction),null);
  await fail(r1);assert.equal(await claim(reduction),null);await fail(r2);assert.ok(await claim(reduction));

  await reset(3);const perReduction=await worker(2);await enqueue();await enqueue();await enqueue();
  const pr1=await claim(perReduction),pr2=await claim(perReduction);
  await db.query('update private.creator_clip_export_workers set capacity=1 where id=$1',[perReduction.id]);
  assert.equal(await heartbeat(pr1),true);assert.equal(await heartbeat(pr2),true);assert.equal(await claim(perReduction),null);
  await fail(pr1);assert.equal(await claim(perReduction),null);await fail(pr2);assert.ok(await claim(perReduction));

  await reset();await worker();const atCap=await enqueue(),overCap=await source();
  await db.exec('update private.creator_clip_export_worker set max_pending_jobs=1');
  await assert.rejects(request(overCap),error=>/clip_export_capacity_exhausted/.test(error.message)&&JSON.parse(error.detail).jobCreated===false);
  assert.equal((await request(atCap)).id,atCap.job.id);assert.equal((await request(atCap,randomUUID())).id,atCap.job.id,'new request UUID still deduplicates exact source/edit');
  await db.exec('update private.creator_clip_export_worker set accepting_requests=false');
  assert.equal((await request(atCap)).id,atCap.job.id);await assert.rejects(request(overCap),/clip_export_admission_paused/);

  await reset();await worker();const mediaCap=await enqueue(),mediaExcess=await source();
  await db.exec('update private.creator_clip_export_worker set max_pending_media_ms=9000000');
  await assert.rejects(request(mediaExcess),/clip_export_capacity_exhausted/);assert.equal((await request(mediaCap)).id,mediaCap.job.id);

  await reset();const fair=await worker(),creatorA=await enqueue();await enqueue(creatorA);await enqueue(creatorA);const creatorB=await enqueue();
  await assert.rejects(request(await source(creatorA)),/clip_export_queue_full/,'three pending per creator remains enforced');
  const fa=await claim(fair);assert.equal(fa.owner_id,creatorA.owner);await fail(fa);
  const fb=await claim(fair);assert.equal(fb.owner_id,creatorB.owner,'least-recently-served creator beats older backlog');
  await fail(fb);await enqueue();
  assert.equal((await claim(fair)).owner_id,creatorA.owner,'continuous new arrivals cannot starve an older serviced turn');

  await reset(2);const ca=await worker(),cb=await worker(),solo=await enqueue();await enqueue(solo);
  assert.ok(await claim(ca));assert.equal(await claim(cb),null);const neighbor=await enqueue();assert.equal((await claim(cb)).owner_id,neighbor.owner);

  await reset(2);const restart=await worker(),nextSession=randomUUID();
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[restart.id,restart.session])).accepted,true,'live same-session open is idempotent');
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[restart.id,nextSession])).accepted,false,'live process session cannot be stolen');
  await enqueue();const old=await claim(restart);
  assert.equal(await call('select close_creator_clip_export_worker($1,$2)',[restart.id,restart.session]),false,'active claims prevent premature identity release');
  await db.query("update private.creator_clip_export_workers set lease_until=clock_timestamp()-interval '1 second' where id=$1",[restart.id]);
  await db.query("update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[old.id]);
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[restart.id,restart.session])).accepted,false,'expired process cannot resurrect its own session');
  assert.equal(await heartbeat(old),false);await assert.rejects(call("select finish_creator_clip_export($1,$2,'bad','{}'::jsonb)",[old.id,old.lease]),/clip_export_stale_lease/);
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[restart.id,nextSession])).accepted,true);
  assert.equal(await claim(restart),null);const retry=await claim({...restart,session:nextSession});
  assert.equal(retry.id,old.id);assert.equal(retry.attempts,2);assert.notEqual(retry.lease,old.lease);assert.notEqual(retry.output_video_id,old.output_video_id);
  assert.equal(await fail(old),false);assert.equal(await heartbeat(old),false);assert.equal(await heartbeat(retry),true);

  await reset();const reuse=await worker(),successor=randomUUID();
  assert.equal(await call('select close_creator_clip_export_worker($1,$2)',[reuse.id,reuse.session]),true);
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[reuse.id,successor])).accepted,true);
  assert.equal(await call('select close_creator_clip_export_worker($1,$2)',[reuse.id,successor]),true);
  assert.equal((await call('select open_creator_clip_export_worker($1,$2)',[reuse.id,reuse.session])).accepted,false,'durable tombstone rejects reuse after multiple closed generations');

  await reset();const lost=await worker();await enqueue();const lostJob=await claim(lost);
  await db.query("update private.creator_clip_export_workers set lease_until=clock_timestamp()-interval '1 second' where id=$1",[lost.id]);
  assert.equal(await heartbeat(lostJob),false);assert.equal(await claim(lost),null);

  await reset();const abandoned=await worker();await enqueue();let attempt=await claim(abandoned);
  for(let number=1;number<=3;number++){
   assert.equal(attempt.attempts,number);
   await db.query("update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[attempt.id]);
   const next=await claim(abandoned);
   if(number<3){assert.equal(next.id,attempt.id);assert.notEqual(next.lease,attempt.lease);attempt=next;}else assert.equal(next,null);
  }
  assert.equal(await scalar("select status||':'||error_code from private.creator_clip_export_jobs where id=$1",[attempt.id]),'failed:retry_limit');

  await reset();const uncertain=await worker();await enqueue();const putJob=await claim(uncertain);
  const producer=await call('select begin_creator_clip_export_output($1,$2)',[putJob.id,putJob.lease]);
  const key=`${putJob.owner_id}/${putJob.output_video_id}/${putJob.lease}/export.mp4`;
  const inventory={inventorySha256:'b'.repeat(64),objectCount:1,objects:[{objectKey:key,kind:'render',sizeBytes:100,sha256:'a'.repeat(64),dependencies:[]}]};
  assert.equal((await call('select reserve_secondary_media_objects($1,$2,$3)',[putJob.lease,producer.claimToken,JSON.stringify(inventory)])).reserved,true);
  assert.ok((await call('select begin_secondary_media_object_write($1,$2,$3)',[putJob.lease,producer.claimToken,key])).writeToken);
  await db.query("update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[putJob.id]);
  assert.equal(await claim(uncertain),null);
  assert.equal(await scalar("select status||':'||error_code||':'||attempts from private.creator_clip_export_jobs where id=$1",[putJob.id]),'failed:output_reconciliation_required:1');
  assert.equal(await scalar('select count(*)::int from videos where id=$1',[putJob.output_video_id]),0);
  await assert.rejects(call('select begin_creator_clip_export_output($1,$2)',[putJob.id,putJob.lease]),/clip_export_stale_lease/);
  await reset();const lateWorker=await worker();await enqueue();const lateOld=await claim(lateWorker);
  await db.query("update private.creator_clip_export_jobs set lease_until=clock_timestamp()-interval '1 second' where id=$1",[lateOld.id]);
  const lateNew=await claim(lateWorker);assert.equal(lateNew.id,lateOld.id);assert.notEqual(lateNew.lease,lateOld.lease);
  await assert.rejects(call('select begin_creator_clip_export_output($1,$2)',[lateOld.id,lateOld.lease]),/clip_export_stale_lease/);
  assert.equal(await scalar('select count(*)::int from private.secondary_media_producers where id=$1',[lateOld.lease]),0);

  await reset();const drain=await worker();await enqueue();const drainJob=await claim(drain);
  await db.query('update private.creator_clip_export_workers set draining=true where id=$1',[drain.id]);
  assert.equal(await claim(drain),null);assert.equal(await heartbeat(drainJob),true);
  const health=await call('select heartbeat_creator_clip_export_worker($1,$2)',[drain.id,drain.session]);assert.equal(health.draining,true);assert.equal(health.accepted,true);
  await fail(drainJob);assert.equal(await call('select close_creator_clip_export_worker($1,$2)',[drain.id,drain.session]),true);

  await reset();const cancelWorker=await worker(),cancelFixture=await enqueue(),cancelJob=await claim(cancelWorker);
  assert.equal((await call('select cancel_creator_clip_export($1)',[cancelJob.id],cancelFixture)).status,'canceled');
  assert.equal(await heartbeat(cancelJob),false);assert.equal(await active(),0);
  assert.equal(await scalar('select count(*)::int from videos where id=$1',[cancelJob.output_video_id]),0);

  await reset();const prepared=await seedPreparedClipExport(db);fixtures.push(prepared);
  await db.query('update private.creator_clip_export_workers set draining=true where id=$1',[prepared.worker]);
  const finishArgs=[prepared.job.id,prepared.job.lease,prepared.key,JSON.stringify(prepared.result)];
  const done=await call('select finish_creator_clip_export($1,$2,$3,$4)',finishArgs);assert.equal(done.status,'ready');
  assert.deepEqual(await call('select finish_creator_clip_export($1,$2,$3,$4)',finishArgs),done);
  assert.equal(await scalar("select count(*)::int from videos where id=$1 and visibility='draft' and scan_status='pending_scan'",[prepared.job.output_video_id]),1);
  assert.equal(await scalar('select count(*)::int from private.secondary_media_bindings where object_id=$1',[prepared.identity.objectId]),2);
  assert.equal(await fail(prepared.job),false,'lost completion response cannot fail committed output');
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   try{await assert.rejects(db.exec('update private.creator_clip_export_worker set max_active_jobs=32'),/permission denied/);
    await assert.rejects(db.exec('update private.creator_clip_export_workers set capacity=8'),/permission denied/);
   }finally{await db.exec('reset role');}
  }
  await assert.rejects(db.exec('update private.creator_clip_export_worker set max_active_jobs=33'),/check constraint/);
  await assert.rejects(db.query('update private.creator_clip_export_workers set capacity=9 where id=$1',[prepared.worker]),/check constraint/);

  await reset();await worker();await db.exec('update private.creator_clip_export_worker set max_pending_jobs=25');
  const burst=[];for(let i=0;i<50;i++)burst.push(await source());
  const ids=new Set();let responses=0,rejections=0;
  for(let i=0;i<1000;i++){
   const candidate=burst[i%burst.length];
   try{const result=await request(candidate,i<50?candidate.request:randomUUID());ids.add(result.id);responses++;}
   catch(error){assert.match(error.message,/clip_export_capacity_exhausted/);const detail=JSON.parse(error.detail);assert.equal(detail.jobCreated,false);assert.equal(detail.retryAfterSeconds,30);rejections++;}
  }
  assert.equal(responses,500);assert.equal(rejections,500);assert.equal(ids.size,25);
  assert.equal(await scalar("select count(*)::int from private.creator_clip_export_jobs where status in('queued','rendering')"),25);
  assert.equal(await active(),0,'admission burst never activates compute');
  const metrics=await call('select read_creator_clip_export_pool_metrics()');
  assert.equal(metrics.globalCapacity,1);assert.equal(metrics.pendingLimit,25);assert.equal(metrics.queued,25);assert.equal(metrics.active,0);
  assert.equal(metrics.pendingMediaMs,225000000);assert.ok(metrics.oldestQueuedSeconds>=0);

  // Exercise the actual PostgreSQL adapter SQL and actual controller against
  // this single-connection engine too. Serialization is still native-CI only.
  let released=0,creates=0,reconciles=0;
  const ledger=createPostgresClipScaleLedger({connect:async()=>({query:(sql,args)=>db.query(sql,args),release:async()=>{released++;}})});
  const now=Date.now(),profile={approvalId:'SYNTHETIC SQL ONLY',poolId:'synthetic_sql_pool',profileId:'synthetic-profile',provider:'synthetic',
   purpose:'clip-render',managedEphemeral:true,ownershipNamespace:'fixture-owned-ephemeral',region:'fixture-local',machineType:'fixture-local',currency:'USD',
   minWorkers:0,maxWorkers:2,slotsPerWorker:1,globalSlotLimit:2,maxHourlyMicros:1000000,maxWorkerHourlyMicros:600000,expiresAtMs:now+3600000,startupProbeApproved:true};
  const executor={capabilities:async()=>({...profile,qualified:true,checkedAtMs:now,expiresAtMs:now+60000,workerHourlyMicros:600000,
   inventoryComplete:true,untrackedResourceCount:0,idempotentCreate:true,reconcileCreate:true,reconcileDelete:true,conditionalDrainedDelete:true}),
   create:async()=>{creates++;return {outcome:'unknown',settled:false};},
   reconcileCreate:async()=>{reconciles++;return {outcome:'unknown',settled:false};}};
  const tick=()=>runClipScaleControllerTick({enabled:true,executionEnabled:true,profile,ledger,executor,clock:()=>now,
   plan:({observation})=>observation.activeWorkers===0?{action:'recommend-startup-probe',desiredWorkers:1}:{action:'hold'},
   telemetry:{healthEvidence:syntheticClipHealthEvidence(now,{workerIds:[]})}});
  assert.equal((await tick()).status,'unknown_create');assert.equal((await tick()).status,'unknown_create');
  assert.equal(creates,1);assert.equal(reconciles,1);
  const durable=await scalar('select state from private.creator_clip_scale_ledger where pool_id=$1',[profile.poolId]);
  assert.equal(durable.resources.length,1);assert.equal(durable.resources[0].hourlyMicros,600000);assert.equal(durable.resources[0].status,'unknown_create');
  await assert.rejects(ledger.transact(profile.poolId,state=>{state.resources=[];throw Error('synthetic rollback');}),/synthetic rollback/);
  assert.deepEqual(await scalar('select state from private.creator_clip_scale_ledger where pool_id=$1',[profile.poolId]),durable,'callback failure cannot release unknown reservations');
  assert.equal(released,5,'all committed and rolled-back trusted connections are released');
 }finally{await db.close();}
});
