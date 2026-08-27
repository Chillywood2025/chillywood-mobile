import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";
const INTENT_ID = "55555555-5555-4555-8555-555555555555";

const compiled = new Map();
const compile = (path) => {
  if (!compiled.has(path)) {
    compiled.set(path, ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        strict: true,
      },
    }).outputText);
  }
  return compiled.get(path);
};

let inert;
inert = new Proxy(() => undefined, {
  get: (_target, key) => key === "then" ? undefined : inert,
  apply: () => undefined,
});

const instantiate = (path, mocks = {}) => {
  const module = { exports: {} };
  new Function("exports", "module", "require", compile(path))(
    module.exports,
    module,
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : inert,
  );
  return module.exports;
};

const iosCatalog = instantiate("_lib/iosAppStoreCommerce.ts");
const authority = instantiate("_lib/creatorMoneyPurchaseAuthority.ts");

const expected = ({ sourceType, sourceId, amountMinor, providerProductId }) => ({
  userId: VIEWER_ID,
  sourceType,
  sourceId,
  creatorId: CREATOR_ID,
  provider: "revenuecat_google_play",
  providerProductId,
  environment: "sandbox",
  amountMinor,
  currency: "usd",
});

const safeIntent = ({
  sourceType,
  sourceId,
  amountMinor,
  providerProductId,
  provider = "revenuecat_app_store",
  status = "pending",
  alreadyPurchased,
  alreadySubscribed,
  creatorId = CREATOR_ID,
  userId = VIEWER_ID,
  environment = "sandbox",
  currency = "usd",
}) => ({
  id: INTENT_ID,
  userId,
  sourceType,
  sourceId,
  creatorId,
  provider,
  providerProductId,
  environment,
  status,
  amountMinor,
  currency,
  ...(alreadyPurchased === undefined ? {} : { alreadyPurchased }),
  ...(alreadySubscribed === undefined ? {} : { alreadySubscribed }),
});

const loadIntentApi = (path, platform, response) => {
  const supabase = { rpc: async () => ({ data: response, error: null }) };
  return instantiate(path, {
    "./analytics": { trackEvent: inert },
    "./creatorMoneyPurchaseAuthority": authority,
    "./creatorMonetization": { formatMonetizationCurrency: inert },
    "./iosAppStoreCommerce": iosCatalog,
    "./paymentRailPolicy": { resolvePaymentRailPolicy: () => ({ allowed: true }) },
    "./revenuecat": inert,
    "./supabase": { supabase },
    "react-native": { Platform: { OS: platform } },
  });
};

test("finite App Store tier selection is exact and rejects the old plus-one price alias", () => {
  assert.equal(
    iosCatalog.resolveIosFiniteAppStoreTier("event_pass", 99)?.productId,
    "com.chillywood.eventpass.tier1",
  );
  assert.equal(iosCatalog.resolveIosFiniteAppStoreTier("event_pass", 100), null);
  assert.equal(iosCatalog.resolveIosFiniteAppStoreTier("vip_pass", 500), null);
  assert.equal(iosCatalog.resolveIosFiniteAppStoreTier("paid_video", Number.NaN), null);
});

test("iOS Event intents replace the persisted Google offer product with one exact App Store tier", async () => {
  const exact = safeIntent({
    sourceType: "event",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    providerProductId: "com.chillywood.eventpass.tier1",
    alreadyPurchased: false,
  });
  const api = loadIntentApi("_lib/paidCreatorEvents.ts", "ios", exact);
  assert.deepEqual(
    await api.createPaidCreatorEventPassPurchaseIntent(
      OFFER_ID,
      expected({
        sourceType: "event",
        sourceId: SOURCE_ID,
        amountMinor: 99,
        providerProductId: "cw_event_pass_sandbox_099",
      }),
    ),
    { id: INTENT_ID, providerProductId: "com.chillywood.eventpass.tier1", alreadyPurchased: false },
  );

  for (const response of [
    { ...exact, providerProductId: "com.chillywood.vip.tier1" },
    { ...exact, providerProductId: "com.chillywood.eventpass.tier2" },
    { ...exact, sourceId: OFFER_ID },
    { ...exact, creatorId: SOURCE_ID },
    { ...exact, amountMinor: 100 },
    { ...exact, alreadyPurchased: "false" },
  ]) {
    const malformed = loadIntentApi("_lib/paidCreatorEvents.ts", "ios", response);
    await assert.rejects(
      malformed.createPaidCreatorEventPassPurchaseIntent(
        OFFER_ID,
        expected({
          sourceType: "event",
          sourceId: SOURCE_ID,
          amountMinor: 99,
          providerProductId: "cw_event_pass_sandbox_099",
        }),
      ),
      /authority could not be verified/u,
    );
  }
});

