import assert from "node:assert/strict";
import test from "node:test";
import { clock, held, mountComposition, noop, productionModule, settle, sourceComposition } from "./helpers/live-recovery-mounted-source.mjs";

const playerPath = "app/player/[id].tsx";
const authority = productionModule("_lib/watch-party/watch-party-live-source-truth.ts");
const performance = productionModule("_lib/performancePolicy.ts");
const stagePresentation = productionModule("_lib/watch-party/live-stage-presentation.ts");
const stageLifecycle = productionModule("_lib/watch-party/live-stage-lifecycle.ts");
const roomShared = productionModule("_lib/watch-party/room-shared.ts");
const ready = (roomName = "ROOM") => ({ status: "ready", roomName, participantRole: "viewer", participantToken: "test-token",
  requestedGrants: { canPublish: false } });
const unavailable = { status: "unavailable", reason: "request_failed", responseStatus: 503 };

async function mountPlayerToken(t, options = {}) {
  const time = clock(), requests = [], appListeners = new Set();
  let response = async () => unavailable;
  const source = sourceComposition(playerPath, "PlayerScreen", options.mutation);
  source.constant("WATCH_PARTY_LIVEKIT_AUTHORITY_RETRY_LIMIT");
  source.constant("WATCH_PARTY_LIVEKIT_AUTHORITY_RETRY_BASE_DELAY_MILLIS");
  for (const name of ["watchPartyLiveKitJoinContract", "watchPartyLiveKitRenderableContract", "watchPartyLiveKitAuthorityRetrySerial",
    "watchPartyLiveKitRetryStatus", "watchPartyLiveKitHardFallbackReason", "watchPartyLiveKitContractRequestKeyRef",
    "watchPartyLiveKitOperationOwnerRef", "watchPartyLiveKitAuthorityRetryKeyRef", "watchPartyLiveKitAuthorityRetryAttemptsRef",
    "watchPartyLiveKitAuthorityRetryTimeoutRef", "watchPartyLiveKitMountedRef", "partySeatRequestPollRef",
    "watchPartyLiveVoiceIdleTimeoutRef", "watchPartyLiveVolumeIntervalRef", "playerAppState", "playerMediaIsInteractive",
    "desiredWatchPartyLiveKitAuthority", "desiredWatchPartyLiveKitCanPublish", "watchPartyLiveKitOperationOwner", "retryWatchPartyLiveKit"])
    source.declaration(name);
  source.assignment("watchPartyLiveKitOperationOwnerRef.current =");
  source.effect("watchPartyLiveKitMountedRef.current = true");
  source.effect('AppState.addEventListener("change"');
  source.effect('watchPartyLiveKitContractRequestKeyRef.current = "";\n    watchPartyLiveKitAuthorityRetryAttemptsRef.current = {};');
  source.effect("const requestKey = [");
  const values = { inWatchParty: true, partyId: "ROOM", sessionUserId: "user", sessionGeneration: "session", isSignedIn: true, isFocused: true,
    watchPartyEntryAllowed: true, watchPartyLiveKitIdentity: "user", trackedUserId: "user",
    desiredWatchPartyLiveKitParticipantRole: "viewer", currentWatchPartyParticipantMuted: false,
    currentWatchPartyMembershipAuthoritySignature: "viewer:active", currentWatchPartyParticipantName: "User",
    watchPartyLiveKitJoinContractExpired: false, refreshPartyMembershipSnapshot: async () => null };
  const Component = source.compile({ inputs: Object.keys(values),
    outputs: ["watchPartyLiveKitJoinContract", "watchPartyLiveKitRetryStatus", "watchPartyLiveKitAuthorityRetrySerial", "retryWatchPartyLiveKit"],
    globals: { ...time, ...authority, Platform: { OS: "ios" }, AppState: { currentState: "active",
      addEventListener: (_, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } },
    prepareLiveKitJoinBoundary: async request => { requests.push(request); return response(request); }, consumePreparedLiveKitJoinBoundary: () => null,
    // Token parsing is a separate production boundary. These cases exercise
    // transport retry/lifecycle with a validated token, not JWT verification.
    isLiveKitParticipantTokenExpired: () => false, debugLog: noop } });
  const mounted = await mountComposition(t, Component, values, options);
  return { ...mounted, get current() { return mounted.current; }, time, requests,
    respond: value => { response = value; }, appState: async state => settle(() => { for (const listener of appListeners) listener(state); }) };
}

