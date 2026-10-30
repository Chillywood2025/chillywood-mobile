import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const buyer = "11111111-1111-4111-8111-111111111111";
const creator = "22222222-2222-4222-8222-222222222222";
const source = readFileSync("_lib/creatorTips.ts", "utf8");
function load(source, imports) {
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => { assert.ok(name in imports, name); return imports[name]; }, module, module.exports);
  return module.exports;
}
const ios = load(readFileSync("_lib/iosAppStoreCommerce.ts", "utf8"), {});
const quote = load(readFileSync("_lib/creatorMoneyStoreQuote.ts", "utf8"), {});
function runtime(options = {}) {
  const platform = options.platform ?? "android", amount = options.amount ?? 99;
  const productId = platform === "ios" ? ios.resolveIosFiniteAppStoreTier("creator_tip", amount)?.productId : "cw_creator_tip_sandbox_099";
  const price = { platform, environment: "sandbox", currency: "usd", status: "sandbox",
    provider: platform === "ios" ? "revenuecat_app_store" : "revenuecat_google_play",
    productKey: "creator_tip_sandbox_099", providerProductId: productId, amountMinor: amount, ...options.price };
  const calls = { intents: 0, native: 0, claims: 0, reads: 0 };
  const api = load(options.source ?? source, {
    "react-native": { Platform: { OS: platform } }, "./supabase": {},
    "./creatorSupportedPrices": { readCreatorSupportedPrices: async (type, id) => {
      calls.reads++; assert.equal(type, "creator_tip"); assert.equal(id, creator);
      return { status: "resolved", subjectUserId: buyer, prices: [price], ...options.catalog };
    } },
    "./creatorMoneyStoreQuote": quote, "./iosAppStoreCommerce": ios,
    "./creatorMoneyPurchaseAuthority": {
      prepareCreatorMoneyPurchaseSubject: async () => ({ userId: buyer, authority: {} }),
      invokeCreatorMoneyPurchaseSubjectRpc: async () => { calls.intents++; return { data: { id: "intent" } }; },
      validateCreatorMoneyPurchaseIntent: value => value,
      revalidateCreatorMoneyPurchaseSubject: async () => options.current !== false,
      beginCreatorMoneyCheckout: async () => { calls.claims++; return true; },
    },
    "./revenuecat": {
      getRevenueCatProductionReadiness: () => ({ iosPublicKeyConfigured: true }),
      readRevenueCatNonSubscriptionProducts: async () => [{ identifier: productId, price: amount / 100, currencyCode: "USD", ...options.store }],
      purchaseRevenueCatStoreProduct: async () => { calls.native++; return { productIdentifier: productId }; },
    },
    "./runtimeConfig": { getRuntimeConfig: () => ({ revenueCat: { appStorePurchasesEnabled: true } }) },
    "./paymentRailPolicy": { resolvePaymentRailPolicy: () => ({ allowed: true, provider: "revenuecat_app_store" }) },
    "./entitlementAuthority": {}, "./accountBoundSupabaseMutation": {},
    "./accountSessionAuthority": {}, "./creatorTipCheckoutAttempt": {},
    "./creatorTipCustomQuote": {},
  });
  return { api, calls, price, purchase: () => api.purchaseCreatorTipWithStore({ creatorId: creator, userId: buyer, amountCents: amount }) };
}

test("tip purchase re-reads exact buyer/creator catalog before any intent or checkout", async () => {
  for (const options of [
    { catalog: { status: "unavailable" } }, { catalog: { prices: [] } }, { catalog: { subjectUserId: creator } },
    ...[{ providerProductId: "wrong" }, { amountMinor: 100 }, { currency: "eur" }, { productKey: "wrong" },
      { platform: "ios" }, { environment: "production" }, { status: "inactive" }, { provider: "stripe" }].map(price => ({ price })),
  ]) {
    const h = runtime(options); assert.equal((await h.purchase()).ok, false);
    assert.equal(h.calls.reads, 1); assert.equal(h.calls.intents, 0); assert.equal(h.calls.native, 0);
  }
});

test("only mapped Android99 and finite iOS tips reach store; quote/session still fail closed", async () => {
  for (const options of [{}, ...[99, 299, 499, 999].map(amount => ({ platform: "ios", amount }))]) {
    const h = runtime(options); assert.equal((await h.purchase()).ok, true); assert.equal(h.calls.native, 1);
  }
  for (const options of [{ amount: 299 }, { amount: 99.9 }, { platform: "web" },
    { platform: "ios", amount: 300 }, { current: false }, { store: { price: 1.99 } }]) {
    const h = runtime(options); assert.equal((await h.purchase()).ok, false); assert.equal(h.calls.native, 0);
  }
});

test("negative control detects removed catalog binding", async () => {
  const mutant = source.replace('catalog.subjectUserId !== purchaseSubject.userId', 'false');
  assert.notEqual(mutant, source);
  const h = runtime({ source: mutant, catalog: { subjectUserId: creator } });
  assert.equal((await h.purchase()).ok, true); assert.equal(h.calls.native, 1);
});
