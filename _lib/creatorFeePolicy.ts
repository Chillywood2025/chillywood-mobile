import {invokeAccountBoundSupabaseMutationRpc, type AccountBoundSupabaseMutationSubject} from "./accountBoundSupabaseMutation";

export const CREATOR_FEE_POLICY_VERSION = "known_costs_future_unpaid_adjustments_v1";
export type CreatorFeePolicyStatus = {
 version: typeof CREATOR_FEE_POLICY_VERSION;
 terms: string;
 termsSha256: string;
 accepted: boolean;
 negativeAdjustmentCents: number;
 bankDebitAllowed: false;
 adjustments: {id:string;amountCents:number;reason:string;createdAt:string}[];
};
export function parseCreatorFeePolicyStatus(value:unknown):CreatorFeePolicyStatus {
 if(!value||typeof value!=="object")throw new Error("Creator fee policy is unavailable.");
 const row=value as Record<string,unknown>;
 if(row.version!==CREATOR_FEE_POLICY_VERSION||typeof row.terms!=="string"||row.terms.length<40
  ||typeof row.termsSha256!=="string"||!/^[a-f0-9]{64}$/.test(row.termsSha256)
  ||typeof row.accepted!=="boolean"||!Number.isSafeInteger(row.negativeAdjustmentCents)
  ||(row.negativeAdjustmentCents as number)<0||row.bankDebitAllowed!==false||!Array.isArray(row.adjustments))
  throw new Error("Creator fee policy response could not be verified.");
 const adjustments=row.adjustments.map((item:unknown)=>{
  if(!item||typeof item!=="object")throw new Error("Creator fee adjustment is unavailable.");
  const a=item as Record<string,unknown>;
  if(typeof a.id!=="string"||typeof a.reason!=="string"||typeof a.createdAt!=="string"||!Number.isSafeInteger(a.amountCents))
   throw new Error("Creator fee adjustment could not be verified.");
  return {id:a.id,amountCents:a.amountCents as number,reason:a.reason,createdAt:a.createdAt};
 });
 return {version:CREATOR_FEE_POLICY_VERSION,terms:row.terms,termsSha256:row.termsSha256,accepted:row.accepted,
  negativeAdjustmentCents:row.negativeAdjustmentCents as number,bankDebitAllowed:false,adjustments};
}
export async function loadCreatorFeePolicyStatus(subject:AccountBoundSupabaseMutationSubject) {
 const {data,error}=await invokeAccountBoundSupabaseMutationRpc<unknown>(subject,"get_creator_fee_policy_status");
 if(error)throw new Error("Unable to load the current creator fee terms.");
 return parseCreatorFeePolicyStatus(data);
}
// Subject must be captured when the displayed terms were loaded, not after a
// retained confirmation callback fires on a different account/session.
export async function acceptCreatorFeePolicy(subject:AccountBoundSupabaseMutationSubject,displayed:CreatorFeePolicyStatus) {
 const checked=parseCreatorFeePolicyStatus(displayed);
 const {data,error}=await invokeAccountBoundSupabaseMutationRpc<unknown>(subject,"accept_creator_fee_policy",{
  p_version:checked.version,p_terms_sha256:checked.termsSha256,
 });
 if(error)throw new Error("Fee terms were not accepted. Reload them and try again.");
 return parseCreatorFeePolicyStatus(data);
}
