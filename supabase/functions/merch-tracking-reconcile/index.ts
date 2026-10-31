import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient, jsonResponse, readOptionalEnv} from "../_shared/stripe-connect.ts";
import {hashTrackingBody, normalizeTracking, shippoRequest, type TrackingJob} from "../_shared/merch-tracking.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, {error: "method_not_allowed"});
  const workerSecret = readOptionalEnv("MERCH_TRACKING_WORKER_SECRET");
  const token = readOptionalEnv("MERCH_SHIPPO_TEST_TOKEN");
  if (!workerSecret || !token?.startsWith("shippo_test_")) return jsonResponse(503, {error: "tracking_not_configured"});
  const presented = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!presented || await hashTrackingBody(presented) !== await hashTrackingBody(workerSecret))
    return jsonResponse(401, {error: "unauthorized"});
  const configured = createAdminClient();
  if (!configured.configured) return jsonResponse(503, {error: "tracking_not_configured"});
  const admin = configured.client;
  const claimed = await admin.rpc("claim_merch_tracking_jobs", {p_limit: 5});
  if (claimed.error || !Array.isArray(claimed.data)) return jsonResponse(503, {error: "tracking_queue_unavailable"});
  let completed = 0;
  for (const job of claimed.data as TrackingJob[]) {
    let registered = job.registration_state === "registered";
    let facts: Record<string, unknown>;
    try {
      if (job.registration_state === "pending") {
        // Claim commits attempted before POST. Ambiguous results are not retried;
        // authenticated polling remains operational without webhook registration.
        try { await shippoRequest(job, token, true); registered = true; } catch { /* GET reconciles independently */ }
      }
      facts = {...await normalizeTracking(await shippoRequest(job, token, false))};
    } catch {
      // Do not leak credentials, raw response bodies, or arbitrary provider errors.
      facts = {status: "UNKNOWN", carrier: job.carrier, tracking_number: job.tracking_number,
        test: true, review_reason: "carrier_unavailable"};
    }
    const result = await admin.rpc("complete_merch_tracking_job", {p_assignment_id: job.id,
      p_lease: job.lease, p_facts: facts, p_registered: registered});
    if (!result.error) completed++;
  }
  return jsonResponse(completed === claimed.data.length ? 200 : 503,
    {claimed: claimed.data.length, completed, financialAuthority: false});
});