test("React-mounted production token recovery retries unchanged authority without manually rerunning an effect", async t => {
  const h = await mountPlayerToken(t);
  assert.equal(h.requests.length, 1);
  assert.equal(h.current.watchPartyLiveKitRetryStatus.canRetry, false);
  h.respond(async () => ready());
  await h.time.nextTimeout();
  assert.equal(h.requests.length, 2, "retry state must actually reschedule the production effect");
  assert.equal(h.current.watchPartyLiveKitJoinContract?.roomName, "ROOM");
  assert.equal(h.time.timeouts.size, 0);
  await h.update();
  assert.equal(h.requests.length, 2, "unrelated render must not acquire another contract");
});

test("React-mounted production retry budget is bounded and explicit retry owns a new attempt", async t => {
  const h = await mountPlayerToken(t);
  for (let attempt = 0; attempt < 6; attempt++) await h.time.nextTimeout();
  assert.equal(h.requests.length, 7);
  assert.equal(h.time.timeouts.size, 0);
  assert.equal(h.current.watchPartyLiveKitRetryStatus.canRetry, true);
  h.respond(async () => ready());
  await settle(h.current.retryWatchPartyLiveKit);
  assert.equal(h.requests.length, 8);
  assert.equal(h.current.watchPartyLiveKitJoinContract?.roomName, "ROOM");
});

for (const boundary of ["background", "room", "account", "session", "unmount"]) {
  test(`React-mounted in-flight token request retires at ${boundary}`, async t => {
    const h = await mountPlayerToken(t), late = held();
    h.respond(() => late.promise);
    await h.time.nextTimeout();
    assert.equal(h.requests.length, 2);
    // A replacement owner has a different transport request. Completing the old
    // promise must not also complete that new request through our fake service.
    h.respond(() => held().promise);
    if (boundary === "background") await h.appState("background");
    else if (boundary === "unmount") await h.unmount();
    else await h.update({ [({ room: "partyId", account: "sessionUserId", session: "sessionGeneration" })[boundary]]: "NEW" });
    await settle(() => late.resolve(ready()));
    assert.notEqual(h.current.watchPartyLiveKitJoinContract?.roomName, "ROOM", "retired response cannot regain prior authority");
    assert.equal(h.time.timeouts.size, 0);
  });

  test(`React-mounted pending token retry is cancelled and its queued callback is inert after ${boundary}`, async t => {
    const h = await mountPlayerToken(t);
    assert.equal(h.time.timeouts.size, 1, "a real retry is still pending at the ownership boundary");
    const [timerId, timer] = h.time.timeouts.entries().next().value;
    h.respond(() => held().promise);
    if (boundary === "background") await h.appState("background");
    else if (boundary === "unmount") await h.unmount();
    else await h.update({ [({ room: "partyId", account: "sessionUserId", session: "sessionGeneration" })[boundary]]: "NEW" });
    assert.equal(h.time.timeouts.has(timerId), false, "React cleanup cancelled the retired owner's timer");
    const requests = h.requests.length;
    const serial = h.current.watchPartyLiveKitAuthorityRetrySerial;
    await settle(timer.callback);
    assert.equal(h.requests.length, requests, "a callback already queued by the clock cannot acquire authority");
    assert.equal(h.current.watchPartyLiveKitAuthorityRetrySerial, serial);
    assert.equal(h.time.timeouts.size, 0);
  });
}

test("React strict effect replay cancels retired ownership and still recovers a live token", async t => {
  const h = await mountPlayerToken(t, { strict: true });
  assert.equal(h.requests.length, 2);
  assert.equal(h.time.timeouts.size, 1, "only the surviving setup may schedule recovery");
  h.respond(async () => ready());
  await h.time.nextTimeout();
  assert.equal(h.current.watchPartyLiveKitJoinContract?.roomName, "ROOM");
  await h.unmount();
  assert.equal(h.time.timeouts.size, 0);
});

