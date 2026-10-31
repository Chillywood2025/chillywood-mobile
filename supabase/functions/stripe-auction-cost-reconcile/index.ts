import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv } from "../_shared/stripe-connect.ts";
import { observeStripeAuctionCosts, type AuctionCostContext } from "../_shared/stripe-auction-cost-observation.ts";

// Default JWT verification plus exact existing server authority. GET-only at
// Stripe; recording an observed HELD allocation never dispatches a transfer.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const service = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!service || req.headers.get("Authorization") !== `Bearer ${service}`)
    return jsonResponse(403, { error: "service_authority_required" });
  const account = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID");
  const key = readOptionalEnv("STRIPE_AUCTION_PLATFORM_TEST_KEY");
  if (!account || !key || !/^(rk|sk)_test_[A-Za-z0-9]+$/.test(key))
    return jsonResponse(503, { error: "auction_cost_reconciliation_not_configured", financialAuthority: false });
  try {
    const body = await req.json();
    if (!body || Object.keys(body).some(name => name !== "contract_id")
      || typeof body.contract_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.contract_id))
      return jsonResponse(400, { error: "contract_id_only_required" });
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(503, { error: "server_not_configured" });
    const context = await admin.client.rpc("get_auction_cost_reconciliation_context", { p_contract_id: body.contract_id });
    if (context.error || !context.data || context.data.platform_account_id !== account) throw Error("auction_context_unavailable");
    const facts = await observeStripeAuctionCosts(context.data as AuctionCostContext, key, account);
    const recorded = await admin.client.rpc("record_auction_platform_cost_observation", { p_contract_id: body.contract_id, p_facts: facts });
    if (recorded.error || !recorded.data) throw Error("auction_cost_not_recorded");
    return jsonResponse(200, { ...recorded.data as Record<string, unknown>, financialAuthority: false, transferCreated: false });
  } catch {
    return jsonResponse(409, { error: "auction_cost_observation_incomplete", retryable: true, financialAuthority: false });
  }
});
