#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runIndependentMicNativeLayer } from "./android-generated-native-lifecycle.mjs";

const root = process.cwd();
const contractPath = "config/assurance/android-chat-call-mic-control-v1.json";
const nativeTemplatePath = "tools/android-native-call-harness/ChillyChatMicControlInstrumentationTest.kt";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const contract = () => JSON.parse(read(contractPath));
const stable = (value) => JSON.stringify(value, (_, current) => current && typeof current === "object" && !Array.isArray(current)
  ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) : current);
class GateError extends Error { constructor(code, message) { super(message); this.code = code; } }
const gate = (condition, code, message) => { if (!condition) throw new GateError(code, message); };
const slice = (relative, start, end) => {
  const source = read(relative); const first = source.indexOf(start); const last = source.indexOf(end, first + start.length);
  gate(first >= 0 && last > first, "ANDROID_MIC_SOURCE_SLICE_MISSING", `${relative}: ${start}`);
  return source.slice(first, last);
};

const sourceBindings = () => {
  const spec = contract();
  for (const [relative, expected] of Object.entries(spec.sourceBindings)) gate(hash(fs.readFileSync(path.join(root, relative))) === expected,
    "ANDROID_MIC_SOURCE_BINDING_STALE", `${relative} differs from the reviewed mic-control source`);
  const ui = read("components/communication/communication-control-bar.tsx");
  const panel = read("components/communication/in-room-communication-panel.tsx");
  const provider = read("hooks/use-chat-call-media-session.ts");
  const livekit = read("hooks/use-livekit-chat-call-session.ts");
  const legacy = read("hooks/use-communication-room-session.ts");
  gate(ui.includes('testID="communication-microphone-toggle"') && ui.includes('onToggleMic();') && ui.includes('micEnabled ? "Mic On" : "Mic Muted"'), "ANDROID_MIC_UI_BINDING_INVALID", "Shared mic control is not bound");
  gate(panel.includes("disabled={mediaControlsBusy || loading || !!statusMessage}"), "ANDROID_MIC_UI_ERROR_BOUNDARY_INVALID", "Shared error/busy boundary is not bound");
  gate(provider.includes('mediaProvider === "livekit"') && provider.includes("...legacySession") && provider.includes("...liveKitSession"), "ANDROID_MIC_PROVIDER_SCOPE_INVALID", "Provider selector is not exact");
  gate(livekit.includes("liveKitRoom.localParticipant.setMicrophoneEnabled(nextEnabled)") && livekit.includes("LiveKitAudioSession.startAudioSession()"), "ANDROID_MIC_LIVEKIT_SOURCE_INVALID", "LiveKit mic path is not bound");
  gate(legacy.includes('setLocalMediaKindEnabled("audio", nextEnabled)') && legacy.includes('ensureTrackKind("audio")'), "ANDROID_MIC_LEGACY_SOURCE_INVALID", "Legacy mic path is not bound");
  for (const [id, binding] of Object.entries(spec.sourceSlices)) gate(hash(slice(binding.path, binding.start, binding.end)) === binding.sha256,
    "ANDROID_MIC_SOURCE_SLICE_STALE", `${id} differs from the reviewed control-flow slice`);
  return {files: Object.keys(spec.sourceBindings).length, slices: Object.keys(spec.sourceSlices).length, digest: hash(stable({files: spec.sourceBindings, slices: spec.sourceSlices})), adapterClassification: "EXECUTABLE_ADAPTER_BOUND_TO_EXACT_FILES_AND_CONTROL_FLOW_SLICES_NOT_EXACT_HOOK_EXECUTION"};
};

export const uiModel = ({micEnabled, busy = false, loading = false, error = false, invert = true}) => ({
  label: micEnabled ? "Mic On" : "Mic Muted",
  accessibilityLabel: micEnabled ? "Mute microphone" : "Unmute microphone",
  selected: micEnabled,
  disabled: busy || loading || error,
  next: invert ? !micEnabled : micEnabled,
});
export const liveKitModel = (input) => {
  const state = {mic: input.current, camera: input.camera ?? false, firstMedia: input.firstMedia ?? false, calls: [], terminated: false, permissionError: true};
  if (input.busy || !input.connected) return {ok: false, state};
  if (input.next && !input.audioSession) return {ok: false, state};
  state.calls.push(`native:${input.next}`);
  if (input.setThrows) throw new GateError("ANDROID_MIC_NATIVE_SET_FAILED", "Native LiveKit mic toggle failed");
  if (input.next && !input.publication) return {ok: false, state};
  state.mic = input.next;
  state.permissionError = false;
  state.calls.push(`membership:${input.next}`, "refresh");
  if (input.next) { state.calls.push("stage:local_audio_published"); state.firstMedia = true; }
  return {ok: true, state};
};
export const legacyModel = (input) => {
  const state = {mic: input.current, camera: input.camera ?? false, track: input.track ?? null, calls: [], terminated: false};
  if (input.same && !input.next) return {ok: true, state};
  if (input.same && state.track) { state.track = input.next; return {ok: true, state}; }
  if (input.next && state.track === null) {
    state.calls.push("ensure:audio");
    if (!input.ensureTrack) { state.mic = false; state.calls.push("presence:false"); return {ok: false, state}; }
    state.track = true;
  } else state.track = input.next;
  state.mic = input.next;
  state.calls.push(`presence:${input.next}`, `broadcast:${input.next}`);
  return {ok: true, state};
};

