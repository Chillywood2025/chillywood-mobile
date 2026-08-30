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
assert.match(monetizationSource, /if \(!isRevenueCatUserCancellation\(error\)\)/u);
assert.match(monetizationSource, /providerPremiumActive[\s\S]*pollProviderAuthority/u);
assert.match(paidVideoSource, /catch \(error\) \{\s*if \(isRevenueCatUserCancellation\(error\)\)[\s\S]*const verifiedAccess = await waitForPaidVideoAccess/u);

console.log("RevenueCat purchase closure executable proof passed.");
