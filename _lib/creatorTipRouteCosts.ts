/** Read-only contract for an authenticated, exhaustive backend route quote.
 * This does not authorize a checkout, attest a provider rate, or retry a payment.
 * The trusted fee feed is empty until operational evidence is qualified.
 */
export type TipCostSubject = {
  buyerId: string; sessionId: string; creatorId: string; amountMinor: number;
  currency: "usd"; platform: "ios" | "android" | "web"; environment: "test" | "production";
};
export type TipCostComparison = {
  status: "unavailable" | "incomplete" | "single_route" | "compared";
  lowestCostRouteIds: string[];
  totalFeeMinor: number | null;
  expiresAt?: string;
  message: string;
};
const unavailable = (): TipCostComparison => ({ status: "unavailable", lowestCostRouteIds: [], totalFeeMinor: null,
  message: "Provider fee comparison is not available yet. No lowest-cost route has been selected. Your tip amount will not be changed." });
const incomplete = (): TipCostComparison => ({ status: "incomplete", lowestCostRouteIds: [], totalFeeMinor: null,
  message: "Some payment routes, final totals, or fees are not supported and verified. We cannot identify the lowest-cost option yet." });
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const cents = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const fresh = (value: unknown, now: number) => typeof value === "string" && Date.parse(value) > now;

/** The input must come from the authenticated server quote endpoint, not
 * UI/provider-capability booleans. A missing or incomplete candidate set blocks
 * even a recommendation. Recommendation is deliberately separate from dispatch.
 */
export function compareCreatorTipRouteCosts(payload: unknown, expected: TipCostSubject, now = Date.now()): TipCostComparison {
  const row = object(payload);
  if (!row || !Number.isFinite(now) || !cents(expected.amountMinor) || expected.amountMinor === 0
    || ![expected.buyerId, expected.sessionId, expected.creatorId].every(nonempty)
    || expected.buyerId === expected.creatorId || expected.currency !== "usd"
    || !["ios", "android", "web"].includes(expected.platform)
    || !["test", "production"].includes(expected.environment)) return unavailable();
  if (row.version !== 1 || row.available !== true || row.noAccessGranted !== true || row.liveMoneyAction !== false
    || row.benefit !== "creator_tip_no_access" || row.completeCandidateSet !== true
    || row.unresolvedPayment !== false || !fresh(row.expiresAt, now)
    || !Object.entries(expected).every(([key, value]) => row[key] === value)
    || !Array.isArray(row.routes) || row.routes.length === 0) return incomplete();
  const ids = new Set<string>();
  const costs: { id: string; total: number; provider: string }[] = [];
  let buyerTotalMinor: number | null = null;
  let expiresAt = Date.parse(row.expiresAt as string);
  for (const candidate of row.routes) {
    const route = object(candidate);
    if (!route || !nonempty(route.routeId) || ids.has(route.routeId)
      || route.qualification !== "eligible" || !fresh(route.eligibilityExpiresAt, now)
      || !nonempty(route.qualificationEvidenceId)
      || !["app_store", "google_play", "stripe_connect"].includes(String(route.provider))) return incomplete();
    if ((route.provider === "app_store" && expected.platform !== "ios")
      || (route.provider === "google_play" && expected.platform !== "android")) return incomplete();
    // Exact catalog product or external capability is mandatory; never round to a SKU.
    if (!nonempty(route.purchaseBindingId)) return incomplete();
    const prefix = route.provider === "app_store" ? "revenuecat_app_store"
      : route.provider === "google_play" ? "revenuecat_google_play" : "stripe_connect";
    if (route.routeId !== `${prefix}:${route.purchaseBindingId}`) return incomplete();
    ids.add(route.routeId);
    const fee = object(route.fees);
    if (!fee || !nonempty(fee.evidenceId) || fee.authority !== "account_qualified"
      || fee.allUnavoidableFeesIncluded !== true || !fresh(fee.expiresAt, now)
      || !Object.entries(expected).every(([key, value]) => fee[key] === value)
      || fee.routeId !== route.routeId || fee.purchaseBindingId !== route.purchaseBindingId
      || fee.benefit !== row.benefit) return incomplete();
    // Current checkout contract charges the exact entered amount; there is no
    // separately-qualified additional-tax handoff yet, even for equal totals.
    if (!cents(fee.buyerTotalMinor) || fee.buyerTotalMinor !== expected.amountMinor || !cents(fee.taxMinor)
      || !cents(fee.feeBaseMinor) || fee.feeBaseMinor === 0 || fee.feeBaseMinor > fee.buyerTotalMinor
      || !["inclusive", "exclusive", "not_taxed"].includes(String(fee.taxTreatment))) return incomplete();
    if ((fee.taxTreatment === "inclusive" && (fee.buyerTotalMinor !== expected.amountMinor || fee.taxMinor > expected.amountMinor))
      || (fee.taxTreatment === "exclusive" && fee.buyerTotalMinor !== expected.amountMinor + fee.taxMinor)
      || (fee.taxTreatment === "not_taxed" && (fee.taxMinor !== 0 || fee.buyerTotalMinor !== expected.amountMinor))) return incomplete();
    if (buyerTotalMinor !== null && buyerTotalMinor !== fee.buyerTotalMinor) return incomplete();
    buyerTotalMinor = fee.buyerTotalMinor;
    // Tax is explicit, not an assumed zero or hidden inside the other-fee bucket.
    const components = [fee.processorMinor, fee.storeMinor, fee.platformMinor, fee.otherMinor, fee.taxMinor];
    if (!components.every(cents) || fee.platformMinor !== 0) return incomplete();
    const total = (components as number[]).reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(total) || fee.totalMinor !== total) return incomplete();
    expiresAt = Math.min(expiresAt, Date.parse(route.eligibilityExpiresAt as string), Date.parse(fee.expiresAt as string));
    costs.push({ id: route.routeId, total, provider: String(route.provider) });
  }
  if (costs.length < 2) return { status: "single_route", lowestCostRouteIds: [], totalFeeMinor: null,
    message: "Only one qualified exact-amount route is available. No lower-cost alternative has been established." };
  const total = Math.min(...costs.map(route => route.total));
  const lowest = costs.filter(route => route.total === total);
  const names: Record<string, string> = { app_store: "Apple", google_play: "Google Play", stripe_connect: "Stripe" };
  return { status: "compared", lowestCostRouteIds: lowest.map(route => route.id), expiresAt: new Date(expiresAt).toISOString(),
    totalFeeMinor: total, message: `Lowest verified fees and tax: ${[...new Set(lowest.map(route => names[route.provider]))].join(" / ")}, $${(total / 100).toFixed(2)} USD. Same buyer total: $${((buyerTotalMinor ?? 0) / 100).toFixed(2)} USD. This does not start or retry a payment.` };
}
