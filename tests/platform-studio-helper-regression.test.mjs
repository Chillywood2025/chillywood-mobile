import assert from "node:assert/strict";
import test from "node:test";
import { deferred, loadStudioFocusCallback, loadStudioFunctions } from "./helpers/studio-source-harness.mjs";

const text = (value) => String(value ?? "").trim();

function profileHarness() {
  let owner = "creator-a";
  let generation = "session-1";
  let response = { error: null };
  const writes = [], cache = [], snapshots = [];
  const context = {
    getCurrentAccountSessionAuthoritySnapshot: () => ({ userId: owner, accountId: owner, state: "ACTIVE", restoreOnly: false, sessionGeneration: generation }),
    sameAccountSessionAuthority: loadStudioFunctions("_lib/accountSessionAuthority.ts", ["sameAccountSessionAuthority"], {}).sameAccountSessionAuthority,
    normalizeUserProfile: (profile) => profile,
    toUserProfileUpsertRow: (userId, profile) => ({ user_id: userId, ...profile }),
    logChatProfile() {}, USER_PROFILES_TABLE: "user_profiles", USER_PROFILE_KEY: "profile",
    writeAccountValue: async (...args) => cache.push(args),
    refreshSignedInIdentitySnapshots: async (...args) => snapshots.push(args),
    supabase: { from: () => ({ upsert: async (payload) => { writes.push(payload); return await response; } }) },
  };
  return {
    api: loadStudioFunctions("_lib/userData.ts", ["captureUserDataAccountBinding", "getBoundUserId", "userDataAccountBindingIsCurrent", "assertUserDataAccountBindingIsCurrent", "syncUserProfileToRemote", "saveUserProfileRemote"], context),
    writes, cache, snapshots, setOwner(value) { owner = value; }, setResponse(value) { response = value; },
    setGeneration(value) { generation = value; },
  };
}

test("Studio profile save needs remote acknowledgement; unchanged retry really retries", async () => {
  const h = profileHarness(), profile = { username: "creator", displayName: "Edited" };
  h.setResponse({ error: { message: "RLS/network denied" } });
  await assert.rejects(h.api.saveUserProfileRemote(profile, "creator-a"), /could not be saved/);
  assert.equal(h.cache.length, 0);
  assert.equal(h.snapshots.length, 0);
  h.setResponse({ error: null });
  await h.api.saveUserProfileRemote(profile, "creator-a");
  assert.equal(h.writes.length, 2);
  assert.equal(h.cache.length, 1);
  assert.equal(h.snapshots.length, 1);
  assert.equal(h.writes[1].user_id, "creator-a");
});

test("Studio rejects stale initiating owner before remote IO and account changes before acknowledgement", async () => {
  const h = profileHarness();
  h.setOwner("creator-b");
  await assert.rejects(h.api.saveUserProfileRemote({}, "creator-a"), /Account changed/);
  assert.equal(h.writes.length, 0);
  h.setOwner("creator-a");
  const response = deferred(); h.setResponse(response.promise);
  const operation = h.api.saveUserProfileRemote({}, "creator-a");
  assert.equal(h.writes.length, 1);
  h.setOwner("creator-b"); response.resolve({ error: null });
  await assert.rejects(operation, /Account changed/);
  assert.equal(h.cache.length, 0);
  assert.equal(h.snapshots.length, 0);
  h.setOwner("creator-a");
  const next = deferred(); h.setResponse(next.promise);
  const sameUserNewSession = h.api.saveUserProfileRemote({}, "creator-a");
  h.setGeneration("session-2"); next.resolve({ error: null });
  await assert.rejects(sameUserNewSession, /Account changed/);
  assert.equal(h.cache.length, 0, "same-user new session cannot acknowledge an old save");
});

