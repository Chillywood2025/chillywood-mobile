#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { invokeAccountBoundSupabaseRpc } from "../../_lib/accountBoundSupabaseRpc.mjs";
import { loadCommunicationApiSource } from "./helpers/communication-api-source.mjs";

import {
  createLiveKitMountedRuntime,
  defaultHookOptions,
  deferred,
  mountLiveKitHook,
  settleOperation,
} from "./helpers/livekit-mounted-hook-harness.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const loadActualCommunicationBroadcaster = (rpc) => {
  const source = fs.readFileSync("_lib/communication.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "_lib/communication.ts",
  }).outputText;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => {
      throw new Error("UNEXPECTED_COMMUNICATION_TABLE_ACCESS");
    },
    rpc,
  };
  const moduleMocks = {
    "./accountBoundSupabaseMutation": {
      runExactSessionAccountBoundSupabaseMutationRpc: (functionName, args, userId) => rpc(functionName, args, userId),
    },
    "./appConfig": { readAppConfig: async () => null, resolveRoomDefaultConfig: () => ({ communication: {} }) },
    "./monetization": { readCreatorPermissions: async () => null, sanitizeCreatorRoomAccessRule: (value) => value },
    "./performancePolicy": { ROOM_ACTIVITY_ACTIVE_WINDOW_MS: 60_000, ROOM_HEARTBEAT_MS: 15_000 },
    "./roomRules": {
      ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS: 60_000,
      buildRoomCapabilities: (value) => value,
      evaluateRoomAccess: async () => ({ isAllowed: true }),
      normalizeCapturePolicy: (value) => value ?? "no_recording",
      normalizeContentAccessRule: (value) => value ?? "participants_only",
      normalizeRoomMembershipState: (value) => value ?? "active",
    },
    "./supabase": { supabase },
    "./userData": { buildUserChannelProfile: () => ({ displayName: "User" }), readUserProfile: async () => null },
    "./watchParty": {
      createPartyIdentifier: () => "ROOM-1",
      getWritablePartyUserId: async () => "remote-user",
    },
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: {} } } },
    "react-native": { Platform: { OS: "ios" } },
  };
  const commonJsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    process: { env: {} },
    require: (specifier) => {
      if (Object.hasOwn(moduleMocks, specifier)) return moduleMocks[specifier];
      throw new Error(`UNEXPECTED_COMMUNICATION_IMPORT:${specifier}`);
    },
    setTimeout,
  }, { filename: "_lib/communication.ts" });
  return commonJsModule.exports.broadcastCommunicationRoomSignal;
};

const waitFor = async (harness, predicate, label) => {
  for (let turn = 0; turn < 32 && !predicate(); turn += 1) await harness.flush(2);
  assert.equal(predicate(), true, label);
};

const replacementOptions = (overrides = {}) => defaultHookOptions({
  invite: {
    ...defaultHookOptions().invite,
    communicationRoomId: "ROOM-2",
    id: "invite-2",
    ...overrides.invite,
  },
  roomId: "ROOM-2",
  ...overrides,
});

const mountCase = async (t, runtimeOptions = {}, hookOptions = defaultHookOptions()) => {
  const runtime = createLiveKitMountedRuntime(runtimeOptions);
  const harness = await mountLiveKitHook(runtime, hookOptions);
  t.after(() => harness.unmount());
  return { harness, runtime };
};

const runOperation = async (harness, callback) => (
  settleOperation(await harness.startOperation(callback), harness)
);

const stateInvalidationHandler = (channel) => {
  const handlers = channel.handlers.filter((entry) => (
    entry.event === "broadcast" && entry.filter?.event === "state:update"
  ));
  assert.equal(handlers.length, 1, "the private room channel accepts one server state invalidation");
  return handlers[0].callback;
};

const prepareLateCaptureCleanup = async (t, kind = "audio", runtimeOptions = {}) => {
  const cameraEnabled = kind === "video";
  const hookOptions = {
    initialMediaPreferences: { cameraEnabled, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: cameraEnabled ? "video" : "audio" },
  };
  const { harness, runtime } = await mountCase(t, {
    initialCamera: cameraEnabled,
    initialMic: true,
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    platformOS: "ios",
    ...runtimeOptions,
  }, defaultHookOptions(hookOptions));
  const oldCleanup = deferred();
  const queueCapture = kind === "video" ? runtime.queueCamera : runtime.queueNative;
  queueCapture({ gate: oldCleanup, interruptLatestOnCompletion: true, outcome: "success" });
  await harness.fireStopper("manual");
  await harness.commitRender(defaultHookOptions({
    ...hookOptions,
    invite: { ...hookOptions.invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement live");
  return { harness, oldCleanup, runtime };
};

const preparePendingForegroundRecovery = async (t, allowBackgroundAudio, gateKind) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    platformOS: "ios",
  }, defaultHookOptions({
    allowBackgroundAudio,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.interruptLocalCapture("microphone");
  const permissionReadsBefore = runtime.microphonePermissionReads;
  const gate = gateKind === "permission" ? runtime.deferMicrophonePermission("granted") : deferred();
  if (gateKind === "restart") runtime.queueTrackRestart({ gate, outcome: "success" });
  await harness.fireHeartbeat();
  await waitFor(harness, () => gateKind === "permission"
    ? runtime.microphonePermissionReads > permissionReadsBefore
    : runtime.trackRestarts.length === 1, "foreground microphone recovery is awaiting native work");
  return { gate, harness, runtime };
};

test("matrix 1: a heartbeat started before a strict toggle cannot overwrite the final durable microphone state", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const harness = await mountLiveKitHook(runtime);
  t.after(() => harness.unmount());
  const oldHeartbeat = runtime.deferTouch();
  await harness.fireHeartbeat();
  const nativeCallsBeforeToggle = runtime.micCalls.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await harness.flush();
  assert.equal(runtime.micCalls.length, nativeCallsBeforeToggle);
  oldHeartbeat.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  assert.equal(runtime.durableMic, true);
});

test("matrix 9: a newly allocated snapshot for the same active room does not retire a strict toggle", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const harness = await mountLiveKitHook(runtime);
  t.after(() => harness.unmount());
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  for (let turn = 0; turn < 24 && runtime.micCalls.length < 2; turn += 1) await harness.flush(2);
  await harness.fireHeartbeat();
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
});

test("matrix 16: an abandoned replacement render cannot retire the committed session", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const harness = await mountLiveKitHook(runtime);
  t.after(() => harness.unmount());
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  for (let turn = 0; turn < 24 && runtime.micCalls.length < 2; turn += 1) await harness.flush(2);
  await harness.abandonRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, communicationRoomId: "ROOM-2", id: "invite-2" },
    roomId: "ROOM-2",
  }));
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
});

test("matrix 24: membership failure is reconciliation state, never native permission denial", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const harness = await mountLiveKitHook(runtime);
  t.after(() => harness.unmount());
  runtime.queueTouch({ outcome: "null" });
  const result = await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true));
  assert.equal(result, false);
  assert.notEqual(harness.getResult().microphonePermissionState, "denied");
  assert.equal(harness.getResult().canOpenMediaSettings, false);
  assert.equal(
    harness.getResult().mediaReconciliationMessage,
    "Microphone state could not be synchronized. The call remains connected.",
  );
});

test("matrix 2: an old heartbeat cannot overwrite a successful microphone disable", async (t) => {
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  const { harness, runtime } = await mountCase(t, { initialMic: true }, hookOptions);
  const oldHeartbeat = runtime.deferTouch();
  await harness.fireHeartbeat();
  const nativeCallsBeforeToggle = runtime.micCalls.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(false));
  await harness.flush();
  assert.equal(runtime.micCalls.length, nativeCallsBeforeToggle);
  oldHeartbeat.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  assert.equal(runtime.durableMic, false);
});

test("matrix 3: a heartbeat fired during a strict transition defers", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const nativeBaseline = runtime.micCalls.length;
  const touchBaseline = runtime.membershipTouches.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.length > nativeBaseline, "strict native transition started");
  await harness.fireHeartbeat();
  assert.equal(runtime.membershipTouches.length, touchBaseline);
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  await harness.flush();
  assert.equal(runtime.membershipTouches.at(-1).micEnabled, true);
});

test("matrix 4: a deferred heartbeat recomputes the final committed microphone state", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.fireHeartbeat();
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  await harness.flush();
  assert.equal(runtime.durableMic, true);
  assert.equal(runtime.membershipTouches.at(-1).micEnabled, true);
});

test("matrix 5: multiple heartbeat ticks coalesce behind one strict lease", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const touchBaseline = runtime.membershipTouches.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.fireHeartbeat();
  await harness.fireHeartbeat();
  await harness.fireHeartbeat();
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  await harness.flush(48);
  assert.equal(runtime.membershipTouches.length - touchBaseline, 2);
});

test("matrix 6: a deferred old-session heartbeat is discarded", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.fireHeartbeat();
  const oldRoomTouches = runtime.membershipTouches.filter((entry) => entry.roomId === "ROOM-1").length;
  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions());
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
  await harness.flush(48);
  assert.equal(
    runtime.membershipTouches.filter((entry) => entry.roomId === "ROOM-1").length,
    oldRoomTouches,
  );
});

test("heartbeat support: same-row replacement waits for the old writer before becoming usable", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldHeartbeat = runtime.deferTouch();
  await harness.fireHeartbeat();
  await harness.commitRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await harness.flush(48);
  assert.notEqual(harness.getResult().channelState, "live");
  oldHeartbeat.resolve();
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement reached live after old writer drained");
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), true);
  assert.equal(runtime.durableMic, true);
});

test("heartbeat support: a never-settling predecessor fails the strict toggle without deadlock or native change", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.deferTouch();
  await harness.fireHeartbeat();
  const nativeBaseline = runtime.micCalls.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => harness.getResult().mediaControlsBusy, "strict control waits for predecessor");
  await harness.fireMediaWriteTimeoutAt(1);
  assert.equal(await settleOperation(toggle, harness), false);
  assert.equal(harness.getResult().mediaControlsBusy, false);
  assert.equal(runtime.micCalls.length, nativeBaseline);
  assert.equal(runtime.durableMic, false);
});

test("heartbeat support: an active strict operation times out without a late native transition", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const snapshotGate = runtime.deferSnapshot();
  const nativeCallCount = runtime.micCalls.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.snapshotReads >= 2, "strict transaction reached durable preflight");
  await harness.fireMediaWriteTimeoutAt(0);
  assert.equal(await settleOperation(toggle, harness), false);
  assert.equal(harness.getResult().mediaControlsBusy, false);
  assert.equal(runtime.micCalls.length, nativeCallCount);
  snapshotGate.resolve();
  await harness.flush(48);
  assert.equal(runtime.micCalls.length, nativeCallCount);
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().mediaReconciliationState, "warning");
});

test("heartbeat support: a timed-out waiter cannot permanently block a converged strict owner", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const firstToggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.fireHeartbeat();
  await harness.fireMediaWriteTimeoutAt(1);
  nativeGate.resolve();
  assert.equal(await settleOperation(firstToggle, harness), true);
  assert.equal(harness.getResult().mediaReconciliationState, "clear");
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(false)), true);
  assert.equal(runtime.durableMic, false);
});

test("heartbeat support: replacement cannot become live until a timed-out same-row predecessor converges", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldHeartbeat = runtime.deferTouch();
  await harness.fireHeartbeat();
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room created");
  await harness.fireMediaWriteTimeoutAt(1);
  assert.equal(harness.getResult().channelState, "reconnecting");
  assert.equal(harness.getResult().mediaReconciliationState, "warning");
  assert.equal(runtime.durableMic, false);
  oldHeartbeat.resolve();
  await harness.flush(48);
  await harness.fireHeartbeat();
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement converged after predecessor drain");
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().micEnabled, true);
});

test("heartbeat support: Reconnected cannot bypass quarantined durable convergence", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.deferTouch();
  await harness.fireHeartbeat();
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room created");
  await harness.fireMediaWriteTimeoutAt(1);
  assert.equal(harness.getResult().channelState, "reconnecting");
  assert.equal(runtime.durableMic, false);
  await harness.emitRoom("Reconnected");
  await harness.flush(48);
  assert.equal(harness.getResult().channelState, "reconnecting");
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().mediaReconciliationState, "warning");
});

test("heartbeat support: timeout quarantine propagates across three queued same-row writers", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldHeartbeat = runtime.deferTouch();
  await harness.fireHeartbeat();
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room created");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
    mediaActivationSerial: 1,
  }));
  const touchCountWhileRootBlocked = runtime.membershipTouches.length;
  await harness.fireMediaWriteTimeoutAt(1);
  await harness.flush(48);
  assert.equal(runtime.membershipTouches.length, touchCountWhileRootBlocked);
  assert.equal(harness.getResult().channelState, "reconnecting");
  oldHeartbeat.resolve();
  await waitFor(harness, () => runtime.durableMic === true, "latest queued writer converged after root drained");
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(runtime.membershipTouches.at(-1).micEnabled, true);
});

test("heartbeat support: deferred reconciliation writes the restored state after compensated failure", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  runtime.queueTouch({ outcome: "null" });
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.fireHeartbeat();
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
  await harness.flush(48);
  assert.equal(runtime.durableMic, false);
  assert.equal(runtime.membershipTouches.at(-1).micEnabled, false);
});

test("matrix 7: an AppState media write cannot race a strict toggle", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const nativeBaseline = runtime.micCalls.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.length > nativeBaseline, "strict enable reached native boundary");
  await harness.fireAppState("background");
  assert.equal(runtime.micCalls.length, nativeBaseline + 1);
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  await harness.flush(48);
  assert.equal(runtime.membershipTouches.at(-1).micEnabled, false);
});

test("AppState support: native reconciliation escalation is not lost inside a running heartbeat", async (t) => {
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  const { harness, runtime } = await mountCase(t, { initialMic: true }, hookOptions);
  const heartbeatGate = runtime.deferTouch();
  await harness.fireHeartbeat();
  const nativeCallCount = runtime.micCalls.length;
  await harness.fireAppState("background");
  assert.ok(runtime.micCalls.length > nativeCallCount);
  assert.equal(runtime.micCalls.at(-1), false, "background native privacy is not blocked by the durable heartbeat");
  assert.equal(runtime.durableMic, true, "durable state remains serialized behind the earlier writer");
  heartbeatGate.resolve();
  await waitFor(harness, () => runtime.durableMic === false, "background durable reconciliation ran");
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(harness.getResult().channelState, "reconnecting");
});

test("established iOS video restores native foreground media before a suspended background membership write drains", async (t) => {
  const hookOptions = defaultHookOptions({
    allowBackgroundAudio: true,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
    },
  });
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
    platformOS: "ios",
  }, hookOptions);
  const backgroundMembershipWrite = runtime.deferTouch();

  await harness.fireAppState("background");
  await waitFor(
    harness,
    () => runtime.membershipTouches.at(-1)?.cameraEnabled === false,
    "background membership write started",
  );
  assert.equal(runtime.cameraCalls.at(-1), false, "background privacy stops native camera first");
  const cameraCallsBeforeForeground = runtime.cameraCalls.length;

  await harness.fireAppState("active");
  await waitFor(
    harness,
    () => runtime.cameraCalls.length > cameraCallsBeforeForeground,
    "foreground native camera recovery started without waiting for the network writer",
  );
  assert.equal(runtime.cameraCalls.at(-1), true);
  assert.equal(
    runtime.durableCamera,
    true,
    "the unresolved background write has not been allowed to publish stale durable state",
  );

  await harness.resolveDeferred(backgroundMembershipWrite);
  await waitFor(harness, () => runtime.durableCamera === true, "latest foreground membership converged");
  assert.equal(harness.getResult().cameraEnabled, true);
});

test("plain peer departure demotes a connected transport until the established peer returns", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialMic: true,
    initialRemoteParticipant: true,
  }, defaultHookOptions({
    allowBackgroundAudio: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  }));
  const room = runtime.rooms.at(-1);
  assert.equal(harness.getResult().channelState, "live");

  const removedRemote = runtime.removeRemoteParticipant();
  await harness.emitRoom("ParticipantDisconnected", removedRemote);

  assert.equal(room.state, "connected", "the local transport never entered reconnecting");
  assert.equal(harness.getResult().participantCount, 1);
  assert.equal(harness.getResult().channelState, "reconnecting");
  await harness.fireHeartbeat();
  await harness.fireAppState("background");
  await harness.fireAppState("active");
  assert.equal(harness.getResult().channelState, "reconnecting");
  assert.equal(runtime.stages.filter((stage) => stage === "recovered").length, 0);
  assert.equal(room.state, "connected", "peer loss does not disconnect an otherwise usable local transport");
  assert.equal(harness.getResult().micEnabled, true, "peer loss does not change local microphone intent");

  const restoredRemote = runtime.restoreRemoteParticipant();
  await harness.emitRoom("ParticipantConnected", restoredRemote);
  await waitFor(harness, () => harness.getResult().channelState === "live", "plain peer departure recovered");
  assert.equal(harness.getResult().participantCount, 2);
});

test("heartbeat readiness notices an established peer missing without a disconnect callback", async (t) => {
  const { harness, runtime } = await mountCase(t, { initialRemoteParticipant: true });
  runtime.removeRemoteParticipant();

  await harness.fireHeartbeat();

  assert.equal(runtime.rooms.at(-1).state, "connected");
  assert.equal(harness.getResult().participantCount, 1);
  assert.equal(harness.getResult().channelState, "reconnecting");
  const restoredRemote = runtime.restoreRemoteParticipant();
  await harness.emitRoom("ParticipantConnected", restoredRemote);
  await waitFor(harness, () => harness.getResult().channelState === "live", "missed callback recovery completed");
});

test("initial waiting does not become an established-peer loss on an empty disconnect event", async (t) => {
  const { harness, runtime } = await mountCase(t);
  await harness.emitRoom("ParticipantDisconnected", { identity: runtime.remoteUserId });
  await harness.fireHeartbeat();

  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().participantCount, 1);
  const remote = runtime.restoreRemoteParticipant();
  await harness.emitRoom("ParticipantConnected", remote);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().participantCount, 2);
});

test("a retired Room's peer departure cannot demote its connected replacement", async (t) => {
  const { harness, runtime } = await mountCase(t, { initialRemoteParticipant: true });
  const oldRoom = runtime.rooms.at(-1);
  const staleParticipantDisconnected = oldRoom.handlers.get("ParticipantDisconnected");
  const oldRemote = oldRoom.remoteParticipants.get(runtime.remoteUserId);
  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => runtime.rooms.length === 2 && harness.getResult().channelState === "live", "replacement connected");
  oldRoom.remoteParticipants.clear();
  const stagesBefore = runtime.stages.length;

  staleParticipantDisconnected(oldRemote);
  await harness.flush();

  assert.equal(harness.getResult().room?.roomId, "ROOM-2");
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().participantCount, 2);
  assert.equal(runtime.stages.length, stagesBefore);
});

