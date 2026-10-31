#!/usr/bin/env node
// Production purchase functions, synthetic RPC/store boundaries; no charges.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { eventContract, heldReservation, TERMS_ID } from "../tests/fixtures/event-purchase-contract.mjs";
const buyer = "11111111-1111-4111-8111-111111111111";
const creator = "22222222-2222-4222-8222-222222222222";
const offerId = "33333333-3333-4333-8333-333333333333";
const intentId = "44444444-4444-4444-8444-444444444444";
const productId = "cw_test_product";
const realModules = new Set(["creatorMoneyStoreQuote", "creatorMoneyPurchaseAuthority", "creatorMonetization", "iosAppStoreCommerce", "iosExternalAdmission", "googlePlayExternalAdmission"]);
const compiledModules = new Map();

function runtime(options = {}) {
  let nativeCalls = 0;
  let beginCalls = 0, moneyBeginCalls = 0, cleanupCalls = 0;
  const attemptIds = [];
  let sessionCurrent = true;
  const amount = options.amount ?? 99;
  const platform = options.platform ?? "android";
  const provider = platform === "ios" ? "revenuecat_app_store" : "revenuecat_google_play";
  const selectedProductId = options.tip ? "cw_creator_tip_sandbox_099" : productId;
  const product = { identifier: selectedProductId, price: amount / 100, currencyCode: "USD", ...options.product };
  const offer = {
    id: offerId, creatorEventId: offerId, creatorId: creator, hostId: creator, partyId: "party-test",
    priceCents: amount, currency: "usd", status: "sandbox",
    provider: "revenuecat_google_play", providerProductId: selectedProductId, providerProductKey: "test_product",
    providerEntitlementId: "channel_member", interval: "monthly", passType: "one_time",
    ...eventContract(offerId, offerId, amount),
  };
  const access = {
    ...offer, offer, allowed: false, requiresPurchase: true, reason: options.reason ?? "purchase_required",
    resolverStatus: "resolved", offerStatus: "sandbox",
  };
  const cache = new Map();
  const context = vm.createContext({ console, Date, crypto: webcrypto, setTimeout: (fn) => { fn(); return 0; }, clearTimeout });
  const sdkPurchase = async () => { nativeCalls += 1; if (options.sdkReceived) return {}; throw { userCancelled: true }; };
  const products = async () => { if (options.productReadThrows) throw Error('catalog unavailable'); if (options.switchAccount) sessionCurrent = false; return [product]; };
  const moneyClaimState = options.claimState ?? { claimed: false };
  const claimMoney = async (_subject, name, args) => {
    assert.equal(name, "begin_creator_money_checkout");
    assert.equal(args.p_purchase_intent_id, intentId);
    moneyBeginCalls++; attemptIds.push(args.p_checkout_attempt_id);
    const alreadyClaimed = moneyClaimState.claimed; moneyClaimState.claimed = true;
    if (options.moneyBeginUnknown) throw Error("claim response lost");
    if (options.moneyClaimSwitchAccount) sessionCurrent = false;
    return { data: { id: intentId, userId: buyer, creatorId: creator,
      sourceType: options.sourceType ?? "paid_content", sourceId: options.tip ? creator : offerId,
      provider, providerProductId: selectedProductId, environment: "sandbox", status: "pending",
      amountMinor: amount, currency: "usd", quote: { amountMinor: amount, currency: "usd" },
      checkoutAttemptId: args.p_checkout_attempt_id, checkoutStartedAt: new Date().toISOString(), startAuthorized: !alreadyClaimed,
      ...options.moneyClaim }, error: options.moneyClaimError ?? null };
  };
  const mocks = {
    "react-native-purchases": { getStorefront: () => { throw new Error("Native store quote tests must not enter external storefront admission"); } },
    "./creatorTipCustomQuote": { normalizeCreatorTipCustomQuote: () => { throw new Error("Native store quote tests must not enter external checkout"); } },
    "./creatorSupportedPrices": { readCreatorSupportedPrices: async () => ({ status: "resolved", subjectUserId: buyer,
      prices: [{ platform: "android", environment: "sandbox", currency: "usd", status: "sandbox",
        provider: "revenuecat_google_play", productKey: "creator_tip_sandbox_099",
        providerProductId: selectedProductId, amountMinor: amount }] }) },
    "react-native": { Platform: { OS: platform } },
    "react-native-get-random-values": {},
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
    "./accountBoundSupabaseMutation": { invokeAccountBoundSupabaseMutationRpc: claimMoney },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => sessionCurrent ? { userId: buyer } : null,
      sameAccountSessionAuthority: (a,b) => !!a && !!b && a.userId === b.userId }, "./creatorTipCheckoutAttempt": {},
    "./featureFlags": {}, "./runtimeConfig": {},
    "./revenuecatPurchaseClosure": {
      isRevenueCatExistingPurchase: () => false,
      isRevenueCatUserCancellation: (e) => e.userCancelled === true,
    },
    "./creatorVideos": {}, "./paymentRailPolicy": { resolvePaymentRailPolicy: () => ({ allowed: true }) }, "./liveWatchPartyMoney": {},
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
          invokeCreatorMoneyPurchaseSubjectRpc: async (_subject, name, args) => {
            if (name === "cancel_unstarted_creator_event_reservation") {
              cleanupCalls += 1; if (options.cleanupThrows) throw Error('cleanup unavailable');
              return {data:{canceled:true},error:null};
            }
            if (name === "begin_creator_event_checkout") {
              beginCalls += 1; attemptIds.push(args.p_checkout_attempt_id);
              const alreadyClaimed = options.claimState?.claimed === true;
              if (options.claimState) options.claimState.claimed = true;
              if (options.beginUnknown) throw Error('claim response lost');
              return {data:{...heldReservation(buyer, offerId, offerId, intentId, amount),
                checkoutAttemptId:args.p_checkout_attempt_id,startAuthorized:!alreadyClaimed,...options.reservation},error:null};
            }
            return { data: {
            id: intentId, userId: buyer, creatorId: creator, sourceType: options.sourceType ?? "paid_content",
            sourceId: options.tip ? creator : offerId, provider,
            providerProductId: selectedProductId, environment: "sandbox", status: "pending",
            amountMinor: amount, currency: "usd", alreadyPurchased: false, alreadySubscribed: false,
            partyId: "party-test", passType: options.passType, grantsPublish: false,
            ...options.intent,
            }, error: null };
          },
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
  return { load, calls: () => nativeCalls, begins:()=>beginCalls, moneyBegins:()=>moneyBeginCalls, cleanups:()=>cleanupCalls, attemptIds };
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
  { module: "paidCreatorEvents", fn: "purchasePaidCreatorEventPass", sourceType: "event", reason: "event_pass_required", args: { creatorEventId: offerId, sourceSurface: "test", expectedTermsRevisionId: TERMS_ID } },
];
for (const test of cases) {
  const label = `${test.module}${test.package ? " package" : ""}`;
  for (const product of [{ price: 19.99 }, { currencyCode: "EUR" }, { currencyCode: undefined }, { price: 0.991 }]) {
    const run = runtime({ ...test, product });
    const result = await run.load(test.module)[test.fn](test.args);
    assert.equal(result.ok, false, `${label} mismatch not successful`);
    assert.equal(result.message, test.sourceType === "event" ? quote.CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY.replace("Nothing was charged.", "No new charge was started by this attempt.") : quote.CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY, `${label} reaches quote guard`);
    if (test.sourceType === "event") { assert.equal(run.cleanups(),1); assert.equal(run.begins(),0); }
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
const eventCase = cases.find(item => item.sourceType === "event");
// A synthetic provisioned binding exercises the real subscription entry point;
// it is not a seeded production SKU or evidence that a store has approved one.
const subscriptionCase = cases.find(item => item.sourceType === "channel_subscription");
for (const platform of ["ios", "android"]) {
  const subscriptionCatalogBinding = { bindingId: intentId, version: 2, creatorId: creator,
    offerId, priceId: offerId, providerProductId: productId, amountMinor: 1299,
    currency: "usd", platform, environment: "sandbox", subscriptionPeriod: "P1M" };
  const dynamic = { ...subscriptionCase, amount: 1299, platform, intent: { subscriptionCatalogBinding } };
  const accepted = runtime(dynamic);
  await accepted.load(dynamic.module)[dynamic.fn](dynamic.args);
  assert.equal(accepted.calls(), 1, `${platform} new bound price reaches native purchase`);
  for (const product of [{ price: 4.99 }, { currencyCode: "EUR" }, { identifier: "wrong_product" }]) {
    const mismatch = runtime({ ...dynamic, product });
    await mismatch.load(dynamic.module)[dynamic.fn](dynamic.args);
    assert.equal(mismatch.calls(), 0, `${platform} new price must match live store quote`);
  }
  for (const patch of [{ creatorId: buyer }, { amountMinor: 499 }, { version: 0 }]) {
    const malformed = runtime({ ...dynamic, intent: { subscriptionCatalogBinding: { ...subscriptionCatalogBinding, ...patch } } });
    await assert.rejects(malformed.load(dynamic.module)[dynamic.fn](dynamic.args), /authority could not be verified/);
    assert.equal(malformed.calls(), 0);
  }
  const state = { claimed: false };
  const first = runtime({ ...dynamic, claimState: state }), second = runtime({ ...dynamic, claimState: state });
  await Promise.all([first.load(dynamic.module)[dynamic.fn](dynamic.args), second.load(dynamic.module)[dynamic.fn](dynamic.args)]);
  assert.equal(first.calls() + second.calls(), 1, `${platform} dynamic price retains atomic checkout claim`);
}
for (const reservation of [{state:"expired"},{expiresAt:"2000-01-01T00:00:00Z"},{buyerId:creator},
  {termsRevisionId:intentId},{creatorEventId:creator},{offerId:creator},{priceCents:199},{currency:"eur"},{purchaseIntentId:offerId},
  {startAuthorized:false},{checkoutAttemptId:intentId}]) {
  const run = runtime({...eventCase,reservation});
  const result = await run.load(eventCase.module)[eventCase.fn](eventCase.args);
  assert.equal(run.calls(),0,"invalid reservation never reaches native checkout");
  assert.match(result.message,/reservation is no longer ready/);
  assert.equal(result.access.requiresPurchase,false,'uncertain reservation hides retry purchase');
  assert.equal(result.access.reason,'reservation_pending');
  assert.equal(run.cleanups(),0,'never cancel after begin, even denied or malformed readback');
}
for (const options of [{productReadThrows:true},{productReadThrows:true,cleanupThrows:true},{product:{price:1.99},cleanupThrows:true}]) {
  const run=runtime({...eventCase,...options});const result=await run.load(eventCase.module)[eventCase.fn](eventCase.args);
  assert.equal(run.calls(),0);assert.equal(run.begins(),0);assert.equal(run.cleanups(),1);
  assert.match(result.message,/No new charge was started/);
}
const claimState={claimed:false};
const firstEvent=runtime({...eventCase,claimState}),secondEvent=runtime({...eventCase,claimState});
await Promise.all([firstEvent.load(eventCase.module)[eventCase.fn](eventCase.args),secondEvent.load(eventCase.module)[eventCase.fn](eventCase.args)]);
assert.equal(firstEvent.calls()+secondEvent.calls(),1,'one atomic server claim allows only one SDK invocation');
assert.equal(firstEvent.cleanups()+secondEvent.cleanups(),0,'no cleanup after claim or store cancellation');
assert.notEqual(firstEvent.attemptIds[0],secondEvent.attemptIds[0],'each invocation has a new UUID');
for (const options of [{beginUnknown:true},{sdkReceived:true},{},{intent:{alreadyPurchased:true,status:'consumed'}}]) {
  const run=runtime({...eventCase,...options});
  const result=await run.load(eventCase.module)[eventCase.fn](eventCase.args);
  assert.equal(result.ok,false);
  assert.equal(result.access.allowed,false,'pending checkout never grants early admission');
  assert.equal(result.access.requiresPurchase,false,'pending checkout does not redisplay a buy button');
  assert.equal(result.access.reason,options.beginUnknown?'reservation_pending':'reconciliation_required');
  assert.equal(run.calls(),options.beginUnknown||options.intent?.alreadyPurchased?0:1);
  assert.equal(run.cleanups(),0,'uncertain checkout is never released');
}
for (const id of [...firstEvent.attemptIds,...secondEvent.attemptIds]) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const unknown=runtime({...eventCase,beginUnknown:true});
const unknownResult=await unknown.load(eventCase.module)[eventCase.fn](eventCase.args);
assert.equal(unknown.calls(),0);assert.equal(unknown.cleanups(),0);assert.equal(unknown.begins(),1);
assert.match(unknownResult.message,/Check My Tickets/);
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
const fractionalVideo = runtime({ sourceType: "paid_content", reason: "purchase_required" });
const fractionalResult = await fractionalVideo.load("creatorPaidVideos").purchasePaidVideoAccess({ videoId: offerId, creatorId: creator, amountCents: 99.5, currency: "usd" });
assert.equal(fractionalResult.ok, false);
assert.equal(fractionalVideo.calls(), 0, "fractional requested minor units cannot silently truncate into a valid purchase");
const nonEventCases = [...cases.filter(item => item.sourceType !== "event"),
  ...[["live_watch_party_access_pass", "live_watch_party_access"], ["live_watch_party_seat_pass", "live_watch_party_seat"]].map(([passType, sourceType]) => ({
    module: "liveWatchPartyMoney", fn: "purchaseLiveWatchPartyOffer", live: true, passType, sourceType,
    args: { partyId: "party-test", offerId, passType, priceCents: 99 },
  }))];
const invoke = async (run, spec) => { try { return await run.load(spec.module)[spec.fn](spec.args); } catch (error) { return error; } };
for (const spec of nonEventCases) {
  const label = `${spec.module}:${spec.sourceType}${spec.package ? ":package" : ""}`;
  for (const moneyClaim of [{ startAuthorized: false }, { checkoutAttemptId: intentId }, { checkoutStartedAt: null }, { id: offerId },
    { userId: creator }, { sourceType: "event" }, { sourceId: intentId }, { creatorId: buyer }, { provider: "stripe_connect" },
    { providerProductId: "different" }, { environment: "production" }, { status: "consumed" }, { amountMinor: 199 }, { currency: "eur" },
    { quote: null }, { quote: { amountMinor: 199, currency: "usd" } }]) {
    const run = runtime({ ...spec, moneyClaim }); await invoke(run, spec);
    assert.equal(run.moneyBegins(), 1, `${label} actual claim invoked`);
    assert.equal(run.calls(), 0, `${label} rejects mismatched/denied durable claim before SDK`);
  }
  const switched = runtime({ ...spec, moneyClaimSwitchAccount: true }); await invoke(switched, spec);
  assert.equal(switched.moneyBegins(), 1); assert.equal(switched.calls(), 0, `${label} account replacement after claim blocks SDK`);
  const shared = { claimed: false }, first = runtime({ ...spec, claimState: shared }), second = runtime({ ...spec, claimState: shared });
  await Promise.all([invoke(first, spec), invoke(second, spec)]);
  assert.equal(first.calls() + second.calls(), 1, `${label} concurrent callers reach SDK once`);
  assert.notEqual(first.attemptIds[0], second.attemptIds[0]);
  const unknownState = { claimed: false }, lost = runtime({ ...spec, claimState: unknownState, moneyBeginUnknown: true });
  await invoke(lost, spec); const retried = runtime({ ...spec, claimState: unknownState }); await invoke(retried, spec);
  assert.equal(lost.calls() + retried.calls(), 0, `${label} unknown claim never authorizes repeat SDK call after remount`);
}
console.log("PASS: nine production purchase branches reject price/currency drift, invalid intents and stale sessions; every native checkout requires an exact durable one-use claim, including concurrent/unknown-result controls. Event preflight-only cleanup remains guarded.");
