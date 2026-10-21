import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { formatRuntimeProbeFailure, MAX_PROBE_STDERR_BYTES } from "../scripts/lib/runtime-probe-diagnostics.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const format = (stderr, overrides = {}) => formatRuntimeProbeFailure({
  status: 1, signal: null, stderr, ...overrides,
});
const stderrOf = (message) => message.split("\nstderr:\n")[1];

test("safe status, signal and error code remain actionable without other process data", () => {
  const runtime = {
    status: null,
    signal: "SIGTERM",
    error: {
      code: "ETIMEDOUT",
      get message() { throw new Error("must not inspect error.message"); },
    },
    stderr: "error: module download failed\nretry later",
    get stdout() { throw new Error("must not inspect stdout"); },
    get env() { throw new Error("must not inspect environment"); },
  };
  const message = formatRuntimeProbeFailure(runtime);
  assert.match(message, /status=null; signal=SIGTERM; error.code=ETIMEDOUT/);
  assert.match(message, /error: module download failed\nretry later$/);
  assert.match(format("", { error: { code: "ENOENT" } }), /error.code=ENOENT/);
  assert.match(format("", { error: { code: "ENOBUFS" } }), /error.code=ENOBUFS/);
  const unsafe = format("", {
    status: "synthetic_status_secret", signal: "synthetic_signal_secret",
    error: { code: "synthetic_error_secret", message: "synthetic_message_secret" },
  });
  assert.match(unsafe, /status=null; signal=unknown; error.code=unknown/);
  assert.doesNotMatch(unsafe, /synthetic/);
});

test("credential-bearing lines are removed in full, not just their value", () => {
  for (const line of [
    "before API_KEY=synthetic_value after",
    "before SUPABASE_SERVICE_ROLE_KEY: synthetic_value after",
    'before {"password":"synthetic_value"} after',
    "before PGPASSWORD=synthetic_value after",
    "before session_token=synthetic_value after",
    "before Authorization: Bearer synthetic_value after",
    "before Basic INERT_TEST_VALUE after",
    "before Set-Cookie: id=synthetic_value after",
    "before credentials: synthetic_value after",
    "before DATABASE_URL=synthetic_value after",
    "before private-key=synthetic_value after",
    'before {"SIGNING_KEY":"synthetic_value"} after',
    "before NPM_CONFIG__AUTH=synthetic_value after",
  ]) {
    assert.equal(stderrOf(format(line)), "[redacted credential-bearing line]");
  }
});

