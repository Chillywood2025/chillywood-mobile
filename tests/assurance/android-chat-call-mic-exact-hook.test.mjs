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
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const between = (value, start, end) => {
  const first = value.indexOf(start);
  const last = value.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `exact product slice missing: ${start}`);
  return value.slice(first, last);
};

const mediaControlBindingSlice = between(source, "  const runMediaControl", "  const updateMembershipMediaState");
const mediaControlSlice = between(source, "  const runMediaControl", "  const setSpeaker");
const microphoneSlice = between(source, "  const setMicrophoneEnabled", "  const setCameraEnabled");
const localPublishedSlice = between(
  source,
  "        .on(RoomEvent.LocalTrackPublished",
  "        .on(RoomEvent.LocalTrackUnpublished",
);

const membership = (micEnabled, cameraEnabled = false, overrides = {}) => ({
  roomId: "room-1",
  userId: "local-user",
  role: "participant",
  membershipState: "active",
  cameraEnabled,
  micEnabled,
  displayName: "Local",
  joinedAt: "2026-08-09T00:00:00.000Z",
  lastSeenAt: "2026-08-09T00:00:00.000Z",
  ...overrides,
});

function createExactProductPath(scenario = {}, slices = {}) {
  const wrapper = `
const useCallback = (operation) => operation;
const scenario = __scenario;
const initialMic = scenario.initialMic ?? false;
const targetMic = scenario.targetMic ?? !initialMic;
const initialCamera = scenario.initialCamera ?? false;
const state = {
  actualMic: initialMic, actualCamera: initialCamera, durableMic: initialMic, durableCamera: initialCamera,
  uiMic: initialMic, uiCamera: initialCamera, busy: false, channelState: "live", provider: "livekit",
  nativeCalls: 0, touchCalls: 0, readbackCalls: 0, refreshCalls: 0, tokenCalls: 0, cleanupCalls: 0,
  errors: [], messages: [], telemetry: [], firstMedia: [], log: [],
};
const makeMembership = (mic = state.durableMic, camera = state.durableCamera, overrides = {}) => ({
  roomId: "room-1", userId: "local-user", role: "participant", membershipState: "active",
  cameraEnabled: camera, micEnabled: mic, joinedAt: "2026-08-09T00:00:00.000Z",
  lastSeenAt: "2026-08-09T00:00:00.000Z", ...overrides,
});
const mediaControlRef = {current: null};
const identityRef = {current: {userId: "local-user", displayName: "Local", avatarUrl: null}};
const productRoomRef = {current: {roomId: "room-1", status: "active"}};
const membershipsRef = {current: [makeMembership()]};
let requestedMic = initialMic;
const micRequestedRef = {};
Object.defineProperty(micRequestedRef, "current", {
  get: () => requestedMic,
  set: (value) => {requestedMic = value; state.log.push(\`requested:\${value}\`);},
});
const micEnabled = initialMic;
const pendingMicToggleRef = {current: false};
const micReconciliationBlockedRef = {current: false};
const cameraRequestedRef = {current: initialCamera};
const cameraEnabled = initialCamera;
const channelState = "live";
const nativeQueue = [...(scenario.nativeQueue ?? ["success", "success"])];
const touchQueue = [...(scenario.touchQueue ?? ["success", "success"])];
const readbackQueue = [...(scenario.readbackQueue ?? ["current", "current", "current"])];
const localParticipant = {
  setMicrophoneEnabled: async (value) => {
    state.nativeCalls += 1;
    state.log.push(\`native:\${value}\`);
    const action = nativeQueue.shift() ?? "success";
    if (action === "wait") await scenario.nativeGate;
    if (action === "throw-before") throw new Error("native_forward_rejected");
    state.actualMic = action === "mismatch" ? !value : value;
    if (action === "throw-after") throw new Error("native_forward_ambiguous");
    if (action === "publication-missing") return undefined;
    return value ? {track: {kind: "audio"}, isMuted: false} : undefined;
  },
  getTrackPublication: (sourceValue) => {
    const enabled = sourceValue === "camera" ? state.actualCamera : state.actualMic;
    return enabled ? {track: {kind: sourceValue === "camera" ? "video" : "audio"}, isMuted: false} : undefined;
  },
};
const roomRef = {current: {state: "connected", localParticipant}};
const ConnectionState = {Connected: "connected"};
const Track = {Source: {Microphone: "microphone", Camera: "camera"}};
const publicationIsUsable = (publication) => !!publication?.track && !publication.isMuted;
const setMediaControlsBusy = (value) => {state.busy = value;};
const touchCommunicationRoomSession = async (options) => {
  state.touchCalls += 1;
  state.log.push(\`touch:\${options.micEnabled}\`);
  const action = touchQueue.shift() ?? "success";
  if (action === "reject") throw new Error("membership_rejected");
  if (action === "null") return null;
  if (action === "lost") {
    state.durableMic = options.micEnabled;
    state.durableCamera = options.cameraEnabled;
    return null;
  }
  if (action === "wrong-user") return makeMembership(options.micEnabled, options.cameraEnabled, {userId: "other-user"});
  if (action === "wrong-mic") return makeMembership(!options.micEnabled, options.cameraEnabled);
  if (action === "wrong-room") return makeMembership(options.micEnabled, options.cameraEnabled, {roomId: "room-2"});
  state.durableMic = options.micEnabled;
  state.durableCamera = options.cameraEnabled;
  state.log.push(\`touch-confirmed:\${options.micEnabled}\`);
  return makeMembership();
};
const getCommunicationRoomSnapshot = async () => {
  state.readbackCalls += 1;
  state.log.push("readback");
  const action = readbackQueue.shift() ?? "current";
  if (action === "null") return null;
  if (action === "target") state.durableMic = targetMic;
  if (action === "previous") state.durableMic = initialMic;
  const room = {roomId: action === "wrong-room" ? "room-2" : "room-1", status: action === "ended" ? "ended" : "active"};
  const current = makeMembership(state.durableMic, state.durableCamera, action === "wrong-user" ? {userId: "other-user"} : {});
  state.log.push(\`readback-observed:\${current.micEnabled}\`);
  return {room, memberships: [current]};
};
const LiveKitAudioSession = {startAudioSession: async () => scenario.audioSessionReady !== false};
const setMicEnabledState = (value) => {state.uiMic = value; state.log.push(\`ui:\${value}\`);};
const setMediaPermissionMessage = (value) => {state.messages.push(value);};
const refreshParticipantViews = () => {state.refreshCalls += 1;};
const emitStage = (stage) => {state.telemetry.push(stage); state.log.push(\`emit:\${stage}\`);};
const updateFirstMediaState = (value) => {state.firstMedia.push(value);};
const reportRuntimeError = (_scope, errorValue) => {state.errors.push(String(errorValue?.message ?? errorValue));};
const cleanupSession = async () => {state.cleanupCalls += 1;};
const requestLiveKitParticipantToken = async () => {state.tokenCalls += 1;};
const setProvider = (value) => {state.provider = value;};
${slices.mediaControl ?? mediaControlSlice}
${slices.microphone ?? microphoneSlice}
const snapshot = () => ({
  result: null, actualMic: state.actualMic, requestedMic: micRequestedRef.current, uiMic: state.uiMic,
  membershipMic: state.durableMic, actualCamera: state.actualCamera, requestedCamera: cameraRequestedRef.current,
  uiCamera: state.uiCamera, membershipCamera: state.durableCamera, channelState: state.channelState,
  provider: state.provider, nativeCalls: state.nativeCalls, touchCalls: state.touchCalls,
  readbackCalls: state.readbackCalls, refreshCalls: state.refreshCalls, tokenCalls: state.tokenCalls,
  cleanupCalls: state.cleanupCalls, errors: [...state.errors], messages: [...state.messages],
  telemetry: [...state.telemetry], firstMedia: [...state.firstMedia], log: [...state.log],
  busy: state.busy, reconciliationBlocked: micReconciliationBlockedRef.current,
});
module.exports = {setMicrophoneEnabled, snapshot, state, targetMic};
`;
  const compiled = ts.transpileModule(wrapper, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const sandbox = {
    __scenario: scenario,
    module: {exports: {}},
    exports: {},
    Promise,
  };
  vm.runInNewContext(compiled, sandbox, {filename: sourcePath});
  return sandbox.module.exports;
}

async function executeScenario(scenario, slices) {
  const controls = createExactProductPath(scenario, slices);
  const result = await controls.setMicrophoneEnabled(controls.targetMic);
  return {...controls.snapshot(), result};
}

const assertState = (observed, expectedMic) => {
  assert.equal(observed.actualMic, expectedMic, "actual track state");
  assert.equal(observed.requestedMic, expectedMic, "requested state");
  assert.equal(observed.uiMic, expectedMic, "UI state");
  assert.equal(observed.membershipMic, expectedMic, "durable membership state");
};

const assertCallUnchanged = (observed, initialCamera = false) => {
  assert.equal(observed.channelState, "live", "call remains live");
  assert.equal(observed.actualCamera, initialCamera, "actual camera unchanged");
  assert.equal(observed.requestedCamera, initialCamera, "requested camera unchanged");
  assert.equal(observed.uiCamera, initialCamera, "UI camera unchanged");
  assert.equal(observed.membershipCamera, initialCamera, "durable camera unchanged");
  assert.equal(observed.provider, "livekit", "provider immutable");
  assert.equal(observed.tokenCalls, 0, "no token request");
  assert.equal(observed.cleanupCalls, 0, "no cleanup/end");
  assert.equal(observed.busy, false, "serializer releases busy state");
};

const cases = [
  {
    id: "ENABLE_TARGET_CONFIRMED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current"], touchQueue: ["success"]},
    verify: (value) => {assert.equal(value.result, true); assertState(value, true);},
  },
  {
    id: "ENABLE_NULL_READBACK_OLD_COMPENSATED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, false); assert.equal(value.nativeCalls, 2);},
  },
  {
    id: "ENABLE_LOST_RESPONSE_READBACK_TARGET",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["lost"]},
    verify: (value) => {assert.equal(value.result, true); assertState(value, true);},
  },
  {
    id: "ENABLE_MEMBERSHIP_REJECT_COMPENSATED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["reject", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, false);},
  },
  {
    id: "DISABLE_TARGET_CONFIRMED",
    scenario: {initialMic: true, targetMic: false, readbackQueue: ["current"], touchQueue: ["success"]},
    verify: (value) => {assert.equal(value.result, true); assertState(value, false);},
  },
  {
    id: "DISABLE_MEMBERSHIP_FAILURE_COMPENSATED",
    scenario: {initialMic: true, targetMic: false, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, true);},
  },
  {
    id: "INITIAL_NATIVE_OPERATION_FAILS",
    scenario: {initialMic: false, targetMic: true, nativeQueue: ["throw-before"], readbackQueue: ["current"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, false); assert.equal(value.touchCalls, 0);},
  },
  {
    id: "WRONG_USER_MEMBERSHIP_COMPENSATED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["wrong-user", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, false);},
  },
  {
    id: "WRONG_MIC_MEMBERSHIP_COMPENSATED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["wrong-mic", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, false);},
  },
  {
    id: "AMBIGUOUS_COMPENSATION_READBACK_PREVIOUS",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current", "current"], touchQueue: ["null", "lost"]},
    verify: (value) => {assert.equal(value.result, false); assertState(value, false); assert.equal(value.readbackCalls, 3);},
  },
  {
    id: "COMPENSATION_UNPROVABLE_FAILS_CLOSED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current", "null"], touchQueue: ["null", "null"]},
    verify: (value) => {
      assert.equal(value.result, false);
      assert.equal(value.reconciliationBlocked, true);
      assert.equal(value.errors.includes("microphone_compensation_unprovable"), true);
    },
  },
  {
    id: "DUPLICATE_OVERLAPPING_OPERATION_SERIALIZED",
    custom: async () => {
      let release;
      const nativeGate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({
        initialMic: false,
        targetMic: true,
        nativeQueue: ["wait"],
        readbackQueue: ["current"],
        touchQueue: ["success"],
        nativeGate,
      });
      const first = controls.setMicrophoneEnabled(true);
      await Promise.resolve();
      await Promise.resolve();
      const second = await controls.setMicrophoneEnabled(true);
      assert.equal(second, false);
      release();
      assert.equal(await first, true);
      const observed = controls.snapshot();
      assert.equal(observed.nativeCalls, 1);
      assertState(observed, true);
      assertCallUnchanged(observed);
    },
  },
  {
    id: "CAMERA_STATE_UNCHANGED_DURING_COMPENSATION",
    scenario: {initialMic: false, targetMic: true, initialCamera: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertCallUnchanged(value, true);},
  },
  {
    id: "TOKEN_PROVIDER_CLEANUP_NON_INTERFERENCE",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    verify: (value) => {assert.equal(value.result, false); assertCallUnchanged(value);},
  },
];

