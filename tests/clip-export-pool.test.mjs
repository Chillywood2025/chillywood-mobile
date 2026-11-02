import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {setTimeout as sleep,setImmediate as immediate} from 'node:timers/promises';
import {runClipExportPool,CLIP_EXPORT_SLOT_DISK_BYTES} from '../scripts/lib/clip-export-pool.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function until(predicate){const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('synthetic pool condition timed out');await sleep(1);}}
function fixture({capacity=1,jobs=[],heartbeat,claim,freeDiskBytes}={}){
 const f={calls:[],metrics:[],capacity,draining:false,jobs:[...jobs],workerId:randomUUID(),sessionId:randomUUID(),drain:new AbortController(),stop:new AbortController()};
 f.options={enabled:true,workerId:f.workerId,sessionId:f.sessionId,pollMs:2,workerHeartbeatMs:10,drainSignal:f.drain.signal,signal:f.stop.signal,
  freeDiskBytes:freeDiskBytes??(async()=>8*CLIP_EXPORT_SLOT_DISK_BYTES),
  readResources:async()=>({available:true,observedAtMs:123,scope:'current-process-cgroup-v2-including-descendants',isolationVerified:false,
   memoryCurrentBytes:20,memoryLimitBytes:100,oomEvents:{oomKill:0},cpuUsageUsec:999}),
  onMetric:value=>f.metrics.push(value),runJob:async()=>({completed:true}),rpc:async(name,args)=>{
   f.calls.push({name,args});assert.deepEqual(args,{p_worker_id:f.workerId,p_session_id:f.sessionId});
   if(name==='open_creator_clip_export_worker')return {accepted:true,capacity:f.capacity,draining:f.draining};
   if(name==='heartbeat_creator_clip_export_worker')return heartbeat?heartbeat(f):{accepted:true,capacity:f.capacity,draining:f.draining};
   if(name==='claim_creator_clip_export'){
    if(claim)return claim(f);const job=f.jobs.shift();return job?{...job,worker_id:f.workerId,worker_session:f.sessionId}:null;
   }
   if(name==='close_creator_clip_export_worker')return true;
   throw Error('unexpected synthetic RPC');
  }};
 return f;
}

