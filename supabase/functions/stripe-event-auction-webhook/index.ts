import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv, verifyStripeWebhookSignature } from "../_shared/stripe-connect.ts";
import { parseAuctionEvidence, parseAuctionNoPaymentEvidence } from "../_shared/stripe-event-auction-evidence.ts";

Deno.serve(async req => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const raw = await req.text();
  if (raw.length > 1024 * 1024) return jsonResponse(413, { error: "event_too_large" });
  let event;
  try { event = JSON.parse(raw); } catch { return jsonResponse(400, { error: "invalid_event" }); }
  const platform = event?.account === undefined;
  if (typeof event?.livemode !== "boolean") return jsonResponse(400, { error: "event_mode_required" });
  const live = event.livemode === true;
  const platformAccount = platform ? readOptionalEnv(live ? "STRIPE_AUCTION_PLATFORM_LIVE_ACCOUNT_ID" : "STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID") ?? undefined : undefined;
  const secret = readOptionalEnv(platform
    ? live ? "STRIPE_EVENT_AUCTION_PLATFORM_LIVE_WEBHOOK_SECRET" : "STRIPE_EVENT_AUCTION_PLATFORM_WEBHOOK_SECRET"
    : live ? "STRIPE_EVENT_AUCTION_LIVE_WEBHOOK_SECRET" : "STRIPE_EVENT_AUCTION_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_") || (platform && !/^acct_[A-Za-z0-9]+$/.test(platformAccount ?? "")))
    return jsonResponse(503, { error: "auction_webhook_not_configured" });
  if (!await verifyStripeWebhookSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return jsonResponse(400, { error: "invalid_signature" });
  }
  try {
    const noPayment = parseAuctionNoPaymentEvidence(event, platformAccount);
    const evidence = noPayment ?? parseAuctionEvidence(event, platformAccount);
    if (!evidence) return jsonResponse(400, { error: "unsupported_event_evidence" });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))))
      .map(v => v.toString(16).padStart(2, "0")).join("");
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
    const result = await admin.client.rpc(noPayment ? "process_stripe_event_auction_no_payment" : "process_stripe_event_auction_receipt",
      { p_evidence: evidence, p_payload_hash: hash });
    if (result.error) return jsonResponse(409, { error: "auction_receipt_not_committed" });
    return jsonResponse(200, { received: true, status: result.data?.status, payoutCreated: false });
  } catch {
    return jsonResponse(400, { error: "invalid_event" });
  }
});
