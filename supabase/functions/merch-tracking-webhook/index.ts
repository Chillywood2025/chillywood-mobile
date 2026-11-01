import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient, jsonResponse, readOptionalEnv} from "../_shared/stripe-connect.ts";
import {hashTrackingBody, readBoundedTrackingBody, trackingNotification, verifyTrackingSignature} from "../_shared/merch-tracking.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, {error: "method_not_allowed"});
  const secret = readOptionalEnv("MERCH_SHIPPO_WEBHOOK_SECRET");
  const environment = readOptionalEnv("MERCH_TRACKING_ENVIRONMENT") || "sandbox";
  if (environment !== "sandbox" && environment !== "production") return jsonResponse(503, {error: "tracking_not_configured"});
  if (!secret) return jsonResponse(503, {error: "tracking_not_configured"});
  if (Number(req.headers.get("content-length")) > 256000) return jsonResponse(413, {error: "payload_too_large"});
  let raw: string;
  try { raw = await readBoundedTrackingBody(req.body); }
  catch { return jsonResponse(413, {error: "invalid_or_oversized_payload"}); }
  if (!await verifyTrackingSignature(raw, req.headers.get("shippo-auth-signature") ?? "", secret))
    return jsonResponse(400, {error: "invalid_signature"});
  try {
    const hint = trackingNotification(raw, environment);
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, {error: "tracking_not_configured"});
    const result = await admin.client.rpc("receive_merch_tracking_hint", {
      p_hash: await hashTrackingBody(raw), p_carrier: hint.carrier, p_tracking_number: hint.tracking_number, p_environment: environment,
    });
    if (result.error) return jsonResponse(503, {error: "tracking_receipt_unavailable"});
    // Acknowledge after durable inbox commit, never after carrier I/O.
    return jsonResponse(200, {received: true, financialAuthority: false});
  } catch { return jsonResponse(400, {error: "invalid_tracking_notification"}); }
});
