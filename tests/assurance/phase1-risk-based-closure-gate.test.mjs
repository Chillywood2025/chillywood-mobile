import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRiskBasedClosureFallback } from "../../scripts/assurance/phase1-risk-based-closure-gate.mjs";

const prScopeFixturePath = ["scripts", "assurance", "pr-scope.mjs"].join("/");

const base = "a".repeat(40);
const head = "b".repeat(40);
const updatedAt = "2026-08-26T20:28:17Z";
const repository = "Chillywood2025/chillywood-mobile";
const event = {
  action: "ready_for_review",
  number: 272,
  repository: { full_name: repository },
  pull_request: {
    number: 272,
    state: "open",
    draft: false,
    updated_at: updatedAt,
    user: { login: "Chillywood2025" },
    base: { ref: "main", sha: base, repo: { full_name: repository } },
    head: { ref: "chatgpt/test", sha: head, repo: { full_name: repository } },
  },
};
const readback = {
  number: 272,
  state: "open",
  draft: false,
  updated_at: updatedAt,
  user: { login: "Chillywood2025" },
  base: { ref: "main", sha: base, repo: { full_name: repository } },
  head: { ref: "chatgpt/test", sha: head, repo: { full_name: repository } },
};
const closureResult = {
  ok: false,
  taskAuthorityGranted: false,
  finalSourceAuthority: false,
  mergeAuthorityGranted: false,
  findings: ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"],
};
const runtime = { pendingTerminalTruth: false };
const releaseDecision = {
  mode: "RISK_BASED_READY_ADMISSION_V1",
  taskAuthorityGranted: true,
  mergeAuthorityGranted: false,
  findings: [],
};

const evaluate = (overrides = {}) => evaluateRiskBasedClosureFallback({
  closureResult,
  event,
  readback,
  scope: { files: ["config/release/android-production.json"], additions: 8, deletions: 2, netChangedLines: 6 },
  highRiskDomains: ["release-OTA"],
  protectedReadyDecision: releaseDecision,
  protectedMainRuntime: runtime,
  bootstrapAllowed: false,
  ...overrides,
});

test("protected-base risk-based READY decision permits only the exact unbound closure fallback", () => {
  const result = evaluate();
  assert.equal(result.ok, true);
  assert.equal(result.classification, "PROTECTED_RISK_BASED_READY_CLOSURE_V1");
  assert.equal(result.mergeAuthorityGranted, false);
  assert.equal(result.otaPublicationAllowed, false);
});

test("a real engineering closure failure remains blocking", () => {
  const result = evaluate({ closureResult: { ...closureResult, findings: ["PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE"] } });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("PHASE1_RISK_CLOSURE_NOT_EXACT_UNBOUND_FAILURE"));
});

test("draft, non-owner, fork and stale readback identities remain blocking", () => {
  const draft = structuredClone(event); draft.pull_request.draft = true;
  assert.equal(evaluate({ event: draft }).ok, false);
  const nonOwner = structuredClone(event); nonOwner.pull_request.user.login = "other";
  assert.equal(evaluate({ event: nonOwner }).ok, false);
  const fork = structuredClone(event); fork.pull_request.head.repo.full_name = "other/fork";
  assert.equal(evaluate({ event: fork }).ok, false);
  const stale = structuredClone(readback); stale.head.sha = "c".repeat(40);
  assert.equal(evaluate({ readback: stale }).ok, false);
});

test("missing or broadened protected READY authority remains blocking", () => {
  assert.equal(evaluate({ protectedReadyDecision: null }).ok, false);
  assert.equal(evaluate({ protectedReadyDecision: { ...releaseDecision, mergeAuthorityGranted: true } }).ok, false);
  assert.equal(evaluate({ protectedReadyDecision: { ...releaseDecision, findings: ["ASSURANCE_MIXED_HIGH_RISK_SCOPE"] } }).ok, false);
});

test("pending terminal truth remains blocking", () => {
  const result = evaluate({ protectedMainRuntime: { pendingTerminalTruth: true } });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("PHASE1_RISK_CLOSURE_PENDING_TERMINAL_TRUTH"));
});

const bootstrapScope = {
  files: [
    ".github/workflows/phase1-ci.yml",
    "scripts/assurance/phase1-risk-based-closure-gate.mjs",
    prScopeFixturePath,
    "tests/assurance/phase1-risk-based-closure-gate.test.mjs",
  ].sort(),
  additions: 300,
  deletions: 20,
  netChangedLines: 280,
};

test("one-time assurance-control bootstrap is allowed only for the exact closed no-high-risk file set", () => {
  const result = evaluate({ scope: bootstrapScope, highRiskDomains: [], protectedReadyDecision: null, bootstrapAllowed: true });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "ASSURANCE_CONTROL_SOURCE_ONLY_BOOTSTRAP_V1");
  assert.equal(result.mergeAuthorityGranted, false);
});

test("bootstrap expires after the gate is protected", () => {
  assert.equal(evaluate({ scope: bootstrapScope, highRiskDomains: [], protectedReadyDecision: null, bootstrapAllowed: false }).ok, false);
  const protectedDecision = { ...releaseDecision };
  const result = evaluate({ scope: bootstrapScope, highRiskDomains: [], protectedReadyDecision: protectedDecision, bootstrapAllowed: false });
  assert.equal(result.ok, true);
  assert.equal(result.classification, "PROTECTED_RISK_BASED_READY_CLOSURE_V1");
});

test("bootstrap cannot hide release, product, unknown or extra control scope", () => {
  const releaseScope = {
    files: [prScopeFixturePath, "config/release/android-production.json"].sort(),
    additions: 10,
    deletions: 0,
    netChangedLines: 10,
  };
  assert.equal(evaluate({ scope: releaseScope, highRiskDomains: ["release-OTA"], protectedReadyDecision: null, bootstrapAllowed: true }).ok, false);
  const extra = { files: [prScopeFixturePath, "scripts/assurance/lib.mjs"].sort(), additions: 10, deletions: 0, netChangedLines: 10 };
  assert.equal(evaluate({ scope: extra, highRiskDomains: [], protectedReadyDecision: null, bootstrapAllowed: true }).ok, false);
});

test("bootstrap file and line budgets fail closed", () => {
  const overLines = { files: [prScopeFixturePath], additions: 801, deletions: 0, netChangedLines: 801 };
  assert.equal(evaluate({ scope: overLines, highRiskDomains: [], protectedReadyDecision: null, bootstrapAllowed: true }).ok, false);
});
