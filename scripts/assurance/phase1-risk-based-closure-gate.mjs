#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateProtectedMainAdvancement } from "./lib.mjs";

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const READY_ACTIONS = new Set(["opened", "synchronize", "reopened", "edited", "ready_for_review"]);
const TRUST_PATHS = new Set([
  ".github/workflows/phase1-ci.yml",
  "scripts/assurance/pr-scope.mjs",
  "scripts/assurance/phase1-risk-based-closure-gate.mjs",
  "tests/assurance/phase1-risk-based-closure-gate.test.mjs",
]);
const BOOTSTRAP_MAXIMUM_FILES = 4;
const BOOTSTRAP_MAXIMUM_NET_LINES = 800;

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const run = (command, args, options = {}) => spawnSync(command, args, {
  encoding: "utf8",
  shell: false,
  maxBuffer: 32 * 1024 * 1024,
  ...options,
});
const git = (args, cwd = process.cwd()) => run("git", args, { cwd });
const parseLastJsonObject = (text) => {
  const lines = String(text ?? "").split(/\r?\n/gu).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === "object") return value;
    } catch {}
  }
  return null;
};
const prefixPattern = (pattern) => {
  const escaped = String(pattern).split("*").map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")).join(".*");
  return new RegExp(`^${escaped}`, "u");
};
const classifyHighRisk = (files, policy) => {
  const domains = (policy?.domains ?? []).filter(({ risk }) => risk === "high");
  return [...new Set(domains.filter(({ paths }) => files.some((file) => (paths ?? []).some((pattern) => prefixPattern(pattern).test(file)))).map(({ id }) => id))].sort();
};

export function evaluateRiskBasedClosureFallback({
  closureResult,
  event,
  readback,
  scope,
  highRiskDomains,
  protectedReadyDecision = null,
  protectedMainRuntime = null,
} = {}) {
  const findings = [];
  const pull = event?.pull_request;
  const exactClosureFailure = closureResult?.ok === false
    && closureResult?.taskAuthorityGranted === false
    && closureResult?.finalSourceAuthority === false
    && closureResult?.mergeAuthorityGranted === false
    && stableJson(closureResult?.findings ?? []) === stableJson(["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"]);
  if (!exactClosureFailure) findings.push("PHASE1_RISK_CLOSURE_NOT_EXACT_UNBOUND_FAILURE");

  const exactLifecycle = READY_ACTIONS.has(event?.action)
    && event?.repository?.full_name === REPOSITORY
    && event?.number === pull?.number
    && pull?.state === "open"
    && pull?.draft === false
    && pull?.base?.ref === "main"
    && pull?.base?.repo?.full_name === REPOSITORY
    && pull?.head?.repo?.full_name === REPOSITORY
    && pull?.user?.login === "Chillywood2025"
    && readback?.number === pull?.number
    && readback?.state === "open"
    && readback?.draft === false
    && readback?.base?.ref === pull?.base?.ref
    && readback?.base?.sha === pull?.base?.sha
    && readback?.base?.repo?.full_name === REPOSITORY
    && readback?.head?.ref === pull?.head?.ref
    && readback?.head?.sha === pull?.head?.sha
    && readback?.head?.repo?.full_name === REPOSITORY
    && readback?.user?.login === "Chillywood2025"
    && readback?.updated_at === pull?.updated_at;
  if (!exactLifecycle) findings.push("PHASE1_RISK_CLOSURE_IDENTITY_OR_LIFECYCLE_INVALID");

  const files = Array.isArray(scope?.files) ? [...scope.files].sort() : [];
  const exactScope = files.length > 0
    && files.length === new Set(files).size
    && stableJson(files) === stableJson(scope?.files ?? [])
    && Number.isSafeInteger(scope?.additions) && scope.additions >= 0
    && Number.isSafeInteger(scope?.deletions) && scope.deletions >= 0
    && Number.isSafeInteger(scope?.netChangedLines) && scope.netChangedLines === Math.max(0, scope.additions - scope.deletions);
  if (!exactScope) findings.push("PHASE1_RISK_CLOSURE_SCOPE_INVALID");
  if (protectedMainRuntime?.pendingTerminalTruth === true) findings.push("PHASE1_RISK_CLOSURE_PENDING_TERMINAL_TRUTH");

  const touchesTrust = files.some((file) => TRUST_PATHS.has(file));
  const bootstrap = touchesTrust;
  if (bootstrap) {
    const exactBootstrapScope = files.length <= BOOTSTRAP_MAXIMUM_FILES
      && scope.netChangedLines <= BOOTSTRAP_MAXIMUM_NET_LINES
      && files.every((file) => TRUST_PATHS.has(file))
      && stableJson(highRiskDomains ?? []) === stableJson([]);
    if (!exactBootstrapScope) findings.push("PHASE1_RISK_CLOSURE_BOOTSTRAP_SCOPE_INVALID");
  } else {
    const protectedDecisionValid = protectedReadyDecision?.mode === "RISK_BASED_READY_ADMISSION_V1"
      && protectedReadyDecision?.taskAuthorityGranted === true
      && protectedReadyDecision?.mergeAuthorityGranted === false
      && Array.isArray(protectedReadyDecision?.findings)
      && protectedReadyDecision.findings.length === 0;
    if (!protectedDecisionValid) findings.push("PHASE1_RISK_CLOSURE_PROTECTED_READY_DECISION_INVALID");
  }

  return {
    ok: findings.length === 0,
    classification: bootstrap ? "ASSURANCE_CONTROL_SOURCE_ONLY_BOOTSTRAP_V1" : "PROTECTED_RISK_BASED_READY_CLOSURE_V1",
    mergeAuthorityGranted: false,
    finalSourceAuthority: false,
    providerMutationAllowed: false,
    databaseMutationAllowed: false,
    moneyAuthorityAllowed: false,
    otaPublicationAllowed: false,
    publicReleaseAllowed: false,
    findings: [...new Set(findings)].sort(),
  };
}

