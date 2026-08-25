import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { git as runGit } from "../../scripts/assurance/lib.mjs";
import {
  autonomousContractSourceAuthorityObserved,
  deriveEngineeringClosureExecutionMode,
  deriveEngineeringClosureSelfHostGate,
  deriveRepositoryRelationshipCandidates,
  evaluateDraftSourceReadinessScope,
  resolveEngineeringClosureTaskContext,
} from "../../scripts/assurance/engineering-closure.mjs";

test("shared Git scope reader retains canonical diffs larger than Node's default buffer", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(tmpdir(), "chillywood-pr-scope-large-diff-"));
  try {
    const git = (...values) => execFileSync("git", values, { cwd: fixtureRoot, stdio: "ignore" });
    git("init");
    git("config", "user.name", "PR Scope Buffer Test");
    git("config", "user.email", "pr-scope-buffer@example.invalid");
    const before = Array.from({ length: 40_000 }, (_, index) => `before-${String(index).padStart(5, "0")}-${"a".repeat(24)}`).join("\n");
    const after = Array.from({ length: 40_000 }, (_, index) => `after-${String(index).padStart(5, "0")}-${"b".repeat(24)}`).join("\n");
    fs.writeFileSync(path.join(fixtureRoot, "large-source.txt"), `${before}\n`);
    git("add", "large-source.txt");
    git("commit", "-m", "large baseline");
    fs.writeFileSync(path.join(fixtureRoot, "large-source.txt"), `${after}\n`);
    const diff = runGit(["diff", "--full-index", "--binary", "--no-ext-diff", "HEAD"], { cwd: fixtureRoot });
    assert.ok(Buffer.byteLength(diff, "utf8") > 1024 * 1024);
    assert.match(diff, /\+after-00000-b{24}/u);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

const draftScopeInput = () => {
  const repository = "Chillywood2025/chillywood-mobile";
  const pr = 999;
  const branch = "codex/unbound-draft-source";
  const baseSha = "a".repeat(40);
  const headSha = "b".repeat(40);
  const tree = "c".repeat(40);
  const updatedAt = "2026-08-25T05:51:12Z";
  const htmlUrl = `https://github.com/${repository}/pull/${pr}`;
  const event = {
    action: "synchronize",
    number: pr,
    repository: { full_name: repository },
    pull_request: {
      number: pr,
      state: "open",
      draft: true,
      updated_at: updatedAt,
      html_url: htmlUrl,
      base: { ref: "main", sha: baseSha, repo: { full_name: repository } },
      head: { ref: branch, sha: headSha, repo: { full_name: repository } },
    },
  };
  const readback = {
    number: pr,
    repository,
    baseRepository: repository,
    baseRef: "main",
    baseSha,
    headRepository: repository,
    headRef: branch,
    headSha,
    mergeCommitSha: "e".repeat(40),
    htmlUrl,
    state: "open",
    draft: true,
    updatedAt,
  };
  const executionIdentity = {
    ok: true,
    repository,
    pr,
    action: event.action,
    draft: true,
    authoritativeSource: { baseRef: "main", baseSha, headSha, ref: branch },
    execution: { tree },
    relationship: { valid: true },
  };
  const scope = { files: ["app/source.ts"], additions: 4, deletions: 1, diffHash: "d".repeat(64) };
  const context = { ok: false, source: "UNBOUND_PR_CONTEXT", findings: ["ASSURANCE_TASK_CONTEXT_UNBOUND"] };
  const findings = [
    { id: "ASSURANCE_TASK_CONTEXT_UNBOUND", status: "BLOCKED_INTERNAL" },
    { id: "ASSURANCE_MIXED_HIGH_RISK_SCOPE", status: "BLOCKED_INTERNAL", domains: ["auth", "database-RLS"] },
    { id: "ASSURANCE_OBJECTIVE_OMITS_AFFECTED_DOMAIN", status: "BLOCKED_INTERNAL", domains: ["auth", "database-RLS"] },
  ];
  return { event, readback, executionIdentity, tree, scope, context, findings };
};

test("exact draft scope reclassifies only final-authority findings and grants no task or merge authority", () => {
  const input = draftScopeInput();
  const result = evaluateDraftSourceReadinessScope(input);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "DRAFT_SOURCE_READINESS");
  assert.equal(result.taskAuthorityGranted, false);
  assert.equal(result.mergeAuthorityGranted, false);
  assert.equal(result.sourceScope.finalSourceAuthority, false);
  assert.equal(result.sourceScope.headSha, input.readback.headSha);
  assert.equal(result.sourceScope.diffHash, input.scope.diffHash);
  assert.ok(result.nonBlockingFindings.every(({ status }) => status === "NON_BLOCKING_ASSURANCE_FAILURE"));

  for (const mutate of [
    (candidate) => { candidate.event.pull_request.draft = false; },
    (candidate) => { candidate.readback.updatedAt = "2026-08-25T05:52:12Z"; },
    (candidate) => { candidate.executionIdentity.authoritativeSource.headSha = "e".repeat(40); },
    (candidate) => { candidate.scope.diffHash = null; },
    (candidate) => { candidate.findings.push({ id: "ASSURANCE_GIT_DIFF_CONTEXT_UNREADABLE", status: "BLOCKED_INTERNAL" }); },
    (candidate) => { candidate.context.findings.push("FINITE_TASK_TEST_ADAPTATION_FIXTURE_INTEGRITY_INVALID"); },
  ]) {
    const candidate = structuredClone(input);
    mutate(candidate);
    assert.equal(evaluateDraftSourceReadinessScope(candidate).ok, false);
  }
});

