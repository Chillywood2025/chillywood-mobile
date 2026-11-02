import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient, createAuthClient, jsonResponse, optionsResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";
import { readPrefundedTipEvidence } from "../_shared/stripe-tip-prefunded-reader.ts";
import { prefundedTipEvidenceRequiresHold } from "../_shared/stripe-tip-prefunded-evidence.ts";

// Test source evidence only. No POST to Stripe and no payout reservation here.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (readOptionalEnv("SANDBOX_CREATOR_CASHOUT_ENABLED") !== "true")
    return jsonResponse(503, { error: "sandbox_cashout_disabled", environment: "test", providerWrite: false });
  const key = readOptionalEnv("STRIPE_CASHOUT_TEST_KEY");
  if (!key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) return jsonResponse(503, { error: "sandbox_cashout_not_configured" });
  try {
    const body = JSON.parse(await readCashoutBody(req.body, 256));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => k !== "tip_id")
      || typeof body.tip_id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.tip_id))
      return jsonResponse(400, { error: "sandbox_tip_id_required" });
    const authorization = req.headers.get("Authorization") ?? "";
    if (!/^Bearer \S+$/i.test(authorization)) return jsonResponse(401, { error: "session_required" });
    const { supabaseUrl, supabaseAnonKey } = createAuthClient();
    const caller = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization,
        ...(["android", "ios", "web"].includes(req.headers.get("x-chillywood-platform") ?? "")
          ? { "x-chillywood-platform": req.headers.get("x-chillywood-platform")! } : {}) } },
    });
    const authorized = await caller.rpc("get_my_sandbox_prefunded_tip_source", { p_tip_id: body.tip_id });
    if (authorized.error || authorized.data?.tipId !== body.tip_id || authorized.data.environment !== "test"
      || authorized.data.financialAuthority !== false) return jsonResponse(403, { error: "sandbox_tip_not_authorized" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "sandbox_cashout_not_configured" });
    const context = await admin.client.rpc("get_sandbox_prefunded_tip_source_context", { p_tip_id: body.tip_id });
    if (context.error || context.data?.tipId !== body.tip_id) throw Error("sandbox_source_unavailable");
    let facts;
    try { facts = await readPrefundedTipEvidence(context.data, key); }
    catch (error) {
      // Contradictory normalized source facts hold only this source. Transport
      // failure/pending availability cannot produce a fresh dispatch probe.
      if (prefundedTipEvidenceRequiresHold(error)) await admin.client.rpc("hold_sandbox_prefunded_tip_source", {
        p_tip_id: body.tip_id, p_reason: "provider_source_reconciliation_required",
      });
      throw Error("sandbox_source_reconciliation_required");
    }
    const recorded = await admin.client.rpc("record_sandbox_prefunded_tip_receipt", { p_facts: facts });
    if (recorded.error || !recorded.data?.receiptId) throw Error("sandbox_receipt_unconfirmed");
    // Recheck the exact current user session before exposing any source result.
    const result = await caller.rpc("get_my_sandbox_prefunded_tip_source", { p_tip_id: body.tip_id });
    if (result.error || result.data?.tipId !== body.tip_id || result.data.environment !== "test"
      || result.data.financialAuthority !== false) throw Error("sandbox_result_unresolved");
    return jsonResponse(200, result.data);
  } catch {
    return jsonResponse(409, { error: "sandbox_tip_evidence_unavailable", environment: "test", providerWrite: false });
  }
});
