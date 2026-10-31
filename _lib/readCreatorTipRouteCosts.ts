import { Platform } from "react-native";
import { supabase } from "./supabase";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { compareCreatorTipRouteCosts, type TipCostComparison, type TipCostSubject } from "./creatorTipRouteCosts";
import { getRevenueCatProductionReadiness, readRevenueCatNonSubscriptionProducts } from "./revenuecat";
import { isCreatorMoneyStoreQuoteMatch } from "./creatorMoneyStoreQuote";
import type { CreatorSupportedPrice } from "./creatorSupportedPrices";
import { isGooglePlayExternalContentLinkSupported } from "./google-play-external-content-links";
import { isIosExternalCheckoutSupported } from "./iosExternalAdmission";
import { getRuntimeConfig } from "./runtimeConfig";
import { resolvePaymentRailPolicy } from "./paymentRailPolicy";

/** Read-only: never runs native admission, creates an intent, or opens checkout. */
export async function readCreatorTipRouteCosts(creatorId: string, amountMinor: number, supportedNativePrices: readonly CreatorSupportedPrice[]): Promise<TipCostComparison> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const expected: TipCostSubject = { buyerId: authority?.userId ?? "", sessionId: authority?.sessionGeneration ?? "",
    creatorId, amountMinor, currency: "usd", platform: Platform.OS as TipCostSubject["platform"], environment: "test" };
  const unknown = () => compareCreatorTipRouteCosts(null, expected);
  if (!authority || authority.restoreOnly || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 2147483647
    || !["ios", "android", "web"].includes(Platform.OS)) return unknown();
  try {
    const client = supabase as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> };
    const response = await withAuthorityReadDeadline(client.rpc("get_creator_tip_route_costs", {
      p_creator_id: creatorId, p_amount_minor: amountMinor, p_platform: Platform.OS,
    }), null);
    if (!response || response.error || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unknown();
    // Backend eligibility alone does not establish that this binary supports a
    // native product. Do not silently omit an unknown alternative and claim cheapest.
    const snapshot = response.data as { routes?: { provider?: string; purchaseBindingId?: string }[] } | null;
    if (!snapshot || !Array.isArray(snapshot.routes) || snapshot.routes.some(route => !route ||
      (route.provider !== "stripe_connect" && !supportedNativePrices.some(price => price.priceKey === route.purchaseBindingId && price.amountMinor === amountMinor)))) return unknown();
    // Native tip checkout currently requires one unique exact catalog match.
    if (snapshot.routes.filter(route => route.provider !== "stripe_connect").length > 1) return unknown();
    if (snapshot.routes.some(route => route.provider === "stripe_connect")
      && ((Platform.OS === "ios" && !isIosExternalCheckoutSupported())
        || (Platform.OS === "android" && !isGooglePlayExternalContentLinkSupported()))) return unknown();
    const preliminary = compareCreatorTipRouteCosts(snapshot, expected);
    if (preliminary.status === "incomplete" || preliminary.status === "unavailable") return preliminary;
    // Do not claim the native alternative is available merely because its
    // catalog mapping exists. Read the actual device store quote, never purchase.
    const native = snapshot.routes.find(route => route.provider !== "stripe_connect");
    if (native) {
      if (Platform.OS === "ios") {
        const decision = resolvePaymentRailPolicy({ appStorePurchasesEnabled: getRuntimeConfig().revenueCat.appStorePurchasesEnabled,
          environment: "sandbox", liveMoneyEnabled: false, platform: "ios", providerReady: getRevenueCatProductionReadiness().iosPublicKeyConfigured,
          store: "app_store", unlocksDigitalAccess: false, useCase: "creator_tip_support" });
        if (!decision.allowed || decision.provider !== "revenuecat_app_store") return unknown();
      }
      const price = supportedNativePrices.find(candidate => candidate.priceKey === native.purchaseBindingId)!;
      const products = await readRevenueCatNonSubscriptionProducts([price.providerProductId]);
      if (!products.some(product => isCreatorMoneyStoreQuoteMatch(product, { productId: price.providerProductId, amountMinor, currency: "usd" }))) return unknown();
    }
    if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unknown();
    return compareCreatorTipRouteCosts(snapshot, expected);
  } catch { return unknown(); }
}