test("Brand draft saves omit publication metadata even for a previously published profile", async () => {
  const payloads = [];
  const api = loadStudioFunctions("_lib/platformBranding.ts", ["toProfileUpsert", "savePlatformBrandProfileDraft"], {
    toText: text, parseProfile: (row) => row, PLATFORM_BRAND_PROFILE_SELECT: "*",
    supabase: { from: () => ({ upsert: (payload) => {
      payloads.push(payload);
      return { select: () => ({ returns: () => ({ single: async () => ({
        data: { ...payload, published_at: "server-owned-existing-time" }, error: null,
      }) }) }) };
    } }) },
  });
  for (const publishedAt of ["2099-01-01T00:00:00Z", "server-owned-existing-time", null, undefined]) {
    const saved = await api.savePlatformBrandProfileDraft("creator", { accentColor: "#123456", publishedAt });
    assert.equal(saved.published_at, "server-owned-existing-time");
    assert.equal(Object.hasOwn(payloads.at(-1), "published_at"), false);
    assert.equal(payloads.at(-1).accent_color, "#123456");
  }
});

test("Brand publish is one owner-bound RPC, removes forged timestamps and rejects wrong-owner acknowledgements", async () => {
  const calls = []; let response = { data: { owner_user_id: "creator", published_at: "server-time" }, error: null };
  const api = loadStudioFunctions("_lib/platformBranding.ts", ["toProfileUpsert", "publishPlatformBrandProfile"], {
    toText: text, parseProfile: (row) => row,
    supabase: { from() { assert.fail("Publication must not perform separate draft or asset writes"); } },
    runCurrentAccountBoundSupabaseMutationRpc: async (...args) => { calls.push(args); return response; },
  });
  await api.publishPlatformBrandProfile("creator", { publishedAt: "forged", accentColor: "#123456" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "publish_platform_brand_profile");
  assert.equal(calls[0][2], "creator");
  assert.equal(calls[0][1].p_profile.owner_user_id, "creator");
  assert.equal(Object.hasOwn(calls[0][1].p_profile, "published_at"), false);
  assert.equal(Object.hasOwn(calls[0][1].p_profile, "updated_at"), false);
  response = { data: { owner_user_id: "someone-else", published_at: "server-time" }, error: null };
  await assert.rejects(api.publishPlatformBrandProfile("creator", {}), /could not be published/);
  response = { data: null, error: { message: "brand_publish_asset_not_ready" } };
  await assert.rejects(api.publishPlatformBrandProfile("creator", {}), /public Platform has not changed/);
});

test("Owner Content query pages, filters and sorts in SQL, safely quoting search text", async () => {
  const calls = []; let result = { data: [], error: null };
  const query = {};
  for (const method of ["select", "eq", "order", "range", "or"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.returns = async () => result;
  const api = loadStudioFunctions("_lib/creatorVideos.ts", ["readCreatorVideos"], {
    toText: text, CREATOR_VIDEO_SELECT: "*", supabase: { from: () => query },
    parseCreatorVideo: (row) => row, attachRenditionStatuses: (rows) => rows,
  });
  const search = 'x,y).visibility.eq.public%_\\';
  await api.readCreatorVideos("owner", { includeDrafts: true, offset: 120, limit: 40, visibility: "draft", sort: "oldest", searchQuery: search, throwOnUnavailable: true });
  assert.ok(calls.some(([name, column, value]) => name === "eq" && column === "owner_id" && value === "owner"));
  assert.ok(calls.some(([name, column, value]) => name === "eq" && column === "visibility" && value === "draft"));
  assert.deepEqual(Array.from(calls.find(([name]) => name === "range").slice(1)), [120, 159]);
  const orders = calls.filter(([name]) => name === "order");
  assert.deepEqual(orders.map(([, column]) => column), ["created_at", "id"]);
  assert.ok(orders.every(([, , options]) => options.ascending === true));
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  assert.equal(calls.find(([name]) => name === "or")[1], `title.ilike.${JSON.stringify(pattern)},description.ilike.${JSON.stringify(pattern)}`);
  result = { data: null, error: { message: "offline" } };
  await assert.rejects(api.readCreatorVideos("owner", { includeDrafts: true, throwOnUnavailable: true }), /could not be loaded/);
  assert.equal((await api.readCreatorVideos("owner", { includeDrafts: true })).length, 0);
});

test("Clip metadata distinguishes genuinely absent rows from failed reads", async () => {
  let result = { data: null, error: null };
  const query = {};
  for (const method of ["select", "eq", "maybeSingle"]) query[method] = () => query;
  query.returns = async () => result;
  const api = loadStudioFunctions("_lib/clipStudio.ts", ["readClipStudioEdit"], {
    toText: text, CLIP_STUDIO_EDIT_SELECT: "*", supabase: { from: () => query },
  });
  assert.equal(await api.readClipStudioEdit("video", { throwOnUnavailable: true }), null);
  result = { data: null, error: new Error("offline") };
  await assert.rejects(api.readClipStudioEdit("video", { throwOnUnavailable: true }), /./);
  assert.equal(await api.readClipStudioEdit("video"), null);
});

test("Public count helper reads aggregate only, preserving denied/unavailable versus zero", async () => {
  let result = { data: 23, error: null }; const calls = [];
  const api = loadStudioFunctions("_lib/channelAudience.ts", ["readPublicChannelAudienceState"], {
    readAudienceActorContext: async () => ({ channelUserId: "creator", viewerUserId: null }),
    supabase: {
      from() { assert.fail("Public follower counts must not read a roster"); },
      rpc: async (...args) => { calls.push(args); return result; },
    },
  });
  assert.equal((await api.readPublicChannelAudienceState("creator")).followerCount, 23);
  assert.equal(calls[0][0], "read_public_channel_follower_count");
  assert.equal(calls[0][1].p_channel_user_id, "creator");
  for (const data of [null, -1, "invalid", 1.5]) {
    result = { data, error: null };
    assert.equal((await api.readPublicChannelAudienceState("creator")).followerCount, null);
  }
  result = { data: 0, error: null };
  assert.equal((await api.readPublicChannelAudienceState("creator")).followerCount, 0);
});

test("All existing theme controls have visible, bounded presentation values", () => {
  const api = loadStudioFunctions("_lib/platformPresentation.ts", ["THEMES", "resolvePlatformPresentation"], {});
  const defaultView = api.resolvePlatformPresentation();
  const presets = ["city_night", "studio_red", "clean_dark", "spotlight", "classic"].map((themePreset) => api.resolvePlatformPresentation({ themePreset }));
  assert.equal(new Set(presets.map((value) => value.backgroundColor)).size, 5);
  assert.equal(defaultView.backgroundColor, "#07080D");
  assert.equal(api.resolvePlatformPresentation({ accentColor: "#123456", blurStrength: 2 }).accentColor, "#123456");
  assert.equal(api.resolvePlatformPresentation({ blurStrength: 2 }).blurRadius, 8);
  assert.equal(api.resolvePlatformPresentation({ blurStrength: 0.5 }).blurRadius, 4);
  assert.equal(api.resolvePlatformPresentation({ blurStrength: -1 }).blurRadius, 0);
  assert.equal(api.resolvePlatformPresentation({ accentColor: "red", blurStrength: NaN }).accentColor, "#DC143C");
});

test("Strict paid settings read refuses errors or malformed lists, and saves require a real receipt", async () => {
  let response = { data: [], error: null };
  const api = loadStudioFunctions("_lib/creatorPaidVideos.ts", ["listMyPaidVideoOffers", "savePaidVideoOffer"], {
    toText: text, paidVideoClient: { rpc: async () => response },
    parseJsonArray: (data, parser) => Array.isArray(data) ? data.map(parser).filter(Boolean) : [],
    parseOffer: (row) => row?.videoId ? row : null,
    runCurrentAccountBoundSupabaseMutationRpc: async () => response,
  });
  assert.equal((await api.listMyPaidVideoOffers({ throwOnUnavailable: true })).length, 0);
  for (const data of [null, {}, [null], [{}]]) {
    response = { data, error: null };
    await assert.rejects(api.listMyPaidVideoOffers({ throwOnUnavailable: true }), /could not be loaded/);
  }
  response = { data: [], error: new Error("offline") };
  await assert.rejects(api.listMyPaidVideoOffers({ throwOnUnavailable: true }), /could not be loaded/);
  assert.equal((await api.listMyPaidVideoOffers()).length, 0);
  const input = { videoId: "video", isPaid: true, priceCents: 99 };
  for (const data of [null, {}, [], { status: "saved" }, { status: "unknown" }]) {
    response = { data, error: null };
    await assert.rejects(api.savePaidVideoOffer(input), /could not be saved/);
  }
  response = { data: { status: "blocked", reason: "provider_not_ready" }, error: null };
  assert.equal((await api.savePaidVideoOffer(input)).status, "blocked");
  response = { data: { status: "saved", id: "price-row" }, error: null };
  assert.equal((await api.savePaidVideoOffer(input)).status, "saved");
});

test("Studio event and reminder failures propagate instead of claiming empty analytics", async () => {
  let response = { data: null, error: new Error("unavailable") };
  const query = {};
  for (const method of ["select", "eq", "neq", "order", "in"]) query[method] = () => query;
  query.returns = async () => response;
  const eventContext = {
    supabase: { from: () => query }, CREATOR_EVENTS_TABLE: "creator_events", CREATOR_EVENT_SELECT: "*",
    parseCreatorEventRow: (row) => row, isDefined: Boolean, buildCreatorEventSummary: (row) => row,
  };
  const events = loadStudioFunctions("_lib/liveEvents.ts", ["readCreatorEventSummaries", "readPublicEventSummaries"], eventContext);
  for (const method of Object.values(events)) {
    await assert.rejects(method("owner", { throwOnUnavailable: true }), /could not be loaded/);
    assert.equal((await method("owner")).length, 0);
  }
  let eventsFail = true;
  const reminders = loadStudioFunctions("_lib/notifications.ts", ["readEventReminderRowsForEvents", "readCreatorEventReminderSummaries"], {
    ...eventContext, normalizeText: text, EVENT_REMINDERS_TABLE: "event_reminders", parseEventReminderRow: (row) => row,
    readCreatorEventSummaries: async (owner, options) => {
      assert.equal(options.throwOnUnavailable, true);
      if (eventsFail) return events.readCreatorEventSummaries(owner, options);
      return [{ id: "event" }];
    },
  });
  await assert.rejects(reminders.readCreatorEventReminderSummaries("owner", { throwOnUnavailable: true }), /Creator events/);
  eventsFail = false;
  await assert.rejects(reminders.readCreatorEventReminderSummaries("owner", { throwOnUnavailable: true }), /Event reminders/);
  response = { data: [], error: null };
  assert.equal((await reminders.readCreatorEventReminderSummaries("owner", { throwOnUnavailable: true }))[0].totalReminderCount, 0);
});

test("Audience management capability matches owner/operator SQL roles, not scoped moderator permissions", async () => {
  let roles = [], protectedTarget = false;
  const api = loadStudioFunctions("_lib/channelAudience.ts", ["readAudienceActorContext"], {
    normalizeText: text, supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "viewer" } } } }) } },
    readMyPlatformRoleMemberships: async () => roles,
    hasPlatformRoleMembership: (memberships, allowed) => memberships.some((role) => allowed.includes(role)),
    hasPlatformStaffPermission: () => true,
    isProtectedPlatformOwnerTarget: async () => protectedTarget,
  });
  roles = ["moderator"];
  assert.equal((await api.readAudienceActorContext("other")).canOperateAcrossChannels, false);
  for (const role of ["owner", "operator"]) {
    roles = [role];
    assert.equal((await api.readAudienceActorContext("other")).canOperateAcrossChannels, true);
  }
  protectedTarget = true;
  assert.equal((await api.readAudienceActorContext("other")).canOperateAcrossChannels, false);
  protectedTarget = null;
  assert.equal((await api.readAudienceActorContext("other")).canOperateAcrossChannels, false);
});

