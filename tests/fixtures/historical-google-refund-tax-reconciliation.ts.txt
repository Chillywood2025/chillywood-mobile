import { observeStripeRefundTax } from "./stripe-refund-tax-evidence.ts";
type Json = Record<string, unknown>;
export type GoogleRefundTaxContext = {
  transaction_id: string; feature: "creator_tip" | "event_auction" | "room_seat_auction";
  quote_id: string; buyer_id: string; creator_id: string; checkout_id: string; payment_intent_id: string;
  gross_minor: number; tax_minor: number; currency: string; recipient_account_id: string | null;
  platform_account_id: string | null;
};
const fail = (): never => { throw Error("google_refund_tax_observation_incomplete"); };
const obj = (v: unknown): Json => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : fail();
const check = (v: boolean) => { if (!v) fail(); };
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : fail();
const id = (v: unknown, prefix: string): string => typeof v === "string" && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(v) ? v : fail();

// The context is resolved from private, verified financial rows. The caller
// cannot send a tax amount, URL, account override, reporting token or transport.
export async function observeGoogleRefundTax(context: GoogleRefundTaxContext, secret: string,
  expectedAccount: string, transport: typeof fetch = fetch) {
  check(/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(secret)); id(expectedAccount, "acct");
  check(context.currency === "usd" && integer(context.gross_minor) > 0
    && integer(context.tax_minor) <= context.gross_minor);
  const get = async (path: string) => {
    const response = await transport(`https://api.stripe.com/v1${path}`, { method: "GET", redirect: "error",
      headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) fail(); return obj(await response.json());
  };
  const account = await get("/account");
  check(account.object === "account" && account.id === expectedAccount
    && (context.platform_account_id === null || context.platform_account_id === expectedAccount));
  const checkout = await get(`/checkout/sessions/${id(context.checkout_id, "cs_test")}`);
  const metadata = obj(checkout.metadata), tax = obj(checkout.automatic_tax), totals = obj(checkout.total_details);
  check(checkout.object === "checkout.session" && checkout.id === context.checkout_id && checkout.livemode === false
    && checkout.mode === "payment" && checkout.status === "complete" && checkout.payment_status === "paid"
    && checkout.client_reference_id === context.quote_id && checkout.payment_intent === context.payment_intent_id
    && checkout.currency === context.currency && checkout.amount_total === context.gross_minor
    && tax.enabled === true && tax.status === "complete" && totals.amount_tax === context.tax_minor
    && totals.amount_discount === 0 && totals.amount_shipping === 0);
  check(context.feature === "creator_tip"
    ? metadata.chillywood_tip_id === context.quote_id && metadata.fan_user_id === context.buyer_id && metadata.creator_user_id === context.creator_id
    : metadata.auction_quote_id === context.quote_id && metadata.buyer_user_id === context.buyer_id);
  const intent = await get(`/payment_intents/${id(context.payment_intent_id, "pi")}`);
  check(intent.object === "payment_intent" && intent.id === context.payment_intent_id && intent.livemode === false
    && intent.status === "succeeded" && intent.currency === context.currency
    && intent.amount === context.gross_minor && intent.amount_received === context.gross_minor);
  if (context.feature === "creator_tip") check(obj(intent.transfer_data).destination === context.recipient_account_id);
  else check(intent.transfer_data === null && intent.application_fee_amount === null && intent.on_behalf_of === null);
  const chargeId = id(intent.latest_charge, "ch"), charge = await get(`/charges/${chargeId}`);
  check(charge.object === "charge" && charge.id === chargeId && charge.livemode === false
    && charge.payment_intent === context.payment_intent_id && charge.currency === context.currency
    && charge.paid === true && charge.captured === true && charge.amount === context.gross_minor
    && charge.amount_captured === context.gross_minor);
  const refunded = integer(charge.amount_refunded);
  check(refunded > 0 && refunded < context.gross_minor);
  const refunds: { id: string; amount: number }[] = [];
  let cursor = "";
  for (let page = 0; ; page++) {
    check(page < 20);
    const list = await get(`/refunds?charge=${chargeId}&limit=100${cursor ? `&starting_after=${cursor}` : ""}`);
    check(list.object === "list" && Array.isArray(list.data) && typeof list.has_more === "boolean");
    for (const raw of list.data as unknown[]) {
      const refund = obj(raw), refundId = id(refund.id, "re");
      check(refund.charge === chargeId && refund.payment_intent === context.payment_intent_id
        && refund.currency === context.currency && refund.status === "succeeded" && !refunds.some(r => r.id === refundId));
      refunds.push({ id: refundId, amount: integer(refund.amount) });
    }
    if (!list.has_more) break;
    check((list.data as unknown[]).length > 0);
    const next = id(obj((list.data as unknown[]).at(-1)).id, "re");check(next !== cursor);cursor = next;
  }
  check(refunds.reduce((sum, r) => sum + r.amount, 0) === refunded);
  const evidence = await observeStripeRefundTax({ paymentIntentId: context.payment_intent_id,
    currency: context.currency, grossMinor: context.gross_minor, taxMinor: context.tax_minor, refunds, livemode: false }, secret, transport);
  if (!evidence) return null;
  const final = await get(`/charges/${chargeId}`);
  check(final.id === chargeId && final.object === "charge" && final.livemode === false
    && final.payment_intent === context.payment_intent_id && final.amount_refunded === refunded
    && final.currency === context.currency && final.amount === context.gross_minor && final.amount_captured === context.gross_minor
    && final.paid === true && final.captured === true && final.disputed === charge.disputed);
  return { account_id: expectedAccount, environment: "test", checkout_id: context.checkout_id,
    payment_intent_id: context.payment_intent_id, charge_id: chargeId, currency: context.currency,
    gross_minor: context.gross_minor, tax_minor: context.tax_minor, refunded_minor: refunded,
    tax_reversal_minor: evidence.tax_reversal_minor, refunds, refund_tax_evidence: evidence };
}
