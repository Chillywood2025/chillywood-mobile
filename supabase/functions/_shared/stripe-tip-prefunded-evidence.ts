/** Internal evidence normalization, NOT an authorization or a payable balance.
 * Inputs must originate from authenticated provider GETs and canonical SQL reads,
 * never an HTTP request body. The caller must independently establish immutable
 * historical platform binding, source version, freshness and account-writer control.
 * https://docs.stripe.com/api/transfers/object
 * https://docs.stripe.com/api/charges/object (source_transfer)
 * https://docs.stripe.com/api/balance_transactions/object
 */
type Json = Record<string, any>;
export type PrefundedTipSource = {
  tipId: string; buyerId: string; creatorId: string; checkoutRequestId: string;
  buyerSessionId: string; checkoutSessionId: string; paymentIntentId: string;
  platformAccountId: string; connectedAccountId: string;
  environment: "test"; currency: "usd"; amountMinor: number;
  sourceVersionHash: string; canonicalStatus: "paid";
};
/** Scope records the actual Stripe-Account header used by the trusted reader.
 * A platform read has null scope. Do not fill this from the returned object. */
export type ScopedTipProviderRead = { accountId: string | null; value: Json };
export type PrefundedTipReads = {
  platform: ScopedTipProviderRead; checkout: ScopedTipProviderRead;
  paymentIntent: ScopedTipProviderRead; charge: ScopedTipProviderRead;
  transfer: ScopedTipProviderRead; destinationPayment: ScopedTipProviderRead;
  connectedCredit: ScopedTipProviderRead;
};
// Transport/budget errors and an otherwise valid pending credit do not establish
// a source loss. They still cannot furnish the fresh probe required for payout.
export const prefundedTipEvidenceRequiresHold = (error: unknown) => error instanceof Error
  && /^prefunded_tip_(checkout_invalid|payment_intent_invalid|charge_invalid|transfer_invalid|destination_payment_invalid|connected_credit_invalid)$/.test(error.message);
const fail = (reason: string): never => { throw Error(`prefunded_tip_${reason}`); };
const id = (value: unknown, prefix: string) => typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
const uuid = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const minor = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647;
const epoch = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 253402300799;
const metadataMatches = (o: Json, s: PrefundedTipSource) => o.metadata?.chillywood_tip_id === s.tipId
  && o.metadata?.creator_user_id === s.creatorId && o.metadata?.fan_user_id === s.buyerId
  && o.metadata?.rail === "creator_tip";

/** Rejects pending, partially reversed/refunded, disputed or incomplete chains.
 * This first bounded lane only supports the original full card destination credit.
 * Receipt net does not include future payout fees or prove aggregate spendability. */
export function validatePrefundedTipSource(s: PrefundedTipSource, observedAt: number) {
  if (!s || ![s.tipId, s.buyerId, s.creatorId, s.checkoutRequestId, s.buyerSessionId].every(uuid)
    || s.buyerId === s.creatorId || !id(s.platformAccountId, "acct") || !id(s.connectedAccountId, "acct")
    || s.platformAccountId === s.connectedAccountId || !/^cs_test_[A-Za-z0-9]+$/.test(s.checkoutSessionId)
    || !id(s.paymentIntentId, "pi") || s.environment !== "test" || s.currency !== "usd"
    || s.canonicalStatus !== "paid" || !minor(s.amountMinor) || s.amountMinor <= 0
    || !/^[a-f0-9]{64}$/.test(s.sourceVersionHash) || !epoch(observedAt)) fail("source_invalid");
}