test("an established two-participant call stays reconnecting until the known remote participant returns", async (t) => {
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
    },
  });
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
    initialRemoteParticipant: true,
  }, hookOptions);
  assert.equal(harness.getResult().participantCount, 2);

  runtime.setRoomState("reconnecting");
  await harness.emitRoom("Reconnecting");
  const removedRemote = runtime.removeRemoteParticipant();
  await harness.emitRoom("ParticipantDisconnected", removedRemote);
  runtime.setRoomState("connected");
  await harness.emitRoom("Reconnected");
  await harness.flush(48);

  assert.equal(harness.getResult().participantCount, 1);
  assert.equal(
    harness.getResult().channelState,
    "reconnecting",
    "a transport reconnect is not presented as recovered while its established peer is absent",
  );

  await harness.fireHeartbeat();
  assert.equal(
    harness.getResult().channelState,
    "reconnecting",
    "the heartbeat cannot declare recovery while the known remote participant is still absent",
  );

  const restoredRemote = runtime.restoreRemoteParticipant();
  await harness.emitRoom("ParticipantConnected", restoredRemote);
  await waitFor(harness, () => harness.getResult().channelState === "live", "remote participant recovery completed");
  assert.equal(harness.getResult().participantCount, 2);
});

test("foreground reconciliation cannot report an established call recovered while its peer is absent", async (t) => {
  const hookOptions = defaultHookOptions({
    allowBackgroundAudio: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const { harness, runtime } = await mountCase(t, {
    initialMic: true,
    initialRemoteParticipant: true,
  }, hookOptions);

  runtime.setRoomState("reconnecting");
  await harness.emitRoom("Reconnecting");
  const removedRemote = runtime.removeRemoteParticipant();
  await harness.emitRoom("ParticipantDisconnected", removedRemote);
  runtime.setRoomState("connected");
  await harness.emitRoom("Reconnected");
  await harness.fireHeartbeat();
  assert.equal(harness.getResult().channelState, "reconnecting");

  await harness.fireAppState("background");
  await harness.fireAppState("active");

  assert.equal(harness.getResult().participantCount, 1);
  assert.equal(
    harness.getResult().channelState,
    "reconnecting",
    "foreground recovery must use the same established-peer readiness rule as heartbeat recovery",
  );
  assert.equal(
    runtime.stages.filter((stage) => stage === "recovered").length,
    0,
    "recovery telemetry must not precede actual current-session readiness",
  );
});

test("a reconnect before any peer has joined does not invent a missing-participant blocker", async (t) => {
  const { harness, runtime } = await mountCase(t);
  assert.equal(harness.getResult().participantCount, 1);

  runtime.setRoomState("reconnecting");
  await harness.emitRoom("Reconnecting");
  runtime.setRoomState("connected");
  await harness.emitRoom("Reconnected");
  await waitFor(harness, () => harness.getResult().channelState === "live", "empty-room transport recovered");
  assert.equal(harness.getResult().participantCount, 1);
});

test("a signal reconnect with its established peer retained returns to live", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
  });
  assert.equal(harness.getResult().participantCount, 2);

  runtime.setRoomState("reconnecting");
  await harness.emitRoom("SignalReconnecting");
  runtime.setRoomState("connected");
  await harness.emitRoom("Reconnected");
  await waitFor(harness, () => harness.getResult().channelState === "live", "signal transport recovered");
  assert.equal(harness.getResult().participantCount, 2);
});

test("matrix 8: native-audio activation reconciliation cannot race a strict toggle", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const nativeBaseline = runtime.micCalls.length;
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.length > nativeBaseline, "strict enable reached native boundary");
  await harness.commitRender(defaultHookOptions({ mediaActivationSerial: 1 }));
  assert.equal(runtime.micCalls.length, nativeBaseline + 1);
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
  await harness.flush(48);
  assert.equal(runtime.durableMic, true);
});

test("matrix 10: a committed different room makes the old transaction stale", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions());
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
});

test("matrix 11: a committed different invite makes the old transaction stale", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.commitRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
});

test("matrix 12: a committed different user identity makes the old transaction stale", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  runtime.userId = "replacement-user";
  await harness.commitRender(defaultHookOptions({
    invite: {
      ...defaultHookOptions().invite,
      calleeUserId: "replacement-user",
    },
  }));
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
});

test("matrix 13: replacement of the LiveKit Room instance makes the old transaction stale", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const originalRoom = runtime.rooms.at(-1);
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.commitRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.at(-1) !== originalRoom, "replacement LiveKit Room committed");
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
});

test("session support: a committed background-audio option update preserves the live session", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const originalRoom = runtime.rooms.at(-1);
  const originalTokenCalls = runtime.providerTokenCalls;
  const originalDisconnects = runtime.roomDisconnects ?? 0;
  await harness.commitRender(defaultHookOptions({ allowBackgroundAudio: true }));
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.rooms.at(-1), originalRoom);
  assert.equal(runtime.rooms.length, 1);
  assert.equal(runtime.providerTokenCalls, originalTokenCalls);
  assert.equal(runtime.roomDisconnects ?? 0, originalDisconnects);
});

test("matrix 14: a committed generation change makes the old transaction stale", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions());
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
  await harness.flush(48);
  assert.equal(harness.getResult().channelState, "live");
});

test("matrix 15: terminal product-room state makes the transaction stale", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  runtime.queueSnapshot({ outcome: "terminal" });
  await harness.fireHeartbeat();
  await harness.emitRoom("Reconnected");
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(runtime.durableMic, false);
});

test("matrix 17: a restarted abandoned render does not retire the active session", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.abandonRender(replacementOptions());
  await harness.commitRender(defaultHookOptions());
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
});

test("matrix 18: repeated commit of the same session does not retire its transaction", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.commitRender(defaultHookOptions());
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
});

test("matrix 19: one committed replacement retires old work and the replacement remains usable", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldGate = runtime.deferNative();
  const oldToggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "old strict enable reached native boundary");
  runtime.roomId = "ROOM-2";
  const nextOptions = replacementOptions();
  await harness.commitRender(nextOptions);
  oldGate.resolve();
  assert.equal(await settleOperation(oldToggle, harness), false);
  await harness.commitRender(nextOptions);
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), true);
});

test("matrix 20: old work stays valid until a replacement actually commits", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.abandonRender(replacementOptions());
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), true);
});

test("matrix 21: old async work is stale after replacement commit and cleanup cannot restore ownership", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const toggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "old strict enable reached native boundary");
  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions());
  const replacementRoom = runtime.rooms.at(-1);
  nativeGate.resolve();
  assert.equal(await settleOperation(toggle, harness), false);
  await harness.flush(48);
  assert.equal(runtime.rooms.at(-1), replacementRoom);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: stale same-row cleanup cannot leave replacement membership", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldCameraCleanup = runtime.deferCamera();
  const oldMicrophoneCleanup = runtime.deferNative();
  await harness.commitRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement reached live");
  assert.equal(runtime.membershipLeaves, 0);
  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 0);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: cleanup started before same-row replacement cannot leave replacement membership", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldCameraCleanup = runtime.deferCamera();
  const oldMicrophoneCleanup = runtime.deferNative();
  await harness.fireStopper("manual");
  const oldSessionLeaves = runtime.membershipLeaves;
  await harness.commitRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement reached live");
  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);
  assert.equal(
    runtime.membershipLeaves,
    oldSessionLeaves,
    "late old-session cleanup cannot leave the replacement membership",
  );
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: late old capture shutdown cannot stop a same-row replacement", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldCameraCleanup = deferred();
  const oldMicrophoneCleanup = deferred();
  runtime.queueCamera({
    gate: oldCameraCleanup,
    interruptLatestOnCompletion: true,
    outcome: "success",
  });
  runtime.queueNative({
    gate: oldMicrophoneCleanup,
    interruptLatestOnCompletion: true,
    outcome: "success",
  });

  await harness.fireStopper("manual");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
      id: "invite-2",
    },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "same-row replacement Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "same-row replacement live");

  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);

  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: late old capture shutdown preserves newer replacement media intent", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldCameraCleanup = deferred();
  const oldMicrophoneCleanup = deferred();
  runtime.queueCamera({
    gate: oldCameraCleanup,
    interruptLatestOnCompletion: true,
    outcome: "success",
  });
  runtime.queueNative({
    gate: oldMicrophoneCleanup,
    interruptLatestOnCompletion: true,
    outcome: "success",
  });

  await harness.fireStopper("manual");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
      id: "invite-2",
    },
  }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "same-row replacement live");
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(false)), true);

  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);

  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, false);
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.trackRestarts.some(({ kind }) => kind === "audio"), false);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: late rejected capture shutdown still repairs the current replacement", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldCameraCleanup = deferred();
  const oldMicrophoneCleanup = deferred();
  runtime.queueCamera({
    gate: oldCameraCleanup,
    interruptLatestOnCompletion: true,
    outcome: "reject",
  });
  runtime.queueNative({
    gate: oldMicrophoneCleanup,
    interruptLatestOnCompletion: true,
    outcome: "reject",
  });

  await harness.fireStopper("manual");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video", id: "invite-2" },
  }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement live");

  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);

  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: late capture shutdown reconciles a different-room replacement", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldCameraCleanup = deferred();
  const oldMicrophoneCleanup = deferred();
  runtime.queueCamera({ gate: oldCameraCleanup, interruptLatestOnCompletion: true, outcome: "success" });
  runtime.queueNative({ gate: oldMicrophoneCleanup, interruptLatestOnCompletion: true, outcome: "success" });

  await harness.fireStopper("manual");
  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...replacementOptions().invite, callType: "video" },
  }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "different-room replacement live");

  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);

  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "live");
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: late capture shutdown uses only replacement-account media intent", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    cameraPermissionState: "granted",
    microphonePermissionState: "granted",
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldCameraCleanup = deferred();
  const oldMicrophoneCleanup = deferred();
  runtime.queueCamera({ gate: oldCameraCleanup, interruptLatestOnCompletion: true, outcome: "success" });
  runtime.queueNative({ gate: oldMicrophoneCleanup, interruptLatestOnCompletion: true, outcome: "success" });

  await harness.fireStopper("manual");
  runtime.userId = "replacement-user";
  await harness.commitRender(defaultHookOptions({
    authenticatedUserId: "replacement-user",
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      calleeUserId: "replacement-user",
      callType: "video",
      id: "invite-2",
    },
  }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement account live");

  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);

  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, false);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "live");
  assert.equal(runtime.trackRestarts.some(({ kind }) => kind === "video"), false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: late capture shutdown with no replacement stays terminal", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldCameraCleanup = deferred();
  const oldMicrophoneCleanup = deferred();
  runtime.queueCamera({ gate: oldCameraCleanup, outcome: "success" });
  runtime.queueNative({ gate: oldMicrophoneCleanup, outcome: "success" });

  await harness.fireStopper("manual");
  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);

  assert.equal(runtime.rooms.length, 1);
  assert.equal(runtime.rooms[0].localParticipant.cameraEnabled, false);
  assert.equal(runtime.rooms[0].localParticipant.micEnabled, false);
  assert.notEqual(harness.getResult().channelState, "live");
});

for (const outcome of ["reject", "mismatch"]) {
  test(`SDK capture recovery: ${outcome} restart reports the stopped microphone instead of false success`, async (t) => {
    const { harness, oldCleanup, runtime } = await prepareLateCaptureCleanup(t);
    runtime.queueTrackRestart({ outcome });
    await harness.resolveDeferred(oldCleanup);
    await harness.flush(96);

    const participant = runtime.rooms.at(-1).localParticipant;
    assert.equal(runtime.trackRestarts.length, 1, "current ended track receives one bounded restart attempt");
    assert.equal(participant.micTrack.mediaStreamTrack.readyState, "ended");
    assert.equal(harness.getResult().micEnabled, false, "UI reflects unavailable native capture");
    assert.equal(runtime.durableMic, false, "membership does not claim the stopped microphone is live");
    assert.ok(harness.getResult().mediaReconciliationMessage, "failed repair remains visible");
  });
}

for (const permissionState of ["denied", "undetermined"]) {
  test(`SDK capture recovery: ${permissionState} microphone permission prevents reacquisition`, async (t) => {
    const { harness, oldCleanup, runtime } = await prepareLateCaptureCleanup(t);
    runtime.microphonePermissionState = permissionState;
    await harness.resolveDeferred(oldCleanup);
    await harness.flush(96);

    assert.equal(runtime.trackRestarts.length, 0);
    assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "ended");
    assert.equal(harness.getResult().micEnabled, false);
    assert.equal(runtime.durableMic, false);
  });
}

test("SDK capture recovery: background replacement does not restart a microphone without background authority", async (t) => {
  const { harness, oldCleanup, runtime } = await prepareLateCaptureCleanup(t);
  await harness.fireAppState("background");
  await harness.resolveDeferred(oldCleanup);
  await harness.flush(96);

  assert.equal(runtime.trackRestarts.length, 0);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, false);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.durableMic, false);
});

test("SDK capture recovery: a restart completing after replacement cannot keep its old track live", async (t) => {
  const { harness, oldCleanup, runtime } = await prepareLateCaptureCleanup(t);
  const restartGate = deferred();
  runtime.queueTrackRestart({ gate: restartGate, outcome: "success" });
  await harness.resolveDeferred(oldCleanup);
  await waitFor(harness, () => runtime.trackRestarts.length === 1, "ended microphone restart entered");
  const oldRestartTrack = runtime.trackRestarts[0].track;

  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-3" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 3, "newer replacement Room created");
  await harness.resolveDeferred(restartGate);
  await waitFor(harness, () => harness.getResult().channelState === "live", "newer replacement remains live");
  await harness.flush(96);

  assert.equal(oldRestartTrack.mediaStreamTrack.readyState, "ended", "obsolete restarted capture is stopped");
  assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "live");
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(runtime.durableMic, true);
});

test("SDK capture recovery: unmount during pending restart cannot leave capture running", async (t) => {
  const { oldCleanup, runtime, harness } = await prepareLateCaptureCleanup(t);
  const restartGate = deferred();
  runtime.queueTrackRestart({ gate: restartGate, outcome: "success" });
  try {
    await harness.resolveDeferred(oldCleanup);
    await waitFor(harness, () => runtime.trackRestarts.length === 1, "ended microphone restart entered");
    const oldRestartTrack = runtime.trackRestarts[0].track;
    await harness.unmount();
    await harness.resolveDeferred(restartGate);
    await harness.flush(96);
    assert.equal(oldRestartTrack.mediaStreamTrack.readyState, "ended");
    assert.equal(runtime.rooms.at(-1).state, "disconnected");
  } finally {
    restartGate.resolve();
    await harness.flush(48);
  }
});

test("SDK capture recovery: camera permission revoked after replacement prevents reacquisition", async (t) => {
  const { harness, oldCleanup, runtime } = await prepareLateCaptureCleanup(t, "video");
  runtime.cameraPermissionState = "denied";
  const cameraCommandsBefore = runtime.cameraCalls.length;
  await harness.resolveDeferred(oldCleanup);
  await harness.flush(96);

  assert.equal(runtime.trackRestarts.some(({ kind }) => kind === "video"), false);
  assert.equal(runtime.cameraCalls.slice(cameraCommandsBefore).includes(true), false);
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraTrack.mediaStreamTrack.readyState, "ended");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);
});

for (const microphoneFailure of ["denied", "reject", "held-permission", "held-restart"]) {
  test(`SDK capture recovery: background camera stops before ${microphoneFailure} microphone recovery`, async (t) => {
    const { harness, runtime } = await mountCase(t, {
      initialCamera: true,
      initialMic: true,
      cameraPermissionState: "granted",
      microphonePermissionState: "granted",
      platformOS: "ios",
    }, defaultHookOptions({
      allowBackgroundAudio: true,
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video" },
    }));
    const participant = runtime.rooms.at(-1).localParticipant;
    const cameraTrack = participant.cameraTrack;
    runtime.interruptLocalCapture("microphone");
    let pending;
    if (microphoneFailure === "denied") runtime.microphonePermissionState = "denied";
    if (microphoneFailure === "reject") runtime.queueTrackRestart({ outcome: "reject" });
    if (microphoneFailure === "held-permission") pending = runtime.deferMicrophonePermission("granted");
    if (microphoneFailure === "held-restart") {
      pending = deferred();
      runtime.queueTrackRestart({ gate: pending, outcome: "success" });
    }
    try {
      await harness.fireAppState("background");
      await harness.flush(96);
      assert.equal(cameraTrack.mediaStreamTrack.readyState, "ended", "camera shutdown cannot wait for audio recovery");
      assert.equal(participant.getTrackPublication("camera"), undefined);
      assert.equal(harness.getResult().cameraEnabled, false, "UI reflects completed camera shutdown while audio waits");
      if (pending) {
        assert.equal(participant.micTrack.mediaStreamTrack.readyState, "ended", "microphone acquisition is still pending");
        await harness.resolveDeferred(pending);
        await harness.flush(96);
      } else {
        const microphoneUsable = participant.micEnabled
          && participant.micTrack.mediaStreamTrack.readyState !== "ended";
        assert.equal(harness.getResult().micEnabled, microphoneUsable);
        assert.equal(runtime.durableMic, microphoneUsable);
        if (microphoneFailure === "denied") assert.equal(microphoneUsable, false);
      }
      assert.equal(runtime.durableCamera, false);
      assert.equal(participant.getTrackPublication("camera"), undefined);
    } finally {
      pending?.resolve();
      await harness.flush(48);
    }
  });
}

for (const entrypoint of ["AppState", "stopper"]) {
  for (const allowBackgroundAudio of [false, true]) {
    for (const gateKind of ["permission", "restart"]) {
      test(`background privacy: ${entrypoint} stops camera during foreground ${gateKind} wait with background audio ${allowBackgroundAudio}`, async (t) => {
        const { gate, harness, runtime } = await preparePendingForegroundRecovery(t, allowBackgroundAudio, gateKind);
        const participant = runtime.rooms.at(-1).localParticipant;
        const cameraTrack = participant.cameraTrack;
        try {
          if (entrypoint === "AppState") await harness.fireAppState("background");
          else {
            runtime.appState = "background";
            await harness.fireStopper("app_background");
          }

          assert.equal(cameraTrack.mediaStreamTrack.readyState, "ended", "foreground audio wait cannot postpone camera privacy shutdown");
          assert.equal(harness.getResult().cameraEnabled, false, "UI reflects immediate native shutdown");
          assert.equal(participant.micTrack.mediaStreamTrack.readyState, "ended", "foreground microphone operation remains pending");
          assert.equal(runtime.rooms.length, 1);

          await harness.resolveDeferred(gate);
          await harness.flush(128);
          assert.equal(participant.getTrackPublication("camera"), undefined);
          assert.equal(runtime.durableCamera, false);
          assert.equal(runtime.durableMic, allowBackgroundAudio);
          assert.equal(harness.getResult().micEnabled, allowBackgroundAudio);
          assert.equal(runtime.rooms.length, 1);
        } finally {
          gate.resolve();
          await harness.flush(48);
        }
      });
    }
  }
}

