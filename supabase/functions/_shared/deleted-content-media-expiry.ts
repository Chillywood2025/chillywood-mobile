import type {RetiredMediaClaimBinding} from "./deleted-content-origin.ts";
type Rpc=(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const obj=(v:unknown):Record<string,unknown>|null=>v && typeof v==="object" && !Array.isArray(v)?v as Record<string,unknown>:null;
export async function runDeletedMediaExpiryBatch(rpc:Rpc,origin:(binding:RetiredMediaClaimBinding,method:"HEAD"|"DELETE")=>Promise<Response>){
 const call=async(name:string,args:Record<string,unknown>)=>{
  const result=await rpc(name,args),data=obj(result.data);
  if(result.error || !data)throw Error("retired_media_rpc_failed");return data;
 };
 const work=await call("list_deleted_content_media_expiry_work",{});
 if(work.enabled!==true)return {enabled:false,results:[]};
 if(!Array.isArray(work.stageIds)||work.stageIds.length>20||work.stageIds.some(id=>typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)))throw Error("retired_media_work_invalid");
 const results:{status:string}[]=[];
 for(const stageId of work.stageIds){
  const claimed=await call("claim_deleted_content_media_expiry",{p_stage_id:stageId});
  if(claimed.status!=="claimed"){results.push({status:String(claimed.status)});continue;}
  if(typeof claimed.claimId!=="string")throw Error("retired_media_claim_invalid");
  // This read rechecks guard coverage, live references and permanent retirement.
  const binding=await call("read_deleted_content_media_expiry_claim",{p_claim_id:claimed.claimId});
  if(binding.status!=="authorized"){results.push({status:String(binding.status)});continue;}
  if(binding.claimId!==claimed.claimId||typeof binding.provider!=="string"||typeof binding.bucket!=="string"||typeof binding.objectKey!=="string")throw Error("retired_media_binding_invalid");
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
  await call("record_deleted_content_media_expiry_result",{p_claim_id:claimed.claimId,p_result:outcome});
  results.push({status:outcome});
 }
 return {enabled:true,results};
}
