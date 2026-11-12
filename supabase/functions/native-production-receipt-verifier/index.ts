import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";

// OFF, source-only transport for an independently qualified receipt adapter.
// This endpoint does not authenticate a Store transaction itself. The database
// verifies the adapter signature and its exact current private qualification.
// Neither a client callback nor webhook prices constitute that signed proof.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  if (readOptionalEnv("NATIVE_PRODUCTION_RECEIPT_VERIFICATION_ENABLED") !== "true")
    return jsonResponse(200, { status: "disabled", financialAuthority: false });
  try {
    req.signal.throwIfAborted();
    const text = await readCashoutBody(req.body, 12288, 5000, req.signal);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).length !== 3 || typeof body.keyId !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(body.keyId)
      || typeof body.assertion !== "string" || !body.assertion || new TextEncoder().encode(body.assertion).length > 8192
      || typeof body.signatureSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(body.signatureSha256))
      return jsonResponse(400, { error: "signed_receipt_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "database_unavailable" });
    req.signal.throwIfAborted();
    const result = await admin.client.rpc("accept_native_production_paid_video_receipt", {
      p_key_id: body.keyId, p_assertion: body.assertion, p_signature_sha256: body.signatureSha256,
    }).abortSignal(req.signal);
    // Transport cancellation leaves an issued RPC's outcome unresolved.
    // Never retry it or infer that its durable acceptance was rolled back.
    req.signal.throwIfAborted();
    if (result.error || !result.data || !["HELD", "ACCESS_VERIFIED"].includes(result.data.status)
      || result.data.financialAuthority !== false || result.data.payable !== false
      || result.data.accessGranted !== (result.data.status === "ACCESS_VERIFIED"))
      throw Error("native_receipt_unresolved");
    return jsonResponse(200, result.data);
  } catch {
    // Never return a signature, assertion, transaction identifier or DB error.
    return jsonResponse(409, { error: "native_receipt_unresolved", financialAuthority: false });
  }
});