test('a saturated worker refreshes disk telemetry and failed samples do not replay old headroom',async()=>{
 let disk=CLIP_EXPORT_SLOT_DISK_BYTES,fail=false,started=false;
 const f=fixture({jobs:[{id:1}],freeDiskBytes:async()=>{if(fail)throw Error('disk unavailable');return disk;}});
 const gate=deferred();
 const running=runClipExportPool({...f.options,runJob:async()=>{started=true;await gate.promise;return {completed:true};}});
 try{
  await until(()=>started);disk=128*1024**2;
  await until(()=>f.metrics.some(x=>x.event==='worker_heartbeat'&&x.active===1));
  assert.equal(f.metrics.filter(x=>x.event==='worker_heartbeat'&&x.active===1).at(-1).tempAvailableBytes,disk);
  assert.ok(Number.isSafeInteger(f.metrics.filter(x=>x.event==='worker_heartbeat'&&x.active===1).at(-1).diskObservedAtMs));
  const before=f.metrics.length;fail=true;
  await until(()=>f.metrics.slice(before).some(x=>x.event==='worker_heartbeat'));
  assert.equal(f.metrics.filter(x=>x.event==='worker_heartbeat').at(-1).tempAvailableBytes,null);
  assert.equal(f.metrics.filter(x=>x.event==='worker_heartbeat').at(-1).diskObservedAtMs,null);
  assert.equal(f.calls.filter(x=>x.name==='claim_creator_clip_export').length,1);
 }finally{f.drain.abort();gate.resolve();await running;}
});
test('OFF and invalid configuration cannot claim; DB capacity is bounded and never a client RPC argument',async()=>{
 assert.deepEqual(await runClipExportPool({rpc:()=>{throw Error('must not call');}}),{enabled:false,claimed:0,completed:0,failed:0});
 await assert.rejects(runClipExportPool({enabled:true,workerId:'invalid'}),/configuration_invalid/u);
 for(const capacity of [0,9,1.5]){
  const f=fixture({capacity});await assert.rejects(runClipExportPool(f.options),/session_unavailable/u);
  assert.equal(f.calls.some(call=>call.name==='claim_creator_clip_export'),false);
 }
 const f=fixture({capacity:8,jobs:[{id:'only'}]});const value=await runClipExportPool({...f.options,once:true,capacity:100});
 assert.equal(value.claimed,1);assert.equal(value.completed,1);assert.equal(value.sessionClosed,true);
 assert.equal(f.calls.filter(call=>call.name==='claim_creator_clip_export').length,1);
});
test('concurrent jobs never exceed DB-owned capacity and SIGTERM drain finishes accepted work',async()=>{
 const f=fixture({capacity:3,jobs:Array.from({length:8},(_,id)=>({id}))}),gate=deferred();let running=0,peak=0;
 const task=runClipExportPool({...f.options,runJob:async({signal})=>{running++;peak=Math.max(peak,running);await gate.promise;assert.equal(signal.aborted,false);running--;return {completed:true};}});
 try{await until(()=>running===3);f.drain.abort();await sleep(20);assert.equal(running,3);gate.resolve();const result=await task;
  assert.equal(peak,3);assert.equal(result.claimed,3);assert.equal(result.completed,3);assert.equal(result.sessionClosed,true);
 }finally{f.stop.abort();gate.resolve();await task;}
});
test('1000 synthetic jobs complete at default-one and approved-four capacity without provider calls or overshoot',async()=>{
 for(const capacity of [1,4]){
  const f=fixture({capacity,jobs:Array.from({length:1000},(_,id)=>({id}))});let running=0,peak=0,done=0;
  const result=await runClipExportPool({...f.options,runJob:async()=>{running++;peak=Math.max(peak,running);await immediate();running--;if(++done===1000)f.drain.abort();return {completed:true};}});
  assert.equal(result.claimed,1000);assert.equal(result.completed,1000);assert.equal(result.failed,0);assert.equal(peak,capacity);
  assert.ok(f.metrics.every(metric=>metric.active<=capacity));assert.equal(result.sessionClosed,true);
 }
});
test('capacity reduction is nonpreemptive and new claims wait below the reduced cap',async()=>{
 const f=fixture({capacity:3,jobs:Array.from({length:4},(_,id)=>({id}))}),gates=Array.from({length:4},deferred);let started=0;
 const task=runClipExportPool({...f.options,runJob:async({job,signal})=>{started++;await gates[job.id].promise;assert.equal(signal.aborted,false);return {completed:true};}});
 try{
  await until(()=>started===3);f.capacity=1;await until(()=>f.metrics.some(metric=>metric.event==='worker_heartbeat'&&metric.capacity===1));
  gates[0].resolve();await until(()=>f.metrics.at(-1).active===2);await sleep(20);assert.equal(started,3);
  gates[1].resolve();await until(()=>f.metrics.at(-1).active===1);await sleep(20);assert.equal(started,3);
  gates[2].resolve();await until(()=>started===4);f.drain.abort();gates[3].resolve();
  assert.equal((await task).completed,4);
 }finally{f.stop.abort();gates.forEach(gate=>gate.resolve());await task;}
});
test('11 GiB-per-possible-slot admission guard is fail closed and does not reject or truncate a queued product job',async()=>{
 for(const bytes of [CLIP_EXPORT_SLOT_DISK_BYTES-1,null,NaN,Infinity,-1]){
  const f=fixture({jobs:[{id:'pending'}],freeDiskBytes:async()=>bytes});const result=await runClipExportPool({...f.options,once:true});
  assert.equal(result.claimed,0);assert.equal(f.jobs.length,1);assert.equal(f.calls.some(call=>call.name==='claim_creator_clip_export'),false);
  assert.ok(f.metrics.some(metric=>metric.event==='worker_disk_capacity_exhausted'));
 }
 const f=fixture({jobs:[{id:'pending'}],freeDiskBytes:async()=>{throw Error('statfs failed');}});
 assert.equal((await runClipExportPool({...f.options,once:true})).claimed,0);
});
test('SIGTERM during an in-flight claim drains the accepted response instead of discarding the job',async()=>{
 const response=deferred();const f=fixture({claim:async()=>response.promise});let ran=0;
 const task=runClipExportPool({...f.options,runJob:async({signal})=>{ran++;assert.equal(signal.aborted,false);return {completed:true};}});
 try{await until(()=>f.calls.some(call=>call.name==='claim_creator_clip_export'));f.drain.abort();
  response.resolve({id:'accepted',worker_id:f.workerId,worker_session:f.sessionId});
  assert.equal((await task).completed,1);assert.equal(ran,1);
 }finally{f.stop.abort();response.resolve(null);await task;}
});
test('SIGTERM during disk collection makes no new claim',async()=>{
 const disk=deferred(),f=fixture({freeDiskBytes:async()=>disk.promise});const task=runClipExportPool(f.options);
 await until(()=>f.calls.some(call=>call.name==='open_creator_clip_export_worker'));f.drain.abort();disk.resolve(8*CLIP_EXPORT_SLOT_DISK_BYTES);
 assert.equal((await task).claimed,0);assert.equal(f.calls.some(call=>call.name==='claim_creator_clip_export'),false);
});
test('lost worker heartbeat aborts all local jobs, preserves typed auth evidence, and never retries a claim or job',async()=>{
 const f=fixture({capacity:2,jobs:[{id:1},{id:2},{id:3}],heartbeat:async()=>{throw Error('worker_rpc_auth_failed');}});let started=0;
 const result=await runClipExportPool({...f.options,runJob:async({signal})=>{started++;if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return {completed:false,errorCode:'render_canceled'};}});
 assert.equal(started,2);assert.equal(result.sessionLost,true);assert.equal(result.failed,2);
 assert.equal(f.calls.filter(call=>call.name==='claim_creator_clip_export').length,2);
 const evidence=f.metrics.find(metric=>metric.event==='worker_session_lost');assert.equal(evidence.errorCode,'worker_rpc_auth_failed');
 assert.equal(evidence.failureClass,'dependency_auth');assert.equal(evidence.operation,'heartbeat');
});
test('mismatched claim identity stops without executing media and is not fabricated as an auth outage',async()=>{
 const f=fixture({claim:async()=>({id:'bad',worker_id:randomUUID(),worker_session:randomUUID()})});let ran=false;
 const result=await runClipExportPool({...f.options,runJob:async()=>{ran=true;}});
 assert.equal(ran,false);assert.equal(result.sessionLost,true);
 const metric=f.metrics.find(value=>value.event==='worker_session_lost');assert.equal(metric.operation,'claim_identity');assert.equal(metric.failureClass,'unknown');
});
test('job progress is genuine stage evidence; heartbeat and fresh envelope cannot refresh an old cgroup sample',async()=>{
 const f=fixture({jobs:[{id:1}]}),gate=deferred();let progress;
 const task=runClipExportPool({...f.options,runJob:async({onProgress})=>{progress=onProgress;await gate.promise;return {completed:true};}});
 try{
  await until(()=>progress);await until(()=>f.metrics.some(metric=>metric.event==='worker_heartbeat'));
  assert.equal(f.metrics.filter(metric=>metric.event==='worker_heartbeat').at(-1).lastProgressAtMs,null);
  const at=Date.now();progress({stage:'render_verified',observedAtMs:at});
  await until(()=>f.metrics.some(metric=>metric.event==='worker_heartbeat'&&metric.lastProgressAtMs===at));
  assert.equal(f.metrics.at(-1).workerCgroup.observedAtMs,123);assert.equal(f.metrics.at(-1).workerCgroup.isolationVerified,false);
 }finally{f.drain.abort();gate.resolve();await task;}
});
test('progress, outcome and stopped envelopes cannot freshen cached disk evidence',async()=>{
 const f=fixture({jobs:[{id:1}]}),gate=deferred();let progress,reads=0;
 const task=runClipExportPool({...f.options,once:true,workerHeartbeatMs:300000,
  freeDiskBytes:async()=>{reads++;return CLIP_EXPORT_SLOT_DISK_BYTES;},
  runJob:async({onProgress})=>{progress=onProgress;await gate.promise;return {completed:true};}});
 try{
  await until(()=>progress);const original=f.metrics.find(metric=>metric.event==='worker_job_started').diskObservedAtMs;
  assert.ok(Number.isSafeInteger(original));await sleep(25);
  progress({stage:'render_verified',observedAtMs:Date.now()});
  const event=f.metrics.find(metric=>metric.event==='worker_job_progress');
  assert.ok(event.observedAtMs>original);assert.equal(event.diskObservedAtMs,original);assert.equal(reads,1);
  gate.resolve();await task;
  for(const name of ['worker_job_outcome','worker_stopped']){
   const metric=f.metrics.find(value=>value.event===name);assert.ok(metric.observedAtMs>original);assert.equal(metric.diskObservedAtMs,original);
  }
 }finally{f.stop.abort();gate.resolve();await task;}
});
test('SIGINT aborts accepted jobs and an uncertain close is reported without reopening identity',async()=>{
 const f=fixture({jobs:[{id:1}]}),rpc=f.options.rpc;let started=false;
 f.options.rpc=async(name,args)=>name==='close_creator_clip_export_worker'?false:rpc(name,args);
 const task=runClipExportPool({...f.options,runJob:async({signal})=>{started=true;if(!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return {completed:false,errorCode:'render_canceled'};}});
 await until(()=>started);f.stop.abort();const result=await task;
 assert.equal(result.failed,1);assert.equal(result.sessionClosed,false);assert.equal(f.calls.filter(call=>call.name==='open_creator_clip_export_worker').length,1);
});
test('worker CLI is offline by default and help, requires activation/identity, and reports missing configuration without secrets',()=>{
 for(const args of [['--once'],['--pool'],['--help']]){
  const result=spawnSync(process.execPath,['scripts/clip-export-worker-cli.mjs',...args],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(result.status,0,result.stderr);
 }
 const help=spawnSync(process.execPath,['scripts/clip-export-worker-cli.mjs','--help'],{encoding:'utf8',env:{PATH:process.env.PATH,CLIP_EXPORT_WORKER_ENABLED:'true'}});
 assert.equal(help.status,0);
 const missing=spawnSync(process.execPath,['scripts/clip-export-worker-cli.mjs','--pool'],{encoding:'utf8',env:{PATH:process.env.PATH,CLIP_EXPORT_WORKER_ENABLED:'true',SUPABASE_SERVICE_ROLE_KEY:'never-print-this'}});
 assert.equal(missing.status,1);assert.doesNotMatch(missing.stderr+missing.stdout,/never-print-this/u);assert.match(missing.stderr,/"secretsPrinted":false/u);
});
test('source units preserve exclusive supported modes and mixed bounded drain, never unsafe stop helper or forced unlock',async()=>{
 const pool=await readFile('ops/clip-export-worker/chillywood-clip-export-pool.service','utf8'),once=await readFile('ops/clip-export-worker/chillywood-clip-export.service','utf8');
 assert.match(pool,/Conflicts=chillywood-clip-export.service chillywood-clip-export.timer/u);
 assert.match(pool,/Before=chillywood-clip-export.service chillywood-clip-export.timer/u);
 assert.match(pool,/KillMode=mixed/u);assert.match(pool,/SendSIGKILL=yes/u);assert.match(pool,/KillSignal=SIGTERM/u);assert.match(pool,/TimeoutStopSec=7900/u);
 assert.match(pool,/Restart=no/u);assert.match(pool,/Environment=CLIP_EXPORT_WORKER_ENABLED=false/u);
 assert.doesNotMatch(pool,/^ExecStop=|flock|^\[Install\]/mu);assert.match(once,/KillSignal=SIGINT/u);assert.match(once,/Environment=CLIP_EXPORT_WORKER_ENABLED=false/u);
});