test("mounted dependency negative control rejects removal of the production retry serial dependency", async t => {
  const mutation = source => {
    const needle = "    watchPartyLiveKitAuthorityRetrySerial,\n";
    assert.equal(source.split(needle).length, 2, "mutate exactly the real dependency entry");
    return source.replace(needle, "");
  };
  const h = await mountPlayerToken(t, { mutation });
  h.respond(async () => ready());
  await h.time.nextTimeout();
  assert.equal(h.current.watchPartyLiveKitAuthorityRetrySerial, 1, "actual timer updated React state");
  assert.equal(h.requests.length, 1, "removed dependency reproduces the stalled recovery");
  assert.equal(h.current.watchPartyLiveKitJoinContract, null);
});

const row = (id = "message", text = "Original") => ({ id, user_id: "peer", username: "Peer", text, created_at: "2026-10-15T05:00:00Z" });
async function mountComments(t, options = {}) {
  const time = clock(), channels = [], removed = [], reads = [];
  let history = async () => ({ data: [], error: null });
  const source = sourceComposition(playerPath, "PlayerScreen", options.mutation);
  for (const name of ["partyCommentSendRef", "partyCommentOwnerKey", "partyCommentOwnerKeyRef", "partyCommentRevisionRef", "refreshPartyCommentsRef", "partyOverlayMessages"])
    source.declaration(name);
  source.assignment("partyCommentOwnerKeyRef.current =");
  source.effect("player-comments-");
  const values = { inWatchParty: true, partyId: "ROOM", sessionUserId: "user", sessionGeneration: "session", watchPartyEntryAllowed: true };
  const Component = source.compile({ inputs: Object.keys(values), outputs: ["partyOverlayMessages", "refreshPartyCommentsRef"], globals: {
    ...time, ...performance, partyMembershipMapRef: { current: {} },
    decodePartySeatRequestMessage: authority.decodePartySeatRequestMessage,
    supabase: {
      from: table => { let room; const builder = { select: () => builder, eq: (_, value) => { room = value; return builder; }, order: () => builder,
        limit: () => { reads.push([table, room]); return history(room); } }; return builder; },
      channel: name => { const channel = { name, on: (_, filter, callback) => { channel.filter = filter; channel.event = callback; return channel; },
        subscribe: callback => { channel.subscribed = callback; return channel; } }; channels.push(channel); return channel; },
      removeChannel: channel => { removed.push(channel); return Promise.resolve(); },
    },
  } });
  const mounted = await mountComposition(t, Component, values, options);
  return { ...mounted, get current() { return mounted.current; }, time, channels, removed, reads,
    history: value => { history = value; }, event: async (payload, channel = channels.at(-1)) => settle(() => channel.event(payload)) };
}

