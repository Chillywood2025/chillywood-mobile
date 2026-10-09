import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nativePath = join(root, "modules/chillywood-native-calls/ios");
const coordinator = readFileSync(join(nativePath, "ChillywoodNativeCallCoordinator.swift"), "utf8");
const policy = readFileSync(join(nativePath, "ChillywoodIncomingCallDeadline.swift"), "utf8");
const diagnostics = readFileSync(join(nativePath, "ChillywoodNativeCallDiagnostics.swift"), "utf8");
const harness = readFileSync(join(root, "tests/native/ChillywoodIncomingCallDeadlineTests.swift"), "utf8");
// GitHub's Ubuntu image publishes its installed toolchain directory. Prefer
// that explicit compiler to a PATH shim; local callers can still select one.
const compiler = process.env.CHILLYWOOD_SWIFTC
  || (process.env.SWIFT_PATH ? join(process.env.SWIFT_PATH, "swiftc") : "swiftc");
const temporary = mkdtempSync(join(tmpdir(), "chillywood-native-deadline-"));

// Extract complete actual Swift declarations, not a JavaScript reimplementation
// of the policy. CallKit/UIKit cannot run here; its reporting seam is recorded
// by the small Swift probe while the coordinator callback executes unchanged.
function declaration(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing actual native declaration: ${marker}`);
  const opening = source.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated Swift declaration: ${marker}`);
}

const actualCall = `${declaration(coordinator, "private struct NativeVoipAuthority:")}\n${declaration(coordinator, "private struct ActiveNativeCall {")}`;
const actualTimeout = declaration(coordinator, "private func timeoutCall(_ uuid: UUID, generation: UUID) {");
const actualDiagnosticPhase = declaration(diagnostics, "enum ChillywoodNativeCallDiagnosticPhase: String, CaseIterable {");
const incoming = declaration(coordinator, "private func reportIncomingCallOnMain(");
const restore = declaration(coordinator, "private func restoreActiveCallDescriptors() {");
const parseDate = declaration(coordinator, "private func parseServerDate(_ value: Any?) -> Date? {");
const persist = declaration(coordinator, "private func persistActiveCallDescriptors() {");
assert.ok(incoming.includes("ChillywoodIncomingCallDeadline("));
assert.ok(incoming.includes("self.timeoutCall(callUuid, generation: call.generation)"));
assert.ok(restore.includes("ChillywoodIncomingCallDeadline("));
assert.ok(restore.includes("timeoutCall(uuid, generation: restoredCall.generation)"));
assert.ok(!incoming.includes("min(45") && !restore.includes("min(45"), "native paths must not shorten authoritative deadlines");

function runCase(label, sourcePolicy, sourceCallback, shouldPass, expectedFailure = null) {
  const main = join(temporary, "main.swift");
  const executable = join(temporary, label);
  writeFileSync(main, `${sourcePolicy}\n${actualDiagnosticPhase}\n${harness
    .replace("// INSERT_ACTIVE_CALL_DECLARATION", actualCall)
    .replace("// INSERT_DATE_PARSER", parseDate)
    .replace("// INSERT_PERSIST_CALLBACK", persist)
    .replace("// INSERT_RESTORE_CALLBACK", restore)
    .replace("// INSERT_TIMEOUT_CALLBACK", sourceCallback)}`);
  execFileSync(compiler, ["-swift-version", "5", main, "-o", executable], {timeout: 120_000, stdio: "pipe"});
  try {
    const output = execFileSync(executable, {encoding: "utf8", timeout: 15_000, stdio: "pipe"});
    assert.ok(shouldPass, `${label} mutation unexpectedly survived`);
    process.stdout.write(output);
  } catch (error) {
    if (shouldPass || error.status !== 1 || !String(error.stderr).includes("FAIL:")) throw error;
    if (expectedFailure !== null) {
      assert.equal(String(error.stderr).trim(), `FAIL: ${expectedFailure}`,
        `${label} must fail its diagnostic assertion, not an unrelated control`);
    }
    console.log(`Rejected ${label}: ${String(error.stderr).trim()}`);
  }
}

try {
  // A cold hosted runner exceeded the former 15-second startup bound before
  // printing a version. Startup is a toolchain check, not an app deadline.
  // Retry only a killed timeout once; missing/failed compilers still fail
  // immediately, and all production/mutation compiles below remain required.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const version = execFileSync(compiler, ["--version"], {
        encoding: "utf8", stdio: "pipe", timeout: 60_000, killSignal: "SIGKILL",
      });
      assert.match(version, /\bSwift version \d/u, "selected compiler must identify its Swift version");
      console.log(`Native deadline compiler: ${compiler}\n${version.trim()}`);
      break;
    } catch (error) {
      if (error.code !== "ETIMEDOUT" || attempt === 2) throw error;
      console.warn("Swift compiler startup timed out after 60 seconds; retrying once before failing closed.");
    }
  }
  // Parse the complete production files too. This is syntax verification only,
  // not an Apple SDK compile or a claim about installed CallKit behavior.
  execFileSync(compiler, ["-parse", "-swift-version", "5",
    join(nativePath, "ChillywoodIncomingCallDeadline.swift"),
    join(nativePath, "ChillywoodNativeCallCoordinator.swift")], {timeout: 60_000, stdio: "pipe"});
  runCase("production", policy, actualTimeout, true);
  const capped = policy.replace("min(Self.maximumAcceptedFutureInterval, remaining)", "min(45, remaining)");
  assert.notEqual(capped, policy);
  runCase("45-second-cap", capped, actualTimeout, false);
  const wallClockOnly = policy.replace("min(expiresAt.timeIntervalSince(now), uptimeDeadline - uptime)", "expiresAt.timeIntervalSince(now)");
  assert.notEqual(wallClockOnly, policy);
  runCase("wall-clock-only", wallClockOnly, actualTimeout, false);
  const wrongOwner = actualTimeout.replace("ownsCall: call.generation == generation", "ownsCall: true");
  assert.notEqual(wrongOwner, actualTimeout);
  runCase("retired-timer", policy, wrongOwner, false);
  const pendingAnswer = actualTimeout.replace("answerPending: pendingAnswerActions[uuid] != nil", "answerPending: false");
  assert.notEqual(pendingAnswer, actualTimeout);
  runCase("pending-answer-expiry", policy, pendingAnswer, false);
  const diagnosticCall = "ChillywoodNativeCallDiagnostics.shared.record(.ringingTimedOut, callUuid: uuid)";
  assert.equal(actualTimeout.split(diagnosticCall).length, 2, "one actual ringing-timeout diagnostic operation");
  runCase("timeout-diagnostic-disconnected", policy, actualTimeout.replace(diagnosticCall, "_ = uuid"), false,
    "actual expired-owner callback records one exact ringing timeout diagnostic");
  runCase("timeout-diagnostic-wrong-owner", policy, actualTimeout.replace(diagnosticCall,
    "ChillywoodNativeCallDiagnostics.shared.record(.ringingTimedOut, callUuid: UUID())"), false,
    "actual expired-owner callback records one exact ringing timeout diagnostic");
  const earlyDiagnostic = actualTimeout.replace(diagnosticCall, "_ = uuid")
    .replace("switch deadline.wakeup(", `${diagnosticCall}\n    switch deadline.wakeup(`);
  assert.notEqual(earlyDiagnostic, actualTimeout);
  runCase("timeout-diagnostic-before-expiry", policy, earlyDiagnostic, false,
    "an early callback cannot report a ringing timeout diagnostic");
  console.log("Swift deadline/callback behavior and seven mutation controls passed; Apple SDK/physical qualification remains separate.");
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