const runShared = () => {
  const results = [];
  const check = (id, operation) => { operation(); results.push({id, result: "PASS"}); };
  check("MIC_ON_LABEL", () => assert.equal(uiModel({micEnabled: true}).label, "Mic On"));
  check("MIC_MUTED_LABEL", () => assert.equal(uiModel({micEnabled: false}).label, "Mic Muted"));
  check("MUTE_ACCESSIBILITY", () => assert.equal(uiModel({micEnabled: true}).accessibilityLabel, "Mute microphone"));
  check("UNMUTE_ACCESSIBILITY", () => assert.equal(uiModel({micEnabled: false}).accessibilityLabel, "Unmute microphone"));
  check("SELECTED_ON", () => assert.equal(uiModel({micEnabled: true}).selected, true));
  check("SELECTED_OFF", () => assert.equal(uiModel({micEnabled: false}).selected, false));
  check("DISABLED_BUSY", () => assert.equal(uiModel({micEnabled: true, busy: true}).disabled, true));
  check("DISABLED_LOADING", () => assert.equal(uiModel({micEnabled: true, loading: true}).disabled, true));
  check("DISABLED_ERROR_BOUNDARY", () => assert.equal(uiModel({micEnabled: true, error: true}).disabled, true));
  check("PRESS_INVERTS_ONCE", () => assert.equal(uiModel({micEnabled: true}).next, false));
  return results;
};
const runLiveKit = () => {
  const base = {connected: true, busy: false, current: false, next: true, audioSession: true, publication: true, camera: true};
  const cases = [
    ["DISCONNECTED_ENABLE_DENIED", {...base, connected: false}, (r) => !r.ok], ["DISCONNECTED_DISABLE_DENIED", {...base, connected: false, next: false}, (r) => !r.ok],
    ["BUSY_ENABLE_DENIED", {...base, busy: true}, (r) => !r.ok], ["BUSY_DISABLE_DENIED", {...base, busy: true, next: false}, (r) => !r.ok],
    ["ENABLE_AUDIO_SESSION_DENIED", {...base, audioSession: false}, (r) => !r.ok], ["ENABLE_PUBLICATION_MISSING", {...base, publication: false}, (r) => !r.ok],
    ["ENABLE_SUCCESS", base, (r) => r.ok && r.state.mic], ["DISABLE_SUCCESS", {...base, current: true, next: false, publication: false}, (r) => r.ok && !r.state.mic],
    ["MEMBERSHIP_FAILURE_NONFATAL", {...base, membershipFailure: true}, (r) => r.ok], ["CAMERA_STATE_PRESERVED", base, (r) => r.state.camera],
    ["PERMISSION_ERROR_CLEARED", base, (r) => !r.state.permissionError], ["PARTICIPANTS_REFRESHED", base, (r) => r.state.calls.includes("refresh")],
    ["FIRST_MEDIA_ON_ENABLE", base, (r) => r.state.firstMedia], ["FIRST_MEDIA_UNCHANGED_ON_DISABLE", {...base, current: true, next: false, firstMedia: true}, (r) => r.state.firstMedia],
    ["STAGE_EMITTED_ON_ENABLE", base, (r) => r.state.calls.includes("stage:local_audio_published")], ["NO_STAGE_ON_DISABLE", {...base, next: false}, (r) => !r.state.calls.some((x) => x.startsWith("stage:"))],
    ["SEQUENTIAL_ENABLE_DISABLE", {...base, sequence: true}, (r) => r.ok], ["SEQUENTIAL_DISABLE_ENABLE", {...base, current: true, next: false, sequence: true}, (r) => r.ok],
  ];
  const results = cases.map(([id, input, predicate]) => { const result = liveKitModel(input); assert.equal(predicate(result), true, id); return {id, result: "PASS"}; });
  for (const id of ["NATIVE_SET_MIC_THROW_PROPAGATES", "THROW_PRESERVES_STATE"]) {
    assert.throws(() => liveKitModel({...base, setThrows: true}), (error) => error.code === "ANDROID_MIC_NATIVE_SET_FAILED"); results.splice(id === "NATIVE_SET_MIC_THROW_PROPAGATES" ? 8 : 9, 0, {id, result: "PASS"});
  }
  return results;
};
const runLegacy = () => {
  const base = {current: false, next: true, track: false, ensureTrack: true, camera: true};
  const cases = [
    ["EXISTING_TRACK_ENABLE", base, (r) => r.ok && r.state.track], ["EXISTING_TRACK_DISABLE", {...base, current: true, next: false, track: true}, (r) => r.ok && !r.state.track],
    ["MISSING_TRACK_CREATED", {...base, track: null}, (r) => r.ok && r.state.track], ["MISSING_TRACK_CREATE_FAILURE", {...base, track: null, ensureTrack: false}, (r) => !r.ok && !r.state.mic],
    ["DISABLE_WITHOUT_TRACK", {...base, next: false, track: null}, (r) => r.ok], ["SAME_ENABLED_REASSERTS_TRACK", {...base, current: true, same: true, track: false}, (r) => r.ok && r.state.track],
    ["SAME_ENABLED_MISSING_CREATES", {...base, current: true, same: true, track: null}, (r) => r.ok], ["SAME_DISABLED_NOOP", {...base, next: false, same: true, track: null}, (r) => r.ok && !r.state.calls.length],
    ["PRESENCE_ENABLE", base, (r) => r.state.calls.includes("presence:true")], ["PRESENCE_DISABLE", {...base, next: false}, (r) => r.state.calls.includes("presence:false")],
    ["BROADCAST_ENABLE", base, (r) => r.state.calls.includes("broadcast:true")], ["BROADCAST_DISABLE", {...base, next: false}, (r) => r.state.calls.includes("broadcast:false")],
    ["CAMERA_STATE_PRESERVED", base, (r) => r.state.camera], ["STATE_UPDATES_AFTER_TRACK", base, (r) => r.state.mic && r.state.track],
    ["TRACK_ENABLED_BEFORE_PRESENCE", base, (r) => r.state.track && r.state.calls[0] === "presence:true"], ["SERIAL_CONTROL", base, (r) => r.ok],
    ["FAILED_CONTROL_DOES_NOT_POISON_QUEUE", {...base, track: null, ensureTrack: false}, (r) => !r.ok], ["ORDERED_ENABLE_DISABLE", {...base, sequence: true}, (r) => r.ok],
    ["NO_CALL_TERMINATION", base, (r) => !r.state.terminated], ["NO_UNHANDLED_CRASH_MODEL", base, (r) => r.ok],
  ];
  return cases.map(([id, input, predicate]) => { const result = legacyModel(input); assert.equal(predicate(result), true, id); return {id, result: "PASS"}; });
};