async function mountStageBootstrap(t, { mutation } = {}) {
  const time = clock(), channels = [], removed = [], errors = [], snapshots = [], heartbeats = [], appliedSnapshots = [];
  const membership = { userId: "user", role: "viewer", stageRole: "listener", canSpeak: false, membershipState: "active" };
  const snapshot = partyId => ({ room: { partyId, roomType: "live", hostUserId: "host" }, memberships: [membership] });
  const source = sourceComposition("app/watch-party/live-stage/[partyId].tsx", "WatchPartyLiveStageScreen", mutation);
  for (const name of ["loading", "roomMissing", "roomEntryError", "blockedRoomAccess", "myUserId", "myUsername", "liveMoneyAccess",
    "liveMoneyNotice", "liveMoneyHostOfferState", "liveSeatPassStateByUserId", "participants", "isSpeakingById", "seatRequestState",
    "accessRetryToken", "myCameraPreviewUrlRef", "channelRef", "roomRealtimeChannelRef", "heartbeatRef", "stageLocalMediaIntentRef",
    "stageEntryOwnerRef", "stageOperationOwnerKey", "stageOperationOwnerKeyRef", "liveKitStageMountedRef", "mediaAppState",
    "liveKitPendingRecoveryRef", "liveKitRecoveryTimeoutRef", "liveKitStageAuthorityRetryTimeoutRef", "refreshStageSnapshot"])
    source.declaration(name);
  source.assignment("stageEntryOwnerRef.current.bind(");
  source.assignment("stageOperationOwnerKeyRef.current =");
  source.constant("canStageMembershipPublishMedia");
  source.constant("DEFAULT_LIVE_STAGE_LOCAL_MEDIA_INTENT");
  source.constant("STAGE_HEARTBEAT_INTERVAL_MILLIS");
  source.effect("liveKitStageMountedRef.current = true");
  source.effect("const init = async () =>");
  const values = { canUseBetaStage: true, partyId: "ROOM", partyIdParam: "ROOM",
    isFocused: true, authority: { userId: "user", sessionGeneration: "session" },
    buildStageParticipantsFromPresence: () => [], handleAuthoritativeLiveRoomEnded: noop,
    // Observe snapshot application; participant presentation is outside this
    // initialization composition. The refresh callback and its dependencies
    // remain production code, including the myUserId-driven effect restart.
    syncStageSnapshot: (value, user) => { appliedSnapshots.push({ value, user }); } };
  const Component = source.compile({ inputs: Object.keys(values), outputs: ["loading", "roomEntryError", "myUserId", "refreshStageSnapshot"], globals: {
    ...time, ...stagePresentation, ...stageLifecycle, ...roomShared, ...performance,
    Platform: { OS: "ios" }, AppState: { currentState: "active" }, debugLiveStage: noop, debugLog: noop,
    reportRuntimeError: (name, error) => errors.push([name, error]), getWritablePartyUserId: async () => "user",
    readUserProfile: async () => ({ username: "User" }),
    getPartyRoomSnapshot: partyId => { const pending = held(); snapshots.push({ partyId, ...pending }); return pending.promise; },
    resolveRoomAccess: async () => ({ isAllowed: true }), readLiveWatchPartyMoneyAccess: async () => ({ allowed: true }),
    membershipMapRef: { current: { user: membership } }, joinPartyRoomSession: async () => membership,
    touchPartyRoomSession: async input => { heartbeats.push(input); },
    supabase: { auth: { getUser: async () => ({ data: { user: {} } }) }, getChannels: () => channels.filter(channel => !removed.includes(channel)),
      removeChannel: channel => { removed.push(channel); return Promise.resolve(); },
      channel: name => { const channel = { topic: `realtime:${name}`, name, handlers: [],
        on: (event, filter, callback) => { channel.handlers.push({ event, filter, callback }); return channel; },
        subscribe: callback => { if (callback) queueMicrotask(() => callback("SUBSCRIBED")); return channel; },
        track: async () => {}, presenceState: () => ({}) }; channels.push(channel); return channel; } },
  } });
  const mounted = await mountComposition(t, Component, values);
  assert.equal(snapshots.length, 1, "initialization starts with the actual snapshot service");
  const initialRefresh = mounted.current.refreshStageSnapshot;
  await settle(() => snapshots[0].resolve(snapshot("ROOM")));
  assert.notEqual(mounted.current.refreshStageSnapshot, initialRefresh, "myUserId state recreates the production refresh callback");
  assert.equal(snapshots.length, 3, "React retires the first final await and starts replacement initialization");
  await settle(() => snapshots[2].resolve(snapshot("ROOM")));
  assert.equal(snapshots.length, 4, "replacement initialization reaches its own final snapshot await");
  return { ...mounted, get current() { return mounted.current; }, time, channels, removed, errors, snapshots, heartbeats, appliedSnapshots,
    snapshot, retiredPending: snapshots[1], pending: snapshots[3] };
}

for (const boundary of ["unmount", "room", "access revocation"]) {
  test(`React-mounted Stage bootstrap cannot install channels or heartbeat after ${boundary} during its final await`, async t => {
    const h = await mountStageBootstrap(t);
    assert.equal(h.snapshots.length, 4, "both production callback generations reached their final snapshot await");
    if (boundary === "unmount") await h.unmount();
    else await h.update(boundary === "room" ? { partyId: "OTHER", partyIdParam: "OTHER" } : { canUseBetaStage: false });
    const applied = h.appliedSnapshots.length;
    await settle(() => { h.retiredPending.resolve(h.snapshot("ROOM")); h.pending.resolve(h.snapshot("ROOM")); });
    assert.deepEqual(h.errors, []);
    assert.equal(h.appliedSnapshots.length, applied, "production snapshot ownership rejects both retired reads");
    assert.equal(h.channels.length, 0);
    assert.equal(h.time.intervals.size, 0);
    assert.equal(h.heartbeats.length, 0);
  });
}

