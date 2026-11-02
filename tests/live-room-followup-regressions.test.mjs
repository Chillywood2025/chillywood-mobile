import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import ts from "typescript";

// Execute production closures, effects and JSX. Network, timers and native views
// are controlled boundaries; this is not installed-device or provider proof.
// LIVE_ROOM_REVIEW_REF permits the same regression expectations against old Git
// source, without touching the worktree (the reviewed baseline fails them).
const read = (path) => process.env.LIVE_ROOM_REVIEW_REF
  ? execFileSync("git", ["show", `${process.env.LIVE_ROOM_REVIEW_REF}:${path}`], { encoding: "utf8" })
  : fs.readFileSync(path, "utf8");
const parse = (path) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const player = parse("app/player/[id].tsx"), stage = parse("app/watch-party/live-stage/[partyId].tsx");
const all = (ast) => { const nodes = []; const visit = (node) => { nodes.push(node); ts.forEachChild(node, visit); }; visit(ast); return nodes; };
const find = (ast, predicate) => { const nodes = all(ast).filter(predicate); assert.equal(nodes.length, 1); return nodes[0]; };
const evaluate = (code, scope) => { vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, scope); return scope; };
const fn = (ast, node, scope) => evaluate(`globalThis.actual = ${node.getText(ast)};`, scope).actual;
const callback = (ast, name, scope) => {
  const init = find(ast, (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).initializer;
  return fn(ast, ts.isCallExpression(init) && init.expression.getText(ast) === "useCallback" ? init.arguments[0] : init, scope);
};
const noop = () => {};
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const held = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const timers = () => {
  let next = 1; const entries = new Map();
  return { entries, setTimeout: (call, delay) => { const id = next++; entries.set(id, { call, delay }); return id; },
    clearTimeout: (id) => entries.delete(id), fire() { const [id, entry] = entries.entries().next().value; entries.delete(id); entry.call(); } };
};
// Older closure-level regressions share the production retirement and channel
// ownership helpers with the new mounted suite; do not replace their predicates
// with an always-allowed authority mock.
function installPlayerRoomLifetime(scope, current, readSnapshot = async () => null) {
  const helper = { exports: {}, setTimeout, clearTimeout };
  evaluate(fs.readFileSync('_lib/roomSnapshotAuthority.ts', 'utf8'), helper);
  scope.playerPartyOwner = { channelKey: 'regression-owner' };
  scope.playerPartyAuthority = helper.exports.createRoomSnapshotAuthority({
    partyId: scope.partyId.trim().toUpperCase(), userId: scope.sessionUserId || 'user',
    current, unavailable: noop, read: readSnapshot,
  });
  scope.pendingPlayerPartyChannelRemovals = new Map();
  scope.retirePlayerPartyChannel = callback(player, 'retirePlayerPartyChannel', scope);
  scope.waitForPlayerPartyChannelRetirement = callback(player, 'waitForPlayerPartyChannelRetirement', scope);
}
const tokenEffect = find(player, (node) => ts.isCallExpression(node) && node.expression.getText(player) === "useEffect"
  && node.arguments[0]?.getText(player).includes("const requestKey = [")
  && node.arguments[0]?.getText(player).includes("player-watch-party-live-authority-refresh")).arguments[0];
function tokenHarness() {
  const clock = timers(), state = { requests: 0, status: null, serial: 0, contract: null, renderable: null };
  let respond = async () => ({ status: "unavailable", reason: "request_failed", roomName: "ROOM", responseStatus: 503 });
  const scope = { inWatchParty: true, partyId: "ROOM", watchPartyEntryAllowed: true, Platform: { OS: "ios" },
    watchPartyLiveKitIdentity: "user", trackedUserId: "user", watchPartyLiveKitJoinContract: null, watchPartyLiveKitJoinContractExpired: false,
    desiredWatchPartyLiveKitParticipantRole: "viewer", desiredWatchPartyLiveKitCanPublish: false,
    desiredWatchPartyLiveKitAuthority: { participantRole: "viewer", canPublish: false },
    currentWatchPartyMembershipAuthoritySignature: "viewer|listener|noSpeak|unmuted|active", currentWatchPartyParticipantName: "User",
    currentWatchPartyParticipantMuted: false, watchPartyLiveKitContractRequestKeyRef: { current: "" },
    watchPartyLiveKitAuthorityRetryKeyRef: { current: "" }, watchPartyLiveKitAuthorityRetryAttemptsRef: { current: {} },
    watchPartyLiveKitAuthorityRetryTimeoutRef: { current: null }, watchPartyLiveKitMountedRef: { current: true },
    watchPartyLiveKitOperationOwner: "ROOM:user:session", watchPartyLiveKitOperationOwnerRef: { current: "ROOM:user:session" },
    consumePreparedLiveKitJoinBoundary: () => null, prepareLiveKitJoinBoundary: async () => { state.requests++; return respond(); },
    setWatchPartyLiveKitJoinContract: (value) => { state.contract = value; }, setWatchPartyLiveKitRenderableContract: (value) => { state.renderable = value; },
    setWatchPartyLiveKitHardFallbackReason: noop, setWatchPartyLiveKitRetryStatus: (value) => { state.status = value; },
    setWatchPartyLiveKitAuthorityRetrySerial: (update) => { state.serial = update(state.serial); },
    refreshPartyMembershipSnapshot: async () => null, debugLog: noop, ...clock,
    WATCH_PARTY_LIVEKIT_AUTHORITY_RETRY_LIMIT: 3, WATCH_PARTY_LIVEKIT_AUTHORITY_RETRY_BASE_DELAY_MILLIS: 100,
    isLiveKitParticipantTokenExpired: (token) => token === "expired",
    canUseWatchPartyLiveRenderableContract: () => true, watchPartyLiveContractMatchesDesiredAuthority: () => true };
  let cleanup;
  return { state, scope, clock, respond: (value) => { respond = value; }, run() { cleanup?.(); cleanup = fn(player, tokenEffect, scope)(); }, stop() { cleanup?.(); },
    retry: all(player).some((node) => ts.isVariableDeclaration(node) && node.name.getText(player) === "retryWatchPartyLiveKit")
      ? callback(player, "retryWatchPartyLiveKit", scope) : noop };
}

test("transient token failure retries unchanged viewer authority, then succeeds", async () => {
  const h = tokenHarness(); h.run(); await flush();
  assert.equal(h.state.requests, 1); assert.equal(h.clock.entries.size, 1); assert.equal(h.state.status.canRetry, false);
  const ready = { status: "ready", roomName: "ROOM", participantRole: "viewer", participantToken: "fresh", requestedGrants: { canPublish: false } };
  h.respond(async () => ready); h.clock.fire(); h.run(); await flush();
  assert.equal(h.state.requests, 2); assert.equal(h.state.contract, ready); assert.equal(h.state.status, null);
  assert.equal(h.clock.entries.size, 0); h.stop();
});

test("token transport retry budget is bounded and explicit retry starts a fresh budget", async () => {
  const h = tokenHarness(); h.run(); await flush();
  for (let i = 0; i < 3; i++) { assert.equal(h.clock.entries.size, 1); h.clock.fire(); h.run(); await flush(); }
  assert.equal(h.state.requests, 4); assert.equal(h.clock.entries.size, 0); assert.equal(h.state.status.canRetry, true);
  h.retry(); h.run(); await flush(); assert.equal(h.state.requests, 5); assert.equal(h.clock.entries.size, 1); h.stop();
});

for (const error of [{ status: "unavailable", reason: "unauthenticated" },
  { status: "unavailable", reason: "request_failed", responseStatus: 403 },
  { status: "unavailable", reason: "not_configured" }]) {
  test(`token ${error.reason}/${error.responseStatus ?? "none"} clears authority without automatic retry`, async () => {
    const h = tokenHarness(); h.respond(async () => error); h.state.renderable = { old: true }; h.run(); await flush();
    assert.equal(h.clock.entries.size, 0); assert.equal(h.state.renderable, null); assert.equal(h.state.status.canRetry, true); h.stop();
  });
}

test("expired ready token uses bounded retry instead of appearing connected", async () => {
  const h = tokenHarness(); h.respond(async () => ({ status: "ready", participantToken: "expired", requestedGrants: { canPublish: false } }));
  h.run(); await flush(); assert.equal(h.state.contract, null); assert.equal(h.clock.entries.size, 1); h.stop();
});

test("rejected token request and malformed transient response both schedule bounded recovery", async () => {
  for (const response of [async () => { throw Error("network unavailable"); }, async () => ({ status: "unavailable", reason: "invalid_response" })]) {
    const h = tokenHarness(); h.respond(response); h.run(); await flush();
    assert.equal(h.clock.entries.size, 1); assert.equal(h.state.status.canRetry, false); h.stop();
  }
});

for (const boundary of ["cleanup", "owner replacement", "background"]) {
  test(`token completion and timer cannot cross ${boundary}`, async () => {
    const h = tokenHarness(), pending = held(); h.respond(() => pending.promise); h.run();
    if (boundary === "cleanup") h.stop(); else h.scope.watchPartyLiveKitOperationOwnerRef.current = boundary === "background" ? "" : "OTHER:user:session";
    pending.resolve({ status: "unavailable", reason: "request_failed", responseStatus: 503 }); await flush();
    assert.equal(h.clock.entries.size, 0); assert.equal(h.state.status, null);
  });
  test(`late ready token cannot restore retired authority after ${boundary}`, async () => {
    const h = tokenHarness(), pending = held(); h.respond(() => pending.promise); h.run();
    if (boundary === "cleanup") h.stop(); else h.scope.watchPartyLiveKitOperationOwnerRef.current = boundary === "background" ? "" : "OTHER:user:session";
    pending.resolve({ status: "ready", roomName: "ROOM", participantRole: "viewer", participantToken: "fresh", requestedGrants: { canPublish: false } });
    await flush(); assert.equal(h.state.contract, null); assert.equal(h.state.renderable, null); h.stop();
  });
}

test("downgraded authority retries retain snapshot readback and cancel a late readback", async () => {
  for (const retire of [false, true]) {
    const h = tokenHarness(), snapshot = held(); let reads = 0;
    h.scope.watchPartyLiveContractMatchesDesiredAuthority = () => false;
    h.scope.refreshPartyMembershipSnapshot = () => { reads++; return snapshot.promise; };
    h.respond(async () => ({ status: "ready", roomName: "ROOM", participantRole: "viewer", participantToken: "fresh", requestedGrants: { canPublish: false } }));
    h.run(); await flush(); h.clock.fire(); assert.equal(reads, 1); assert.equal(h.state.serial, 0);
    if (retire) h.stop(); snapshot.resolve(null); await flush(); assert.equal(h.state.serial, retire ? 0 : 1); h.stop();
  }
});

test("token effect cleanup releases failed/in-flight keys and cancels its own timer", async () => {
  const h = tokenHarness(); h.run(); await flush(); h.stop();
  assert.equal(h.scope.watchPartyLiveKitContractRequestKeyRef.current, ""); assert.equal(h.clock.entries.size, 0);
  h.run(); await flush(); assert.equal(h.state.requests, 2); h.stop();
});

test("a queued retry callback remains inert after cleanup or owner replacement", async () => {
  for (const boundary of ["cleanup", "owner replacement"]) {
    const h = tokenHarness(); h.run(); await flush(); const pendingTimer = [...h.clock.entries.values()][0].call;
    if (boundary === "cleanup") h.stop(); else h.scope.watchPartyLiveKitOperationOwnerRef.current = "OTHER:user:session";
    pendingTimer(); assert.equal(h.state.serial, 0); h.stop();
  }
});

const commentEffect = all(player).find((node) => ts.isCallExpression(node) && node.expression.getText(player) === "useEffect"
  && node.arguments[0]?.getText(player).includes("player-comments-"))?.arguments[0];
test("production persisted INSERT displays an ordinary remote comment when sender broadcast is lost", async () => {
  if (commentEffect) {
    const h = commentsHarness(); await flush(); h.event({ eventType: "INSERT", new: row() });
    assert.equal(h.state.messages.length, 1); assert.equal(h.state.messages[0].body, "Original"); h.cleanup();
    return;
  }
  // Former-source control: execute its actual database callback, rather than
  // merely failing because the new dedicated comments effect is absent.
  const registration = find(player, (node) => ts.isCallExpression(node)
    && node.expression.getText(player) === "channel.on" && node.arguments[0]?.getText(player) === '"postgres_changes"'
    && node.arguments[1]?.getText(player).includes('table: "watch_party_room_messages"'));
  const messages = [];
  const listener = fn(player, registration.arguments[2], { decodePartySeatRequestMessage: () => null,
    pushPartyOverlayMessage: (message) => messages.push(message), setPartyOverlayMessages: (value) => messages.push(...value) });
  listener({ eventType: "INSERT", new: row() });
  assert.equal(messages.length, 1, "persisted remote chat must not depend on a best-effort sender broadcast");
});
function commentsHarness(partyId = "ROOM") {
  const state = { rows: [], messages: [], error: null, reads: 0, removed: 0, sending: false, draft: "Original", alerts: [], filters: [], subscriptionFilter: "" };
  let query = async () => ({ data: state.rows, error: state.error }), realtime, subscribed, interval;
  const scope = { inWatchParty: true, partyId, watchPartyEntryAllowed: true, sessionUserId: "self", sessionGeneration: "session",
    partyCommentOwnerKeyRef: { current: `${partyId}:self:session` }, partyCommentRevisionRef: { current: 0 }, partyCommentSendRef: { current: null },
    refreshPartyCommentsRef: { current: null }, partyMembershipMapRef: { current: {} },
    decodePartySeatRequestMessage: (body) => String(body).startsWith("__seat:") ? {} : null,
    setPartyOverlayMessages: (update) => { state.messages = typeof update === "function" ? update(state.messages) : update; },
    setInterval: (call) => { interval = call; return 1; }, clearInterval: noop, LIVE_COMMENT_FALLBACK_REFRESH_MS: 15_000,
    supabase: { from: () => { const builder = { select: () => builder, eq: (field, value) => { state.filters.push([field, value]); return builder; }, order: () => builder,
      limit: () => { state.reads++; return query(); } }; return builder; },
    channel: () => { const channel = { on: (_, options, handler) => { assert.equal(options.event, "*"); state.subscriptionFilter = options.filter; realtime = handler; return channel; },
      subscribe: (handler) => { subscribed = handler; return channel; } }; return channel; }, removeChannel: () => { state.removed++; return Promise.resolve(); } },
    partyCommentDraft: state.draft, partyUserId: "self", partyDisplayNameRef: { current: "Me" },
    setControlsVisible: noop, resetAutoHideTimer: noop, setPartyCommentSending: (value) => { state.sending = value; },
    setPartyCommentDraft: (value) => { state.draft = typeof value === "function" ? value(state.draft) : value; },
    Alert: { alert: (...args) => state.alerts.push(args) }, partySocialChannelRef: { current: { send: async () => { throw Error("broadcast lost"); } } },
    getSafePartyUserId: async () => "self", sendPartyMessageRecord: async () => null };
  installPlayerRoomLifetime(scope, () => scope.partyCommentOwnerKeyRef.current === `${partyId}:self:session`);
  scope.pushPartyOverlayMessage = callback(player, "pushPartyOverlayMessage", scope);
  assert.ok(commentEffect, "production owns durable chat recovery instead of broadcast-only display");
  const cleanup = fn(player, commentEffect, scope)();
  return { state, scope, cleanup, event: (payload) => realtime(payload), subscribe: () => subscribed("SUBSCRIBED"), tick: () => interval(),
    query: (value) => { query = value; }, send: callback(player, "onSendPartyComment", scope) };
}
const row = (id = "saved", text = "Original") => ({ id, user_id: "self", username: "Me", text, created_at: "2026-10-15T05:00:00Z" });

test("lowercase room route normalizes both comment query and realtime scope", async () => {
  const h = commentsHarness(" room "); await flush(); assert.deepEqual(h.state.filters, [["party_id", "ROOM"]]);
  assert.equal(h.state.subscriptionFilter, "party_id=eq.ROOM"); h.cleanup();
});

test("ordinary persisted comment reaches open peer without a broadcast; edit/delete reconcile", async () => {
  const h = commentsHarness(); await flush(); h.event({ eventType: "INSERT", new: row() });
  assert.equal(h.state.messages[0].body, "Original"); h.event({ eventType: "UPDATE", new: row("saved", "Edited") });
  assert.equal(h.state.messages[0].body, "Edited"); h.event({ eventType: "DELETE", old: { id: "saved" } });
  assert.equal(h.state.messages.length, 0); h.cleanup();
});

test("subscription recovery and polling heal missed inserts and deletes without clearing on failed reads", async () => {
  const h = commentsHarness(); await flush(); h.state.rows = [row()]; h.subscribe(); await flush();
  assert.equal(h.state.messages[0].body, "Original"); h.state.error = Error("offline"); h.state.rows = null; h.tick(); await flush();
  assert.equal(h.state.messages.length, 1); h.state.error = null; h.state.rows = []; h.tick(); await flush();
  assert.equal(h.state.messages.length, 0); h.cleanup();
});

for (const event of ["UPDATE", "DELETE"]) {
  test(`older history and delayed send receipt cannot revert realtime ${event}`, async () => {
    const h = commentsHarness(); await flush(); const history = held(), receipt = held();
    h.query(() => history.promise); h.tick(); h.scope.sendPartyMessageRecord = () => receipt.promise;
    const sending = h.send(); h.event({ eventType: "INSERT", new: row() });
    h.event(event === "DELETE" ? { eventType: event, old: { id: "saved" } } : { eventType: event, new: row("saved", "Edited") });
    history.resolve({ data: [row()], error: null }); receipt.resolve({ id: "saved", userId: "self", body: "Original", createdAt: row().created_at });
    await sending; await flush(); assert.deepEqual(Array.from(h.state.messages, (message) => message.body), event === "DELETE" ? [] : ["Edited"]);
    assert.equal(h.state.alerts.length, 0); assert.equal(h.state.draft, ""); h.cleanup();
  });
}

test("stale broadcast is only an authoritative refresh hint, never resurrected text", async () => {
  const h = commentsHarness(); await flush(); h.state.rows = [row("saved", "Edited")];
  const broadcast = find(player, (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "on" && node.arguments[0]?.getText(player) === '"broadcast"'
    && node.arguments[1]?.getText(player) === '{ event: "message" }');
  fn(player, broadcast.arguments[2], { ...h.scope, active: true })({ payload: { id: "saved", kind: "chat", body: "Original" } });
  await flush(); assert.equal(h.state.messages[0].body, "Edited"); h.cleanup();
});

test("retired comment owner cannot apply reads, channel events or a late durable receipt", async () => {
  const h = commentsHarness(); await flush(); const pending = held(); h.query(() => pending.promise); h.tick(); h.cleanup();
  h.event({ eventType: "INSERT", new: row() }); pending.resolve({ data: [row()], error: null }); await flush();
  assert.equal(h.state.messages.length, 0); assert.equal(h.scope.refreshPartyCommentsRef.current, null); assert.equal(h.state.removed, 1);
  const receipt = held(); h.scope.sendPartyMessageRecord = () => receipt.promise; const sending = h.send();
  h.scope.partyCommentOwnerKeyRef.current = "OTHER:self:session"; receipt.resolve({ id: "saved", body: "Original" }); await sending;
  assert.equal(h.state.messages.length, 0);
});

test("Stage initialization cannot install channels or heartbeat after final snapshot cleanup", async () => {
  const effect = find(stage, (node) => ts.isCallExpression(node) && node.expression.getText(stage) === "useEffect"
    && node.arguments[0]?.getText(stage).includes("const init = async () =>")
    && node.arguments[0]?.getText(stage).includes("heartbeatRef.current = setInterval")).arguments[0];
  const pending = held(); let refreshing = false, channels = 0, heartbeats = 0;
  const membership = { userId: "user", role: "viewer", stageRole: "listener", canSpeak: false, membershipState: "active" };
  const snapshot = { room: { partyId: "ROOM", roomType: "live", hostUserId: "host" }, memberships: [membership] };
  const scope = { canUseBetaStage: true, partyId: "ROOM", partyIdParam: "ROOM", debugLiveStage: noop, reportRuntimeError: noop, debugLog: noop,
    getWritablePartyUserId: async () => "user", readUserProfile: async () => ({ username: "User" }), resolveIdentityName: (a, b) => a || b,
    getPartyRoomSnapshot: async () => snapshot, resolveRoomAccess: async () => ({ isAllowed: true }), readLiveWatchPartyMoneyAccess: async () => ({ allowed: true }),
    membershipMapRef: { current: { user: membership } }, myCameraPreviewUrlRef: {}, stageLocalMediaIntentRef: { current: true },
    canStageMembershipPublishMedia: () => false, joinPartyRoomSession: async () => membership,
    refreshStageSnapshot: async () => { refreshing = true; await pending.promise; return null; }, syncStageSnapshot: noop,
    channelRef: {}, roomRealtimeChannelRef: {}, heartbeatRef: {}, setInterval: () => { heartbeats++; return 1; }, clearInterval: noop,
    setTimeout: () => 1, clearTimeout: noop, STAGE_HEARTBEAT_INTERVAL_MILLIS: 15000, buildStageParticipantsFromPresence: noop,
    handleAuthoritativeLiveRoomEnded: noop, supabase: { auth: { getUser: async () => ({ data: { user: {} } }) }, getChannels: () => [], removeChannel: noop,
      channel: () => { channels++; const channel = { on: () => channel, subscribe: () => channel }; return channel; } } };
  for (const node of all(stage)) if (ts.isIdentifier(node) && node.text.startsWith("set")) scope[node.text] ??= noop;
  const cleanup = fn(stage, effect, scope)(); await flush(); assert.equal(refreshing, true); cleanup(); pending.resolve(); await flush();
  assert.equal(channels, 0); assert.equal(heartbeats, 0);
});

test("Player social bootstrap cannot install channels after awaited removal is abandoned", async () => {
  const pending = held(); let removing = false, channels = 0, heartbeats = 0;
  const oldChannel = { topic: "realtime:party-chat-ROOM" };
  const membership = { partyId: 'ROOM', userId: 'me', role: 'viewer', membershipState: 'active', leftAt: null };
  const snapshot = { room: { partyId: 'ROOM', hostUserId: 'host', isActive: true, roomGeneration: 'generation' }, memberships: [membership] };
  const scope = { active: true, partyId: "ROOM", sessionUserId: "me", partySyncUserIdRef: { current: "me" }, partyDisplayNameRef: {}, partyAvatarUrlRef: {}, myCameraPreviewUrlRef: {},
    partySocialChannelRef: { current: oldChannel }, watchPartyLiveKitIdentityRef: {}, partyMembershipRosterPollRef: {}, setPartyUserId: noop,
    watchPartyLiveKitMountedRef: { current: true }, partyRoomHostUserIdRef: {}, updatePartyMembershipMap: noop,
    getActivePartyMemberships: rows => rows, resolvePartyParticipantDisplayName: () => 'Viewer',
    setPartyViewerCount: noop, setViewerCount: noop, setPartyParticipantPreview: noop, setPartyParticipants: noop,
    joinPartyRoomSession: async () => membership, setVerifiedPlayerPartyMembershipOwner: noop,
    setPartyOverlayMessages: noop, fetchPartyMessages: async () => [],
    getWatchPartyHostAuthority: () => ({ isHost: false }), supabase: { auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
      getChannels: () => [oldChannel], removeChannel: async () => { removing = true; await pending.promise; },
      channel: () => { channels++; const channel = { on: () => channel, subscribe: () => channel }; return channel; } },
    setInterval: () => { heartbeats++; return 1; }, clearInterval: noop };
  installPlayerRoomLifetime(scope, () => scope.active, async () => snapshot);
  scope.refreshPartyMembershipSnapshot = callback(player, 'refreshPartyMembershipSnapshot', scope);
  const running = callback(player, "bootstrapPartySocial", scope)(); await flush(); assert.equal(removing, true);
  scope.active = false; pending.resolve(); await running; assert.equal(channels, 0); assert.equal(heartbeats, 0);
});

for (const boundary of ["room", "account", "session", "unmount"]) {
  test(`Player membership read cannot overwrite authority after ${boundary} replacement`, async () => {
    const pending = held(), changes = [];
    const scope = { partyId: "ROOM", partyCommentOwnerKey: "ROOM:user:session", partyCommentOwnerKeyRef: { current: "ROOM:user:session" },
      watchPartyLiveKitMountedRef: { current: true }, getPartyRoomSnapshot: () => pending.promise,
      partyRoomHostUserIdRef: { current: "current-host" }, updatePartyMembershipMap: (value) => changes.push(value) };
    installPlayerRoomLifetime(scope, () => scope.watchPartyLiveKitMountedRef.current
      && scope.partyCommentOwnerKeyRef.current === scope.partyCommentOwnerKey, () => pending.promise);
    const reading = callback(player, "refreshPartyMembershipSnapshot", scope)();
    if (boundary === "unmount") scope.watchPartyLiveKitMountedRef.current = false;
    else scope.partyCommentOwnerKeyRef.current = { room: "OTHER:user:session", account: "ROOM:other:session", session: "ROOM:user:new-session" }[boundary];
    pending.resolve({ room: { hostUserId: "old-host" }, memberships: [{ role: "host", userId: "old-user" }] });
    assert.equal(await reading, null); assert.equal(scope.partyRoomHostUserIdRef.current, "current-host"); assert.deepEqual(changes, []);
  });
}

test("actual Stage rear-camera self preview is not mirrored", () => {
  const component = find(stage, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "LiveKitHybridParticipantVideo");
  const cameraTrack = { track: { mediaStreamTrack: { getSettings: () => ({ facingMode: "environment" }) } } };
  const scope = { React, useMemo: (run) => run(), useEffect: noop, useLocalCameraMirror: () => false,
    useHybridLiveKitLocalParticipant: () => ({ cameraTrack, localParticipant: { identity: "self" } }), useHybridLiveKitTracks: () => [],
    Track: { Source: { Camera: "camera", ScreenShare: "screen" } }, canRenderLocalParticipantLiveKitTrack: () => true,
    canRenderParticipantSpecificLiveKitTrack: () => false, isHybridLiveKitTrackReference: () => true, View: "View",
    HybridLiveKitVideoTrack: "VideoTrack", styles: { stagePresenceCameraFill: {} }, debugLog: noop };
  evaluate(`${component.getText(stage)};globalThis.component = LiveKitHybridParticipantVideo;`, scope);
  const view = scope.component({ participantId: "self", fallback: null, publishLocalCamera: true });
  assert.equal(view.props.children.props.mirror, false);
});