const resolveDraftEngineeringContext = ({ mutate = null, observeAuthorities = null } = {}) => {
  const input = draftScopeInput();
  mutate?.(input);
  const head = input.readback.headSha;
  const tree = input.tree;
  const livePull = {
    number: input.readback.number,
    state: input.readback.state,
    draft: input.readback.draft,
    updated_at: input.readback.updatedAt,
    html_url: input.readback.htmlUrl,
    merge_commit_sha: input.readback.mergeCommitSha,
    base: { ref: input.readback.baseRef, sha: input.readback.baseSha, repo: { full_name: input.readback.baseRepository } },
    head: { ref: input.readback.headRef, sha: input.readback.headSha, repo: { full_name: input.readback.headRepository } },
  };
  const gitCommand = (argv) => {
    if (argv[0] === "rev-parse" && argv[1] === "HEAD") return head;
    if (argv[0] === "rev-parse" && argv[1] === `${head}^{tree}`) return tree;
    if (argv[0] === "show") return "";
    if (argv[0] === "merge-tree") return tree;
    return "";
  };
  return resolveEngineeringClosureTaskContext({
    event: input.event,
    localIdentity: { head, tree, base: input.readback.baseSha, branch: input.readback.headRef },
    scope: input.scope,
    currentTruth: {},
    readPull: () => livePull,
    observeAuthorities: observeAuthorities ?? (() => ({ architectureAuthority: null, terminalTruthAuthority: null, finiteTaskAuthority: null, finiteTaskAdmissionAuthority: null })),
    sourceAncestryVerified: true,
    environment: {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF: `refs/pull/${input.event.number}/merge`,
      GITHUB_SHA: head,
    },
    gitCommand,
  });
};

