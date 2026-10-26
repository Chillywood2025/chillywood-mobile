import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const buyer = "11111111-1111-4111-8111-111111111111", source = "22222222-2222-4222-8222-222222222222", creator = "33333333-3333-4333-8333-333333333333";
const uuid = n => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
const stamp = "2026-10-26T16:30:00Z";
const load = (name, mocks) => {
  const module = { exports: {} };
  new Function("exports", "module", "require", ts.transpileModule(fs.readFileSync(`_lib/${name}.ts`, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText)(module.exports, module, id => { assert.ok(id in mocks, `unexpected import ${id}`); return mocks[id]; });
  return module.exports;
};
const price = (n, platform, amountMinor = 99, environment = "sandbox") => ({ priceId: uuid(n), productKey: `mapped-${platform}-${amountMinor}`, providerProductId: `store-${platform}-${amountMinor}`,
  provider: platform === "ios" ? "revenuecat_app_store" : "revenuecat_google_play", platform, amountMinor, currency: "usd", environment,
  status: environment === "sandbox" ? "sandbox" : "active", providerVerified: environment === "production" });
const item = (changes = {}) => ({ id: uuid(1), purchaseIntentId: uuid(1), sourceType: "event", sourceId: source, creatorId: creator,
  productType: "event_pass", productKey: "event", title: "Sunday show", status: "upcoming", amountMinor: 299, currency: "usd",
  createdAt: stamp, purchasedAt: stamp, startsAt: "2026-11-01T20:00:00Z", expiresAt: null, provider: "revenuecat_google_play", environment: "sandbox",
  destination: { kind: "creator_event", id: source }, receipt: { providerEventId: uuid(2), originalTransactionId: "original", verifiedAt: stamp },
  terms: { title: "Sunday show", timeZone: "America/New_York", priceCents: 299, replayPolicy: "none" }, termsAvailable: true, grantsAccess: false, ...changes });
const page = (items = [item()]) => ({ userId: buyer, fetchedAt: stamp, items, nextCursor: null });
function setup({ rpc, platform = "android" } = {}) {
  let authority = { userId: buyer, accountId: buyer, sessionGeneration: "session-1", state: "ACTIVE", restoreOnly: false };
  const calls = [], restores = [];
  const mocks = {
    "react-native": { Platform: { OS: platform } },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => authority, sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: async () => ({ authority }),
      invokeAccountBoundSupabaseMutationRpc: async (subject, name, args) => { calls.push({ subject, name, args }); return rpc ? rpc(name, args) : { data: page(), error: null }; },
    },
    "./creatorMoneyPurchaseAuthority": {
      captureCreatorMoneyPurchaseAuthority: () => authority,
      prepareCreatorMoneyPurchaseSubject: async () => authority ? { userId: authority.userId, authority } : null,
      revalidateCreatorMoneyPurchaseSubject: async subject => subject.authority === authority,
    },
    "./revenuecat": { restoreRevenueCatPurchases: async input => restores.push(input) },
  };
  return { prices: load("creatorSupportedPrices", mocks), purchases: load("creatorPurchases", mocks), calls, restores,
    switchSession: () => { authority = { ...authority, sessionGeneration: "session-2" }; },
    signOut: () => { authority = null; }, mocks };
}

test("authoring combines real catalog IDs across stores and never claims missing Android prices", async () => {
  const h = setup({ rpc: async (_name, args) => ({ data: args.p_platform === "ios" ? [price(1, "ios"), price(2, "ios", 299)] : [price(3, "android")], error: null }) });
  const result = await h.prices.readCreatorAuthoringPrices("event");
  assert.equal(result.status, "resolved"); assert.equal(result.prices.length, 2);
  assert.deepEqual(result.prices[0].availablePlatforms, ["ios", "android"]);
  assert.equal(result.prices[0].priceKey, uuid(1));
  assert.equal(result.prices[1].availabilityLabel, "iOS only · Android unavailable");
  assert.ok(h.calls.every(call => call.args.p_source_id === null));
  await h.prices.readCreatorSupportedPrices("event", source);
  assert.equal(h.calls.at(-1).args.p_platform, "android"); assert.equal(h.calls.at(-1).args.p_source_id, source);
});

test("catalog rejects unverified production, malformed prices, wrong store, duplicates and stale account", async () => {
  const h = setup(); const expected = { platform: "ios", environment: "production", sourceType: "paid_content" };
  assert.equal(h.prices.parseCreatorSupportedPrices([price(1, "ios", 299, "production")], expected).length, 1);
  for (const invalid of [{ providerVerified: false }, { amountMinor: 2.99 }, { amountMinor: Number.MAX_SAFE_INTEGER + 1 }, { currency: "eur" }, { platform: "android" }, { providerProductId: "" }]) {
    assert.equal(h.prices.parseCreatorSupportedPrices([{ ...price(1, "ios", 299, "production"), ...invalid }], expected), null);
  }
  assert.equal(h.prices.parseCreatorSupportedPrices([price(1, "ios", 299, "production"), price(1, "ios", 299, "production")], expected), null);
  let stale; stale = setup({ rpc: async () => { stale.switchSession(); return { data: [price(1, "android")], error: null }; } });
  assert.equal((await stale.prices.readCreatorSupportedPrices("event", source)).status, "unavailable");
  const partial = setup({ rpc: async (_name, args) => args.p_platform === "android" ? { error: {} } : { data: [price(1, "ios")], error: null } });
  assert.equal((await partial.prices.readCreatorAuthoringPrices("event")).status, "unavailable");
});

test("wallet parses every state, preserves snapshot price, and distinguishes history from access", async () => {
  const h = setup();
  for (const status of ["pending", "paid_unfulfilled", "reconciliation_required", "active", "upcoming", "expired", "refunded", "revoked", "failed", "canceled", "disputed", "completed"]) {
    const parsed = h.purchases.parseCreatorPurchasePage(page([item({ status })]), buyer);
    assert.equal(parsed.items[0].amountMinor, 299); assert.equal(parsed.items[0].grantsAccess, false);
    assert.ok(h.purchases.creatorPurchaseStatusPresentation(status).label);
  }
  const result = await h.purchases.readMyCreatorPurchases();
  assert.equal(result.status, "resolved"); assert.equal(result.subjectSessionGeneration, "session-1");
  assert.equal(h.calls[0].name, "read_my_creator_purchases");
  assert.deepEqual(h.calls[0].args, { p_limit: 50, p_before_created_at: null, p_before_id: null });
});

test("wallet retains unlinked review records and legacy Stripe tips without inventing content", () => {
  const h = setup();
  const unbound = item({ purchaseIntentId: null, sourceId: null, creatorId: null, productKey: null, title: null,
    amountMinor: null, currency: null, destination: null, status: "reconciliation_required", terms: {}, termsAvailable: false });
  assert.equal(h.purchases.parseCreatorPurchasePage(page([unbound]), buyer).items[0].title, null);
  const tip = item({ sourceType: "creator_tip", sourceId: creator, productType: "creator_tip", productKey: null,
    provider: "stripe_connect", environment: "unknown", destination: { kind: "creator_channel", id: creator } });
  assert.ok(h.purchases.parseCreatorPurchasePage(page([tip]), buyer));
});

test("wallet fails closed for wrong owner, access grants, destination mismatches, malformed cursors and stale session", async () => {
  const h = setup();
  for (const invalid of [{ grantsAccess: true }, { sourceType: "premium" }, { productType: "premium" }, { amountMinor: 2.99 },
    { currency: null }, { status: "paid" }, { sourceId: null }, { endsAt: "invalid-date" }, { destination: { kind: "creator_event", id: creator } }, { destination: { kind: "creator_video", id: source } }]) {
    assert.equal(h.purchases.parseCreatorPurchasePage(page([item(invalid)]), buyer), null);
  }
  assert.equal(h.purchases.parseCreatorPurchasePage({ ...page(), userId: creator }, buyer), null);
  assert.equal(h.purchases.parseCreatorPurchasePage({ ...page(), nextCursor: { createdAt: stamp, id: uuid(3) } }, buyer), null);
  let stale; stale = setup({ rpc: async () => { stale.switchSession(); return { data: page(), error: null }; } });
  const result = await stale.purchases.readMyCreatorPurchases(); assert.equal(result.status, "unavailable"); assert.deepEqual(result.items, []);
  h.signOut(); assert.equal((await h.purchases.readMyCreatorPurchases()).status, "unavailable"); assert.equal(h.calls.length, 0);
});

test("destinations preserve exact item IDs and restore never returns an optimistic grant", async () => {
  const h = setup();
  const routes = { creator_video: "/player/[id]", creator_event: "/event/[eventId]", watch_party: "/watch-party/[partyId]", live_stage: "/watch-party/live-stage/[partyId]", creator_channel: "/channel/[userId]", vip_pass: "/vip-pass/[creatorId]", channel_subscription: "/channel-subscription/[creatorId]" };
  for (const [kind, pathname] of Object.entries(routes)) {
    const route = h.purchases.creatorPurchaseDestinationRoute({ kind, id: source }); assert.equal(route.pathname, pathname); assert.ok(Object.values(route.params).includes(source));
  }
  const restore = await h.purchases.restoreCreatorPurchaseLibrary(); assert.equal(restore.ok, true); assert.equal("grantsAccess" in restore, false);
  h.mocks["./revenuecat"].restoreRevenueCatPurchases = async () => h.switchSession();
  assert.equal((await h.purchases.restoreCreatorPurchaseLibrary()).ok, false);
});

test("exact-event history filter is sent to the server and wrong-source results are rejected", async () => {
  const h = setup(); const result = await h.purchases.readMyCreatorPurchases(null, { sourceType: "event", sourceId: source });
  assert.equal(result.status, "resolved"); assert.equal(h.calls[0].args.p_source_id, source);
  assert.equal(h.calls[0].args.p_source_type, "event");
  assert.equal((await h.purchases.readMyCreatorPurchases(null, { sourceType: "event", sourceId: creator })).status, "unavailable");
});

test("paid-video initial price binds the dedicated iOS intent to299/499/999 and never a99fallback", async () => {
  const platform = { OS: "ios" }, calls = [];
  const mocks = { "react-native": { Platform: platform }, "react-native-get-random-values": {}, "./accountSessionAuthority": {}, "./accountBoundSupabaseMutation": {},
    "./featureFlags": {}, "./revenuecat": {}, "./runtimeConfig": {}, "./revenuecatPurchaseClosure": {},
    "./analytics": {}, "./supabase": { supabase: {} }, "./creatorVideos": {}, "./entitlementAuthority": {}, "./paymentRailPolicy": {},
    "./creatorMonetization": {}, "./creatorMoneyStoreQuote": load("creatorMoneyStoreQuote", {}), "./iosAppStoreCommerce": load("iosAppStoreCommerce", {}) };
  const authority = load("creatorMoneyPurchaseAuthority", mocks);
  let response;
  mocks["./creatorMoneyPurchaseAuthority"] = { ...authority, invokeCreatorMoneyPurchaseSubjectRpc: async (_subject, name, args) => { calls.push({ name, args }); return { data: response, error: null }; } };
  const api = load("creatorPaidVideos", mocks), subject = { userId: buyer };
  for (const [amount, tier] of [[299, "tier2"], [499, "tier3"], [999, "tier4"]]) {
    response = { id: uuid(8), userId: buyer, creatorId: creator, sourceType: "paid_content", sourceId: source, provider: "revenuecat_app_store",
      providerProductId: `com.chillywood.paidvideo.${tier}`, environment: "sandbox", status: "pending", amountMinor: amount, currency: "usd", alreadyPurchased: false };
    const expected = { userId: buyer, creatorId: creator, sourceType: "paid_content", sourceId: source,
      provider: "revenuecat_app_store", providerProductId: response.providerProductId, environment: "sandbox", amountMinor: amount, currency: "usd" };
    await api.createPaidVideoPurchaseIntent({ videoId: source, creatorId: creator, amountCents: amount, currency: "usd" }, expected, subject);
    assert.equal(calls.at(-1).name, "create_ios_creator_money_purchase_intent"); assert.equal(calls.at(-1).args.p_amount_minor, amount);
    assert.equal(calls.at(-1).args.p_concept, "paid_video"); assert.equal(calls.at(-1).args.p_product_key, undefined);
    response = { ...response, amountMinor: 99 };
    await assert.rejects(api.createPaidVideoPurchaseIntent({ videoId: source, creatorId: creator, amountCents: amount, currency: "usd" }, expected, subject), /could not be verified/);
  }
  platform.OS = "android";
  response = { ...response, amountMinor: 99, provider: "revenuecat_google_play", providerProductId: "actual-android" };
  await api.createPaidVideoPurchaseIntent({ videoId: source, creatorId: creator, amountCents: 99, currency: "usd", productKey: "actual-catalog-key" },
    { userId: buyer, creatorId: creator, sourceType: "paid_content", sourceId: source, provider: "revenuecat_google_play", providerProductId: "actual-android", environment: "sandbox", amountMinor: 99, currency: "usd" }, subject);
  assert.equal(calls.at(-1).args.p_product_key, "actual-catalog-key");
});
