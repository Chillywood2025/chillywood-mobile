// Settlement is evidence about an existing payment. It deliberately does not
// consult the switches or eligibility used to admit a new purchase. Adapters
// must additionally bind the stored identity, economics and environment.
export type StripeSettlementOutcome = "succeeded" | "failed" | "pending" | "unsupported";

const positiveMinorAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export const checkoutSettlementOutcome = (
  eventType: string,
  object: Record<string, unknown> | null,
): StripeSettlementOutcome => {
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(eventType)) {
    return "unsupported";
  }
  if (!object || object.object !== "checkout.session" || object.mode !== "payment"
    || object.status !== "complete" || !positiveMinorAmount(object.amount_total)) return "unsupported";
  if (eventType === "checkout.session.async_payment_failed") {
    return object.payment_status === "unpaid" ? "failed" : "unsupported";
  }
  // no_payment_required is not authority to credit a positive-price product.
  if (object.payment_status === "paid") return "succeeded";
  return object.payment_status === "unpaid" ? "pending" : "unsupported";
};

export const paymentIntentSettlementOutcome = (
  eventType: string,
  object: Record<string, unknown> | null,
): StripeSettlementOutcome => {
  if (!["payment_intent.succeeded", "payment_intent.payment_failed"].includes(eventType)) return "unsupported";
  if (!object || object.object !== "payment_intent" || !positiveMinorAmount(object.amount)) return "unsupported";
  if (eventType === "payment_intent.succeeded") {
    return object.status === "succeeded" && object.amount_received === object.amount ? "succeeded" : "unsupported";
  }
  return object.status === "requires_payment_method" && object.amount_received === 0 ? "failed" : "unsupported";
};
