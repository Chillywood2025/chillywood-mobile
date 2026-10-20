import {runDeletedContentExpiryBatch} from "./deleted-content-retention.ts";
import {runDeletedMediaExpiryBatch,runDeletedStageCleanupBatch} from "./deleted-content-media-expiry.ts";
import type {RetiredMediaClaimBinding} from "./deleted-content-origin.ts";

type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Origin=(binding:RetiredMediaClaimBinding,method:"HEAD"|"DELETE")=>Promise<Response>;

// A successful disabled probe establishes worker liveness only. Held/reference
// blockers are reported, and no heartbeat is evidence of provider qualification.
export async function runDeletedContentRetentionWorker(rpc:Rpc,origin:Origin){
 const text=await runDeletedContentExpiryBatch(rpc);
 const media=await runDeletedMediaExpiryBatch(rpc,origin);
 const stages=await runDeletedStageCleanupBatch(rpc,origin);
 if([...media.results,...stages.results].some(result=>result.status==="failed")){
  throw Error("retention_provider_attempt_failed");
 }
 const heartbeat=await rpc("record_deleted_content_worker_heartbeat",{});
 if(heartbeat.error){
  throw Error("retention_worker_heartbeat_failed");
 }
 return {text,media,stages,permanentPhysicalAbsenceGuaranteed:false};
}
