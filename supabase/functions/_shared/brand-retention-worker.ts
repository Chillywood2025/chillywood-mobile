import {expirePlatformBrandAsset} from "./brand-retention-expiry.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: unknown}>;
type Origin = Parameters<typeof expirePlatformBrandAsset>[1]["origin"];
type Batch = {
  enabled: boolean | null;
  qualified: boolean | null;
  success: boolean;
  results: {assetId: string; status: string; permanentlyAbsent: false}[];
  heartbeatRecorded: boolean | null;
  error?: string;
  permanentPhysicalAbsenceGuaranteed: false;
};
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
// Only terminal outcomes from the existing Brand begin/claim/read protocol and
// the batch wrappers are valid. Intermediate or unknown statuses cannot turn
// a malformed RPC reply into a completed-pass heartbeat.
const terminalStatuses = new Set([
  "disabled", "transport_unqualified_or_disabled", "provider_contract_unqualified",
  "publication_schema_unavailable", "required_guard_unavailable", "not_removed", "not_due",
  "held", "references_or_coverage_blocked", "unproven_incarnation",
  "scan_receipt_adapter_unavailable", "scan_receipt_no_longer_current", "claim_unavailable",
  "incarnation_unavailable", "storage_generation_changed", "claimed_scan_evidence_unavailable",
  "proof_no_longer_current", "contended", "batch_disabled_or_unqualified", "batch_dispatch_unavailable",
  "failed", "delete_acknowledged", "observed_absent",
]);

// SQL owns due selection, qualification, the independent default-off batch gate,
// and a one-hour per-asset dispatch fence. Never enumerate provider storage or
// retry an uncertain RPC here. Every selected asset uses the existing exact
// claim/recheck/version-specific transport once, including its receipt checks.
export async function runPlatformBrandRetentionExpiryBatch(rpc: Rpc, origin: Origin): Promise<Batch> {
  const batch: Batch = {enabled: null, qualified: null, success: false, results: [],
    heartbeatRecorded: false, permanentPhysicalAbsenceGuaranteed: false};
  let work: Record<string, unknown> | null;
  try {
    const reply = await rpc("list_platform_brand_retention_expiry_work", {});
    if (reply.error) throw Error("unconfirmed");
    work = object(reply.data);
  } catch {
    return {...batch, error: "brand_retention_work_unconfirmed"};
  }
  // Validate the whole response before even considering an origin call. UUID
  // aliases differing only by case must not dispatch the same asset twice.
  if (!work || typeof work.enabled !== "boolean" || typeof work.qualified !== "boolean"
    || work.limit !== 25 || !Array.isArray(work.assetIds) || work.assetIds.length > 25
    || !work.assetIds.every(uuid)
    || new Set(work.assetIds.map(id => id.toLowerCase())).size !== work.assetIds.length
    || ((!work.enabled || !work.qualified) && work.assetIds.length !== 0)) {
    return {...batch, error: "brand_retention_work_invalid"};
  }
  batch.enabled = work.enabled;
  batch.qualified = work.qualified;
  // Keep the explicit single-asset transport unchanged. These batch-only SQL
  // wrappers additionally recheck the dispatch fence and current batch/global
  // gates before delegating to its existing claim and exact-binding reads.
  const batchRpc: Rpc = (name, args) => rpc(
    name === "begin_platform_brand_retention_transport" ? "begin_platform_brand_retention_batch_transport"
      : name === "read_platform_brand_retention_expiry_claim" ? "read_platform_brand_retention_batch_claim" : name,
    args,
  );
  for (const assetId of work.assetIds) {
    try {
      const result = await expirePlatformBrandAsset(assetId, {rpc: batchRpc, origin});
      if (!terminalStatuses.has(result.status)) throw Error("brand_retention_status_unconfirmed");
      batch.results.push({assetId, status: result.status, permanentlyAbsent: false});
      if (result.status === "failed") batch.error = "brand_retention_asset_attempt_failed";
    } catch {
      // Keep completed outcomes, but do not disguise a failed/unconfirmed claim
      // or receipt as a successful provider pass or expose private exceptions.
      batch.results.push({assetId, status: "unconfirmed", permanentlyAbsent: false});
      batch.error = "brand_retention_asset_attempt_failed";
    }
  }
  if (batch.error) return batch;
  try {
    const reply = await rpc("record_platform_brand_retention_worker_heartbeat", {
      p_enabled: batch.enabled, p_qualified: batch.qualified,
    });
    const receipt = object(reply.data);
    if (reply.error || !receipt || receipt.status !== "recorded"
      || receipt.enabled !== batch.enabled || receipt.qualified !== batch.qualified
      || receipt.permanentlyAbsent !== false) throw Error("unconfirmed");
  } catch {
    // The heartbeat RPC may have committed before its reply was lost. Do not
    // retry it or assert that no heartbeat was written in that uncertain case.
    return {...batch, heartbeatRecorded: null, error: "brand_retention_heartbeat_unconfirmed"};
  }
  // Disabled/unqualified passes establish liveness only. Even a completed,
  // qualified pass does not establish permanent absence or backlog completion.
  return {...batch, success: true, heartbeatRecorded: true};
}
