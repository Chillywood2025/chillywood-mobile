import { randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { tmpdir, loadavg } from 'node:os';
import { runClipExportJob, safeClipWorkerErrorCode } from './clip-export-worker.mjs';
import { readClipExportWorkerResources } from './clip-export-worker-resources.mjs';
import { classifyClipExportFailure } from './clip-export-health.mjs';

export const CLIP_EXPORT_WORKER_HARD_MAX = 8;
// The source contract permits a 5 GiB input and <5 GiB output, plus watermark.
// Reserve headroom rather than silently narrowing allowed duration/resolution.
export const CLIP_EXPORT_SLOT_DISK_BYTES = 11 * 1024 ** 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export async function clipExportFreeDiskBytes() {
 const disk=await statfs(tmpdir(),{bigint:true});
 return Number(disk.bavail*disk.bsize);
}

function workerState(value) {
 if(value?.accepted!==true||!Number.isInteger(value.capacity)||value.capacity<1||value.capacity>CLIP_EXPORT_WORKER_HARD_MAX
  ||typeof value.draining!=='boolean')throw new Error('clip_worker_session_unavailable');
 return value;
}

/** A bounded executor, not an autoscaler. Only the operator-owned DB registry
 * grants capacity; a host cannot request more slots. No media/PUT retries occur
 * here. Uncertain claim/session responses stop the process and expire in DB. */
export async function runClipExportPool({enabled=false,workerId,sessionId=randomUUID(),rpc,once=false,
 signal,drainSignal,pollMs=5000,workerHeartbeatMs=30000,freeDiskBytes=clipExportFreeDiskBytes,
 runJob=runClipExportJob,onMetric=()=>{},readResources=readClipExportWorkerResources,...jobOptions}={}) {
 if(enabled!==true)return {enabled:false,claimed:0,completed:0,failed:0};
 if(!UUID.test(workerId??'')||!UUID.test(sessionId)||!Number.isInteger(pollMs)||pollMs<1
  ||!Number.isInteger(workerHeartbeatMs)||workerHeartbeatMs<1)throw new Error('clip_worker_configuration_invalid');
 if(signal?.aborted||drainSignal?.aborted)return {enabled:true,claimed:0,completed:0,failed:0,drained:true};
 const identity=Object.freeze({p_worker_id:workerId,p_session_id:sessionId});
 const abort=new AbortController(),active=new Map();
 let draining=false,sessionLost=false,capacity=1,workerHeartbeat=null,heartbeatTimer,waiter;
 let claimed=0,completed=0,failed=0,availableBytes=null,lastDiskBlocked=false;
 let workerResources=null;
 let lastHeartbeatAtMs=null;
 const diskSnapshot=async()=>{
  try{const bytes=await freeDiskBytes();availableBytes=Number.isFinite(bytes)&&bytes>=0?bytes:null;}
  catch{availableBytes=null;}
 };
 const resourceSnapshot=async()=>{try{workerResources=await readResources();}catch{workerResources={available:false,reason:'resource_reader_unavailable',observedAtMs:Date.now()};}};
 const wake=()=>{const resolve=waiter;waiter=undefined;resolve?.();};
 const stop=()=>{draining=true;abort.abort();wake();};
 const drain=()=>{draining=true;wake();};
 signal?.addEventListener('abort',stop,{once:true});drainSignal?.addEventListener('abort',drain,{once:true});
 const metric=(event,extra={})=>{
  // Opaque worker/session/job IDs support private health correlation. Never emit
  // owner/source IDs, credentials, signed URLs, media paths or raw errors.
  const jobs=[...active.values()];
  try{onMetric({event,workerId,sessionId,lastHeartbeatAtMs,active:active.size,activeJobs:active.size,capacity,claimed,completed,failed,draining,sessionLost,
   oldestJobStartedAtMs:jobs.length?Math.min(...jobs.map(job=>job.startedAtMs)):null,
   lastProgressAtMs:jobs.length&&jobs.every(job=>job.lastProgressAtMs!==null)?Math.min(...jobs.map(job=>job.lastProgressAtMs)):null,
   observedAtMs:Date.now(),tempAvailableBytes:availableBytes,workerProcessRssBytes:process.memoryUsage().rss,
   workerCgroup:workerResources,loadAverage1m:loadavg()[0],...extra});}catch{/* Observability is not publication authority. */}
 };
 const lost=(error,operation)=>{
  sessionLost=true;stop();const errorCode=safeClipWorkerErrorCode(error);
  metric('worker_session_lost',{operation,errorCode,failureClass:classifyClipExportFailure(errorCode)});
 };
 const wait=()=>new Promise(resolve=>{
  let timer;
  const done=()=>{clearTimeout(timer);if(waiter===done)waiter=undefined;resolve();};
  waiter=done;timer=setTimeout(done,pollMs);
 });
 let opened=false,sessionClosed=false;
 try {
  let state;
  try{state=workerState(await rpc('open_creator_clip_export_worker',identity));}catch(error){lost(error,'open');throw error;}
  opened=true;capacity=state.capacity;draining=state.draining;lastHeartbeatAtMs=Date.now();
  await resourceSnapshot();
  if(signal?.aborted)stop();else if(drainSignal?.aborted)drain();
  metric('worker_session_opened');
  heartbeatTimer=setInterval(()=>{
   if(workerHeartbeat)return;
   workerHeartbeat=(async()=>{
    try{
     const next=workerState(await rpc('heartbeat_creator_clip_export_worker',identity));
     lastHeartbeatAtMs=Date.now();capacity=next.capacity;if(next.draining)drain();
     // Saturated workers do not enter claim admission again. Observe current
     // disk alongside RAM rather than stamping pre-download headroom as fresh.
     await Promise.all([resourceSnapshot(),diskSnapshot()]);metric('worker_heartbeat');wake();
    }catch(error){lost(error,'heartbeat');}
   })().finally(()=>{workerHeartbeat=null;});
  },workerHeartbeatMs);
  while(true){
   if(draining&&active.size===0)break;
   if(!draining&&active.size<capacity){
    await diskSnapshot();
    const enoughDisk=Number.isFinite(availableBytes)&&availableBytes>=(active.size+1)*CLIP_EXPORT_SLOT_DISK_BYTES;
    if(!enoughDisk){
     if(!lastDiskBlocked)metric('worker_disk_capacity_exhausted');lastDiskBlocked=true;
     if(once){draining=true;continue;}
    }else{
     lastDiskBlocked=false;
     // Signals and heartbeat responses may have arrived during statfs.
     if(draining||active.size>=capacity)continue;
     let job;
     try{job=await rpc('claim_creator_clip_export',identity);}catch(error){lost(error,'claim');continue;}
     if(once)draining=true;
     if(job){
      if(job.worker_id!==workerId||job.worker_session!==sessionId){lost(new Error('worker_failed'),'claim_identity');continue;}
      claimed++;const started=performance.now(),jobState={startedAtMs:Date.now(),lastProgressAtMs:null};
      const outcome=result=>{
       if(result?.completed===true)completed++;else failed++;
       metric('worker_job_outcome',{jobId:job.id,status:result?.completed===true?'completed':'failed',
        errorCode:result?.completed===true?null:safeClipWorkerErrorCode({message:result?.errorCode}),elapsedMs:Math.round(performance.now()-started)});
      };
      let work;
      work=Promise.resolve().then(()=>runJob({...jobOptions,job,rpc,signal:abort.signal,onProgress:progress=>{
       jobState.lastProgressAtMs=progress.observedAtMs;metric('worker_job_progress',{jobId:job.id,stage:progress.stage});
      }}))
       .then(outcome,error=>outcome({completed:false,errorCode:safeClipWorkerErrorCode(error)}))
       .finally(()=>{active.delete(work);metric('worker_job_finished',{elapsedMs:Math.round(performance.now()-started)});wake();});
      active.set(work,jobState);metric('worker_job_started');
      continue;
     }
     if(once)continue;
    }
   }
   await wait();
  }
 }finally{
  clearInterval(heartbeatTimer);
  // On an unexpected local exception, retire children before releasing identity.
  if(active.size)abort.abort();
  await Promise.allSettled([...active.keys()]);
  if(workerHeartbeat)await workerHeartbeat;
  await resourceSnapshot();
  if(opened){
   try{sessionClosed=await rpc('close_creator_clip_export_worker',identity)===true;}catch(error){
    // Never steal/reopen a session after an uncertain close.
    const errorCode=safeClipWorkerErrorCode(error);
    metric('worker_session_close_unknown',{operation:'close',errorCode,failureClass:classifyClipExportFailure(errorCode)});
   }
  }
  signal?.removeEventListener('abort',stop);drainSignal?.removeEventListener('abort',drain);wake();
 }
 metric('worker_stopped');
 return {enabled:true,claimed,completed,failed,drained:draining,sessionLost,sessionClosed};
}