test("exact product and serializer slices remain hash-bound", () => {
  assert.equal(hash(source), contract.sourceBindings[sourcePath]);
  assert.equal(hash(mediaControlBindingSlice), contract.sourceSlices["livekit-run-media-control"].sha256);
  assert.equal(hash(microphoneSlice), contract.sourceSlices["livekit-set-microphone"].sha256);
  assert.deepEqual(contract.convergenceCases, cases.map(({id}) => id));
});

for (const definition of cases) {
  test(definition.id, async () => {
    if (definition.custom) return definition.custom();
    const observed = await executeScenario(definition.scenario);
    definition.verify(observed);
    assertCallUnchanged(observed, definition.scenario.initialCamera ?? false);
  });
}

function executeLocalPublished(pending, value = localPublishedSlice) {
  const wrapper = `
const pendingMicToggleRef = {current: __pending};
const RoomEvent = {LocalTrackPublished: "local"};
const Track = {Source: {Microphone: "microphone", Camera: "camera"}};
const liveKitRoom = {state: "connected"};
const state = {telemetry: [], firstMedia: [], refreshed: 0};
const emitStage = (stage) => state.telemetry.push(stage);
const updateFirstMediaState = (update) => state.firstMedia.push(update);
const refresh = () => {state.refreshed += 1;};
let handler;
const chain = {on: (event, callback) => {if (event === RoomEvent.LocalTrackPublished) handler = callback; return chain;}};
chain
${value};
handler({source: Track.Source.Microphone});
module.exports = state;
`;
  const compiled = ts.transpileModule(wrapper, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const sandbox = {__pending: pending, module: {exports: {}}, exports: {}};
  vm.runInNewContext(compiled, sandbox, {filename: sourcePath});
  return sandbox.module.exports;
}

test("pending LocalTrackPublished cannot emit premature success", () => {
  assert.deepEqual(Array.from(executeLocalPublished(true).telemetry), []);
  assert.deepEqual(Array.from(executeLocalPublished(false).telemetry), ["local_audio_published"]);
});

const mutateOnce = (value, before, after, code) => {
  const matches = value.split(before).length - 1;
  assert.equal(matches, 1, `${code} mutation target must be exact`);
  return value.replace(before, after);
};

const negativeControls = [
  {
    code: "ANDROID_MIC_LIVEKIT_MEMBERSHIP_FAILURE_RETURNS_SUCCESS",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    mutate: (value) => mutateOnce(value, "          refreshParticipantViews();\n          return false;\n        }\n\n        micRequestedRef.current", "          refreshParticipantViews();\n          return true;\n        }\n\n        micRequestedRef.current", "return-success"),
    detected: (value) => value.result === true,
  },
  {
    code: "ANDROID_MIC_UI_COMMITTED_BEFORE_MEMBERSHIP",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current"], touchQueue: ["success"]},
    mutate: (value) => mutateOnce(value, "        const membership = await updateMembershipMediaState(", "        setMicEnabledState(nextEnabled);\n        const membership = await updateMembershipMediaState(", "early-ui"),
    detected: (value) => value.log.indexOf("ui:true") < value.log.indexOf("touch-confirmed:true"),
  },
  {
    code: "ANDROID_MIC_REQUEST_COMMITTED_BEFORE_MEMBERSHIP",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current"], touchQueue: ["success"]},
    mutate: (value) => mutateOnce(value, "        const membership = await updateMembershipMediaState(", "        micRequestedRef.current = nextEnabled;\n        const membership = await updateMembershipMediaState(", "early-request"),
    detected: (value) => value.log.indexOf("requested:true") < value.log.indexOf("touch-confirmed:true"),
  },
  {
    code: "ANDROID_MIC_MEMBERSHIP_FAILURE_TRACK_DIVERGENCE",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    mutate: (value) => mutateOnce(value, "          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);\n          const nativeRestored", "          void priorActual;\n          const nativeRestored", "remove-native-compensation"),
    detected: (value) => value.actualMic !== value.requestedMic,
  },
  {
    code: "ANDROID_MIC_COMPENSATION_UNCONFIRMED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current", "null"], touchQueue: ["null", "null"]},
    mutate: (value) => mutateOnce(value, "          const compensationProved = nativeRestored\n", "          const compensationProved = true || nativeRestored\n", "accept-unconfirmed-compensation"),
    detected: (value) => !value.reconciliationBlocked && !value.errors.includes("microphone_compensation_unprovable"),
  },
  {
    code: "ANDROID_MIC_AMBIGUOUS_WRITE_READBACK_IGNORED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["lost"]},
    mediaMutation: (value) => mutateOnce(value, "    if (strict && !isExact(membership)) {", "    if (false && strict && !isExact(membership)) {", "ignore-readback"),
    detected: (value) => value.result === false,
  },
  {
    code: "ANDROID_MIC_MEMBERSHIP_IDENTITY_MISMATCH_ACCEPTED",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current"], touchQueue: ["wrong-user"]},
    mediaMutation: (value) => mutateOnce(value, "        && candidate.userId === currentIdentity.userId", "        && true", "accept-wrong-user"),
    detected: (value) => value.result === true,
  },
  {
    code: "ANDROID_MIC_SUCCESS_TELEMETRY_PREMATURE",
    eventMutation: (value) => mutateOnce(value, " && !pendingMicToggleRef.current", "", "premature-event"),
  },
  {
    code: "ANDROID_MIC_FAILURE_TERMINATES_CALL",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    mutate: (value) => mutateOnce(value, "          refreshParticipantViews();\n          return false;\n        }\n\n        micRequestedRef.current", "          refreshParticipantViews();\n          await cleanupSession();\n          return false;\n        }\n\n        micRequestedRef.current", "cleanup-on-failure"),
    detected: (value) => value.cleanupCalls > 0,
  },
  {
    code: "ANDROID_MIC_TOGGLE_TOKEN_AUTHORITY_VIOLATION",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current"], touchQueue: ["success"]},
    mutate: (value) => mutateOnce(value, "        pendingMicToggleRef.current = true;", "        pendingMicToggleRef.current = true;\n        await requestLiveKitParticipantToken();", "token-request"),
    detected: (value) => value.tokenCalls > 0,
  },
  {
    code: "ANDROID_MIC_TOGGLE_PROVIDER_IMMUTABILITY_VIOLATION",
    scenario: {initialMic: false, targetMic: true, readbackQueue: ["current"], touchQueue: ["success"]},
    mutate: (value) => mutateOnce(value, "        pendingMicToggleRef.current = true;", "        pendingMicToggleRef.current = true;\n        setProvider(\"legacy_webrtc\");", "provider-change"),
    detected: (value) => value.provider !== "livekit",
  },
  {
    code: "ANDROID_MIC_COMPENSATION_CAMERA_REGRESSION",
    scenario: {initialMic: false, targetMic: true, initialCamera: true, readbackQueue: ["current", "current"], touchQueue: ["null", "success"]},
    mutate: (value) => mutateOnce(value, "          refreshParticipantViews();\n          return false;\n        }\n\n        micRequestedRef.current", "          refreshParticipantViews();\n          cameraRequestedRef.current = !priorCameraRequested;\n          return false;\n        }\n\n        micRequestedRef.current", "camera-change"),
    detected: (value) => value.requestedCamera !== true,
  },
];

