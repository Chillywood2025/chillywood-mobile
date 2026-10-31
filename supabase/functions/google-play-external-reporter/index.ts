import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { googlePlayReporterAccessToken } from "../_shared/google-play-reporter-oauth.ts";
import { submitExternalReport } from "../_shared/google-play-external-reporting.ts";

async function sameSecret(actual: string, expected: string) {
  const digest = async (v: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}
Deno.serve(async req => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const workerSecret = readOptionalEnv("GOOGLE_PLAY_EXTERNAL_REPORTER_WORKER_SECRET");
  if (!workerSecret || workerSecret.length < 32
    || !await sameSecret(req.headers.get("authorization") ?? "", `Bearer ${workerSecret}`)) {
    return jsonResponse(401, { error: "worker_authority_required" });
  }
  // All switches are server-only. No body, header, opaque native token or user
  // metadata can activate provider writes or impersonate a license tester.
  const credentials = readOptionalEnv("GOOGLE_PLAY_EXTERNAL_REPORTER_SERVICE_ACCOUNT_JSON");
  if (readOptionalEnv("GOOGLE_PLAY_EXTERNAL_REPORTING_ENABLED") !== "true"
    || readOptionalEnv("GOOGLE_PLAY_EXTERNAL_LICENSE_TEST_MODE") !== "true" || !credentials) {
    return jsonResponse(503, { error: "google_reporter_not_configured" });
  }
  const admin = createAdminClient();
  if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
  try {
    const token = await googlePlayReporterAccessToken(credentials);
    const lease = crypto.randomUUID();
    const claimed = await admin.client.rpc("claim_google_play_external_report", { p_lease_id: lease });
    if (claimed.error) return jsonResponse(503, { error: "google_report_claim_failed" });
    if (!claimed.data) return jsonResponse(200, { processed: false });
    const result = await submitExternalReport(claimed.data.report, token, (url, init) => fetch(url,
      { ...init, signal: AbortSignal.timeout(20000), redirect: "error" }));
    const saved = await admin.client.rpc("finish_google_play_external_report", {
      p_outbox_id: claimed.data.outboxId, p_lease_id: lease, p_result: result,
    });
    if (saved.error || saved.data !== true) return jsonResponse(503, { error: "google_report_commit_pending" });
    // Never return the private report, token, buyer, quote, amounts or receipt.
    return jsonResponse(200, { processed: true, status: result.status });
  } catch {
    // A leased record remains reconcilable after expiry. Never disclose raw
    // provider responses, OAuth errors, account fields or token-bearing data.
    return jsonResponse(503, { error: "google_reporter_retry_required" });
  }
});
