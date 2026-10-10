import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nativePath = join(root, "modules/chillywood-native-calls/ios");
let checkSource = false;
let sourceOverride = process.env.CHILLYWOOD_NATIVE_ANSWER_AUDIO_SOURCE || "";
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--check-source") checkSource = true;
  else if (arg === "--source") {
    assert.ok(process.argv[index + 1] && !process.argv[index + 1].startsWith("--"), "--source requires a coordinator file");
    sourceOverride = process.argv[++index];
  } else throw new Error("unknown Answer-audio probe option");
}
const coordinator = readFileSync(sourceOverride ? resolve(sourceOverride)
  : join(nativePath, "ChillywoodNativeCallCoordinator.swift"), "utf8");
const policy = readFileSync(join(nativePath, "ChillywoodIncomingCallDeadline.swift"), "utf8");
const diagnostics = readFileSync(join(nativePath, "ChillywoodNativeCallDiagnostics.swift"), "utf8");
const harness = readFileSync(join(root, "tests/native/ChillywoodNativeAnswerAudioTests.swift"), "utf8");
const compiler = process.env.CHILLYWOOD_SWIFTC
  || (process.env.SWIFT_PATH ? join(process.env.SWIFT_PATH, "swiftc") : "swiftc");
const temporary = mkdtempSync(join(tmpdir(), "chillywood-native-answer-audio-"));

// Insert entire unchanged production declarations. Platform API and diagnostic
// output boundaries are controlled; the Answer decision is never reimplemented.
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
  AUTHORITY: "private struct NativeVoipAuthority:",
  COMPLETE_ANSWER: "private func completeAnswerOnMain(_ uuid: UUID, connected: Bool, reason: String) {",
  REMOVE_CALL: "private func removeCall(_ uuid: UUID,",
  PERSIST_CALLS: "private func persistActiveCallDescriptors() {",
  EMIT: "private func emit(type: String, call: ActiveNativeCall, reason: String? = nil) {",
};
function generated(source) {
  let output = harness;
  const declarations = Object.fromEntries(Object.entries(markers).map(([key, marker]) => [key, declaration(source, marker)]));
  declarations.DIAGNOSTIC_PHASE = declaration(diagnostics, "enum ChillywoodNativeCallDiagnosticPhase:");
  for (const [key, actual] of Object.entries(declarations)) {
    assert.equal(output.split(`// INSERT_${key}\n`).length, 2, `one ${key} harness seam`);
    output = output.replace(`// INSERT_${key}\n`, `${actual}\n`);
  }
  assert.doesNotMatch(output, /\/\/ INSERT_/u);
  return `${policy}\n${output}`;
}
function runCase(label, source, expectedFailure = null) {
  const main = join(temporary, "main.swift"), executable = join(temporary, label);
  writeFileSync(main, generated(source));
  if (checkSource) return;
  execFileSync(compiler, ["-swift-version", "5", main, "-o", executable], { timeout: 120_000, stdio: "pipe" });
  try {
    const output = execFileSync(executable, { encoding: "utf8", timeout: 20_000, stdio: "pipe" });
    assert.equal(expectedFailure, null, `${label} mutation unexpectedly survived`);
    assert.match(output, /checks PASS/u);
    process.stdout.write(output);
  } catch (error) {
    if (expectedFailure === null || error.status !== 1) throw error;
    const actualFailure = String(error.stderr).trim();
    assert.equal(actualFailure, `FAIL: ${expectedFailure}`,
      `${label} failed for an unrelated reason; mutation control is not proved`);
    console.log(`Rejected ${label}: ${actualFailure}`);
  }
}
function mutate(from, to) {
  const original = declaration(coordinator, markers.COMPLETE_ANSWER);
  assert.equal(original.split(from).length, 2, `mutation targets one exact Answer operation: ${from}`);
  return coordinator.replace(original, original.replace(from, to));
}
const category = "try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat,\n          options: [.allowBluetoothHFP, .allowBluetoothA2DP])";
try {
  if (!checkSource) {
    const version = execFileSync(compiler, ["--version"], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
    assert.match(version, /\bSwift version \d/u);
    console.log(version.trim());
  }
  // An external baseline runs the identical assertions and must fail normally;
  // only current production receives mutations tied to the repaired branch.
  runCase(sourceOverride ? "external-answer-audio" : "production-answer-audio", coordinator);
  if (!sourceOverride) {
    runCase("configuration-disconnected", mutate(category, "_ = AVAudioSession.sharedInstance()"),
      "Answer configures audio before fulfillment");
    const delayedConfiguration = mutate(category, "_ = AVAudioSession.sharedInstance()");
    const method = declaration(delayedConfiguration, markers.COMPLETE_ANSWER);
    assert.equal(method.split("action.fulfill()").length, 2);
    runCase("configuration-after-fulfillment", delayedConfiguration.replace(method,
      method.replace("action.fulfill()", `action.fulfill()\n      try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat,\n        options: [.allowBluetoothHFP, .allowBluetoothA2DP])`)),
    "Answer configures audio before fulfillment");
    runCase("configuration-failure-swallowed", mutate("answerReady = false", "answerReady = connected"),
      "category failure fails the Answer and removes call ownership");
    runCase("premature-session-activation", mutate(category, `${category}\n        try AVAudioSession.sharedInstance().setActive(true)`),
      "Answer preparation must not activate the audio session");
    runCase("disconnected-answer-configures-audio", mutate("if connected {", "if true {"),
      "disconnected completion skips audio configuration");
  }
  console.log(checkSource
    ? `Answer-audio production declarations${sourceOverride ? "" : " and five mutations"} generated; Swift compilation/execution NOT RUN.`
    : `Actual Swift Answer audio ordering/failure${sourceOverride ? "" : " and five mutation controls"} passed; controlled receipts do not prove OS activation or physical audio.`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
