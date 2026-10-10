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
const harness = readFileSync(join(root, "tests/native/ChillywoodNativeIncomingReportTests.swift"), "utf8");
const checkSource = process.argv.includes("--check-source");
assert.ok(process.argv.slice(2).every(arg => arg === "--check-source"), "unknown incoming-report probe option");
const compiler = process.env.CHILLYWOOD_SWIFTC
  || (process.env.SWIFT_PATH ? join(process.env.SWIFT_PATH, "swiftc") : "swiftc");
const temporary = mkdtempSync(join(tmpdir(), "chillywood-native-incoming-report-"));

// Insert complete, unchanged production declarations. Only the platform API
// receipts are controlled; no presentation, authority, or settlement policy is
// reimplemented by the probe.
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
  PENDING_REPORT: "private struct PendingIncomingReport {",
  FOREGROUND_ENTRY: "public func reportForegroundIncomingCall(",
  FOREGROUND_PAYLOAD: "private func foregroundIncomingPayload(",
  REQUEST_ANSWER: "public func requestAnswer(callUuid: String, inviteId: String) async throws {",
  START_REGISTRATION: "public func startVoipRegistration(",
  START_REGISTRY: "private func startVoipRegistrationOnMain() {",
  RECOVER_CONFIRMED: "private func recoverConfirmedIncomingCallsOnMain() {",
  RECOVER_AUDIO_READINESS: "private func recoveredAudioReadiness(_ event: [String: Any]) -> [String: Any] {",
  RECORD_ACTIVATION: "private func recordCallKitAudioActivation() {",
  CURRENT_ACTIVATION: "private func hasCurrentCallKitAudioActivation(_ call: ActiveNativeCall) -> Bool {",
  PROVIDER_ACTIVATE: "public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {",
  PROVIDER_DEACTIVATE: "public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {",
  DEACTIVATE_SESSION: "private func deactivateAudioSession() {",
  INTERRUPTION: "private func handleAudioSessionInterruption(_ notification: Notification) {",
  DRAIN_EVENTS: "public func drainPendingEvents() -> [[String: Any]] {",
  REPLAY_TOKEN: "private func emitCurrentVoipTokenOnMain() {",
  REPORT: "private func reportIncomingCallOnMain(",
  DUPLICATE_PUSH_REPORT: "private func reportDuplicateVoipPushOnMain(",
  SETTLE_REPORT: "private func settleIncomingReport(",
  DRAIN_REPORTS: "private func drainIncomingReports() {",
  REMOVE_CALL: "private func removeCall(_ uuid: UUID,",
  RESET_ACCOUNT: "private func resetAccountContextOnMain() {",
  RESET_PROVIDER: "public func providerDidReset(_ provider: CXProvider) {",
  TERMINAL: "private func handleTerminalVoipAction(",
  RESOLVE_UUID: "private func resolveCallUuid(",
  FIND_CALL: "private func findActiveCall(",
  PUSH: "public func pushRegistry(\n    _ registry: PKPushRegistry,\n    didReceiveIncomingPushWith payload: PKPushPayload,",
  NORMALIZE_ACTION: "private func normalizedCallAction(_ payload: [String: Any]) -> String {",
  ACTION_LABEL: "private func callActionLabel(_ payload: [String: Any]) -> String {",
  TIMEOUT: "private func timeoutCall(_ uuid: UUID, generation: UUID) {",
  PERSIST_CALLS: "private func persistActiveCallDescriptors() {",
  RESTORE_CALLS: "private func restoreActiveCallDescriptors() {",
  VALID_AUTHORITY: "private func isValidVoipAuthority(_ authority: NativeVoipAuthority) -> Bool {",
  READ_AUTHORITY: "private func persistedVoipAuthority() -> NativeVoipAuthority? {",
  WRITE_AUTHORITY: "private func persistVoipAuthority(_ authority: NativeVoipAuthority) {",
  MATCH_AUTHORITY: "private func voipPayloadMatchesPersistedAuthority(_ payload: [String: Any]) -> Bool {",
  PARSE_DATE: "private func parseServerDate(_ value: Any?) -> Date? {",
  PARSE_FOREGROUND_DATE: "private func parseForegroundServerDate(_ text: String) -> Date? {",
  TO_TEXT: "private func toText(_ value: Any?) -> String {",
  EMIT: "private func emit(type: String, call: ActiveNativeCall, reason: String? = nil) {",
  EMIT_RAW: "private func emitRaw(_ event: [String: Any]) {",
};
function generated(source) {
  let output = harness;
  for (const [key, marker] of Object.entries(markers)) {
    assert.equal(output.split(`// INSERT_${key}\n`).length, 2, `one ${key} harness seam`);
    output = output.replace(`// INSERT_${key}\n`, `${declaration(source, marker)}\n`);
  }
  assert.doesNotMatch(output, /\/\/ INSERT_/u);
  return `${diagnostics}\n${policy}\n${output}`;
}
function runCase(label, source, expectedFailure = null) {
  const main = join(temporary, "main.swift"), executable = join(temporary, label);
  writeFileSync(main, generated(source));
  if (checkSource) return;
  execFileSync(compiler, ["-swift-version", "5", main, "-o", executable], { timeout: 120_000, stdio: "pipe" });
  try {
    const output = execFileSync(executable, { encoding: "utf8", timeout: 30_000, stdio: "pipe" });
    assert.equal(expectedFailure, null, `${label} mutation unexpectedly survived`);
    assert.match(output, /checks PASS/u);
    process.stdout.write(output);
  } catch (error) {
    if (expectedFailure === null || error.status !== 1) throw error;
    const actualFailure = String(error.stderr).trim();
    assert.equal(actualFailure, `FAIL: ${expectedFailure}`,
      `${label} failed for an unrelated reason; its mutation control is not proved`);
    console.log(`Rejected ${label}: ${actualFailure}`);
  }
}
function mutateDeclaration(marker, from, to) {
  const original = declaration(coordinator, marker);
  assert.equal(original.split(from).length, 2, `mutation must target one exact production branch: ${from}`);
  return coordinator.replace(original, original.replace(from, to));
}