const readScope = (base, head) => {
  const names = git(["diff", "--name-only", `${base}...${head}`]);
  const stats = git(["diff", "--numstat", `${base}...${head}`]);
  if (names.status !== 0 || stats.status !== 0) return null;
  const files = names.stdout.split(/\r?\n/gu).filter(Boolean).sort();
  const rows = stats.stdout.split(/\r?\n/gu).filter(Boolean).map((line) => line.split("\t"));
  if (rows.some(([added, deleted]) => !/^\d+$/u.test(added ?? "") || !/^\d+$/u.test(deleted ?? ""))) return null;
  const additions = rows.reduce((sum, [value]) => sum + Number(value), 0);
  const deletions = rows.reduce((sum, [, value]) => sum + Number(value), 0);
  return { files, additions, deletions, netChangedLines: Math.max(0, additions - deletions) };
};

const readProtectedJson = (baseSha, repoPath) => {
  const result = git(["show", `${baseSha}:${repoPath}`]);
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
};

const runProtectedPrScope = ({ baseSha, eventPath }) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "phase1-risk-base-"));
  try {
    const add = git(["worktree", "add", "--detach", temporary, baseSha]);
    if (add.status !== 0) return null;
    const result = run("node", ["scripts/assurance/pr-scope.mjs", `--github-event=${eventPath}`], { cwd: temporary });
    return result.status === 0 ? parseLastJsonObject(result.stdout) : null;
  } finally {
    git(["worktree", "remove", "--force", temporary]);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

export function runPhase1RiskBasedClosureGate({ eventPath = process.env.GITHUB_EVENT_PATH } = {}) {
  const closure = run("npm", ["run", "assurance:engineering-closure"]);
  process.stdout.write(closure.stdout ?? "");
  process.stderr.write(closure.stderr ?? "");
  if (closure.status === 0) return 0;

  const closureResult = parseLastJsonObject(closure.stdout);
  let event = null;
  try { event = typeof eventPath === "string" ? JSON.parse(fs.readFileSync(eventPath, "utf8")) : null; } catch {}
  const pull = event?.pull_request;
  const baseSha = pull?.base?.sha;
  const headSha = pull?.head?.sha;
  if (!event || !/^[0-9a-f]{40}$/u.test(baseSha ?? "") || !/^[0-9a-f]{40}$/u.test(headSha ?? "")) return 1;

  const scope = readScope(baseSha, headSha);
  const policy = readProtectedJson(baseSha, "config/assurance/pr-scope-policy-v1.json");
  const currentTruth = readProtectedJson(baseSha, "config/assurance/current-truth-v1.json");
  const currentTruthContract = readProtectedJson(baseSha, "config/assurance/current-truth-contract-v1.json");
  if (!scope || !policy || !currentTruth || !currentTruthContract) return 1;
  const protectedMainRuntime = evaluateProtectedMainAdvancement({ record: currentTruth, contract: currentTruthContract });
  const highRiskDomains = classifyHighRisk(scope.files, policy);

  const gh = run("gh", ["api", "--method=GET", `repos/${REPOSITORY}/pulls/${event.number}`]);
  let readback = null;
  try { readback = gh.status === 0 ? JSON.parse(gh.stdout) : null; } catch {}
  if (!readback) return 1;

  const touchesTrust = scope.files.some((file) => TRUST_PATHS.has(file));
  const protectedReadyDecision = touchesTrust ? null : runProtectedPrScope({ baseSha, eventPath });
  const decision = evaluateRiskBasedClosureFallback({ closureResult, event, readback, scope, highRiskDomains, protectedReadyDecision, protectedMainRuntime });
  process.stdout.write(`${JSON.stringify({ command: "phase1:risk-based-closure-gate", ...decision, changedFiles: scope.files.length, highRiskDomains })}\n`);
  return decision.ok ? 0 : 1;
}

const invokedAsMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsMain) process.exitCode = runPhase1RiskBasedClosureGate();