test("Public route resolves Platform access before minimal identity and never requires private Profile", async () => {
  let access = { allowed: true }, identityCalls = 0, state = "";
  const writes = [];
  const context = {
    active: true, routeUserId: "creator", viewerUserId: "viewer", user: { email: "" }, showDraftBranding: false, showOwnerControls: false,
    getOfficialPlatformAccount: () => null,
    resolvePlatformVisibilityAccess: async () => access,
    readUserProfileByUserId: () => assert.fail("Private Profile must not gate Platform identity"),
    readPublicPlatformIdentity: async () => { identityCalls++; return { displayName: "Platform" }; },
    buildUserChannelProfile: ({ profile }) => profile,
    readPublicChannelAudienceState: async () => ({ isViewerBlocked: false }),
    readPublicPlatformBranding: async (_id, options) => { assert.equal(options.throwOnUnavailable, true); return null; },
    readCreatorVideos: async (_id, options) => { assert.equal(options.throwOnUnavailable, true); return []; },
    readPublicEventSummaries: async (_id, options) => { assert.equal(options.throwOnUnavailable, true); return []; },
    readCreatorMiniPlatformCommerceSurface: async () => null, readCreatorTipPublicStatus: async () => null,
    resolveChannelSubscriptionAccess: async () => null, resolveCreatorVipPassAccess: async () => null,
    readCurrentPublicPartyRoomOffer: async () => null, resolveSandboxMonetizationTester: async () => false,
    setLoadState: (value) => { state = value; },
  };
  for (const name of ["Channel", "ChannelProfile", "PlatformAccessResolution", "AudienceState", "Videos", "Events", "CommerceSurface", "TipStatus", "SandboxTesterActive", "SubscriptionAccess", "SubscriptionNotice", "VipAccess", "VipNotice", "PaidVideoAccessById", "WatchPartyTicketOffer", "PlatformBranding"]) {
    context[`set${name}`] = (value) => writes.push([name, value]);
  }
  const api = loadStudioFunctions("app/channel/[userId].tsx", ["loadChannel"], context);
  await api.loadChannel();
  assert.equal(state, "ready"); assert.equal(identityCalls, 1);
  access = { allowed: false, isBlocked: true };
  await api.loadChannel();
  assert.equal(state, "blocked"); assert.equal(identityCalls, 1);
  access = { allowed: true };
  context.readPublicPlatformIdentity = async () => { throw new Error("read failed"); };
  await assert.rejects(api.loadChannel(), /read failed/);
  assert.notEqual(state, "ready");

  // Execute the exact registered focus callback: blur cancels old reads, and
  // returning from Studio reads the current published identity again.
  const pending = deferred(); let read = 0;
  context.readPublicPlatformIdentity = async () => ++read === 1 ? pending.promise : { displayName: "New published name" };
  Object.assign(context, { isOwner: false, reloadKey: 0, sessionLoading: false });
  const focus = loadStudioFocusCallback("app/channel/[userId].tsx", context);
  const blur = focus();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  blur();
  const nextBlur = focus();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(state, "ready");
  assert.equal(writes.filter(([name]) => name === "Channel").at(-1)[1].displayName, "New published name");
  pending.resolve({ displayName: "Stale before Studio" });
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(writes.filter(([name]) => name === "Channel").at(-1)[1].displayName, "New published name");
  nextBlur();
});

