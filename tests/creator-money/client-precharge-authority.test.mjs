import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const VIEWER_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const OFFER_ID = "44444444-4444-4444-8444-444444444444";
const INTENT_ID = "55555555-5555-4555-8555-555555555555";
const AUTHORITY_ID = "66666666-6666-4666-8666-666666666666";

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

const instantiate = (path, mocks) => {
  const module = { exports: {} };
  new Function("exports", "module", "require", compile(path))(
    module.exports,
    module,
    (id) => Object.hasOwn(mocks, id)
      ? mocks[id]
      : id === "./entitlementAuthority"
        ? { withAuthorityReadDeadline: async (operation) => await operation }
        : inert,
  );
  return module.exports;
};

const eventOffer = (overrides = {}) => ({
  id: OFFER_ID,
  creatorEventId: SOURCE_ID,
  creatorId: CREATOR_ID,
  title: "Exact event",
  description: null,
  eventType: "live_first",
  startsAt: "2099-01-01T00:00:00.000Z",
  endsAt: "2099-01-02T00:00:00.000Z",
  priceCents: 99,
  currency: "usd",
  capacityLimit: 100,
  passesSold: 1,
  status: "sandbox",
  provider: "revenuecat_google_play",
  providerProductKey: "event_pass_sandbox_099",
  providerProductId: "cw_event_pass_sandbox_099",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const vipOffer = (overrides = {}) => ({
  id: OFFER_ID,
  creatorId: CREATOR_ID,
  title: "Exact VIP",
  description: null,
  priceCents: 499,
  currency: "usd",
  passType: "one_time",
  status: "sandbox",
  provider: "revenuecat_google_play",
  providerProductKey: "vip_pass_sandbox_499",
  providerProductId: "cw_vip_pass_sandbox_499",
  vipCount: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const subscriptionOffer = (overrides = {}) => ({
  id: OFFER_ID,
  creatorId: CREATOR_ID,
  title: "Exact subscription",
  description: null,
  priceCents: 499,
  currency: "usd",
  interval: "monthly",
  status: "sandbox",
  provider: "revenuecat_google_play",
  providerProductKey: "channel_subscription_sandbox_monthly_499",
  providerProductId: "cw_channel_subscription_sandbox_monthly_499",
  providerEntitlementId: "creator_channel_subscription",
  subscriberCount: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const paidVideoAccess = {
  allowed: false,
  reason: "purchase_required",
  requiresPurchase: true,
  priceCents: 99,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_google_play",
  providerProductId: "cw_paid_content_access_sandbox_099",
  providerProductKey: "paid_content_access_sandbox_099",
  offerStatus: "sandbox",
};

const eventAccess = {
  allowed: false,
  reason: "event_pass_required",
  requiresPurchase: true,
  passId: null,
  priceCents: 99,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_google_play",
  providerProductId: "cw_event_pass_sandbox_099",
  providerProductKey: "event_pass_sandbox_099",
  offer: eventOffer(),
};

const vipAccess = {
  allowed: false,
  reason: "vip_required",
  requiresPurchase: true,
  vipPassId: null,
  priceCents: 499,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_google_play",
  providerProductId: "cw_vip_pass_sandbox_499",
  providerProductKey: "vip_pass_sandbox_499",
  offer: vipOffer(),
};

const subscriptionAccess = {
  allowed: false,
  reason: "subscription_required",
  requiresPurchase: true,
  subscriptionId: null,
  currentPeriodEnd: null,
  priceCents: 499,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_google_play",
  providerProductId: "cw_channel_subscription_sandbox_monthly_499",
  providerProductKey: "channel_subscription_sandbox_monthly_499",
  providerEntitlementId: "creator_channel_subscription",
  offer: subscriptionOffer(),
};

const safeIntent = ({
  providerProductId,
  sourceType,
  sourceId,
  creatorId = CREATOR_ID,
  provider = "revenuecat_google_play",
  environment = "sandbox",
  status = "pending",
  amountMinor,
  currency = "usd",
  userId = VIEWER_ID,
  extras = {},
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
  ...extras,
});

const loadPurchaseRuntime = ({
  path,
  resolverRpc,
  access,
  intentRpc,
  intent,
  subjectStable = true,
  deferResolver = false,
}) => {
  let productReads = 0;
  let purchaseCalls = 0;
  let intentCalls = 0;
  let releaseResolver = () => {};
  let markResolverStarted = () => {};
  const resolverGate = deferResolver
    ? new Promise((resolve) => { releaseResolver = resolve; })
    : Promise.resolve();
  const resolverStarted = new Promise((resolve) => { markResolverStarted = resolve; });
  const supabase = {
    rpc: async (name) => {
      if (name === resolverRpc) {
        markResolverStarted();
        await resolverGate;
        return { data: access, error: null };
      }
      if (name === intentRpc) {
        intentCalls += 1;
        return { data: intent, error: null };
      }
      return { data: null, error: new Error(`unexpected_rpc:${name}`) };
    },
  };
  const creatorMonetization = instantiate("_lib/creatorMonetization.ts", {
    "./supabase": { supabase },
  });
  const initiatingAuthority = {
    userId: VIEWER_ID,
    accountId: VIEWER_ID,
    sessionGeneration: "session-1",
    state: "ACTIVE",
    restoreOnly: false,
  };
  let currentAuthority = initiatingAuthority;
  const revenuecat = {
    purchaseRevenueCatPackage: async () => { purchaseCalls += 1; },
    purchaseRevenueCatStoreProduct: async () => { purchaseCalls += 1; },
    readRevenueCatNonSubscriptionProducts: async () => {
      productReads += 1;
      return [{ identifier: access.providerProductId }];
    },
    readRevenueCatOfferings: async () => { productReads += 1; return null; },
    readRevenueCatSubscriptionProducts: async () => {
      productReads += 1;
      return [{ identifier: access.providerProductId }];
    },
    restoreRevenueCatPurchases: async () => { purchaseCalls += 1; return {}; },
  };
  const api = instantiate(path, {
    "./analytics": { trackEvent: inert },
    "./creatorMoneyPurchaseAuthority": {
      captureCreatorMoneyPurchaseAuthority: () => currentAuthority,
      isCreatorMoneyPurchaseAuthorityCurrent: (expected) => !!expected
        && expected.userId === currentAuthority.userId
        && expected.accountId === currentAuthority.accountId
        && expected.sessionGeneration === currentAuthority.sessionGeneration
        && expected.restoreOnly === currentAuthority.restoreOnly,
      prepareCreatorMoneyPurchaseSubject: async (expected) => expected
        && expected.userId === currentAuthority.userId
        && expected.sessionGeneration === currentAuthority.sessionGeneration ? ({
        userId: VIEWER_ID,
        accessToken: "token-a",
        authority: initiatingAuthority,
      }) : null,
      revalidateCreatorMoneyPurchaseSubject: async () => subjectStable,
      invokeCreatorMoneyPurchaseSubjectRpc: async (_subject, name, args) => supabase.rpc(name, args),
      validateCreatorMoneyPurchaseIntent: (value, expected) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        for (const [key, expectedValue] of Object.entries(expected)) {
          if (value[key] !== expectedValue) return null;
        }
        return /^[0-9a-f-]{36}$/.test(String(value.id ?? ""))
          ? { id: value.id, providerProductId: value.providerProductId }
          : null;
      },
    },
    "./creatorMonetization": creatorMonetization,
    "./iosAppStoreCommerce": inert,
    "./paymentRailPolicy": { resolvePaymentRailPolicy: () => ({ allowed: true }) },
    "./revenuecat": revenuecat,
    "./supabase": { supabase },
    "react-native": { Platform: { OS: "android" } },
  });
  return {
    api,
    getIntentCalls: () => intentCalls,
    getProductReads: () => productReads,
    getPurchaseCalls: () => purchaseCalls,
    releaseResolver,
    waitForResolver: () => resolverStarted,
    switchAccount: () => {
      currentAuthority = {
        userId: SOURCE_ID,
        accountId: SOURCE_ID,
        sessionGeneration: "session-b",
        state: "ACTIVE",
        restoreOnly: false,
      };
    },
  };
};

test("malformed or wrong-product intent readbacks cannot reach RevenueCat across paid Video/Event/VIP/Channel", async () => {
  const cases = [
    {
      path: "_lib/creatorPaidVideos.ts",
      resolverRpc: "resolve_creator_content_access",
      access: paidVideoAccess,
      intentRpc: "create_money_purchase_intent",
      purchase: (api) => api.purchasePaidVideoAccess({
        videoId: SOURCE_ID,
        creatorId: CREATOR_ID,
        amountCents: 99,
        currency: "usd",
      }),
      validIntent: safeIntent({
        providerProductId: paidVideoAccess.providerProductId,
        sourceType: "paid_content",
        sourceId: SOURCE_ID,
        amountMinor: 99,
        extras: { alreadyPurchased: false },
      }),
    },
    {
      path: "_lib/paidCreatorEvents.ts",
      resolverRpc: "resolve_paid_creator_event_pass_access",
      access: eventAccess,
      intentRpc: "create_paid_creator_event_pass_purchase_intent",
      purchase: (api) => api.purchasePaidCreatorEventPass({ creatorEventId: SOURCE_ID, sourceSurface: "test" }),
      validIntent: safeIntent({
        providerProductId: eventAccess.providerProductId,
        sourceType: "event",
        sourceId: SOURCE_ID,
        amountMinor: 99,
        extras: { alreadyPurchased: false },
      }),
    },
    {
      path: "_lib/creatorVipPasses.ts",
      resolverRpc: "resolve_creator_vip_pass_access",
      access: vipAccess,
      intentRpc: "create_creator_vip_pass_purchase_intent",
      purchase: (api) => api.purchaseCreatorVipPass({ creatorId: CREATOR_ID, sourceSurface: "test" }),
      validIntent: safeIntent({
        providerProductId: vipAccess.providerProductId,
        sourceType: "vip_pass",
        sourceId: OFFER_ID,
        amountMinor: 499,
        extras: { alreadyPurchased: false },
      }),
    },
    {
      path: "_lib/channelSubscriptions.ts",
      resolverRpc: "resolve_creator_channel_subscription_access",
      access: subscriptionAccess,
      intentRpc: "create_creator_channel_subscription_purchase_intent",
      purchase: (api) => api.purchaseChannelSubscription({ creatorId: CREATOR_ID, sourceSurface: "test" }),
      validIntent: safeIntent({
        providerProductId: subscriptionAccess.providerProductId,
        sourceType: "channel_subscription",
        sourceId: OFFER_ID,
        amountMinor: 499,
        extras: { alreadySubscribed: false },
      }),
    },
  ];

  for (const item of cases) {
    for (const intent of [
      {},
      { ...item.validIntent, id: "not-a-uuid" },
      { ...item.validIntent, providerProductId: "wrong-provider-product" },
      { ...item.validIntent, userId: SOURCE_ID },
      { ...item.validIntent, sourceType: "wrong_source" },
      { ...item.validIntent, sourceId: AUTHORITY_ID },
      { ...item.validIntent, creatorId: SOURCE_ID },
      { ...item.validIntent, provider: "revenuecat_app_store" },
      { ...item.validIntent, environment: "production" },
      { ...item.validIntent, status: "consumed" },
      { ...item.validIntent, amountMinor: item.validIntent.amountMinor + 1 },
      { ...item.validIntent, currency: "eur" },
      ...(Object.hasOwn(item.validIntent, "alreadyPurchased")
        ? [{ id: INTENT_ID, providerProductId: item.validIntent.providerProductId }]
        : []),
      ...(Object.hasOwn(item.validIntent, "alreadySubscribed")
        ? [{ id: INTENT_ID, providerProductId: item.validIntent.providerProductId }]
        : []),
    ]) {
      const runtime = loadPurchaseRuntime({ ...item, intent });
      await item.purchase(runtime.api).catch(() => null);
      assert.equal(runtime.getIntentCalls(), 1, `${item.path} ${JSON.stringify(intent)}`);
      assert.equal(runtime.getProductReads(), 0, `${item.path} ${JSON.stringify(intent)}`);
      assert.equal(runtime.getPurchaseCalls(), 0, `${item.path} ${JSON.stringify(intent)}`);
    }

    const changedSession = loadPurchaseRuntime({ ...item, intent: item.validIntent, subjectStable: false });
    await item.purchase(changedSession.api).catch(() => null);
    assert.equal(changedSession.getIntentCalls(), 1, `${item.path} changed session intent`);
    assert.ok(changedSession.getProductReads() > 0, `${item.path} changed session product lookup`);
    assert.equal(changedSession.getPurchaseCalls(), 0, `${item.path} changed session purchase`);
  }
});

test("delayed creator purchase access cannot adopt account B before intent or provider work", async () => {
  const cases = [
    {
      path: "_lib/creatorPaidVideos.ts",
      resolverRpc: "resolve_creator_content_access",
      access: paidVideoAccess,
      intentRpc: "create_money_purchase_intent",
      purchase: (api) => api.purchasePaidVideoAccess({
        videoId: SOURCE_ID,
        creatorId: CREATOR_ID,
        amountCents: 99,
        currency: "usd",
      }),
    },
    {
      path: "_lib/paidCreatorEvents.ts",
      resolverRpc: "resolve_paid_creator_event_pass_access",
      access: eventAccess,
      intentRpc: "create_paid_creator_event_pass_purchase_intent",
      purchase: (api) => api.purchasePaidCreatorEventPass({ creatorEventId: SOURCE_ID, sourceSurface: "test" }),
    },
    {
      path: "_lib/creatorVipPasses.ts",
      resolverRpc: "resolve_creator_vip_pass_access",
      access: vipAccess,
      intentRpc: "create_creator_vip_pass_purchase_intent",
      purchase: (api) => api.purchaseCreatorVipPass({ creatorId: CREATOR_ID, sourceSurface: "test" }),
    },
    {
      path: "_lib/channelSubscriptions.ts",
      resolverRpc: "resolve_creator_channel_subscription_access",
      access: subscriptionAccess,
      intentRpc: "create_creator_channel_subscription_purchase_intent",
      purchase: (api) => api.purchaseChannelSubscription({ creatorId: CREATOR_ID, sourceSurface: "test" }),
    },
    {
      path: "_lib/paidWatchPartyTickets.ts",
      resolverRpc: "resolve_paid_watch_party_ticket_access",
      access: { ...eventAccess, reason: "ticket_required", partyId: SOURCE_ID },
      intentRpc: "create_paid_watch_party_ticket_purchase_intent",
      purchase: (api) => api.purchasePaidWatchPartyTicket({ partyId: SOURCE_ID, sourceSurface: "test" }),
    },
  ];

  for (const item of cases) {
    const runtime = loadPurchaseRuntime({
      ...item,
      intent: {},
      deferResolver: true,
    });
    const pending = item.purchase(runtime.api);
    await runtime.waitForResolver();
    runtime.switchAccount();
    runtime.releaseResolver();
    const result = await pending;
    assert.equal(result.ok, false, item.path);
    assert.equal(runtime.getIntentCalls(), 0, `${item.path} intent`);
    assert.equal(runtime.getProductReads(), 0, `${item.path} product`);
    assert.equal(runtime.getPurchaseCalls(), 0, `${item.path} provider`);
  }

  const restoreRuntime = loadPurchaseRuntime({
    path: "_lib/channelSubscriptions.ts",
    resolverRpc: "resolve_creator_channel_subscription_access",
    access: subscriptionAccess,
    intentRpc: "create_creator_channel_subscription_purchase_intent",
    intent: {},
    deferResolver: true,
  });
  const pendingRestore = restoreRuntime.api.restoreChannelSubscription(CREATOR_ID);
  await restoreRuntime.waitForResolver();
  restoreRuntime.switchAccount();
  restoreRuntime.releaseResolver();
  assert.equal((await pendingRestore).ok, false);
  assert.equal(restoreRuntime.getPurchaseCalls(), 0, "restore provider");

  const liveSeat = readFileSync("_lib/liveWatchPartyMoney.ts", "utf8");
  const capture = liveSeat.indexOf("const initiatingAuthority = captureCreatorMoneyPurchaseAuthority()");
  const entryRead = liveSeat.indexOf("const entryAccess = await readLiveWatchPartyMoneyAccess(input.partyId)");
  const prepare = liveSeat.indexOf("prepareCreatorMoneyPurchaseSubject(initiatingAuthority)");
  assert.ok(capture >= 0 && entryRead > capture && prepare > entryRead);
});

const iosSeatOffer = (providerProductId = "com.chillywood.watchparty.seat.tier1") => ({
  id: OFFER_ID,
  partyId: "PARTY-EXACT",
  creatorId: CREATOR_ID,
  hostId: CREATOR_ID,
  titleId: null,
  videoId: null,
  title: "Exact Seat",
  description: null,
  priceCents: 99,
  currency: "usd",
  seatLimit: 20,
  seatsSold: 1,
  startsAt: "2026-08-24T00:00:00.000Z",
  endsAt: "2099-01-01T00:00:00.000Z",
  status: "sandbox",
  provider: "revenuecat_app_store",
  providerProductKey: "watch_party_seat_pass_tier_1",
  providerProductId,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
});

const loadSeatRuntime = ({ providerProductId, intent, subjectStable = true, productAvailable = false }) => {
  let intentCalls = 0;
  let productReads = 0;
  let purchaseCalls = 0;
  const seatAuthority = {
    userId: VIEWER_ID,
    accountId: VIEWER_ID,
    sessionGeneration: "session-1",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const offer = iosSeatOffer(providerProductId);
  const access = {
    allowed: false,
    reason: "ticket_required",
    requiresPurchase: true,
    ticketId: null,
    priceCents: 99,
    currency: "usd",
    creatorId: CREATOR_ID,
    provider: "revenuecat_app_store",
    providerProductId,
    providerProductKey: offer.providerProductKey,
    offer,
  };
  const product = {
    stableKey: "watch_party_seat_pass_tier_1",
    concept: "seat_pass",
    productId: "com.chillywood.watchparty.seat.tier1",
    conceptTier: "tier1",
    productType: "consumable",
    referencePriceMinor: 99,
    referencePrice: "0.99",
  };
  const supabase = {
    rpc: async (name) => {
      if (name === "resolve_paid_watch_party_ticket_access") return { data: access, error: null };
      if (name === "create_ios_app_store_purchase_intent") {
        intentCalls += 1;
        return { data: intent, error: null };
      }
      return { data: null, error: new Error(`unexpected_rpc:${name}`) };
    },
  };
  const api = instantiate("_lib/paidWatchPartyTickets.ts", {
    "./analytics": { trackEvent: inert },
    "./creatorMoneyPurchaseAuthority": {
      captureCreatorMoneyPurchaseAuthority: () => seatAuthority,
      isCreatorMoneyPurchaseAuthorityCurrent: (expected) => expected === seatAuthority,
      prepareCreatorMoneyPurchaseSubject: async () => ({
        userId: VIEWER_ID,
        accessToken: "token-a",
        authority: seatAuthority,
      }),
      revalidateCreatorMoneyPurchaseSubject: async () => subjectStable,
      invokeCreatorMoneyPurchaseSubjectRpc: async (_subject, name, args) => supabase.rpc(name, args),
      validateCreatorMoneyPurchaseIntent: (value, expected) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        for (const [key, expectedValue] of Object.entries(expected)) {
          if (value[key] !== expectedValue) return null;
        }
        return /^[0-9a-f-]{36}$/.test(String(value.id ?? ""))
          ? { id: value.id, providerProductId: value.providerProductId }
          : null;
      },
    },
    "./creatorMonetization": { formatMonetizationCurrency: inert },
    "./iosAppStoreCommerce": {
      findIosStoreProductByProductId: (id) => id === product.productId ? product : null,
    },
    "./logger": { reportRuntimeError: inert },
    "./paymentRailPolicy": { resolvePaymentRailPolicy: () => ({ allowed: true, provider: "revenuecat_app_store" }) },
    "./revenuecat": {
      getRevenueCatProductionReadiness: () => ({ iosPublicKeyConfigured: true }),
      readRevenueCatCustomerInfo: inert,
      readRevenueCatNonSubscriptionProducts: async () => {
        productReads += 1;
        return productAvailable ? [{ identifier: product.productId }] : [];
      },
      purchaseRevenueCatStoreProduct: async () => { purchaseCalls += 1; },
    },
    "./runtimeConfig": { getRuntimeConfig: () => ({ revenueCat: { appStorePurchasesEnabled: true } }) },
    "./supabase": { supabase },
    "react-native": { Platform: { OS: "ios" } },
  });
  return {
    api,
    getIntentCalls: () => intentCalls,
    getProductReads: () => productReads,
    getPurchaseCalls: () => purchaseCalls,
  };
};

test("Seat Pass requires the exact offer SKU/tier and an exact iOS intent readback", async () => {
  const unknownOffer = loadSeatRuntime({ providerProductId: "unknown-seat-sku", intent: null });
  const unknownResult = await unknownOffer.api.purchasePaidWatchPartyTicket({ partyId: "PARTY-EXACT", sourceSurface: "test" });
  assert.equal(unknownResult.ok, false);
  assert.equal(unknownOffer.getIntentCalls(), 0);
  assert.equal(unknownOffer.getProductReads(), 0);
  assert.equal(unknownOffer.getPurchaseCalls(), 0);

  const exactSeatIntent = safeIntent({
    providerProductId: "com.chillywood.watchparty.seat.tier1",
    sourceType: "watch_party_live",
    sourceId: OFFER_ID,
    provider: "revenuecat_app_store",
    amountMinor: 99,
    extras: { alreadyPurchased: false },
  });
  for (const intent of [
    {},
    { ...exactSeatIntent, id: "not-a-uuid" },
    { ...exactSeatIntent, providerProductId: "wrong-seat-sku" },
    { ...exactSeatIntent, userId: SOURCE_ID },
    { ...exactSeatIntent, sourceId: AUTHORITY_ID },
    { ...exactSeatIntent, creatorId: SOURCE_ID },
    { ...exactSeatIntent, amountMinor: 199 },
    Object.fromEntries(Object.entries(exactSeatIntent).filter(([key]) => key !== "alreadyPurchased")),
  ]) {
    const runtime = loadSeatRuntime({
      providerProductId: "com.chillywood.watchparty.seat.tier1",
      intent,
    });
    await runtime.api.purchasePaidWatchPartyTicket({ partyId: "PARTY-EXACT", sourceSurface: "test" }).catch(() => null);
    assert.equal(runtime.getProductReads(), 0, JSON.stringify(intent));
    assert.equal(runtime.getPurchaseCalls(), 0, JSON.stringify(intent));
  }

  const changedSeatSession = loadSeatRuntime({
    providerProductId: "com.chillywood.watchparty.seat.tier1",
    intent: exactSeatIntent,
    subjectStable: false,
    productAvailable: true,
  });
  assert.equal((await changedSeatSession.api.purchasePaidWatchPartyTicket({
    partyId: "PARTY-EXACT",
    sourceSurface: "test",
  })).ok, false);
  assert.equal(changedSeatSession.getProductReads(), 1);
  assert.equal(changedSeatSession.getPurchaseCalls(), 0);
});

test("Tip status and checkout remain bound to exact creator, session, amount, and intent product", async () => {
  const exactTipStatus = {
    canTip: true,
    reason: "ready",
    status: "active",
    creatorId: CREATOR_ID,
    currency: "usd",
    suggestedAmountsCents: [100, 300],
    defaultAmountCents: 100,
    minAmountCents: 100,
    maxAmountCents: 999,
    providerEnvironment: "test",
    testMode: true,
    liveMoneyEnabled: false,
    policyCopy: "No access is granted.",
  };
  const normalizationSupabase = { rpc: inert };
  const normalizer = instantiate("_lib/creatorTips.ts", {
    "./supabase": { supabase: normalizationSupabase },
    "react-native": { Platform: { OS: "android" } },
  });
  assert.equal(normalizer.normalizePublicTipStatus(exactTipStatus, CREATOR_ID).canTip, true);
  assert.equal(normalizer.normalizePublicTipStatus(exactTipStatus, SOURCE_ID).canTip, false);
  assert.equal(normalizer.normalizePublicTipStatus({ ...exactTipStatus, liveMoneyEnabled: true }, CREATOR_ID).canTip, false);
  assert.equal(normalizer.normalizePublicTipStatus({ ...exactTipStatus, suggestedAmountsCents: [0] }, CREATOR_ID).canTip, false);
  assert.equal(normalizer.normalizePublicTipStatus({ ...exactTipStatus, maxAmountCents: 50001 }, CREATOR_ID).canTip, false);
  assert.equal(normalizer.normalizePublicTipStatus({ ...exactTipStatus, suggestedAmountsCents: [100, 200, 300, 400, 500, 600, 700] }, CREATOR_ID).canTip, false);

  const loadTipRuntime = ({ requestedUserId = VIEWER_ID, authUserId = VIEWER_ID, intent = {}, subjectStable = true }) => {
    let productReads = 0;
    let purchaseCalls = 0;
    let identitySyncs = 0;
    const supabase = {
      auth: { getUser: async () => ({ data: { user: authUserId ? { id: authUserId } : null }, error: null }) },
      rpc: async () => ({ data: intent, error: null }),
      functions: inert,
    };
    const api = instantiate("_lib/creatorTips.ts", {
      "./creatorMoneyPurchaseAuthority": {
        prepareCreatorMoneyPurchaseSubject: async () => {
          identitySyncs += 1;
          return authUserId ? {
            userId: authUserId,
            accessToken: "token-a",
            authority: { userId: authUserId, accountId: authUserId, sessionGeneration: "session-1", state: "ACTIVE", restoreOnly: false },
          } : null;
        },
        revalidateCreatorMoneyPurchaseSubject: async () => subjectStable,
        invokeCreatorMoneyPurchaseSubjectRpc: async (_subject, name, args) => supabase.rpc(name, args),
        validateCreatorMoneyPurchaseIntent: (value, expected) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          for (const [key, expectedValue] of Object.entries(expected)) {
            if (value[key] !== expectedValue) return null;
          }
          return /^[0-9a-f-]{36}$/.test(String(value.id ?? ""))
            ? { id: value.id, providerProductId: value.providerProductId }
            : null;
        },
      },
      "./iosAppStoreCommerce": inert,
      "./paymentRailPolicy": inert,
      "./revenuecat": {
        getRevenueCatProductionReadiness: inert,
        readRevenueCatNonSubscriptionProducts: async () => {
          productReads += 1;
          return [{ identifier: "cw_creator_tip_sandbox_099" }];
        },
        purchaseRevenueCatStoreProduct: async () => { purchaseCalls += 1; },
      },
      "./runtimeConfig": inert,
      "./supabase": { supabase },
      "react-native": { Platform: { OS: "android" } },
    });
    return {
      api,
      input: { creatorId: CREATOR_ID, userId: requestedUserId, amountCents: 99, currency: "usd" },
      getProductReads: () => productReads,
      getPurchaseCalls: () => purchaseCalls,
      getIdentitySyncs: () => identitySyncs,
    };
  };

  const wrongUser = loadTipRuntime({ requestedUserId: SOURCE_ID });
  assert.equal((await wrongUser.api.purchaseCreatorTipWithStore(wrongUser.input)).ok, false);
  assert.equal(wrongUser.getIdentitySyncs(), 1);
  assert.equal(wrongUser.getPurchaseCalls(), 0);

  const exactTipIntent = safeIntent({
    providerProductId: "cw_creator_tip_sandbox_099",
    sourceType: "creator_tip",
    sourceId: CREATOR_ID,
    amountMinor: 99,
  });
  for (const intent of [
    {},
    { ...exactTipIntent, id: "not-a-uuid" },
    { ...exactTipIntent, providerProductId: "wrong-tip-product" },
    { ...exactTipIntent, userId: SOURCE_ID },
    { ...exactTipIntent, sourceId: AUTHORITY_ID },
    { ...exactTipIntent, creatorId: SOURCE_ID },
    { ...exactTipIntent, amountMinor: 100 },
  ]) {
    const runtime = loadTipRuntime({ intent });
    assert.equal((await runtime.api.purchaseCreatorTipWithStore(runtime.input)).ok, false);
    assert.equal(runtime.getProductReads(), 0, JSON.stringify(intent));
    assert.equal(runtime.getPurchaseCalls(), 0, JSON.stringify(intent));
  }

  const changedTipSession = loadTipRuntime({ intent: exactTipIntent, subjectStable: false });
  assert.equal((await changedTipSession.api.purchaseCreatorTipWithStore(changedTipSession.input)).ok, false);
  assert.equal(changedTipSession.getProductReads(), 1);
  assert.equal(changedTipSession.getPurchaseCalls(), 0);

  const channelSource = readFileSync("app/channel/[userId].tsx", "utf8");
  assert.doesNotMatch(channelSource, /tipStatus\?\.canTip === true \|\| sandboxTesterActive/u);
  assert.match(channelSource, /const canRenderTip = viewerPurchaseMode && tipStatus\?\.canTip === true/u);
  const tipSheetSource = readFileSync("components/monetization/tip-sheet.tsx", "utf8");
  assert.match(tipSheetSource, /const canTipInSandbox = tipStatus\?\.canTip === true/u);
  assert.doesNotMatch(tipSheetSource, /const canTipInSandbox = sandboxTester \|\|/u);

  const subscriptionSource = readFileSync("_lib/channelSubscriptions.ts", "utf8");
  assert.doesNotMatch(subscriptionSource, /withoutBasePlan/u);
  assert.match(subscriptionSource, /return normalized \? \[normalized\] : \[\];/u);
});

test("shared creator-money purchase identity guard rejects RevenueCat and account-generation changes", async () => {
  const authority = (userId, sessionGeneration) => ({
    userId,
    accountId: userId,
    sessionGeneration,
    state: "ACTIVE",
    restoreOnly: false,
  });
  const loadGuard = ({ capturedAuthority, readbacks, identityUser = VIEWER_ID }) => {
    let readbackIndex = 0;
    return instantiate("_lib/creatorMoneyPurchaseAuthority.ts", {
      "./accountSessionAuthority": {
        getCurrentAccountSessionAuthoritySnapshot: () => capturedAuthority,
        parseAccountSessionAuthorityReadback: (value) => value,
        sameAccountSessionAuthority: (left, right) => !!left && !!right
          && left.userId === right.userId
          && left.accountId === right.accountId
          && left.sessionGeneration === right.sessionGeneration
          && left.restoreOnly === right.restoreOnly,
      },
      "./accountBoundSupabaseMutation": {
        captureAccountBoundSupabaseMutationSubject: async () => ({
          accessToken: "token-a",
          authority: capturedAuthority,
        }),
        invokeAccountBoundSupabaseMutationRpc: async () => ({
          data: readbacks[Math.min(readbackIndex++, readbacks.length - 1)] ?? null,
          error: null,
        }),
      },
      "./revenuecat": {
        syncRevenueCatCustomerIdentity: async (userId) => ({
          status: "identified",
          appUserId: identityUser,
          sourceUserId: userId,
          matchesSourceUser: identityUser === userId,
        }),
      },
    });
  };

  const exactGuard = loadGuard({
    capturedAuthority: authority(VIEWER_ID, "session-1"),
    readbacks: [authority(VIEWER_ID, "session-1")],
  });
  const subject = await exactGuard.prepareCreatorMoneyPurchaseSubject();
  assert.equal(subject.userId, VIEWER_ID);
  assert.equal(subject.accessToken, "token-a");

  const userChanged = loadGuard({
    capturedAuthority: authority(VIEWER_ID, "session-1"),
    readbacks: [authority(SOURCE_ID, "session-1")],
  });
  assert.equal(await userChanged.prepareCreatorMoneyPurchaseSubject(), null);

  const revenueCatChanged = loadGuard({
    capturedAuthority: authority(VIEWER_ID, "session-1"),
    readbacks: [authority(VIEWER_ID, "session-1")],
    identityUser: SOURCE_ID,
  });
  assert.equal(await revenueCatChanged.prepareCreatorMoneyPurchaseSubject(), null);

  const generationChanged = loadGuard({
    capturedAuthority: authority(VIEWER_ID, "session-2"),
    readbacks: [authority(VIEWER_ID, "session-2")],
  });
  assert.equal(await generationChanged.revalidateCreatorMoneyPurchaseSubject({
    userId: VIEWER_ID,
    accessToken: "token-a",
    authority: authority(VIEWER_ID, "session-1"),
  }), false);
});
