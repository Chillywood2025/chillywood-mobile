import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv, verifyStripeWebhookSignature } from "../_shared/stripe-connect.ts";
import { parseAuctionEvidence, parseAuctionNoPaymentEvidence } from "../_shared/stripe-event-auction-evidence.ts";

Deno.serve(async req => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const secret = readOptionalEnv("STRIPE_EVENT_AUCTION_WEBHOOK_SECRET");
  if (!secret?.startsWith("whsec_")) return jsonResponse(503, { error: "auction_webhook_not_configured" });
  const raw = await req.text();
  if (raw.length > 1024 * 1024) return jsonResponse(413, { error: "event_too_large" });
  if (!await verifyStripeWebhookSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return jsonResponse(400, { error: "invalid_signature" });
  }
  try {
    const event = JSON.parse(raw);
    const noPayment = parseAuctionNoPaymentEvidence(event);
    const evidence = noPayment ?? parseAuctionEvidence(event);
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
