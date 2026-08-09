#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = "hooks/use-livekit-chat-call-session.ts";
const source = fs.readFileSync(sourcePath, "utf8");
const contractRaw = fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value, seen = new Set()) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) fail("D2A_DETERMINISM_NON_FINITE_NUMBER"); return value; }
  if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) fail(`D2A_DETERMINISM_UNSUPPORTED_${(typeof value).toUpperCase()}`);
  if (seen.has(value)) fail("D2A_DETERMINISM_CYCLE");
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((entry) => canonical(entry, seen))
    : Object.getPrototypeOf(value) === Object.prototype
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]))
      : fail("D2A_DETERMINISM_UNSUPPORTED_CLASS");
  seen.delete(value); return result;
};
const stable = (value) => JSON.stringify(canonical(value));
const count = (value, needle) => value.split(needle).length - 1;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const expectedPaths = [
  "components/communication/communication-control-bar.tsx",
  "components/communication/in-room-communication-panel.tsx",
  "hooks/use-chat-call-media-session.ts",
  "hooks/use-livekit-chat-call-session.ts",
  "hooks/use-communication-room-session.ts",
  "_lib/communication.ts",
  "_lib/chatCallMediaProviderPolicy.ts",
  "package-lock.json",
];
const expectedSlices = [
  "livekit-run-media-control",
  "livekit-set-microphone",
  "legacy-run-serialized",
  "legacy-ensure-track-kind",
  "legacy-set-microphone",
];

const parseRawContract = (raw) => {
  let offset = 0;
  const skip = () => { while (/\s/u.test(raw[offset] ?? "")) offset += 1; };
  const string = () => {
    skip(); const start = offset;
    if (raw[offset] !== '"') fail("D2A_BINDING_JSON_INVALID");
    for (offset += 1; offset < raw.length; offset += 1) {
      if (raw[offset] === "\\") { offset += 1; continue; }
      if (raw[offset] === '"') { offset += 1; return JSON.parse(raw.slice(start, offset)); }
    }
    fail("D2A_BINDING_JSON_INVALID");
  };
  const value = (location = []) => {
    skip();
    if (raw[offset] === "{") {
      offset += 1; const result = {}; const keys = new Set(); skip();
      while (raw[offset] !== "}") {
        const key = string();
        if (keys.has(key)) {
          if (location.at(-1) === "sourceBindings") fail("D2A_BINDING_DUPLICATE_FULL_FILE_JSON_KEY");
          if (location.at(-1) === "sourceSlices") fail("D2A_BINDING_DUPLICATE_SLICE_ID_JSON_KEY");
          fail("D2A_BINDING_DUPLICATE_JSON_KEY");
        }
        keys.add(key); skip(); if (raw[offset] !== ":") fail("D2A_BINDING_JSON_INVALID"); offset += 1;
        Object.defineProperty(result, key, {value: value([...location, key]), enumerable: true, configurable: true, writable: true});
        skip(); if (raw[offset] === ",") { offset += 1; skip(); continue; }
        if (raw[offset] !== "}") fail("D2A_BINDING_JSON_INVALID");
      }
      offset += 1; return result;
    }
    if (raw[offset] === "[") {
      offset += 1; const result = []; skip();
      while (raw[offset] !== "]") {
        result.push(value([...location, String(result.length)])); skip();
        if (raw[offset] === ",") { offset += 1; skip(); continue; }
        if (raw[offset] !== "]") fail("D2A_BINDING_JSON_INVALID");
      }
      offset += 1; return result;
    }
    if (raw[offset] === '"') return string();
    const start = offset;
    while (offset < raw.length && !/[\s,}\]]/u.test(raw[offset])) offset += 1;
    try { return JSON.parse(raw.slice(start, offset)); } catch { fail("D2A_BINDING_JSON_INVALID"); }
  };
  const parsed = value(); skip();
  if (offset !== raw.length) fail("D2A_BINDING_JSON_INVALID");
  return parsed;
};
const contract = parseRawContract(contractRaw);
const between = (value, start, end) => {
  const first = value.indexOf(start);
  const last = value.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `exact product slice missing: ${start}`);
  return value.slice(first, last);
};

