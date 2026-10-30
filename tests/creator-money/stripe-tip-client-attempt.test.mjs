import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
const buyer = "11111111-1111-4111-8111-111111111111", creator = "22222222-2222-4222-8222-222222222222", tipId = "33333333-3333-4333-8333-333333333333";
const input = { buyerId: buyer, creatorId: creator, amountCents: 300, currency: "usd" };
const compiled = ts.transpileModule(fs.readFileSync("_lib/creatorTipCheckoutAttempt.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function storage() {
  const rows = new Map(); return { rows, getItem: async key => rows.get(key) ?? null, setItem: async (key, value) => { rows.set(key, value); }, removeItem: async key => { rows.delete(key); } };
}
function load(store) {
  const module = { exports: {} }; new Function("exports", "module", "require", compiled)(module.exports, module, name => {
    if (name === "@react-native-async-storage/async-storage") return { default: store };
    if (name === "react-native-get-random-values") return {};
    throw new Error(name);
  }); return module.exports;
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("unknown Stripe attempt persists before transport and survives module remount with same quote and UUID", async () => {
  const store = storage(), api = load(store); let original;
  await assert.rejects(api.withCreatorTipCheckoutAttempt(input, async attempt => {
    original = attempt; assert.equal(store.rows.size, 1); throw new Error("transport lost");
  }), /transport lost/);
  const remounted = load(store);
  await remounted.withCreatorTipCheckoutAttempt(input, async attempt => { assert.equal(attempt.requestId, original.requestId); assert.equal(attempt.amountCents, 300); });
  let calls = 0;
  await assert.rejects(remounted.withCreatorTipCheckoutAttempt({ ...input, amountCents: 500 }, async () => { calls += 1; }), /unresolved/);
  assert.equal(calls, 0);
});

test("concurrent client invocations serialize and never create competing request IDs", async () => {
  const api = load(storage()), d = deferred(), attempts = [];
  const first = api.withCreatorTipCheckoutAttempt(input, async attempt => { attempts.push(attempt); await d.promise; });
  const second = api.withCreatorTipCheckoutAttempt(input, async attempt => { attempts.push(attempt); });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(attempts.length, 1);
  d.resolve(); await Promise.all([first, second]); assert.equal(attempts[0].requestId, attempts[1].requestId);
});

test("only an independently confirmed matching terminal receipt retires an attempt", async () => {
  const store = storage(), api = load(store); let original;
  await api.withCreatorTipCheckoutAttempt(input, async attempt => { original = attempt; await api.rememberCreatorTipCheckoutReceipt(attempt, tipId); });
  for (const status of ["pending", "checkout_started", "failed", "disputed", "unknown"]) {
    await api.retireConfirmedCreatorTipCheckoutAttempt({ buyerId: buyer, creatorId: creator, tipId, status }); assert.equal(store.rows.size, 1);
  }
  await api.retireConfirmedCreatorTipCheckoutAttempt({ buyerId: buyer, creatorId: creator, tipId: buyer, status: "paid" }); assert.equal(store.rows.size, 1);
  await api.retireConfirmedCreatorTipCheckoutAttempt({ buyerId: buyer, creatorId: creator, tipId, status: "paid" }); assert.equal(store.rows.size, 0);
  await api.withCreatorTipCheckoutAttempt(input, async next => { assert.notEqual(next.requestId, original.requestId); });
});

test("storage loss/corruption, wrong owner and invalid minor units fail before checkout", async () => {
  let calls = 0; const store = storage(), api = load(store);
  store.setItem = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(api.withCreatorTipCheckoutAttempt(input, async () => { calls += 1; }), /storage unavailable/); assert.equal(calls, 0);
  const malformed = storage(); malformed.rows.set(`@chillywood/stripe-tip-attempt:v1:${buyer}:${creator}`, "");
  await assert.rejects(load(malformed).withCreatorTipCheckoutAttempt(input, async () => { calls += 1; }));
  for (const changes of [{ amountCents: 300.5 }, { buyerId: creator }, { currency: "eur" }]) {
    await assert.rejects(api.withCreatorTipCheckoutAttempt({ ...input, ...changes }, async () => { calls += 1; }));
  }
  assert.equal(calls, 0);
});

const compiledTips = ts.transpileModule(fs.readFileSync("_lib/creatorTips.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const checkoutInput = { creatorId: creator, amountCents: 300, currency: "usd", returnUrl: "chillywood://tip-status", cancelUrl: "chillywood://tip-status" };
function tipClient(store, options = {}) {
  let authority = { userId: buyer, sessionGeneration: "one", restoreOnly: false };
  const calls = []; let reply = options.reply;
  const successful = body => ({ requestId: body.request_id, buyerId: buyer, creatorId: creator, amountCents: 300, currency: "usd", tipId,
    status: "checkout_created", provider: "stripe", providerKey: "stripe_connect", mode: "test", checkoutCreated: true,
    liveMoneyAction: false, noAccessGranted: true, pureContributionOnly: true, url: "https://checkout.stripe.com/c/pay/cs_test_synthetic" });
  const mocks = {
    "./creatorSupportedPrices": { readCreatorSupportedPrices: async () => { throw new Error("Stripe tips must not call the store catalog"); } },
    "react-native": { Platform: { OS: options.platform ?? "android" } }, "./creatorMoneyStoreQuote": {}, "./creatorMoneyPurchaseAuthority": {},
    "./revenuecat": {}, "./iosAppStoreCommerce": {}, "./paymentRailPolicy": {}, "./runtimeConfig": {}, "./entitlementAuthority": {},
    "./creatorTipCheckoutAttempt": load(store),
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => a?.userId === b?.userId && a?.sessionGeneration === b?.sessionGeneration },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => ({ authority, accessToken: "frozen-token" }),
      invokeAccountBoundSupabaseMutationRpc: async () => ({ data: { id: tipId, creatorId: creator, senderId: options.wrongSender ? creator : buyer,
        status: options.status ?? "paid", amountCents: 300, currency: "usd", accessGranted: false, pureContributionOnly: true }, error: null }) },
    "./supabase": { supabase: { functions: { invoke: async (name, input) => {
      calls.push({ name, input }); if (options.switchAccount) authority = { ...authority, sessionGeneration: "two" };
      return reply ? reply(input.body, successful(input.body)) : { data: successful(input.body), error: null };
    } } } },
  };
  const module = { exports: {} }; new Function("exports", "module", "require", compiledTips)(module.exports, module, name => {
    assert.ok(name in mocks, `Unexpected import ${name}`); return mocks[name];
  });
  return { api: module.exports, calls, reply: next => { reply = next; } };
}

test("production Stripe helper freezes account and reuses persisted request after unknown transport and remount", async () => {
  const store = storage(), first = tipClient(store, { reply: () => ({ data: null, error: new Error("network") }) });
  await assert.rejects(first.api.createCreatorTipCheckout(checkoutInput), /unknown/);
  const originalId = first.calls[0].input.body.request_id;
  const remounted = tipClient(store); const result = await remounted.api.createCreatorTipCheckout(checkoutInput);
  assert.equal(remounted.calls[0].input.body.request_id, originalId); assert.equal(remounted.calls[0].input.headers.Authorization, "Bearer frozen-token");
  assert.equal(result.tipId, tipId); assert.equal(result.noAccessGranted, true);
  await remounted.api.readMyTipTransactionStatus(tipId); assert.equal(store.rows.size, 0);
});

test("production Stripe helper rejects wrong quote, account, request, unsafe URL and changed session without a new attempt", async () => {
  for (const changes of [{ requestId: creator }, { buyerId: creator }, { creatorId: buyer }, { amountCents: 99 }, { currency: "eur" },
    { url: "https://foreign.test/pay/a" }, { mode: "live" }, { noAccessGranted: false }, { status: "paid" }, { status: "" }]) {
    const store = storage(), h = tipClient(store, { reply: (_body, response) => ({ data: { ...response, ...changes }, error: null }) });
    await assert.rejects(h.api.createCreatorTipCheckout(checkoutInput)); assert.equal(h.calls.length, 1); assert.equal(store.rows.size, 1);
  }
  const switched = tipClient(storage(), { switchAccount: true }); await assert.rejects(switched.api.createCreatorTipCheckout(checkoutInput), /unknown/);
  const denied = tipClient(storage(), { platform: "ios" }); assert.equal((await denied.api.createCreatorTipCheckout(checkoutInput)).checkoutCreated, false); assert.equal(denied.calls.length, 0);
});

test("a creator or other buyer receipt cannot retire this buyer's unresolved Stripe attempt", async () => {
  const store = storage(), h = tipClient(store, { wrongSender: true }); await h.api.createCreatorTipCheckout(checkoutInput);
  await assert.rejects(h.api.readMyTipTransactionStatus(tipId), /exact tip receipt/); assert.equal(store.rows.size, 1);
  const pending = tipClient(store, { status: "checkout_started" }); await pending.api.readMyTipTransactionStatus(tipId); assert.equal(store.rows.size, 1);
});