test("Brand Studio keeps older selected media visible beyond its recent50 list and exposes lookup failures", async () => {
  const recent = Array.from({ length: 50 }, (_, id) => ({ id: `recent-${id}` }));
  let selectedError = null;
  const contexts = [];
  const api = loadStudioFunctions("_lib/platformBranding.ts", ["readPlatformBrandStudio", "getProfileSelectedAssetIds", "createBundle"], {
    toText: text, PLATFORM_BRAND_PROFILE_SELECT: "*", PLATFORM_BRAND_ASSET_SELECT: "*",
    createDefaultPlatformBrandProfile: () => ({}),
    parseProfile: (profile) => profile, parseAsset: async (row) => row,
    supabase: { from: (table) => {
      const query = {}, calls = [];
      for (const method of ["select", "eq", "in", "is", "order", "limit", "maybeSingle"]) query[method] = (...args) => { calls.push([method, ...args]); return query; };
      query.returns = async () => {
        if (table === "platform_brand_profiles") return { data: { heroImageAssetId: "older-selected" }, error: null };
        if (calls.some(([method]) => method === "in")) { contexts.push(calls); return { data: [{ id: "older-selected" }], error: selectedError }; }
        return { data: recent, error: null };
      };
      return query;
    } },
  });
  const bundle = await api.readPlatformBrandStudio("owner", { throwOnUnavailable: true });
  assert.equal(bundle.heroImage.id, "older-selected");
  assert.equal(bundle.assets.length, 51);
  assert.equal(recent.length, 50, "do not mutate a cached source response");
  assert.ok(contexts[0].some(([method, column, value]) => method === "eq" && column === "owner_user_id" && value === "owner"));
  selectedError = new Error("offline");
  await assert.rejects(api.readPlatformBrandStudio("owner", { throwOnUnavailable: true }), /Selected Brand Studio media/);
});
