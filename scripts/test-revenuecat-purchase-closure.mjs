import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourcePath = path.join(process.cwd(), "_lib/revenuecatPurchaseClosure.ts");
const transpiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: true },
  fileName: sourcePath,
}).outputText;
const closure = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
const monetizationSource = readFileSync(path.join(process.cwd(), "_lib/monetization.ts"), "utf8");
const paidVideoSource = readFileSync(path.join(process.cwd(), "_lib/creatorPaidVideos.ts"), "utf8");
const channelSubscriptionSource = readFileSync(path.join(process.cwd(), "_lib/channelSubscriptions.ts"), "utf8");
const liveStageMoneySource = readFileSync(path.join(process.cwd(), "_lib/liveWatchPartyMoney.ts"), "utf8");
const subscribeSource = readFileSync(path.join(process.cwd(), "app/subscribe.tsx"), "utf8");
const partyWaitingRoomSource = readFileSync(path.join(process.cwd(), "app/watch-party/index.tsx"), "utf8");
const partyRoomSource = readFileSync(path.join(process.cwd(), "app/watch-party/[partyId].tsx"), "utf8");
const playerSource = readFileSync(path.join(process.cwd(), "app/player/[id].tsx"), "utf8");
const partyMigrationSource = readFileSync(path.join(
  process.cwd(),
  "supabase/migrations/20260906184500_party_room_free_default_sandbox_checkout_closure.sql",
), "utf8");

const customerInfo = { originalAppUserId: "user-proof", entitlements: {}, activeSubscriptions: [] };
const isCustomerInfo = (value) => value === customerInfo;
const valid = (overrides = {}) => ({
  productIdentifier: "premium_subscription",
  customerInfo,
  transaction: {
    productIdentifier: "premium_subscription",
    transactionIdentifier: null,
    purchaseDate: "2026-08-30T22:22:53.823Z",
    purchaseToken: "google-play-token-proof",
    ...overrides,
  },
});
const options = { expectedProductIdentifier: "premium_subscription", isCustomerInfo };

assert.equal(closure.isRevenueCatPurchaseResultForProduct(valid(), options), true,
  "Google Play success may use a purchase token before an order id exists");
assert.equal(closure.isRevenueCatPurchaseResultForProduct(valid({
  transactionIdentifier: "apple-transaction-proof", purchaseToken: null,
}), options), true, "App Store success may use a transaction id without a purchase token");
assert.equal(closure.isRevenueCatPurchaseResultForProduct(valid({
  transactionIdentifier: null, purchaseToken: null,
}), options), false, "a purchase must retain at least one provider transaction correlation signal");
assert.equal(closure.isRevenueCatPurchaseResultForProduct(valid({
  productIdentifier: "different_product",
}), options), false, "the transaction product cannot differ from the selected product");
assert.equal(closure.isRevenueCatPurchaseResultForProduct(valid({ purchaseDate: "not-a-date" }), options), false);
assert.equal(closure.isRevenueCatPurchaseResultForProduct({ ...valid(), productIdentifier: "different_product" }, options), false);

assert.equal(closure.isRevenueCatUserCancellation({ userCancelled: true }), true);
assert.equal(closure.isRevenueCatUserCancellation({ codeName: "PURCHASE_CANCELLED_ERROR" }), true);
assert.equal(closure.isRevenueCatUserCancellation(new Error("provider unavailable")), false);
assert.equal(closure.isRevenueCatExistingPurchase({ code: "6" }), true);
assert.equal(closure.isRevenueCatExistingPurchase({ readableErrorCode: "PRODUCT_ALREADY_PURCHASED_ERROR" }), true);
assert.equal(closure.isRevenueCatExistingPurchase({ userInfo: { readableErrorCode: "PRODUCT_ALREADY_PURCHASED_ERROR" } }), true);
assert.equal(closure.isRevenueCatExistingPurchase({ message: "You are already subscribed to this product." }), true);
assert.equal(closure.isRevenueCatExistingPurchase({ code: "7", message: "Receipt already in use." }), false,
  "a receipt collision cannot be treated as current-account ownership");
assert.equal(closure.isRevenueCatExistingPurchase({ code: "13", message: "Receipt in use by other subscriber." }), false,
  "another subscriber's receipt must never be restored as success");
