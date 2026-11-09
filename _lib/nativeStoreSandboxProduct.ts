import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { isCreatorMoneyStoreQuoteMatch } from "./creatorMoneyStoreQuote";
import { isIsolatedTestStoreFlavor } from "./isolatedTestStoreBuild";
import { isIsolatedTestStoreV2Flavor } from "./isolatedTestStoreV2Build";
import { isIsolatedTestStoreV3Flavor } from "./isolatedTestStoreV3Build";
import { canMakeRevenueCatPurchases, getRevenueCatAppUserId, readRevenueCatNonSubscriptionProducts } from "./revenuecat";
import { validNativeSandboxQuote, type NativeSandboxQuote } from "./nativeStoreSandboxQuote";

/** Read-only use of the existing SDK owner. A matching device product is NOT
 * sandbox-account proof, receipt correlation, or permission to dispatch. */
export async function readNativeSandboxDeviceProduct(authority: AccountSessionAuthorityBinding, quote: NativeSandboxQuote) {
  const expected = Object.freeze({ ...authority });
  const held = (reason: "sdk_account_unavailable" | "payments_unavailable" | "product_unavailable" = "product_unavailable") => ({ status: "unavailable" as const, reason, dispatchAllowed: false as const, environmentVerified: false as const });
  if (!validNativeSandboxQuote(quote) || expected.state !== "ACTIVE" || expected.restoreOnly || expected.userId !== expected.accountId
    || quote.creatorId === expected.userId || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())
    || isIsolatedTestStoreFlavor() || isIsolatedTestStoreV2Flavor() || isIsolatedTestStoreV3Flavor()
    || (Platform.OS === "ios" ? quote.catalog.store !== "APP_STORE" : Platform.OS === "android" ? quote.catalog.store !== "PLAY_STORE" : true)) return held();
  const selected = { productId: quote.catalog.wireProductId, amountMinor: quote.amountMinor, currency: quote.currency };
  let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  try {
    // These are existing-owner reads, never login/restore/purchase. Store payment
    // capability and an exact SDK account match still do not prove no-charge mode.
    const readiness = await withAuthorityReadDeadline(Promise.all([getRevenueCatAppUserId(), canMakeRevenueCatPurchases()]), null);
    if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || !readiness || readiness[0] !== expected.userId) return held("sdk_account_unavailable");
    if (readiness[1] !== true) return held("payments_unavailable");
    const products = await withAuthorityReadDeadline(readRevenueCatNonSubscriptionProducts([selected.productId]), null);
    if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || !Array.isArray(products)
      || products.length !== 1 || !isCreatorMoneyStoreQuoteMatch(products[0], selected)) return held();
    const sdkUser = await withAuthorityReadDeadline(getRevenueCatAppUserId(), null);
    if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || sdkUser !== expected.userId) return held("sdk_account_unavailable");
    return { status: "matched" as const, reason: null, dispatchAllowed: false as const, environmentVerified: false as const };
  } catch { return held(); }
  finally { unsubscribe(); }
}

/** Explicit OS app evidence read, never purchase admission. Not run on startup
 * or by catalog availability. Apple may require network/authentication/UI. */
export async function readNativeSandboxAppEvidence(authority: AccountSessionAuthorityBinding) {
  const expected = Object.freeze({ ...authority });
  const unavailable = () => Object.freeze({ status: "unavailable" as const, evidence: null,
    dispatchAllowed: false as const, providerQualified: false as const });
  if (Platform.OS !== "ios" || expected.state !== "ACTIVE" || expected.restoreOnly || expected.userId !== expected.accountId
    || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())
    || isIsolatedTestStoreFlavor() || isIsolatedTestStoreV2Flavor() || isIsolatedTestStoreV3Flavor()) return unavailable();
  let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  try {
    const native = requireOptionalNativeModule<{ readAppTransactionEvidence?: () => Promise<unknown> }>("ChillywoodTestStoreAdmission");
    if (!native?.readAppTransactionEvidence) return unavailable();
    const value = await withAuthorityReadDeadline(native.readAppTransactionEvidence(), null);
    if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot()) || !value || typeof value !== "object" || Array.isArray(value)) return unavailable();
    const v = value as Record<string, unknown>;
    const fields = ["schema", "status", "evidenceScope", "environment", "bundleID", "signedAppVersion", "unsignedNativeVersion", "unsignedNativeBuild", "dispatchAllowed", "providerQualified", "iapQualified", "accountQualified", "exactBuildVerified"];
    const scalar = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 512 && x.trim() === x && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(x);
    if (Object.keys(v).length !== fields.length || !fields.every(k => Object.hasOwn(v, k))
      || v.schema !== "app-transaction-evidence-v1" || v.evidenceScope !== "app_only" || v.status !== "verified"
      || !["SANDBOX", "PRODUCTION", "XCODE"].includes(String(v.environment)) || v.bundleID !== "com.chillywood.mobile"
      || !scalar(v.signedAppVersion) || !(v.unsignedNativeVersion === null || scalar(v.unsignedNativeVersion))
      || !(v.unsignedNativeBuild === null || scalar(v.unsignedNativeBuild))
      || ["dispatchAllowed", "providerQualified", "iapQualified", "accountQualified", "exactBuildVerified"].some(k => v[k] !== false)) return unavailable();
    // Whitelist scalars; never pass through a native error, receipt or identifier.
    return Object.freeze({ status: "observed" as const, evidence: Object.freeze({ environment: v.environment as "SANDBOX" | "PRODUCTION" | "XCODE",
      bundleID: v.bundleID, signedAppVersion: v.signedAppVersion, unsignedNativeVersion: v.unsignedNativeVersion as string | null,
      unsignedNativeBuild: v.unsignedNativeBuild as string | null, evidenceScope: "app_only" as const,
      iapQualified: false as const, accountQualified: false as const, exactBuildVerified: false as const }),
      dispatchAllowed: false as const, providerQualified: false as const });
  } catch { return unavailable(); }
  finally { unsubscribe(); }
}
