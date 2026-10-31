import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv, readStripeTestSecret } from "../_shared/stripe-connect.ts";
import { observeStripeMerchCosts, type MerchCostOrder } from "../_shared/stripe-merch-cost-observation.ts";
import { observeMerchDisputes, type MerchDisputeContext } from "../_shared/merch-dispute-observation.ts";

// JWT verification remains enabled. A user JWT is NOT worker authority. This
// worker additionally requires the exact existing server credential. No new
// secret, provider configuration or scheduler is created by this source change.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  const account = readOptionalEnv("STRIPE_MERCH_RECONCILIATION_ACCOUNT_ID"), secret = readStripeTestSecret();
  if (!account || !secret.configured)
    return jsonResponse(503, { error: "merch_cost_reconciliation_not_configured", financialAuthority: false });
  try {
    const body = await req.json();
    // Caller supplies only the order, never account, costs, transport or proof.
    if (!body || Object.keys(body).some(key => key !== "order_id")
      || typeof body.order_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.order_id))
      return jsonResponse(400, { error: "order_id_only_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
    const context = await admin.client.rpc("get_merch_cost_reconciliation_context", { p_order_id: body.order_id });
    if (context.error || !context.data) throw Error("merch_order_context_unavailable");
    const attempt = await admin.client.rpc("begin_merch_dispute_observation", { p_order_id: body.order_id });
    if (attempt.error || !attempt.data) throw Error("merch_dispute_context_unavailable");
    const disputes = await observeMerchDisputes(attempt.data as MerchDisputeContext, secret.secret, account);
    const disputeResult = await admin.client.rpc("complete_merch_dispute_observation", {
      p_attempt_id: attempt.data.id, p_facts: disputes,
    });
    if (disputeResult.error || !disputeResult.data) throw Error("merch_dispute_observation_not_recorded");
    const facts = await observeStripeMerchCosts(context.data as MerchCostOrder, secret.secret, account);
    const recorded = await admin.client.rpc("record_merch_provider_cost_observation", { p_order_id: body.order_id, p_facts: facts });
    if (recorded.error || !recorded.data) throw Error("merch_cost_observation_not_recorded");
    return jsonResponse(200, { ...recorded.data as Record<string, unknown>, financialAuthority: false, payoutCreated: false });
  } catch {
    // Never echo provider payload, Authorization or raw SDK errors.
    return jsonResponse(409, { error: "merch_cost_observation_incomplete", retryable: true, financialAuthority: false });
  }
});
