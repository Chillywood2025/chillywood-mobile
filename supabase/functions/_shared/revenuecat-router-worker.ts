import { decryptRouterEnvelope, observeRevenueCatBytes, type RouterConnection, type RouterEnvelope } from "./revenuecat-router-envelope.ts";
import { planRevenueCatObservation, type RouterOwnershipSnapshot, type RouterPlan } from "./revenuecat-router-planner.ts";

export type RouterClaim = { protocol: "rc-router-job-v1"; status: "leased"; eventId: string; lease: string;
  leaseGeneration: number; leaseUntil: string; conflicted: boolean; authorityGranted: false;
  variants: { receiptId: string; connectionId: string; connectionRevision: number; projectId: string; envelope: RouterEnvelope }[];
  snapshot: RouterOwnershipSnapshot };
export type RouterWorkerDependencies = {
  claim: (worker: string) => Promise<RouterClaim | { status: "disabled" | "idle" | "held"; authorityGranted: false }>;
  connection: (id: string, revision: number) => RouterConnection | null;
  complete: (job: RouterClaim, plan: RouterPlan) => Promise<{ status: "plan_recorded"; authorityGranted: false;
    legacyEffectsEnforced: false; acknowledgementAllowed: false }>;
  defer: (job: RouterClaim, reason: "storage_key_unavailable" | "stored_envelope_invalid" | "planner_unavailable" | "completion_unknown") => Promise<unknown>;
};
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(s);
/** Service-internal worker. This function has no HTTP auth, provider fetch,
 * projector, grant writer, hold resolver or authority-producing callback.
 * Transport adapters must authenticate before calling it. */
export async function runReceiptRouterWorker(deps: RouterWorkerDependencies, worker: string) {
  if (!uuid(worker)) throw new Error("router_worker_invalid");
  const job = await deps.claim(worker);
  if (!job || job.authorityGranted !== false) throw new Error("router_claim_invalid");
  if (job.status !== "leased") {
    if (!["disabled", "idle", "held"].includes(job.status)) throw new Error("router_claim_invalid");
    return { status: job.status, authorityGranted: false, legacyEffectsEnforced: false };
  }
  if (job.protocol !== "rc-router-job-v1" || !uuid(job.eventId) || !uuid(job.lease)
    || !Number.isSafeInteger(job.leaseGeneration) || job.leaseGeneration < 1
    || !Number.isFinite(Date.parse(job.leaseUntil)) || Date.parse(job.leaseUntil) <= Date.now()
    || !Array.isArray(job.variants) || job.variants.length < 1 || job.variants.length > 32
    || job.conflicted !== (job.variants.length > 1)) throw new Error("router_claim_invalid");
  let reason: Parameters<RouterWorkerDependencies["defer"]>[1] = "storage_key_unavailable";
  try {
    const plans: RouterPlan[] = [];
    for (const variant of job.variants) {
      const connection = deps.connection(variant.connectionId, variant.connectionRevision);
      if (!connection || connection.connectionId !== variant.connectionId || connection.connectionRevision !== variant.connectionRevision
        || connection.projectId !== variant.projectId || connection.projectId !== job.snapshot.projectId)
        throw new Error("router_storage_key_unavailable");
      reason = "stored_envelope_invalid";
      const bytes = await decryptRouterEnvelope(variant.envelope, connection);
      reason = "planner_unavailable";
      plans.push(planRevenueCatObservation(observeRevenueCatBytes(bytes), job.snapshot));
    }
    let plan = plans[0];
    if (job.conflicted) {
      // No variant wins. Preserve all known targets and force reconciliation.
      const targets = plans.flatMap(p => p.holdTargets);
      plan = { ...plan, owner: null, productId: null, originalTransactionId: null,
        disposition: "reconciliation_required", reason: "authenticated_event_bytes_conflict",
        holdTargets: [...new Map(targets.map(row => [JSON.stringify(row), row])).values()],
        requiresCompleteProviderEvidence: true };
    }
    reason = "completion_unknown";
    const result = await deps.complete(job, plan);
    if (!result || result.status !== "plan_recorded" || result.authorityGranted !== false
      || result.legacyEffectsEnforced !== false || result.acknowledgementAllowed !== false)
      throw new Error("router_completion_unknown");
    return { status: result.status, authorityGranted: false, legacyEffectsEnforced: false };
  } catch {
    // Completion may have committed. CAS defer either safely queues the still
    // owned lease or rejects; neither case authorizes forwarding or regranting.
    try { await deps.defer(job, reason); } catch { /* leased work expires; no success is fabricated */ }
    return { status: "pending", reason, authorityGranted: false, legacyEffectsEnforced: false };
  }
}
