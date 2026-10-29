export const CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY =
  "The store price could not be matched to this offer. Nothing was charged. Refresh the offer and try again.";

// Product identifiers alone do not bind an offer to the price the store will
// charge. Keep the USD launch contract fail-closed before presenting checkout.
// This validates a quote; only verified provider fulfillment grants access.
export function isCreatorMoneyStoreQuoteMatch(
  product: unknown,
  expected: { productId: string; amountMinor: number; currency: string },
): boolean {
  if (!product || typeof product !== "object" || Array.isArray(product)) return false;
  const quote = product as Record<string, unknown>;
  if (
    expected.currency !== "usd"
    || !expected.productId
    || !Number.isSafeInteger(expected.amountMinor)
    || expected.amountMinor <= 0
    || quote.identifier !== expected.productId
    || typeof quote.currencyCode !== "string"
    || quote.currencyCode.toLowerCase() !== expected.currency
    || typeof quote.price !== "number"
    || !Number.isFinite(quote.price)
    || quote.price <= 0
  ) return false;
  const minor = quote.price * 100;
  // Allow only floating point representation noise, never rounded fractions
  // of a cent or a different price tier.
  return Number.isSafeInteger(Math.round(minor))
    && Math.abs(minor - expected.amountMinor) <= Math.min(0.000001, Number.EPSILON * Math.max(1, minor) * 4);
}
