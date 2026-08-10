#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { ROOT, emit, readJson, stableJson } from "./lib.mjs";
import { git, privateArtifactDirectory, redactText, sha256, sha40, strictOptions, writePrivateFile } from "./efficiency-lib.mjs";

function parseResult(contract, stdout, status) {
  if (!contract?.type) return { ok: false, category: "RESULT_CONTRACT_MISSING" };
  if (contract.type === "assurance-json-v1") {
    const lines = stdout.split(/\r?\n/u).filter((line) => line.trim());
    if (lines.length !== 1) return { ok: false, category: lines.length ? "RESULT_AMBIGUOUS" : "RESULT_MISSING" };
    let value;
    try { value = JSON.parse(lines[0]); } catch { return { ok: false, category: "RESULT_UNPARSEABLE" }; }
    if (value?.command !== contract.command || value?.ok !== true) return { ok: false, category: "RESULT_ASSERTION_FAILED" };
    return { ok: true, value: { command: value.command, ok: true }, results: 1, assertions: 1 };
  }
  if (contract.type === "node-test-tap-v1") {
    const read = (label) => [...stdout.matchAll(new RegExp(`^# ${label} (\\d+)$`, "gmu"))];
    const tests = read("tests"); const pass = read("pass"); const fail = read("fail");
    if ([tests, pass, fail].some((matches) => matches.length !== 1)) return { ok: false, category: "RESULT_AMBIGUOUS_OR_MISSING" };
    const result = { tests: Number(tests[0][1]), pass: Number(pass[0][1]), fail: Number(fail[0][1]) };
    if (result.tests < 1 || result.pass !== result.tests || result.fail !== 0) return { ok: false, category: "RESULT_ASSERTION_FAILED" };
    return { ok: true, value: result, results: result.tests, assertions: result.pass };
  }
  if (contract.type === "node-version-v1") {
    const value = stdout.trim();
    if (!/^v\d+\.\d+\.\d+$/u.test(value)) return { ok: false, category: "RESULT_UNPARSEABLE" };
    return { ok: true, value: { version: value }, results: 1, assertions: 1 };
  }
  if (contract.type === "exit-zero-empty-v1") {
    if (status !== 0 || stdout.length !== 0) return { ok: false, category: stdout.length ? "RESULT_AMBIGUOUS" : "RESULT_ASSERTION_FAILED" };
    return { ok: true, value: { exitStatus: 0, stdoutEmpty: true }, results: 1, assertions: 1 };
  }
  if (contract.type === "exit-zero-v1") {
    if (status !== 0) return { ok: false, category: "RESULT_ASSERTION_FAILED" };
    return { ok: true, value: { exitStatus: 0 }, results: 1, assertions: 1 };
  }
  return { ok: false, category: "RESULT_CONTRACT_UNKNOWN" };
}

function externalize(identityHash, receipt, raw) {
  const root = privateArtifactDirectory("receipts", identityHash);
  writePrivateFile(root, "receipt.json", `${stableJson(receipt)}\n`);
  writePrivateFile(root, "command.log", raw);
  return root;
}

