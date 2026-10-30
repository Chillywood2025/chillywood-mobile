// This parser is NOT signature verification or purchase authority. Only the
// dedicated webhook may submit its result after verifying the unchanged body.
export type AuctionEvidence = {
  eventId: string; eventType: string; occurredAt: string; accountId: string;
  environment: "test" | "live"; objectId: string; paymentIntentId: string;
  checkoutSessionId: string | null; quoteId: string | null; buyerId: string | null;
  creatorId: string | null; auctionId: string | null; amountMinor: number;
  providerProductId: string | null;
  currency: string; outcome: "paid" | "refunded" | "disputed";
  refundedAmountMinor: number | null;
};
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const identity = (v: unknown, prefix: string): v is string =>
  typeof v === "string" && new RegExp(`^${prefix}_[A-Za-z0-9${prefix === "cs" ? "_" : ""}]{1,240}$`).test(v);
const uuid = (v: unknown): string | null => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : null;
const amount = (v: unknown): v is number => typeof v === "number"
  && Number.isSafeInteger(v) && v > 0 && v <= 2147483647;

export function parseAuctionEvidence(input: unknown): AuctionEvidence | null {
  const e = record(input), o = record(record(e?.data)?.object);
  if (!e || !o || !identity(e.id, "evt") || !identity(e.account, "acct")
    || typeof e.livemode !== "boolean" || o.livemode !== e.livemode
    || typeof e.created !== "number" || !Number.isSafeInteger(e.created) || e.created <= 0
    || e.created > 253402300799 || typeof o.currency !== "string"
    || !/^[a-z]{3}$/.test(o.currency)) return null;
  const m = record(o.metadata);
  const base = {
    eventId: e.id, eventType: String(e.type), occurredAt: new Date(e.created * 1000).toISOString(),
    accountId: e.account, environment: e.livemode ? "live" as const : "test" as const,
    quoteId: uuid(m?.auction_quote_id), buyerId: uuid(m?.buyer_user_id),
    creatorId: uuid(m?.creator_user_id), auctionId: uuid(m?.auction_id), currency: o.currency,
    providerProductId: identity(m?.provider_product_id, "prod") ? m.provider_product_id : null,
  };
  if (e.type === "checkout.session.completed" || e.type === "checkout.session.async_payment_succeeded") {
    if (o.object !== "checkout.session" || !identity(o.id, "cs") || !identity(o.payment_intent, "pi")
      || o.mode !== "payment" || o.status !== "complete" || o.payment_status !== "paid"
      || !amount(o.amount_total) || o.amount_subtotal !== o.amount_total
      || !base.quoteId || !base.buyerId || !base.creatorId || !base.auctionId || !base.providerProductId
      || o.client_reference_id !== base.quoteId || m?.rail !== "stripe_event_auction"
      || m?.environment !== base.environment) return null;
    return { ...base, objectId: o.id, paymentIntentId: o.payment_intent,
      checkoutSessionId: o.id, amountMinor: o.amount_total, outcome: "paid", refundedAmountMinor: null };
  }
  if (e.type === "charge.refunded") {
    if (o.object !== "charge" || !identity(o.id, "ch") || !identity(o.payment_intent, "pi")
      || !amount(o.amount) || !amount(o.amount_refunded) || o.amount_refunded > o.amount
      || o.refunded !== (o.amount_refunded === o.amount)) return null;
    return { ...base, objectId: o.id, paymentIntentId: o.payment_intent,
      checkoutSessionId: null, amountMinor: o.amount, outcome: "refunded", refundedAmountMinor: o.amount_refunded };
  }
  if (e.type === "charge.dispute.created") {
    if (o.object !== "dispute" || !identity(o.id, "dp") || !identity(o.charge, "ch")
      || !identity(o.payment_intent, "pi") || !amount(o.amount)) return null;
    return { ...base, objectId: o.id, paymentIntentId: o.payment_intent,
      checkoutSessionId: null, amountMinor: o.amount, outcome: "disputed", refundedAmountMinor: null };
  }
  return null;
}

export function parseAuctionNoPaymentEvidence(input: unknown) {
  const e = record(input), o = record(record(e?.data)?.object), m = record(o?.metadata);
  if (!e || !o || !identity(e.id, "evt") || !identity(e.account, "acct")
    || typeof e.livemode !== "boolean" || o.livemode !== e.livemode
    || typeof e.created !== "number" || !Number.isSafeInteger(e.created) || e.created <= 0 || e.created > 253402300799
    || o.object !== "checkout.session" || !identity(o.id, "cs") || o.mode !== "payment"
    || o.payment_status !== "unpaid" || !amount(o.amount_total) || o.amount_subtotal !== o.amount_total
    || typeof o.currency !== "string" || !/^[a-z]{3}$/.test(o.currency)
    || (o.payment_intent !== null && !identity(o.payment_intent, "pi"))
    || !uuid(m?.auction_quote_id) || !uuid(m?.buyer_user_id) || !uuid(m?.creator_user_id) || !uuid(m?.auction_id)
    || m?.rail !== "stripe_event_auction" || m?.environment !== (e.livemode ? "live" : "test")
    || o.client_reference_id !== m?.auction_quote_id
    || !((e.type === "checkout.session.expired" && o.status === "expired")
      || (e.type === "checkout.session.async_payment_failed" && o.status === "complete"))) return null;
  return { eventId: e.id, eventType: e.type, occurredAt: new Date(e.created * 1000).toISOString(),
    accountId: e.account, environment: e.livemode ? "live" : "test", checkoutSessionId: o.id,
    paymentIntentId: o.payment_intent, quoteId: m.auction_quote_id, buyerId: m.buyer_user_id,
    creatorId: m.creator_user_id, auctionId: m.auction_id, amountMinor: o.amount_total, currency: o.currency };
}
