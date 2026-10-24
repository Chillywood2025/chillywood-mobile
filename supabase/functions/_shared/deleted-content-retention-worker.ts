import {runDeletedContentExpiryBatch} from "./deleted-content-retention.ts";
import {runDeletedMediaExpiryBatch,runDeletedStageCleanupBatch} from "./deleted-content-media-expiry.ts";
import {runPlatformBrandRetentionExpiryBatch} from "./brand-retention-worker.ts";
import type {RetiredMediaClaimBinding} from "./deleted-content-origin.ts";

type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Origin=(binding:RetiredMediaClaimBinding,method:"HEAD"|"DELETE")=>Promise<Response>;
type BrandOrigin=Parameters<typeof runPlatformBrandRetentionExpiryBatch>[1];

// A successful disabled probe establishes worker liveness only. Held/reference
// blockers are reported, and no heartbeat is evidence of provider qualification.
export async function runDeletedContentRetentionWorker(rpc:Rpc,origin:Origin,brandOrigin:BrandOrigin){
 const text=await runDeletedContentExpiryBatch(rpc);
 const media=await runDeletedMediaExpiryBatch(rpc,origin);
 const stages=await runDeletedStageCleanupBatch(rpc,origin);
 if([...media.results,...stages.results].some(result=>result.status==="failed")){
  throw Error("retention_provider_attempt_failed");
 }
 const brand=await runPlatformBrandRetentionExpiryBatch(rpc,brandOrigin);
 // Brand is independently gated and audited. R2 success must not conceal a
 // failed Brand pass or refresh a global successful heartbeat on its behalf.
 if(!brand.success)return {text,media,stages,brand,success:false,permanentPhysicalAbsenceGuaranteed:false};
 const heartbeat=await rpc("record_deleted_content_worker_heartbeat",{});
 if(heartbeat.error){
  throw Error("retention_worker_heartbeat_failed");
 }
 return {text,media,stages,brand,success:true,permanentPhysicalAbsenceGuaranteed:false};
}
