import {runCurrentAccountBoundSupabaseMutationRpc} from "./accountBoundSupabaseMutation";
export type OwnerFeeAccountingHealth = {pendingCount:number;retryCount:number;blockedCount:number;
 jobs:{source_type:string;source_id:string;state:"pending"|"retry"|"blocked";reason:string|null;attempts:number;updated_at:string}[]};
export function parseOwnerFeeAccountingHealth(value:unknown):OwnerFeeAccountingHealth {
 if(!value||typeof value!=="object")throw Error("Fee accounting status is unavailable.");
 const r=value as Record<string,unknown>;
 if(![r.pendingCount,r.retryCount,r.blockedCount].every(n=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0)
  ||r.newScheduleCreated!==false||!Array.isArray(r.jobs)||r.jobs.length>100)throw Error("Fee accounting status is unavailable.");
 const jobs=r.jobs.map((v:unknown)=>{
  if(!v||typeof v!=="object")throw Error("Fee accounting status is unavailable.");
  const j=v as Record<string,unknown>;
  if(typeof j.source_type!=="string"||!["physical_merch","event_auction","room_auction"].includes(j.source_type)
   ||typeof j.source_id!=="string"||typeof j.state!=="string"||!["pending","retry","blocked"].includes(j.state)
   ||!(j.reason===null||typeof j.reason==="string"&&/^[a-z0-9_:]{1,140}$/.test(j.reason))
   ||!Number.isSafeInteger(j.attempts)||(j.attempts as number)<0||typeof j.updated_at!=="string")throw Error("Fee accounting status is unavailable.");
  return j as OwnerFeeAccountingHealth["jobs"][number];
 });
 return {pendingCount:r.pendingCount as number,retryCount:r.retryCount as number,blockedCount:r.blockedCount as number,jobs};
}
export async function readOwnerFeeAccountingHealth() {
 const result=await runCurrentAccountBoundSupabaseMutationRpc<unknown>("get_owner_commerce_fee_accounting_health",{});
 if(result.error)throw Error("Fee accounting status is unavailable.");
 return parseOwnerFeeAccountingHealth(result.data);
}