test("iOS VIP intents accept only the exact VIP tier and never a Premium or Event product", async () => {
  const exact = safeIntent({
    sourceType: "vip_pass",
    sourceId: OFFER_ID,
    amountMinor: 499,
    providerProductId: "com.chillywood.vip.tier3",
    alreadyPurchased: false,
  });
  const expectation = expected({
    sourceType: "vip_pass",
    sourceId: OFFER_ID,
    amountMinor: 499,
    providerProductId: "cw_vip_pass_sandbox_499",
  });
  const api = loadIntentApi("_lib/creatorVipPasses.ts", "ios", exact);
  assert.equal(
    (await api.createCreatorVipPassPurchaseIntent(OFFER_ID, expectation)).providerProductId,
    "com.chillywood.vip.tier3",
  );
  for (const providerProductId of [
    "com.chillywood.premium.monthly",
    "com.chillywood.eventpass.tier3",
    "com.chillywood.vip.tier2",
  ]) {
    const malformed = loadIntentApi("_lib/creatorVipPasses.ts", "ios", {
      ...exact,
      providerProductId,
    });
    await assert.rejects(
      malformed.createCreatorVipPassPurchaseIntent(OFFER_ID, expectation),
      /authority could not be verified/u,
    );
  }
});

test("iOS Paid Video intents replace the persisted Google product with the exact App Store tier", async () => {
  const expectation = expected({
    sourceType: "paid_content",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    providerProductId: "cw_paid_content_access_sandbox_099",
  });
  const exact = safeIntent({
    sourceType: "paid_content",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    providerProductId: "com.chillywood.paidvideo.tier1",
    alreadyPurchased: false,
  });
  const api = loadIntentApi("_lib/creatorPaidVideos.ts", "ios", exact);
  assert.deepEqual(
    await api.createPaidVideoPurchaseIntent({
      videoId: SOURCE_ID,
      creatorId: CREATOR_ID,
      amountCents: 99,
      currency: "usd",
    }, expectation),
    { id: INTENT_ID, providerProductId: "com.chillywood.paidvideo.tier1", alreadyPurchased: false },
  );

  for (const response of [
    { ...exact, providerProductId: "cw_paid_content_access_sandbox_099", provider: "revenuecat_google_play" },
    { ...exact, providerProductId: "com.chillywood.vip.tier1" },
    { ...exact, providerProductId: "com.chillywood.paidvideo.tier2" },
    { ...exact, sourceId: OFFER_ID },
    { ...exact, creatorId: SOURCE_ID },
    { ...exact, amountMinor: 100 },
    { ...exact, alreadyPurchased: "false" },
  ]) {
    const malformed = loadIntentApi("_lib/creatorPaidVideos.ts", "ios", response);
    await assert.rejects(
      malformed.createPaidVideoPurchaseIntent({
        videoId: SOURCE_ID,
        creatorId: CREATOR_ID,
        amountCents: 99,
        currency: "usd",
      }, expectation),
      /authority could not be verified/u,
    );
  }
});

test("Paid Video checkout loads the server-authoritative App Store product, not the Google offer alias", async () => {
  const access = {
    allowed: false,
    reason: "purchase_required",
    resolverStatus: "resolved",
    requiresPurchase: true,
    priceCents: 99,
    currency: "usd",
    creatorId: CREATOR_ID,
    provider: "revenuecat_google_play",
    providerProductId: "cw_paid_content_access_sandbox_099",
    providerProductKey: "paid_content_access_sandbox_099",
    offerStatus: "sandbox",
  };
  const intent = safeIntent({
    sourceType: "paid_content",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    providerProductId: "com.chillywood.paidvideo.tier1",
    alreadyPurchased: false,
  });
  const requestedProducts = [];
  const supabase = {
    rpc: async (name) => ({
      data: name === "resolve_creator_content_access" ? access : intent,
      error: null,
    }),
  };
  const api = instantiate("_lib/creatorPaidVideos.ts", {
    "./analytics": { trackEvent: inert },
    "./creatorMoneyPurchaseAuthority": {
      ...authority,
      prepareCreatorMoneyPurchaseSubject: async () => ({
        userId: VIEWER_ID,
        authority: { userId: VIEWER_ID, sessionGeneration: "exact-session", restoreOnly: false },
      }),
      revalidateCreatorMoneyPurchaseSubject: async () => true,
    },
    "./creatorMonetization": {
      formatMonetizationCurrency: inert,
      normalizeCreatorContentAccessResolution: (value) => value,
    },
    "./iosAppStoreCommerce": iosCatalog,
    "./paymentRailPolicy": { resolvePaymentRailPolicy: () => ({ allowed: true }) },
    "./revenuecat": {
      readRevenueCatNonSubscriptionProducts: async (ids) => {
        requestedProducts.push(...ids);
        return [];
      },
      purchaseRevenueCatStoreProduct: async () => {
        throw new Error("purchase should not run without an exact product");
      },
    },
    "./supabase": { supabase },
    "react-native": { Platform: { OS: "ios" } },
  });
  const result = await api.purchasePaidVideoAccess({
    videoId: SOURCE_ID,
    creatorId: CREATOR_ID,
    amountCents: 99,
    currency: "usd",
  });
  assert.deepEqual(requestedProducts, ["com.chillywood.paidvideo.tier1"]);
  assert.equal(result.productId, "com.chillywood.paidvideo.tier1");
  assert.equal(result.ok, false);
});

