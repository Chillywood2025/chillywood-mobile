import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody, runCreatorCashout, type CashoutStore } from "../_shared/creator-cashout-execution.ts";

// Dormant until separately qualified and activated. A service invocation is not
// sufficient to open the SQL money switches or bypass provider qualification.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`) return jsonResponse(403, { error: "service_authority_required" });
  if (readOptionalEnv("CREATOR_CASHOUT_EXECUTION_ENABLED") !== "true") return jsonResponse(200, { status: "disabled", providerWrite: false });
  const admin = createAdminClient(), key = readOptionalEnv("STRIPE_CASHOUT_LIVE_KEY");
  if (!admin.configured || !key || !/^(sk|rk)_live_[A-Za-z0-9]+$/.test(key)) return jsonResponse(503, { error: "cashout_not_configured" });
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 256) return jsonResponse(400, { error: "body_too_large" });
    const text = await readCashoutBody(req.body, 256);
    if (text.length > 256) return jsonResponse(400, { error: "body_too_large" });
    const body = text.trim() ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => k !== "request_id")
      || typeof body.request_id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.request_id))
      return jsonResponse(400, { error: "cashout_request_id_required" });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await admin.client.rpc(name, args);
      if (result.error || !result.data) throw Error("cashout_database_unavailable");
      return result.data;
    };
    const store: CashoutStore = {
      read: requestId => rpc("get_creator_cashout_execution_context", { p_request_id: requestId }),
      claim: (requestId, stage) => rpc("claim_creator_cashout_dispatch", { p_request_id: requestId, p_stage: stage }),
      observe: (requestId, token, facts) => rpc("record_creator_cashout_observation", { p_request_id: requestId, p_dispatch_token: token, p_facts: facts }),
    };
    return jsonResponse(200, await runCreatorCashout(body.request_id, store, key));
  } catch {
    // Never claim that an error means no transfer/payout occurred. SQL retains
    // unknown dispatch and the next run can only reconcile it with GETs.
    return jsonResponse(409, { error: "cashout_requires_reconciliation", canRetryPayout: false });
  }
});
