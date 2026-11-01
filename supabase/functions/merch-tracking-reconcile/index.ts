import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient, jsonResponse, readOptionalEnv} from "../_shared/stripe-connect.ts";
import {hashTrackingBody, normalizeTracking, readExistingShippoTracking, type TrackingJob} from "../_shared/merch-tracking.ts";

async function bounded<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(work), new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("tracking_database_deadline")), 5000);
  })]); } finally { if (timer) clearTimeout(timer); }
}

Deno.serve(async (req: Request) => {
  const deadline = Date.now() + 75000;
  if (req.method !== "POST") return jsonResponse(405, {error: "method_not_allowed"});
  const workerSecret = readOptionalEnv("MERCH_TRACKING_WORKER_SECRET");
  const environment = readOptionalEnv("MERCH_TRACKING_ENVIRONMENT") || "sandbox";
  if (environment !== "sandbox" && environment !== "production") return jsonResponse(503, {error: "tracking_not_configured"});
  const token = readOptionalEnv(environment === "production" ? "MERCH_SHIPPO_LIVE_TOKEN" : "MERCH_SHIPPO_TEST_TOKEN");
  if (!workerSecret || !token?.startsWith(environment === "production" ? "shippo_live_" : "shippo_test_"))
    return jsonResponse(503, {error: "tracking_not_configured"});
  const presented = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!presented || await hashTrackingBody(presented) !== await hashTrackingBody(workerSecret))
    return jsonResponse(401, {error: "unauthorized"});
  const configured = createAdminClient();
  if (!configured.configured) return jsonResponse(503, {error: "tracking_not_configured"});
  const admin = configured.client;
  try {
  const claimed = await bounded(admin.rpc("claim_merch_tracking_jobs", {p_limit: 5, p_environment: environment}));
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > 5) return jsonResponse(503, {error: "tracking_queue_unavailable"});
  let completed = 0;
  for (const job of claimed.data as TrackingJob[]) {
    if (job.environment !== environment) throw new Error("tracking_claim_environment_mismatch");
    // Existing tracking GET + SQL acknowledgement have bounded aggregate time.
    // Untouched leases expire normally; a partial batch is never called complete.
    if (deadline - Date.now() < 25000) break;
    let facts: Record<string, unknown>;
    try {
      // Consume only: never register tracking, create shipments, or buy labels.
      facts = {...await normalizeTracking(await readExistingShippoTracking(job, token, undefined, environment))};
    } catch {
      // Do not leak credentials, raw response bodies, or arbitrary provider errors.
      facts = {status: "UNKNOWN", carrier: job.carrier, tracking_number: job.tracking_number,
        test: environment === "sandbox", review_reason: "carrier_unavailable"};
    }
    const result = await bounded(admin.rpc("complete_merch_tracking_job", {p_assignment_id: job.id,
      p_lease: job.lease, p_facts: facts, p_registered: false}));
    if (!result.error && result.data && result.data.stale !== true) completed++;
  }
  return jsonResponse(completed === claimed.data.length ? 200 : 503,
    {claimed: claimed.data.length, completed, financialAuthority: false});
  } catch { return jsonResponse(503, {error: "tracking_reconciliation_incomplete", financialAuthority: false}); }
});