test("iOS Channel intents accept only an exact one-of-eight monthly creator slot", async () => {
  const expectation = expected({
    sourceType: "channel_subscription",
    sourceId: OFFER_ID,
    amountMinor: 499,
    providerProductId: "cw_channel_subscription_monthly_499",
  });
  for (const slot of [1, 8]) {
    const exact = safeIntent({
      sourceType: "channel_subscription",
      sourceId: OFFER_ID,
      amountMinor: 499,
      providerProductId: `com.chillywood.channel.subscription.slot${slot}`,
      alreadySubscribed: false,
    });
    const api = loadIntentApi("_lib/channelSubscriptions.ts", "ios", exact);
    assert.equal(
      (await api.createChannelSubscriptionPurchaseIntent(OFFER_ID, expectation)).providerProductId,
      exact.providerProductId,
    );
  }
  for (const providerProductId of [
    "com.chillywood.channel.subscription.slot0",
    "com.chillywood.channel.subscription.slot9",
    "com.chillywood.premium.monthly",
    "com.chillywood.vip.tier3",
  ]) {
    const malformed = loadIntentApi("_lib/channelSubscriptions.ts", "ios", safeIntent({
      sourceType: "channel_subscription",
      sourceId: OFFER_ID,
      amountMinor: 499,
      providerProductId,
      alreadySubscribed: false,
    }));
    await assert.rejects(
      malformed.createChannelSubscriptionPurchaseIntent(OFFER_ID, expectation),
      /authority could not be verified/u,
    );
  }
});

test("Android preserves exact Google Play provenance and rejects App Store readback", async () => {
  const expectation = expected({
    sourceType: "event",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    providerProductId: "cw_event_pass_sandbox_099",
  });
  const exact = safeIntent({
    sourceType: "event",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    provider: "revenuecat_google_play",
    providerProductId: "cw_event_pass_sandbox_099",
    alreadyPurchased: false,
  });
  const api = loadIntentApi("_lib/paidCreatorEvents.ts", "android", exact);
  assert.equal(
    (await api.createPaidCreatorEventPassPurchaseIntent(OFFER_ID, expectation)).providerProductId,
    "cw_event_pass_sandbox_099",
  );
  const crossStore = loadIntentApi("_lib/paidCreatorEvents.ts", "android", {
    ...exact,
    provider: "revenuecat_app_store",
    providerProductId: "com.chillywood.eventpass.tier1",
  });
  await assert.rejects(
    crossStore.createPaidCreatorEventPassPurchaseIntent(OFFER_ID, expectation),
    /authority could not be verified/u,
  );

  const paidVideoExpectation = expected({
    sourceType: "paid_content",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    providerProductId: "cw_paid_content_access_sandbox_099",
  });
  const paidVideoIntent = safeIntent({
    sourceType: "paid_content",
    sourceId: SOURCE_ID,
    amountMinor: 99,
    provider: "revenuecat_google_play",
    providerProductId: "cw_paid_content_access_sandbox_099",
    alreadyPurchased: false,
  });
  const paidVideo = loadIntentApi("_lib/creatorPaidVideos.ts", "android", paidVideoIntent);
  assert.equal(
    (await paidVideo.createPaidVideoPurchaseIntent({
      videoId: SOURCE_ID,
      creatorId: CREATOR_ID,
      amountCents: 99,
      currency: "usd",
    }, paidVideoExpectation)).providerProductId,
    "cw_paid_content_access_sandbox_099",
  );
  const paidVideoCrossStore = loadIntentApi("_lib/creatorPaidVideos.ts", "android", {
    ...paidVideoIntent,
    provider: "revenuecat_app_store",
    providerProductId: "com.chillywood.paidvideo.tier1",
  });
  await assert.rejects(
    paidVideoCrossStore.createPaidVideoPurchaseIntent({
      videoId: SOURCE_ID,
      creatorId: CREATOR_ID,
      amountCents: 99,
      currency: "usd",
    }, paidVideoExpectation),
    /authority could not be verified/u,
  );
});

