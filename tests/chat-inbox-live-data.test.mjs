import assert from "node:assert/strict";
import test from "node:test";
import { loadStubbed } from "./customer-experience-adversarial-helpers.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const authority = { userId: "11111111-1111-4111-8111-111111111111", accountId: "11111111-1111-4111-8111-111111111111", sessionGeneration: "one", state: "ACTIVE", restoreOnly: false };
const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
const ownerKey = a => a ? JSON.stringify([a.userId, a.accountId, a.sessionGeneration]) : "";
const row = (id = "one", active = false) => ({
  id, participant_pair_key: `${authority.userId}:other`, created_by: authority.userId,
  members: [{ thread_id: id, user_id: authority.userId, display_name: "Self" }, { thread_id: id, user_id: "other", display_name: "Other" }],
  ...(active ? { active_communication_room_id: id, active_call_type: "voice" } : {}),
});
function harness({ read = () => ({ data: [], error: null }), capture, room, communication } = {}) {
  const state = { authority: { ...authority }, queries: [], channels: [], removed: [], writes: [], activityHolders: 0, activityListeners: new Set() };
  class UserFacingError extends Error { constructor(_kind, message) { super(message); } }
  const supabase = {
    from(table) {
      const query = { table, filters: {}, signal: null, select() { return this; }, order() { return this; }, limit() { return this; },
        eq(key, value) { this.filters[key] = value; return this; }, gt(key, value) { this.filters[`after_${key}`] = value; return this; },
        in() { return this; }, abortSignal(signal) { this.signal = signal; return this; },
        returns() { state.queries.push(this); return read(this); },
      }; return query;
    },
    channel(name) {
      const channel = { name, bindings: [], on(_type, filter, callback) { this.bindings.push({ filter, callback }); return this; }, subscribe(callback) { this.status = callback; return this; } };
      state.channels.push(channel); return channel;
    },
    removeChannel: async channel => { state.removed.push(channel); },
  };
  const api = loadStubbed("_lib/chat.ts", {
    "./supabase": { supabase }, "./userFacingErrors": { UserFacingError },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => state.authority, sameAccountSessionAuthority: same },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: capture ?? (async () => ({ authority: state.authority, accessToken: "frozen-token" })),
      invokeAccountBoundSupabaseMutationRpc: async (...args) => { state.writes.push(args); return { data: { cleared: true, reason: "ended" }, error: null }; },
    },
    "./communication": communication ?? { formatCommunicationRoomCode: value => value, getCommunicationRoom: room ?? (async () => null), isCommunicationRoomActive: () => false },
    "./chillyChatCalls": { CHAT_CALL_INVITES_TABLE: "chat_call_invites" },
    "./communicationCallMediaPolicy.mjs": { resolveChatThreadCallReconciliation: () => "authoritative_cleanup", shouldApplyAuthoritativeChatCallCleanup: result => result.cleared },
    "./logger": { reportRuntimeError() {} },
    "./notificationActivity": {
      getNotificationActivityOwnerKey: ownerKey,
      subscribeToNotificationActivity: (_key, callback) => { state.activityListeners.add(callback); return () => state.activityListeners.delete(callback); },
      subscribeToNotificationActivityChanges: () => { state.activityHolders++; return () => state.activityHolders--; },
    },
  });
  return { api, state };
}

test("inbox query failure rejects instead of manufacturing an empty inbox", async () => {
  const h = harness({ read: () => ({ data: null, error: { message: "offline" } }) });
  await assert.rejects(h.api.listChatThreads(), /Unable to load/);
});