try {
  if (!checkSource) {
    const version = execFileSync(compiler, ["--version"], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
    assert.match(version, /\bSwift version \d/u);
    console.log(version.trim());
  }
  runCase("production-incoming-report", coordinator);
  runCase("push-duplicates-skip-required-report", mutateDeclaration(markers.PUSH,
    "requiresPushReport: true", "requiresPushReport: false"),
  "confirmed foreground then PushKit must issue a second report before completing the push");
  runCase("push-duplicate-error-domain-ignored", mutateDeclaration(markers.DUPLICATE_PUSH_REPORT,
    "nativeError.domain == CXErrorDomainIncomingCall", "true"),
  "only exact duplicate success plus confirmed original ownership may acknowledge");
  runCase("push-duplicate-borrows-replacement-generation", mutateDeclaration(markers.DUPLICATE_PUSH_REPORT,
    "current?.generation == call.generation", "true"),
  "retired or unobserved ownership cannot authorize late duplicate acknowledgement");
  runCase("terminal-push-skips-failed-report", mutateDeclaration(markers.PUSH,
    "self.reportInvalidVoipPushOnMain(completion: completion)", "completion()"),
  "legacy terminal push retains failed-report obligation regardless of prior call inventory");
  runCase("terminal-uuid-borrows-another-invite", mutateDeclaration(markers.TERMINAL,
    "call.inviteId == inviteId", "true"),
  "terminal UUID lookup cannot override exact invite, thread, media type, or native authority");
  runCase("pending-duplicate-premature-success", mutateDeclaration(markers.REPORT,
    "if let completion { pending.completions.append(completion) }",
    "if let completion { completion(nil) }"),
  "pending duplicate cannot settle before CallKit callback");
  runCase("incoming-report-error-swallowed", mutateDeclaration(markers.REPORT,
    "if let error {\n          self.failPendingAnswer(callUuid)",
    "if let error, false {\n          self.failPendingAnswer(callUuid)"),
  "duplicate report never reverses original presentation failure");
  runCase("retired-report-generation-accepted", mutateDeclaration(markers.REPORT,
    "current.generation == call.generation", "true"),
  "retired generation callback cannot settle, confirm, or end its replacement");
  runCase("pending-report-persisted-as-confirmed", mutateDeclaration(markers.PERSIST_CALLS,
    "activeCalls.values.filter { $0.presentationConfirmed }", "activeCalls.values"),
  "pending presentation never becomes recovered state after process restart");
  runCase("background-foreground-request-accepted", mutateDeclaration(markers.FOREGROUND_PAYLOAD,
    "guard UIApplication.shared.applicationState == .active else", "guard true else"),
  "inactive/background foreground request is rejected");
  runCase("account-reset-leaves-report-waiters", mutateDeclaration(markers.RESET_ACCOUNT,
    "drainIncomingReports()", "_ = pendingIncomingReports"),
  "account replacement drains old presentation and retires its registry before registering the new owner");
  runCase("foreground-manufactures-presentation-ack", mutateDeclaration(markers.REPORT,
    'self.emit(type: "incoming", call: current)',
    'self.acknowledgeIncomingCallPresentation(payload: payload, callUuid: callUuid, inviteId: inviteId)\n        self.emit(type: "incoming", call: current)'),
  "shared foreground report never creates an APNs acknowledgment");
  runCase("answer-accepts-pending-presentation", mutateDeclaration(markers.REQUEST_ANSWER,
    "let call = self.activeCalls[uuid], call.presentationConfirmed,",
    "let call = self.activeCalls[uuid],"),
  "unconfirmed presentation cannot submit a native Answer transaction");
  runCase("registration-recovery-disconnected", mutateDeclaration(markers.START_REGISTRATION,
    "self.recoverConfirmedIncomingCallsOnMain()", "_ = self"),
  "same-authority registration restores confirmed native ownership without another CallKit report");
  runCase("registration-current-token-replay-disconnected", mutateDeclaration(markers.START_REGISTRATION,
    "self.emitCurrentVoipTokenOnMain()", "_ = self"),
  "same-authority rebind replays the actual current registry token");
  runCase("queued-activation-recheck-disconnected", mutateDeclaration(markers.EMIT_RAW,
    "if isAudioActivation && !self.hasCurrentCallKitAudioActivation(call) { return }",
    "_ = isAudioActivation"),
  "queued positive activation cannot survive deactivation before delivery");
  runCase("positive-activation-persisted", mutateDeclaration(markers.EMIT_RAW,
    "if isAudioActivation { return }", "_ = isAudioActivation"),
  "listener absence cannot persist or queue a historical positive activation");
  runCase("positive-activation-replayed-from-storage", mutateDeclaration(markers.DRAIN_EVENTS,
    'events.filter { $0["type"] as? String != "audioSessionActivated" }', "events"),
  "draining rejects historical positive activation from both durable and memory queues");
  runCase("recovered-readiness-clearing-disconnected", mutateDeclaration(markers.RECOVER_AUDIO_READINESS,
    'current["audioSessionActive"] = false', '_ = current["audioSessionActive"]'),
  "queued recovered presentation recomputes readiness after deactivation before delivery");
  console.log(checkSource
    ? "Native incoming-report declarations and nineteen mutations generated; Swift compilation/execution NOT RUN."
    : "Actual Swift incoming presentation/authority/terminal callbacks and nineteen mutation controls passed; controlled CallKit receipts do not prove physical presentation or media.");
} finally { rmSync(temporary, { recursive: true, force: true }); }
