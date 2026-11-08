import { Platform } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { isCreatorMoneyStoreQuoteMatch } from "./creatorMoneyStoreQuote";
import { isIsolatedTestStoreFlavor } from "./isolatedTestStoreBuild";
import { isIsolatedTestStoreV2Flavor } from "./isolatedTestStoreV2Build";
import { isIsolatedTestStoreV3Flavor } from "./isolatedTestStoreV3Build";
import { readRevenueCatNonSubscriptionProducts } from "./revenuecat";
import { validNativeSandboxQuote, type NativeSandboxQuote } from "./nativeStoreSandboxQuote";

/** Read-only use of the existing SDK owner. A matching device product is NOT
 * sandbox-account proof, receipt correlation, or permission to dispatch. */
export async function readNativeSandboxDeviceProduct(authority: AccountSessionAuthorityBinding, quote: NativeSandboxQuote) {
  const expected = Object.freeze({ ...authority });
  const held = () => ({ status: "unavailable" as const, dispatchAllowed: false as const, environmentVerified: false as const });
  if (!validNativeSandboxQuote(quote) || expected.state !== "ACTIVE" || expected.restoreOnly || expected.userId !== expected.accountId
    || quote.creatorId === expected.userId || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())
    || isIsolatedTestStoreFlavor() || isIsolatedTestStoreV2Flavor() || isIsolatedTestStoreV3Flavor()
    || (Platform.OS === "ios" ? quote.catalog.store !== "APP_STORE" : Platform.OS === "android" ? quote.catalog.store !== "PLAY_STORE" : true)) return held();
  const selected = { productId: quote.catalog.wireProductId, amountMinor: quote.amountMinor, currency: quote.currency };
  let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  try {
    const products = await withAuthorityReadDeadline(readRevenueCatNonSubscriptionProducts([selected.productId]), null);
    if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || !Array.isArray(products)
      || products.length !== 1 || !isCreatorMoneyStoreQuoteMatch(products[0], selected)) return held();
    return { status: "matched" as const, dispatchAllowed: false as const, environmentVerified: false as const };
  } catch { return held(); }
  finally { unsubscribe(); }
}
