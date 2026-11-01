import assert from "node:assert/strict";
import test from "node:test";
import { RealtimeClient } from '@supabase/realtime-js';
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
        lte(key,value) { this.filters[`through_${key}`]=value; return this; },
        in() { return this; }, abortSignal(signal) { this.signal = signal; return this; },
        returns() { state.queries.push(this);
          if(this.table==='chat_thread_activity' && this.filters.id) return {maybeSingle:async()=>{
            const result=await read(this);return {...result,data:result.data?.[0]??null};
          }};
          return read(this);
        },
      }; return query;
    },
    channel(name) {
      const channel = { name, bindings: [], on(_type, filter, callback) { this.bindings.push({ filter, callback }); return this; }, subscribe(callback) { this.status = callback; return this; } };
      state.channels.push(channel); return channel;
    },
    removeChannel: async channel => { state.removed.push(channel); },
  };
  const api = loadStubbed(process.env.CHILLY_CHAT_DATA_TEST_SOURCE ?? "_lib/chat.ts", {
    "./supabase": { supabase }, "./userFacingErrors": { UserFacingError },
    "./socialAttachments": {readSocialAttachmentsForSurfaces:async()=>new Map()},
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

test("inbox ranks meaningful call activity ahead of old messages, retains microseconds and never reads by sorting", async () => {
  const rows = [
    {...row('old'),last_message_at:'2026-08-01T00:00:00Z',updated_at:'2099-01-01T00:00:00Z'},
    {...row('call'),last_activity_at:'2026-10-31T20:15:00.123456Z',last_activity_preview:'Voice call ended',
      members:row('call').members.map(m=>({...m,unread_count:2,unread_call_count:1}))},
    {...row('earlier'),last_activity_at:'2026-10-31T20:15:00.123400Z'},
    {...row('same-b'),last_activity_at:'2026-10-31T20:15:00.123456Z'},
    {...row('unknown'),updated_at:'2099-01-01T00:00:00Z'},
  ];
  const h=harness({read:q=>({data:q.table==='chat_thread_activity'?rows:[],error:null})});
  const result=await h.api.listChatThreads();
  assert.deepEqual(result.map(t=>t.threadId),['call','same-b','earlier','old','unknown']);
  assert.equal(result[0].lastActivityPreview,'Voice call ended');
  assert.equal(result[0].currentMember.unreadCount,3);
  assert.equal(result[0].currentMember.unreadCallCount,1);
  assert.equal(h.state.writes.length,0);
});

test("read acknowledgement preserves observed microseconds and uses exact frozen authority",async()=>{
  const h=harness();
  await h.api.markChatThreadRead('thread');
  assert.equal(h.state.writes.length,0,'no synthetic now acknowledgement');
  await h.api.markChatThreadRead('thread','2026-10-31T20:15:00.123456Z');
  assert.equal(h.state.writes[0][1],'mark_chilly_chat_thread_read');
  assert.equal(h.state.writes[0][2].p_read_through,'2026-10-31T20:15:00.123456Z');
  assert.equal(h.state.writes[0][0].accessToken,'frozen-token');
});

test('thread subscription refreshes initial/reconnected gaps only for its live owner and lifetime', () => {
  const h = harness(); let refreshes = 0;
  const stop = h.api.subscribeToThread('thread', () => { refreshes++; });
  const channel = h.state.channels[0];
  channel.status('SUBSCRIBED'); channel.status('CHANNEL_ERROR'); channel.status('SUBSCRIBED');
  assert.equal(refreshes, 2);
  channel.bindings[0].callback(); assert.equal(refreshes, 3);
  h.state.authority = { ...authority, sessionGeneration: 'replacement' };
  channel.status('SUBSCRIBED'); channel.bindings[0].callback();
  assert.equal(refreshes, 3, 'stale session callbacks cannot refresh');
  h.state.authority = { ...authority };
  stop(); channel.status('SUBSCRIBED'); channel.bindings[0].callback();
  assert.equal(refreshes, 3, 'detached callbacks cannot refresh');
  assert.equal(h.state.removed.length, 1);
});

test('actual RealtimeClient delayed teardown cannot reuse or retire a replacement thread subscription', async () => {
  const client = new RealtimeClient('ws://127.0.0.1:1', { params: { apikey: 'offline-fixture' }, timeout: 10 });
  client.connect = () => { throw Error('network is forbidden in subscription lifecycle fixture'); };
  const channels = [], removals = [], hold = deferred();
  const binding = { ...authority };
  const api = loadStubbed(process.env.CHILLY_CHAT_DATA_TEST_SOURCE ?? '_lib/chat.ts', {
    './accountSessionAuthority': { getCurrentAccountSessionAuthoritySnapshot: () => binding, sameAccountSessionAuthority: same },
    './supabase': { supabase: {
      channel(name) {
        const channel = client.channel(name);
        // Exercise the actual SDK topic cache/removal; model only transport
        // subscription delivery so this test never opens a network connection.
        channel.subscribe = callback => { channel.fixtureStatus = callback; return channel; };
        if (!channels.length) {
          const unsubscribe = channel.unsubscribe.bind(channel);
          channel.unsubscribe = async () => { await hold.promise; return unsubscribe(); };
        }
        channels.push(channel);
        return channel;
      },
      removeChannel(channel) { const pending = client.removeChannel(channel); removals.push(pending); return pending; },
    } },
  });
  let oldRefreshes = 0, newRefreshes = 0;
  const stopOld = api.subscribeToThread('same-thread', () => oldRefreshes++);
  const oldStatus = channels[0].fixtureStatus;
  oldStatus('SUBSCRIBED'); stopOld();
  const stopNew = api.subscribeToThread('same-thread', () => newRefreshes++);
  try {
    assert.notStrictEqual(channels[0], channels[1], 'old topic retirement must not reuse the old SDK channel');
    assert.notEqual(channels[0].topic, channels[1].topic);
    oldStatus('SUBSCRIBED'); channels[1].fixtureStatus('SUBSCRIBED');
    assert.equal(oldRefreshes, 1); assert.equal(newRefreshes, 1);
    hold.resolve(); await removals[0];
    assert.deepEqual(client.getChannels(), [channels[1]], 'actual old SDK removal preserves the replacement topic');
    channels[1].fixtureStatus('SUBSCRIBED'); assert.equal(newRefreshes, 2);
  } finally {
    hold.resolve(); stopNew(); await Promise.all(removals); client.disconnect();
  }
});

test('actual message reader orders microseconds ascending, with IDs only breaking exact timestamp ties', async () => {
  const rows = [
    ['a-later', '2026-10-31T20:00:00.123401Z'],
    ['z-earlier', '2026-10-31T20:00:00.123400Z'],
    ['b-tie', '2026-10-31T21:00:00.1234+01:00'],
    ['a-tie', '2026-10-31T20:00:00.123400Z'],
    ['older', '2026-10-31T19:59:59.999999Z'],
    ['newer', '2026-10-31T20:00:00.124000Z'],
  ].map(([id, created_at]) => ({ id, thread_id: 'thread', sender_user_id: 'other', body: id, created_at }));
  const h = harness({ read: q => ({ error: null, data: q.table === 'chat_thread_activity' ? [row('thread')]
    : q.table === 'chat_messages' ? rows : [] }) });
  const result = await h.api.listChatMessages('thread', '2026-10-31T23:59:59Z');
  assert.deepEqual(result.map(m => m.id), ['older', 'a-tie', 'b-tie', 'z-earlier', 'a-later', 'newer']);
  assert.equal(h.state.writes.length, 0);
});

test("authoritative empty preview never falls back to deleted legacy text",async()=>{
  const h=harness({read:q=>({data:q.table==='chat_thread_activity'?[{...row('empty'),last_activity_at:null,last_activity_preview:null,last_message_at:'2099-01-01',last_message_preview:'Deleted private text'}]:[],error:null})});
  const [thread]=await h.api.listChatThreads();
  assert.equal(thread.lastActivityPreview,'');
  assert.equal(thread.displayLastActivityAt,null);
});

test("new activity after hide resurfaces even inside the same millisecond",async()=>{
  const rows=['same','newer'].map(id=>({...row(id),last_activity_at:`2026-10-31T20:15:00.${id==='same'?'123400':'123456'}Z`,
    members:row(id).members.map(m=>({...m,hidden_at:'2026-10-31T20:15:00.123400Z'}))}));
  const h=harness({read:q=>({data:q.table==='chat_thread_activity'?rows:[],error:null})});
  assert.deepEqual((await h.api.listChatThreads()).map(t=>t.threadId),['newer']);
});

test("message UUID pagination uses the same immutable server cut on every page",async()=>{
  const cut='2026-10-31T20:15:00.123456Z';
  const messages=Array.from({length:201},(_,i)=>({id:String(i).padStart(4,'0'),thread_id:'thread',sender_user_id:'other',body:'retained',message_type:'text',created_at:cut}));
  const h=harness({read:q=>({error:null,data:q.table==='chat_thread_activity'?[row('thread')]
    :q.table==='chat_messages'?messages.filter(m=>!q.filters.after_id || m.id>q.filters.after_id).slice(0,200):[]})});
  const result=await h.api.listChatMessages('thread',cut);
  assert.equal(result.length,201);
  const queries=h.state.queries.filter(q=>q.table==='chat_messages');
  assert.equal(queries.length,2);
  assert.ok(queries.every(q=>q.filters.through_created_at===cut));
  assert.equal(h.state.writes.length,0,'paging only reads');
});

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
    read: q => ({ data: q.table === "chat_thread_activity" ? [row("one", true), row("two", true)] : [], error: null }),
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
  const h = harness({ communication, read: q => ({ data: q.table === "chat_thread_activity" ? [row("one", true)] : [], error: null }) });
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

test("room-only optimization is confined to signal-owned inbox reads while legacy cleanup keeps its snapshot", async () => {
  let snapshots = 0, roomReads = 0;
  const h = harness({
    read: q => ({ data: q.table === "chat_thread_activity" ? [row("one", true)] : [], error: null }),
    communication: {
      formatCommunicationRoomCode: value => value, isCommunicationRoomActive: () => false,
      getCommunicationRoomSnapshot: async () => { snapshots++; return { room: null }; },
      getCommunicationRoom: async () => { roomReads++; return null; },
    },
  });
  await h.api.listChatThreads();
  assert.equal(snapshots, 1); assert.equal(roomReads, 0);
  assert.equal(h.state.writes.length, 1);
  assert.equal(h.state.writes[0][3].retainTransportSettlement, false);
  await h.api.listChatThreads({ signal: new AbortController().signal });
  assert.equal(snapshots, 1); assert.equal(roomReads, 1);
  assert.equal(h.state.writes.length, 2);
  assert.equal(h.state.writes[1][3].retainTransportSettlement, true);
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
