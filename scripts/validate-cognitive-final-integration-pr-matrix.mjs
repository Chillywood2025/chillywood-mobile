#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const matrix = JSON.parse(fs.readFileSync(
  path.join(
    root,
    "config/intelligence/cognitive-level01-final-integration-pr-matrix.json",
  ),
  "utf8",
));
const SHA = /^[a-f0-9]{40}$/u;
const expectedImplementation = [14, 16, 18, 21, 23, 24, 26, 28, 30, 35];
const expectedReviewOnly = [15, 17, 19, 20, 22, 25, 27, 29, 31];
const expectedCanaries = [32, 33, 34];
const expectedPrNumbers = Array.from({ length: 22 }, (_, index) => index + 14);
const expectedCanaryPaths = new Map([
  [33, "scripts/test-haptic-tab-touch-target-canary.mjs"],
  [34, "components/haptic-tab.tsx"],
]);

assert.equal(
  matrix.schemaVersion,
  "chillywood-cognitive-final-integration-pr-matrix-v1",
);
assert.equal(matrix.repository, "Chillywood2025/chillywood-mobile");
assert.equal(matrix.targetBaseBranch, "codex/ios-integration-90");
assert.equal(
  matrix.cumulativeBranch,
  "codex/cognitive-level01-final-integration",
);
assert.equal(
  matrix.cumulativeMergePolicy,
  "merge_only_the_final_cumulative_implementation_pr",
);
assert.deepEqual(matrix.implementationPrNumbers, expectedImplementation);
assert.deepEqual(matrix.reviewOnlyPrNumbers, expectedReviewOnly);
assert.deepEqual(matrix.canaryPrNumbers, expectedCanaries);
assert.deepEqual(
  matrix.entries.map((entry) => entry.prNumber),
  expectedPrNumbers,
);
assert.equal(new Set(matrix.entries.map((entry) => entry.prNumber)).size, 22);

for (const entry of matrix.entries) {
  assert.match(entry.headSha, SHA);
  assert.match(entry.sourceTree, SHA);
  assert.equal(entry.draft, true);
  assert.equal(entry.merged, false);
  assert.equal(entry.mustMerge, false);
  const implementation = expectedImplementation.includes(entry.prNumber);
  const reviewOnly = expectedReviewOnly.includes(entry.prNumber);
  const canary = expectedCanaries.includes(entry.prNumber);
  assert.equal(entry.requiredImplementationHead, implementation);
  assert.equal(entry.includedInFinalIntegrationAncestry, implementation);
  assert.equal(entry.mustRemainUnmerged, reviewOnly || canary);
  if (reviewOnly) {
    assert.equal(entry.classification, "review_only");
    assert.equal(entry.disposition, "review_evidence_only_never_merge");
  }
  if (canary) {
    assert.match(entry.classification, /_canary$/u);
  }
}

const providerCanary = matrix.entries.find((entry) => entry.prNumber === 32);
assert.equal(providerCanary.usefulContentIncluded, false);
assert.equal(providerCanary.importedAsCommitPrefix, null);
assert.equal(
  providerCanary.disposition,
  "provider_boundary_evidence_never_merge",
);
for (const prNumber of [33, 34]) {
  const entry = matrix.entries.find((candidate) => candidate.prNumber === prNumber);
  assert.equal(entry.usefulContentIncluded, true);
  assert.match(entry.importedAsCommitPrefix, SHA);
  assert.equal(
    entry.disposition,
    "useful_content_cherry_picked_once_never_merge_canary",
  );
}

const git = (argumentsList, options = {}) =>
  execFileSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    ...options,
  }).trim();
const isAncestor = (ancestor, descendant = "HEAD") =>
  spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    cwd: root,
  }).status === 0;
const patchId = (commit, filePath) => {
  const patch = execFileSync(
    "git",
    ["diff", `${commit}^`, commit, "--", filePath],
    { cwd: root },
  );
  const result = spawnSync("git", ["patch-id", "--stable"], {
    cwd: root,
    input: patch,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  return result.stdout.trim().split(/\s+/u)[0];
};

if (process.argv.includes("--verify-git")) {
  assert.ok(isAncestor(matrix.targetBaseHead));
  assert.ok(isAncestor(matrix.verifiedAgainstDescendantOf));
  for (const entry of matrix.entries) {
    assert.equal(git(["rev-parse", `${entry.headSha}^{tree}`]), entry.sourceTree);
    assert.equal(isAncestor(entry.headSha), entry.requiredImplementationHead);
  }
  for (const [prNumber, expectedPath] of expectedCanaryPaths) {
    const entry = matrix.entries.find((candidate) => candidate.prNumber === prNumber);
    const importedCommit = entry.importedAsCommitPrefix;
    assert.ok(isAncestor(importedCommit));
    assert.deepEqual(
      git(["diff-tree", "--no-commit-id", "--name-only", "-r", importedCommit])
        .split("\n")
        .filter(Boolean),
      [expectedPath],
    );
    assert.equal(
      patchId(entry.headSha, expectedPath),
      patchId(importedCommit, expectedPath),
      `PR #${prNumber} imported patch differs`,
    );
  }
}

console.log(JSON.stringify({
  canaries: expectedCanaries.length,
  entries: matrix.entries.length,
  implementationAncestry: expectedImplementation.length,
  reviewOnly: expectedReviewOnly.length,
  sourceTreeAndGitProof:
    process.argv.includes("--verify-git") ? "passed" : "not_requested",
}));
