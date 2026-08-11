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
  await harness.fireMediaWriteTimeout();
  assert.equal(await settleOperation(toggle, harness), false);
  assert.equal(harness.getResult().mediaControlsBusy, false);
  assert.equal(runtime.micCalls.length, nativeBaseline);
  assert.equal(runtime.durableMic, false);
});

test("heartbeat support: a timed-out waiter cannot permanently block a converged strict owner", async (t) => {
  const { harness, runtime } = await mountCase(t);
  const nativeGate = runtime.deferNative();
  const firstToggle = await harness.startOperation(() => harness.getResult().setMicrophoneEnabled(true));
  await waitFor(harness, () => runtime.micCalls.at(-1) === true, "strict enable reached native boundary");
  await harness.fireHeartbeat();
  await harness.fireMediaWriteTimeout();
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
  await harness.fireMediaWriteTimeout();
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
