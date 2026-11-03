import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv, verifyStripeWebhookSignature } from "../_shared/stripe-connect.ts";
import { readCashoutBody, runCreatorCashout, type CashoutStore } from "../_shared/creator-cashout-execution.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const secret = readOptionalEnv("STRIPE_CASHOUT_TEST_WEBHOOK_SECRET"), key = readOptionalEnv("STRIPE_CASHOUT_TEST_KEY");
  const admin = createAdminClient();
  if (!secret || !key || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key) || !admin.configured)
    return jsonResponse(503, { error: "sandbox_webhook_not_configured" });
  try {
    const raw = await readCashoutBody(req.body, 65536);
    if (!await verifyStripeWebhookSignature(raw, req.headers.get("stripe-signature"), secret)) return jsonResponse(400, { error: "signature_invalid" });
    const event = JSON.parse(raw);
    if (event.object !== "event" || event.livemode !== false || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "")) return jsonResponse(400, { error: "test_event_required" });
    if (!["payout.created", "payout.updated", "payout.paid", "payout.failed", "payout.canceled", "transfer.created", "transfer.reversed"].includes(event.type)) return jsonResponse(200, { ignored: true });
    const id = event.data?.object?.metadata?.chillywood_cashout_request;
    if (typeof id !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) return jsonResponse(200, { ignored: true });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await admin.client.rpc(name, args);
      if (result.error || !result.data) throw Error("sandbox_database_unavailable");
      return result.data;
    };
    const store: CashoutStore = {
      read: async requestId => {
        const context = await rpc("get_sandbox_creator_cashout_execution_context", { p_request_id: requestId });
        if (context.environment !== "test" || event.data.object.metadata.chillywood_cashout_execution !== context.executionId
          || (event.type.startsWith("payout.") ? event.account !== context.accountId : event.account != null)) throw Error("sandbox_event_binding_invalid");
        return context;
      },
      claim: async () => { throw Error("webhook_cannot_dispatch"); },
      observe: (requestId, token, facts) => rpc("record_sandbox_creator_cashout_observation", { p_request_id: requestId, p_dispatch_token: token, p_facts: facts }),
    };
    // Remains available after dispatch is disabled: existing ambiguous attempts
    // still need reconciliation. A callback never creates any provider object.
    await runCreatorCashout(id, store, key, fetch, Date.now, true);
    return jsonResponse(200, { reconciled: true, environment: "test", providerWrite: false });
  } catch { return jsonResponse(503, { error: "sandbox_reconciliation_pending" }); }
});
