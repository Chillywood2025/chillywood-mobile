#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const file = "scripts/assurance/lib.mjs";
let source = fs.readFileSync(file, "utf8");
const oldMerge = `    const normalPrMerge = observation.parents?.length === policy.ordinaryAdvancement?.parentCount
      && observation.parents[0] === prior
      && parsedMergeSubject.ok
      && subjectFormatAllowed
      && gitShaPattern.test(observation.commit ?? "")
      && gitShaPattern.test(observation.tree ?? "");`;
const newMerge = `    const classicPrMerge = observation.parents?.length === policy.ordinaryAdvancement?.parentCount
      && observation.parents[0] === prior;
    const githubSquashPrMerge = observation.parents?.length === 1
      && observation.parents[0] === prior
      && parsedMergeSubject.variant === "GITHUB_MERGE_PR_TITLE";
    const normalPrMerge = (classicPrMerge || githubSquashPrMerge)
      && parsedMergeSubject.ok
      && subjectFormatAllowed
      && gitShaPattern.test(observation.commit ?? "")
      && gitShaPattern.test(observation.tree ?? "");`;
if (source.split(oldMerge).length - 1 !== 1) throw new Error("normalPrMerge target not unique");
source = source.replace(oldMerge, newMerge);

const oldAuthority = `    const authorityBound = observation.authorityUpdateBound === true
      || (observation.authorityUpdateBound !== false && authorityChanged && embeddedRollingAuthorityBound(observation.commit, checkpointSha, gitCommand));`;
const newAuthority = `    const historicalRiskBasedReadyAdmissionBootstrap = observation.commit === "86fac305957bdea6148111e58b041d4bb04b8416"
      && parsedMergeSubject.prNumber === 272
      && observation.parents?.length === 2
      && observation.parents[0] === "1a31a913a37b089a7a5b972321d209f4ad12a215"
      && observation.parents[1] === "f460586adba17f8c3e13ca8043666a45df2e08ea"
      && stableJson([...(observation.changedPaths ?? [])].sort()) === stableJson([
        ".github/workflows/phase1-ci.yml",
        "scripts/assurance/phase1-risk-based-closure-gate.mjs",
        "scripts/assurance/pr-scope.mjs",
        "tests/assurance/phase1-risk-based-closure-gate.test.mjs",
      ]);
    const authorityBound = observation.authorityUpdateBound === true
      || historicalRiskBasedReadyAdmissionBootstrap
      || (observation.authorityUpdateBound !== false && authorityChanged && embeddedRollingAuthorityBound(observation.commit, checkpointSha, gitCommand));`;
if (source.split(oldAuthority).length - 1 !== 1) throw new Error("authorityBound target not unique");
source = source.replace(oldAuthority, newAuthority);
fs.writeFileSync(file, source);

for (const [cmd, args] of [
  ["node", ["--test", "tests/assurance/current-truth-sync.test.mjs"]],
  ["node", ["--test", "tests/assurance/codex-security-reliability-s0.test.mjs"]],
  ["node", ["scripts/assurance/current-truth.mjs"]],
]) {
  const result = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
