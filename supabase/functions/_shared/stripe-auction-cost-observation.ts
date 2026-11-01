import { observeStripeRefundTax } from "./stripe-refund-tax-evidence.ts";
// Server-only GET adapter. Transport injection is for synthetic tests, never a
// request parameter. This establishes observed cash costs, NOT payout authority.
type ObjectMap = Record<string, unknown>;
export type AuctionCostContext = {
  id: string; quote_id: string; lane: "event" | "room"; platform_product_id: string; buyer_id: string; stripe_checkout_session_id: string;
  stripe_payment_intent_id: string; stripe_charge_id: string | null;
  amount_total_minor: number; currency: string; environment: string; platform_account_id?: string | null;
};
const object = (v: unknown): ObjectMap => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("auction_provider_object_invalid");
  return v as ObjectMap;
};
const integer = (v: unknown, signed = false): number => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || (!signed && v < 0)) throw Error("auction_provider_amount_unknown");
  return v;
};
const id = (v: unknown, prefix: string): string => {
  if (typeof v !== "string" || !new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(v)) throw Error("auction_provider_identity_invalid");
  return v;
};
const requireMatch = (condition: boolean) => { if (!condition) throw Error("auction_provider_binding_mismatch"); };

export async function observeStripeAuctionCosts(
  order: AuctionCostContext, secret: string, expectedAccount: string, transport: typeof fetch = fetch,
) {
  const live = order.environment === "live";
  requireMatch(["test", "live"].includes(order.environment)
    && new RegExp(`^(sk|rk)_${live ? "live" : "test"}_[A-Za-z0-9_]+$`).test(secret)
    && /^acct_[A-Za-z0-9_]+$/.test(expectedAccount)
    && (!live || order.platform_account_id === expectedAccount));
  const get = async (path: string) => {
    const response = await transport(`https://api.stripe.com/v1${path}`, {
      method: "GET", redirect: "error", headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-10-28.endive" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`auction_provider_read_failed_${response.status}`);
    return object(await response.json()); // no raw provider payload in persistence/logs
  };
  const account = await get("/account");
  requireMatch(account.object === "account" && account.id === expectedAccount);
  const checkout = await get(`/checkout/sessions/${id(order.stripe_checkout_session_id, live ? "cs_live" : "cs_test")}`);
  const metadata = object(checkout.metadata);
  requireMatch(checkout.id === order.stripe_checkout_session_id && checkout.object === "checkout.session"
    && checkout.livemode === live && checkout.mode === "payment" && checkout.status === "complete"
    && checkout.payment_status === "paid" && checkout.client_reference_id === order.quote_id
    && metadata.auction_quote_id === order.quote_id
    && metadata.settlement_contract_id === order.id && metadata.settlement_policy === "auction_platform_net_80_20_v1"
    && metadata.provider_product_id === order.platform_product_id && metadata.buyer_user_id === order.buyer_id
    && metadata.environment === order.environment && metadata.rail === `stripe_${order.lane}_auction`
    && checkout.currency === order.currency && checkout.amount_total === order.amount_total_minor
    && checkout.payment_intent === order.stripe_payment_intent_id);
  const intent = await get(`/payment_intents/${id(order.stripe_payment_intent_id, "pi")}`);
  requireMatch(intent.id === order.stripe_payment_intent_id && intent.object === "payment_intent"
    && intent.livemode === live && intent.status === "succeeded" && intent.currency === order.currency
    && intent.amount === order.amount_total_minor && intent.amount_received === order.amount_total_minor
    && intent.transfer_data === null && intent.application_fee_amount === null && intent.on_behalf_of === null);
  const chargeId = id(intent.latest_charge, "ch");
  requireMatch(!order.stripe_charge_id || order.stripe_charge_id === chargeId);
  const charge = await get(`/charges/${chargeId}`);
  requireMatch(charge.id === chargeId && charge.object === "charge" && charge.livemode === live
    && charge.payment_intent === order.stripe_payment_intent_id && charge.paid === true && charge.captured === true
    && charge.currency === order.currency && charge.amount === order.amount_total_minor
    && charge.amount_captured === order.amount_total_minor && typeof charge.disputed === "boolean");
  const refunded = integer(charge.amount_refunded);
  requireMatch(refunded <= order.amount_total_minor && charge.refunded === (refunded === order.amount_total_minor));
  const balanceId = id(charge.balance_transaction, "txn"); // null means pending, never fee=0
  const balance = await get(`/balance_transactions/${balanceId}`);
  const fee = integer(balance.fee), net = integer(balance.net, true);
  requireMatch(balance.id === balanceId && balance.object === "balance_transaction" && balance.source === chargeId
    && balance.type === "charge" && balance.currency === order.currency && balance.amount === order.amount_total_minor
    && net === order.amount_total_minor - fee && ["available", "pending"].includes(String(balance.status)));
  // A disabled/uncompleted tax calculation is not proof that tax owed is zero.
  const taxState = checkout.automatic_tax ? object(checkout.automatic_tax) : null;
  const details = checkout.total_details ? object(checkout.total_details) : null;
  const tax = taxState && taxState.enabled === true && taxState.status === "complete" && details
    ? integer(details.amount_tax) : null;
  requireMatch(tax === null || tax <= order.amount_total_minor);
  const refunds: { id: string; balance_id: string; amount: number; fee: number; net: number; status: string }[] = [];
  let cursor = "";
  // Explicit pagination, bounded to keep a worker request finite. Incomplete
  // pagination is a retry/error, never a partial monetary observation.
  for (let page = 0; ; page++) {
    if (page >= 20) throw Error("auction_refund_pagination_incomplete");
    const list = await get(`/refunds?charge=${chargeId}&limit=100${cursor ? `&starting_after=${cursor}` : ""}`);
    requireMatch(list.object === "list" && Array.isArray(list.data) && typeof list.has_more === "boolean");
    for (const raw of list.data as unknown[]) {
      const refund = object(raw), refundId = id(refund.id, "re");
      requireMatch(refund.charge === chargeId && refund.payment_intent === order.stripe_payment_intent_id
        && refund.currency === order.currency && !refunds.some(r => r.id === refundId));
      // Pending/failed refunds and reversals need a separate qualified lifecycle;
      // do not silently count them or turn missing balance transactions into 0.
      requireMatch(refund.status === "succeeded");
      const amount = integer(refund.amount), refundBalanceId = id(refund.balance_transaction, "txn");
      const rb = await get(`/balance_transactions/${refundBalanceId}`);
      const refundFee = integer(rb.fee, true), refundNet = integer(rb.net, true);
      requireMatch(rb.id === refundBalanceId && rb.object === "balance_transaction" && rb.source === refundId
        && rb.type === "refund" && rb.currency === order.currency && rb.amount === -amount
        && refundNet === -amount - refundFee && ["available", "pending"].includes(String(rb.status)));
      refunds.push({ id: refundId, balance_id: refundBalanceId, amount, fee: refundFee, net: refundNet, status: String(rb.status) });
    }
    if (!list.has_more) break;
    requireMatch((list.data as unknown[]).length > 0);
    const next = id(object((list.data as unknown[]).at(-1)).id, "re");
    requireMatch(next !== cursor); cursor = next;
  }
  requireMatch(refunds.reduce((sum, r) => sum + r.amount, 0) === refunded);
  refunds.sort((a, b) => a.id.localeCompare(b.id));
  const refundTax = refunded > 0 && refunded < order.amount_total_minor && tax !== null && tax > 0
    ? await observeStripeRefundTax({ paymentIntentId: order.stripe_payment_intent_id, currency: order.currency,
      grossMinor: order.amount_total_minor, taxMinor: tax, refunds, livemode: live }, secret, transport) : null;
  // Re-read prevents refund/dispute changes during the multi-request snapshot.
  const finalCharge = await get(`/charges/${chargeId}`);
  requireMatch(finalCharge.id === chargeId && finalCharge.amount_refunded === refunded
    && finalCharge.disputed === charge.disputed && finalCharge.balance_transaction === balanceId);
  return {
    account_id: expectedAccount, environment: order.environment, contract_id: order.id,
    checkout_id: order.stripe_checkout_session_id, payment_intent_id: order.stripe_payment_intent_id,
    charge_id: chargeId, balance_id: balanceId, currency: order.currency,
    gross_minor: order.amount_total_minor, provider_fee_minor: fee, charge_net_minor: net,
    tax_minor: tax, tax_service_fee_minor: null, tax_service_fee_status: "unverified",
    store_fee_minor: null, refunded_minor: refunded, disputed: charge.disputed,
    refund_net_minor: refunds.reduce((sum, refund) => sum + refund.net, 0),
    balance_status: balance.status, refunds,
    // Partial refunds need actual tax-reversal evidence. Full refunds return the
    // entire collected tax; dispute debits are NOT subtracted again as refunds.
    tax_reversal_minor: refunded === 0 || tax === 0 ? 0 : refunded === order.amount_total_minor ? tax : refundTax?.tax_reversal_minor ?? null,
    refund_tax_evidence: refundTax,
    adjustments_qualified: false, financial_authority: false,
  };
}
