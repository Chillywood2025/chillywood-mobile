import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, verifyStripeWebhookSignature, jsonResponse } from "../_shared/stripe-connect.ts";
import { observeLiveConnectAccount } from "../_shared/stripe-connect-live-observation.ts";
import { readCashoutBody } from "../_shared/creator-cashout-execution.ts";

// Separate dormant signing boundary. Never reuse the test-mode webhook secret.
// Events are hints, not account-state authority: always GET current provider data.
Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const signingSecret = Deno.env.get("STRIPE_CONNECT_LIVE_OBSERVATION_WEBHOOK_SECRET") ?? "";
  const readSecret = Deno.env.get("STRIPE_CASHOUT_LIVE_KEY") ?? "";
  if (!signingSecret.startsWith("whsec_") || !/^(sk|rk)_live_[A-Za-z0-9]+$/.test(readSecret)) {
    return jsonResponse(503, { error: "live_observation_not_configured" });
  }
  try {
    const body = await readCashoutBody(req.body, 262144, 10000);
    if (!await verifyStripeWebhookSignature(body, req.headers.get("stripe-signature"), signingSecret)) {
      return jsonResponse(400, { error: "invalid_signature" });
    }
    const event = JSON.parse(body);
    if (event.livemode !== true) return jsonResponse(400, { error: "mode_mismatch" });
    if (event.type !== "account.updated") return jsonResponse(200, { ignored: true });
    const accountId = event.data?.object?.id;
    if (!/^acct_[A-Za-z0-9]+$/.test(accountId) || event.account !== accountId || event.data?.object?.livemode === false
      || !/^evt_[A-Za-z0-9]+$/.test(event.id)) return jsonResponse(400, { error: "binding_invalid" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "not_configured" });
    const row = await admin.client.from("creator_payout_accounts").select("creator_user_id")
      .eq("provider", "stripe_connect").eq("provider_environment", "live").eq("provider_account_id", accountId).maybeSingle();
    if (row.error) throw Error("binding_read_failed");
    if (!row.data) return jsonResponse(200, { ignored: true, reason: "unbound_account" });
    const context = await admin.client.rpc("get_creator_connect_live_observation_context", { p_creator: row.data.creator_user_id });
    if (context.error || context.data?.accountId !== accountId) throw Error("context_unavailable");
    const facts = await observeLiveConnectAccount(context.data, readSecret);
    const recorded = await admin.client.rpc("record_creator_connect_live_observation", { p_context: context.data, p_facts: facts });
    if (recorded.error || !recorded.data?.recorded) throw Error("observation_retry_required");
    return jsonResponse(200, { observed: true, providerWrite: false, liveMoneyAction: false, payoutExecution: false });
  } catch {
    // Non-2xx preserves Stripe retry; no raw account payload or secret is logged.
    return jsonResponse(503, { error: "observation_retry_required" });
  }
});
