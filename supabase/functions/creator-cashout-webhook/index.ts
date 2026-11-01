import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createAdminClient, jsonResponse, readOptionalEnv, verifyStripeWebhookSignature } from "../_shared/stripe-connect.ts";
import { readCashoutBody, runCreatorCashout, type CashoutStore } from "../_shared/creator-cashout-execution.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  const secret = readOptionalEnv("STRIPE_CASHOUT_WEBHOOK_SECRET"), key = readOptionalEnv("STRIPE_CASHOUT_LIVE_KEY");
  const admin = createAdminClient();
  if (!secret || !key || !admin.configured) return jsonResponse(503, { error: "cashout_webhook_not_configured" });
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 65536) return jsonResponse(413, { error: "payload_too_large" });
    const raw = await readCashoutBody(req.body, 65536);
    const signature = await verifyStripeWebhookSignature(raw, req.headers.get("stripe-signature"), secret);
    if (!signature) return jsonResponse(400, { error: "signature_invalid" });
    const event = JSON.parse(raw);
    if (event.object !== "event" || event.livemode !== true || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? "")) return jsonResponse(400, { error: "event_invalid" });
    if (!["payout.created", "payout.updated", "payout.paid", "payout.failed", "payout.canceled", "transfer.created", "transfer.reversed"].includes(event.type))
      return jsonResponse(200, { ignored: true });
    const requestId = event.data?.object?.metadata?.chillywood_cashout_request;
    if (typeof requestId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) return jsonResponse(200, { ignored: true });
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await admin.client.rpc(name, args); if (result.error || !result.data) throw Error("database_unavailable"); return result.data;
    };
    const store: CashoutStore = {
      read: async id => {
        const context = await rpc("get_creator_cashout_execution_context", { p_request_id: id });
        if (event.data.object.metadata.chillywood_cashout_execution !== context.executionId
          || (event.type.startsWith("payout.") ? event.account !== context.accountId : event.account != null)) throw Error("event_account_mismatch");
        return context;
      },
      claim: async () => { throw Error("webhook_cannot_dispatch"); },
      observe: (id, token, facts) => rpc("record_creator_cashout_observation", { p_request_id: id, p_dispatch_token: token, p_facts: facts }),
    };
    // Signed callbacks are wakeups, not unordered status authority. Fetch current
    // exact provider state; the webhook can NEVER create a transfer or payout.
    await runCreatorCashout(requestId, store, key, fetch, Date.now, true);
    return jsonResponse(200, { reconciled: true, providerWrite: false });
  } catch { return jsonResponse(503, { error: "cashout_webhook_reconciliation_pending" }); }
});
