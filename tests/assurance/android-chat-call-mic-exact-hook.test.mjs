#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = "hooks/use-livekit-chat-call-session.ts";
const source = fs.readFileSync(sourcePath, "utf8");
const contract = JSON.parse(fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8"));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const between = (start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `exact product slice missing: ${start}`);
  return source.slice(first, last);
};

const mediaControlBindingSlice = between("  const runMediaControl", "  const updateMembershipMediaState");
const mediaControlSlice = between("  const runMediaControl", "  const setSpeaker");
const microphoneSlice = between("  const setMicrophoneEnabled", "  const setCameraEnabled");

const executeExactProductPath = async () => {
  const wrapper = `
const useCallback = (operation) => operation;
const mediaControlRef = {current: null};
const identityRef = {current: {userId: "local-user", displayName: "Local", avatarUrl: null}};
const productRoomRef = {current: {roomId: "room-1"}};
const membershipsRef = {current: [{userId: "local-user", micOn: false}]};
const roomRef = {current: {state: "connected", localParticipant: {setMicrophoneEnabled: async (value) => {state.nativeCalls += 1; state.trackEnabled = value; return {track: {kind: "audio"}};}}}};
const micRequestedRef = {current: false};
const cameraRequestedRef = {current: false};
const ConnectionState = {Connected: "connected"};
const state = {nativeCalls: 0, membershipAttempts: 0, trackEnabled: false, uiMic: false, busy: false};
const setMediaControlsBusy = (value) => {state.busy = value;};
const touchCommunicationRoomSession = async () => {state.membershipAttempts += 1; return null;};
const LiveKitAudioSession = {startAudioSession: async () => true};
const setMicEnabledState = (value) => {state.uiMic = value;};
const setMediaPermissionMessage = () => {};
const refreshParticipantViews = () => {};
const emitStage = () => {};
const updateFirstMediaState = () => {};
${mediaControlSlice}
${microphoneSlice}
module.exports = {setMicrophoneEnabled, micRequestedRef, membershipsRef, state};
`;
  const compiled = ts.transpileModule(wrapper, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const sandbox = {module: {exports: {}}, exports: {}, Promise};
  vm.runInNewContext(compiled, sandbox, {filename: sourcePath});
  const controls = sandbox.module.exports;
  const result = await controls.setMicrophoneEnabled(true);
  return {
    result,
    nativeCalls: controls.state.nativeCalls,
    membershipAttempts: controls.state.membershipAttempts,
    trackEnabled: controls.state.trackEnabled,
    requestedMic: controls.micRequestedRef.current,
    uiMic: controls.state.uiMic,
    membershipMic: controls.membershipsRef.current[0].micOn,
  };
};

test("ANDROID_MIC_LIVEKIT_MEMBERSHIP_FAILURE_RETURNS_SUCCESS exact hook execution", async () => {
  assert.equal(hash(source), contract.sourceBindings[sourcePath], "full product hook source binding");
  assert.equal(hash(mediaControlBindingSlice), contract.sourceSlices["livekit-run-media-control"].sha256, "media serializer slice binding");
  assert.equal(hash(microphoneSlice), contract.sourceSlices["livekit-set-microphone"].sha256, "microphone hook slice binding");

  const observed = await executeExactProductPath();
  assert.equal(observed.nativeCalls, 1, "real hook invoked the LiveKit native microphone operation");
  assert.equal(observed.membershipAttempts, 1, "real hook attempted durable membership reconciliation");
  assert.equal(observed.trackEnabled, true, "native track became enabled");
  assert.equal(observed.requestedMic, true, "requested mic state became enabled");
  assert.equal(observed.uiMic, true, "UI mic state became enabled");
  assert.equal(observed.membershipMic, false, "durable membership remained unchanged after the rejected operation");
  assert.equal(observed.result, false, "P1: the exact hook must not report success when membership and actual track state diverge");
});