test("background privacy: foreground return before microphone recovery settles preserves latest camera intent", async (t) => {
  const { gate, harness, runtime } = await preparePendingForegroundRecovery(t, true, "restart");
  const participant = runtime.rooms.at(-1).localParticipant;
  const originalCameraTrack = participant.cameraTrack;
  try {
    await harness.fireAppState("background");
    assert.equal(originalCameraTrack.mediaStreamTrack.readyState, "ended");
    assert.equal(harness.getResult().cameraEnabled, false);
    await harness.fireAppState("active");
    await harness.resolveDeferred(gate);
    await harness.flush(160);

    assert.equal(runtime.rooms.length, 1);
    assert.equal(runtime.providerTokenCalls, 1);
    assert.equal(runtime.rooms[0].localParticipant, participant);
    assert.equal(participant.cameraTrack.mediaStreamTrack.readyState, "live");
    assert.equal(participant.micTrack.mediaStreamTrack.readyState, "live");
    assert.equal(harness.getResult().cameraEnabled, true);
    assert.equal(harness.getResult().micEnabled, true);
    assert.equal(runtime.durableCamera, true);
    assert.equal(runtime.durableMic, true);
  } finally {
    gate.resolve();
    await harness.flush(48);
  }
});

for (const stopFailure of ["throw", "ineffective"]) {
  test(`background privacy: ${stopFailure} camera stop starts exact-Room termination before microphone recovery finishes`, async (t) => {
    const { gate, harness, runtime } = await preparePendingForegroundRecovery(t, true, "permission");
    const room = runtime.rooms.at(-1);
    const cameraTrack = room.localParticipant.cameraTrack;
    const originalStop = cameraTrack.stop.bind(cameraTrack);
    let firstStop = true;
    cameraTrack.stop = () => {
      if (firstStop) {
        firstStop = false;
        if (stopFailure === "throw") throw new Error("fixture first native camera stop rejected");
        return;
      }
      originalStop();
    };
    try {
      await harness.fireAppState("background");
      await harness.flush(48);
      assert.ok(runtime.roomDisconnects >= 1, "termination starts independently of pending microphone permission");
      assert.equal(room.state, "disconnected");
      assert.equal(cameraTrack.mediaStreamTrack.readyState, "ended");
      assert.equal(harness.getResult().cameraEnabled, false);
      assert.ok(runtime.errors.length > 0, "failed first stop is reported instead of silent success");
      assert.equal(runtime.trackRestarts.length, 0, "microphone recovery remains pending");
      await harness.resolveDeferred(gate);
      await harness.flush(96);
      assert.equal(runtime.rooms.length, 1);
      assert.equal(room.state, "disconnected");
    } finally {
      cameraTrack.stop = originalStop;
      gate.resolve();
      await harness.flush(48);
    }
  });
}

test("background privacy: ineffective stop and disconnect remain an explicit unproved shutdown", async (t) => {
  const { gate, harness, runtime } = await preparePendingForegroundRecovery(t, true, "permission");
  const room = runtime.rooms.at(-1);
  const cameraTrack = room.localParticipant.cameraTrack;
  const originalStop = cameraTrack.stop.bind(cameraTrack);
  cameraTrack.stop = () => undefined;
  runtime.queueDisconnect({ outcome: "mismatch" });
  runtime.queueDisconnect({ outcome: "mismatch" });
  try {
    await harness.fireAppState("background");
    await harness.flush(48);
    assert.equal(cameraTrack.mediaStreamTrack.readyState, "live", "fixture deliberately cannot stop capture");
    assert.equal(room.state, "connected", "fixture deliberately cannot disconnect");
    assert.equal(harness.getResult().cameraEnabled, true, "UI cannot falsely claim camera shutdown succeeded");
    assert.match(harness.getResult().mediaReconciliationMessage, /Camera safety/u);
    assert.ok(runtime.errors.some(({ scope }) => scope === "chat-call-livekit-camera-safety-terminal"));
  } finally {
    cameraTrack.stop = originalStop;
    gate.resolve();
    await harness.flush(96);
  }
});

test("background privacy: old recovery completion cannot stop a newer call's foreground camera", async (t) => {
  const { gate, harness, runtime } = await preparePendingForegroundRecovery(t, true, "restart");
  const oldParticipant = runtime.rooms.at(-1).localParticipant;
  try {
    await harness.fireAppState("background");
    assert.equal(oldParticipant.cameraTrack.mediaStreamTrack.readyState, "ended");
    await harness.fireAppState("active");
    await harness.commitRender(defaultHookOptions({
      allowBackgroundAudio: true,
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video", id: "invite-2" },
    }));
    await waitFor(harness, () => runtime.rooms.length === 2, "replacement call created");
    const currentParticipant = runtime.rooms.at(-1).localParticipant;
    await harness.resolveDeferred(gate);
    await harness.flush(160);

    assert.equal(oldParticipant.cameraTrack.mediaStreamTrack.readyState, "ended");
    assert.equal(oldParticipant.micTrack.mediaStreamTrack.readyState, "ended");
    assert.equal(currentParticipant.cameraTrack.mediaStreamTrack.readyState, "live");
    assert.equal(currentParticipant.micTrack.mediaStreamTrack.readyState, "live");
    assert.equal(runtime.durableCamera, true);
    assert.equal(runtime.durableMic, true);
    assert.equal(harness.getResult().cameraEnabled, true);
    assert.equal(harness.getResult().channelState, "live");
  } finally {
    gate.resolve();
    await harness.flush(48);
  }
});

test("background privacy: delayed fallback termination cannot project its camera state into a replacement", async (t) => {
  const { gate, harness, runtime } = await preparePendingForegroundRecovery(t, true, "permission");
  const oldRoom = runtime.rooms.at(-1);
  const oldCamera = oldRoom.localParticipant.cameraTrack;
  const originalStop = oldCamera.stop.bind(oldCamera);
  let firstStop = true;
  oldCamera.stop = () => {
    if (firstStop) {
      firstStop = false;
      throw new Error("fixture first camera stop rejected");
    }
    originalStop();
  };
  const disconnectGate = deferred();
  runtime.queueDisconnect({ gate: disconnectGate, outcome: "success" });
  try {
    await harness.fireAppState("background");
    await waitFor(harness, () => runtime.roomDisconnects >= 1, "old termination awaits disconnect");
    await harness.fireAppState("active");
    await harness.commitRender(defaultHookOptions({
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video", id: "invite-2" },
    }));
    await harness.resolveDeferred(gate);
    await waitFor(harness, () => runtime.rooms.length === 2 && harness.getResult().cameraEnabled, "replacement camera live");
    const currentRoom = runtime.rooms.at(-1);
    await harness.resolveDeferred(disconnectGate);
    await harness.flush(128);

    assert.equal(oldCamera.mediaStreamTrack.readyState, "ended");
    assert.equal(currentRoom.state, "connected");
    assert.equal(currentRoom.localParticipant.cameraTrack.mediaStreamTrack.readyState, "live");
    assert.equal(harness.getResult().cameraEnabled, true);
    assert.equal(runtime.durableCamera, true);
  } finally {
    oldCamera.stop = originalStop;
    gate.resolve();
    disconnectGate.resolve();
    await harness.flush(48);
  }
});

test("SDK capture recovery: permission read resolving after replacement cannot restart the old track", async (t) => {
  const { harness, oldCleanup, runtime } = await prepareLateCaptureCleanup(t);
  const interruptedParticipant = runtime.rooms.at(-1).localParticipant;
  const permissionReads = runtime.microphonePermissionReads;
  const permissionGate = runtime.deferMicrophonePermission("granted");
  await harness.resolveDeferred(oldCleanup);
  await waitFor(harness, () => runtime.microphonePermissionReads > permissionReads, "recovery checks permission");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-3" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 3, "newer Room owns the hook");
  await harness.resolveDeferred(permissionGate);
  await harness.flush(96);

  assert.equal(runtime.trackRestarts.some(({ participant }) => participant === interruptedParticipant), false);
  assert.equal(interruptedParticipant.micTrack.mediaStreamTrack.readyState, "ended");
  assert.equal(runtime.rooms.at(-1).localParticipant.micTrack.mediaStreamTrack.readyState, "live");
  assert.equal(harness.getResult().micEnabled, true);
});

for (const platformOS of ["android", "ios"]) {
  test(`SDK capture recovery: healthy ${platformOS} controls and foreground recovery do not restart tracks`, async (t) => {
    const { harness, runtime } = await mountCase(t, {
      initialCamera: true,
      initialMic: true,
      cameraPermissionState: "granted",
      microphonePermissionState: "granted",
      platformOS,
    }, defaultHookOptions({
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video" },
    }));
    const room = runtime.rooms.at(-1);
    const participant = room.localParticipant;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(false)), true);
      assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), true);
      assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), true);
      assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), true);
    }
    await harness.fireAppState("background");
    await harness.fireAppState("active");
    await harness.flush(96);

    assert.equal(runtime.rooms.length, 1);
    assert.equal(runtime.rooms.at(-1), room);
    assert.equal(participant.identity, "local-user");
    assert.equal(runtime.providerTokenCalls, 1);
    assert.equal(runtime.trackRestarts.length, 0, "healthy publications need no explicit restart");
    assert.equal(participant.cameraTrack.mediaStreamTrack.readyState, "live");
    assert.equal(participant.micTrack.mediaStreamTrack.readyState, "live");
    assert.equal(runtime.durableCamera, true);
    assert.equal(runtime.durableMic, true);
    assert.equal(harness.getResult().cameraEnabled, true);
    assert.equal(harness.getResult().micEnabled, true);
    assert.equal(harness.getResult().channelState, "live");
  });
}

test("cleanup support: a late same-row leave settles before the replacement session joins", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const delayedMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: delayedMembershipLeave, outcome: "success" });

  await harness.fireStopper("manual");
  await waitFor(harness, () => runtime.membershipLeaves === 1, "old membership leave started");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
      id: "invite-2",
    },
  }));
  assert.equal(runtime.rooms.length, 1, "replacement waits for pending old leave");
  await harness.resolveDeferred(delayedMembershipLeave);
  await waitFor(harness, () => runtime.rooms.length === 2, "same-row replacement Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "same-row replacement live");

  await harness.flush(48);
  await waitFor(
    harness,
    () => runtime.durableCamera === true && runtime.durableMic === true,
    "replacement durable media is enabled after old leave settled",
  );

  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.rooms.at(-1).state, "connected");
});

test("cleanup support: a timed-out leave cannot overwrite newer replacement media intent", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const delayedMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: delayedMembershipLeave, outcome: "success" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "old membership leave started");
  await harness.fireLatestTimeout();
  const cleanupError = await settleOperation(cleanup, harness);
  assert.match(cleanupError.message, /Unable to prove/u);

  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
      id: "invite-2",
    },
  }));
  assert.equal(runtime.rooms.length, 1, "replacement waits for pending old leave");
  await harness.resolveDeferred(delayedMembershipLeave);
  await waitFor(harness, () => runtime.rooms.length === 2, "same-row replacement Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "same-row replacement live");
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(false)), true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, false);
  const touchesBeforeLateLeave = runtime.membershipTouches.length;

  await harness.flush(48);
  await waitFor(
    harness,
    () => runtime.durableCamera === true && runtime.durableMic === false,
    "completed old leave cannot overwrite the replacement's latest media intent",
  );

  const replacementRoom = runtime.rooms.at(-1);
  assert.equal(replacementRoom.localParticipant.cameraEnabled, true);
  assert.equal(replacementRoom.localParticipant.micEnabled, false);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.membershipTouches.length, touchesBeforeLateLeave, "no stale reconciliation writes after current user intent");
});

test("cleanup support: repeated End reuses an unresolved membership leave", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const delayedMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: delayedMembershipLeave, outcome: "success" });
  const firstCleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "membership leave started");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(firstCleanup, harness)).message, /Unable to prove/u);

  const repeatedCleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await harness.flush();
  assert.equal(runtime.membershipLeaves, 1);
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(repeatedCleanup, harness)).message, /Unable to prove/u);

  await harness.resolveDeferred(delayedMembershipLeave);
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.durableCamera, false);
  assert.equal(runtime.durableMic, false);
});

test("cleanup support: late leave rejection never mutates a replacement or triggers restoration", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const delayedMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: delayedMembershipLeave, outcome: "reject" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "membership leave started");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(cleanup, harness)).message, /Unable to prove/u);

  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "different-room replacement live");
  const touchesBeforeRejection = runtime.membershipTouches.length;

  await harness.resolveDeferred(delayedMembershipLeave);
  await harness.flush(48);

  assert.equal(runtime.membershipTouches.length, touchesBeforeRejection);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.rooms.at(-1).state, "connected");
});

test("cleanup support: a late successful leave with no replacement stays terminal", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const delayedMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: delayedMembershipLeave, outcome: "success" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "membership leave started");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(cleanup, harness)).message, /Unable to prove/u);
  const touchesBeforeSettlement = runtime.membershipTouches.length;

  await harness.resolveDeferred(delayedMembershipLeave);
  await harness.flush(48);

  assert.equal(runtime.membershipTouches.length, touchesBeforeSettlement);
  assert.equal(runtime.durableCamera, false);
  assert.equal(runtime.durableMic, false);
  assert.equal(harness.getResult().channelState, "error");
});

test("cleanup support: an old-account leave cannot restore media for a replacement account", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const delayedMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: delayedMembershipLeave, outcome: "success" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "old-account leave started");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(cleanup, harness)).message, /Unable to prove/u);

  runtime.userId = "replacement-user";
  await harness.commitRender(defaultHookOptions({
    authenticatedUserId: "replacement-user",
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      calleeUserId: "replacement-user",
      id: "invite-2",
    },
  }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement account live");
  const touchesBeforeOldSettlement = runtime.membershipTouches.length;

  await harness.resolveDeferred(delayedMembershipLeave);
  await harness.flush(48);

  assert.equal(runtime.membershipTouches.length, touchesBeforeOldSettlement);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
});

test("cleanup support: pre-initialization unmount leaves its already-joined exact generation", async () => {
  const runtime = createLiveKitMountedRuntime();
  const pendingSnapshot = runtime.deferSnapshot();
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false, turns: 4 });
  await harness.unmount();
  pendingSnapshot.resolve();
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, runtime.membershipGeneration);
  assert.equal(runtime.errors.length, 0);
});

test("matrix 22: confirmed microphone denial changes only microphone permission state", async (t) => {
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: false },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const { harness, runtime } = await mountCase(t, { initialCamera: true }, hookOptions);
  runtime.queueNative({ outcome: "permission-denied" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(harness.getResult().microphonePermissionState, "denied");
  assert.equal(harness.getResult().cameraPermissionState, "granted");
  assert.equal(harness.getResult().canOpenMediaSettings, true);
});

test("matrix 23: confirmed camera denial changes only camera permission state", async (t) => {
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  });
  const { harness, runtime } = await mountCase(t, { initialMic: true }, hookOptions);
  runtime.queueCamera({ outcome: "permission-denied" });
  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), false);
  assert.equal(harness.getResult().cameraPermissionState, "denied");
  assert.equal(harness.getResult().microphonePermissionState, "granted");
  assert.equal(harness.getResult().canOpenMediaSettings, true);
});

test("cold-start video retries a transient initial camera failure without changing call authority", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  runtime.queueCamera({ outcome: "reject" });
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  await waitFor(harness, () => runtime.cameraCalls.length === 1, "initial camera attempt reached native boundary");
  assert.equal(harness.getResult().channelState, "connecting");
  await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => harness.getResult().channelState === "live", "camera retry converged the call");

  assert.deepEqual(runtime.cameraCalls, [true, true]);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(harness.getResult().cameraPermissionState, "granted");
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("cold-start video never retries a confirmed initial camera permission denial", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  runtime.queueCamera({ outcome: "permission-denied" });
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, hookOptions);
  t.after(() => harness.unmount());

  assert.deepEqual(runtime.cameraCalls, [true]);
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(harness.getResult().cameraPermissionState, "denied");
  assert.equal(harness.getResult().canOpenMediaSettings, true);
  assert.equal(runtime.durableCamera, false);
});

test("terminated iOS video preserves camera intent when launch activation returns a permission-shaped transient error", async (t) => {
  const runtime = createLiveKitMountedRuntime({
    cameraPermissionState: "granted",
    nativeApplicationActive: true,
    platformOS: "ios",
  });
  runtime.appState = "inactive";
  runtime.queueCamera({ outcome: "permission-denied" });
  const descriptor = runtime.createAcceptedMediaDescriptor();
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    iosAcceptedCallKitMediaDescriptor: descriptor,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  await waitFor(harness, () => runtime.cameraCalls.length === 1, "launch camera attempt reached native boundary");
  assert.equal(runtime.cameraPermissionReads, 1);
  assert.notEqual(harness.getResult().cameraPermissionState, "denied");
  await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => runtime.cameraCalls.length === 2, "granted permission kept camera retry eligible");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "camera converged after launch activation transient");
  assert.equal(harness.getResult().cameraPermissionState, "granted");
  assert.equal(runtime.durableCamera, true);
});

test("terminated iOS voice preserves microphone intent when launch activation returns a permission-shaped transient error", async (t) => {
  const runtime = createLiveKitMountedRuntime({
    microphonePermissionState: "granted",
    nativeApplicationActive: true,
    platformOS: "ios",
  });
  runtime.appState = "inactive";
  runtime.queueNative({ outcome: "permission-denied" });
  const descriptor = runtime.createAcceptedMediaDescriptor();
  const hookOptions = defaultHookOptions({
    allowBackgroundAudio: true,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    iosAcceptedCallKitMediaDescriptor: descriptor,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions);
  t.after(() => harness.unmount());

  assert.equal(runtime.microphonePermissionReads, 1);
  assert.notEqual(harness.getResult().microphonePermissionState, "denied");
  assert.equal(harness.getResult().micEnabled, false);
  await harness.fireHeartbeat();
  await waitFor(harness, () => harness.getResult().micEnabled, "microphone converged after launch activation transient");
  assert.equal(harness.getResult().microphonePermissionState, "granted");
  assert.equal(runtime.durableMic, true);
});

test("a stale camera permission read cannot overwrite replacement-call media intent", async (t) => {
  const runtime = createLiveKitMountedRuntime({ cameraPermissionState: "denied" });
  runtime.queueCamera({ outcome: "permission-denied" });
  const permissionGate = runtime.deferCameraPermission("denied");
  const firstOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, firstOptions, { requireLive: false });
  t.after(() => harness.unmount());

  await waitFor(harness, () => runtime.cameraPermissionReads === 1, "first call reached permission read");
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video", id: "invite-2" },
  }));
  permissionGate.resolve();

  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement call connected");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "replacement camera intent remained active");
  assert.notEqual(harness.getResult().cameraPermissionState, "denied");
  assert.equal(runtime.durableCamera, true);
});