test("React-mounted Stage installs its live resources once, heartbeats, and retires every resource on room change", async t => {
  const h = await mountStageBootstrap(t);
  await settle(() => h.retiredPending.resolve(null));
  assert.equal(h.channels.length, 0, "the initialization retired by callback recreation cannot install resources");
  await settle(() => h.pending.resolve(null));
  assert.deepEqual(h.errors, []);
  assert.equal(h.current.loading, false);
  assert.equal(h.channels.length, 2);
  assert.equal(h.time.intervals.size, 1);
  await h.time.tickIntervals();
  assert.equal(h.heartbeats.length, 1);
  assert.equal(h.heartbeats[0].partyId, "ROOM");
  await h.update({ partyId: "OTHER", partyIdParam: "OTHER" });
  assert.equal(h.removed.length, 2);
  assert.equal(h.time.intervals.size, 0);
  assert.equal(h.time.timeouts.size, 0);
});

test("Stage mounted negative control reproduces orphaned resources when the post-await cleanup guard is removed", async t => {
  const mutation = source => {
    const needle = "// Cleanup can run during the snapshot read. Never create room channels\n        // or a heartbeat after the effect that owns them has been retired.\n        if (cancelled) return;";
    assert.equal(source.split(needle).length, 2, "remove exactly the former missing cleanup guard");
    return source.replace(needle, "");
  };
  const h = await mountStageBootstrap(t, { mutation });
  await h.unmount();
  await settle(() => { h.retiredPending.resolve(null); h.pending.resolve(null); });
  assert.deepEqual(h.errors, []);
  assert.equal(h.channels.length, 4, "both retired initializations create subscriptions after unmount");
  assert.equal(h.time.intervals.size, 2, "actual former behavior leaks both retired heartbeats after unmount");
});

test("React-mounted persisted comments render remote inserts, edits and deletes without any sender broadcast", async t => {
  const h = await mountComments(t);
  await h.event({ eventType: "INSERT", new: row() });
  assert.equal(h.current.partyOverlayMessages[0].body, "Original");
  await h.event({ eventType: "UPDATE", new: row("message", "Edited") });
  assert.equal(h.current.partyOverlayMessages[0].body, "Edited");
  await h.event({ eventType: "DELETE", old: { id: "message" } });
  assert.equal(h.current.partyOverlayMessages.length, 0);
});

test("React-mounted comment polling and subscription recovery heal dropped events without clearing on a failed read", async t => {
  const h = await mountComments(t);
  h.history(async () => ({ data: [row()], error: null }));
  await settle(() => h.channels.at(-1).subscribed("SUBSCRIBED"));
  assert.equal(h.current.partyOverlayMessages.length, 1);
  h.history(async () => ({ data: null, error: Error("offline") }));
  await h.time.tickIntervals();
  assert.equal(h.current.partyOverlayMessages.length, 1);
  h.history(async () => ({ data: [], error: null }));
  await h.time.tickIntervals();
  assert.equal(h.current.partyOverlayMessages.length, 0);
});

for (const boundary of ["room", "account", "session", "unmount"]) {
  test(`React comment ${boundary} transition owns cleanup, a new subscription and rejection of old reads/events`, async t => {
    const h = await mountComments(t), pending = held(), old = h.channels[0];
    h.history(() => pending.promise);
    await h.time.tickIntervals();
    h.history(async () => ({ data: [], error: null }));
    if (boundary === "unmount") await h.unmount();
    else await h.update({ [({ room: "partyId", account: "sessionUserId", session: "sessionGeneration" })[boundary]]: "NEW" });
    assert.equal(h.removed[0], old);
    assert.equal(h.time.intervals.size, boundary === "unmount" ? 0 : 1);
    await settle(() => pending.resolve({ data: [row()], error: null }));
    await h.event({ eventType: "INSERT", new: row() }, old);
    assert.equal(h.current.partyOverlayMessages.length, 0);
    if (boundary !== "unmount") {
      assert.equal(h.channels.length, 2);
      await h.event({ eventType: "INSERT", new: row("current", "Current owner") });
      assert.equal(h.current.partyOverlayMessages[0].body, "Current owner");
    }
  });
}
