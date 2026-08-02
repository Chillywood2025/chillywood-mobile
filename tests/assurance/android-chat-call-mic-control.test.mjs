#!/usr/bin/env node

import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { classifyMicEvidence, evaluateMicControl, legacyModel, liveKitModel, uiModel } from "../../scripts/assurance/android-chat-call-mic-control.mjs";
import { assertCompleteMicNativeAudioMatrix, evaluateMicNativeAudioMatrix, runIndependentMicNativeLayer } from "../../scripts/assurance/android-generated-native-lifecycle.mjs";

const contract = JSON.parse(fs.readFileSync("config/assurance/android-chat-call-mic-control-v1.json", "utf8"));
assert.equal(contract.contractId, "android-chat-call-mic-control-v1");
assert.equal(contract.sharedUiCases.length, 10);
assert.equal(contract.liveKitCases.length, 20);
assert.equal(contract.legacyCases.length, 20);
assert.equal(Object.keys(contract.negativeControls).length, 10);
assert.equal(Object.keys(contract.sourceBindings).length, 8);
assert.equal(Object.keys(contract.sourceSlices).length, 5);
assert.equal(contract.proofTiers.T2_MODEL, "BLOCKED_INTERNAL_ADAPTER_NOT_EXACT_HOOK_EXECUTION");
const mandatedNegativeCodes = [
  "ANDROID_MIC_TOGGLE_UNHANDLED_REJECTION", "ANDROID_MIC_FAILURE_TERMINATES_CALL", "ANDROID_MIC_DUPLICATE_AUDIO_TRACK",
  "ANDROID_MIC_TRACK_RESTORE_FAILED", "ANDROID_MIC_NATIVE_AUDIO_FATAL", "ANDROID_MIC_CONTROL_SERIALIZATION_BYPASSED",
  "ANDROID_MIC_MEMBERSHIP_TRACK_MISMATCH", "ANDROID_MIC_TOGGLE_TOKEN_AUTHORITY_VIOLATION",
  "ANDROID_MIC_TOGGLE_PROVIDER_IMMUTABILITY_VIOLATION", "PLATFORM_PROOF_SCOPE_MISMATCH",
];
assert.deepEqual(Object.values(contract.negativeControls), mandatedNegativeCodes);

const runs = [evaluateMicControl(), evaluateMicControl(), evaluateMicControl()];
for (const evidence of runs) {
  assert.deepEqual(evidence.sharedUi, {passed: 10, total: 10});
  assert.deepEqual(evidence.liveKit, {passed: 20, total: 20});
  assert.deepEqual(evidence.legacy, {passed: 20, total: 20});
  assert.equal(evidence.negativeControls.passed, 10);
  assert.deepEqual(evidence.negativeControls.results.map(({observed}) => observed), mandatedNegativeCodes);
  assert.equal(evidence.negativeControls.results.every(({mutationExercised, proof}) => mutationExercised && proof === "ADAPTER_ANTI_VACUITY"), true);
  assert.equal(evidence.sourceBoundCandidates.length, 8);
  assert.equal(evidence.modelClassification, "BLOCKED_INTERNAL_ADAPTER_NOT_EXACT_HOOK_EXECUTION");
  assert.equal(evidence.nativeLayer.status, "NOT_RUN_NATIVE_AUDIO_MATRIX_INCOMPLETE");
  assert.equal(evidence.nativeLayer.fatalLogcatScan, "NOT_RUN");
}
assert.equal(new Set(runs.map((run) => run.deterministicEvidenceSha256)).size, 1);

assert.deepEqual(uiModel({micEnabled: true, error: true}), {
  label: "Mic On", accessibilityLabel: "Mute microphone", selected: true, disabled: true, next: false,
});
assert.equal(liveKitModel({connected: false, current: false, next: true}).ok, false);
assert.throws(() => liveKitModel({connected: true, current: false, next: true, audioSession: true, publication: true, setThrows: true}),
  (error) => error.code === "ANDROID_MIC_NATIVE_SET_FAILED");
assert.equal(legacyModel({current: false, next: true, track: null, ensureTrack: false}).ok, false);

assert.equal(classifyMicEvidence({sourceBoundCandidates: [], modelClassification: "BLOCKED_INTERNAL_ADAPTER_NOT_EXACT_HOOK_EXECUTION", nativeLayer: {status: "NOT_RUN"}}), "BLOCKED_INTERNAL_MIC_MODEL");
assert.equal(classifyMicEvidence({sourceBoundCandidates: [], modelClassification: "MODEL_CLEAR", nativeLayer: {status: "NOT_RUN_NATIVE_AUDIO_MATRIX_INCOMPLETE"}}), "BLOCKED_INTERNAL_MIC_NATIVE_LAYER");
const audioMatrix = evaluateMicNativeAudioMatrix();
assert.equal(audioMatrix.complete, false);
assert.equal(audioMatrix.required.length, 14);
assert.equal(audioMatrix.missing.includes("FATAL_LOGCAT_SCAN"), true);
assert.throws(() => assertCompleteMicNativeAudioMatrix(audioMatrix), (error) => error.code === "ANDROID_MIC_NATIVE_AUDIO_MATRIX_INCOMPLETE");
assert.throws(() => runIndependentMicNativeLayer(), (error) => error.code === "ANDROID_MIC_NATIVE_AUDIO_MATRIX_INCOMPLETE");

const cli = childProcess.spawnSync(process.execPath, ["scripts/assurance/android-chat-call-mic-control.mjs", "--json"], {encoding: "utf8"});
assert.equal(cli.status, 1); assert.equal(JSON.parse(cli.stdout).classification, "BLOCKED_INTERNAL_MIC_SOURCE_P1_CANDIDATES");
const nativeCli = childProcess.spawnSync(process.execPath, ["scripts/assurance/android-chat-call-mic-control.mjs", "--native", "--json"], {encoding: "utf8"});
assert.equal(nativeCli.status, 1); assert.equal(JSON.parse(nativeCli.stdout).classification, "BLOCKED_INTERNAL"); assert.equal(JSON.parse(nativeCli.stdout).findings[0].code, "ANDROID_MIC_NATIVE_AUDIO_MATRIX_INCOMPLETE");
const unknown = childProcess.spawnSync(process.execPath, ["scripts/assurance/android-chat-call-mic-control.mjs", "--unknown", "--json"], {encoding: "utf8"});
assert.equal(unknown.status, 1); assert.equal(JSON.parse(unknown.stdout).findings[0].code, "ANDROID_MIC_UNKNOWN_FLAG");

const nativeTemplate = fs.readFileSync("tools/android-native-call-harness/ChillyChatMicControlInstrumentationTest.kt", "utf8");
for (const marker of ["PeerConnectionFactory", "createAudioSource", "createAudioTrack", "track.setEnabled(false)", "track.setEnabled(true)", "repeat(20)", "audioToggleDoesNotCreateVideoOrNetworkAuthority"]) {
  assert.equal(nativeTemplate.includes(marker), true, marker);
}

console.log("android mic-control source-bound adapter tests passed (UI 10/10; LiveKit 20/20; legacy 20/20; mandated adapter anti-vacuity 10/10; deterministic 3/3; native audio matrix incomplete before compile/install; 8 unexecuted P1 candidates preserved)");