test("cold-start video retries native camera again after call authority commits", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  for (let attempt = 0; attempt < 4; attempt += 1) runtime.queueCamera({ outcome: "reject" });
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitFor(harness, () => runtime.cameraCalls.length === attempt, `initial camera attempt ${attempt} reached native boundary`);
    await harness.fireMediaWriteTimeout();
  }
  await waitFor(harness, () => runtime.cameraCalls.length === 4, "all eager camera attempts reached native boundary");
  await waitFor(harness, () => harness.getResult().channelState === "live", "call authority committed without camera");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);

  await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => runtime.cameraCalls.length === 5, "post-commit camera recovery reached native boundary");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "post-commit camera recovery converged UI");
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("terminated iOS video adopts a late native camera publication without waiting for heartbeat", async (t) => {
  const runtime = createLiveKitMountedRuntime({
    cameraPermissionState: "granted",
    nativeApplicationActive: true,
    platformOS: "ios",
  });
  for (let attempt = 0; attempt < 8; attempt += 1) runtime.queueCamera({ outcome: "reject" });
  const descriptor = runtime.createAcceptedMediaDescriptor();
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    iosAcceptedCallKitMediaDescriptor: descriptor,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  await waitFor(harness, () => runtime.cameraCalls.length === 1, "first late-publication camera attempt");
  const latePublication = runtime.publishCameraLate();
  await harness.emitRoom("LocalTrackPublished", latePublication);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await harness.fireMediaWriteTimeout();
    await waitFor(harness, () => runtime.cameraCalls.length === attempt + 1, `initial late-publication camera attempt ${attempt + 1}`);
  }
  await waitFor(harness, () => runtime.cameraCalls.length === 4, "initial camera retries exhausted");
  await waitFor(harness, () => harness.getResult().channelState === "live", "call authority committed without camera");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);

  await harness.fireMediaWriteTimeout();

  await waitFor(harness, () => harness.getResult().cameraEnabled, "late native publication converged local UI");
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.membershipTouches.at(-1).cameraEnabled, true);
  assert.equal(runtime.cameraCalls.length, 4);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("accepted iOS CallKit video recovers a camera publication lost after initial session commit", async (t) => {
  const runtime = createLiveKitMountedRuntime({
    cameraPermissionState: "granted",
    initialCamera: true,
    initialMic: true,
    nativeApplicationActive: true,
    platformOS: "ios",
  });
  const descriptor = runtime.createAcceptedMediaDescriptor();
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    iosAcceptedCallKitMediaDescriptor: descriptor,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions);
  t.after(() => harness.unmount());

  assert.deepEqual(runtime.cameraCalls, [true]);
  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);

  // The first bounded verification observes the initially healthy track and
  // must keep monitoring this exact CallKit-accepted session without issuing
  // redundant native mutations or durable membership writes.
  const membershipTouchesBeforeMonitoring = runtime.membershipTouches.length;
  await harness.fireMediaWriteTimeout();
  assert.deepEqual(runtime.cameraCalls, [true]);
  assert.equal(runtime.membershipTouches.length, membershipTouchesBeforeMonitoring);

  // Model the physical defect: the native camera publication disappears only
  // after the accepted session was already committed and shown as connected.
  runtime.dropCameraPublication();
  await harness.fireMediaWriteTimeout();

  await waitFor(harness, () => runtime.cameraCalls.length === 2, "lost CallKit camera reached native recovery");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "lost CallKit camera converged again");
  assert.deepEqual(runtime.cameraCalls, [true, true]);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.membershipTouches.at(-1).cameraEnabled, true);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("cold-start video recovers when foreground activation happened before the AppState listener was ready", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  runtime.appState = "background";
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await harness.fireMediaWriteTimeout();
  }
  await waitFor(harness, () => harness.getResult().channelState === "live", "background call authority committed");
  assert.equal(runtime.cameraCalls.some((enabled) => enabled), false);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await harness.fireMediaWriteTimeout();
  }
  assert.equal(runtime.cameraCalls.some((enabled) => enabled), false);
  assert.equal(harness.getResult().cameraEnabled, false);

  // Model the real terminated-accept race: React Native's canonical current
  // AppState has become active, but that transition happened before the hook
  // subscribed and therefore no listener callback reaches this session.
  runtime.appState = "active";
  await harness.fireHeartbeat();
  await waitFor(harness, () => runtime.cameraCalls.filter(Boolean).length === 1, "heartbeat reached native camera boundary");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "camera state converged after missed activation event");
  assert.equal(runtime.durableCamera, true);

  const cameraCallCount = runtime.cameraCalls.length;
  await harness.fireHeartbeat();
  assert.equal(runtime.cameraCalls.length, cameraCallCount);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("terminated iOS video uses an exact-invite native foreground witness when React Native AppState is stale", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "inactive";
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-1",
    nativeForegroundActivationSerial: 1,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions);
  t.after(() => harness.unmount());

  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.cameraCalls.filter(Boolean).length, 1);
  assert.equal(runtime.nativeApplicationActiveReads >= 1, true);
});

test("terminated iOS video recovers when UIKit became active before CallKit Answer established its serial baseline", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "background";
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-1",
    nativeForegroundActivationSerial: 0,
  }));
  t.after(() => harness.unmount());

  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.cameraCalls.filter(Boolean).length, 1);
  assert.equal(runtime.nativeApplicationActiveReads >= 1, true);
});

test("terminated iOS video uses the exact accepted CallKit media descriptor after the route witness is unavailable", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "background";
  const descriptor = runtime.createAcceptedMediaDescriptor();
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    iosAcceptedCallKitMediaDescriptor: descriptor,
    nativeForegroundActivationInviteId: "",
    nativeForegroundActivationSerial: 0,
  }));
  t.after(() => harness.unmount());

  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.cameraCalls.filter(Boolean).length, 1);
  assert.equal(runtime.nativeApplicationActiveReads >= 1, true);
});

test("accepted CallKit media descriptor cannot bridge UIKit for another account, invite, thread, room, or provider", async (t) => {
  for (const descriptorOverrides of [
    { authenticatedUserId: "other-user" },
    { inviteId: "invite-other" },
    { threadId: "thread-other" },
    { roomId: "ROOM-OTHER" },
    { mediaProvider: "legacy_webrtc" },
  ]) {
    const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
    runtime.appState = "background";
    const descriptor = runtime.createAcceptedMediaDescriptor(descriptorOverrides);
    const harness = await mountLiveKitHook(runtime, defaultHookOptions({
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video" },
      iosAcceptedCallKitMediaDescriptor: descriptor,
    }), { requireLive: false });
    t.after(() => harness.unmount());
    for (let attempt = 0; attempt < 4; attempt += 1) await harness.fireMediaWriteTimeout();
    await waitFor(harness, () => harness.getResult().channelState === "live", "mismatched descriptor authority committed without camera");
    assert.equal(harness.getResult().cameraEnabled, false);
    assert.equal(runtime.cameraCalls.some(Boolean), false);
    assert.equal(runtime.nativeApplicationActiveReads, 0);
  }
});

test("pre-Answer UIKit activation cannot publish camera without the exact invite-bound route witness", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "background";
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-other",
    nativeForegroundActivationSerial: 0,
  }), { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 0; attempt < 4; attempt += 1) await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => harness.getResult().channelState === "live", "mismatched pre-Answer witness authority committed");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(runtime.cameraCalls.some(Boolean), false);
  assert.equal(runtime.nativeApplicationActiveReads, 0);
});

test("native foreground witness cannot enable camera for another invite", async (t) => {
  const mismatchedRuntime = createLiveKitMountedRuntime({ platformOS: "ios" });
  mismatchedRuntime.appState = "inactive";
  const mismatchedHarness = await mountLiveKitHook(mismatchedRuntime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-other",
    nativeForegroundActivationSerial: 1,
  }), { requireLive: false });
  t.after(() => mismatchedHarness.unmount());
  for (let attempt = 0; attempt < 3; attempt += 1) await mismatchedHarness.fireMediaWriteTimeout();
  await waitFor(mismatchedHarness, () => mismatchedHarness.getResult().channelState === "live", "mismatched witness call authority committed");
  assert.equal(mismatchedHarness.getResult().cameraEnabled, false);
  assert.equal(mismatchedRuntime.cameraCalls.some(Boolean), false);
  assert.equal(mismatchedRuntime.nativeApplicationActiveReads, 0);

});

test("terminated iOS video requires current UIKit active state before bridging stale launch-time background", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "background";
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-1",
    nativeForegroundActivationSerial: 1,
  }));
  t.after(() => harness.unmount());

  assert.equal(harness.getResult().cameraEnabled, true);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.cameraCalls.filter(Boolean).length, 1);
  assert.equal(runtime.nativeApplicationActiveReads >= 1, true);
});

test("terminated iOS video keeps camera off when the exact witness is stale but UIKit is backgrounded", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: false, platformOS: "ios" });
  runtime.appState = "background";
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-1",
    nativeForegroundActivationSerial: 1,
  }), { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 0; attempt < 4; attempt += 1) await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => harness.getResult().channelState === "live", "background call authority committed");
  assert.equal(runtime.nativeApplicationActiveReads >= 1, true);
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(runtime.cameraCalls.some(Boolean), false);
});

test("terminated iOS video cannot publish camera when background revokes the witness during the native state read", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "background";
  const nativeStateRead = runtime.deferNativeApplicationActive(true);
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-1",
    nativeForegroundActivationSerial: 1,
  }), { requireLive: false });
  t.after(() => harness.unmount());
  await waitFor(harness, () => runtime.nativeApplicationActiveReads === 1, "native state read started");

  await harness.fireAppState("background");
  nativeStateRead.resolve();
  await harness.flush(48);

  assert.equal(runtime.cameraCalls.some(Boolean), false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(harness.getResult().cameraEnabled, false);
});

test("camera enable compensates without durable publication when the app backgrounds during the native write", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const cameraWrite = runtime.deferCamera();
  const operation = await harness.startOperation(() => harness.getResult().setCameraEnabled(true));
  await waitFor(harness, () => runtime.cameraCalls.at(-1) === true, "camera enable reached native boundary");

  runtime.nativeApplicationActive = false;
  await harness.fireAppState("background");
  cameraWrite.resolve();
  assert.equal(await settleOperation(operation, harness), false);

  const finalEnabledCall = runtime.cameraCalls.lastIndexOf(true);
  assert.equal(finalEnabledCall >= 0, true);
  assert.equal(runtime.cameraCalls.slice(finalEnabledCall + 1).includes(false), true);
  assert.equal(runtime.cameraCalls.at(-1), false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.membershipTouches.some((entry) => entry.cameraEnabled === true), false);
});

test("camera off and on replaces the stopped publication instead of trusting a stalled managed unmute", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    managedCameraUnmuteStallsRemote: true,
    nativeApplicationActive: true,
    retainMutedCameraPublication: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const initialGeneration = runtime.rooms.at(-1).localParticipant.cameraGeneration;
  const initialMicCalls = runtime.micCalls.length;
  const initialProviderTokenCalls = runtime.providerTokenCalls;
  const lifecycleBaseline = runtime.cameraLifecycleEvents.length;

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), true);
  assert.equal(runtime.remoteCameraConverged, false);
  assert.deepEqual(
    runtime.cameraLifecycleEvents.slice(lifecycleBaseline),
    [`unpublish-camera:${initialGeneration}`],
    "an active publication must be retired before a managed mute can detach its sender",
  );
  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), true);

  assert.equal(runtime.cameraUnpublishes.length, 1);
  assert.equal(
    runtime.cameraUnpublishes[0].stopOnUnpublish,
    true,
    "retiring the publication must also stop its physical capture track",
  );
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraGeneration, initialGeneration + 1);
  assert.equal(runtime.remoteCameraConverged, true);
  assert.equal(runtime.micCalls.length, initialMicCalls);
  assert.equal(runtime.providerTokenCalls, initialProviderTokenCalls);
  assert.equal(runtime.roomDisconnects ?? 0, 0);
});

test("remote camera projection closes promptly from durable membership even when LiveKit keeps a stale publication", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const mediaChannel = runtime.realtimeChannels.at(-1);

  assert.equal(readRemote()?.cameraOn, true);
  assert.ok(readRemote()?.liveKitVideoTrackReference);
  assert.equal(mediaChannel?.topic, "comm-room-ROOM-1");
  assert.equal(mediaChannel?.config?.config?.private, true);
  assert.equal(
    mediaChannel?.handlers.some((entry) => entry.event === "postgres_changes"),
    false,
    "membership invalidation must use the existing authenticated broadcast plane, not an unpublished table feed",
  );

  runtime.remoteDurableCamera = false;
  await harness.fireMembershipChange();

  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
  assert.equal(
    runtime.rooms.at(-1).remoteParticipants.get(runtime.remoteUserId).cameraEnabled,
    true,
    "the regression must retain a stale provider publication while membership closes rendering",
  );
});

test("remote camera projection never opens from membership without a usable LiveKit publication", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: false,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);

  runtime.remoteDurableCamera = true;
  await harness.fireMembershipChange();

  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
});

test("empty server state invalidation closes departed membership camera projection without waiting for heartbeat", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const channel = runtime.realtimeChannels.at(-1);
  const invalidate = stateInvalidationHandler(channel);
  const readsBeforeHint = runtime.snapshotReads;
  const touchesBeforeHint = runtime.membershipTouches.length;
  const tokenCallsBeforeHint = runtime.providerTokenCalls;
  assert.equal(channel.topic, "comm-room-ROOM-1");
  assert.equal(channel.config.config.private, true);
  assert.equal(readRemote()?.cameraOn, true);

  runtime.remoteIncludedInSnapshot = false;
  await runOperation(harness, () => invalidate({ payload: {} }));

  assert.equal(runtime.snapshotReads, readsBeforeHint + 1);
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
  assert.equal(runtime.rooms.at(-1).remoteParticipants.has(runtime.remoteUserId), true,
    "durable departure closes rendering even before provider disconnection");
  assert.equal(runtime.membershipTouches.length, touchesBeforeHint);
  assert.equal(runtime.providerTokenCalls, tokenCallsBeforeHint);
  assert.equal(runtime.roomDisconnects ?? 0, 0);
  assert.equal(harness.getResult().channelState, "live");
});

test("server state invalidation ignores claimed room, terminal, and media values", async (t) => {
  const ended = [];
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
    onRoomEnded: (reason) => ended.push(reason),
  }));
  const invalidate = stateInvalidationHandler(runtime.realtimeChannels.at(-1));
  const readsBeforeHint = runtime.snapshotReads;
  runtime.remoteDurableCamera = false;

  await runOperation(harness, () => invalidate({ payload: {
    roomId: "OTHER-ROOM",
    status: "ended",
    cameraOn: true,
    micOn: true,
  } }));

  assert.equal(runtime.snapshotReads, readsBeforeHint + 1);
  assert.equal(harness.getResult().room?.roomId, "ROOM-1");
  assert.equal(harness.getResult().room?.status, "active");
  assert.equal(harness.getResult().participants.find((entry) => !entry.isSelf)?.cameraOn, false);
  assert.deepEqual(ended, []);
  assert.equal(harness.getResult().channelState, "live");
});

for (const outcome of ["null", "terminal"]) {
  test(`server state invalidation retires capture after authoritative ${outcome} readback without callback cleanup`, async (t) => {
    const ended = [];
    const { harness, runtime } = await mountCase(t, {
      initialCamera: true,
      initialMic: true,
    }, defaultHookOptions({
      initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video" },
      onRoomEnded: (reason) => ended.push(reason),
    }));
    const invalidate = stateInvalidationHandler(runtime.realtimeChannels.at(-1));
    const readsBeforeHint = runtime.snapshotReads;
    const liveKitRoom = runtime.rooms.at(-1);
    assert.equal(liveKitRoom.localParticipant.cameraEnabled, true);
    assert.equal(liveKitRoom.localParticipant.micEnabled, true);
    runtime.queueSnapshot({ outcome });

    await runOperation(harness, () => invalidate({ payload: {} }));

    assert.equal(runtime.snapshotReads, readsBeforeHint + 1);
    assert.deepEqual(ended, ["ended"]);
    assert.equal(liveKitRoom.localParticipant.cameraEnabled, false);
    assert.equal(liveKitRoom.localParticipant.micEnabled, false);
    assert.equal(liveKitRoom.state, "disconnected");
    assert.equal(runtime.audioStopCalls, 1);
    assert.equal(runtime.membershipLeaves, 0, "unavailable room grants no durable leave authority");
    assert.equal(runtime.stages.filter((stage) => stage === "cleanup_complete").length, 1);
    assert.equal(harness.getResult().channelState, "idle");
    assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
    await runOperation(harness, () => invalidate({ payload: {} }));
    assert.equal(runtime.snapshotReads, readsBeforeHint + 1, "terminal authority rejects further hints");
    assert.deepEqual(ended, ["ended"]);
  });

  test(`server state invalidation preserves failed cleanup and End retry after ${outcome} readback`, async (t) => {
    const { harness, runtime } = await mountCase(t, {}, defaultHookOptions({ onRoomEnded: () => undefined }));
    const invalidate = stateInvalidationHandler(runtime.realtimeChannels.at(-1));
    runtime.queueSnapshot({ outcome });
    runtime.queueAudioStop({ outcome: "reject" });

    await runOperation(harness, () => invalidate({ payload: {} }));

    assert.equal(runtime.rooms.at(-1).state, "disconnected");
    assert.equal(runtime.stages.includes("cleanup_complete"), false);
    assert.equal(runtime.membershipLeaves, 0);
    assert.equal(harness.getResult().channelState, "error");
    assert.match(harness.getResult().error, /Unable to prove local call shutdown/u);
    assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
    assert.equal(runtime.audioStopCalls, 2);
    assert.equal(runtime.stages.filter((stage) => stage === "cleanup_complete").length, 1);
    assert.equal(harness.getResult().channelState, "idle");
  });
}

test("server state invalidation read failure preserves the live call and cannot claim terminal state", async (t) => {
  const ended = [];
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    onRoomEnded: (reason) => ended.push(reason),
  }));
  const invalidate = stateInvalidationHandler(runtime.realtimeChannels.at(-1));
  const readsBeforeHint = runtime.snapshotReads;
  runtime.queueSnapshot({ outcome: "reject" });

  await runOperation(harness, () => invalidate({ payload: {} }));

  assert.equal(runtime.snapshotReads, readsBeforeHint + 1);
  assert.deepEqual(ended, []);
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, true);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
  assert.equal(runtime.rooms.at(-1).state, "connected");
  assert.equal(runtime.audioStopCalls, 0);
  assert.equal(runtime.membershipLeaves, 0);
  assert.equal(runtime.errors.some((entry) => entry.scope === "chat-call-livekit-state-snapshot-refresh"), true);
  assert.equal(harness.getResult().channelState, "live");
  await harness.fireHeartbeat();
  assert.equal(harness.getResult().channelState, "live");
  assert.deepEqual(ended, []);
});

test("initial authoritative null snapshot retires its exact admission before native media acquisition", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialCamera: true, initialMic: true });
  runtime.queueSnapshot({ outcome: "null" });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }), { requireLive: false });
  t.after(() => harness.unmount());

  assert.equal(runtime.rooms.length, 0);
  assert.equal(runtime.providerTokenCalls, 0);
  assert.equal(runtime.cameraCalls.length, 0);
  assert.equal(runtime.micCalls.length, 0);
  assert.equal(runtime.membershipLeaveRequests.length, 1);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, runtime.membershipGeneration);
  assert.equal(harness.getResult().channelState, "error");
  assert.equal(runtime.errors.some((entry) => entry.message === "accepted_chat_call_room_unavailable"), true);
});

test("server state invalidation retires an old durable generation without leaving its replacement", async (t) => {
  const { harness, runtime } = await mountCase(t, { initialMic: true }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  }));
  const invalidate = stateInvalidationHandler(runtime.realtimeChannels.at(-1));
  runtime.membershipGeneration = "20000000-0000-4000-8000-000000000002";

  await runOperation(harness, () => invalidate({ payload: {} }));

  assert.equal(runtime.membershipLeaveRequests.length, 0);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /continued in another session/u);
  assert.equal(runtime.durableMic, true, "new admission retains its durable media state");
});