test("negative-control contract names remain exact", () => {
  assert.deepEqual(contract.convergenceNegativeControls, negativeControls.map(({code}) => code));
});

for (const control of negativeControls) {
  test(`${control.code} executable mutant is rejected`, async () => {
    if (control.eventMutation) {
      const mutated = control.eventMutation(localPublishedSlice);
      assert.deepEqual(Array.from(executeLocalPublished(true, mutated).telemetry), ["local_audio_published"]);
      return;
    }
    const mutatedMicrophone = control.mutate ? control.mutate(microphoneSlice) : microphoneSlice;
    const mutatedMedia = control.mediaMutation ? control.mediaMutation(mediaControlSlice) : mediaControlSlice;
    const observed = await executeScenario(control.scenario, {microphone: mutatedMicrophone, mediaControl: mutatedMedia});
    assert.equal(control.detected(observed), true, `${control.code} must be detected`);
  });
}

test("14-case evidence is deterministic 3/3", async () => {
  const hashes = [];
  for (let run = 0; run < 3; run += 1) {
    const evidence = [];
    for (const definition of cases.filter(({custom}) => !custom)) {
      const observed = await executeScenario(definition.scenario);
      evidence.push({id: definition.id, result: observed.result, actual: observed.actualMic, durable: observed.membershipMic});
    }
    hashes.push(hash(stable(evidence)));
  }
  assert.equal(new Set(hashes).size, 1);
});
