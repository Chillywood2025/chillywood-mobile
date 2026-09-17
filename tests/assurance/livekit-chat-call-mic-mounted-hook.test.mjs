#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createLiveKitMountedRuntime,
  defaultHookOptions,
  mountLiveKitHook,
  settleOperation,
} from "./helpers/livekit-mounted-hook-harness.mjs";

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
  assert.equal(runtime.micCalls.length, nativeCallCount);
  heartbeatGate.resolve();
  await waitFor(harness, () => runtime.micCalls.at(-1) === false, "background native reconciliation ran");
  await waitFor(harness, () => runtime.durableMic === false, "background durable reconciliation ran");
  assert.equal(harness.getResult().micEnabled, false);
  assert.equal(harness.getResult().channelState, "reconnecting");
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
  assert.equal(runtime.membershipLeaves, 0);
  await harness.commitRender(defaultHookOptions({
    invite: { ...defaultHookOptions().invite, id: "invite-2" },
  }));
  await waitFor(harness, () => runtime.rooms.length === 2, "replacement LiveKit Room created");
  await waitFor(harness, () => harness.getResult().channelState === "live", "replacement reached live");
  oldCameraCleanup.resolve();
  oldMicrophoneCleanup.resolve();
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 0);
  assert.equal(harness.getResult().channelState, "live");
});

test("cleanup support: pre-initialization unmount is bounded and produces no rejected cleanup", async () => {
  const runtime = createLiveKitMountedRuntime();
  const pendingSnapshot = runtime.deferSnapshot();
  const harness = await mountLiveKitHook(runtime, defaultHookOptions(), { requireLive: false, turns: 4 });
  await harness.unmount();
  pendingSnapshot.resolve();
  await harness.flush(48);
  assert.equal(runtime.membershipLeaves, 0);
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

test("camera enable disconnects when a failed membership write cannot disable capture", async (t) => {
  const { harness, runtime } = await mountCase(t, { nativeApplicationActive: true, platformOS: "ios" }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "success" });
  runtime.queueCamera({ outcome: "reject" });
  runtime.queueTouch({ outcome: "null" });

  assert.equal(await runOperation(harness, () => harness.getResult().setCameraEnabled(true)), false);
  assert.equal(runtime.durableCamera, false);
  assert.equal(harness.getResult().cameraEnabled, false);
  assert.equal(runtime.roomDisconnects, 1);
  assert.equal(runtime.rooms.at(-1).state, "disconnected");
  assert.equal(runtime.errors.some((entry) => entry.scope === "chat-call-livekit-camera-compensation"), true);
});

test("camera compensation terminalizes when disable resolves without stopping capture", async (t) => {
  const { harness, runtime } = await mountCase(t, { nativeApplicationActive: true, platformOS: "ios" }, defaultHookOptions({
    initialMediaPreferences: { cameraEnabled: false, micEnabled: true },
    invite: { ...defaultHookOptions().invite, callType: "video" },
  }));
  runtime.queueCamera({ outcome: "success" });
  runtime.queueCamera({ outcome: "mismatch" });
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
  const cameraCallBaseline = runtime.cameraCalls.length;
  const operation = await harness.startOperation(() => harness.getResult().setCameraEnabled(false));
  await waitFor(harness, () => runtime.cameraCalls.length > cameraCallBaseline, "camera disable reached native boundary");

  runtime.nativeApplicationActive = false;
  await harness.fireAppState("background");
  touch.resolve();
  assert.equal(await settleOperation(operation, harness), false);

  const transitionCalls = runtime.cameraCalls.slice(cameraCallBaseline);
  assert.equal(transitionCalls[0], false);
  assert.equal(transitionCalls.includes(true), false);
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
