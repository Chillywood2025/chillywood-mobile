import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";
const AUTHORITY_ID = "44444444-4444-4444-8444-444444444444";
const PARTY_ID = "party-exact-1";
const closeout = readFileSync(
  "supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql",
  "utf8",
);

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
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : inert,
  );
  return module.exports;
};

const loadAccessModule = (path, payload, rpcError = null) => {
  const supabase = {
    rpc: async () => ({ data: payload, error: rpcError }),
  };
  const creatorMonetization = instantiate("_lib/creatorMonetization.ts", {
    "./supabase": { supabase },
  });
  return instantiate(path, {
    "./supabase": { supabase },
    "./creatorMonetization": creatorMonetization,
    "react-native": { Platform: { OS: "ios" } },
  });
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
  provider: "revenuecat_app_store",
  providerProductKey: "event_pass_sandbox_099",
  providerProductId: "com.chillywood.event.099",
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
  provider: "revenuecat_app_store",
  providerProductKey: "vip_pass_sandbox_499",
  providerProductId: "com.chillywood.vip.499",
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
  provider: "revenuecat_app_store",
  providerProductKey: "channel_subscription_sandbox_monthly_499",
  providerProductId: "com.chillywood.channel.monthly.499",
  providerEntitlementId: "creator_channel_subscription",
  subscriberCount: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const seatOffer = (overrides = {}) => ({
  id: OFFER_ID,
  partyId: PARTY_ID,
  creatorId: CREATOR_ID,
  hostId: SOURCE_ID,
  titleId: null,
  videoId: null,
  title: "Exact Seat Pass",
  description: null,
  priceCents: 99,
  currency: "usd",
  seatLimit: 10,
  seatsSold: 1,
  startsAt: null,
  endsAt: null,
  status: "sandbox",
  provider: "revenuecat_app_store",
  providerProductKey: "watch_party_live_ticket_sandbox_099",
  providerProductId: "com.chillywood.seat.099",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

const paidVideoPurchaseRequired = (overrides = {}) => ({
  allowed: false,
  reason: "purchase_required",
  requiresPurchase: true,
  priceCents: 499,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_app_store",
  providerProductId: "com.chillywood.paid-video.499",
  providerProductKey: "paid_content_access_sandbox_099",
  offerStatus: "sandbox",
  ...overrides,
});

const eventPurchaseRequired = (overrides = {}) => ({
  allowed: false,
  reason: "event_pass_required",
  requiresPurchase: true,
  passId: null,
  priceCents: 99,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_app_store",
  providerProductId: "com.chillywood.event.099",
  providerProductKey: "event_pass_sandbox_099",
  offer: eventOffer(),
  ...overrides,
});

const vipPurchaseRequired = (overrides = {}) => ({
  allowed: false,
  reason: "vip_required",
  requiresPurchase: true,
  vipPassId: null,
  priceCents: 499,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_app_store",
  providerProductId: "com.chillywood.vip.499",
  providerProductKey: "vip_pass_sandbox_499",
  offer: vipOffer(),
  ...overrides,
});

const subscriptionPurchaseRequired = (overrides = {}) => ({
  allowed: false,
  reason: "subscription_required",
  requiresPurchase: true,
  subscriptionId: null,
  currentPeriodEnd: null,
  priceCents: 499,
  currency: "usd",
  creatorId: CREATOR_ID,
  provider: "revenuecat_app_store",
  providerProductId: "com.chillywood.channel.monthly.499",
  providerProductKey: "channel_subscription_sandbox_monthly_499",
  providerEntitlementId: "creator_channel_subscription",
  offer: subscriptionOffer(),
  ...overrides,
});

test("unknown or structurally incomplete allowed responses fail closed across every client surface", async () => {
  const cases = [
    ["_lib/creatorPaidVideos.ts", "resolvePaidVideoAccess", SOURCE_ID],
    ["_lib/paidWatchPartyTickets.ts", "resolvePaidWatchPartyTicketAccess", PARTY_ID],
    ["_lib/paidCreatorEvents.ts", "resolvePaidCreatorEventPassAccess", SOURCE_ID],
    ["_lib/creatorVipPasses.ts", "resolveCreatorVipPassAccess", CREATOR_ID],
    ["_lib/channelSubscriptions.ts", "resolveChannelSubscriptionAccess", CREATOR_ID],
  ];
  for (const [path, resolver, id] of cases) {
    for (const payload of [
      { allowed: true },
      { allowed: true, reason: "provider_says_yes", requiresPurchase: false },
      { allowed: "true", reason: "creator_or_admin", requiresPurchase: false },
    ]) {
      const api = loadAccessModule(path, payload);
      const access = await api[resolver](id);
      assert.equal(access.allowed, false, `${path} ${JSON.stringify(payload)}`);
      assert.equal(access.requiresPurchase, false, path);
    }
  }
});

test("canonical paid-video owner/free/grant results allow, while exact purchase metadata alone opens checkout", async () => {
  for (const reason of ["owner", "free_content", "purchase_grant", "sandbox_grant", "active_grant"]) {
    const api = loadAccessModule("_lib/creatorPaidVideos.ts", {
      allowed: true,
      reason,
      requiresPurchase: false,
    });
    assert.equal((await api.resolvePaidVideoAccess(SOURCE_ID)).allowed, true, reason);
  }

  const exact = loadAccessModule("_lib/creatorPaidVideos.ts", paidVideoPurchaseRequired());
  const exactAccess = await exact.resolvePaidVideoAccess(SOURCE_ID);
  assert.equal(exactAccess.allowed, false);
  assert.equal(exactAccess.requiresPurchase, true);

  for (const payload of [
    paidVideoPurchaseRequired({ provider: "revenuecat" }),
    paidVideoPurchaseRequired({ offerStatus: "paused" }),
    paidVideoPurchaseRequired({ providerProductId: "" }),
    paidVideoPurchaseRequired({ priceCents: 0 }),
  ]) {
    const api = loadAccessModule("_lib/creatorPaidVideos.ts", payload);
    const access = await api.resolvePaidVideoAccess(SOURCE_ID);
    assert.equal(access.allowed, false);
    assert.equal(access.requiresPurchase, false);
  }
});

test("paid Event access requires exact free, owner, or source-bound pass authority", async () => {
  const validPayloads = [
    { allowed: true, reason: "free_event", requiresPurchase: false },
    { allowed: true, reason: "creator_or_admin", previewAuthority: true, requiresPurchase: false, offer: eventOffer() },
    {
      allowed: true,
      reason: "event_pass_confirmed",
      requiresPurchase: false,
      passId: AUTHORITY_ID,
      offer: eventOffer(),
    },
  ];
  for (const payload of validPayloads) {
    const api = loadAccessModule("_lib/paidCreatorEvents.ts", payload);
    assert.equal((await api.resolvePaidCreatorEventPassAccess(SOURCE_ID)).allowed, true);
  }

  for (const payload of [
    { ...validPayloads[2], passId: null },
    { ...validPayloads[2], offer: eventOffer({ creatorEventId: AUTHORITY_ID }) },
    { ...validPayloads[2], offer: eventOffer({ provider: "revenuecat" }) },
  ]) {
    const api = loadAccessModule("_lib/paidCreatorEvents.ts", payload);
    assert.equal((await api.resolvePaidCreatorEventPassAccess(SOURCE_ID)).allowed, false);
  }
});

test("VIP access requires exact creator-bound owner or pass identity", async () => {
  const validPayloads = [
    { allowed: true, reason: "creator_or_admin", previewAuthority: true, requiresPurchase: false, offer: vipOffer() },
    { allowed: true, reason: "vip_active", requiresPurchase: false, vipPassId: AUTHORITY_ID, offer: vipOffer() },
  ];
  for (const payload of validPayloads) {
    const api = loadAccessModule("_lib/creatorVipPasses.ts", payload);
    assert.equal((await api.resolveCreatorVipPassAccess(CREATOR_ID)).allowed, true);
  }

  for (const payload of [
    { ...validPayloads[1], vipPassId: null },
    { ...validPayloads[1], offer: vipOffer({ creatorId: SOURCE_ID }) },
    { ...validPayloads[1], offer: vipOffer({ passType: "subscription" }) },
  ]) {
    const api = loadAccessModule("_lib/creatorVipPasses.ts", payload);
    assert.equal((await api.resolveCreatorVipPassAccess(CREATOR_ID)).allowed, false);
  }
});

test("channel access requires an exact creator-bound finite current subscription", async () => {
  const creatorApi = loadAccessModule("_lib/channelSubscriptions.ts", {
    allowed: true,
    reason: "creator_or_admin",
    previewAuthority: true,
    requiresPurchase: false,
    offer: subscriptionOffer(),
  });
  assert.equal((await creatorApi.resolveChannelSubscriptionAccess(CREATOR_ID)).allowed, true);

  for (const reason of ["subscription_active", "subscription_cancel_pending"]) {
    const api = loadAccessModule("_lib/channelSubscriptions.ts", {
      allowed: true,
      reason,
      requiresPurchase: false,
      subscriptionId: AUTHORITY_ID,
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      offer: subscriptionOffer(),
    });
    assert.equal((await api.resolveChannelSubscriptionAccess(CREATOR_ID)).allowed, true, reason);
  }

  for (const payload of [
    {
      allowed: true,
      reason: "subscription_active",
      requiresPurchase: false,
      subscriptionId: null,
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      offer: subscriptionOffer(),
    },
    {
      allowed: true,
      reason: "subscription_active",
      requiresPurchase: false,
      subscriptionId: AUTHORITY_ID,
      currentPeriodEnd: "2020-01-01T00:00:00.000Z",
      offer: subscriptionOffer(),
    },
    {
      allowed: true,
      reason: "subscription_active",
      requiresPurchase: false,
      subscriptionId: AUTHORITY_ID,
      currentPeriodEnd: "2099-01-01T00:00:00.000Z",
      offer: subscriptionOffer({ creatorId: SOURCE_ID }),
    },
  ]) {
    const api = loadAccessModule("_lib/channelSubscriptions.ts", payload);
    assert.equal((await api.resolveChannelSubscriptionAccess(CREATOR_ID)).allowed, false);
  }
});

test("creator/admin preview reasons match the final SQL contract and never impersonate buyer proof", async () => {
  const cases = [
    ["_lib/paidWatchPartyTickets.ts", "resolvePaidWatchPartyTicketAccess", PARTY_ID, seatOffer(), "ticketId"],
    ["_lib/paidCreatorEvents.ts", "resolvePaidCreatorEventPassAccess", SOURCE_ID, eventOffer(), "passId"],
    ["_lib/creatorVipPasses.ts", "resolveCreatorVipPassAccess", CREATOR_ID, vipOffer(), "vipPassId"],
    ["_lib/channelSubscriptions.ts", "resolveChannelSubscriptionAccess", CREATOR_ID, subscriptionOffer(), "subscriptionId"],
  ];
  for (const [path, resolver, id, offer, authorityIdKey] of cases) {
    const canonicalReason = path === "_lib/paidWatchPartyTickets.ts" ? "host_or_admin" : "creator_or_admin";
    for (const reason of [canonicalReason]) {
      const exactApi = loadAccessModule(path, {
        allowed: true,
        reason,
        previewAuthority: true,
        requiresPurchase: false,
        [authorityIdKey]: null,
        ...(authorityIdKey === "subscriptionId" ? { currentPeriodEnd: null } : {}),
        offer,
      });
      const exact = await exactApi[resolver](id);
      assert.equal(exact.allowed, true, `${path} ${reason}`);
      assert.equal(exact.requiresPurchase, false, `${path} ${reason}`);
      assert.equal(exact[authorityIdKey], null, `${path} ${reason}`);

      for (const malformed of [
        { previewAuthority: false },
        { previewAuthority: undefined },
        { previewAuthority: true, [authorityIdKey]: AUTHORITY_ID },
      ]) {
        const malformedApi = loadAccessModule(path, {
          allowed: true,
          reason,
          requiresPurchase: false,
          ...(authorityIdKey === "subscriptionId" ? { currentPeriodEnd: null } : {}),
          offer,
          ...malformed,
        });
        const denied = await malformedApi[resolver](id);
        assert.equal(denied.allowed, false, `${path} ${reason} malformed`);
        assert.equal(denied.requiresPurchase, false, `${path} ${reason} malformed`);
      }
    }

    for (const legacyReason of ["creator_preview", "admin_preview", canonicalReason === "host_or_admin" ? "creator_or_admin" : "host_or_admin"]) {
      const legacyApi = loadAccessModule(path, {
        allowed: true,
        reason: legacyReason,
        previewAuthority: true,
        requiresPurchase: false,
        offer,
      });
      assert.equal((await legacyApi[resolver](id)).allowed, false, `${path} ${legacyReason}`);
    }
  }

  const finalResolvers = [
    ["resolve_paid_watch_party_ticket_access", "host_or_admin"],
    ["resolve_paid_creator_event_pass_access", "creator_or_admin"],
    ["resolve_creator_vip_pass_access", "creator_or_admin"],
    ["resolve_creator_channel_subscription_access", "creator_or_admin"],
  ];
  for (const [resolver, reason] of finalResolvers) {
    const start = closeout.lastIndexOf(`create or replace function public."${resolver}"`);
    const end = closeout.indexOf("\n$$;", start);
    assert.ok(start >= 0 && end > start, resolver);
    const sql = closeout.slice(start, end);
    assert.match(sql, new RegExp(`'reason','${reason}'[\\s\\S]+'previewAuthority',true`, "u"), resolver);
  }
});

test("checkout eligibility requires exact matching offer tuples on every paid surface", async () => {
  const cases = [
    ["_lib/paidCreatorEvents.ts", "resolvePaidCreatorEventPassAccess", SOURCE_ID, eventPurchaseRequired()],
    ["_lib/creatorVipPasses.ts", "resolveCreatorVipPassAccess", CREATOR_ID, vipPurchaseRequired()],
    ["_lib/channelSubscriptions.ts", "resolveChannelSubscriptionAccess", CREATOR_ID, subscriptionPurchaseRequired()],
  ];
  for (const [path, resolver, id, payload] of cases) {
    const exactApi = loadAccessModule(path, payload);
    const exact = await exactApi[resolver](id);
    assert.equal(exact.allowed, false, path);
    assert.equal(exact.requiresPurchase, true, path);

    for (const malformed of [
      { ...payload, creatorId: SOURCE_ID },
      { ...payload, priceCents: 1 },
      { ...payload, provider: "revenuecat" },
      { ...payload, providerProductId: "" },
    ]) {
      const malformedApi = loadAccessModule(path, malformed);
      const access = await malformedApi[resolver](id);
      assert.equal(access.allowed, false, path);
      assert.equal(access.requiresPurchase, false, path);
    }
  }
});

test("offer lifecycle status cannot turn a paused, sold-out, or blocked offer into new checkout authority", async () => {
  const checkoutCases = [
    [
      "_lib/paidCreatorEvents.ts",
      "resolvePaidCreatorEventPassAccess",
      SOURCE_ID,
      eventPurchaseRequired,
      eventOffer,
      ["paused", "sold_out", "blocked"],
    ],
    [
      "_lib/creatorVipPasses.ts",
      "resolveCreatorVipPassAccess",
      CREATOR_ID,
      vipPurchaseRequired,
      vipOffer,
      ["paused", "blocked"],
    ],
    [
      "_lib/channelSubscriptions.ts",
      "resolveChannelSubscriptionAccess",
      CREATOR_ID,
      subscriptionPurchaseRequired,
      subscriptionOffer,
      ["paused", "blocked"],
    ],
  ];
  for (const [path, resolver, id, purchasePayload, offerPayload, statuses] of checkoutCases) {
    for (const status of statuses) {
      const api = loadAccessModule(path, purchasePayload({ offer: offerPayload({ status }) }));
      const access = await api[resolver](id);
      assert.equal(access.allowed, false, `${path} ${status}`);
      assert.equal(access.requiresPurchase, false, `${path} ${status}`);
    }
  }

  const retainedCases = [
    [
      "_lib/paidCreatorEvents.ts",
      "resolvePaidCreatorEventPassAccess",
      SOURCE_ID,
      (status) => ({
        allowed: true,
        reason: "event_pass_confirmed",
        requiresPurchase: false,
        passId: AUTHORITY_ID,
        offer: eventOffer({ status }),
      }),
      ["paused", "sold_out"],
    ],
    [
      "_lib/creatorVipPasses.ts",
      "resolveCreatorVipPassAccess",
      CREATOR_ID,
      (status) => ({
        allowed: true,
        reason: "vip_active",
        requiresPurchase: false,
        vipPassId: AUTHORITY_ID,
        offer: vipOffer({ status }),
      }),
      ["paused"],
    ],
    [
      "_lib/channelSubscriptions.ts",
      "resolveChannelSubscriptionAccess",
      CREATOR_ID,
      (status) => ({
        allowed: true,
        reason: "subscription_active",
        requiresPurchase: false,
        subscriptionId: AUTHORITY_ID,
        currentPeriodEnd: "2099-01-01T00:00:00.000Z",
        offer: subscriptionOffer({ status }),
      }),
      ["paused"],
    ],
  ];
  for (const [path, resolver, id, payload, statuses] of retainedCases) {
    for (const status of statuses) {
      const api = loadAccessModule(path, payload(status));
      assert.equal((await api[resolver](id)).allowed, true, `${path} retained ${status}`);
    }
    const blockedApi = loadAccessModule(path, payload("blocked"));
    const blocked = await blockedApi[resolver](id);
    assert.equal(blocked.allowed, false, `${path} blocked`);
    assert.equal(blocked.requiresPurchase, false, `${path} blocked`);
  }
});

test("RPC errors never render access or checkout eligibility", async () => {
  const cases = [
    ["_lib/creatorPaidVideos.ts", "resolvePaidVideoAccess", SOURCE_ID],
    ["_lib/paidCreatorEvents.ts", "resolvePaidCreatorEventPassAccess", SOURCE_ID],
    ["_lib/creatorVipPasses.ts", "resolveCreatorVipPassAccess", CREATOR_ID],
    ["_lib/channelSubscriptions.ts", "resolveChannelSubscriptionAccess", CREATOR_ID],
  ];
  for (const [path, resolver, id] of cases) {
    const api = loadAccessModule(path, null, new Error("rpc_timeout"));
    const access = await api[resolver](id);
    assert.equal(access.allowed, false, path);
    assert.equal(access.requiresPurchase, false, path);
  }

  const paidVideoSource = readFileSync("_lib/creatorPaidVideos.ts", "utf8");
  assert.match(paidVideoSource, /if \(!access\.requiresPurchase\) \{\s+return \{ ok: false/u);
});