test("engineering closure accepts only its exact branded draft source context without task or merge authority", () => {
  const resolution = resolveDraftEngineeringContext();
  assert.equal(resolution.ok, true);
  assert.equal(resolution.taskContext.type, "DRAFT_SOURCE_READINESS");
  assert.equal(resolution.taskContext.taskAuthorization, "UNBOUND");
  assert.equal(resolution.taskContext.taskAuthorityGranted, false);
  assert.equal(resolution.taskContext.finalSourceAuthority, false);
  assert.equal(resolution.taskContext.mergeAuthorityGranted, false);
  assert.equal(resolution.taskContext.sourceScope.classification, "DRAFT_SOURCE_SCOPE_V1");
  assert.deepEqual(
    deriveEngineeringClosureExecutionMode({ taskContext: resolution.taskContext, changedPaths: ["app/source.ts"] }),
    { ok: true, mode: "DRAFT_SOURCE_READINESS", findings: [] },
  );

  const forged = structuredClone(resolution.taskContext);
  assert.deepEqual(
    deriveEngineeringClosureExecutionMode({ taskContext: forged, changedPaths: ["app/source.ts"] }),
    { ok: false, mode: null, findings: ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"] },
  );

});

test("engineering closure keeps READY, stale lifecycle, ambiguous authority, and local execution strict", () => {
  const ready = resolveDraftEngineeringContext({ mutate: (input) => {
    input.event.action = "ready_for_review";
    input.event.pull_request.draft = false;
    input.readback.draft = false;
  } });
  assert.equal(ready.ok, false);
  assert.deepEqual(ready.findings, ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"]);

  const stale = resolveDraftEngineeringContext({ mutate: (input) => { input.readback.updatedAt = "2026-08-25T05:52:12Z"; } });
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.findings, ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"]);

  const ambiguous = resolveDraftEngineeringContext({ observeAuthorities: () => ({
    architectureAuthority: { ok: true, type: "OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE" },
    terminalTruthAuthority: { ok: true, type: "TERMINAL_TRUTH_SUCCESSOR" },
    finiteTaskAuthority: null,
    finiteTaskAdmissionAuthority: null,
  }) });
  assert.equal(ambiguous.ok, false);
  assert.deepEqual(ambiguous.findings, ["ENGINEERING_CLOSURE_TASK_CONTEXT_AMBIGUOUS"]);

  assert.deepEqual(resolveEngineeringClosureTaskContext({ event: null }).findings, ["ENGINEERING_CLOSURE_TASK_CONTEXT_UNBOUND"]);
});

test("draft self-hosting reports source readiness only when every source finding is clear", () => {
  assert.deepEqual(
    deriveEngineeringClosureSelfHostGate({ mode: "DRAFT_SOURCE_READINESS", findings: [] }),
    { status: "SOURCE_READINESS_ACCEPTABLE", findings: [] },
  );
  assert.deepEqual(
    deriveEngineeringClosureSelfHostGate({ mode: "DRAFT_SOURCE_READINESS", findings: ["UNEXPECTED_WRONG_AUTHORITY"] }),
    { status: "BLOCKED_INTERNAL", findings: ["UNEXPECTED_WRONG_AUTHORITY"] },
  );
});

test("autonomous governing-edge observation follows only the exact wrapper-to-core delegation", () => {
  const observed = deriveRepositoryRelationshipCandidates().find(({ discoveryRule }) => discoveryRule === "SECURITY_CONTROL_SHARED_GUARD_DIRECT_CALL_AUTHORITY");
  assert.equal(observed.verifierResult, "SOURCE_RELATIONSHIP_OBSERVED");
  assert.equal(observed.relationshipConfidence, "EXACT_STRUCTURAL");

  const fixtureRoot = fs.mkdtempSync(path.join(tmpdir(), "chillywood-autonomous-wrapper-edge-"));
  const wrapperPath = path.join(fixtureRoot, "scripts/guard-autonomous-systems-contract.mjs");
  const corePath = path.join(fixtureRoot, "scripts/guard-autonomous-systems-contract-core.mjs");
  try {
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, 'const core = new URL("./guard-autonomous-systems-contract-core.mjs", import.meta.url);\nspawnSync(process.execPath, [core.pathname]);\n');
    fs.writeFileSync(corePath, 'import { evaluateAutonomousEngineeringRequest } from "./assurance/engineering-closure.mjs";\nevaluateAutonomousEngineeringRequest({ implementation: true });\nevaluateAutonomousEngineeringRequest({ implementation: true, cognitiveRecommendationSelfClear: true });\n');
    assert.equal(autonomousContractSourceAuthorityObserved(fixtureRoot, "scripts/guard-autonomous-systems-contract.mjs"), true);
    fs.writeFileSync(wrapperPath, 'const core = new URL("./untrusted-core.mjs", import.meta.url);\nspawnSync(process.execPath, [core.pathname]);\n');
    assert.equal(autonomousContractSourceAuthorityObserved(fixtureRoot, "scripts/guard-autonomous-systems-contract.mjs"), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
