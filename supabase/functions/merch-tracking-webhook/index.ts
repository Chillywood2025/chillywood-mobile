import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createAdminClient, jsonResponse, readOptionalEnv} from "../_shared/stripe-connect.ts";
import {boundedTrackingDatabase, hashTrackingBody, readBoundedTrackingBody, trackingNotification, verifyTrackingSignature} from "../_shared/merch-tracking.ts";

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
  let hint: ReturnType<typeof trackingNotification>;
  try { hint = trackingNotification(raw, environment); }
  catch { return jsonResponse(400, {error: "invalid_tracking_notification"}); }
  try {
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, {error: "tracking_not_configured"});
    const result = await boundedTrackingDatabase(admin.client.rpc("receive_merch_tracking_hint", {
      p_hash: await hashTrackingBody(raw), p_carrier: hint.carrier, p_tracking_number: hint.tracking_number, p_environment: environment,
    }));
    if (result.error || typeof result.data?.accepted !== "boolean"
      || result.data.accepted && typeof result.data.duplicate !== "boolean")
      return jsonResponse(503, {error: "tracking_receipt_unavailable"});
    // SQL either commits the durable hint (including a duplicate) or explicitly
    // ignores an ineligible assignment. Unknown outcomes remain retryable; the
    // payload hash makes a later retry safe if a timed-out commit succeeded.
    return jsonResponse(200, {received: true, accepted: result.data.accepted, financialAuthority: false});
  } catch { return jsonResponse(503, {error: "tracking_receipt_unavailable"}); }
});
