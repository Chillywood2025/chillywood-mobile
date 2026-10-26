#!/usr/bin/env node
// Production purchase functions, synthetic RPC/store boundaries; no charges.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const buyer = "11111111-1111-4111-8111-111111111111";
const creator = "22222222-2222-4222-8222-222222222222";
const offerId = "33333333-3333-4333-8333-333333333333";
const intentId = "44444444-4444-4444-8444-444444444444";
const productId = "cw_test_product";
const realModules = new Set(["creatorMoneyStoreQuote", "creatorMoneyPurchaseAuthority", "creatorMonetization"]);
const compiledModules = new Map();

function runtime(options = {}) {
  let nativeCalls = 0;
  let sessionCurrent = true;
  const amount = options.amount ?? 99;
  const selectedProductId = options.tip ? "cw_creator_tip_sandbox_099" : productId;
  const product = { identifier: selectedProductId, price: amount / 100, currencyCode: "USD", ...options.product };
  const offer = {
    id: offerId, creatorEventId: offerId, creatorId: creator, hostId: creator, partyId: "party-test",
    priceCents: amount, currency: "usd", status: "sandbox",
    provider: "revenuecat_google_play", providerProductId: selectedProductId, providerProductKey: "test_product",
    providerEntitlementId: "channel_member", interval: "monthly", passType: "one_time",
  };
  const access = {
    ...offer, offer, allowed: false, requiresPurchase: true, reason: options.reason ?? "purchase_required",
    resolverStatus: "resolved", offerStatus: "sandbox",
  };
  const cache = new Map();
  const context = vm.createContext({ console, Date, setTimeout: (fn) => { fn(); return 0; }, clearTimeout });
  const sdkPurchase = async () => { nativeCalls += 1; throw { userCancelled: true }; };
  const products = async () => { if (options.switchAccount) sessionCurrent = false; return [product]; };
  const mocks = {
    "react-native": { Platform: { OS: "android" } },
    "./supabase": { supabase: { rpc: async () => ({ data: options.live ? {
      allowed: true, reason: "exact_live_access_pass", viewerOnly: true, seatEligible: false,
      seatApproved: false, accessOfferId: offerId, currency: "usd", grantsPublish: false,
    } : access, error: null }) } },
    "./analytics": { trackEvent() {} },
    "./logger": { reportRuntimeError() {} },
    "./entitlementAuthority": { withAuthorityReadDeadline: async (promise) => promise },
    "./revenuecat": {
      readRevenueCatNonSubscriptionProducts: products,
      readRevenueCatSubscriptionProducts: products,
      readRevenueCatCustomerInfo: async () => null,
      readRevenueCatOfferings: async () => options.package
        ? { all: { test: { availablePackages: [{ identifier: "monthly", product }] } } } : { all: {} },
      purchaseRevenueCatStoreProduct: sdkPurchase, purchaseRevenueCatPackage: sdkPurchase,
    },
    "./accountBoundSupabaseMutation": {}, "./accountSessionAuthority": {},
    "./featureFlags": {}, "./runtimeConfig": {},
    "./revenuecatPurchaseClosure": {
      isRevenueCatExistingPurchase: () => false,
      isRevenueCatUserCancellation: (e) => e.userCancelled === true,
    },
    "./creatorVideos": {}, "./iosAppStoreCommerce": {}, "./paymentRailPolicy": {}, "./liveWatchPartyMoney": {},
  };
  function load(name, realAuthority = false) {
    if (cache.has(name)) return cache.get(name);
    const filename = path.join(process.cwd(), "_lib", `${name}.ts`);
    const compiled = compiledModules.get(filename) ?? ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText;
    compiledModules.set(filename, compiled);
    const module = { exports: {} };
    cache.set(name, module.exports);
    function require(specifier) {
      if (specifier === "./creatorMoneyPurchaseAuthority" && !realAuthority) {
        return {
          ...load("creatorMoneyPurchaseAuthority", true),
          captureCreatorMoneyPurchaseAuthority: () => ({ userId: buyer }),
          isCreatorMoneyPurchaseAuthorityCurrent: () => sessionCurrent,
          prepareCreatorMoneyPurchaseSubject: async () => ({ userId: buyer, authority: { userId: buyer } }),
          revalidateCreatorMoneyPurchaseSubject: async () => sessionCurrent,
          invokeCreatorMoneyPurchaseSubjectRpc: async () => ({ data: {
            id: intentId, userId: buyer, creatorId: creator, sourceType: options.sourceType ?? "paid_content",
            sourceId: options.tip ? creator : offerId, provider: "revenuecat_google_play",
            providerProductId: selectedProductId, environment: "sandbox", status: "pending",
            amountMinor: amount, currency: "usd", alreadyPurchased: false, alreadySubscribed: false,
            partyId: "party-test", passType: options.passType, grantsPublish: false,
            ...options.intent,
          }, error: null }),
        };
      }
      const base = specifier.replace("./", "");
      if (realModules.has(base)) return load(base);
      if (specifier in mocks) return mocks[specifier];
      throw new Error(`Unmocked boundary ${specifier} in ${name}`);
    }
    vm.runInContext(`(function(exports, require, module) { ${compiled}\n})`, context, { filename })(module.exports, require, module);
    return module.exports;
  }
  return { load, calls: () => nativeCalls };
}

