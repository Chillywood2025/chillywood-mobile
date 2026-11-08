import Purchases, { PRODUCT_CATEGORY, type PurchasesStoreProduct } from "react-native-purchases";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { configureIsolatedTestStoreNative, ownsIsolatedTestStoreProviderIdentity, readIsolatedTestStoreBuild } from "./isolatedTestStoreBuild";
import { sameTestStoreAllocation, validTestStoreAllocation, type TestStoreAllocation, type TestStoreResult, type TestStoreSdkOutcome } from "./isolatedTestStoreContract";

// The native SDK can post using its current identity after its purchase sheet
// opens. This first-rehearsal adapter never changes that identity, even after a
// promise settles or a server receipt arrives. JS reload cannot adopt the
// existing native instance; the native configure gate rejects it.
let processReservation: string | null = null;
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fail = (): never => { throw new Error("isolated_test_store_sdk_unavailable"); };
export function captureIsolatedTestStoreSdk(authority: AccountSessionAuthorityBinding, allocation: TestStoreAllocation) {
  const expected = Object.freeze({ ...authority }); const saved = copy(allocation);
  const build = readIsolatedTestStoreBuild();
  if (!build || !validTestStoreAllocation(saved) || expected.restoreOnly || expected.userId !== expected.accountId
    || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())
    || saved.configurationDigest !== build.configId || saved.projectId !== build.projectId || saved.appId !== build.appId
    || saved.quote.currency !== "usd" || Date.parse(saved.acceptPurchaseUntil) <= Date.now()) return fail();
  let retired = false; let prepared = false; let invoked = false; let product: PurchasesStoreProduct | null = null;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  const current = () => { if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) fail(); };
  const owns = async () => {
    current();
    if (!await ownsIsolatedTestStoreProviderIdentity(saved.providerAppUserId)) fail();
    current();
    if (await Purchases.getAppUserID() !== saved.providerAppUserId) fail();
    current();
  };
  return Object.freeze({
    // Disposing retires the JS authority only. It never releases native or
    // durable ownership and never logs out or reconfigures the shared SDK.
    dispose() { retired = true; unsubscribe(); },
    async prepare() {
      current();
      if (prepared || processReservation !== null) return fail();
      processReservation = saved.dispatchId;
      const configured = await configureIsolatedTestStoreNative(saved.providerAppUserId);
      current();
      if (configured.configured !== true || configured.configId !== saved.configurationDigest || configured.providerAppUserId !== saved.providerAppUserId) return fail();
      await owns();
      if (await Purchases.isAnonymous()) return fail();
      current();
      const info: unknown = await Purchases.getCustomerInfo(); current();
      // No alias/restore history is adopted by this dispatch-specific customer.
      // These observations constrain opening the SDK; they grant no authority.
      if (!row(info) || info.originalAppUserId !== saved.providerAppUserId || !Array.isArray(info.nonSubscriptionTransactions)
        || info.nonSubscriptionTransactions.length !== 0 || !Array.isArray(info.activeSubscriptions) || info.activeSubscriptions.length !== 0
        || !row(info.entitlements) || !row(info.entitlements.active) || Object.keys(info.entitlements.active).length !== 0) return fail();
      const products = await Purchases.getProducts([saved.productId], PRODUCT_CATEGORY.NON_SUBSCRIPTION); current();
      if (!Array.isArray(products) || products.length !== 1) return fail();
      const candidate = products[0];
      if (candidate.identifier !== saved.productId || candidate.currencyCode !== "USD" || candidate.subscriptionPeriod !== null
        || typeof candidate.price !== "number" || !Number.isFinite(candidate.price) || candidate.price <= 0
        || Math.abs(candidate.price * 100 - saved.quote.amountMinor) > 0.000001) return fail();
      await owns(); product = candidate; prepared = true;
      return Object.freeze({ productId: candidate.identifier, amountMinor: saved.quote.amountMinor, currency: "usd" as const });
    },
    async purchase(claim: TestStoreResult): Promise<{ outcome: TestStoreSdkOutcome; transactionHint: string | null }> {
      current();
      const result = claim.result;
      if (!prepared || invoked || !product || claim.command !== "claim" || claim.actor.userId !== expected.userId
        || claim.actor.sessionId !== expected.sessionGeneration || result.status !== "dispatch_claimed" || result.dispatchAllowed !== true
        || !result.authorityValidUntil || Date.parse(result.authorityValidUntil) <= Date.now()
        || Date.parse(result.authorityValidUntil) > Date.now() + 5_000
        || !result.allocation || !sameTestStoreAllocation(result.allocation, saved)) return fail();
      invoked = true;
      await owns();
      if (Date.parse(result.authorityValidUntil) <= Date.now()) return fail();
      try {
        // No deadline races this promise. Neither failure, cancellation nor a
        // successful SDK callback releases the process or installation lock.
        const response: unknown = await Purchases.purchaseStoreProduct(product);
        current(); await owns();
        if (!row(response) || response.productIdentifier !== saved.productId || !row(response.transaction)
          || response.transaction.productIdentifier !== saved.productId || typeof response.transaction.transactionIdentifier !== "string"
          || !response.transaction.transactionIdentifier.trim() || response.transaction.transactionIdentifier.length > 200) return { outcome: "sdk_unknown", transactionHint: null };
        return { outcome: "sdk_success", transactionHint: response.transaction.transactionIdentifier };
      } catch (error) {
        if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return { outcome: "sdk_unknown", transactionHint: null };
        return { outcome: row(error) && error.userCancelled === true ? "sdk_cancelled" : "sdk_unknown", transactionHint: null };
      }
    },
  });
}
