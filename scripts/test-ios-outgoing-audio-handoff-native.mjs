import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nativePath = join(root, "modules/chillywood-native-calls/ios");
const source = readFileSync(join(nativePath, "ChillywoodNativeCallCoordinator.swift"), "utf8");
const diagnostics = readFileSync(join(nativePath, "ChillywoodNativeCallDiagnostics.swift"), "utf8");
const harness = readFileSync(join(root, "tests/native/ChillywoodOutgoingAudioHandoffTests.swift"), "utf8");
const compiler = process.env.CHILLYWOOD_SWIFTC
  || (process.env.SWIFT_PATH ? join(process.env.SWIFT_PATH, "swiftc") : "swiftc");
const checkSource = process.argv.includes("--check-source");
assert.ok(process.argv.slice(2).every(arg => arg === "--check-source"));
const temporary = mkdtempSync(join(tmpdir(), "chillywood-outgoing-audio-"));
function declaration(text, marker) {
  assert.equal(text.split(marker).length, 2, `one production declaration: ${marker}`);
  const start = text.indexOf(marker), opening = text.indexOf("{", start);
  let depth = 0;
  for (let i = opening; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Unterminated declaration: ${marker}`);
}
const declarations = [
  "enum ChillywoodNativeCallError: Error {", "private struct NativeVoipAuthority:",
  "private struct OutgoingAudioHandoff {",
];
const members = [
  "private var callKitAudioSessionActive = false {",
  "private var activeCalls: [UUID: ActiveNativeCall] = [:] {",
  "private var pendingIncomingReports: [UUID: PendingIncomingReport] = [:] {",
  "private func isValidVoipAuthority(", "private func toText(",
  "private func invalidateOutgoingAudioHandoff()",
  "private func outgoingAudioHandoffIsAvailable(",
  "public func beginOutgoingAudioHandoff(", "public func prepareOutgoingAudioHandoff(",
  "public func retireOutgoingAudioHandoff(",
  "public func setAudioRoute(_ route: String) throws {",
  "public func providerDidReset(_ provider: CXProvider)",
  "private func stopAllIncomingStateObservers()",
  "private func deactivateAudioSession()",
  "private func handleAudioSessionInterruption(_ notification: Notification)",
];
function generated(text) {
  return diagnostics + "\n" + harness.replace("// INSERT_DECLARATIONS", declarations.map(marker => declaration(text, marker)).join("\n"))
    .replace("// INSERT_MEMBERS", members.map(marker => declaration(text, marker)).join("\n"));
}
function run(label, text, expectedFailure) {
  const main = join(temporary, "main.swift"), executable = join(temporary, label);
  writeFileSync(main, generated(text));
  if (checkSource) return;
  execFileSync(compiler, ["-swift-version", "5", main, "-o", executable], { timeout: 120_000, stdio: "pipe" });
  try {
    const output = execFileSync(executable, { encoding: "utf8", timeout: 20_000, stdio: "pipe" });
    assert.equal(expectedFailure, undefined, `${label} mutation survived`);
    assert.match(output, /checks PASS/u);
    process.stdout.write(output);
  } catch (error) {
    if (expectedFailure === undefined || error.status !== 1) throw error;
    assert.equal(String(error.stderr).trim(), `FAIL: ${expectedFailure}`);
    console.log(`Rejected ${label}: ${expectedFailure}`);
  }
}
function mutation(from, to) {
  assert.equal(source.split(from).length, 2, `one mutation target: ${from}`);
  return source.replace(from, to);
}
try {
  if (!checkSource) {
    execFileSync(compiler, ["-parse", "-swift-version", "5",
      join(nativePath, "ChillywoodNativeCallCoordinator.swift"),
      join(nativePath, "ChillywoodNativeCallsModule.swift")], { timeout: 60_000, stdio: "pipe" });
  }
  run("production", source);
  run("authority-ignored", mutation("persistedVoipAuthority() == handoff.authority", "true"), "changed account authority cannot prepare");
  run("foreground-ignored", mutation("&& UIApplication.shared.applicationState == .active", "&& true"), "background cannot prepare");
  run("retired-owner-ignored", mutation("&& !retiredOutgoingAudioOwners.contains(handoff.owner)", "&& true"), "retire before queued begin prevents resurrection");
  run("callkit-active-ignored", mutation("&& activeCalls.isEmpty && pendingIncomingReports.isEmpty", "&& pendingIncomingReports.isEmpty"), "active native call blocks begin");
  run("callkit-pending-ignored", mutation("&& activeCalls.isEmpty && pendingIncomingReports.isEmpty", "&& activeCalls.isEmpty"), "pending native report blocks begin");
  run("takeover-not-retired", mutation("didSet { if !pendingIncomingReports.isEmpty { invalidateOutgoingAudioHandoff() } }", "didSet {}"), "pending report retires old owner even after report removal");
  run("prepare-activates-session", mutation("outgoingAudioHandoff?.prepared = true", "try AVAudioSession.sharedInstance().setActive(true)\n    outgoingAudioHandoff?.prepared = true"), "category prepare never activates or deactivates audio");
  const prepare = declaration(source, "public func prepareOutgoingAudioHandoff(");
  assert.equal(prepare.split("mode: .voiceChat").length, 2, "one owned outgoing mode selection");
  run("videochat-implicit-speaker-restored", source.replace(prepare,
    prepare.replace("mode: .voiceChat", "mode: handoff.video ? .videoChat : .voiceChat")),
  "video and voice receiver selection can release speaker after outgoing preparation");
  console.log(checkSource ? "Outgoing handoff declarations and eight mutations generated; Swift execution NOT RUN."
    : "Production outgoing handoff guards and eight mutation controls passed; platform API receipts are controlled.");
} finally { rmSync(temporary, { recursive: true, force: true }); }