test("server state invalidation bursts share the bounded reader with media hints", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  });
  const invalidate = stateInvalidationHandler(runtime.realtimeChannels.at(-1));
  const leadingSnapshot = deferred();
  runtime.queueSnapshot({ gate: leadingSnapshot, outcome: "active", remoteCamera: true });
  runtime.queueSnapshot({ outcome: "active", remoteCamera: false });
  const readsBeforeBurst = runtime.snapshotReads;

  await runOperation(harness, () => {
    for (let index = 0; index < 50; index += 1) {
      invalidate({ payload: {} });
      runtime.emitMembershipChange();
    }
  });

  assert.equal(runtime.snapshotReads, readsBeforeBurst + 1);
  await harness.resolveDeferred(leadingSnapshot);
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 1);
  await harness.fireLatestTimeout();
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 2);
  assert.equal(harness.getResult().participants.find((entry) => !entry.isSelf)?.cameraOn, false);
});

for (const [retirement, outcome] of ["End", "account switch", "same-room replacement"].flatMap(
  (retirement) => ["null", "reject"].map((outcome) => [retirement, outcome]),
)) {
  test(`server state invalidation callback and pending ${outcome} read cannot cross ${retirement}`, async (t) => {
    const ended = [];
    const options = defaultHookOptions({ onRoomEnded: (reason) => ended.push(reason) });
    const { harness, runtime } = await mountCase(t, {}, options);
    const oldChannel = runtime.realtimeChannels.at(-1);
    const invalidate = stateInvalidationHandler(oldChannel);
    const pendingSnapshot = deferred();
    runtime.queueSnapshot({ gate: pendingSnapshot, outcome });
    const readsBeforeHint = runtime.snapshotReads;
    await runOperation(harness, () => invalidate({ payload: {} }));
    assert.equal(runtime.snapshotReads, readsBeforeHint + 1);

    if (retirement === "End") {
      assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
    } else {
      runtime.queueMembershipJoin({ generation: "20000000-0000-4000-8000-000000000002" });
      if (retirement === "account switch") runtime.userId = "replacement-user";
      await harness.commitRender(defaultHookOptions({
        ...options,
        authenticatedUserId: runtime.userId,
        invite: { ...options.invite, id: "invite-2", calleeUserId: runtime.userId },
      }));
      await waitFor(harness, () => runtime.rooms.length === 2 && harness.getResult().channelState === "live",
        "replacement session independently connected");
      assert.equal(oldChannel.removed, true);
    }

    const readsAfterRetirement = runtime.snapshotReads;
    const writesAfterRetirement = runtime.membershipTouches.length;
    const leavesAfterRetirement = runtime.membershipLeaveRequests.length;
    const errorsAfterRetirement = runtime.errors.length;
    await harness.resolveDeferred(pendingSnapshot);
    await runOperation(harness, () => invalidate({ payload: {} }));

    assert.equal(runtime.snapshotReads, readsAfterRetirement);
    assert.equal(runtime.membershipTouches.length, writesAfterRetirement);
    assert.equal(runtime.membershipLeaveRequests.length, leavesAfterRetirement);
    assert.equal(runtime.errors.length, errorsAfterRetirement);
    assert.deepEqual(ended, []);
    assert.equal(harness.getResult().channelState, retirement === "End" ? "idle" : "live");
    if (retirement !== "End") assert.equal(harness.getResult().room?.roomId, "ROOM-1");
  });
}

test("media invalidation rejects wrong-room and self-sender payloads before authoritative refresh", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const readsBeforeInvalidEvents = runtime.snapshotReads;
  runtime.remoteDurableCamera = false;

  await harness.fireMembershipChange({ roomId: "ROOM-2" });
  await harness.fireMembershipChange({ fromUserId: runtime.userId });

  assert.equal(runtime.snapshotReads, readsBeforeInvalidEvents);
  assert.equal(readRemote()?.cameraOn, true);

  await harness.fireMembershipChange();
  assert.equal(readRemote()?.cameraOn, false);
});

test("LiveKit data invalidation refreshes only from a connected peer and ignores claimed media values", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const readsBeforeInvalidEvents = runtime.snapshotReads;
  runtime.remoteDurableCamera = false;

  await harness.fireLiveKitMediaInvalidation({ topic: "unrelated" });
  await harness.fireLiveKitMediaInvalidation({ payload: [2] });
  await harness.fireLiveKitMediaInvalidation({ fromUserId: runtime.userId });
  await harness.fireLiveKitMediaInvalidation({ fromUserId: "unrelated-user" });
  await harness.fireLiveKitMediaInvalidation({ missingParticipant: true });

  assert.equal(runtime.snapshotReads, readsBeforeInvalidEvents);
  assert.equal(readRemote()?.cameraOn, true);

  await harness.fireLiveKitMediaInvalidation({ cameraOn: true });
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
});

test("LiveKit participant connection closes a missed initial-media invalidation without heartbeat", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: false,
    remoteCamera: true,
    snapshotRemoteParticipant: false,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readsBeforeConnection = runtime.snapshotReads;
  runtime.remoteIncludedInSnapshot = true;
  const remote = runtime.restoreRemoteParticipant();

  await harness.emitRoom("ParticipantConnected", remote);

  assert.equal(runtime.snapshotReads, readsBeforeConnection + 1);
  const projectedRemote = harness.getResult().participants.find((entry) => !entry.isSelf);
  assert.equal(projectedRemote?.cameraOn, true);
  assert.ok(projectedRemote?.liveKitVideoTrackReference);
});

test("subscription readiness closes the initial peer-join race without waiting for heartbeat", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    deferRealtimeSubscribe: true,
    initialRemoteParticipant: true,
    remoteCamera: true,
    snapshotRemoteParticipant: false,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const readsBeforeSubscribed = runtime.snapshotReads;

  assert.equal(readRemote()?.cameraOn ?? false, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
  assert.equal(runtime.mediaBroadcasts.length, 1);
  assert.equal(runtime.mediaBroadcasts[0]?.event, "media:update");
  assert.equal(runtime.mediaBroadcasts[0]?.payload?.cameraOn, true);

  runtime.remoteIncludedInSnapshot = true;
  await harness.fireMembershipSubscriptionStatus("SUBSCRIBED");

  assert.equal(runtime.snapshotReads, readsBeforeSubscribed + 1);
  assert.equal(readRemote()?.cameraOn, true);
  assert.ok(readRemote()?.liveKitVideoTrackReference);
});

test("older heartbeat snapshot cannot overwrite a newer remote camera projection", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const oldHeartbeatSnapshot = deferred();
  runtime.queueSnapshot({ gate: oldHeartbeatSnapshot, outcome: "active", remoteCamera: true });

  await harness.fireHeartbeat();
  runtime.remoteDurableCamera = false;
  runtime.queueSnapshot({ outcome: "active", remoteCamera: false });
  await harness.fireMembershipChange();
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);

  await harness.resolveDeferred(oldHeartbeatSnapshot);
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
});

test("an older microphone preflight read cannot overwrite a newer remote camera projection", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
    snapshotRemoteParticipant: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: false },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const oldPreflight = runtime.deferSnapshot();
  runtime.nextSnapshotActions.at(-1).remoteCamera = true;
  const micToggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.nextSnapshotActions.length === 0, "microphone preflight read started");

  runtime.remoteDurableCamera = false;
  runtime.queueSnapshot({ outcome: "active", remoteCamera: false });
  await harness.fireMembershipChange();
  assert.equal(readRemote()?.cameraOn, false);

  await harness.resolveDeferred(oldPreflight);
  assert.equal(await settleOperation(micToggle, harness), true);
  assert.equal(harness.getResult().micEnabled, true);
  assert.equal(
    readRemote()?.cameraOn,
    false,
    "a local control preflight must not replace a newer unrelated participant projection",
  );
});

test("media invalidation bursts use one immediate and one paced authoritative snapshot", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const leadingSnapshot = deferred();
  runtime.queueSnapshot({ gate: leadingSnapshot, outcome: "active", remoteCamera: true });
  runtime.queueSnapshot({ outcome: "active", remoteCamera: false });
  runtime.remoteDurableCamera = false;
  const readsBeforeBurst = runtime.snapshotReads;

  await harness.fireMembershipChangeBurst(50);
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 1);

  await harness.resolveDeferred(leadingSnapshot);
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 1);
  await harness.fireLatestTimeout();
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 2);
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
});

test("a LiveKit invalidation received during each active refresh is not stranded until heartbeat", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const leadingSnapshot = deferred();
  const trailingSnapshot = deferred();
  runtime.queueSnapshot({ gate: leadingSnapshot, outcome: "active", remoteCamera: true });
  runtime.queueSnapshot({ gate: trailingSnapshot, outcome: "active", remoteCamera: true });
  runtime.queueSnapshot({ outcome: "active", remoteCamera: false });
  runtime.remoteDurableCamera = false;
  const readsBeforeEvents = runtime.snapshotReads;

  await harness.fireLiveKitMediaInvalidation();
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 1);
  await harness.fireLiveKitMediaInvalidation();
  await harness.fireLatestTimeout();
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 1);

  await harness.resolveDeferred(leadingSnapshot);
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 2);
  await harness.fireLiveKitMediaInvalidation();
  await harness.fireLatestTimeout();
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 2);

  await harness.resolveDeferred(trailingSnapshot);
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 3);
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
});

test("LiveKit data invalidation bursts share the paced authoritative reader", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readRemote = () => harness.getResult().participants.find((entry) => !entry.isSelf);
  const leadingSnapshot = deferred();
  runtime.queueSnapshot({ gate: leadingSnapshot, outcome: "active", remoteCamera: true });
  runtime.queueSnapshot({ outcome: "active", remoteCamera: false });
  runtime.remoteDurableCamera = false;
  const readsBeforeBurst = runtime.snapshotReads;

  await harness.fireLiveKitMediaInvalidationBurst(50);
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 1);

  await harness.resolveDeferred(leadingSnapshot);
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 1);
  await harness.fireLatestTimeout();
  assert.equal(runtime.snapshotReads, readsBeforeBurst + 2);
  assert.equal(readRemote()?.cameraOn, false);
  assert.equal(readRemote()?.liveKitVideoTrackReference, undefined);
});

test("LiveKit data invalidation rate-limits paced peer reads and cancels delayed cleanup work", async () => {
  const runtime = createLiveKitMountedRuntime({
    initialRemoteParticipant: true,
    remoteCamera: true,
  });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const readsBeforeEvents = runtime.snapshotReads;
  runtime.remoteDurableCamera = false;

  await harness.fireLiveKitMediaInvalidation();
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 1);

  for (let index = 0; index < 50; index += 1) {
    await harness.fireLiveKitMediaInvalidation();
  }
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 1);

  const firstTimerIndex = runtime.timeoutCallbacks.findLastIndex(
    (callback) => typeof callback === "function",
  );
  assert.ok(firstTimerIndex >= 0);
  assert.ok(runtime.timeoutDelays[firstTimerIndex] > 0);
  assert.ok(runtime.timeoutDelays[firstTimerIndex] <= 1_000);
  await harness.fireLatestTimeout();
  assert.equal(runtime.snapshotReads, readsBeforeEvents + 2);

  await harness.fireLiveKitMediaInvalidation();
  const cleanupTimerIndex = runtime.timeoutCallbacks.findLastIndex(
    (callback) => typeof callback === "function",
  );
  const staleTimer = runtime.timeoutCallbacks[cleanupTimerIndex];
  assert.ok(cleanupTimerIndex >= 0);
  assert.equal(typeof staleTimer, "function");
  const readsBeforeUnmount = runtime.snapshotReads;

  await harness.unmount();
  assert.equal(runtime.timeoutCallbacks[cleanupTimerIndex], null);
  staleTimer();
  await Promise.resolve();
  assert.equal(runtime.snapshotReads, readsBeforeUnmount);
});

test("membership subscription failure keeps the call live with heartbeat fallback", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    remoteCamera: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));

  await harness.fireMembershipSubscriptionStatus("CHANNEL_ERROR", new Error("fixture realtime error"));
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(
    runtime.errors.some((entry) => entry.scope === "chat-call-livekit-membership-subscription"),
    true,
  );

  runtime.remoteDurableCamera = false;
  await harness.fireHeartbeat();
  const remote = harness.getResult().participants.find((entry) => !entry.isSelf);
  assert.equal(remote?.cameraOn, false);
  assert.equal(remote?.liveKitVideoTrackReference, undefined);
});

test("local camera commits an authenticated media invalidation after durable state", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialRemoteParticipant: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const broadcastsBeforeToggle = runtime.mediaBroadcasts.length;
  const dataBroadcastsBeforeToggle = runtime.liveKitDataPublishes.length;

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), true);

  assert.equal(runtime.mediaBroadcasts.length, broadcastsBeforeToggle + 1);
  assert.equal(runtime.liveKitDataPublishes.length, dataBroadcastsBeforeToggle + 1);
  assert.deepEqual(runtime.liveKitDataPublishes.at(-1), {
    data: [1],
    options: { reliable: true, topic: "chillywood.media-state.v1" },
  });
  const committedBroadcast = runtime.mediaBroadcasts.at(-1);
  assert.equal(committedBroadcast?.event, "media:update");
  assert.equal(committedBroadcast?.roomId, "ROOM-1");
  assert.equal(committedBroadcast?.userId, runtime.userId);
  assert.equal(committedBroadcast?.expectedMembershipGeneration, runtime.membershipGeneration);
  assert.equal(committedBroadcast?.payload?.cameraOn, false);
  assert.equal(committedBroadcast?.payload?.micOn, true);
  assert.equal(runtime.durableCamera, false);
  assert.equal(harness.getResult().cameraEnabled, false);
});

test("late committed media response cannot relay through a same-room replacement owner", async (t) => {
  const preferences = { cameraEnabled: true, micEnabled: true };
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true, initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: preferences,
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const oldGeneration = runtime.membershipGeneration;
  const pendingResponse = deferred();
  runtime.queueTouch({ afterCommitGate: pendingResponse });
  const oldAction = await harness.startOperation(() => harness.getResult().setCameraEnabled(false));
  await waitFor(harness, () => runtime.durableCamera === false, "old camera write committed before delayed response");

  await harness.unmount();
  const replacementRuntime = createLiveKitMountedRuntime({
    durableMembershipStore: runtime.durableMembershipStore, initialCamera: true, initialMic: true,
  });
  const replacementHarness = await mountLiveKitHook(replacementRuntime, defaultHookOptions({
    initialMediaPreferences: preferences,
    invite: { ...defaultHookOptions().invite, id: "replacement-invite", callType: "video" },
  }));
  t.after(() => replacementHarness.unmount());
  const currentGeneration = replacementRuntime.membershipGeneration;
  assert.notEqual(currentGeneration, oldGeneration);
  const broadcastsBeforeOldResponse = runtime.mediaBroadcasts.length;
  await harness.resolveDeferred(pendingResponse);
  assert.equal(await settleOperation(oldAction, harness), false);
  assert.equal(runtime.mediaBroadcasts.length, broadcastsBeforeOldResponse, "retired callback cannot borrow the replacement's relay authority");
  assert.equal(runtime.durableCamera, true);

  assert.equal(await runOperation(replacementHarness, () => replacementHarness.getResult().setCameraEnabled(false)), true);
  assert.equal(replacementRuntime.mediaBroadcasts.at(-1)?.userId, replacementRuntime.userId);
  assert.equal(replacementRuntime.mediaBroadcasts.at(-1)?.expectedMembershipGeneration, currentGeneration);
  assert.equal(replacementRuntime.errors.some((entry) => entry.scope === "chat-call-livekit-media-state-broadcast"), false);
});

test("camera action reaches the peer through the actual RPC broadcaster and authoritative refresh", async (t) => {
  const senderUserId = "11111111-1111-4111-8111-111111111111";
  const receiverUserId = "22222222-2222-4222-8222-222222222222";
  let senderRuntime;
  let receiverRuntime;
  const rpcCalls = [];
  const actualBroadcast = loadActualCommunicationBroadcaster(function rpc(functionName, args, userId) {
    rpcCalls.push({ args, functionName, userId });
    assert.equal(functionName, "broadcast_owned_communication_room_signal");
    assert.equal(userId, senderUserId);
    assert.equal(args.p_expected_membership_generation, senderRuntime.membershipGeneration);
    assert.equal(args.p_event, "media:update");
    receiverRuntime.remoteDurableCamera = senderRuntime.durableCamera;
    receiverRuntime.remoteDurableMic = senderRuntime.durableMic;
    receiverRuntime.emitMembershipChange({
      cameraOn: args.p_payload.cameraOn,
      fromUserId: senderRuntime.userId,
      membershipGeneration: args.p_expected_membership_generation,
      micOn: args.p_payload.micOn,
      roomId: args.p_room_id,
    });
    return Promise.resolve({
      data: {
        event: args.p_event,
        roomId: args.p_room_id,
        fromUserId: senderRuntime.userId,
        membershipGeneration: args.p_expected_membership_generation,
        sent: true,
      },
      error: null,
    });
  });

  receiverRuntime = createLiveKitMountedRuntime({
    initialRemoteParticipant: true,
    remoteCamera: true,
    remoteUserId: senderUserId,
    snapshotRemoteParticipant: true,
    userId: receiverUserId,
  });
  const receiverHarness = await mountLiveKitHook(receiverRuntime, defaultHookOptions({
    authenticatedUserId: receiverUserId,
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video", callerUserId: senderUserId, calleeUserId: receiverUserId },
  }));
  t.after(() => receiverHarness.unmount());

  senderRuntime = createLiveKitMountedRuntime({
    broadcastCommunicationRoomSignal: actualBroadcast,
    initialCamera: true,
    initialMic: true,
    initialRemoteParticipant: true,
    remoteUserId: receiverUserId,
    snapshotRemoteParticipant: true,
    userId: senderUserId,
  });
  const senderHarness = await mountLiveKitHook(senderRuntime, defaultHookOptions({
    authenticatedUserId: senderUserId,
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: {
      ...defaultHookOptions().invite,
      callType: "video",
      calleeUserId: receiverUserId,
      callerUserId: senderUserId,
    },
  }));
  t.after(() => senderHarness.unmount());
  const readReceiverRemote = () => receiverHarness.getResult().participants.find((entry) => !entry.isSelf);
  const receiverReadsBeforeAction = receiverRuntime.snapshotReads;
  assert.equal(readReceiverRemote()?.cameraOn, true);

  assert.equal(await runOperation(senderHarness, () => senderHarness.getResult().setCameraEnabled(false)), true);
  assert.equal(senderRuntime.durableCamera, false, "the sender committed authoritative camera state first");
  if (readReceiverRemote()?.cameraOn !== false) await receiverHarness.fireLatestTimeout();
  await waitFor(receiverHarness, () => readReceiverRemote()?.cameraOn === false, "peer camera projection refreshed");

  assert.ok(rpcCalls.length >= 1, "the actual communication broadcaster reached the RPC boundary");
  assert.ok(receiverRuntime.snapshotReads > receiverReadsBeforeAction, "the peer performed an authoritative read");
  assert.equal(readReceiverRemote()?.cameraOn, false);
  assert.equal(readReceiverRemote()?.liveKitVideoTrackReference, undefined);
});

