import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { googlePlayReporterAccessToken } from "../_shared/google-play-reporter-oauth.ts";
import { submitExternalReport } from "../_shared/google-play-external-reporting.ts";
import type { GoogleRefundTaxContext } from "../_shared/google-refund-tax-reconciliation.ts";
import { reconcileGoogleRefundTax } from "../_shared/google-refund-tax-history.ts";
import { createMerchObservationBudget } from "../_shared/merch-observation-budget.ts";

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
    // Tax evidence is read-only at Stripe, bounded, and independent of payment
    // creation. A missing association does not unblock a reporting obligation.
    // Reuse existing mode-bound credentials; never provision credentials here.
    const tipKey = readOptionalEnv("STRIPE_SECRET_KEY"), tipAccount = readOptionalEnv("STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID");
    const auctionKey = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_KEY"), auctionAccount = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID");
    const videoKey = readOptionalEnv("STRIPE_TEST_SECRET_KEY"), videoAccount = readOptionalEnv("STRIPE_VIDEO_TEST_ACCOUNT_ID");
    if ((tipKey && tipAccount) || (auctionKey && auctionAccount) || (videoKey && videoAccount)) {
      const budget = createMerchObservationBudget();
      try {
        const candidate = await budget.run(() => admin.client.rpc("claim_google_refund_tax_context"), 5000);
        if (candidate.error) throw Error("refund_tax_claim_failed");
        if (candidate.data) {
          const context = candidate.data as GoogleRefundTaxContext;
          // A missing/unknown feature never borrows another flow's credentials.
          const auction = context.feature === "event_auction" || context.feature === "room_seat_auction";
          const key = context.feature === "paid_video" ? videoKey : context.feature === "creator_tip" ? tipKey : auction ? auctionKey : null;
          const account = context.feature === "paid_video" ? videoAccount : context.feature === "creator_tip" ? tipAccount : auction ? auctionAccount : null;
          if (key && account) {
            await budget.run(() => reconcileGoogleRefundTax(admin.client, context, key, account, budget.transport));
          }
        }
      } catch {
        // Keep blocked obligations durable and retriable. One unresolved tax
        // history must not prevent unrelated ready Google reports progressing.
      } finally { budget.close(); }
    }
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