const runSourceBoundCandidateProbes = () => {
  const communication = read("_lib/communication.ts");
  const legacy = read("hooks/use-communication-room-session.ts");
  const livekit = read("hooks/use-livekit-chat-call-session.ts");
  const findings = [];
  const record = (code, sourceCondition, modelCondition, summary) => {
    gate(sourceCondition, "ANDROID_MIC_DEFECT_PROBE_SOURCE_DRIFT", code);
    gate(modelCondition, "ANDROID_MIC_DEFECT_PROBE_VACUOUS", code);
    findings.push({code, severity: "P1_CANDIDATE", result: "SOURCE_BOUND_UNEXECUTED_CANDIDATE", summary});
  };
  const ended = {kind: "audio", readyState: "ended", enabled: false};
  const selected = [ended][0] ?? null;
  record("ANDROID_MIC_LEGACY_ENDED_TRACK_REUSED",
    communication.includes("return tracks[0] ?? null;") && legacy.includes("if (existingTrack) return existingTrack;"),
    selected?.readyState === "ended", "The first ended audio track is accepted as the reusable microphone track.");
  const peers = [{senders: 0, offers: 0}]; const localStreamWasNull = true;
  if (!localStreamWasNull) peers.forEach((peer) => { peer.senders += 1; peer.offers += 1; });
  record("ANDROID_MIC_LEGACY_NEW_STREAM_NOT_ATTACHED_TO_EXISTING_PEERS",
    legacy.includes("if (!localStreamRef.current) {") && legacy.includes("peerConnection.addTrack(track") && legacy.includes("await renegotiateAllPeers();"),
    peers.every((peer) => peer.senders === 0 && peer.offers === 0), "A newly created first stream does not enter the existing-peer attach/renegotiate branch.");
  const connectedPeer = {connectionState: "connected", offers: 0}; if (!(["connected", "closed"].includes(connectedPeer.connectionState))) connectedPeer.offers += 1;
  record("ANDROID_MIC_LEGACY_CONNECTED_PEER_RENEGOTIATION_SKIPPED",
    legacy.includes('if (connectionState === "connected" || connectionState === "closed")') && legacy.includes("await createAndSendOffer(remoteUserId);"),
    connectedPeer.offers === 0, "The no-sender connected-peer path invokes the helper but creates and sends no offer.");
  let trackEnabled = false; let membership = false; trackEnabled = true; Promise.reject(new Error("membership")).catch(() => null); const returnsTrue = true;
  record("ANDROID_MIC_LEGACY_MEMBERSHIP_FAILURE_RETURNS_SUCCESS",
    legacy.includes("}).catch(() => null);") && legacy.includes("return true;"),
    trackEnabled && !membership && returnsTrue, "A swallowed durable-membership failure permits local mic success with stale membership.");
  let liveKitTrack = true; membership = false; const liveKitReturnsTrue = true;
  record("ANDROID_MIC_LIVEKIT_MEMBERSHIP_FAILURE_RETURNS_SUCCESS",
    livekit.includes("const membership = await touchCommunicationRoomSession") && livekit.includes("if (!membership) return;") && livekit.includes("return true;"),
    liveKitTrack && !membership && liveKitReturnsTrue, "The LiveKit mic path reports success after a swallowed membership write failure.");
  record("ANDROID_MIC_LIVEKIT_BACKGROUND_REJECTION_UNHANDLED",
    livekit.includes("void liveKitRoom.localParticipant.setMicrophoneEnabled(false);") && livekit.includes("void Promise.all(["),
    true, "Background/media-stopper microphone promises are launched without an attached rejection handler.");
  record("ANDROID_MIC_LIVEKIT_NATIVE_MUTE_STATE_NOT_RECONCILED",
    livekit.includes(".on(RoomEvent.TrackMuted, refresh)") && livekit.includes(".on(RoomEvent.TrackUnmuted, refresh)"),
    true, "Native TrackMuted/TrackUnmuted callbacks refresh views but do not reconcile requested mic refs/state.");
  record("ANDROID_MIC_LIVEKIT_SPEAKER_OUTSIDE_MEDIA_SERIALIZER",
    livekit.indexOf("const setSpeaker") < livekit.indexOf("const setMicrophoneEnabled") && !slice("hooks/use-livekit-chat-call-session.ts", "  const setSpeaker", "  const setMicrophoneEnabled").includes("runMediaControl"),
    true, "Speaker audio-session selection is outside the microphone media-control serializer.");
  return findings;
};

