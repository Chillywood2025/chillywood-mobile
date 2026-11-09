/** Server-owned runtime wiring shared by ingress and service reconciliation.
 * Callers supply only a persisted parent ID and a bounded remaining budget. */
import { createAdminClient } from "./provider-readiness.ts";
import { processPersistedNativeStoreReceiptV1, type NativeStoreEffectWorkV1 } from "./native-store-effect-worker-v1.ts";
import { parseNativeStoreRuntimeConnectionsV1, resolveNativeStoreOriginalConnectionV1 } from "./native-store-runtime-config-v1.ts";
const workArgs=(work:NativeStoreEffectWorkV1)=>({p_raw_receipt_id:work.rawReceiptId,p_claim_id:work.claimId,p_protocol_id:work.protocolId,p_protocol_revision:work.protocolRevision});
export async function processConfiguredNativeStoreReceiptV1(rawReceiptId:string,deadlineMs:number){
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>15000)throw Error("native_reconciliation_unavailable");
  const deadline=performance.now()+deadlineMs;
  // Parse only server-owned configuration, after service auth and exact body.
  // Resolver receives the original immutable journal registry from the worker.
  const connections=parseNativeStoreRuntimeConnectionsV1(Deno.env.get("NATIVE_STORE_CONNECTIONS_JSON"));
  const admin=createAdminClient();if(!admin.configured)throw Error("native_reconciliation_unavailable");
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await admin.client.rpc(name,args);if(error)throw Error("native_reconciliation_unavailable");return data;};
  const remaining=Math.floor(deadline-performance.now());
  if(remaining<1)throw Error("native_reconciliation_unavailable");
  return processPersistedNativeStoreReceiptV1(rawReceiptId,{
   readCandidate:id=>rpc("native_store_sandbox_effect_candidate_v1",{p_raw_receipt_id:id}),
   readContext:work=>rpc("native_store_sandbox_effect_context_v1",workArgs(work)),
   readOriginalJournal:id=>rpc("native_store_sandbox_journal_read_v1",{p_receipt_id:id}),
   resolveOriginalConnection:async registry=>resolveNativeStoreOriginalConnectionV1(connections,registry),
   applyEffect:(work,projection)=>rpc("native_store_sandbox_effect_v1",{...workArgs(work),p_projection:projection}),
  },{deadlineMs:remaining});
}