const assertAllVisited = (expected, visited) => {
  if (expected.some((entry) => !visited.has(entry))) fail("D2A_BINDING_UNVISITED_DECLARED_ENTRY");
};
const safeBindingPath = (root, bindingPath) => {
  if (path.isAbsolute(bindingPath) || bindingPath.split(/[\\/]/u).includes("..")) fail("D2A_BINDING_PATH_TRAVERSAL");
  const rootReal = fs.realpathSync(root);
  const absolute = path.resolve(rootReal, bindingPath);
  if (absolute !== rootReal && !absolute.startsWith(`${rootReal}${path.sep}`)) fail("D2A_BINDING_PATH_TRAVERSAL");
  let real;
  try { real = fs.realpathSync(absolute); } catch { fail("D2A_BINDING_PATH_UNREADABLE"); }
  if (real !== rootReal && !real.startsWith(`${rootReal}${path.sep}`)) fail("D2A_BINDING_SYMLINK_ESCAPE");
  return absolute;
};

const verifySourceAndSliceBindings = (candidate, options = {}) => {
  assert.equal(typeof candidate?.sourceBindings, "object", "source bindings required");
  assert.equal(typeof candidate?.sourceSlices, "object", "source slices required");
  const root = options.root ?? ".";
  const readText = options.readText ?? ((bindingPath) => fs.readFileSync(safeBindingPath(root, bindingPath), "utf8"));
  const boundPaths = Object.keys(candidate.sourceBindings);
  for (const bindingPath of boundPaths) safeBindingPath(root, bindingPath);
  const pathSet = new Set(boundPaths);
  for (const expected of expectedPaths) if (!pathSet.has(expected)) fail("D2A_BINDING_MISSING_FULL_FILE");
  for (const declared of boundPaths) if (!expectedPaths.includes(declared)) fail("D2A_BINDING_EXTRA_FULL_FILE");
  const sliceIds = Object.keys(candidate.sourceSlices);
  const idSet = new Set(sliceIds);
  for (const expected of expectedSlices) if (!idSet.has(expected)) fail("D2A_BINDING_MISSING_SLICE_ID");
  for (const declared of sliceIds) if (!expectedSlices.includes(declared)) fail("D2A_BINDING_EXTRA_SLICE_ID");
  const visitedPaths = new Set(); const texts = new Map();
  for (const bindingPath of expectedPaths) {
    const text = readText(bindingPath); const digest = hash(text);
    if (!/^[a-f0-9]{64}$/u.test(candidate.sourceBindings[bindingPath])) fail("D2A_BINDING_DIGEST_MALFORMED");
    if (bindingPath === "package-lock.json" && digest !== candidate.sourceBindings[bindingPath]) fail("D2A_BINDING_STALE_PACKAGE_LOCK");
    if (bindingPath === sourcePath && digest !== candidate.sourceBindings[bindingPath]) fail("D2A_BINDING_STALE_PRODUCT");
    if (digest !== candidate.sourceBindings[bindingPath]) fail("D2A_BINDING_STALE_FULL_FILE_DIGEST");
    texts.set(bindingPath, text); visitedPaths.add(bindingPath);
  }
  assertAllVisited(expectedPaths, visitedPaths);
  const seenSlices = new Set();
  const visitedSlices = new Set();
  for (const id of expectedSlices) {
    const slice = candidate.sourceSlices[id];
    if (typeof slice.path !== "string" || !Object.hasOwn(candidate.sourceBindings, slice.path)) fail("D2A_BINDING_SLICE_PATH_UNBOUND");
    if (typeof slice.start !== "string" || !slice.start) fail("D2A_BINDING_SLICE_START_MISSING");
    if (typeof slice.end !== "string" || !slice.end) fail("D2A_BINDING_SLICE_END_MISSING");
    if (!/^[a-f0-9]{64}$/u.test(slice.sha256)) fail("D2A_BINDING_DIGEST_MALFORMED");
    const signature = `${slice.path}\u0000${slice.start}\u0000${slice.end}`;
    if (seenSlices.has(signature)) fail("D2A_BINDING_DUPLICATE_SLICE_TUPLE");
    seenSlices.add(signature);
    const text = texts.get(slice.path) ?? readText(slice.path);
    if (count(text, slice.start) === 0) fail("D2A_BINDING_SLICE_START_MISSING");
    if (count(text, slice.end) === 0) fail("D2A_BINDING_SLICE_END_MISSING");
    if (count(text, slice.start) !== 1 || count(text, slice.end) !== 1) fail("D2A_BINDING_DUPLICATE_SLICE_MARKER");
    const start = text.indexOf(slice.start);
    const end = text.indexOf(slice.end, start + slice.start.length);
    if (end <= start) fail("D2A_BINDING_SLICE_ORDER_INVALID");
    if (hash(text.slice(start, end)) !== slice.sha256) fail("D2A_BINDING_STALE_SLICE_DIGEST");
    visitedSlices.add(id);
  }
  assertAllVisited(expectedSlices, visitedSlices);
  assert.equal(visitedPaths.size, boundPaths.length); assert.equal(boundPaths.length, expectedPaths.length);
  assert.equal(visitedSlices.size, sliceIds.length); assert.equal(sliceIds.length, expectedSlices.length);
  return {validatedFullFiles: visitedPaths.size, validatedSlices: visitedSlices.size};
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
  errors: [], messages: [], telemetry: [], firstMedia: [], log: [], touchTargets: [],
};
const makeMembership = (mic = state.durableMic, camera = state.durableCamera, overrides = {}) => ({
  roomId: "room-1", userId: "local-user", role: "participant", membershipState: "active",
  cameraEnabled: camera, micEnabled: mic, joinedAt: "2026-08-09T00:00:00.000Z",
  lastSeenAt: "2026-08-09T00:00:00.000Z", ...overrides,
});
const mediaControlRef = {current: null};
const mediaControlOwnerRef = {current: null};
const identityRef = {current: {userId: "local-user", displayName: "Local", avatarUrl: null}};
const sessionKey = "invite-1:ROOM:audio:livekit";
const sessionKeyRef = {current: sessionKey};
const sessionGenerationRef = {current: 0};
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
const pendingMicOwnerRef = {current: null};
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
    if (action === "wait") await (scenario.nativeGates?.[state.nativeCalls] ?? scenario.nativeGate);
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
const ConnectionState = {Connected: "connected", Reconnecting: "reconnecting"};
const Track = {Source: {Microphone: "microphone", Camera: "camera"}};
const publicationIsUsable = (publication) => !!publication?.track && !publication.isMuted;
const setMediaControlsBusy = (value) => {state.busy = value;};
const touchCommunicationRoomSession = async (options) => {
  state.touchCalls += 1;
  state.touchTargets.push({roomId: options.roomId, userId: options.userId});
  state.log.push(\`touch:\${options.micEnabled}\`);
  const action = touchQueue.shift() ?? "success";
  if (action === "wait") await (scenario.touchGates?.[state.touchCalls] ?? scenario.touchGate);
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
  scenario.onTouchBeforeReturn?.();
  return makeMembership(options.micEnabled, options.cameraEnabled, {
    roomId: options.roomId,
    userId: options.userId,
    membershipState: options.membershipState,
    displayName: options.displayName,
    avatarUrl: options.avatarUrl,
  });
};
const getCommunicationRoomSnapshot = async () => {
  state.readbackCalls += 1;
  state.log.push("readback");
  if (scenario.readbackGate || scenario.readbackGates?.[state.readbackCalls]) await (scenario.readbackGates?.[state.readbackCalls] ?? scenario.readbackGate);
  const action = readbackQueue.shift() ?? "current";
  if (action === "null") return null;
  if (action === "target") state.durableMic = targetMic;
  if (action === "previous") state.durableMic = initialMic;
  const room = {roomId: action === "wrong-room" ? "room-2" : "room-1", status: action === "ended" ? "ended" : "active"};
  const current = makeMembership(state.durableMic, state.durableCamera, action === "wrong-user" ? {userId: "other-user"} : {});
  state.log.push(\`readback-observed:\${current.micEnabled}\`);
  return {room, memberships: [current]};
};
const LiveKitAudioSession = {startAudioSession: async () => {if (scenario.audioGate) await scenario.audioGate; return scenario.audioSessionReady !== false;}};
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
  touchTargets: [...state.touchTargets],
  busy: state.busy, pendingMic: pendingMicToggleRef.current, reconciliationBlocked: micReconciliationBlockedRef.current,
});
module.exports = {setMicrophoneEnabled, runMediaControl, snapshot, state, targetMic, lease: () => ({owner: mediaControlOwnerRef.current, pending: mediaControlRef.current, busy: state.busy}), retireLease: () => {mediaControlOwnerRef.current = null; mediaControlRef.current = null; setMediaControlsBusy(false);}, rollover: () => {sessionKeyRef.current = "replacement"; sessionGenerationRef.current += 1; productRoomRef.current = {roomId: "room-2", status: "active"}; identityRef.current = {userId: "replacement-user"}; roomRef.current = {state: "connected", localParticipant};}};
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

const assertRolloverContained = (observed) => {
  assert.equal(observed.touchTargets.some((target) => target.roomId === "room-2" || target.userId === "replacement-user"), false, "replacement durable session untouched");
  assert.equal(observed.actualMic, false);
  assert.equal(observed.requestedMic, false);
  assert.equal(observed.uiMic, false);
  assertCallUnchanged(observed);
  assert.equal(observed.refreshCalls, 0); assert.equal(observed.errors.length, 0); assert.equal(observed.messages.length, 0);
  assert.equal(observed.reconciliationBlocked, false); assert.equal(observed.pendingMic, false);
  assert.equal(JSON.stringify(observed.telemetry), "[]");
  assert.equal(JSON.stringify(observed.firstMedia), "[]");
};

const determinismControls = [
  "D2A_DETERMINISM_INSERTION_ORDER_SAME", "D2A_DETERMINISM_NESTED_BOOLEAN_DIFF", "D2A_DETERMINISM_NESTED_FIELD_ADDED_DIFF",
  "D2A_DETERMINISM_NESTED_FIELD_REMOVED_DIFF", "D2A_DETERMINISM_NESTED_NUMBER_DIFF", "D2A_DETERMINISM_ARRAY_ORDER_DIFF",
  "D2A_DETERMINISM_NESTED_NULL_MISSING_DIFF", "D2A_DETERMINISM_UNSUPPORTED_REJECTS", "D2A_DETERMINISM_CYCLE_REJECTS", "D2A_DETERMINISM_HISTORICAL_ARRAY_OBJECT_COLLISION_ELIMINATED",
];

test("deep canonical determinism controls", () => {
  assert.deepEqual(contract.determinismControls, determinismControls);
  const sameLeft = stable({outcome: {a: 1, b: 2}}); const sameRight = stable({outcome: {b: 2, a: 1}});
  assert.equal(sameLeft, sameRight); assert.equal(hash(sameLeft), hash(sameRight));
  for (const [left, right] of [[{outcome: {accepted: true}}, {outcome: {accepted: false}}], [{outcome: {}}, {outcome: {added: 1}}], [{outcome: {removed: 1}}, {outcome: {}}], [{outcome: {n: 1}}, {outcome: {n: 2}}], [{outcome: [1, 2]}, {outcome: [2, 1]}], [{outcome: {value: null}}, {outcome: {}}], [[{}], [{x: 1}]]]) {
    assert.notEqual(stable(left), stable(right)); assert.notEqual(hash(stable(left)), hash(stable(right)));
  }
  assert.throws(() => stable(undefined), {message: "D2A_DETERMINISM_UNSUPPORTED_UNDEFINED"});
  assert.throws(() => stable(() => {}), {message: "D2A_DETERMINISM_UNSUPPORTED_FUNCTION"}); assert.throws(() => stable(Symbol("x")), {message: "D2A_DETERMINISM_UNSUPPORTED_SYMBOL"});
  assert.throws(() => stable(1n), {message: "D2A_DETERMINISM_UNSUPPORTED_BIGINT"});
  assert.throws(() => stable(Infinity), {message: "D2A_DETERMINISM_NON_FINITE_NUMBER"});
  assert.throws(() => stable(new Date()), {message: "D2A_DETERMINISM_UNSUPPORTED_CLASS"});
  const cycle = {}; cycle.self = cycle; assert.throws(() => stable(cycle), {message: "D2A_DETERMINISM_CYCLE"});
});

test("STALE_A_FINALLY_CANNOT_CLEAR_B_LEASE", async () => {
  assert.deepEqual(contract.leaseCases, ["STALE_A_FINALLY_CANNOT_CLEAR_B_LEASE"]);
  let releaseA; let releaseB;
  const gateA = new Promise((resolve) => { releaseA = resolve; });
  const gateB = new Promise((resolve) => { releaseB = resolve; });
  const controls = createExactProductPath();
  const a = controls.runMediaControl(async () => { await gateA; return "A"; }, {sessionKey: "A", generation: 0});
  controls.rollover(); controls.retireLease();
  const b = controls.runMediaControl(async () => { await gateB; return "B"; }, {sessionKey: "B", generation: 1});
  releaseA(); await a;
  assert.equal(controls.lease().busy, true); assert.ok(controls.lease().pending);
  assert.equal(controls.snapshot().requestedMic, false); assert.equal(controls.snapshot().uiMic, false);
  releaseB(); assert.equal(await b, "B"); assert.equal(controls.lease().busy, false); assert.equal(controls.lease().pending, null);
});

test("stale boundary matrix is exact and atomic commit is synchronous", () => {
  const rows = contract.staleBoundaryMatrix; const caseIds = new Set([...cases.map(({id}) => id), "STALE_A_FINALLY_CANNOT_CLEAR_B_LEASE"]);
  assert.equal(rows.length, 14); assert.equal(new Set(rows.map((row) => row.boundaryId)).size, 14);
  assert.equal(rows.every((row) => ["ASYNC_GUARD", "SYNCHRONOUS_ATOMIC_COMMIT_GUARD", "LEASE_FINALIZER_GUARD"].includes(row.classification) && caseIds.has(row.executableCaseId) && row.assertedReplacementEffect), true);
  const commit = microphoneSlice.slice(microphoneSlice.indexOf("const commitConfirmedMicrophoneTarget"), microphoneSlice.indexOf("if (!commitConfirmedMicrophoneTarget())"));
  assert.doesNotMatch(commit, /\bawait\b/u); assert.match(commit, /if \(!originStillCurrent\(\) \|\| !leaseStillOwned\(\)\) return false;/u);
});

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
  {
    id: "DEFERRED_NATIVE_SESSION_ROLLOVER_ORIGIN_ONLY_COMPENSATED",
    custom: async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, nativeQueue: ["wait", "success"], nativeGate: gate});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 12 && controls.snapshot().nativeCalls === 0; turn += 1) await Promise.resolve();
      controls.rollover(); release();
      const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assert.equal(observed.nativeCalls, 2); assert.equal(observed.touchCalls, 0); assertState(observed, false);
      assert.equal(observed.errors.includes("mic_session_identity_rollover"), false);
      assert.equal(observed.messages.includes("Microphone state could not be confirmed. The call remains connected."), false);
    },
  },
  {
    id: "DEFERRED_AUDIO_SESSION_ROLLOVER_DENIED_BEFORE_NATIVE",
    custom: async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, audioGate: gate});
      const pending = controls.setMicrophoneEnabled(true);
      await Promise.resolve(); controls.rollover(); release();
      const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assert.equal(observed.nativeCalls, 0); assert.equal(observed.touchCalls, 0); assertState(observed, false);
    },
  },
  {
    id: "DEFERRED_PRIOR_READBACK_ROLLOVER_DENIED_BEFORE_NATIVE",
    custom: async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, readbackGate: gate});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 12 && controls.snapshot().readbackCalls === 0; turn += 1) await Promise.resolve();
      controls.rollover(); release();
      const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assert.equal(observed.nativeCalls, 0); assert.equal(observed.touchCalls, 0); assertState(observed, false);
    },
  },
  {
    id: "DEFERRED_FORWARD_DURABLE_WRITE_ROLLOVER_NO_REPLACEMENT_TOUCH",
    custom: async () => {
      let release; const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, touchQueue: ["wait"], touchGate: gate});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 12 && controls.snapshot().touchCalls === 0; turn += 1) await Promise.resolve();
      controls.rollover(); release(); const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assertRolloverContained(observed);
    },
  },
  {
    id: "DEFERRED_FORWARD_READBACK_ROLLOVER_NO_REPLACEMENT_TOUCH",
    custom: async () => {
      let release; const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, touchQueue: ["wrong-mic"], readbackGates: [undefined, gate]});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 12 && controls.snapshot().readbackCalls < 2; turn += 1) await Promise.resolve();
      controls.rollover(); release(); const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assertRolloverContained(observed);
    },
  },
  {
    id: "PRECOMMIT_ROLLOVER_NO_REPLACEMENT_TOUCH",
    custom: async () => {
      const scenario = {initialMic: false, targetMic: true};
      const controls = createExactProductPath(scenario);
      scenario.onTouchBeforeReturn = () => controls.rollover();
      const result = await controls.setMicrophoneEnabled(true); const observed = controls.snapshot();
      assert.equal(result, false); assertRolloverContained(observed);
    },
  },
  {
    id: "DEFERRED_NATIVE_COMPENSATION_ROLLOVER_NO_REPLACEMENT_TOUCH",
    custom: async () => {
      let release; const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, nativeQueue: ["success", "wait"], nativeGates: [undefined, gate], touchQueue: ["null"]});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 12 && controls.snapshot().nativeCalls < 2; turn += 1) await Promise.resolve();
      controls.rollover(); release(); const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assertRolloverContained(observed);
    },
  },
  {
    id: "DEFERRED_DURABLE_COMPENSATION_READBACK_ROLLOVER_NO_REPLACEMENT_TOUCH",
    custom: async () => {
      let release; const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, touchQueue: ["null", "null"], readbackGates: [undefined, undefined, gate]});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 16 && controls.snapshot().readbackCalls < 3; turn += 1) await Promise.resolve();
      controls.rollover(); release(); const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false); assertRolloverContained(observed);
    },
  },
  {
    id: "PRE_REQUESTED_COMMIT_ROLLOVER_DENIED",
    custom: async () => {
      const scenario = {initialMic: false, targetMic: true};
      const mutated = mutateOnce(microphoneSlice, "          if (!originStillCurrent() || !leaseStillOwned()) return false;", "          scenario.beforeRequested?.();\n          if (!originStillCurrent() || !leaseStillOwned()) return false;", "before-requested");
      const controls = createExactProductPath(scenario, {microphone: mutated});
      scenario.beforeRequested = () => controls.rollover();
      const result = await controls.setMicrophoneEnabled(true); const observed = controls.snapshot();
      assert.equal(result, false); assertRolloverContained(observed);
    },
  },
];

test("exact product and serializer slices remain hash-bound", () => {
  verifySourceAndSliceBindings(contract);
  assert.equal(hash(source), contract.sourceBindings[sourcePath]);
  assert.equal(hash(mediaControlBindingSlice), contract.sourceSlices["livekit-run-media-control"].sha256);
  assert.equal(hash(microphoneSlice), contract.sourceSlices["livekit-set-microphone"].sha256);
  assert.deepEqual(contract.convergenceCases, cases.map(({id}) => id));
});

const bindingNegativeControls = [
  "D2A_BINDING_MISSING_FULL_FILE", "D2A_BINDING_EXTRA_FULL_FILE", "D2A_BINDING_DUPLICATE_FULL_FILE_JSON_KEY",
  "D2A_BINDING_MISSING_SLICE_ID", "D2A_BINDING_EXTRA_SLICE_ID", "D2A_BINDING_DUPLICATE_SLICE_ID_JSON_KEY",
  "D2A_BINDING_STALE_PACKAGE_LOCK", "D2A_BINDING_STALE_PRODUCT", "D2A_BINDING_UNVISITED_DECLARED_ENTRY",
  "D2A_BINDING_PATH_TRAVERSAL", "D2A_BINDING_SYMLINK_ESCAPE", "D2A_BINDING_DUPLICATE_SLICE_MARKER",
  "D2A_BINDING_STALE_SLICE_DIGEST", "D2A_BINDING_DUPLICATE_SLICE_TUPLE",
];

test("source and slice binding negatives fail closed", () => {
  assert.deepEqual(contract.bindingNegativeControls, bindingNegativeControls);
  const clone = () => JSON.parse(JSON.stringify(contract));
  const expectCode = (code, operation) => assert.throws(operation, (error) => error?.code === code, code);
  const duplicateRawEntry = (raw, key) => {
    const lines = raw.split("\n"); const index = lines.findIndex((line) => line.startsWith(`    "${key}":`));
    assert.ok(index >= 0, `raw entry missing: ${key}`); lines.splice(index, 0, lines[index]); return lines.join("\n");
  };

  const missingFull = clone(); delete missingFull.sourceBindings[expectedPaths[0]];
  expectCode("D2A_BINDING_MISSING_FULL_FILE", () => verifySourceAndSliceBindings(missingFull));
  const extraFull = clone(); extraFull.sourceBindings["README.md"] = hash(fs.readFileSync("README.md", "utf8"));
  expectCode("D2A_BINDING_EXTRA_FULL_FILE", () => verifySourceAndSliceBindings(extraFull));
  expectCode("D2A_BINDING_DUPLICATE_FULL_FILE_JSON_KEY", () => parseRawContract(duplicateRawEntry(contractRaw, expectedPaths[0])));

  const missingSlice = clone(); delete missingSlice.sourceSlices[expectedSlices[0]];
  expectCode("D2A_BINDING_MISSING_SLICE_ID", () => verifySourceAndSliceBindings(missingSlice));
  const extraSlice = clone(); extraSlice.sourceSlices.extra = {...extraSlice.sourceSlices[expectedSlices[0]]};
  expectCode("D2A_BINDING_EXTRA_SLICE_ID", () => verifySourceAndSliceBindings(extraSlice));
  expectCode("D2A_BINDING_DUPLICATE_SLICE_ID_JSON_KEY", () => parseRawContract(duplicateRawEntry(contractRaw, expectedSlices[0])));

  const staleLock = clone(); staleLock.sourceBindings["package-lock.json"] = "0".repeat(64);
  expectCode("D2A_BINDING_STALE_PACKAGE_LOCK", () => verifySourceAndSliceBindings(staleLock));
  const staleProduct = clone(); staleProduct.sourceBindings[sourcePath] = "0".repeat(64);
  expectCode("D2A_BINDING_STALE_PRODUCT", () => verifySourceAndSliceBindings(staleProduct));
  expectCode("D2A_BINDING_UNVISITED_DECLARED_ENTRY", () => assertAllVisited(expectedPaths, new Set(expectedPaths.slice(1))));

  const traversal = clone(); traversal.sourceBindings["../package-lock.json"] = traversal.sourceBindings["package-lock.json"]; delete traversal.sourceBindings["package-lock.json"];
  expectCode("D2A_BINDING_PATH_TRAVERSAL", () => verifySourceAndSliceBindings(traversal));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "d2a-binding-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "d2a-binding-outside-"));
  try {
    for (const bindingPath of expectedPaths.filter((entry) => entry !== "package-lock.json")) {
      const destination = path.join(root, bindingPath); fs.mkdirSync(path.dirname(destination), {recursive: true}); fs.writeFileSync(destination, fs.readFileSync(bindingPath));
    }
    const outsideLock = path.join(outside, "package-lock.json"); fs.writeFileSync(outsideLock, fs.readFileSync("package-lock.json"));
    fs.symlinkSync(outsideLock, path.join(root, "package-lock.json"));
    expectCode("D2A_BINDING_SYMLINK_ESCAPE", () => verifySourceAndSliceBindings(clone(), {root}));
  } finally {
    fs.rmSync(root, {recursive: true, force: true}); fs.rmSync(outside, {recursive: true, force: true});
  }

  const duplicateMarker = clone(); const marker = duplicateMarker.sourceSlices["livekit-set-microphone"].start;
  const duplicateText = source.replace(marker, `${marker}\n${marker}`); duplicateMarker.sourceBindings[sourcePath] = hash(duplicateText);
  expectCode("D2A_BINDING_DUPLICATE_SLICE_MARKER", () => verifySourceAndSliceBindings(duplicateMarker, {readText: (bindingPath) => bindingPath === sourcePath ? duplicateText : fs.readFileSync(bindingPath, "utf8")}));
  const staleSlice = clone(); staleSlice.sourceSlices["livekit-set-microphone"].sha256 = "0".repeat(64);
  expectCode("D2A_BINDING_STALE_SLICE_DIGEST", () => verifySourceAndSliceBindings(staleSlice));
  const duplicateTuple = clone(); duplicateTuple.sourceSlices[expectedSlices[1]] = {...duplicateTuple.sourceSlices[expectedSlices[0]]};
  expectCode("D2A_BINDING_DUPLICATE_SLICE_TUPLE", () => verifySourceAndSliceBindings(duplicateTuple));

  const startMissing = clone(); startMissing.sourceSlices[expectedSlices[0]].start = "missing-start-marker";
  expectCode("D2A_BINDING_SLICE_START_MISSING", () => verifySourceAndSliceBindings(startMissing));
  const endMissing = clone(); endMissing.sourceSlices[expectedSlices[0]].end = "missing-end-marker";
  expectCode("D2A_BINDING_SLICE_END_MISSING", () => verifySourceAndSliceBindings(endMissing));
  const wrongOrder = clone(); [wrongOrder.sourceSlices[expectedSlices[1]].start, wrongOrder.sourceSlices[expectedSlices[1]].end] = [wrongOrder.sourceSlices[expectedSlices[1]].end, wrongOrder.sourceSlices[expectedSlices[1]].start];
  expectCode("D2A_BINDING_SLICE_ORDER_INVALID", () => verifySourceAndSliceBindings(wrongOrder));
  const unboundSlice = clone(); unboundSlice.sourceSlices[expectedSlices[1]].path = "README.md";
  expectCode("D2A_BINDING_SLICE_PATH_UNBOUND", () => verifySourceAndSliceBindings(unboundSlice));
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
    mutate: (value) => mutateOnce(value, "          refreshParticipantViews();\n          return false;\n        }\n\n        const leaseStillOwned", "          refreshParticipantViews();\n          return true;\n        }\n\n        const leaseStillOwned", "return-success"),
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
    mutate: (value) => value.replaceAll("          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);", "          void priorActual;"),
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
    mutate: (value) => mutateOnce(value, "          refreshParticipantViews();\n          return false;\n        }\n\n        const leaseStillOwned", "          refreshParticipantViews();\n          await cleanupSession();\n          return false;\n        }\n\n        const leaseStillOwned", "cleanup-on-failure"),
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
    mutate: (value) => mutateOnce(value, "          refreshParticipantViews();\n          return false;\n        }\n\n        const leaseStillOwned", "          refreshParticipantViews();\n          cameraRequestedRef.current = !priorCameraRequested;\n          return false;\n        }\n\n        const leaseStillOwned", "camera-change"),
    detected: (value) => value.requestedCamera !== true,
  },
  {
    code: "D2A_MIC_TOGGLE_SESSION_IDENTITY_ROLLOVER_FALSE_CONVERGENCE",
    custom: async () => {
      let mutated = mutateOnce(microphoneSlice, `const originStillCurrent = () => (
          sessionKeyRef.current === originSessionKey
          && sessionGenerationRef.current === originSessionGeneration
          && roomRef.current === liveKitRoom
          && productRoomRef.current === currentRoom
          && identityRef.current === currentIdentity
        );`, "const originStillCurrent = () => true;", "accept-rollover");
      mutated = mutateOnce(mutated, "          originStillCurrent,\n          { room: currentRoom, identity: currentIdentity },", "          undefined,", "drop-captured-binding");
      let release; const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({initialMic: false, targetMic: true, nativeQueue: ["wait"], nativeGate: gate, touchQueue: ["success"]}, {microphone: mutated});
      const pending = controls.setMicrophoneEnabled(true); for (let turn = 0; turn < 12 && controls.snapshot().nativeCalls === 0; turn += 1) await Promise.resolve(); controls.rollover(); release();
      const result = await pending; const observed = controls.snapshot();
      assert.equal(result, true); assert.equal(observed.touchCalls > 0, true);
      assert.equal(JSON.stringify(observed.touchTargets), JSON.stringify([{roomId: "room-2", userId: "replacement-user"}]));
    },
  },
  {
    code: "ANDROID_MIC_COMPENSATION_ROLLOVER_REPLACEMENT_WRITE",
    custom: async () => {
      let mutated = mutateOnce(microphoneSlice, "          if (!originStillCurrent()) return false;\n          const nativeRestored", "          const nativeRestored", "drop-post-native-compensation-guard");
      mutated = mutateOnce(mutated, `            true,
            originStillCurrent,
            { room: currentRoom, identity: currentIdentity },
          );
          const cameraUnchanged`, `            true,
          );
          const cameraUnchanged`, "drop-compensation-binding");
      let release; const gate = new Promise((resolve) => { release = resolve; });
      const controls = createExactProductPath({
        initialMic: false, targetMic: true, nativeQueue: ["success", "wait"], nativeGates: [undefined, gate],
        touchQueue: ["null", "success"], readbackQueue: ["current", "current"],
      }, {microphone: mutated});
      const pending = controls.setMicrophoneEnabled(true);
      for (let turn = 0; turn < 16 && controls.snapshot().nativeCalls < 2; turn += 1) await Promise.resolve();
      controls.rollover(); release(); const result = await pending; const observed = controls.snapshot();
      assert.equal(result, false);
      assert.equal(observed.touchTargets.some((target) => target.roomId === "room-2" && target.userId === "replacement-user"), true);
    },
  },
];

test("negative-control contract names remain exact", () => {
  assert.deepEqual(contract.convergenceNegativeControls, negativeControls.map(({code}) => code));
});

for (const control of negativeControls) {
  test(`${control.code} executable mutant is rejected`, async () => {
    if (control.custom) return control.custom();
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

test("canonical evidence is deterministic 3/3", async () => {
  const bytes = []; const hashes = []; const counts = [];
  for (let run = 0; run < 3; run += 1) {
    const evidence = [];
    for (const definition of cases.filter(({custom}) => !custom)) {
      const observed = await executeScenario(definition.scenario);
      evidence.push({id: definition.id, result: observed.result, actual: observed.actualMic, durable: observed.membershipMic});
    }
    const canonicalBytes = stable(evidence); bytes.push(canonicalBytes); hashes.push(hash(canonicalBytes)); counts.push(evidence.length);
  }
  assert.equal(new Set(bytes).size, 1); assert.equal(new Set(hashes).size, 1); assert.deepEqual(counts, [counts[0], counts[0], counts[0]]);
});