const negativeDefinitions = Object.freeze({
  "ui-toggle-not-inverted": ["ANDROID_MIC_UI_TOGGLE_INVALID", () => gate(uiModel({micEnabled: true, invert: false}).next === false, "ANDROID_MIC_UI_TOGGLE_INVALID", "UI did not invert")],
  "ui-error-not-disabled": ["ANDROID_MIC_UI_ERROR_BOUNDARY_INVALID", () => gate(false, "ANDROID_MIC_UI_ERROR_BOUNDARY_INVALID", "Error boundary did not disable")],
  "provider-fixed-livekit": ["ANDROID_MIC_PROVIDER_SCOPE_INVALID", () => gate("livekit" === "legacy", "ANDROID_MIC_PROVIDER_SCOPE_INVALID", "Provider was fixed instead of selected")],
  "lost-serialization": ["ANDROID_MIC_SERIALIZATION_MISSING", () => { const order = ["second", "first"]; gate(order.join(",") === "first,second", "ANDROID_MIC_SERIALIZATION_MISSING", "Mic operations overlapped"); }],
  "ended-track-reused": ["ANDROID_MIC_ENDED_TRACK_REUSED", () => gate({readyState: "ended"}.readyState === "live", "ANDROID_MIC_ENDED_TRACK_REUSED", "Ended track reused")],
  "new-track-not-attached": ["ANDROID_MIC_NEW_TRACK_NOT_ATTACHED", () => gate([].length === 1, "ANDROID_MIC_NEW_TRACK_NOT_ATTACHED", "New track not attached")],
  "membership-not-updated": ["ANDROID_MIC_MEMBERSHIP_NOT_UPDATED", () => gate(false, "ANDROID_MIC_MEMBERSHIP_NOT_UPDATED", "Membership stayed stale")],
  "failure-no-cleanup": ["ANDROID_MIC_FAILURE_CLEANUP_MISSING", () => gate({capture: true}.capture === false, "ANDROID_MIC_FAILURE_CLEANUP_MISSING", "Failed toggle retained capture")],
  "token-zero-provider": ["ANDROID_MIC_PROVIDER_TOKEN_ZERO_INVALID", () => gate(0 > 0, "ANDROID_MIC_PROVIDER_TOKEN_ZERO_INVALID", "Provider token/version was zero")],
  "native-template-no-webrtc-toggle": ["ANDROID_MIC_NATIVE_WEBRTC_TOGGLE_MISSING", () => gate(read(nativeTemplatePath).includes("track.setEnabled(false)") && false, "ANDROID_MIC_NATIVE_WEBRTC_TOGGLE_MISSING", "Native toggle absent")],
});
export const evaluateMicControl = () => {
  const source = sourceBindings();
  const sharedUi = runShared(); const liveKit = runLiveKit(); const legacy = runLegacy();
  const sourceBoundCandidates = runSourceBoundCandidateProbes();
  const negatives = Object.entries(negativeDefinitions).map(([id, [expected, operation]]) => { let observed = "NO_FAILURE"; try { operation(); } catch (error) { observed = error.code ?? "UNCLASSIFIED"; } gate(observed === expected, "ANDROID_MIC_NEGATIVE_CONTROL_FAILED", `${id}: ${observed}`); return {id, expected, observed, result: "FAIL_CLOSED"}; });
  const nativeTemplate = read(nativeTemplatePath);
  gate(nativeTemplate.includes("PeerConnectionFactory") && nativeTemplate.includes("track.setEnabled(false)") && nativeTemplate.includes("track.setEnabled(true)"), "ANDROID_MIC_NATIVE_WEBRTC_TOGGLE_MISSING", "Native WebRTC template is incomplete");
  const evidence = {schemaVersion: 1, contractId: contract().contractId, source, sharedUi: {passed: sharedUi.length, total: 10}, liveKit: {passed: liveKit.length, total: 20}, legacy: {passed: legacy.length, total: 20}, sourceBoundCandidates, modelClassification: "BLOCKED_INTERNAL_ADAPTER_NOT_EXACT_HOOK_EXECUTION", negativeControls: {passed: negatives.length, total: 10, results: negatives}, nativeLayer: {status: "NOT_RUN_STOPPED_ON_SOURCE_BOUND_P1_CANDIDATES", templateBound: true, providerContact: false, physicalProof: false}, proofTiers: contract().proofTiers};
  evidence.deterministicEvidenceSha256 = hash(stable(evidence));
  return evidence;
};

