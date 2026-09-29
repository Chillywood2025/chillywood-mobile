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
  EMIT: "private func emit(type: String, call: ActiveNativeCall, reason: String? = nil) {",
};
function generated(source) {
  let output = harness;
  for (const [key, marker] of Object.entries(markers)) {
    assert.equal(output.split(`// INSERT_${key}`).length, 2, `one ${key} harness seam`);
    output = output.replace(`// INSERT_${key}`, declaration(source, marker));
  }
  assert.doesNotMatch(output, /\/\/ INSERT_/u);
  return `${policy}\n${output}`;
}
function runCase(label, source, shouldPass) {
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
    console.log(`Rejected ${label}: ${String(error.stderr).trim()}`);
  }
}
function mutate(from, to) {
  assert.equal(coordinator.split(from).length, 2, `mutation must target one exact production branch: ${from}`);
  return coordinator.replace(from, to);
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
  if (checkSource) {
    console.log("Native audio declarations and six mutations generated; Swift compilation/execution NOT RUN.");
  } else {
    execFileSync(process.execPath, ["--test", "tests/assurance/ios-native-audio-root-mounted.test.mjs"], {
      cwd: root, timeout: 60_000, stdio: "inherit",
    });
    console.log("Actual Swift audio methods, actual observer closures, and JS root/facade contracts passed. OS receipts are controlled; no hardware route, Bluetooth device, or physical interruption proof is claimed.");
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