test("active historical purchases remain exact-source no-charge authority across stores", async () => {
  const currentExpectation = expected({
    sourceType: "vip_pass",
    sourceId: OFFER_ID,
    amountMinor: 499,
    providerProductId: "cw_vip_pass_sandbox_499",
  });
  const historical = safeIntent({
    sourceType: "vip_pass",
    sourceId: OFFER_ID,
    amountMinor: 299,
    provider: "revenuecat_app_store",
    providerProductId: "com.chillywood.vip.tier2",
    status: "consumed",
    alreadyPurchased: true,
  });
  const api = loadIntentApi("_lib/creatorVipPasses.ts", "android", historical);
  assert.deepEqual(
    await api.createCreatorVipPassPurchaseIntent(OFFER_ID, currentExpectation),
    { id: INTENT_ID, providerProductId: "com.chillywood.vip.tier2", alreadyPurchased: true },
  );
  for (const response of [
    { ...historical, sourceId: SOURCE_ID },
    { ...historical, creatorId: SOURCE_ID },
    { ...historical, userId: SOURCE_ID },
    { ...historical, status: "refunded" },
    { ...historical, status: "revoked" },
    { ...historical, status: "expired" },
    { ...historical, provider: "unknown_provider" },
    { ...historical, amountMinor: 0 },
  ]) {
    const malformed = loadIntentApi("_lib/creatorVipPasses.ts", "android", response);
    await assert.rejects(
      malformed.createCreatorVipPassPurchaseIntent(OFFER_ID, currentExpectation),
      /authority could not be verified/u,
    );
  }
});

test("VIP video access accepts only exact authoritative allow tuples", async () => {
  const creator = CREATOR_ID;
  for (const [payload, allowed] of [
    [{ allowed: true, reason: "vip_not_required", vipRequired: false, creatorId: creator }, true],
    [{ allowed: true, reason: "owner", vipRequired: true, creatorId: creator }, true],
    [{ allowed: true, reason: "vip_active", vipRequired: true, creatorId: creator }, true],
    [{ allowed: true, reason: "purchase_required", vipRequired: true, creatorId: creator }, false],
    [{ allowed: true, reason: "vip_active", vipRequired: false, creatorId: creator }, false],
    [{ allowed: true, reason: "vip_active", vipRequired: true, creatorId: null }, false],
    [{ allowed: false, reason: "vip_required", vipRequired: false, creatorId: creator }, false],
    [{ allowed: "true", reason: "vip_active", vipRequired: true, creatorId: creator }, false],
  ]) {
    const supabase = { rpc: async () => ({ data: payload, error: null }) };
    const api = instantiate("_lib/creatorVipPasses.ts", {
      "./creatorMoneyPurchaseAuthority": authority,
      "./creatorMonetization": { formatMonetizationCurrency: inert },
      "./iosAppStoreCommerce": iosCatalog,
      "./supabase": { supabase },
      "react-native": { Platform: { OS: "ios" } },
    });
    const result = await api.resolveCreatorVipVideoAccess(SOURCE_ID);
    assert.equal(result.allowed, allowed, JSON.stringify(payload));
    if (!allowed) assert.equal(result.vipRequired, true, JSON.stringify(payload));
  }
});