const quote = runtime().load("creatorMoneyStoreQuote");
const expected = { productId, amountMinor: 99, currency: "usd" };
assert.equal(quote.isCreatorMoneyStoreQuoteMatch({ identifier: productId, price: 0.99, currencyCode: "USD" }, expected), true);
for (const value of [null, {}, { identifier: productId, price: "0.99", currencyCode: "USD" },
  { identifier: productId, price: NaN, currencyCode: "USD" },
  { identifier: productId, price: Infinity, currencyCode: "USD" },
  { identifier: productId, price: 0.991, currencyCode: "USD" },
  { identifier: productId, price: 0.99, currencyCode: "EUR" },
  { identifier: productId, price: 0.99 }, { identifier: "other", price: 0.99, currencyCode: "USD" }]) {
  assert.equal(quote.isCreatorMoneyStoreQuoteMatch(value, expected), false);
}
assert.equal(quote.isCreatorMoneyStoreQuoteMatch({ identifier: productId, price: 4.99, currencyCode: "USD" }, { ...expected, amountMinor: 499 }), true);
assert.equal(quote.isCreatorMoneyStoreQuoteMatch({ identifier: productId, price: (Number.MAX_SAFE_INTEGER - 2) / 100, currencyCode: "USD" }, { ...expected, amountMinor: Number.MAX_SAFE_INTEGER }), false);

const cases = [
  { module: "creatorPaidVideos", fn: "purchasePaidVideoAccess", sourceType: "paid_content", reason: "purchase_required", args: { videoId: offerId, creatorId: creator, amountCents: 99, currency: "usd" } },
  { module: "paidWatchPartyTickets", fn: "purchasePaidWatchPartyTicket", sourceType: "watch_party_live", reason: "ticket_required", args: { partyId: "party-test", sourceSurface: "test" } },
  { module: "creatorVipPasses", fn: "purchaseCreatorVipPass", sourceType: "vip_pass", reason: "vip_required", amount: 499, args: { creatorId: creator, sourceSurface: "test" } },
  { module: "channelSubscriptions", fn: "purchaseChannelSubscription", sourceType: "channel_subscription", reason: "subscription_required", amount: 499, args: { creatorId: creator, sourceSurface: "test" } },
  { module: "channelSubscriptions", fn: "purchaseChannelSubscription", sourceType: "channel_subscription", reason: "subscription_required", amount: 499, package: true, args: { creatorId: creator, sourceSurface: "test" } },
  { module: "creatorTips", fn: "purchaseCreatorTipWithStore", sourceType: "creator_tip", tip: true, args: { creatorId: creator, userId: buyer, amountCents: 99, currency: "usd" } },
  { module: "paidCreatorEvents", fn: "purchasePaidCreatorEventPass", sourceType: "event", reason: "event_pass_required", args: { creatorEventId: offerId, sourceSurface: "test" } },
];
for (const test of cases) {
  const label = `${test.module}${test.package ? " package" : ""}`;
  for (const product of [{ price: 19.99 }, { currencyCode: "EUR" }, { currencyCode: undefined }, { price: 0.991 }]) {
    const run = runtime({ ...test, product });
    const result = await run.load(test.module)[test.fn](test.args);
    assert.equal(result.ok, false, `${label} mismatch not successful`);
    assert.equal(result.message, quote.CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY, `${label} reaches quote guard`);
    assert.equal(run.calls(), 0, `${label} never purchases on quote mismatch`);
  }
  const allowed = runtime(test);
  await allowed.load(test.module)[test.fn](test.args);
  assert.equal(allowed.calls(), 1, `${label} exact quote reaches native boundary (synthetic cancellation)`);
  const badIntent = runtime({ ...test, intent: { amountMinor: 199 } });
  try { await badIntent.load(test.module)[test.fn](test.args); } catch { /* fail-closed throw is also valid */ }
  assert.equal(badIntent.calls(), 0, `${label} mismatched intent prevents checkout`);
  if (!test.package) {
    const switched = runtime({ ...test, switchAccount: true });
    await switched.load(test.module)[test.fn](test.args);
    assert.equal(switched.calls(), 0, `${label} switched account prevents checkout`);
  }
}
for (const [passType, sourceType] of [["live_watch_party_access_pass", "live_watch_party_access"], ["live_watch_party_seat_pass", "live_watch_party_seat"]]) {
  const input = { partyId: "party-test", offerId, passType, priceCents: 99 };
  for (const product of [{ price: 19.99 }, { currencyCode: "EUR" }, { currencyCode: undefined }]) {
    const run = runtime({ live: true, passType, sourceType, product });
    await assert.rejects(run.load("liveWatchPartyMoney").purchaseLiveWatchPartyOffer(input), { message: quote.CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY });
    assert.equal(run.calls(), 0);
  }
  const allowed = runtime({ live: true, passType, sourceType });
  await assert.rejects(allowed.load("liveWatchPartyMoney").purchaseLiveWatchPartyOffer(input), /canceled/);
  assert.equal(allowed.calls(), 1);
  const switched = runtime({ live: true, passType, sourceType, switchAccount: true });
  await assert.rejects(switched.load("liveWatchPartyMoney").purchaseLiveWatchPartyOffer(input), /Account changed/);
  assert.equal(switched.calls(), 0);
}
console.log("PASS: quote values and nine production purchase branches reject price/currency drift, invalid intents and stale sessions before native checkout");
