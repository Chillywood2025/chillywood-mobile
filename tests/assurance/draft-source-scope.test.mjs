import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { git as runGit } from "../../scripts/assurance/lib.mjs";
import { evaluateDraftSourceReadinessScope } from "../../scripts/assurance/pr-scope-lib.mjs";

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
      base: { ref: "main", sha: baseSha },
      head: { ref: branch, sha: headSha },
    },
  };
  const readback = {
    number: pr,
    repository,
    baseRef: "main",
    baseSha,
    headRef: branch,
    headSha,
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
