// Extract only signed Stripe facts. Calling this does not verify a signature;
// only webhook handlers that already verified the raw body may persist it.
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object"
  && !Array.isArray(v) ? v as Record<string, unknown> : null;
const minor = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function googlePlayStripeTaxEvidence(input: unknown) {
  const o = record(input), totals = record(o?.total_details), automatic = record(o?.automatic_tax);
  const address = record(record(o?.customer_details)?.address);
  if (o?.object !== "checkout.session" || o.payment_status !== "paid" || o.status !== "complete"
    || o.currency !== "usd" || automatic?.enabled !== true || automatic.status !== "complete"
    || address?.country !== "US" || !minor(o.amount_total) || !minor(totals?.amount_tax)
    || totals.amount_tax > o.amount_total || totals.amount_discount !== 0 || totals.amount_shipping !== 0) return null;
  return { provenance: "stripe_checkout_automatic_tax_complete", countryCode: "US",
    preTaxAmountMinor: o.amount_total - totals.amount_tax, taxAmountMinor: totals.amount_tax };
}
