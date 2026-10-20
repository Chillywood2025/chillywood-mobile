import type {RetiredMediaClaimBinding} from "./deleted-content-origin.ts";
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Origin=(binding:RetiredMediaClaimBinding,method:"HEAD"|"DELETE")=>Promise<Response>;
type CleanupProtocol={list:string;claim:string;read:string;record:string};
const obj=(v:unknown):Record<string,unknown>|null=>v && typeof v==="object" && !Array.isArray(v)?v as Record<string,unknown>:null;
const uuid=(v:unknown):v is string=>typeof v==="string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
async function runClaimedMediaCleanupBatch(rpc:Rpc,origin:Origin,protocol:CleanupProtocol){
 const call=async(name:string,args:Record<string,unknown>)=>{
  const result=await rpc(name,args),data=obj(result.data);
  if(result.error || !data)throw Error("retired_media_rpc_failed");return data;
 };
 const work=await call(protocol.list,{});
 if(work.enabled===false)return {enabled:false,results:[]};
 if(work.enabled!==true || !Array.isArray(work.stageIds)||work.stageIds.length>20
  ||work.stageIds.some(id=>!uuid(id))||new Set(work.stageIds).size!==work.stageIds.length)throw Error("retired_media_work_invalid");
 const results:{status:string}[]=[];
 for(const stageId of work.stageIds){
  const claimed=await call(protocol.claim,{p_stage_id:stageId});
  if(typeof claimed.status!=="string")throw Error("retired_media_claim_invalid");
  if(claimed.status!=="claimed"){results.push({status:claimed.status});continue;}
  if(!uuid(claimed.claimId))throw Error("retired_media_claim_invalid");
  // This read rechecks guard coverage, live references and permanent retirement.
  const binding=await call(protocol.read,{p_claim_id:claimed.claimId});
  if(typeof binding.status!=="string")throw Error("retired_media_binding_invalid");
  if(binding.status!=="authorized"){results.push({status:binding.status});continue;}
  if(binding.claimId!==claimed.claimId||binding.provider!=="cloudflare_r2"
   ||binding.bucket!=="chillywood-media-origin"||typeof binding.objectKey!=="string")throw Error("retired_media_binding_invalid");
  const exact=binding as unknown as RetiredMediaClaimBinding;
  let outcome="failed";
  try{
   // No HEAD+DELETE version assumption: DELETE is safe only because the key
   // can never be reused. Unknown, failed and late writes are not called gone.
   const removed=await origin(exact,"DELETE");
   await removed.body?.cancel();
   if(removed.ok || removed.status===404){
    outcome="delete_acknowledged";
    const observed=await origin(exact,"HEAD");
    await observed.body?.cancel();
    if(observed.status===404)outcome="observed_absent";
   }
  }catch{/* preserve irreversible claim; bounded future retry is idempotent */}
  const receipt=await call(protocol.record,{p_claim_id:claimed.claimId,p_result:outcome});
  if(receipt.status!==outcome||receipt.permanentlyAbsent!==false)throw Error("retired_media_receipt_invalid");
  results.push({status:outcome});
 }
 return {enabled:true,results};
}

export async function runDeletedMediaExpiryBatch(rpc:Rpc,origin:Origin){
 return runClaimedMediaCleanupBatch(rpc,origin,{
  list:"list_deleted_content_media_expiry_work",claim:"claim_deleted_content_media_expiry",
  read:"read_deleted_content_media_expiry_claim",record:"record_deleted_content_media_expiry_result",
 });
}

// Replacement/missing-source cleanup uses an object-only claim. It never adopts
// a deletion record or starts/renews a deleted-content inspection window.
export async function runDeletedStageCleanupBatch(rpc:Rpc,origin:Origin){
 return runClaimedMediaCleanupBatch(rpc,origin,{
  list:"list_deleted_content_stage_cleanup_work",claim:"reconcile_deleted_content_stage",
  read:"read_deleted_content_stage_cleanup_claim",record:"record_deleted_content_stage_cleanup_result",
 });
}