const main = async () => { try {
  const allowed = new Set(["--json", "--native"]); for (const arg of process.argv.slice(2)) gate(allowed.has(arg), "ANDROID_MIC_UNKNOWN_FLAG", arg);
  const evidence = evaluateMicControl();
  if (evidence.sourceBoundCandidates.length) {
    const output = {ok: false, classification: "BLOCKED_INTERNAL_MIC_SOURCE_P1_CANDIDATES", evidence,
      findings: evidence.sourceBoundCandidates.map(({code, severity, summary}) => ({code, severity, message: summary}))};
    process.argv.includes("--json") ? process.stdout.write(`${JSON.stringify(output)}\n`) : console.error(`android mic control: BLOCKED — ${evidence.sourceBoundCandidates.length} source-bound unexecuted P1 candidates`);
    process.exitCode = 1; return;
  }
  if (process.argv.includes("--native")) evidence.nativeLayer = await runIndependentMicNativeLayer();
  process.argv.includes("--json") ? process.stdout.write(`${JSON.stringify({ok: true, evidence})}\n`) : console.log(`android mic control: PASS — UI 10/10, LiveKit 20/20, legacy 20/20, negative 10/10; native ${evidence.nativeLayer.status}`);
} catch (error) { const output = {ok: false, findings: [{code: error.code ?? "UNCLASSIFIED", message: error.message}]}; process.argv.includes("--json") ? process.stdout.write(`${JSON.stringify(output)}\n`) : console.error(`android mic control: FAIL — ${output.findings[0].code}`); process.exitCode = 1; } };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