test("LiveKit data invalidation failure preserves the connected call and other fallbacks", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialRemoteParticipant: true,
    rejectLiveKitDataBroadcast: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), true);
  await harness.flush();

  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.mediaBroadcasts.at(-1)?.event, "media:update");
  assert.equal(
    runtime.errors.some((entry) => entry.scope === "chat-call-livekit-media-data-broadcast"),
    true,
  );
  await harness.fireHeartbeat();
  assert.equal(harness.getResult().channelState, "live");
});

test("media invalidation failure preserves the connected call and heartbeat fallback", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialRemoteParticipant: true,
    rejectMediaBroadcast: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), true);
  await harness.flush();

  assert.equal(harness.getResult().channelState, "live");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(
    runtime.errors.some((entry) => entry.scope === "chat-call-livekit-media-state-broadcast"),
    true,
  );
  await harness.fireHeartbeat();
  assert.equal(harness.getResult().channelState, "live");
});

test("unmount removes only the exact LiveKit membership channel", async () => {
  const runtime = createLiveKitMountedRuntime({ initialRemoteParticipant: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const channel = runtime.realtimeChannels.at(-1);

  assert.ok(channel);
  await harness.unmount();

  assert.deepEqual(runtime.realtimeRemovedChannels, [channel]);
  assert.equal(channel.removed, true);
});

test("replacement removes the old membership channel and its callback cannot read for the new room", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialRemoteParticipant: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const oldChannel = runtime.realtimeChannels.at(-1);
  const oldCallback = oldChannel.handlers.find((entry) => (
    entry.event === "broadcast" && entry.filter?.event === "media:update"
  )).callback;

  await harness.commitRender(replacementOptions());
  await waitFor(
    harness,
    () => runtime.realtimeChannels.some((entry) => entry !== oldChannel && !entry.removed),
    "replacement membership channel subscribed",
  );
  assert.equal(oldChannel.removed, true);
  const readsBeforeStaleCallback = runtime.snapshotReads;

  oldCallback({ payload: {
    cameraOn: false,
    fromUserId: runtime.remoteUserId,
    micOn: true,
    roomId: runtime.roomId,
  } });
  await harness.flush();

  assert.equal(runtime.snapshotReads, readsBeforeStaleCallback);
  assert.equal(harness.getResult().room?.roomId, "ROOM-2");
});

test("a replaced room's participant callback cannot make an empty replacement reconnect wait for a ghost peer", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialRemoteParticipant: false });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const oldRoom = runtime.rooms.at(-1);
  const staleParticipantConnected = oldRoom.handlers.get("ParticipantConnected");

  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit room connected");
  assert.equal(harness.getResult().channelState, "live");

  staleParticipantConnected({ identity: runtime.remoteUserId });
  await harness.flush();
  const replacementRoom = runtime.rooms.at(-1);
  replacementRoom.state = "reconnecting";
  await harness.emitRoom("Reconnecting");
  replacementRoom.state = "connected";
  await harness.emitRoom("Reconnected");

  await waitFor(
    harness,
    () => harness.getResult().channelState === "live",
    "empty replacement recovered without a stale-peer blocker",
  );
  assert.equal(harness.getResult().participantCount, 1);
});

test("retired Room media callbacks and render acknowledgments cannot contaminate a replacement call", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialRemoteParticipant: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const oldRoom = runtime.rooms.at(-1);
  const oldRemoteView = harness.getResult().participants.find((entry) => !entry.isSelf);
  const staleLocalTrackPublished = oldRoom.handlers.get("LocalTrackPublished");
  const staleTrackSubscribed = oldRoom.handlers.get("TrackSubscribed");
  const staleActiveSpeakersChanged = oldRoom.handlers.get("ActiveSpeakersChanged");
  const staleDataReceived = oldRoom.handlers.get("DataReceived");
  const staleDisconnected = oldRoom.handlers.get("Disconnected");

  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room committed");
  assert.deepEqual({ ...harness.getResult().firstMediaState }, {
    firstAudio: false,
    firstVideo: false,
    localAudioPublished: false,
    localVideoPublished: false,
    remoteAudioSubscribed: false,
    remoteVideoSubscribed: false,
  });
  const stagesBeforeStaleCallbacks = runtime.stages.length;
  const snapshotReadsBeforeStaleCallbacks = runtime.snapshotReads;

  staleLocalTrackPublished({ source: "microphone" });
  staleTrackSubscribed({ kind: "audio" });
  staleActiveSpeakersChanged([{ identity: runtime.remoteUserId }]);
  staleDataReceived(
    new Uint8Array([1]),
    { identity: runtime.remoteUserId },
    undefined,
    "chillywood.media-state.v1",
  );
  staleDisconnected();
  harness.getResult().markParticipantVideoRendered(oldRemoteView);
  await harness.flush();

  assert.deepEqual({ ...harness.getResult().firstMediaState }, {
    firstAudio: false,
    firstVideo: false,
    localAudioPublished: false,
    localVideoPublished: false,
    remoteAudioSubscribed: false,
    remoteVideoSubscribed: false,
  });
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.stages.length, stagesBeforeStaleCallbacks);
  assert.equal(runtime.snapshotReads, snapshotReadsBeforeStaleCallbacks);
});

test("the current Room reports an unexpected disconnect after LiveKit changes transport state", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const room = runtime.rooms.at(-1);

  room.state = "disconnected";
  await harness.emitRoom("Disconnected");
  await harness.fireHeartbeat();

  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /LiveKit call disconnected/u);
  assert.equal(runtime.stages.filter((stage) => stage === "disconnected").length, 1);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
  assert.equal(runtime.membershipLeaves, 0);

  await harness.emitRoom("Disconnected");
  assert.equal(runtime.stages.filter((stage) => stage === "disconnected").length, 1);
});

test("a current Room disconnect is accepted during recovery", async (t) => {
  const { harness, runtime } = await mountCase(t, { initialRemoteParticipant: true });
  runtime.setRoomState("reconnecting");
  await harness.emitRoom("Reconnecting");
  assert.equal(harness.getResult().channelState, "reconnecting");

  runtime.setRoomState("disconnected");
  await harness.emitRoom("Disconnected");

  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /LiveKit call disconnected/u);
});

test("a current Room disconnect is accepted while initial media is still pending", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialMic: true });
  const initialMicrophone = runtime.deferNative();
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  }), { requireLive: false, turns: 8 });
  t.after(() => harness.unmount());
  await waitFor(harness, () => runtime.rooms.length === 1, "initial Room created");

  runtime.setRoomState("disconnected");
  await harness.emitRoom("Disconnected");
  await harness.resolveDeferred(initialMicrophone);
  await harness.flush(48);

  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /LiveKit call disconnected/u);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
});

test("an awaited retired Room audio callback cannot change replacement-call speaker state", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialRemoteParticipant: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  assert.equal(harness.getResult().speakerEnabled, true);
  const oldRoom = runtime.rooms.at(-1);
  const staleTrackSubscribed = oldRoom.handlers.get("TrackSubscribed");
  const staleAudioOutput = runtime.deferAudioOutput();

  await harness.startOperation(() => staleTrackSubscribed({ kind: "audio" }));
  await harness.flush();
  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement Room committed");

  await harness.resolveDeferred(staleAudioOutput);
  await waitFor(harness, () => harness.getResult().speakerEnabled === false, "replacement audio route selected");
  await harness.flush(48);

  assert.equal(harness.getResult().speakerEnabled, false);
  assert.equal(harness.getResult().channelState, "live");
});

test("media recovery rechecks call ownership after actual audio-route enumeration before microphone enable", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialMic: true,
    platformOS: "ios",
    useActualAudioRouting: true,
  }, defaultHookOptions({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } }));
  const oldRoom = runtime.rooms.at(-1);
  const calls = [];
  const setMicrophone = oldRoom.localParticipant.setMicrophoneEnabled.bind(oldRoom.localParticipant);
  oldRoom.localParticipant.setMicrophoneEnabled = async (enabled) => {
    calls.push({ enabled, state: oldRoom.state, current: runtime.rooms.at(-1) === oldRoom });
    return setMicrophone(enabled);
  };
  await harness.fireAppState("background");
  const enumeration = runtime.deferAudioOutputEnumeration();
  await harness.fireAppState("active");
  await harness.flush(48);
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement owns the hook");
  await harness.resolveDeferred(enumeration);
  await harness.flush(96);

  assert.equal(calls.some((call) => call.enabled && (!call.current || call.state === "disconnected")), false);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, true);
});

test("media recovery rechecks foreground intent after audio-route enumeration before microphone enable", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialMic: true,
    platformOS: "ios",
    useActualAudioRouting: true,
  }, defaultHookOptions({ initialMediaPreferences: { cameraEnabled: false, micEnabled: true } }));
  await harness.fireAppState("background");
  const enumeration = runtime.deferAudioOutputEnumeration();
  await harness.fireAppState("active");
  await harness.flush(48);
  await harness.fireAppState("background");
  const callCountAtBackground = runtime.micCalls.length;
  await harness.resolveDeferred(enumeration);
  await harness.flush(96);

  assert.equal(runtime.micCalls.slice(callCountAtBackground).includes(true), false, "stale foreground repair cannot enable capture");
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, false);
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(runtime.durableMic, false);
});

test("the actual audio helper rejects an old route after replacement during enumeration", async (t) => {
  const runtime = createLiveKitMountedRuntime({ useActualAudioRouting: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  assert.equal(runtime.nativeAudioOutput, "speaker");
  const oldEnumeration = runtime.deferAudioOutputEnumeration();
  const oldRoute = await harness.startOperation(() => harness.getResult().setSpeaker(true));
  await waitFor(harness, () => runtime.audioOutputEnumerations >= 2, "old route enumerating");

  await harness.commitRender(replacementOptions());
  await harness.resolveDeferred(oldEnumeration);
  assert.equal(await settleOperation(oldRoute, harness), false);
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement became live");
  await waitFor(harness, () => runtime.nativeAudioOutput === "earpiece", "replacement earpiece selected");

  assert.equal(harness.getResult().speakerEnabled, false);
  assert.equal(runtime.nativeAudioOutput, "earpiece");
  assert.notEqual(runtime.nativeAudioOutputCommands.at(-1), "speaker");
});

test("an already-issued old native route is followed by the current replacement route", async (t) => {
  const runtime = createLiveKitMountedRuntime({ useActualAudioRouting: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const oldSelection = runtime.deferNativeAudioSelection();
  const oldRoute = await harness.startOperation(() => harness.getResult().setSpeaker(true));
  await waitFor(
    harness,
    () => runtime.nativeAudioOutputCommands.filter((output) => output === "speaker").length >= 2,
    "old speaker command issued",
  );

  await harness.commitRender(replacementOptions());
  await harness.resolveDeferred(oldSelection);
  assert.equal(await settleOperation(oldRoute, harness), false);
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement became live");
  await waitFor(harness, () => runtime.nativeAudioOutput === "earpiece", "replacement route reconciled");

  assert.deepEqual(runtime.nativeAudioOutputCommands.slice(-2), ["speaker", "earpiece"]);
  assert.equal(harness.getResult().speakerEnabled, false);
});

test("a newer user audio-route request wins after an older native request settles", async (t) => {
  const runtime = createLiveKitMountedRuntime({ useActualAudioRouting: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const oldSelection = runtime.deferNativeAudioSelection();
  const oldRoute = await harness.startOperation(() => harness.getResult().setSpeaker(true));
  await waitFor(
    harness,
    () => runtime.nativeAudioOutputCommands.filter((output) => output === "speaker").length >= 2,
    "old speaker command issued",
  );
  const newerRoute = await harness.startOperation(() => harness.getResult().setSpeaker(false));

  await harness.resolveDeferred(oldSelection);
  assert.equal(await settleOperation(oldRoute, harness), false);
  assert.equal(await settleOperation(newerRoute, harness), true);

  assert.equal(runtime.nativeAudioOutput, "earpiece");
  assert.equal(harness.getResult().speakerEnabled, false);
});

test("Android routing does not turn a rejected speaker command into an unconfirmed fallback success", async (t) => {
  const runtime = createLiveKitMountedRuntime({ useActualAudioRouting: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions());
  t.after(() => harness.unmount());
  runtime.queueNativeAudioSelection({ outcome: "reject" });

  assert.equal(await runOperation(harness, () => harness.getResult().setSpeaker(true)), false);

  assert.equal(runtime.nativeAudioOutputCommands.at(-1), "speaker");
  assert.equal(runtime.nativeAudioOutputCommands.includes("force_speaker"), false);
  assert.equal(runtime.nativeAudioOutput, "earpiece");
  assert.equal(harness.getResult().speakerEnabled, false);
});

test("cleanup does not claim completion when local capture and transport shutdown are unproved", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "reject" });
  runtime.queueNative({ outcome: "reject" });
  runtime.queueDisconnect({ outcome: "reject" });
  runtime.queueDisconnect({ outcome: "reject" });

  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  const cleanupError = await settleOperation(cleanup, harness);
  assert.match(cleanupError.message, /Unable to prove that this call shut down safely/u);

  const room = runtime.rooms.at(-1);
  assert.equal(room.state, "connected");
  assert.equal(room.localParticipant.cameraEnabled, false);
  assert.equal(room.localParticipant.micEnabled, false);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
  assert.notEqual(harness.getResult().channelState, "idle");
});

test("cleanup_complete follows proved capture, transport, audio, and durable membership shutdown", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));

  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);

  const room = runtime.rooms.at(-1);
  assert.equal(room.state, "disconnected");
  assert.equal(room.localParticipant.cameraEnabled, false);
  assert.equal(room.localParticipant.micEnabled, false);
  assert.equal(runtime.audioStopCalls, 1);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, runtime.membershipGeneration);
  assert.equal(runtime.stages.filter((stage) => stage === "cleanup_complete").length, 1);
  assert.equal(harness.getResult().channelState, "idle");
});

test("generation cleanup: a join returning after unmount retires only its captured generation", async () => {
  const runtime = createLiveKitMountedRuntime();
  const pendingJoin = deferred();
  runtime.queueMembershipJoin({ gate: pendingJoin });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  const joinedGeneration = runtime.membershipGeneration;
  assert.equal(runtime.membershipJoinRequests.length, 1);
  await harness.unmount();
  await harness.resolveDeferred(pendingJoin);
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, joinedGeneration);
  assert.equal(runtime.providerTokenCalls, 0);
  assert.equal(runtime.rooms.length, 0);
  assert.equal(runtime.errors.length, 0);
});

test("generation cleanup: replacement admission waits for late old join cleanup before native ownership", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialMic: true });
  const pendingJoin = deferred();
  const pendingLeave = deferred();
  const nextGeneration = "20000000-0000-4000-8000-000000000002";
  runtime.queueMembershipJoin({ gate: pendingJoin });
  runtime.queueMembershipJoin({ generation: nextGeneration });
  runtime.queueMembershipLeave({ gate: pendingLeave });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  const oldGeneration = runtime.membershipGeneration;
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  assert.equal(runtime.membershipJoinRequests.length, 1, "new admission cannot reuse the old pending generation");
  await harness.resolveDeferred(pendingJoin);
  await waitFor(harness, () => runtime.membershipLeaves === 1, "retired join begins exact cleanup");
  assert.equal(runtime.membershipJoinRequests.length, 1, "new join waits for the old leave to settle");
  assert.equal(runtime.providerTokenCalls, 0);
  await harness.resolveDeferred(pendingLeave);
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement safely admits after old cleanup");
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, oldGeneration);
  assert.equal(runtime.membershipJoinRequests.length, 2);
  assert.equal(runtime.rooms.length, 1);
  assert.equal(runtime.durableMic, true);
  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.membershipLeaveRequests.at(-1).expectedMembershipGeneration, nextGeneration);
});

test("generation cleanup: late old-account join never acquires replacement-account authority", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialMic: true, requireExactLeaveAccount: true });
  const pendingJoin = deferred();
  runtime.queueMembershipJoin({ gate: pendingJoin });
  runtime.queueMembershipJoin({ generation: "20000000-0000-4000-8000-000000000002" });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  runtime.userId = "replacement-user";
  await harness.commitRender(defaultHookOptions({
    authenticatedUserId: "replacement-user",
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2", calleeUserId: "replacement-user" },
  }));
  await harness.resolveDeferred(pendingJoin);
  await waitFor(harness, () => harness.getResult().channelState === "live", "new account independently admitted");
  assert.equal(runtime.membershipLeaveRequests[0]?.userId, "local-user");
  assert.equal(runtime.errors.filter(entry => entry.scope === "chat-call-livekit-retired-join-cleanup").length, 1);
  assert.equal(runtime.rooms.length, 1);
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().error, null);
  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.membershipLeaveRequests.at(-1).userId, "replacement-user");
});

test("generation cleanup: rejected old join releases replacement admission without changing its state", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const pendingJoin = deferred();
  runtime.queueMembershipJoin({ gate: pendingJoin, outcome: "reject" });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  await harness.commitRender(defaultHookOptions({ invite: { ...defaultHookOptions().invite, id: "invite-2" } }));
  await harness.resolveDeferred(pendingJoin);
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement admits after retired rejection");
  assert.equal(runtime.membershipLeaves, 0);
  assert.equal(runtime.rooms.length, 1);
  assert.equal(harness.getResult().error, null);
});

test("generation cleanup: unresolved predecessor fails boundedly without releasing its admission barrier", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const pendingJoin = deferred();
  runtime.queueMembershipJoin({ gate: pendingJoin });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  await harness.commitRender(defaultHookOptions({ invite: { ...defaultHookOptions().invite, id: "invite-2" } }));
  await harness.fireLatestTimeout();
  assert.equal(harness.getResult().channelState, "error");
  assert.equal(runtime.membershipJoinRequests.length, 1);
  assert.equal(runtime.rooms.length, 0);
  assert.ok(runtime.errors.some(entry => entry.message === "accepted_chat_call_prior_membership_pending"));
  await harness.commitRender(defaultHookOptions({ invite: { ...defaultHookOptions().invite, id: "invite-3" } }));
  await harness.fireLatestTimeout();
  assert.equal(runtime.membershipJoinRequests.length, 1, "retry cannot leapfrog the unresolved operation");
  await harness.resolveDeferred(pendingJoin);
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 1, "the original late join remains tracked and is compensated");
  assert.equal(runtime.rooms.length, 0, "timed-out candidates do not start later without a new request");
  await harness.commitRender(defaultHookOptions({ invite: { ...defaultHookOptions().invite, id: "invite-4" } }));
  await waitFor(harness, () => harness.getResult().channelState === "live", "fresh call retries after real settlement");
  assert.equal(runtime.membershipJoinRequests.length, 2);
});

test("generation cleanup: initial join timeout remains tracked and compensates its late success", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  const pendingJoin = deferred();
  runtime.queueMembershipJoin({ gate: pendingJoin });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  await harness.fireLatestTimeout();
  assert.equal(harness.getResult().channelState, "error");
  assert.equal(harness.getResult().loading, false);
  assert.ok(runtime.errors.some(entry => entry.message === "accepted_chat_call_membership_pending"));
  await harness.resolveDeferred(pendingJoin);
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.rooms.length, 0);
  assert.equal(runtime.providerTokenCalls, 0);
  assert.equal(harness.getResult().channelState, "error", "late result cannot start a timed-out call");
});

