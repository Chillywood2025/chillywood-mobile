import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const diagnostic = readFileSync(join(root, "modules/chillywood-native-calls/ios/ChillywoodNativeCallDiagnostics.swift"), "utf8");
const harness = readFileSync(join(root, "tests/native/ChillywoodNativeCallDiagnosticsTests.swift"), "utf8");
const checkSource = process.argv.includes("--check-source");
assert.ok(process.argv.slice(2).every(arg => arg === "--check-source"));
const compiler = process.env.CHILLYWOOD_SWIFTC || (process.env.SWIFT_PATH ? join(process.env.SWIFT_PATH, "swiftc") : "swiftc");
const temporary = mkdtempSync(join(tmpdir(), "chillywood-native-call-diagnostics-"));
function mutate(from, to) {
  assert.equal(diagnostic.split(from).length, 2, "mutation targets exactly one production operation");
  return diagnostic.replace(from, to);
}
function run(label, source, shouldPass) {
  const main = join(temporary, "main.swift"), executable = join(temporary, label);
  writeFileSync(main, `${source}\n${harness}`);
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
try {
  run("production-diagnostics", diagnostic, true);
  run("gate-bypassed", mutate("guard enabled else { return }", "guard true else { return }"), false);
  run("raw-domain-leaked", mutate('Self.allowedErrorDomains.contains(nativeError.domain) ? nativeError.domain : "other"', "nativeError.domain"), false);
  run("diagnostic-output-disconnected", mutate("emitLine(line)", "_ = line"), false);
  run("wall-clock-replaces-monotonic", mutate("Int64(uptime * 1_000)", "Int64(Date().timeIntervalSince1970 * 1_000)"), false);
  console.log(checkSource
    ? "Native diagnostic source and four negative controls prepared; Apple Swift compilation/execution NOT RUN."
    : "Actual native diagnostic gate/hash/sanitization and four mutation controls passed; OS log delivery remains an installed-device check.");
} finally { rmSync(temporary, { recursive: true, force: true }); }
