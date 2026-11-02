import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderClip } from './clip-render-core.mjs';
import { downloadClipSource, hashClipFile, uploadClipOutput } from './clip-export-transport.mjs';
import { safeClipExportFailureCode } from './clip-export-health.mjs';
export const safeClipWorkerErrorCode=safeClipExportFailureCode;

/** One bounded job. The only success path is verified private output -> durable
 * receipt -> sealed producer -> atomic draft creation/secondary-source binding. */
export async function runClipExportOnce({rpc,signer,outputBucket,supabaseUrl,serviceKey,fetcher=fetch,signal,render=renderClip,
 download=downloadClipSource,upload=uploadClipOutput,heartbeatMs=30000,workerId,sessionId,onProgress}) {
 if(signal?.aborted)return {claimed:false};
 const job=await rpc('claim_creator_clip_export',workerId&&sessionId?{p_worker_id:workerId,p_session_id:sessionId}:{});
 if(!job)return {claimed:false};
 return runClipExportJob({job,rpc,signer,outputBucket,supabaseUrl,serviceKey,fetcher,signal,render,download,upload,heartbeatMs,onProgress});
}

/** The pool claims serially before dispatching a job, so local slot and disk
 * reservations cover even a slow/unknown claim response. Rendering never holds
 * a database transaction open. The original attempt/receipt fences are shared. */
export async function runClipExportJob({job,rpc,signer,outputBucket,supabaseUrl,serviceKey,fetcher=fetch,signal,render=renderClip,
 download=downloadClipSource,upload=uploadClipOutput,heartbeatMs=30000,onProgress=()=>{}}) {
 const progress=stage=>{try{onProgress({stage,observedAtMs:Date.now()});}catch{/* Telemetry cannot change publication authority. */}};
 const abort=new AbortController();
 const forward=()=>abort.abort();signal?.addEventListener('abort',forward,{once:true});
 if(signal?.aborted)abort.abort();
 const timeout=setTimeout(()=>abort.abort(),7_800_000);
 let heartbeating=false,heartbeatFailed=false,heartbeatErrorCode='source_changed';
 const lease=async()=>{
  if(abort.signal.aborted)throw new Error('render_canceled');
  if(await rpc('heartbeat_creator_clip_export',{p_job_id:job.id,p_lease:job.lease})!==true){abort.abort();throw new Error('source_changed');}
 };
 const interval=setInterval(async()=>{
  if(heartbeating)return;heartbeating=true;
  try{await lease();}catch(error){heartbeatFailed=true;heartbeatErrorCode=safeClipWorkerErrorCode(error);abort.abort();}finally{heartbeating=false;}
 },heartbeatMs);
 let directory;
 try {
  await lease();
  directory=await mkdtemp(path.join(tmpdir(),'chillywood-clip-export-'));
  const inputPath=path.join(directory,'source'),outputPath=path.join(directory,'export.mp4');
  await download({source:job.source_snapshot,file:inputPath,signer,supabaseUrl,serviceKey,fetcher,signal:abort.signal});
  progress('source_downloaded');
  let watermarkPath=null;
  if(job.edit_snapshot.brand_mark_enabled){
   if(!job.watermark_snapshot)throw new Error('watermark_bytes_required');
   watermarkPath=path.join(directory,'watermark');
   await download({source:job.watermark_snapshot,file:watermarkPath,signer,supabaseUrl,serviceKey,fetcher,signal:abort.signal,maxBytes:20*1024*1024});
   progress('watermark_downloaded');
  }
  const result=await render({inputPath,outputPath,watermarkPath,edit:job.edit_snapshot,signal:abort.signal});
  progress('render_verified');
  const digest=await hashClipFile(outputPath,{signal:abort.signal});
  progress('output_hashed');
  await lease();
  const prefix=`${job.owner_id}/${job.output_video_id}/${job.lease}/`,objectKey=`${prefix}export.mp4`;
  const producer=await rpc('begin_creator_clip_export_output',{p_job_id:job.id,p_lease:job.lease});
  if(producer?.producerId!==job.lease||!producer.claimToken)throw new Error('producer_not_admitted');
  const objects=[{objectKey,kind:'render',sizeBytes:digest.sizeBytes,sha256:digest.sha256,dependencies:[]}];
  const inventory={objectCount:1,objects,inventorySha256:createHash('sha256').update(JSON.stringify(objects)).digest('hex')};
  const reserved=await rpc('reserve_secondary_media_objects',{p_producer_id:job.lease,p_claim_token:producer.claimToken,p_inventory:inventory});
  if(reserved?.reserved!==true||reserved.objectCount!==1)throw new Error('output_not_reserved');
  await lease();
  const identity=await rpc('begin_secondary_media_object_write',{p_producer_id:job.lease,p_claim_token:producer.claimToken,p_object_key:objectKey});
  const receipt=await upload({file:outputPath,identity,signer,fetcher,signal:abort.signal});
  progress('upload_readback_verified');
  const recorded=await rpc('record_secondary_media_object_receipt',{p_producer_id:job.lease,p_claim_token:producer.claimToken,
   p_object_key:objectKey,p_write_token:identity.writeToken,p_receipt:receipt});
  if(recorded?.recorded!==true||recorded.publishable!==true)throw new Error('source_changed');
  progress('receipt_recorded');
  await lease();
  const sealed=await rpc('seal_secondary_media_producer',{p_producer_id:job.lease,p_claim_token:producer.claimToken});
  if(sealed?.sealed!==true)throw new Error('output_not_sealed');
  progress('producer_sealed');
  const completed=await rpc('finish_creator_clip_export',{p_job_id:job.id,p_lease:job.lease,p_object_key:objectKey,p_result:{...result,...digest}});
  if(completed?.status!=='ready'||completed.outputVideoId!==job.output_video_id)throw new Error('completion_unknown');
  progress('draft_completed');
  return {claimed:true,completed:true,privateDraftCreated:true};
 } catch(error) {
  // A failed/unknown completion cannot delete a provider object or guessed draft.
  // The DB fences this failure against a completion that already committed.
  const errorCode=heartbeatFailed?heartbeatErrorCode:safeClipWorkerErrorCode(error);
  await rpc('fail_creator_clip_export',{p_job_id:job.id,p_lease:job.lease,p_error_code:errorCode}).catch(()=>{});
  return {claimed:true,completed:false,errorCode};
 } finally {
  clearInterval(interval);clearTimeout(timeout);signal?.removeEventListener('abort',forward);
  abort.abort();if(directory)await rm(directory,{recursive:true,force:true});
 }
}
