import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient, createAuthClient, jsonResponse, optionsResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { readCashoutBody, runCreatorCashout, type CashoutStore } from "../_shared/creator-cashout-execution.ts";
import { readPrefundedTipEvidence } from "../_shared/stripe-tip-prefunded-reader.ts";
import { prefundedTipEvidenceRequiresHold } from "../_shared/stripe-tip-prefunded-evidence.ts";

// Separate adapter, credentials, ledger and authorization. Never route test
// earnings through the live worker or enable any production money switch.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (readOptionalEnv("SANDBOX_CREATOR_CASHOUT_ENABLED") !== "true")
    return jsonResponse(503, { error: "sandbox_cashout_disabled", environment: "test", providerWrite: false });
  const key = readOptionalEnv("STRIPE_CASHOUT_TEST_KEY");
  if (!key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) return jsonResponse(503, { error: "sandbox_cashout_not_configured" });
  try {
    const body = JSON.parse(await readCashoutBody(req.body, 256));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => k !== "request_id")
      || typeof body.request_id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.request_id))
      return jsonResponse(400, { error: "sandbox_request_id_required" });
    const authorization = req.headers.get("Authorization") ?? "";
    if (!/^Bearer \S+$/i.test(authorization)) return jsonResponse(401, { error: "session_required" });
    const { supabaseUrl, supabaseAnonKey } = createAuthClient();
    const caller = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization,
        ...( ["android", "ios", "web"].includes(req.headers.get("x-chillywood-platform") ?? "")
          ? { "x-chillywood-platform": req.headers.get("x-chillywood-platform")! } : {} ) } },
    });
    // This authenticated RPC verifies exact current session, tester membership
    // and request ownership. Knowing a request UUID is not authorization.
    let authorized = await caller.rpc("get_my_sandbox_creator_cashout_execution", { p_request_id: body.request_id });
    let prefunded = false;
    if (authorized.error) {
      authorized = await caller.rpc("get_my_sandbox_prefunded_tip_cashout", { p_request_id: body.request_id });
      prefunded = authorized.data?.executionKind === "prefunded_destination_tip";
      if (!prefunded) return jsonResponse(403, { error: "sandbox_request_not_authorized" });
    }
    if (authorized.error || authorized.data?.requestId !== body.request_id || authorized.data.environment !== "test"
      || authorized.data.financialAuthority !== false) return jsonResponse(403, { error: "sandbox_request_not_authorized" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "sandbox_cashout_not_configured" });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await admin.client.rpc(name, args);
      if (result.error || !result.data) throw Error("sandbox_database_unavailable");
      return result.data;
    };
    const store: CashoutStore = {
      read: async id => {
        const context = await rpc(prefunded ? "get_sandbox_prefunded_tip_cashout_context" : "get_sandbox_creator_cashout_execution_context", { p_request_id: id });
        if (context.environment !== "test" || context.requestId !== id
          || (prefunded ? context.fundingMode !== "prefunded_destination" : context.fundingMode === "prefunded_destination"))
          throw Error("sandbox_mode_required");
        return context;
      },
      preparePrefundedClaim: prefunded ? async (id, balance) => {
        const context = await rpc("get_sandbox_prefunded_tip_cashout_context", { p_request_id: id });
        const source = await rpc("get_sandbox_prefunded_tip_source_context", { p_tip_id: context.tipId });
        let facts;
        try { facts = await readPrefundedTipEvidence(source, key); }
        catch (error) {
          if (prefundedTipEvidenceRequiresHold(error)) await rpc("hold_sandbox_prefunded_tip_source", { p_tip_id: context.tipId, p_reason: "provider_source_reconciliation_required" });
          throw Error("sandbox_source_reconciliation_required");
        }
        const receipt = await rpc("record_sandbox_prefunded_tip_receipt", { p_facts: facts });
        await rpc("prepare_sandbox_prefunded_tip_dispatch", { p_request_id: id, p_receipt_id: receipt.receiptId, p_balance_facts: balance });
      } : undefined,
      claim: (id, stage) => rpc(prefunded ? "claim_sandbox_prefunded_tip_cashout_dispatch" : "claim_sandbox_creator_cashout_dispatch", { p_request_id: id, p_stage: stage }),
      observe: (id, token, facts) => rpc(prefunded ? "record_sandbox_prefunded_tip_cashout_observation" : "record_sandbox_creator_cashout_observation", { p_request_id: id, p_dispatch_token: token, p_facts: facts }),
    };
    await runCreatorCashout(body.request_id, store, key);
    // Do not turn a dispatch or a preview into payout success. Read the user's
    // authoritative isolated record again, including session revocation.
    const result = await caller.rpc(prefunded ? "get_my_sandbox_prefunded_tip_cashout" : "get_my_sandbox_creator_cashout_execution", { p_request_id: body.request_id });
    if (result.error || result.data?.requestId !== body.request_id || result.data.environment !== "test"
      || result.data.financialAuthority !== false) throw Error("sandbox_result_unresolved");
    return jsonResponse(200, result.data);
  } catch {
    return jsonResponse(409, { error: "sandbox_cashout_requires_reconciliation", environment: "test", canRetryPayout: false });
  }
});
