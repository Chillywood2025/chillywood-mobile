import { readCashoutBody } from "./creator-cashout-execution.ts";
import { normalizePrefundedTipEvidence, validatePrefundedTipSource,
  type PrefundedTipSource, type ScopedTipProviderRead } from "./stripe-tip-prefunded-evidence.ts";

/** Server-only fixed-host GET collector. No endpoint accepts provider facts.
 * Caller obtains this context from canonical SQL and independently verified
 * historical platform binding, not client metadata or today's account mapping.
 * This read is evidence, not SQL reservation/qualification/dispatch authority.
 * No credentials or full provider payloads are returned or persisted. */
export async function readPrefundedTipEvidence(source: PrefundedTipSource, secret: string,
  transport: typeof fetch = fetch, now: () => number = Date.now) {
  validatePrefundedTipSource(source, Math.floor(now() / 1000));
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(secret)) throw Error("prefunded_tip_credential_mode_mismatch");
  const deadline = now() + 60000; let calls = 0;
  const get = async (path: string, accountId: string | null): Promise<ScopedTipProviderRead> => {
    if (++calls > 7 || now() >= deadline) throw Error("prefunded_tip_provider_budget_exhausted");
    const response = await transport(`https://api.stripe.com${path}`, {
      method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive",
        ...(accountId ? { "Stripe-Account": accountId } : {}) },
      signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline - now()))),
    });
    if (!response.ok) throw Error("prefunded_tip_provider_read_unresolved");
    if (now() >= deadline) throw Error("prefunded_tip_provider_budget_exhausted");
    const raw = await readCashoutBody(response.body, 500000, Math.max(1, Math.min(10000, deadline - now())));
    if (now() >= deadline) throw Error("prefunded_tip_provider_budget_exhausted");
    return { accountId, value: JSON.parse(raw) };
  };
  const linkedId = (value: unknown, prefix: string) => {
    if (typeof value !== "string" || !new RegExp(`^(?:${prefix})_[A-Za-z0-9]+$`).test(value))
      throw Error("prefunded_tip_provider_link_invalid");
    return value;
  };
  const platform = await get("/v1/account", null);
  if (platform.value?.object !== "account" || platform.value.id !== source.platformAccountId)
    throw Error("prefunded_tip_platform_invalid");
  const checkout = await get(`/v1/checkout/sessions/${source.checkoutSessionId}`, null);
  const paymentIntent = await get(`/v1/payment_intents/${source.paymentIntentId}`, null);
  const charge = await get(`/v1/charges/${linkedId(paymentIntent.value?.latest_charge, "ch")}`, null);
  const transfer = await get(`/v1/transfers/${linkedId(charge.value?.transfer, "tr")}`, null);
  const destinationPayment = await get(`/v1/charges/${linkedId(transfer.value?.destination_payment, "py|ch")}`, source.connectedAccountId);
  const connectedCredit = await get(`/v1/balance_transactions/${linkedId(destinationPayment.value?.balance_transaction, "txn")}`, source.connectedAccountId);
  return normalizePrefundedTipEvidence(source, { platform, checkout, paymentIntent, charge, transfer, destinationPayment, connectedCredit }, Math.floor(now() / 1000));
}