test("generation cleanup: full unmount and remount share the unresolved admission barrier", async (t) => {
  const oldRuntime = createLiveKitMountedRuntime();
  const pendingJoin = deferred();
  oldRuntime.queueMembershipJoin({ gate: pendingJoin });
  const oldHarness = await mountLiveKitHook(oldRuntime, defaultHookOptions(), { requireLive: false });
  await oldHarness.unmount();
  const runtime = createLiveKitMountedRuntime({
    membershipAdmissionCoordinator: oldRuntime.membershipAdmissionCoordinator,
    membershipGeneration: "20000000-0000-4000-8000-000000000002",
  });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }), { requireLive: false });
  t.after(() => harness.unmount());
  assert.equal(runtime.membershipJoinRequests.length, 0);
  await oldHarness.resolveDeferred(pendingJoin);
  await waitFor(harness, () => harness.getResult().channelState === "live", "new instance joins only after retired join cleanup");
  assert.equal(oldRuntime.membershipLeaves, 1);
  assert.equal(oldRuntime.rooms.length, 0);
  assert.equal(runtime.rooms.length, 1);
});

for (const replacement of ["room", "account"]) {
  test(`generation cleanup: ambiguous join blocks reuse but permits independent ${replacement}`, async (t) => {
    const runtime = createLiveKitMountedRuntime();
    runtime.queueMembershipJoin({ outcome: "reject", message: "account_bound_rpc_unavailable" });
    const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
    t.after(() => harness.unmount());
    assert.equal(harness.getResult().channelState, "error");
    await harness.commitRender(defaultHookOptions({ invite: { ...defaultHookOptions().invite, id: "invite-2" } }));
    await harness.fireLatestTimeout();
    assert.equal(runtime.membershipJoinRequests.length, 1, "unknown old mutation cannot be treated as absent");
    const replacementOptions = replacement === "room"
      ? { roomId: "ROOM-2", invite: { ...defaultHookOptions().invite, id: "invite-3", communicationRoomId: "ROOM-2" } }
      : { authenticatedUserId: "new-user", invite: { ...defaultHookOptions().invite, id: "invite-3", calleeUserId: "new-user" } };
    if (replacement === "room") runtime.roomId = "ROOM-2";
    else runtime.userId = "new-user";
    await harness.commitRender(defaultHookOptions(replacementOptions));
    await waitFor(harness, () => harness.getResult().channelState === "live", "independent exact authority remains usable");
    assert.equal(runtime.membershipJoinRequests.length, 2);
    assert.equal(runtime.rooms.length, 1);
  });
}

for (const outcome of ["gateway response", "invalid successful receipt"]) {
  test(`generation cleanup: actual ${outcome} retains the uncertain admission barrier`, async (t) => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const runRpc = async () => outcome === "gateway response"
      ? invokeAccountBoundSupabaseRpc({
        supabaseUrl: "https://fixture.supabase.co", anonKey: "public-test", accessToken: "fixture-token",
        functionName: "join_communication_room_session", fetchImpl: async () => ({
          ok: false, status: 502, json: async () => ({ message: "gateway failed" }),
        }),
      })
      : { data: { room_id: "ROOM-1", user_id: userId, membership_state: "active" }, error: null };
    const api = loadCommunicationApiSource({}, runRpc);
    const runtime = createLiveKitMountedRuntime({ userId });
    runtime.queueMembershipJoin({ api: api.joinCommunicationRoomSession });
    const opts = defaultHookOptions({
      authenticatedUserId: userId,
      invite: { ...defaultHookOptions().invite, calleeUserId: userId },
    });
    const harness = await mountLiveKitHook(runtime, opts, { requireLive: false });
    t.after(() => harness.unmount());
    assert.equal(harness.getResult().channelState, "error");
    await harness.commitRender({ ...opts, invite: { ...opts.invite, id: "invite-2" } });
    assert.equal(runtime.membershipJoinRequests.length, 1, "unconfirmed server outcome does not release same-row ownership");
    assert.equal(runtime.rooms.length, 0);
    await harness.fireLatestTimeout();
    assert.equal(runtime.membershipJoinRequests.length, 1, "deadline does not cancel unknown server operation");
    assert.equal(runtime.rooms.length, 0);
    assert.equal(harness.getResult().channelState, "error");
  });
}

test("generation cleanup: ambiguous leave retries exact generation before permitting replacement", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueMembershipLeave({ outcome: "reject", message: "account_bound_rpc_unavailable" });
  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.membershipLeaveRequests.length, 2);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration,
    runtime.membershipLeaveRequests[1].expectedMembershipGeneration);
  assert.equal(harness.getResult().channelState, "idle");
});

test("generation cleanup: repeated End reuses unresolved reservation and confirms the exact leave", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueMembershipLeave({ outcome: "reject", message: "account_bound_rpc_unavailable" });
  runtime.queueMembershipLeave({ outcome: "reject", message: "account_bound_rpc_unavailable" });
  const error = await runOperation(harness, () => harness.getResult().leaveRoom().then(() => null, failure => failure));
  assert.match(error.message, /Unable to prove/u);
  assert.equal(runtime.membershipLeaveRequests.length, 2);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true,
    "retry must not wait behind its own unresolved reservation");
  assert.equal(runtime.membershipLeaveRequests.length, 3);
  assert.equal(new Set(runtime.membershipLeaveRequests.map(entry => entry.expectedMembershipGeneration)).size, 1);
  assert.equal(harness.getResult().channelState, "idle");
});

test("generation cleanup: pending End remains reserved across full unmount and remount", async (t) => {
  const { harness: oldHarness, runtime: oldRuntime } = await mountCase(t);
  const pendingLeave = deferred();
  oldRuntime.queueMembershipLeave({ gate: pendingLeave });
  const cleanup = await oldHarness.startOperation(() => oldHarness.getResult().leaveRoom());
  await waitFor(oldHarness, () => oldRuntime.membershipLeaves === 1, "old End starts durable leave");
  await oldHarness.unmount();
  const runtime = createLiveKitMountedRuntime({
    membershipAdmissionCoordinator: oldRuntime.membershipAdmissionCoordinator,
    membershipGeneration: "20000000-0000-4000-8000-000000000002",
  });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }), { requireLive: false });
  t.after(() => harness.unmount());
  assert.equal(runtime.membershipJoinRequests.length, 0);
  await oldHarness.resolveDeferred(pendingLeave);
  assert.equal(await settleOperation(cleanup, oldHarness), true);
  await waitFor(harness, () => harness.getResult().channelState === "live", "new hook waits through old exact leave");
  assert.equal(runtime.membershipJoinRequests.length, 1);
  assert.equal(oldRuntime.membershipLeaves, 1);
});

for (const nativePhase of ["disconnect", "audio-stop"]) {
  test(`generation cleanup: full remount waits before old ${nativePhase} settles, not just after leave starts`, async (t) => {
    const { harness: oldHarness, runtime: oldRuntime } = await mountCase(t);
    const nativeGate = deferred();
    if (nativePhase === "disconnect") oldRuntime.queueDisconnect({ gate: nativeGate });
    else oldRuntime.queueAudioStop({ gate: nativeGate });
    await oldHarness.unmount();
    assert.equal(oldRuntime.membershipLeaves, 0, "old cleanup has not yet reached durable leave");
    const runtime = createLiveKitMountedRuntime({
      membershipAdmissionCoordinator: oldRuntime.membershipAdmissionCoordinator,
      membershipGeneration: "20000000-0000-4000-8000-000000000002",
    });
    const harness = await mountLiveKitHook(runtime, defaultHookOptions({
      invite: { ...defaultHookOptions().invite, id: "invite-remounted" },
    }), { requireLive: false });
    t.after(() => harness.unmount());
    assert.equal(runtime.membershipJoinRequests.length, 0,
      "synchronous retirement must reserve the row before asynchronous native cleanup");
    await oldHarness.resolveDeferred(nativeGate);
    await waitFor(harness, () => harness.getResult().channelState === "live", "replacement joins after native cleanup and exact old leave");
    assert.equal(oldRuntime.membershipLeaves, 1);
    assert.equal(runtime.membershipJoinRequests.length, 1);
  });
}

test("owned admission: late old leave cannot retire a resumed call in a fresh process", async (t) => {
  const { harness: oldHarness, runtime: oldRuntime } = await mountCase(t, { initialCamera: true, initialMic: true },
    defaultHookOptions({ initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video" } }));
  const oldGeneration = oldRuntime.membershipGeneration;
  const pendingLeave = deferred();
  oldRuntime.queueMembershipLeave({ gate: pendingLeave });
  const leaving = await oldHarness.startOperation(() => oldHarness.getResult().leaveRoom().then(() => null, error => error));
  await waitFor(oldHarness, () => oldRuntime.membershipLeaves === 1, "old process dispatched leave");
  await oldHarness.unmount();
  const runtime = createLiveKitMountedRuntime({ durableMembershipStore: oldRuntime.durableMembershipStore,
    initialCamera: true, initialMic: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  const replacementGeneration = runtime.membershipGeneration;
  assert.notEqual(replacementGeneration, oldGeneration, "new process claims a new owner even while old row remains ACTIVE");
  assert.notEqual(runtime.membershipAdmissionCoordinator, oldRuntime.membershipAdmissionCoordinator);
  await oldHarness.resolveDeferred(pendingLeave);
  assert.match((await settleOperation(leaving, oldHarness)).message, /Unable to prove/u);
  assert.equal(runtime.membershipGeneration, replacementGeneration);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().channelState, "live");
});

test("owned admission: late old media write cannot replace a restarted owner's media state", async (t) => {
  const { harness: oldHarness, runtime: oldRuntime } = await mountCase(t, { initialCamera: true, initialMic: true },
    defaultHookOptions({ initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
      invite: { ...defaultHookOptions().invite, callType: "video" } }));
  const oldGeneration = oldRuntime.membershipGeneration;
  const pendingWrite = deferred();
  oldRuntime.queueTouch({ gate: pendingWrite });
  const before = oldRuntime.membershipTouches.length;
  const muting = await oldHarness.startOperation(() => oldHarness.getResult().setMicrophoneEnabled(false));
  await waitFor(oldHarness, () => oldRuntime.membershipTouches.length > before, "old media request dispatched");
  assert.equal(oldRuntime.membershipTouches.at(-1).expectedMembershipGeneration, oldGeneration);
  await oldHarness.unmount();
  const runtime = createLiveKitMountedRuntime({ durableMembershipStore: oldRuntime.durableMembershipStore,
    initialCamera: true, initialMic: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  t.after(() => harness.unmount());
  assert.notEqual(runtime.membershipGeneration, oldGeneration);
  await oldHarness.resolveDeferred(pendingWrite);
  assert.equal(await settleOperation(muting, oldHarness), false);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
  assert.equal(harness.getResult().channelState, "live");
});

test("owned admission: stale join CAS cannot reclaim membership after another process resumes", async (t) => {
  const oldRuntime = createLiveKitMountedRuntime();
  const beforeCommit = deferred();
  oldRuntime.queueMembershipJoin({ beforeCommitGate: beforeCommit });
  const oldHarness = await mountLiveKitHook(oldRuntime, defaultHookOptions(), { requireLive: false });
  await oldHarness.unmount();
  const runtime = createLiveKitMountedRuntime({ durableMembershipStore: oldRuntime.durableMembershipStore });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions());
  t.after(() => harness.unmount());
  const currentGeneration = runtime.membershipGeneration;
  await oldHarness.resolveDeferred(beforeCommit);
  await oldHarness.flush(48);
  assert.equal(oldRuntime.rooms.length, 0);
  assert.equal(oldRuntime.membershipLeaves, 0, "failed old CAS never acquired an owner to clean up");
  assert.equal(runtime.membershipGeneration, currentGeneration);
  assert.equal(harness.getResult().channelState, "live");
});

test("owned admission: newer generation during initialization prevents native media acquisition", async (t) => {
  const runtime = createLiveKitMountedRuntime({ initialCamera: true, initialMic: true });
  const pendingSnapshot = runtime.deferSnapshot();
  const harness = await mountLiveKitHook(runtime, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }), { requireLive: false });
  t.after(() => harness.unmount());
  const oldGeneration = runtime.membershipGeneration;
  runtime.membershipGeneration = "30000000-0000-4000-8000-000000000003";
  await harness.resolveDeferred(pendingSnapshot);
  await harness.flush(48);
  assert.equal(runtime.rooms.length, 0);
  assert.equal(runtime.providerTokenCalls, 0);
  assert.equal(harness.getResult().channelState, "error");
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, oldGeneration);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.durableMic, true);
});

test("owned admission: a same-attempt retry preserves its original CAS and owner identity", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  runtime.queueMembershipJoin({ outcome: "null" });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  const initialGeneration = runtime.membershipGeneration;
  await harness.fireLatestTimeout();
  await waitFor(harness, () => harness.getResult().channelState === "live", "same admitted attempt returns on retry");
  assert.equal(runtime.membershipPrepareRequests.length, 1);
  assert.equal(runtime.membershipJoinRequests.length, 2);
  assert.equal(runtime.membershipJoinRequests[0].admission, runtime.membershipJoinRequests[1].admission);
  assert.equal(runtime.membershipGeneration, initialGeneration, "retry doesn't acquire yet another generation");
});

test("owned admission: preparation resolving after unmount cannot dispatch a join", async () => {
  const runtime = createLiveKitMountedRuntime();
  const pendingPrepare = deferred();
  runtime.queueMembershipPrepare({ gate: pendingPrepare });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  await harness.unmount();
  await harness.resolveDeferred(pendingPrepare);
  assert.equal(runtime.membershipPrepareRequests.length, 1);
  assert.equal(runtime.membershipJoinRequests.length, 0);
  assert.equal(runtime.rooms.length, 0);
});

test("generation cleanup: a join without cleanup identity never starts native media", async (t) => {
  const runtime = createLiveKitMountedRuntime({ membershipGeneration: null });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  assert.equal(runtime.providerTokenCalls, 0);
  assert.equal(runtime.rooms.length, 0);
  assert.equal(runtime.membershipLeaves, 0);
  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /Unable to connect/u);
  assert.ok(runtime.errors.some(entry => entry.message === "accepted_chat_call_membership_generation_missing"));
});

test("generation cleanup: token initialization failure leaves the joined generation and retains its error", async (t) => {
  const runtime = createLiveKitMountedRuntime({ rejectProviderToken: true });
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false });
  t.after(() => harness.unmount());
  await harness.flush(48);
  assert.equal(runtime.rooms.length, 0);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, runtime.membershipGeneration);
  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /Unable to connect/u);
});

for (const returnedGeneration of ["", "20000000-0000-4000-8000-000000000002"]) {
  test(`generation cleanup: ${returnedGeneration ? "wrong" : "missing"} response generation cannot certify End`, async (t) => {
    const { harness, runtime } = await mountCase(t);
    runtime.queueMembershipLeave({ returnedGeneration });
    const error = await runOperation(harness, () => harness.getResult().leaveRoom().then(() => null, failure => failure));
    assert.match(error.message, /Unable to prove/u);
    assert.equal(runtime.stages.includes("cleanup_complete"), false);
    assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, runtime.membershipGeneration);
    assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true, "exact retry remains usable");
  });
}

test("generation cleanup: refreshing a newer durable row cannot donate its generation to an old call", async (t) => {
  const { harness, runtime } = await mountCase(t, { initialMic: true }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  }));
  runtime.membershipGeneration = "20000000-0000-4000-8000-000000000002";
  await harness.fireHeartbeat();
  await harness.flush(48);
  assert.equal(runtime.membershipLeaveRequests.length, 0, "observing a new owner stops local resources without touching its membership");
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(harness.getResult().channelState, "error");
  assert.match(harness.getResult().error, /continued in another session/u);
  assert.equal(runtime.durableMic, true, "old generation cannot retire the newer durable admission");
});

test("generation cleanup: an old pending leave cannot retire a same-room replacement generation", async (t) => {
  const { harness, runtime } = await mountCase(t, { initialMic: true }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
  }));
  const oldGeneration = runtime.membershipGeneration;
  const pendingLeave = deferred();
  runtime.queueMembershipLeave({ gate: pendingLeave });
  const cleanup = await harness.startOperation(() => harness.getResult().leaveRoom().then(() => null, failure => failure));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "old leave begins");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(cleanup, harness)).message, /Unable to prove/u);
  runtime.membershipGeneration = "20000000-0000-4000-8000-000000000002";
  await harness.commitRender(defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  assert.equal(runtime.rooms.length, 1, "replacement waits for old leave settlement");
  await harness.resolveDeferred(pendingLeave);
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement joins a new durable generation");
  await harness.flush(48);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, oldGeneration);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.durableMic, true);
  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.membershipLeaveRequests.at(-1).expectedMembershipGeneration, runtime.membershipGeneration);
});

test("generation cleanup: an exact already-removed terminal membership satisfies cleanup", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueMembershipLeave({ membershipState: "removed" });
  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.membershipLeaveRequests[0].expectedMembershipGeneration, runtime.membershipGeneration);
  assert.equal(harness.getResult().channelState, "idle");
});

test("remote End uses the same proved cleanup postconditions", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));

  await harness.fireStopper("remote_end");
  await waitFor(harness, () => harness.getResult().channelState === "idle", "remote End cleanup completed");

  const room = runtime.rooms.at(-1);
  assert.equal(room.state, "disconnected");
  assert.equal(room.localParticipant.cameraEnabled, false);
  assert.equal(room.localParticipant.micEnabled, false);
  assert.equal(runtime.audioStopCalls, 1);
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.stages.filter((stage) => stage === "cleanup_complete").length, 1);
});

test("audio cleanup failure remains retryable and cannot emit cleanup_complete early", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueAudioStop({ outcome: "reject" });
  const firstCleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  const firstError = await settleOperation(firstCleanup, harness);

  assert.match(firstError.message, /Unable to prove/u);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
  assert.equal(harness.getResult().channelState, "error");

  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.audioStopCalls, 2);
  assert.equal(runtime.stages.filter((stage) => stage === "cleanup_complete").length, 1);
  assert.equal(harness.getResult().channelState, "idle");
});

test("durable membership cleanup failure is distinct from proved local media shutdown", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueMembershipLeave({ outcome: "reject" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  const cleanupError = await settleOperation(cleanup, harness);

  assert.match(cleanupError.message, /Unable to prove/u);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, false);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, false);
  assert.match(harness.getResult().error, /membership/u);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
});

test("a never-settling durable membership leave is bounded after local shutdown", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const stalledMembershipLeave = deferred();
  runtime.queueMembershipLeave({ gate: stalledMembershipLeave, outcome: "success" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.membershipLeaves === 1, "durable leave started");

  await harness.fireLatestTimeout();
  const cleanupError = await settleOperation(cleanup, harness);

  assert.match(cleanupError.message, /Unable to prove/u);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, false);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, false);
  assert.match(harness.getResult().error, /membership/u);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);

  stalledMembershipLeave.resolve();
  await harness.flush();
});