test("RevenueCat purchase mutations require the selected exact product and a complete exact transaction", async (t) => {
  const previousDev = globalThis.__DEV__;
  globalThis.__DEV__ = false;
  t.after(() => {
    if (previousDev === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = previousDev;
  });
  const sessionAuthority = {
    userId: VIEWER_ID,
    sessionGeneration: "session-exact-1",
    restoreOnly: false,
  };
  let purchaseResult;
  const purchases = {
    addCustomerInfoUpdateListener: () => undefined,
    configure: () => undefined,
    getAppUserID: async () => VIEWER_ID,
    purchaseStoreProduct: async () => purchaseResult,
    purchasePackage: async () => purchaseResult,
    setLogHandler: () => undefined,
    setLogLevel: () => undefined,
  };
  const revenuecat = instantiate("_lib/revenuecat.ts", {
    "expo-application": { applicationId: "com.chillywood.mobile" },
    "react-native": { Platform: { OS: "android" }, Linking: inert },
    "react-native-purchases": {
      __esModule: true,
      default: purchases,
      LOG_LEVEL: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },
      PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION", SUBSCRIPTION: "SUBSCRIPTION" },
    },
    "./accountSessionAuthority": {
      readCurrentAccountSessionAuthority: async () => sessionAuthority,
      sameAccountSessionAuthority: (left, right) => left === right,
    },
    "./entitlementAuthority": {
      withAuthorityReadDeadline: async (promise) => await promise,
    },
    "./logger": { debugLog: inert, reportRuntimeError: inert },
    "./runtimeConfig": {
      getRuntimeConfig: () => ({
        revenueCat: {
          androidPublicSdkKey: "goog_public_exact",
          androidDebugPublicSdkKey: "",
          iosPublicSdkKey: "",
          appStorePurchasesEnabled: false,
        },
      }),
    },
  });
  const product = {
    identifier: "cw_event_pass_sandbox_099",
    price: 0.99,
    priceString: "$0.99",
    title: "Event Pass",
    description: "Exact Event Pass",
  };
  const customerInfo = {
    entitlements: { active: {}, all: {} },
    activeSubscriptions: [],
    originalAppUserId: VIEWER_ID,
  };
  const exactResult = {
    productIdentifier: product.identifier,
    customerInfo,
    transaction: {
      transactionIdentifier: "transaction-exact-1",
      productIdentifier: product.identifier,
      purchaseDate: "2026-08-27T18:01:02.345Z",
      purchaseToken: "google-token-exact-1",
    },
  };
  purchaseResult = exactResult;
  assert.equal(
    (await revenuecat.purchaseRevenueCatStoreProduct(product, { authority: sessionAuthority })).productIdentifier,
    product.identifier,
  );

  for (const malformed of [
    { ...exactResult, productIdentifier: "cw_vip_pass_sandbox_499", transaction: { ...exactResult.transaction, productIdentifier: "cw_vip_pass_sandbox_499" } },
    { ...exactResult, transaction: { ...exactResult.transaction, productIdentifier: "cw_vip_pass_sandbox_499" } },
    { ...exactResult, transaction: { ...exactResult.transaction, transactionIdentifier: " transaction-exact-1" } },
    { ...exactResult, transaction: { ...exactResult.transaction, transactionIdentifier: "" } },
    { ...exactResult, transaction: { ...exactResult.transaction, purchaseDate: "1" } },
    { ...exactResult, transaction: { ...exactResult.transaction, purchaseDate: "not-a-date" } },
    { ...exactResult, transaction: { ...exactResult.transaction, purchaseToken: " token" } },
    { ...exactResult, transaction: { productIdentifier: product.identifier } },
    { ...exactResult, customerInfo: { ...customerInfo, originalAppUserId: "" } },
  ]) {
    purchaseResult = malformed;
    await assert.rejects(
      revenuecat.purchaseRevenueCatStoreProduct(product, { authority: sessionAuthority }),
      /malformed mutation result/u,
    );
  }
  purchaseResult = exactResult;
  await assert.rejects(
    revenuecat.purchaseRevenueCatStoreProduct(
      { ...product, identifier: ` ${product.identifier}` },
      { authority: sessionAuthority },
    ),
    /identity is malformed/u,
  );
});

test("SQL closure routes exact iOS source identity, validates slots, and keeps predecessors private", () => {
  const sql = readFileSync(
    "supabase/migrations/20260827236000_ios_creator_money_specialized_intent_routing_closure.sql",
    "utf8",
  );
  assert.match(sql, /'event_pass',v_offer\."creator_event_id",v_offer\."price_cents"/u);
  assert.match(sql, /'vip_pass',v_offer\."id",v_offer\."price_cents"/u);
  assert.match(sql, /'channel_subscription',v_offer\."id",v_offer\."price_cents"/u);
  assert.match(sql, /mapping\."metadata"->>'slot_number' in \(\s*'1','2','3','4','5','6','7','8'/u);
  assert.match(sql, /v_intent\."session_generation" is distinct from\s*v_session->>'sessionGeneration'/u);
  assert.match(sql, /creator_money_historical_purchase_identity_internal/u);
  assert.match(sql, /from public,anon,authenticated,service_role/u);
  assert.match(sql, /ios_creator_money_expected_environment_internal/u);
  assert.doesNotMatch(
    sql,
    /update\s+public\."platform_money_kill_switches"[\s\S]{0,300}\bset\b[\s\S]{0,200}"?state"?\s*=\s*'on'/iu,
  );
});
