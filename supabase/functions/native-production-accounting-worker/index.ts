import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";

// Source-only, unscheduled and OFF. This worker reads the normal persisted
// accounting queue. It cannot issue source/report/funding proofs, toggle SQL
// controls, purchase, transfer, or dispatch to any provider.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  if (readOptionalEnv("NATIVE_PRODUCTION_ACCOUNTING_ENABLED") !== "true")
    return jsonResponse(200, { status: "disabled", providerWrite: false });
  try {
    const text = await readCashoutBody(req.body, 256, 5000);
    const body = text.trim() ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      return jsonResponse(400, { error: "empty_body_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "database_unavailable" });
    const result = await admin.client.rpc("process_native_production_accounting_jobs", { p_limit: 20 });
    if (result.error || !result.data) throw Error("native_accounting_unresolved");
    return jsonResponse(200, result.data);
  } catch {
    return jsonResponse(409, { error: "native_accounting_unresolved", providerWrite: false });
  }
});
