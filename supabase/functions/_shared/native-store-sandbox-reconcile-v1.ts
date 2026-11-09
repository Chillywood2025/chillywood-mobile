/** Worker-private comparison of an explicit CLIENT ASSERTION with historical
 * receipt bytes. This is not allocation, purchase qualification or settlement.
 * Caller reads claim+quote from native_store_sandbox_claim_read_v1, and receipt
 * plus ORIGINAL immutable registry via journal_read_v1. Never use HTTP metadata.
 */
import { validNativeStoreSandboxClaimV1, validNativeStoreSandboxQuoteV1 } from "./native-store-sandbox-command-v1.ts";
import { replayNativeStoreSandboxReceiptV1, type NativeStoreSandboxReceiptRowV1 } from "./native-store-sandbox-replay-v1.ts";
import type { NativeStoreSandboxConnectionV1 } from "./native-store-sandbox-bridge-v1.ts";
export type NativeStoreSandboxClaimRowV1 = {buyerId:string;selectionSessionGeneration:string;claim:Record<string,unknown>;quote:Record<string,unknown>};
export async function reconcileNativeStoreSandboxClaimV1(storedClaim:NativeStoreSandboxClaimRowV1,
 storedReceipt:NativeStoreSandboxReceiptRowV1,originalConnection:NativeStoreSandboxConnectionV1,originalRevisionRevoked:boolean){
 // Detach before the replay await; replay itself detaches its inputs/key bytes.
 const stored=structuredClone(storedClaim);
 if(!stored||typeof stored.buyerId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(stored.buyerId)
  ||!validNativeStoreSandboxClaimV1(stored.claim)||!validNativeStoreSandboxQuoteV1(stored.quote)
  ||typeof stored.selectionSessionGeneration!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(stored.selectionSessionGeneration)
  ||stored.quote.creatorId===stored.buyerId)throw Error("native_store_claim_evidence_invalid");
 const c=stored.claim,q=stored.quote,cat=q.catalog as Record<string,unknown>;
 const replay=await replayNativeStoreSandboxReceiptV1(storedReceipt,originalConnection,originalRevisionRevoked);
 const o=replay.observation,reasons:string[]=[];
 if(o.parseStatus!=="valid"||o.issues.length)reasons.push("receipt_invalid");
 if(replay.projectId!==cat.projectId||o.appId!==cat.appId||o.store!==cat.store||o.environment!=="SANDBOX"
  ||replay.reasons.some(r=>["native_store_app_mismatch","native_store_store_mismatch","native_store_sandbox_required"].includes(r)))reasons.push("scope_mismatch");
 // Aliases/original user are not ownership proof. No lookup by SKU or newest
 // pending selection and no normalization of either transaction identifier.
 if(o.userId!==stored.buyerId||o.conflictingUserIds.length||o.transferredFrom.length||o.transferredTo.length)reasons.push("buyer_mismatch");
 if(o.transactionId!==c.transactionIdentifier)reasons.push("transaction_mismatch");
 if(o.productId!==c.productIdentifier||c.productIdentifier!==cat.wireProductId)reasons.push("product_mismatch");
 const identifiersMatch=reasons.length===0;
 if(o.eventAt===null||o.originalTransactionId===null)reasons.push("purchase_evidence_incomplete");
 if(o.eventType!=="NON_RENEWING_PURCHASE")reasons.push("not_one_time_purchase");
 if(originalRevisionRevoked)reasons.push("original_revision_revoked");
 const lifecycleEvidenceObserved=o.parseStatus==="valid"&&["CANCELLATION","EXPIRATION","TRANSFER"].includes(o.eventType??"")?o.eventType:null;
 return Object.freeze({protocol:"native-store-sandbox-reconcile-v1" as const,claimId:c.id,selectionId:c.selectionId,receiptId:replay.receiptId,
  identifiersMatch,oneTimeCandidate:identifiersMatch&&o.eventAt!==null&&o.originalTransactionId!==null&&o.eventType==="NON_RENEWING_PURCHASE",
  negativeLifecycleEvidence:identifiersMatch&&["CANCELLATION","EXPIRATION","TRANSFER"].includes(o.eventType??""),
  // Productless transfers still need project-wide reconciliation; this flag
  // does NOT bind such an event to this assertion/resource or revoke access.
  lifecycleEvidenceObserved,reconciliationRequired:lifecycleEvidenceObserved!==null,reconciliationScope:"project" as const,
  originalRevisionRevoked,reasons:Object.freeze([...reasons,"sdk_transaction_mapping_unqualified","monetary_and_lifecycle_settlement_unqualified"]),
  semantics:"explicit_client_assertion_not_store_attestation" as const,correlation:"unsupported" as const,
  dispatchAllowed:false as const,settlementAllowed:false as const,grantsAccess:false as const,financialAuthority:false as const});
}
