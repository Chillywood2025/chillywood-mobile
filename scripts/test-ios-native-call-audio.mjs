import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nativePath = join(root, "modules/chillywood-native-calls/ios");
const coordinator = readFileSync(join(nativePath, "ChillywoodNativeCallCoordinator.swift"), "utf8");
const policy = readFileSync(join(nativePath, "ChillywoodIncomingCallDeadline.swift"), "utf8");
const diagnostics = readFileSync(join(nativePath, "ChillywoodNativeCallDiagnostics.swift"), "utf8");
const harness = readFileSync(join(root, "tests/native/ChillywoodNativeAudioTests.swift"), "utf8");
const compiler = process.env.CHILLYWOOD_SWIFTC
  || (process.env.SWIFT_PATH ? join(process.env.SWIFT_PATH, "swiftc") : "swiftc");
const checkSource = process.argv.includes("--check-source");
assert.ok(process.argv.slice(2).every(arg => arg === "--check-source"), "unknown audio-probe option");
const temporary = mkdtempSync(join(tmpdir(), "chillywood-native-audio-"));

// Same complete-declaration boundary as the existing native deadline probe.
// Actual production source is inserted unchanged; API receipts are controlled.
function declaration(source, marker) {
  assert.equal(source.split(marker).length, 2, `native declaration must be unique: ${marker}`);
  const start = source.indexOf(marker), opening = source.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated actual Swift declaration: ${marker}`);
}
const markers = {
  NATIVE_ERROR: "enum ChillywoodNativeCallError: Error {",
  ACTIVE_CALL: "private struct ActiveNativeCall {",
  PREPARE: "private func prepare() {",
  SET_AUDIO_ROUTE: "public func setAudioRoute(_ route: String) throws {",
  PROVIDER_ACTIVATE: "public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {",
  PROVIDER_DEACTIVATE: "public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {",
  DEACTIVATE_SESSION: "private func deactivateAudioSession() {",
  INTERRUPTION: "private func handleAudioSessionInterruption(_ notification: Notification) {",
  RECORD_ACTIVATION: "private func recordCallKitAudioActivation() {",
  CURRENT_ACTIVATION: "private func hasCurrentCallKitAudioActivation(_ call: ActiveNativeCall) -> Bool {",
  RECOVER_AUDIO_READINESS: "private func recoveredAudioReadiness(_ event: [String: Any]) -> [String: Any] {",
  COMPLETE_ANSWER: "private func completeAnswerOnMain(_ uuid: UUID, connected: Bool, reason: String) {",
  EMIT: "private func emit(type: String, call: ActiveNativeCall, reason: String? = nil) {",
};
function generated(source) {
  let output = harness;
  for (const [key, marker] of Object.entries(markers)) {
    assert.equal(output.split(`// INSERT_${key}`).length, 2, `one ${key} harness seam`);
    output = output.replace(`// INSERT_${key}`, declaration(source, marker));
  }
  assert.doesNotMatch(output, /\/\/ INSERT_/u);
  return `${diagnostics}\n${policy}\n${declaration(source, "private struct NativeVoipAuthority:")}\n${output}`;
}
function runCase(label, source, shouldPass, expectedFailure = null) {
  const main = join(temporary, "main.swift"), executable = join(temporary, label);
  writeFileSync(main, generated(source));
  if (checkSource) return;
  execFileSync(compiler, ["-swift-version", "5", main, "-o", executable], { timeout: 120_000, stdio: "pipe" });
  try {
    const output = execFileSync(executable, { encoding: "utf8", timeout: 20_000, stdio: "pipe" });
    assert.ok(shouldPass, `${label} mutation unexpectedly survived`);
    assert.match(output, /checks PASS/u);
    process.stdout.write(output);
  } catch (error) {
    if (shouldPass || error.status !== 1 || !String(error.stderr).includes("FAIL:")) throw error;
    if (expectedFailure !== null) {
      assert.equal(String(error.stderr).trim(), `FAIL: ${expectedFailure}`,
        `${label} failed for an unrelated reason; its mutation control is not proved`);
    }
    console.log(`Rejected ${label}: ${String(error.stderr).trim()}`);
  }
}
function mutate(from, to) {
  assert.equal(coordinator.split(from).length, 2, `mutation must target one exact production branch: ${from}`);
  return coordinator.replace(from, to);
}
function mutateRoute(from, to) {
  const route = declaration(coordinator, markers.SET_AUDIO_ROUTE);
  assert.equal(route.split(from).length, 2, `route mutation targets one production operation: ${from}`);
  return coordinator.replace(route, route.replace(from, to));
}
function mutateDeclaration(marker, from, to) {
  const original = declaration(coordinator, marker);
  assert.equal(original.split(from).length, 2, `mutation targets one production operation: ${from}`);
  return coordinator.replace(original, original.replace(from, to));
}
try {
  if (!checkSource) {
    const version = execFileSync(compiler, ["--version"], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
    assert.match(version, /\bSwift version \d/u);
    console.log(version.trim());
  }
  runCase("production-audio", coordinator, true);
  runCase("speaker-mapped-to-receiver", mutate("try session.overrideOutputAudioPort(.speaker)", "try session.overrideOutputAudioPort(.none)"), false);
  runCase("override-failure-swallowed", mutate("try session.overrideOutputAudioPort(.speaker)", "try? session.overrideOutputAudioPort(.speaker)"), false);
  runCase("interruption-observer-disconnected", mutate("self?.handleAudioSessionInterruption(notification)", "_ = notification"), false);
  runCase("route-observer-disconnected", mutate('self?.emitRaw(["type": "audioRouteChanged"])', "_ = self"), false);
  runCase("activation-failure-reported-as-success", mutate('emitRaw(["type": "audioSessionFailed"])', 'emitRaw(["type": "audioSessionActivated"])'), false);
  const emit = declaration(coordinator, markers.EMIT);
  const corruptedEmit = emit.replace('"callUuid": call.uuid.uuidString.lowercased(),', '"callUuid": "retired-native-call",');
  assert.notEqual(corruptedEmit, emit);
  runCase("native-event-identity-corrupted", coordinator.replace(emit, corruptedEmit), false);
  runCase("audio-diagnostic-arbitrary-call-binding", mutate(
    "audioSessionDiagnostics.record(.audioActivationReceived)",
    "audioSessionDiagnostics.record(.audioActivationReceived, callUuid: activeCalls.keys.first)"), false);
  runCase("audio-diagnostic-success-disconnected", mutate(
    "audioSessionDiagnostics.record(.audioActivationSucceeded)", "_ = audioSessionDiagnostics"), false);
  runCase("audio-diagnostic-phase-swapped", mutate(
    "audioSessionDiagnostics.record(.audioDeactivationReceived)",
    "audioSessionDiagnostics.record(.audioActivationReceived)"), false);
  runCase("route-request-disconnected", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteSpeakerRequested)", "_ = audioSessionDiagnostics"), false);
  runCase("route-request-mislabeled", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteSpeakerRequested)",
    "audioSessionDiagnostics.record(.audioRouteReceiverRequested)"), false);
  runCase("route-request-after-native-work", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteSpeakerRequested)\n        try session.overrideOutputAudioPort(.speaker)",
    "try session.overrideOutputAudioPort(.speaker)\n        audioSessionDiagnostics.record(.audioRouteSpeakerRequested)"), false);
  runCase("route-success-disconnected", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteSucceeded)", "_ = audioSessionDiagnostics"), false);
  runCase("route-failure-reported-as-success", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteFailed, error: error)",
    "audioSessionDiagnostics.record(.audioRouteSucceeded)"), false);
  runCase("route-failure-code-lost", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteFailed, error: error)",
    "audioSessionDiagnostics.record(.audioRouteFailed)"), false);
  runCase("route-error-object-replaced", mutateRoute(
    "throw error", "throw ChillywoodNativeCallError.unsupportedAudioRoute"), false);
  runCase("route-diagnostic-arbitrary-call-binding", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteSucceeded)",
    "audioSessionDiagnostics.record(.audioRouteSucceeded, callUuid: activeCalls.keys.first)"), false);
  runCase("requested-route-replaces-observation", mutateRoute(
    "outputs[0].portType == .builtInSpeaker", 'route == "speaker"'), false);
  runCase("mixed-output-claimed-as-speaker", mutateRoute(
    "outputs.count == 1 && outputs[0].portType == .builtInSpeaker",
    "outputs.contains { $0.portType == .builtInSpeaker }"), false);
  runCase("receiver-observation-mislabeled", mutateRoute(
    "audioSessionDiagnostics.record(.audioRouteImmediateReceiver)",
    "audioSessionDiagnostics.record(.audioRouteImmediateSpeaker)"), false);
  runCase("activation-owner-recording-disconnected", mutateDeclaration(markers.PROVIDER_ACTIVATE,
    "recordCallKitAudioActivation()", "callKitAudioSessionActive = true"), false,
  "successful activation carries each exact presented call identity");
  runCase("failed-activation-retains-old-owner", mutateDeclaration(markers.PROVIDER_ACTIVATE,
    "callKitAudioSessionActive = false\n    callKitAudioActivationOwners.removeAll()",
    "_ = callKitAudioSessionActive"), false,
  "failed activation cannot preserve earlier positive ownership");
  runCase("activation-generation-not-checked", mutateDeclaration(markers.CURRENT_ACTIVATION,
    "owner.generation == call.generation", "true"), false,
  "same UUID with a different native generation cannot inherit activation");
  runCase("activation-owner-authority-not-checked", mutateDeclaration(markers.CURRENT_ACTIVATION,
    "owner.authority == authority", "true"), false,
  "replacement persisted authority cannot inherit a previous owner's activation");
  runCase("ringing-call-retains-activation-for-later-answer", mutateDeclaration(markers.RECORD_ACTIVATION,
    "call.answered && call.presentationConfirmed", "call.presentationConfirmed"), false,
  "activation cannot record a ringing call for a later Answer");
  runCase("activation-terminal-owner-accepted", mutateDeclaration(markers.CURRENT_ACTIVATION,
    "!isTerminalInvite(call.inviteId)", "true"), false,
  "terminal invite cannot retain native audio readiness");
  runCase("interruption-retains-activation", mutateDeclaration(markers.INTERRUPTION,
    "callKitAudioSessionActive = false\n      callKitAudioActivationOwners.removeAll()",
    "_ = callKitAudioSessionActive"), false,
  "interruption removes current activation ownership");
  runCase("deactivation-retains-activation", mutateDeclaration(markers.DEACTIVATE_SESSION,
    "callKitAudioSessionActive = false\n    callKitAudioActivationOwners.removeAll()",
    "_ = callKitAudioSessionActive"), false,
  "deactivation removes current activation ownership");
  execFileSync(process.execPath, ["scripts/test-ios-native-call-answer-audio.mjs", ...(checkSource ? ["--check-source"] : [])], {
    cwd: root, timeout: 240_000, stdio: "inherit",
  });
  if (checkSource) {
    console.log("Native audio declarations and twenty-eight mutations generated; Swift compilation/execution NOT RUN.");
  } else {
    execFileSync(process.execPath, ["scripts/test-ios-native-call-diagnostics.mjs"], {
      cwd: root, timeout: 180_000, stdio: "inherit",
    });
    execFileSync(process.execPath, ["scripts/test-ios-native-call-report.mjs"], {
      // The report suite compiles production Swift plus nineteen independent
      // mutation controls; retain its per-case limits and allow slow CI hosts
      // to finish the complete suite instead of terminating passing controls.
      cwd: root, timeout: 600_000, stdio: "inherit",
    });
    execFileSync(process.execPath, ["--test", "tests/assurance/ios-native-audio-root-mounted.test.mjs"], {
      cwd: root, timeout: 60_000, stdio: "inherit",
    });
    console.log("Actual Swift audio methods, actual observer closures, and JS root/facade contracts passed. OS receipts are controlled; no hardware route, Bluetooth device, or physical interruption proof is claimed.");
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