const canonicalRules = new Map([
  { id: "contracts", contractCommand: "node scripts/assurance/validate-contracts.mjs", file: "node", args: ["scripts/assurance/validate-contracts.mjs"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:validate-contracts" } },
  { id: "current-truth", contractCommand: "node scripts/assurance/current-truth.mjs", file: "node", args: ["scripts/assurance/current-truth.mjs"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:current-truth" } },
  { id: "plan", contractCommand: "node scripts/assurance/plan.mjs --feature=assurance-efficiency-e0", file: "node", args: ["scripts/assurance/plan.mjs", "--feature=assurance-efficiency-e0"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:plan" } },
  { id: "active-task", contractCommand: "node scripts/assurance/active-task.mjs --feature=assurance-efficiency-e0", file: "node", args: ["scripts/assurance/active-task.mjs", "--feature=assurance-efficiency-e0"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:active-task" } },
  { id: "review-history", contractCommand: "node scripts/assurance/review-history.mjs", file: "node", args: ["scripts/assurance/review-history.mjs"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:review-history" } },
  { id: "benchmark", contractCommand: "node scripts/assurance/benchmark.mjs --baseline=all", file: "node", args: ["scripts/assurance/benchmark.mjs", "--baseline=all"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:benchmark" } },
  { id: "focused-test", contractCommand: "node --test tests/assurance/efficiency-e0.test.mjs", file: "node", args: ["--test", "tests/assurance/efficiency-e0.test.mjs"], timeoutMs: 30000, resultContract: { type: "node-test-tap-v1" } },
  { id: "github-main-ruleset-readback-test", contractCommand: "node --test tests/assurance/github-main-ruleset-readback.test.mjs", file: "node", args: ["--test", "tests/assurance/github-main-ruleset-readback.test.mjs"], timeoutMs: 30000, resultContract: { type: "node-test-tap-v1" } },
  { id: "codex-review-exact-head-test", contractCommand: "node --test tests/assurance/codex-review-exact-head.test.mjs", file: "node", args: ["--test", "tests/assurance/codex-review-exact-head.test.mjs"], timeoutMs: 30000, resultContract: { type: "node-test-tap-v1" } },
  { id: "s0-plan", contractCommand: "node scripts/assurance/plan.mjs --feature=codex-security-scan-reliability-s0", file: "node", args: ["scripts/assurance/plan.mjs", "--feature=codex-security-scan-reliability-s0"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:plan" } },
  { id: "s0-active-task", contractCommand: "node scripts/assurance/active-task.mjs --feature=codex-security-scan-reliability-s0", file: "node", args: ["scripts/assurance/active-task.mjs", "--feature=codex-security-scan-reliability-s0"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:active-task" } },
  { id: "s0-scope", contractCommand: "node scripts/assurance/pr-scope.mjs --feature=codex-security-scan-reliability-s0 --waiver=config/assurance/codex-security-reliability-s0-scope-waiver-v1.json", file: "node", args: ["scripts/assurance/pr-scope.mjs", "--feature=codex-security-scan-reliability-s0", "--waiver=config/assurance/codex-security-reliability-s0-scope-waiver-v1.json"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:pr-scope" } },
  { id: "s0-target", contractCommand: "node scripts/assurance/codex-security-target.mjs --base=origin/main --target=HEAD", file: "node", args: ["scripts/assurance/codex-security-target.mjs", "--base=origin/main", "--target=HEAD"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:codex-security-target" } },
  { id: "s0-benchmark", contractCommand: "node scripts/assurance/codex-security-reliability.mjs --benchmark=all", file: "node", args: ["scripts/assurance/codex-security-reliability.mjs", "--benchmark=all"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:codex-security-reliability" } },
  { id: "s0-focused-test", contractCommand: "node --test tests/assurance/codex-security-reliability-s0.test.mjs", file: "node", args: ["--test", "tests/assurance/codex-security-reliability-s0.test.mjs"], timeoutMs: 30000, resultContract: { type: "node-test-tap-v1" } },
  { id: "lint", contractCommand: "npm run lint", file: "npm", args: ["run", "lint"], timeoutMs: 120000, resultContract: { type: "exit-zero-v1" } },
  { id: "typecheck", contractCommand: "npm run typecheck", file: "npm", args: ["run", "typecheck"], timeoutMs: 120000, resultContract: { type: "exit-zero-v1" } },
  { id: "diff-check", contractCommand: "git diff --check", file: "git", args: ["diff", "--check"], timeoutMs: 30000, resultContract: { type: "exit-zero-empty-v1" } },
  { id: "node-version", contractCommand: "node --version", file: "node", args: ["--version"], timeoutMs: 10000, resultContract: { type: "node-version-v1" } },
  { id: "d2a-call-semantics", contractCommand: "npm run test:chilly-chat-call-semantics", file: "npm", args: ["run", "test:chilly-chat-call-semantics"], timeoutMs: 120000, resultContract: { type: "exit-zero-v1" } },
  { id: "d2a-native-handoff", contractCommand: "npm run test:chilly-chat-native-call-action-handoff", file: "npm", args: ["run", "test:chilly-chat-native-call-action-handoff"], timeoutMs: 120000, resultContract: { type: "exit-zero-v1" } },
  { id: "d2a-plan", contractCommand: "assurance:plan", file: "node", args: ["scripts/assurance/plan.mjs", "--feature=chilly-chat-call-lifecycle"], timeoutMs: 30000, resultContract: { type: "assurance-json-v1", command: "assurance:plan" } }
].map((rule) => [rule.id, rule]));

function safeRule(rule) {
  const canonical = canonicalRules.get(rule?.id);
  return canonical !== undefined && stableJson(rule) === stableJson(canonical);
}

export function runReceipt(allowlist, id, suppliedArgs = [], dependencies = {}) {
  const matches = allowlist.commands?.filter((item) => item.id === id) ?? [];
  if (matches.length !== 1) return { ok: false, finding: matches.length ? "COMMAND_ID_AMBIGUOUS" : "COMMAND_NOT_ALLOWLISTED" };
  const rule = matches[0];
  if (!safeRule(rule) || !Number.isInteger(rule.timeoutMs) || rule.timeoutMs < 1 || rule.timeoutMs > 900000) {
    return { ok: false, finding: "COMMAND_CONTRACT_INVALID" };
  }
  if (!Array.isArray(suppliedArgs) || suppliedArgs.some((value) => typeof value !== "string")) {
    return { ok: false, finding: "COMMAND_ARGUMENTS_INVALID" };
  }
  if (stableJson(suppliedArgs) !== stableJson(rule.args)) return { ok: false, finding: "COMMAND_NOT_ALLOWLISTED" };
  if (!rule.resultContract) return { ok: false, finding: "RESULT_CONTRACT_REQUIRED" };

  let sourceHead; let sourceTree;
  try {
    if (!dependencies.sourceHead && git(["status", "--porcelain"])) return { ok: false, finding: "SOURCE_WORKTREE_NOT_IMMUTABLE" };
    sourceHead = dependencies.sourceHead ?? git(["rev-parse", "HEAD"]);
    sourceTree = dependencies.sourceTree ?? git(["rev-parse", "HEAD^{tree}"]);
  } catch { return { ok: false, finding: "SOURCE_IDENTITY_UNRESOLVED" }; }
  if (!sha40(sourceHead) || !sha40(sourceTree)) return { ok: false, finding: "SOURCE_IDENTITY_INVALID" };

  const clock = dependencies.clock ?? (() => Date.now());
  const spawn = dependencies.spawn ?? ((file, argv, options) => spawnSync(file, argv, options));
  const startedAtMs = clock();
  const execution = spawn(rule.file, rule.args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    timeout: rule.timeoutMs,
    maxBuffer: rule.maxBuffer ?? 16 * 1024 * 1024,
    env: { PATH: process.env.PATH, CI: "1", NO_COLOR: "1" }
  });
  const endedAtMs = clock();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs) return { ok: false, finding: "CLOCK_INVALID" };
  const stdout = String(execution.stdout ?? "");
  const stderr = String(execution.stderr ?? "");
  const raw = `${stdout}${stderr}`;
  const parsed = parseResult(rule.resultContract, stdout, execution.status);
  const successDiagnostic = /(?:not an? .+ command|command not found|MODULE_NOT_FOUND|Cannot find module)/iu.test(raw);
  const base = {
    commandId: id,
    exactCommand: [rule.file, ...rule.args],
    sourceHead,
    sourceTree,
    toolchainIdentity: dependencies.toolchainIdentity ?? { runnerNode: process.version, executable: rule.file },
    platform: `${process.platform}-${process.arch}`,
    configurationHash: sha256(rule),
    startedAtMs,
    endedAtMs,
    durationMs: endedAtMs - startedAtMs,
    exitStatus: execution.status,
    signal: execution.signal ?? null,
    resultTotals: parsed.ok ? parsed.results : 0,
    assertionTotals: parsed.ok ? parsed.assertions : 0,
    result: parsed.ok ? parsed.value : null,
    failureCategory: null,
    outputHashes: {
      stdoutSha256: sha256(stdout),
      stderrSha256: sha256(stderr),
      combinedSha256: sha256(raw)
    },
    cleanupState: "SYNCHRONOUS_CHILD_EXITED"
  };
  if (execution.error?.code === "ETIMEDOUT") {
    return { ok: false, receipt: { ...base, failureCategory: "COMMAND_TIMEOUT" }, finding: "COMMAND_TIMEOUT" };
  }
  if (execution.status !== 0) {
    return { ok: false, receipt: { ...base, failureCategory: "COMMAND_FAILED" }, failureExcerpt: redactText(raw), finding: "COMMAND_FAILED" };
  }
  if (!parsed.ok) {
    return { ok: false, receipt: { ...base, failureCategory: parsed.category }, failureExcerpt: redactText(raw), finding: parsed.category };
  }
  if (successDiagnostic) {
    return { ok: false, receipt: { ...base, failureCategory: "SUCCESS_DIAGNOSTIC_REJECTED" }, failureExcerpt: redactText(raw), finding: "SUCCESS_DIAGNOSTIC_REJECTED" };
  }
  if (redactText(raw) !== raw.slice(0, 512) && /(?:bearer\s+|(?:service_role|sk|pk|gh[opsu])_|eyJ[A-Za-z0-9_-]+\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/iu.test(raw)) {
    return { ok: false, receipt: { ...base, failureCategory: "SENSITIVE_OUTPUT_DETECTED" }, finding: "SENSITIVE_OUTPUT_DETECTED" };
  }

  const identityHash = sha256({ ...base, startedAtMs: null, endedAtMs: null, durationMs: null });
  const writer = dependencies.artifactWriter ?? ((receipt, output) => externalize(identityHash, receipt, output));
  try {
    const artifactLocation = writer({ ...base, identityHash }, raw);
    if (typeof artifactLocation !== "string" || artifactLocation.length === 0) throw new Error("missing artifact");
    return { ok: true, receipt: { ...base, identityHash, artifactLocation } };
  } catch {
    return { ok: false, receipt: { ...base, identityHash, failureCategory: "ARTIFACT_WRITE_FAILED" }, finding: "ARTIFACT_WRITE_FAILED" };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = strictOptions(process.argv.slice(2), { "--command-id": "commandId", "--args": "args" });
  let suppliedArgs;
  try { suppliedArgs = JSON.parse(parsed.values.args ?? "[]"); } catch { suppliedArgs = null; }
  const result = parsed.ok
    ? runReceipt(readJson("config/assurance/command-allowlist-v1.json"), parsed.values.commandId, suppliedArgs)
    : { ok: false, finding: parsed.findings.join(",") };
  emit("assurance:receipt", result.ok, result);
}