test("cancellation after a page stops further history and enrichment reads", async () => {
  const controller = new AbortController();
  const held = deferred();
  const h = harness({ read: () => held.promise });
  const pending = h.api.listChatThreads({ signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  held.resolve({ data: Array.from({ length: 200 }, (_, i) => row(String(i).padStart(3, "0"))), error: null });
  await assert.rejects(pending, /retired/);
  assert.equal(h.state.queries.length, 1);
  assert.equal(h.state.queries[0].signal, controller.signal);
});

for (const change of ["abort", "session"]) {
  test(`cleanup checks ${change} again after asynchronous token capture`, async () => {
    const controller = new AbortController(); const held = deferred();
    const h = harness({ capture: () => held.promise });
    const pending = h.api.clearEndedChatThreadCall("thread", "room", authority, controller.signal);
    if (change === "abort") controller.abort();
    else h.state.authority = { ...authority, sessionGeneration: "replacement" };
    held.resolve({ authority, accessToken: "original-token" });
    await assert.rejects(pending, /retired|account changed/);
    assert.equal(h.state.writes.length, 0);
  });
}

test("cleanup keeps original account-bound token and does not pretend dispatched writes were cancelled", async () => {
  const h = harness();
  const result = await h.api.clearEndedChatThreadCall("thread", "room", authority);
  assert.equal(result.cleared, true);
  assert.equal(h.state.writes[0][0].accessToken, "frozen-token");
  assert.deepEqual(h.state.writes[0][0].authority, authority);
  assert.equal(h.state.writes[0][3].retainTransportSettlement, false, "legacy call-control remains bounded");
  const controller = new AbortController();
  await h.api.clearEndedChatThreadCall("thread", "room", authority, controller.signal);
  assert.equal(h.state.writes[1][3].retainTransportSettlement, true, "only signal-owned reads retain real settlement");
});

test("cancelling one reconciliation retains ownership until abort-ignoring sibling reads settle", async () => {
  const controller = new AbortController(); const held = deferred();
  let rooms = 0;
  const h = harness({
    read: q => ({ data: q.table === "chat_threads" ? [row("one", true), row("two", true)] : [], error: null }),
    room: async () => { rooms++; if (rooms === 1) return held.promise; controller.abort(); return { room: null }; },
  });
  let settled = false;
  const pending = h.api.listChatThreads({ signal: controller.signal }).finally(() => { settled = true; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(rooms, 2); assert.equal(settled, false);
  held.resolve({ room: null });
  await assert.rejects(pending, /retired/);
  assert.equal(h.state.writes.length, 0);
});

test("inbox shares activity transport and subscribes only recipient-filtered membership INSERT/UPDATE", () => {
  const h = harness(); let changes = 0;
  const unsubscribe = h.api.subscribeToInbox(() => changes++);
  assert.equal(h.state.activityHolders, 1);
  assert.equal(h.state.channels.length, 1);
  const channel = h.state.channels[0];
  assert.deepEqual(channel.bindings.map(b => b.filter.event), ["INSERT", "UPDATE"]);
  assert.ok(channel.bindings.every(b => b.filter.table === "chat_thread_members" && b.filter.filter === `user_id=eq.${authority.userId}`));
  channel.bindings[0].callback({ new: { user_id: "other" } }); assert.equal(changes, 0);
  channel.bindings[0].callback({ new: { user_id: authority.userId } }); assert.equal(changes, 1);
  channel.status("SUBSCRIBED"); assert.equal(changes, 2);
  const lateActivity = [...h.state.activityListeners][0];
  h.state.authority = { ...authority, sessionGeneration: "two" };
  channel.bindings[1].callback({ new: { user_id: authority.userId } }); lateActivity();
  assert.equal(changes, 2);
  unsubscribe();
  channel.status("SUBSCRIBED"); lateActivity();
  assert.equal(changes, 2); assert.equal(h.state.activityHolders, 0);
  h.api.subscribeToInbox(() => changes++);
  assert.notEqual(h.state.channels[1].name, channel.name);
});

test("reconciliation uses actual cancellable room-only helper without an unrelated hanging membership read", async () => {
  const controller = new AbortController(); const held = deferred(); const tables = []; let capturedSignal;
  const communication = loadStubbed("_lib/communication.ts", {
    "expo-constants": { default: {} }, "react-native": { Platform: { OS: "ios" } },
    "./supabase": { supabase: { from(table) {
      tables.push(table);
      return { select() { return this; }, eq() { return this; }, abortSignal(signal) { capturedSignal = signal; return this; },
        returns() { return this; }, maybeSingle() { return table === "communication_rooms" ? held.promise : new Promise(() => {}); } };
    } } },
  });
  const h = harness({ communication, read: q => ({ data: q.table === "chat_threads" ? [row("one", true)] : [], error: null }) });
  let settled = false;
  const pending = h.api.listChatThreads({ signal: controller.signal }).finally(() => { settled = true; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  controller.abort();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(tables, ["communication_rooms"]); assert.equal(capturedSignal, controller.signal); assert.equal(settled, false);
  held.resolve({ data: null, error: null });
  await assert.rejects(pending, /retired/); assert.equal(h.state.writes.length, 0);
});

test("actual room helper checks cancellation before legacy fallback dispatch", async () => {
  const controller = new AbortController(); let reads = 0;
  const communication = loadStubbed("_lib/communication.ts", {
    "expo-constants": { default: {} }, "react-native": { Platform: { OS: "ios" } },
    "./supabase": { supabase: { from() {
      reads++;
      return { select() { return this; }, eq() { return this; }, abortSignal() { return this; }, returns() { return this; },
        async maybeSingle() { controller.abort(); return { data: null, error: { message: "column content_access_rule does not exist" } }; } };
    } } },
  });
  await assert.rejects(communication.getCommunicationRoom("one", { signal: controller.signal }), /retired/);
  assert.equal(reads, 1);
});

test("friend refresh retains both parallel readers until settlement despite rejection", async () => {
  const held = deferred(); const controller = new AbortController(); let reads = 0, settled = false;
  const friendGraph = loadStubbed("_lib/friendGraph.ts", {
    "./supabase": { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "viewer" } } } }) },
      from() { return { select() { return this; }, eq() { return this; }, abortSignal(signal) { assert.equal(signal, controller.signal); return this; },
        returns() { reads++; return reads === 1 ? Promise.reject(new Error("offline")) : held.promise; } }; },
    } },
  });
  const pending = friendGraph.readActiveFriendUserIds({ signal: controller.signal, expectedUserId: "viewer" }).finally(() => { settled = true; });
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(reads, 2); assert.equal(settled, false); controller.abort();
  held.resolve({ data: [], error: null }); await assert.rejects(pending, /offline|retired/);
});

test("friend refresh cancellation stops the remaining per-friend block loop", async () => {
  const controller = new AbortController(); let blockReads = 0;
  class UserFacingError extends Error {}
  const relationships = ["one", "two"].map(peer => ({ user_low_id: "viewer", user_high_id: peer, requested_by_user_id: "viewer", status: "active" }));
  const friendGraph = loadStubbed("_lib/friendGraph.ts", {
    "./userFacingErrors": { UserFacingError },
    "./supabase": { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "viewer" } } } }) },
      from(table) { return { select() { return this; }, eq() { return this; }, abortSignal(signal) { assert.equal(signal, controller.signal); return this; },
        returns() { return table === "user_friendships" ? Promise.resolve({ data: relationships, error: null }) : this; },
        async maybeSingle() { blockReads++; controller.abort(); return { data: null, error: null }; },
      }; },
    } },
  });
  await assert.rejects(friendGraph.readActiveFriendUserIds({ signal: controller.signal, expectedUserId: "viewer" }), /retired/);
  assert.equal(blockReads, 2, "one pair is issued together; no subsequent friend begins after abort");
});