export function normalizePrefundedTipEvidence(s: PrefundedTipSource, reads: PrefundedTipReads, observedAt: number) {
  validatePrefundedTipSource(s, observedAt);
  const read = (key: keyof PrefundedTipReads, account: string | null): Json => {
    const r = reads?.[key];
    if (!r || r.accountId !== account || !r.value || typeof r.value !== "object" || Array.isArray(r.value)) fail("read_scope_invalid");
    return r.value;
  };
  const platform = read("platform", null), checkout = read("checkout", null), pi = read("paymentIntent", null);
  const charge = read("charge", null), transfer = read("transfer", null);
  const payment = read("destinationPayment", s.connectedAccountId), credit = read("connectedCredit", s.connectedAccountId);
  if (platform.object !== "account" || platform.id !== s.platformAccountId) fail("platform_invalid");
  if (checkout.object !== "checkout.session" || checkout.id !== s.checkoutSessionId || checkout.livemode !== false
    || checkout.mode !== "payment" || checkout.status !== "complete" || checkout.payment_status !== "paid"
    || checkout.payment_intent !== s.paymentIntentId || checkout.amount_total !== s.amountMinor
    || checkout.currency !== s.currency || !metadataMatches(checkout, s)) fail("checkout_invalid");
  if (pi.object !== "payment_intent" || pi.id !== s.paymentIntentId || pi.livemode !== false
    || pi.status !== "succeeded" || pi.amount !== s.amountMinor || pi.amount_received !== s.amountMinor
    || pi.currency !== s.currency || pi.transfer_data?.destination !== s.connectedAccountId
    || (pi.transfer_data?.amount != null && pi.transfer_data.amount !== s.amountMinor)
    || (pi.application_fee_amount != null && pi.application_fee_amount !== 0)
    || !id(pi.latest_charge, "ch") || !metadataMatches(pi, s)) fail("payment_intent_invalid");
  if (charge.object !== "charge" || charge.id !== pi.latest_charge || charge.payment_intent !== pi.id
    || charge.livemode !== false || charge.status !== "succeeded" || charge.paid !== true || charge.captured !== true
    || charge.amount !== s.amountMinor || charge.amount_captured !== s.amountMinor || charge.currency !== s.currency
    || charge.refunded !== false || charge.amount_refunded !== 0 || charge.disputed !== false
    || charge.application_fee != null || (charge.application_fee_amount != null && charge.application_fee_amount !== 0)
    || charge.transfer_data?.destination !== s.connectedAccountId || !id(charge.transfer, "tr")
    || charge.payment_method_details?.type !== "card") fail("charge_invalid");
  if (transfer.object !== "transfer" || transfer.id !== charge.transfer || transfer.livemode !== false
    || transfer.destination !== s.connectedAccountId || transfer.source_transaction !== charge.id
    || transfer.amount !== s.amountMinor || transfer.currency !== s.currency || transfer.source_type !== "card"
    || transfer.amount_reversed !== 0 || transfer.reversed !== false
    || !(id(transfer.destination_payment, "py") || id(transfer.destination_payment, "ch"))) fail("transfer_invalid");
  if (payment.object !== "charge" || payment.id !== transfer.destination_payment || payment.source_transfer !== transfer.id
    || payment.livemode !== false || payment.status !== "succeeded" || payment.paid !== true || payment.captured !== true
    || payment.amount !== transfer.amount || payment.amount_captured !== transfer.amount || payment.currency !== s.currency
    || payment.refunded !== false || payment.amount_refunded !== 0 || payment.disputed !== false
    || payment.application_fee != null || (payment.application_fee_amount != null && payment.application_fee_amount !== 0)
    || !id(payment.balance_transaction, "txn")) fail("destination_payment_invalid");
  // transfer.balance_transaction is the PLATFORM DEBIT and is deliberately not
  // used as the destination credit. Accept only the connected payment's own BT.
  if (credit.object !== "balance_transaction" || credit.id !== payment.balance_transaction
    || credit.source !== payment.id || credit.currency !== s.currency || credit.amount !== transfer.amount
    || !minor(credit.fee) || !minor(credit.net) || credit.net <= 0 || credit.net !== credit.amount - credit.fee
    || !["available", "pending"].includes(credit.status) || !epoch(credit.available_on)
    || !["payment", "charge"].includes(credit.type) || credit.exchange_rate != null
    || (credit.balance_type != null && credit.balance_type !== "payments")) fail("connected_credit_invalid");
  if (credit.status !== "available" || credit.available_on > observedAt) fail("connected_credit_pending");
  return {
    kind: "prefunded_destination_tip" as const, environment: "test" as const, currency: "usd" as const,
    tipId: s.tipId, buyerId: s.buyerId, creatorId: s.creatorId, checkoutRequestId: s.checkoutRequestId,
    buyerSessionId: s.buyerSessionId, checkoutSessionId: s.checkoutSessionId,
    platformAccountId: s.platformAccountId, connectedAccountId: s.connectedAccountId,
    paymentIntentId: pi.id as string, chargeId: charge.id as string, sourceTransferId: transfer.id as string,
    destinationPaymentId: payment.id as string, connectedCreditTransactionId: credit.id as string,
    creditAmountMinor: credit.amount as number, creditFeeMinor: credit.fee as number, creditNetMinor: credit.net as number,
    availableOn: credit.available_on as number, refundedMinor: 0, reversedMinor: 0, disputed: false,
    sourceVersionHash: s.sourceVersionHash, observedAt,
  };
}