assert.equal(closure.isRevenueCatExistingPurchase({ code: "1", message: "Purchase cancelled." }), false);

const creatorCheckout = (override = {}) => closure.isCreatorDigitalCheckoutShellAvailable({
  betaEnvironment: "closed-beta",
  liveMoneyEnabled: false,
  paidContentCheckoutEnabled: false,
  payoutsEnabled: false,
  cashoutEnabled: false,
  platform: "android",
  providerConfigured: true,
  appStorePurchasesEnabled: false,
  ...override,
});
assert.equal(creatorCheckout(), true,
  "closed-beta provider sandbox checkout remains available while production money is off");
assert.equal(creatorCheckout({ platform: "ios", appStorePurchasesEnabled: true }), true,
  "approved iOS closed-beta sandbox checkout is available");
assert.equal(creatorCheckout({ platform: "ios", appStorePurchasesEnabled: false }), false);
assert.equal(creatorCheckout({ betaEnvironment: "public-v1" }), false);
assert.equal(creatorCheckout({ payoutsEnabled: true }), false);
assert.equal(creatorCheckout({ cashoutEnabled: true }), false);
assert.equal(creatorCheckout({ providerConfigured: false }), false);
assert.equal(creatorCheckout({ platform: "web" }), false);
assert.equal(creatorCheckout({
  betaEnvironment: "public-v1",
  liveMoneyEnabled: true,
  paidContentCheckoutEnabled: true,
}), true, "an approved production shell keeps its existing two-switch requirement");

let restoreCalls = 0;
let authorityPolls = 0;
const restoredCustomerInfo = { entitlements: { active: { premium: {} } } };
const verifiedAuthority = { premium: true, source: "server" };
const convergedExistingPurchase = await closure.reconcileRevenueCatExistingPurchase({
  restore: async () => { restoreCalls += 1; return restoredCustomerInfo; },
  authorityCurrent: async () => true,
  waitForAuthority: async () => { authorityPolls += 1; return verifiedAuthority; },
});
assert.deepEqual(convergedExistingPurchase, {
  status: "verified",
  customerInfo: restoredCustomerInfo,
  authority: verifiedAuthority,
}, "provider restore is not success until exact backend authority converges");
assert.equal(restoreCalls, 1);
assert.equal(authorityPolls, 1);

const providerOnlyExistingPurchase = await closure.reconcileRevenueCatExistingPurchase({
  restore: async () => restoredCustomerInfo,
  authorityCurrent: async () => true,
  waitForAuthority: async () => null,
});
assert.equal(providerOnlyExistingPurchase.status, "provider_restored",
  "provider state alone remains a bounded, non-entitled recovery state");

let staleRestoreCalls = 0;
const staleBeforeRestore = await closure.reconcileRevenueCatExistingPurchase({
  restore: async () => { staleRestoreCalls += 1; return restoredCustomerInfo; },
  authorityCurrent: async () => false,
  waitForAuthority: async () => verifiedAuthority,
});
assert.equal(staleBeforeRestore.status, "authority_changed");
assert.equal(staleRestoreCalls, 0, "account changes prevent restore from starting");

let authorityChecks = 0;
const staleAfterRestore = await closure.reconcileRevenueCatExistingPurchase({
  restore: async () => restoredCustomerInfo,
  authorityCurrent: async () => ++authorityChecks < 2,
  waitForAuthority: async () => verifiedAuthority,
});
assert.equal(staleAfterRestore.status, "authority_changed",
  "a post-restore account change cannot leak the provider result");

const failedRestore = await closure.reconcileRevenueCatExistingPurchase({
  restore: async () => { throw new Error("provider unavailable"); },
  authorityCurrent: async () => true,
  waitForAuthority: async () => verifiedAuthority,
});
assert.equal(failedRestore.status, "restore_failed");

let reads = 0;
let waits = 0;
const accepted = await closure.pollProviderAuthority({
  attempts: 5,
  delayMs: 1,
  authorityCurrent: async () => true,
  read: async () => ({ active: ++reads >= 3 }),
  accepts: (value) => value.active,
  wait: async () => { waits += 1; },
});
assert.deepEqual(accepted, { active: true });
assert.equal(reads, 3);
assert.equal(waits, 2);