test("a stalled media-disable promise cannot prevent transport and durable cleanup", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const stalledCameraDisable = runtime.deferCamera();

  assert.equal(await runOperation(harness, () => harness.getResult().leaveRoom()), true);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.membershipLeaves, 1);
  assert.equal(runtime.stages.includes("cleanup_complete"), true);

  stalledCameraDisable.resolve();
  await harness.flush();
  assert.equal(harness.getResult().channelState, "idle");
});

test("cleanup waiting on an old Room disconnect never stops replacement-call audio", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const oldDisconnect = deferred();
  runtime.queueDisconnect({ gate: oldDisconnect, outcome: "success" });
  await harness.fireStopper("manual");
  const audioStopsBeforeReplacement = runtime.audioStopCalls;

  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement room initialized");
  oldDisconnect.resolve();
  await harness.flush(48);

  assert.equal(runtime.audioStopCalls, audioStopsBeforeReplacement);
  assert.equal(harness.getResult().channelState, "live");
  assert.equal(runtime.rooms.at(-1).state, "connected");
});

test("a timed-out old Android audio stop blocks replacement acquisition until exact cleanup completes", async (t) => {
  const { harness, runtime } = await mountCase(t, { useActualAudioRouting: true });
  const delayedAudioStop = runtime.deferAudioStop();
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.audioStopCalls === 1, "old audio stop started");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(cleanup, harness)).message, /Unable to prove/u);

  runtime.roomId = "ROOM-2";
  const startsBeforeReplacement = runtime.audioStartCalls;
  assert.equal(startsBeforeReplacement, 1, "the old call acquired one native audio session");
  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement room prepared");
  assert.notEqual(harness.getResult().channelState, "live");
  assert.equal(runtime.audioStartCalls, startsBeforeReplacement, "unproved old cleanup cannot be bypassed by a new audio owner");

  await harness.resolveDeferred(delayedAudioStop);
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement admitted after exact audio cleanup");
  assert.equal(runtime.nativeAudioSessionActive, true);
  assert.equal(runtime.audioStartCalls, startsBeforeReplacement + 1, "replacement starts only after old release");
  assert.equal(runtime.nativeAudioOutput, "earpiece");
  assert.equal(harness.getResult().channelState, "live");
});

test("a timed-out old iOS audio reset reconfigures only the current replacement session", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    platformOS: "ios",
    useActualAudioRouting: true,
  });
  const delayedAudioReset = runtime.deferAudioReset();
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.audioResetCalls === 1, "old iOS audio reset started");
  await harness.fireLatestTimeout();
  assert.match((await settleOperation(cleanup, harness)).message, /Unable to prove/u);

  runtime.roomId = "ROOM-2";
  await harness.commitRender(replacementOptions());
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement iOS call live");
  assert.equal(runtime.iosAudioConfigurationActive, true);

  await harness.resolveDeferred(delayedAudioReset);
  await waitFor(
    harness,
    () => runtime.iosAudioConfigurationActive && runtime.nativeAudioSessionActive,
    "replacement iOS audio configuration restored",
  );
  assert.equal(runtime.nativeAudioOutput, "earpiece");
  assert.equal(harness.getResult().channelState, "live");
});

test("resolved-but-ineffective disconnect remains a transport cleanup failure", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    initialMic: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "mismatch" });
  runtime.queueNative({ outcome: "mismatch" });
  runtime.queueDisconnect({ outcome: "mismatch" });
  runtime.queueDisconnect({ outcome: "mismatch" });
  const cleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  const cleanupError = await settleOperation(cleanup, harness);

  assert.match(cleanupError.message, /Unable to prove/u);
  assert.equal(runtime.rooms.at(-1).state, "connected");
  assert.equal(runtime.rooms.at(-1).localParticipant.cameraEnabled, false);
  assert.equal(runtime.rooms.at(-1).localParticipant.micEnabled, false);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
  assert.equal(runtime.errors.some((entry) => entry.scope === "chat-call-livekit-cleanup-transport-postcondition"), true);
});

test("never-settling disconnect is bounded and repeated End does not start duplicate cleanup", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const stalledDisconnect = deferred();
  runtime.queueDisconnect({ gate: stalledDisconnect, outcome: "success" });
  const firstCleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  await waitFor(harness, () => runtime.roomDisconnects === 1, "transport shutdown started");
  const repeatedCleanup = await harness.startOperation(() => (
    harness.getResult().leaveRoom().then(() => null, (cleanupError) => cleanupError)
  ));
  const repeatedError = await settleOperation(repeatedCleanup, harness);
  assert.match(repeatedError.message, /Unable to prove/u);
  assert.equal(runtime.roomDisconnects, 1);

  await harness.fireLatestTimeout();
  const firstError = await settleOperation(firstCleanup, harness);
  assert.match(firstError.message, /Unable to prove/u);
  assert.equal(runtime.stages.includes("cleanup_complete"), false);
  assert.equal(runtime.membershipLeaves, 1);

  stalledDisconnect.resolve();
  await harness.flush();
});

test("membership subscription refuses a session token owned by another account", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialRemoteParticipant: true,
    realtimeSessionUserId: "different-user",
  }, defaultHookOptions({
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));

  assert.equal(runtime.realtimeChannels.length, 0);
  assert.equal(runtime.realtimeAuthTokens.length, 0);
  assert.equal(
    runtime.errors.some((entry) => entry.scope === "chat-call-livekit-membership-subscription-auth"),
    true,
  );
  await harness.fireHeartbeat();
  assert.equal(harness.getResult().channelState, "live");
});

test("camera disable disconnects when the stopped publication cannot be retired", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    nativeApplicationActive: true,
    retainMutedCameraPublication: true,
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  // LiveKit removes the publication from its local maps before awaiting the
  // final negotiation, so a late rejection must not be mistaken for proof
  // that the remote side observed the retirement.
  runtime.queueCameraUnpublish({ outcome: "reject-after-removal" });

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), false);
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.rooms.at(-1).localParticipant.getTrackPublication("camera"), undefined);
  assert.equal(runtime.errors.some((entry) => entry.scope === "chat-call-livekit-camera-disable"), true);
});

test("camera enable disconnects when a failed membership write cannot retire capture", async (t) => {
  const { harness, runtime } = await mountCase(t, { nativeApplicationActive: true, platformOS: "ios" }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "success" });
  runtime.queueCameraUnpublish({ outcome: "reject" });
  runtime.queueTouch({ outcome: "null" });

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.roomDisconnects, 1);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.errors.some((entry) => entry.scope === "chat-call-livekit-camera-compensation"), true);
});

test("camera compensation terminalizes when unpublish resolves without retiring capture", async (t) => {
  const { harness, runtime } = await mountCase(t, { nativeApplicationActive: true, platformOS: "ios" }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "success" });
  runtime.queueCameraUnpublish({ outcome: "mismatch" });
  runtime.queueTouch({ outcome: "null" });
  runtime.queueDisconnect({ outcome: "reject" });

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), false);
  assert.equal(runtime.rooms.at(-1).localParticipant.getTrackPublication("camera"), undefined);
  assert.equal(runtime.roomDisconnects, 2);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.errors.some((entry) => (
    entry.scope === "chat-call-livekit-camera-compensation"
    || entry.scope === "chat-call-livekit-camera-compensation-terminal"
  )), true);
});

test("background reconciliation terminalizes a resolved-but-ineffective camera shutdown", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    nativeApplicationActive: true,
    platformOS: "ios",
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "mismatch" });

  runtime.nativeApplicationActive = false;
  await harness.fireAppState("background");
  await waitFor(harness, () => runtime.rooms.at(-1).state === "disconnected", "camera safety disconnect");
  assert.equal(runtime.rooms.at(-1).localParticipant.getTrackPublication("camera"), undefined);
  assert.equal(runtime.roomDisconnects, 1);
  assert.match(harness.getResult().mediaReconciliationMessage, /disconnected/u);
});

test("camera membership rollback terminalizes unless native and durable state both restore", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    nativeApplicationActive: true,
    platformOS: "ios",
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueSnapshot({ outcome: "active" });
  runtime.queueSnapshot({ outcome: "null" });
  runtime.queueSnapshot({ outcome: "null" });
  runtime.queueTouch({ outcome: "null" });
  runtime.queueTouch({ outcome: "null" });

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), false);
  assert.equal(runtime.rooms.at(-1).localParticipant.getTrackPublication("camera"), undefined);
  assert.equal(runtime.roomDisconnects, 1);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.match(harness.getResult().mediaReconciliationMessage, /disconnected/u);
});

test("camera rollback cannot re-enable capture after the app backgrounds", async (t) => {
  const { harness, runtime } = await mountCase(t, {
    initialCamera: true,
    nativeApplicationActive: true,
    platformOS: "ios",
  }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  const touch = runtime.deferTouch("null");
  const cameraLifecycleBaseline = runtime.cameraLifecycleEvents.length;
  const operation = await harness.startOperation(() => harness.getResult().setCameraEnabled(false));
  await waitFor(
    harness,
    () => runtime.cameraLifecycleEvents.length > cameraLifecycleBaseline,
    "camera retirement reached native boundary",
  );

  runtime.nativeApplicationActive = false;
  await harness.fireAppState("background");
  touch.resolve();
  assert.equal(await settleOperation(operation, harness), false);

  const transitionEvents = runtime.cameraLifecycleEvents.slice(cameraLifecycleBaseline);
  assert.match(transitionEvents[0], /^unpublish-camera:/u);
  assert.equal(transitionEvents.includes("set-camera:true"), false);
  assert.equal(runtime.roomDisconnects, 1);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
});

test("background revokes the exact native foreground witness and the same serial cannot restart camera", async (t) => {
  const runtime = createLiveKitMountedRuntime({ nativeApplicationActive: true, platformOS: "ios" });
  runtime.appState = "inactive";
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    nativeForegroundActivationInviteId: "invite-1",
    nativeForegroundActivationSerial: 1,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions);
  t.after(() => harness.unmount());
  assert.equal(harness.getResult().cameraEnabled, true);

  await harness.fireAppState("background");
  await waitFor(harness, () => !harness.getResult().cameraEnabled, "background camera shutdown");
  const enabledCalls = runtime.cameraCalls.filter(Boolean).length;

  await harness.commitRender(hookOptions);
  await harness.fireHeartbeat();
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.cameraCalls.filter(Boolean).length, enabledCalls);
});

test("cold-start video post-commit retry observes a missed foreground transition before heartbeat", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  runtime.appState = "background";
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await harness.fireMediaWriteTimeout();
  }
  await waitFor(harness, () => harness.getResult().channelState === "live", "background call authority committed");
  assert.equal(runtime.cameraCalls.some((enabled) => enabled), false);

  await harness.fireMediaWriteTimeout();
  assert.equal(runtime.cameraCalls.some((enabled) => enabled), false);

  // The native answer foregrounded React Native before the AppState listener
  // existed. The next bounded post-commit retry must consult the canonical
  // current state instead of waiting for the 15-second room heartbeat.
  runtime.appState = "active";
  await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => runtime.cameraCalls.filter(Boolean).length === 1, "post-commit retry reached native camera boundary");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "post-commit retry converged camera state");
  assert.equal(runtime.durableCamera, true);

  const cameraCallCount = runtime.cameraCalls.length;
  await harness.fireHeartbeat();
  assert.equal(runtime.cameraCalls.length, cameraCallCount);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("terminated iOS video keeps exact camera intent through a delayed UIKit activation window", async (t) => {
  const runtime = createLiveKitMountedRuntime({
    nativeApplicationActive: false,
    platformOS: "ios",
  });
  runtime.appState = "background";
  const descriptor = runtime.createAcceptedMediaDescriptor();
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
    iosAcceptedCallKitMediaDescriptor: descriptor,
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await harness.fireMediaWriteTimeout();
  }
  await waitFor(harness, () => harness.getResult().channelState === "live", "accepted call authority committed");
  assert.equal(runtime.cameraCalls.some(Boolean), false);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await harness.fireMediaWriteTimeout();
    assert.equal(runtime.cameraCalls.some(Boolean), false);
    assert.equal(harness.getResult().cameraEnabled, false);
  }

  // Physical terminated-accept evidence showed UIKit can remain non-active
  // beyond the historical 5.5-second post-commit window. Preserve the exact
  // accepted-call authority and retry once more before the room heartbeat.
  runtime.nativeApplicationActive = true;
  await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => runtime.cameraCalls.filter(Boolean).length === 1, "delayed UIKit activation reached native camera boundary");
  await waitFor(harness, () => harness.getResult().cameraEnabled, "delayed UIKit activation converged camera state");
  assert.equal(runtime.durableCamera, true);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("post-commit camera recovery stops after confirmed permission denial", async (t) => {
  const runtime = createLiveKitMountedRuntime();
  for (let attempt = 0; attempt < 4; attempt += 1) runtime.queueCamera({ outcome: "reject" });
  runtime.queueCamera({ outcome: "permission-denied" });
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: true, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const harness = await mountLiveKitHook(runtime, hookOptions, { requireLive: false });
  t.after(() => harness.unmount());

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitFor(harness, () => runtime.cameraCalls.length === attempt, `initial denied-path attempt ${attempt} reached native boundary`);
    await harness.fireMediaWriteTimeout();
  }
  await waitFor(harness, () => harness.getResult().channelState === "live", "denied-path call authority committed");
  await harness.fireMediaWriteTimeout();
  await waitFor(harness, () => runtime.cameraCalls.length === 5, "post-commit denial reached native boundary");
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(harness.getResult().cameraPermissionState, "denied");
  assert.equal(harness.getResult().canOpenMediaSettings, true);
  await harness.flush();
  assert.equal(runtime.cameraCalls.length, 5);
  assert.equal(runtime.providerTokenCalls, 1);
  assert.equal(runtime.rooms.length, 1);
});

test("permission support: successful disable cannot erase a confirmed microphone denial", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueNative({ outcome: "permission-denied" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(false)), true);
  assert.equal(harness.getResult().microphonePermissionState, "denied");
  assert.match(harness.getResult().mediaPermissionMessage, /Microphone access is off/u);
  assert.equal(harness.getResult().canOpenMediaSettings, true);
});

test("permission support: successful disable cannot erase a confirmed camera denial", async (t) => {
  const hookOptions = defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  });
  const { harness, runtime } = await mountCase(t, { initialMic: true }, hookOptions);
  runtime.queueCamera({ outcome: "permission-denied" });
  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), false);
  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(false)), true);
  assert.equal(harness.getResult().cameraPermissionState, "denied");
  assert.match(harness.getResult().mediaPermissionMessage, /Camera access is off/u);
  assert.equal(harness.getResult().canOpenMediaSettings, true);
});

test("permission support: successful enabling proof clears the matching denial message and Settings CTA", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueNative({ outcome: "permission-denied" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), true);
  assert.equal(harness.getResult().microphonePermissionState, "granted");
  assert.equal(harness.getResult().mediaPermissionMessage, null);
  assert.equal(harness.getResult().canOpenMediaSettings, false);
});

test("matrix 25: membership network rejection is not native permission denial", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueTouch({ outcome: "reject" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.notEqual(harness.getResult().microphonePermissionState, "denied");
  assert.equal(harness.getResult().canOpenMediaSettings, false);
  assert.equal(harness.getResult().mediaReconciliationState, "warning");
});

test("matrix 26: inconsistent durable readback is not native permission denial", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueTouch({ outcome: "inconsistent" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.notEqual(harness.getResult().microphonePermissionState, "denied");
  assert.equal(harness.getResult().canOpenMediaSettings, false);
});

test("matrix 27: Settings opens only after a confirmed native denial", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueTouch({ outcome: "null" });
  await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true));
  await harness.getResult().openMediaSettings();
  assert.equal(runtime.settingsCalls, 0);
  runtime.queueNative({ outcome: "permission-denied" });
  await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true));
  await harness.getResult().openMediaSettings();
  assert.equal(runtime.settingsCalls, 1);
});

test("matrix 28: successful reconciliation clears a prior operational warning", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueTouch({ outcome: "null" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(harness.getResult().mediaReconciliationState, "warning");
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), true);
  assert.equal(harness.getResult().mediaReconciliationState, "clear");
  assert.equal(harness.getResult().mediaReconciliationMessage, null);
});

test("permission support: unprovable compensation remains a bounded reconciliation blocker", async (t) => {
  const { harness, runtime } = await mountCase(t);
  runtime.queueNative({ outcome: "success" });
  runtime.queueNative({ outcome: "mismatch" });
  runtime.queueTouch({ outcome: "null" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  assert.equal(harness.getResult().mediaReconciliationState, "warning");
  assert.notEqual(harness.getResult().microphonePermissionState, "denied");
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
});

const successInvariants = [
  [29, "call remains active", ({ harness }) => assert.equal(harness.getResult().channelState, "live")],
  [30, "camera remains unchanged", ({ harness }) => assert.equal(harness.getResult().cameraEnabled, false)],
  [31, "speaker remains unchanged", ({ harness }) => assert.equal(harness.getResult().speakerEnabled, false)],
  [32, "exactly one usable microphone publication remains", ({ runtime }) => {
    const publication = runtime.rooms.at(-1).localParticipant.getTrackPublication("microphone");
    assert.equal(!!publication?.track && !publication.isMuted, true);
  }],
  [33, "no token is reissued", ({ runtime }) => assert.equal(runtime.providerTokenCalls, 1)],
  [34, "no provider crossover occurs", ({ runtime }) => assert.equal(runtime.membershipTouches.every((entry) => entry.roomId === runtime.roomId), true)],
  [35, "no room cleanup occurs", ({ runtime }) => assert.equal(runtime.roomDisconnects ?? 0, 0)],
  [36, "no terminal membership is written", ({ runtime }) => assert.equal(runtime.membershipTouches.every((entry) => entry.membershipState !== "terminal"), true)],
  [37, "no native fatal state is surfaced", ({ harness }) => assert.equal(harness.getResult().error, null)],
];

for (const [number, label, assertion] of successInvariants) {
  test(`matrix ${number}: ${label}`, async (t) => {
    const mounted = await mountCase(t);
    assert.equal(
      await runOperation(mounted.harness, () => mounted.harness.getResult().setMicrophoneEnabled(true)),
      true,
    );
    assertion(mounted);
  });
}

test("matrix 38: a rejected durable write produces no unhandled rejection", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const unhandled = [];
  const listener = (error) => unhandled.push(error);
  process.on("unhandledRejection", listener);
  t.after(() => process.off("unhandledRejection", listener));
  runtime.queueTouch({ outcome: "reject" });
  assert.equal(await runOperation(harness, () => harness.getResult().setMicrophoneEnabled(true)), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
});

test("mounted evidence: T2 is clear only when the contract names mounted exact-hook execution", () => {
  const contract = JSON.parse(fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8"));
  assert.equal(contract.proofTiers.T2_MODEL, "MODEL_CLEAR_MOUNTED_HOOK_EXECUTION");
  assert.equal(contract.mountedHookEvidence.execution, "REACT_DOM_COMMIT_PHASE_EXACT_HOOK");
  assert.equal(contract.mountedHookEvidence.testFile, "tests/assurance/livekit-chat-call-mic-mounted-hook.test.mjs");
});
