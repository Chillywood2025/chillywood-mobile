import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accountAuthority,
  accountStorage,
  createBlockingMemoryStorage,
  createMemoryStorage,
  loadStubbed,
  read,
} from "./customer-experience-adversarial-helpers.mjs";

const makeGrant = (number, overrides = {}) => {
  const created = new Date(Date.now() - (100 - number) * 1_000).toISOString();
  return {
    id: `grant-${String(number).padStart(3, "0")}`,
    user_id: "account-a",
    source_id: `video-${number}`,
    created_at: created,
    starts_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    status: "active",
    environment: "production",
    refunded_at: null,
    revoked_at: null,
    grant_type: "paid_content_access",
    source_type: "provider_event",
    ...overrides,
  };
};

const makePaidVideoHarness = ({ grants, switchAfterPage = 0, timeoutStage = "" }) => {
  let currentUserId = "account-a";
  let pageReads = 0;
  const mutableGrants = [...grants];
  const resolvedVideoIds = [];
  const timeoutOperation = new Promise(() => {});

  const createQuery = () => {
    const filters = [];
    let cursor = "";
    let pageSize = 24;
    const query = {
      select() { return query; },
      eq(column, value) { filters.push(["eq", column, value]); return query; },
      in(column, values) { filters.push(["in", column, values]); return query; },
      is(column, value) { filters.push(["is", column, value]); return query; },
      order() { return query; },
      lt(column, value) { if (column === "id") cursor = value; return query; },
      limit(value) { pageSize = value; return query; },
      returns() {
        if (timeoutStage === "grant_page") return timeoutOperation;
        pageReads += 1;
        let rows = mutableGrants.filter((row) => filters.every(([kind, column, value]) => {
          if (kind === "eq") return row[column] === value;
          if (kind === "in") return value.includes(row[column]);
          return row[column] === value;
        }));
        if (cursor) rows = rows.filter((row) => row.id < cursor);
        rows = rows.sort((left, right) => right.id.localeCompare(left.id)).slice(0, pageSize);
        if (pageReads === 1 && mutableGrants.length > 0) mutableGrants.shift();
        if (switchAfterPage === pageReads) currentUserId = "account-b";
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return query;
  };

  const supabase = {
    auth: {
      getUser: () => timeoutStage === "auth"
        ? timeoutOperation
        : Promise.resolve({ data: { user: { id: currentUserId } }, error: null }),
    },
    from: () => createQuery(),
    rpc: async (_name, args) => {
      resolvedVideoIds.push(args.p_content_id);
      return {
        data: { allowed: true, reason: "active_grant", requiresPurchase: false },
        error: null,
      };
    },
  };
  const runtime = loadStubbed("_lib/creatorPaidVideos.ts", {
    "react-native": { Platform: { OS: "android" } },
    "./analytics": { trackEvent() {} },
    "./creatorMonetization": {
      formatMonetizationCurrency: () => "$0.99",
      normalizeCreatorContentAccessResolution: (value) => ({
        ...value,
        priceCents: null,
        currency: null,
        creatorId: null,
        resolverStatus: "resolved",
      }),
    },
    "./creatorMoneyPurchaseAuthority": {},
    "./revenuecat": {},
    "./iosAppStoreCommerce": {},
    "./paymentRailPolicy": {},
    "./supabase": { supabase },
    "./entitlementAuthority": {
      withAuthorityReadDeadline: async (operation, fallback) => operation === timeoutOperation ? fallback : await operation,
    },
    "./creatorVideos": {
      readCreatorVideosByIds: (videoIds) => timeoutStage === "video_metadata"
        ? timeoutOperation
        : Promise.resolve(videoIds.map((id) => ({
            id,
            ownerId: `creator-for-${id}`,
            title: `Title ${id}`,
            thumbnailUrl: null,
          }))),
    },
  });
  return { runtime, getPageReads: () => pageReads, resolvedVideoIds };
};

test("large Library history crosses bounded pages without hiding an older valid purchase", async () => {
  const expired = Array.from({ length: 55 }, (_, index) => makeGrant(100 - index, {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  }));
  const olderValid = makeGrant(20, { source_id: "older-valid-video" });
  const duplicate = makeGrant(19, { source_id: "older-valid-video" });
  const recentValid = makeGrant(18, { source_id: "recent-valid-video" });
  const wrongAccount = makeGrant(17, { user_id: "account-b", source_id: "wrong-account-video" });
  const refunded = makeGrant(16, { source_id: "refunded-video", refunded_at: new Date().toISOString() });
  const revoked = makeGrant(15, { source_id: "revoked-video", revoked_at: new Date().toISOString() });
  const harness = makePaidVideoHarness({
    grants: [...expired, olderValid, duplicate, recentValid, wrongAccount, refunded, revoked],
  });

  const result = await harness.runtime.readMyUnlockedPaidVideoLibraryItems(24);
  assert.equal(result.status, "resolved");
  assert.equal(result.subjectUserId, "account-a");
  assert.deepEqual(result.items.map((item) => item.id).sort(), ["older-valid-video", "recent-valid-video"]);
  assert.ok(harness.getPageReads() >= 3);
  assert.equal(harness.resolvedVideoIds.filter((id) => id === "older-valid-video").length, 1);
  assert.ok(!harness.resolvedVideoIds.includes("wrong-account-video"));
  assert.ok(!harness.resolvedVideoIds.includes("refunded-video"));
  assert.ok(!harness.resolvedVideoIds.includes("revoked-video"));
});

test("large Saved history and Chi'lly Chat collections cross every backend read window", async () => {
  const account = {
    userId: "11111111-1111-4111-8111-111111111111",
    accountId: "11111111-1111-4111-8111-111111111111",
    sessionGeneration: "high-volume",
    state: "ACTIVE",
    restoreOnly: false,
  };
  const sameBinding = (left, right) => !!left && !!right
    && left.userId === right.userId
    && left.accountId === right.accountId
    && left.sessionGeneration === right.sessionGeneration
    && left.restoreOnly === right.restoreOnly;
  const savedRows = Array.from({ length: 405 }, (_, index) => ({
    title_id: `saved-${String(index).padStart(4, "0")}`,
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  const savedCursors = [];
  const savedLimits = [];
  let savedPageReads = 0;
  const makeSavedQuery = () => ({
    cursor: "",
    pageSize: 200,
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    gt(column, value) {
      assert.equal(column, "title_id");
      this.cursor = value;
      savedCursors.push(value);
      return this;
    },
    limit(value) {
      this.pageSize = value;
      savedLimits.push(value);
      return this;
    },
    async returns() {
      const start = this.cursor
        ? savedRows.findIndex((row) => row.title_id > this.cursor)
        : 0;
      const data = start < 0 ? [] : savedRows.slice(start, start + this.pageSize);
      savedPageReads += 1;
      if (savedPageReads === 1) savedRows.splice(50, 1);
      return { data, error: null };
    },
  });
  const savedSupabase = {
    from() { return makeSavedQuery(); },
  };
  const savedApi = loadStubbed("_lib/userData.ts", {
    "@react-native-async-storage/async-storage": {},
    "./accountScopedStorage": {
      readAccountScopedJsonValue: async () => ({}),
      writeAccountScopedJsonValue: async () => {},
    },
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => account,
      sameAccountSessionAuthority: sameBinding,
    },
    "./supabase": { supabase: savedSupabase },
  });
  const savedIds = await savedApi.readMyListIds();
  assert.equal(savedIds.length, 405);
  assert.equal(new Set(savedIds).size, 405);
  assert.equal(savedIds.includes("saved-0404"), true);
  assert.deepEqual(savedCursors, ["saved-0199", "saved-0399"]);
  assert.deepEqual(savedLimits, [200, 200, 200]);

  const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherUserId = "22222222-2222-4222-8222-222222222222";
  const memberRows = [
    { thread_id: threadId, user_id: account.userId, display_name: "A", joined_at: "2026-01-01T00:00:00.000Z" },
    { thread_id: threadId, user_id: otherUserId, display_name: "B", joined_at: "2026-01-01T00:00:00.000Z" },
  ];
  const threadRows = Array.from({ length: 405 }, (_, index) => ({
    id: index === 0 ? threadId : `thread-${String(index).padStart(4, "0")}`,
    participant_pair_key: `${account.userId}::${otherUserId}`,
    created_by: account.userId,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_message_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    members: memberRows,
  }));
  const messageRows = Array.from({ length: 405 }, (_, index) => ({
    id: `message-${String(index).padStart(4, "0")}`,
    thread_id: threadId,
    sender_user_id: index % 2 ? account.userId : otherUserId,
    body: `Message ${index}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 404 - index)).toISOString(),
    moderation_status: "clean",
  }));
  const chatCursors = { chat_threads: [], chat_messages: [] };
  const chatLimits = { chat_threads: [], chat_messages: [] };
  const chatPageReads = { chat_threads: 0, chat_messages: 0 };
  const makeChatQuery = (table) => {
    const query = {
      cursor: "",
      exactId: "",
      pageSize: 200,
      select() { return this; },
      eq(column, value) {
        if (table === "chat_threads" && column === "id") this.exactId = value;
        return this;
      },
      order() { return this; },
      in() { return this; },
      gt(column, value) {
        assert.equal(column, "id");
        this.cursor = value;
        chatCursors[table]?.push(value);
        return this;
      },
      limit(value) {
        this.pageSize = value;
        chatLimits[table]?.push(value);
        return this;
      },
      returns() {
        if (table === "chat_threads" && this.exactId) {
          return {
            maybeSingle: async () => ({
              data: threadRows.find((row) => row.id === this.exactId) ?? null,
              error: null,
            }),
          };
        }
        if (table === "chat_threads" || table === "chat_messages") {
          const rows = table === "chat_threads" ? threadRows : messageRows;
          const start = this.cursor
            ? rows.findIndex((row) => row.id > this.cursor)
            : 0;
          const data = start < 0 ? [] : rows.slice(start, start + this.pageSize);
          chatPageReads[table] += 1;
          if (chatPageReads[table] === 1) rows.splice(50, 1);
          return { data, error: null };
        }
        return { data: [
          { user_id: account.userId, display_name: "A" },
          { user_id: otherUserId, display_name: "B" },
        ], error: null };
      },
    };
    return query;
  };
  class TestUserFacingError extends Error {
    constructor(_kind, message) { super(message); }
  }
  const chatApi = loadStubbed("_lib/chat.ts", {
    "./accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => account,
      sameAccountSessionAuthority: sameBinding,
    },
    "./socialAttachments": { readSocialAttachmentsForSurfaces: async () => new Map() },
    "./supabase": { supabase: { from: (table) => makeChatQuery(table) } },
    "./userFacingErrors": { UserFacingError: TestUserFacingError },
  });
  const threads = await chatApi.listChatThreads();
  const messages = await chatApi.listChatMessages(threadId);
  assert.equal(threads.length, 405);
  assert.equal(messages.length, 405);
  assert.equal(new Set(threads.map((thread) => thread.threadId)).size, 405);
  assert.equal(new Set(messages.map((message) => message.id)).size, 405);
  assert.equal(threads[0].threadId, "thread-0404");
  assert.equal(messages[0].id, "message-0404");
  assert.deepEqual(chatCursors.chat_threads, ["thread-0199", "thread-0399"]);
  assert.deepEqual(chatCursors.chat_messages, ["message-0199", "message-0399"]);
  assert.deepEqual(chatLimits.chat_threads, [200, 200, 200]);
  assert.deepEqual(chatLimits.chat_messages, [200, 200, 200]);

  const userDataSource = read("_lib/userData.ts");
  const chatSource = read("_lib/chat.ts");
  assert.match(userDataSource, /\.gt\("title_id", titleIdCursor\)/u);
  assert.match(chatSource, /\.gt\("id", threadIdCursor\)/u);
  assert.match(chatSource, /\.gt\("id", messageIdCursor\)/u);

  const attachmentSource = read("_lib/socialAttachments.ts");
  assert.match(attachmentSource, /offset \+= 50/u);
  assert.match(attachmentSource, /surfaceIdBatch\.length \* 4/u);
});

test("account replacement during Library pagination rejects the entire stale result", async () => {
  const harness = makePaidVideoHarness({
    grants: Array.from({ length: 60 }, (_, index) => makeGrant(100 - index)),
    switchAfterPage: 2,
  });
  const result = await harness.runtime.readMyUnlockedPaidVideoLibraryItems(24);
  assert.deepEqual(result, { status: "unavailable", subjectUserId: "account-a", items: [] });
});

for (const timeoutStage of ["auth", "grant_page", "video_metadata"]) {
  test(`Library releases safely when ${timeoutStage} never settles`, async () => {
    const harness = makePaidVideoHarness({ grants: [makeGrant(1)], timeoutStage });
    const result = await harness.runtime.readMyUnlockedPaidVideoLibraryItems(24);
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.items, []);
  });
}

const notificationId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const makeNotification = (number) => ({
  id: notificationId(number),
  user_id: "account-a",
  category: "content_dropped",
  notification_type: "content_dropped",
  title: `Notification ${number}`,
  body: null,
  deep_link: null,
  status: "pending",
  target_route: null,
  target_entity_id: null,
  target_context: {},
  read_at: null,
  dismissed_at: null,
  created_at: new Date(Date.UTC(2026, 8, 12, 12, 0, Math.floor(number / 2))).toISOString(),
  delivered_at: null,
});

const makeNotificationHarness = ({ notificationCount = 75, removeAfterFirstPage = true, switchAfterPage = 0, timeoutStage = "" } = {}) => {
  let currentUserId = "account-a";
  let pageReads = 0;
  const rows = Array.from({ length: notificationCount }, (_, index) => makeNotification(index + 1));
  const timeoutOperation = new Promise(() => {});
  const createQuery = () => {
    const filters = [];
    let countOnly = false;
    let cursor = null;
    let pageSize = 30;
    const query = {
      timeout: timeoutStage === "count",
      select(_columns, options) { countOnly = options?.count === "exact" && options?.head === true; return query; },
      eq(column, value) { filters.push([column, value]); return query; },
      is(column, value) { filters.push([column, value]); return query; },
      in() { return query; },
      order() { return query; },
      or(expression) {
        const match = expression.match(/created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([0-9a-f-]+)\)/u);
        cursor = match ? { createdAt: match[1], id: match[2] } : null;
        return query;
      },
      limit(value) { pageSize = value; return query; },
      returns() {
        if (timeoutStage === "page") return timeoutOperation;
        pageReads += 1;
        let result = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
        if (cursor) {
          result = result.filter((row) => row.created_at < cursor.createdAt
            || row.created_at === cursor.createdAt && row.id < cursor.id);
        }
        result = result.sort((left, right) => (
          right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id)
        )).slice(0, pageSize);
        if (removeAfterFirstPage && pageReads === 1) {
          rows.splice(rows.findIndex((row) => row.id === notificationId(40)), 1);
        }
        if (switchAfterPage === pageReads) currentUserId = "account-b";
        return Promise.resolve({ data: result, error: null });
      },
      then(resolve, reject) {
        if (timeoutStage === "count") return timeoutOperation.then(resolve, reject);
        const matching = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
        return Promise.resolve(countOnly
          ? { data: null, error: null, count: matching.length }
          : { data: matching, error: null, count: null }).then(resolve, reject);
      },
    };
    return query;
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUserId } } } }) },
    from: () => createQuery(),
  };
  const runtime = loadStubbed("_lib/notifications.ts", {
    "react-native": { NativeModules: {}, Platform: { OS: "android" } },
    "@react-native-async-storage/async-storage": { default: createMemoryStorage() },
    "expo-constants": { default: {} },
    "expo-device": {},
    "expo-application": {},
    "expo-notifications": {},
    "./liveEvents": {},
    "./supabase": { supabase },
    "./userFacingProductCopy": { normalizePlatformSubscriptionNotificationCopy: (value) => String(value ?? "") },
    "./chillyChatCalls": {},
    "./chillyChatCallSoundAssets": {},
    "./appLinks": {},
    "./accountSessionAuthority": {},
    "./entitlementAuthority": {
      withAuthorityReadDeadline: async (operation, fallback) => (
        operation === timeoutOperation || operation?.timeout === true ? fallback : await operation
      ),
    },
  });
  return { runtime, getPageReads: () => pageReads };
};

test("large notification activity uses stable pages with tie-safe ordering and no duplicates after removal", async () => {
  const harness = makeNotificationHarness();
  const items = [];
  let cursor = null;
  do {
    const page = await harness.runtime.readNotificationListPage(undefined, 30, cursor);
    assert.equal(page.status, "resolved");
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(harness.getPageReads(), 3);
  assert.equal(items.length, 74);
  assert.equal(new Set(items.map((item) => item.id)).size, 74);
  assert.ok(!items.some((item) => item.id === notificationId(40)));
});

test("account replacement during notification pagination rejects the stale page", async () => {
  const harness = makeNotificationHarness({ switchAfterPage: 2 });
  const first = await harness.runtime.readNotificationListPage(undefined, 30);
  assert.equal(first.status, "resolved");
  const stale = await harness.runtime.readNotificationListPage(undefined, 30, first.nextCursor);
  assert.deepEqual(stale, { status: "unavailable", subjectUserId: "account-a", items: [], nextCursor: null });
});

test("notification summary counts remain exact beyond the first hundred-row read window", async () => {
  const harness = makeNotificationHarness({ notificationCount: 135, removeAfterFirstPage: false });
  const summary = await harness.runtime.readNotificationSummary();
  assert.equal(summary.totalCount, 135);
  assert.equal(summary.unreadCount, 135);
  assert.equal(summary.undismissedCount, 135);
  assert.equal(summary.latestCreatedAt, makeNotification(135).created_at);
});

test("notification page timeout releases as unavailable without stale rows", async () => {
  const harness = makeNotificationHarness({ timeoutStage: "page" });
  assert.deepEqual(
    await harness.runtime.readNotificationListPage(),
    { status: "unavailable", subjectUserId: "account-a", items: [], nextCursor: null },
  );
});

test("important notification timeout cannot silently hide retained action-needed rows", async () => {
  const harness = makeNotificationHarness({ timeoutStage: "page" });
  await assert.rejects(
    () => harness.runtime.readImportantNotificationList(),
    /could not be refreshed/u,
  );
});

test("notification count timeout releases the summary refresh with an accurate failure", async () => {
  const harness = makeNotificationHarness({ timeoutStage: "count" });
  await assert.rejects(
    () => harness.runtime.readNotificationSummary(),
    /could not be refreshed/u,
  );
});

test("provider uncertainty settles every customer commerce authority read fail closed", async () => {
  const never = new Promise(() => {});
  const supabase = {
    rpc: () => never,
    auth: { getUser: async () => ({ data: { user: { id: "account-a" } }, error: null }) },
    from: () => ({}),
    functions: { invoke: () => never },
  };
  const commonMocks = {
    "react-native": { Platform: { OS: "android" } },
    "./analytics": { trackEvent() {} },
    "./creatorMonetization": { formatMonetizationCurrency: () => "$0.99" },
    "./creatorMoneyPurchaseAuthority": {},
    "./revenuecat": {},
    "./revenuecatPurchaseClosure": {},
    "./iosAppStoreCommerce": {},
    "./paymentRailPolicy": {},
    "./logger": {},
    "./runtimeConfig": { getRuntimeConfig: () => ({}) },
    "./creatorVideos": { readCreatorVideosByIds: async () => [] },
    "./supabase": { supabase },
    "./entitlementAuthority": { withAuthorityReadDeadline: async (_operation, fallback) => fallback },
  };
  const creatorId = "11111111-1111-4111-8111-111111111111";
  const videoId = "22222222-2222-4222-8222-222222222222";
  const partyId = "33333333-3333-4333-8333-333333333333";
  const eventId = "44444444-4444-4444-8444-444444444444";

  const vip = loadStubbed("_lib/creatorVipPasses.ts", commonMocks);
  const subscription = loadStubbed("_lib/channelSubscriptions.ts", commonMocks);
  const party = loadStubbed("_lib/paidWatchPartyTickets.ts", commonMocks);
  const event = loadStubbed("_lib/paidCreatorEvents.ts", commonMocks);
  const paidVideo = loadStubbed("_lib/creatorPaidVideos.ts", commonMocks);
  const live = loadStubbed("_lib/liveWatchPartyMoney.ts", commonMocks);
  const tips = loadStubbed("_lib/creatorTips.ts", commonMocks);

  const decisions = await Promise.all([
    vip.resolveCreatorVipPassAccess(creatorId),
    vip.resolveCreatorVipVideoAccess(videoId),
    subscription.resolveChannelSubscriptionAccess(creatorId),
    party.resolvePaidWatchPartyTicketAccess(partyId),
    event.resolvePaidCreatorEventPassAccess(eventId),
    paidVideo.resolvePaidVideoAccess(videoId),
    tips.readCreatorTipPublicStatus(creatorId),
  ]);
  decisions.forEach((decision) => assert.equal(decision.allowed ?? decision.canTip, false));
  await assert.rejects(() => live.readLiveWatchPartyMoneyAccess(partyId), /could not be verified/u);
});

test("Live Stage seat-state timeout cannot preserve uncertain seat eligibility", async () => {
  const timeoutQuery = { timeout: true };
  const partyId = "33333333-3333-4333-8333-333333333333";
  const seatOfferId = "55555555-5555-4555-8555-555555555555";
  const supabase = {
    rpc: async () => ({
      data: {
        allowed: true,
        reason: "exact_live_seat_pass",
        viewerOnly: true,
        seatEligible: true,
        seatApproved: false,
        hostAuthority: false,
        accessOfferId: null,
        seatOfferId,
        accessPriceCents: null,
        seatPriceCents: 499,
        currency: "usd",
        grantsPublish: false,
        requiresHostApproval: true,
      },
      error: null,
    }),
    from: () => {
      const query = {
        timeout: true,
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return timeoutQuery; },
      };
      return query;
    },
  };
  const live = loadStubbed("_lib/liveWatchPartyMoney.ts", {
    "react-native": { Platform: { OS: "android" } },
    "./creatorMoneyPurchaseAuthority": {},
    "./revenuecat": {},
    "./revenuecatPurchaseClosure": {},
    "./supabase": { supabase },
    "./entitlementAuthority": {
      withAuthorityReadDeadline: async (operation, fallback) => operation === timeoutQuery ? fallback : await operation,
    },
  });
  await assert.rejects(
    () => live.readLiveWatchPartyMoneyAccess(partyId),
    /seat access could not be verified/u,
  );
});

test("duplicate-safe purchase intents have bounded network settlement before provider presentation", () => {
  const intentFunctions = [
    ["_lib/creatorVipPasses.ts", "createCreatorVipPassPurchaseIntent"],
    ["_lib/channelSubscriptions.ts", "createChannelSubscriptionPurchaseIntent"],
    ["_lib/paidWatchPartyTickets.ts", "createPaidWatchPartyTicketPurchaseIntent"],
    ["_lib/paidCreatorEvents.ts", "createPaidCreatorEventPassPurchaseIntent"],
    ["_lib/creatorPaidVideos.ts", "createPaidVideoPurchaseIntent"],
    ["_lib/creatorTips.ts", "purchaseCreatorTipWithStore"],
    ["_lib/liveWatchPartyMoney.ts", "purchaseLiveWatchPartyOffer"],
  ];
  for (const [path, functionName] of intentFunctions) {
    const source = read(path);
    const functionStart = source.indexOf(functionName);
    assert.ok(functionStart >= 0, `${functionName} must remain present`);
    assert.match(
      source.slice(functionStart, functionStart + 8_000),
      /invokeCreatorMoneyPurchaseSubjectRpc[\s\S]*?(?:create_[a-z0-9_]+(?:_purchase_intent|_intent)|intentRpc)/u,
      `${functionName} must bound its authoritative intent RPC`,
    );
  }
});

test("ordinary commerce and notification copy does not expose internal qualification language", () => {
  const customerCopySources = [
    "_lib/liveWatchPartyMoney.ts",
    "_lib/channelSubscriptions.ts",
    "_lib/paidWatchPartyTickets.ts",
    "_lib/paidCreatorEvents.ts",
    "_lib/creatorVipPasses.ts",
    "_lib/creatorPaidVideos.ts",
    "_lib/creatorTips.ts",
    "_lib/notifications.ts",
    "components/creator-media/creator-video-card.tsx",
    "components/notifications/notification-bell-button.tsx",
    "app/channel/[userId].tsx",
    "app/event/[eventId].tsx",
    "app/player/[id].tsx",
    "app/watch-party/[partyId].tsx",
    "app/watch-party/live-stage/[partyId].tsx",
  ].map(read).join("\n");
  assert.doesNotMatch(
    customerCopySources,
    /(?:verified [^\n"']* sandbox|sandbox (?:product|tip purchase|sales|viewers)|(?:offer|request|rejection) proof|physical (?:APNs )?proof|pending physical proof|ordinary push readiness|real notification records|fake counts|internal Android build|LiveKit publish authority)/iu,
  );
  assert.doesNotMatch(
    read("app/watch-party/index.tsx"),
    /setPaidTicketNotice\("[^"]*(?:sandbox|internal|provider|RevenueCat|Google Play)[^"]*"\)/iu,
  );
  const forbiddenCustomerLiterals = [
    "Sandbox test mode — no real money is charged.",
    "Sandbox test available",
    "Sandbox setup unavailable",
    "Start Sandbox Premium Test",
    "Check Sandbox Purchase Setup",
    "Testing details",
    "Sandbox availability and purchase diagnostics",
    "SANDBOX TEST",
    "Sandbox Test: subscribe",
    "Sandbox Test: get",
    "Sandbox Test Subscribe",
    "Sandbox Test Get",
    "Test Creator Purchases",
  ];
  const guardedCustomerSurfaces = [
    read("app/subscribe.tsx"),
    read("app/channel/[userId].tsx"),
    read("_lib/monetization.ts"),
  ].join("\n");
  for (const literal of forbiddenCustomerLiterals) {
    assert.equal(guardedCustomerSurfaces.includes(literal), false, `customer surface must not render ${literal}`);
  }
  const notificationCopy = read("_lib/userFacingProductCopy.ts");
  assert.match(notificationCopy, /INTERNAL_PLATFORM_SUBSCRIPTION_PREFIX/u);
  assert.match(notificationCopy, /copy\.replace\(INTERNAL_PLATFORM_SUBSCRIPTION_PREFIX, ""\)/u);
});

test("account-bound customer caches and the mounted route tree use the canonical isolation layer", () => {
  const userData = read("_lib/userData.ts");
  const layout = read("app/_layout.tsx");
  const mainTabProfileCache = read("components/navigation/main-tab-profile-cache.ts");
  for (const key of ["MY_LIST_KEY", "WATCH_PROGRESS_KEY", "USER_PROFILE_KEY", "LAST_PARTY_KEY"]) {
    assert.match(userData, new RegExp(`(?:read|write)AccountValue\\(${key}`, "u"));
  }
  assert.match(layout, /<RootNavigator key=\{navigationTreeKey\} \/>/u);
  assert.match(mainTabProfileCache, /sameAccountSessionAuthority\(expectedAuthority, mainTabHeaderProfileSnapshot\.authority\)/u);
  assert.match(mainTabProfileCache, /profile\.id !== expectedAuthority\.userId/u);
});

test("direct Chat thread and inbox mutations cannot dispatch as a replacement account", () => {
  const chat = read("_lib/chat.ts");
  const accountBoundMutation = read("_lib/accountBoundSupabaseMutation.ts");
  assert.match(
    chat,
    /openOrRepairDirectThreadWithRpc\(\s*target: ChatTargetIdentity,\s*authority: ChatMutationAuthority/u,
  );
  assert.match(chat, /return openOrRepairDirectThreadWithRpc\(target, authority\)/u);
  assert.match(chat, /captureAccountBoundSupabaseMutationSubject\(expectedUserId\)/u);
  assert.match(accountBoundMutation, /parseAccountSessionAuthorityReadback\(readback\.data\)/u);
  assert.match(accountBoundMutation, /accessToken: subject\.accessToken/u);
  assert.match(chat, /unhideChatThreadWithAuthority\(thread\.threadId, authority\)/u);
  assert.match(chat, /hideChatThreadFromInbox[\s\S]*?captureChatMutationAuthority\(\)[\s\S]*?"hide_chat_thread_from_inbox"/u);
  assert.match(chat, /unhideChatThreadForMe[\s\S]*?captureChatMutationAuthority\(\)/u);
});