let currentChecks = 0;
let staleReads = 0;
const stale = await closure.pollProviderAuthority({
  attempts: 3,
  delayMs: 0,
  authorityCurrent: async () => ++currentChecks < 2,
  read: async () => { staleReads += 1; return { active: true }; },
  accepts: (value) => value.active,
  wait: async () => {},
});
assert.equal(stale, null);
assert.equal(staleReads, 1);

assert.match(monetizationSource, /const waitForPremiumAuthority = \(\) => pollProviderAuthority/u);
assert.match(monetizationSource, /if \(isRevenueCatExistingPurchase\(error\)\)[\s\S]*restoreRevenueCatPurchases[\s\S]*waitForPremiumAuthority/u,
  "already-subscribed Premium runs exact-identity restore then waits for backend authority");
assert.match(monetizationSource, /if \(!isRevenueCatUserCancellation\(error\)\)/u);
assert.match(monetizationSource, /providerPremiumActive[\s\S]*pollProviderAuthority/u);
assert.match(monetizationSource, /!refreshedSnapshot\.targets\.premium_subscription\.hasEntitlement[\s\S]*store did not verify an active Premium subscription/u,
  "a restore with no exact active Premium authority cannot report a misleading success");
assert.match(paidVideoSource, /catch \(error\) \{\s*if \(isRevenueCatUserCancellation\(error\)\)[\s\S]*const verifiedAccess = await waitForPaidVideoAccess/u);
assert.match(channelSubscriptionSource, /isRevenueCatExistingPurchase\(error\)[\s\S]*restoreRevenueCatPurchases[\s\S]*waitForChannelSubscriptionAccess/u,
  "Platform Subscription recovers an already-owned store subscription through exact app authority");
assert.match(channelSubscriptionSource, /export async function restoreChannelSubscription[\s\S]*restoreRevenueCatPurchases[\s\S]*waitForChannelSubscriptionAccess/u,
  "Platform Subscription exposes an explicit exact-target restore path");
assert.match(liveStageMoneySource, /catch \(error\) \{[\s\S]*isRevenueCatUserCancellation\(error\)[\s\S]*waitForExactPass\(\)[\s\S]*isLiveWatchPartyPassConfirmed/u,
  "Live Stage polls exact backend pass authority when provider completion and client return race");
assert.match(liveStageMoneySource, /revalidateCreatorMoneyPurchaseSubject\(subject\)[\s\S]*readLiveWatchPartyMoneyAccess\(input\.partyId\)[\s\S]*isLiveWatchPartyPassConfirmed\(access, input\.passType, input\.offerId\)/u,
  "Live Stage convergence stays bound to the current account, exact target, product, and offer");
assert.match(subscribeSource, /setNotice\(result\.message\)/u,
  "Premium preserves actionable reconciliation outcomes instead of replacing them with generic copy");
assert.match(subscribeSource, /Existing subscription found\. Restoring it to this account/u);
assert.match(subscribeSource, /Verifying Premium access/u);
for (const [label, source] of [
  ["Party Waiting Room", partyWaitingRoomSource],
  ["Party Room", partyRoomSource],
  ["Paid Video", playerSource],
]) {
  assert.match(source, /isCreatorDigitalCheckoutShellAvailable\(\)/u, `${label} uses sandbox-aware checkout-shell authority`);
  assert.doesNotMatch(source, /runtime\.liveMoneyEnabled\s*&&\s*runtime\.paidContentCheckoutEnabled/u,
    `${label} does not confuse production activation with sandbox checkout authority`);
}
assert.doesNotMatch(partyRoomSource, /:\s*"\$0\.99";/u,
  "an unavailable or free room cannot invent a paid price");
assert.doesNotMatch(partyWaitingRoomSource, /priceCents\s*\?\?\s*99|currency\s*\?\?\s*"usd"/u,
  "the Party Waiting Room never invents price or currency when exact offer details are absent");
assert.match(partyMigrationSource, /offer\."status" in \('sandbox','active','paused','sold_out','blocked'\)[\s\S]*'reason','free_room'/u,
  "only an exact current room offer changes the free-room default");
assert.match(partyMigrationSource, /resolve_paid_watch_party_ticket_access_pre_free_default/u,
  "all paid and historical cases remain delegated to hardened authority");

console.log("RevenueCat purchase closure executable proof passed.");