test("full URLs, including userinfo, query strings and fragments, are removed", () => {
  for (const url of [
    "https://synthetic-user:synthetic-pass@example.test/path?q=synthetic-query#synthetic-fragment",
    "postgresql://synthetic-user:synthetic-pass@example.test/database",
    "https://example.test/path?signature=synthetic-query#synthetic-fragment",
    "HTTPS://example.test/synthetic-path?q=synthetic-query",
    "file:///synthetic-private-directory/module.ts",
  ]) {
    const message = format(`error: import failed at ${url}`);
    assert.doesNotMatch(message, /synthetic|example\.test|:\/\//);
    assert.match(message, /\[redacted (?:URL|credential-bearing line)\]/);
  }
  assert.equal(stderrOf(format("error: import failed at https://example.test/mod.ts")), "error: import failed at [redacted URL]");
});

// Provider-format, unlabeled token fixtures are deliberately omitted: realistic
// secret-shaped literals are not acceptable source fixtures. These inert values
// cover credential-label redaction, not provider full-format token detection.
test("provider-labelled inert placeholders cause whole-line redaction", () => {
  for (const label of [
    "NPM_TOKEN", "GITHUB_TOKEN", "OPENAI_API_KEY", "STRIPE_API_KEY",
    "SUPABASE_SECRET_KEY", "WEBHOOK_SECRET", "SLACK_TOKEN",
    "AWS_ACCESS_KEY_ID", "GOOGLE_API_KEY", "OAUTH_TOKEN", "JWT_TOKEN",
  ]) {
    assert.equal(stderrOf(format(`before ${label}=INERT_TEST_VALUE after`)), "[redacted credential-bearing line]");
  }
});

test("PEM blocks are removed across lines, including an incomplete block", () => {
  for (const label of ["PRIVATE KEY", "RSA PRIVATE KEY", "OPENSSH PRIVATE KEY", "CERTIFICATE"]) {
    const message = format(`error before\n-----BEGIN ${label}-----\nsynthetic_line_one\nsynthetic_line_two\n-----END ${label}-----\nerror after`);
    assert.equal(stderrOf(message), "error before\n[redacted PEM block]\nerror after");
  }
  assert.equal(stderrOf(format("before\n-----BEGIN PRIVATE KEY-----\nsynthetic_unterminated")), "before\n[redacted PEM block]");
});

test("terminal and formatting controls cannot hide credential labels or inject output", () => {
  assert.equal(stderrOf(format("\u001b[31merror\u001b[0m: unavailable\u0007\u0000\r\nnext")), "error: unavailable\nnext");
  for (const control of ["\u001b[31m", "\u0000", "\u0008", "\u0009", "\u200b", "\u202e"]) {
    assert.equal(stderrOf(format(`API_${control}KEY=synthetic_value`)), "[redacted credential-bearing line]");
  }
  const hyperlink = format("\u001b]8;;https://example.test/?q=synthetic_hidden\u0007visible\u001b]8;;\u0007");
  assert.equal(stderrOf(hyperlink), "visible");
  assert.doesNotMatch(hyperlink, /synthetic|[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
});

test("stderr is byte-bounded only after full redaction, without splitting UTF-8", () => {
  for (const size of [MAX_PROBE_STDERR_BYTES - 1, MAX_PROBE_STDERR_BYTES, MAX_PROBE_STDERR_BYTES + 1, 1024 * 1024]) {
    const stderr = stderrOf(format("a".repeat(size)));
    assert.ok(Buffer.byteLength(stderr) <= MAX_PROBE_STDERR_BYTES);
    assert.equal(stderr.includes("[stderr truncated]"), size > MAX_PROBE_STDERR_BYTES);
    if (size <= MAX_PROBE_STDERR_BYTES) assert.equal(stderr, "a".repeat(size));
  }
  for (const char of ["é", "東", "🎬"]) {
    const stderr = stderrOf(format(char.repeat(MAX_PROBE_STDERR_BYTES)));
    assert.ok(Buffer.byteLength(stderr) <= MAX_PROBE_STDERR_BYTES);
    assert.ok(stderr.endsWith("\n[stderr truncated]"));
    assert.doesNotMatch(stderr, /\ufffd/);
  }
  const lateLabel = `synthetic_private_value ${"a".repeat(MAX_PROBE_STDERR_BYTES)} API_KEY=other_value`;
  assert.equal(stderrOf(format(lateLabel)), "[redacted credential-bearing line]");
  const longUrl = `error at https://example.test/${"a".repeat(MAX_PROBE_STDERR_BYTES)}?q=synthetic_value`;
  assert.equal(stderrOf(format(longUrl)), "error at [redacted URL]");
  const longPem = `-----BEGIN PRIVATE KEY-----\n${"a".repeat(MAX_PROBE_STDERR_BYTES)}\n-----END PRIVATE KEY-----`;
  assert.equal(stderrOf(format(longPem)), "[redacted PEM block]");
});

test("empty or unavailable stderr remains an explicit, bounded diagnostic", () => {
  for (const value of ["", " \r\n ", null, undefined]) {
    assert.equal(stderrOf(format(value)), "[empty]");
  }
});

function runGuardWithStub(t, { status, stdout = "", stderr = "" }) {
  const temporary = mkdtempSync(path.join(tmpdir(), "runtime-probe-diagnostics-test-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const fixture = path.join(temporary, "fixture");
  const bin = path.join(temporary, "bin");
  const scratch = path.join(temporary, "tmp");
  for (const directory of [fixture, bin, scratch]) mkdirSync(directory);
  for (const relative of [
    "_lib/cognitivePlatformFoundation.ts",
    "_lib/cognitivePolicyEngine.ts",
    "config/intelligence/cognitive-security-classification-policy.json",
    "config/intelligence/cognitive-security-regression-corpus.json",
    "supabase/tests/cognitive_security_policy_parity_test.sql",
  ]) {
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(root, relative), destination);
  }
  const observationPath = path.join(temporary, "invocation.json");
  writeFileSync(path.join(bin, "deno"), `#!${process.execPath}\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(observationPath)}, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));\nprocess.stdout.write(${JSON.stringify(stdout)});\nprocess.stderr.write(${JSON.stringify(stderr)});\nprocess.exitCode = ${status};\n`, { mode: 0o700 });
  const result = spawnSync(process.execPath, [path.join(root, "scripts/guard-cognitive-security-policy-parity.mjs")], {
    cwd: fixture,
    env: { PATH: bin, TMPDIR: scratch },
    encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(JSON.parse(readFileSync(observationPath, "utf8")), {
    args: ["run", "--quiet", "--no-lock", "--node-modules-dir=auto", "scripts/cognitive-security-runtime-probe.ts"],
    cwd: fixture,
  });
  return result;
}

test("actual guard still fails on exit 1 and emits only safe bounded diagnostics", { skip: process.platform === "win32" }, (t) => {
  const result = runGuardWithStub(t, {
    status: 1,
    stdout: "synthetic_stdout_not_for_logs",
    stderr: "error: download unavailable\nAPI_KEY=synthetic_key_not_for_logs\nhttps://synthetic-user:synthetic-pass@example.test/?q=synthetic-query\n" + "a".repeat(10_000),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Deno runtime policy probe must pass \(status=1/);
  assert.match(result.stderr, /error: download unavailable/);
  assert.match(result.stderr, /\[stderr truncated\]/);
  assert.doesNotMatch(result.stderr + result.stdout, /synthetic|example\.test/);
  assert.doesNotMatch(result.stdout, /passed/);
});

test("actual guard still rejects parity mismatches after exit 0", { skip: process.platform === "win32" }, (t) => {
  const result = runGuardWithStub(t, { status: 0, stdout: "[]" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TypeScript source and Deno runtime classifications must match/);
  assert.doesNotMatch(result.stderr, /Deno runtime policy probe must pass/);
  assert.doesNotMatch(result.stdout, /passed/);
});

test("actual guard still rejects invalid JSON after exit 0", { skip: process.platform === "win32" }, (t) => {
  const result = runGuardWithStub(t, { status: 0, stdout: "not-json" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SyntaxError/);
  assert.doesNotMatch(result.stdout, /passed/);
});
