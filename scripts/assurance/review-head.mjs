#!/usr/bin/env node
import { args, emit, git, readJson, sha256 } from "./lib.mjs";

const options = args();
const contract = readJson("config/assurance/review-contract-v1.json");
if (options.dogfood) {
  const dogfood = readJson("config/assurance/dogfood-pr-a-v1.json");
  const subject = dogfood.subjects.find(({ id }) => id === "PR-53-CURRENT");
  const facts = subject.facts;
  const findings = [];
  if (facts.reviewedImplementationHead !== facts.currentImplementationHead) findings.push({ id: "ASSURANCE_REVIEW_HEAD_STALE", status: "BLOCKED_INTERNAL", reviewed: facts.reviewedImplementationHead, current: facts.currentImplementationHead });
  if (facts.reviewBranchDiverged || !facts.reviewContainsCurrentImplementation) findings.push({ id: "ASSURANCE_REVIEW_BRANCH_DIVERGED", status: "BLOCKED_INTERNAL", mergeBase: facts.mergeBaseWithImplementation });
  if (facts.containsImplementationSource) findings.push({ id: "ASSURANCE_REVIEW_BRANCH_CONTAINS_IMPLEMENTATION", status: "BLOCKED_INTERNAL" });
  if (!facts.reviewIncludesRevenueCatChanges) findings.push({ id: "ASSURANCE_REVENUECAT_CURRENT_REVIEW_MISSING", status: "BLOCKED_INTERNAL" });
  emit("assurance:review-head", true, { dogfoodPassed: findings.length >= 4, subject: subject.id, mergePermitted: false, findings }, [`review-head dogfood: PASS — rejected stale PR #53 with ${findings.length} findings`]);
} else if (!options.manifest) {
  emit("assurance:review-head", false, { findings: [{ id: "ASSURANCE_REVIEW_MANIFEST_MISSING", status: "BLOCKED_INTERNAL" }] }, ["review head: FAIL — use --manifest=<review manifest>"]);
} else {
  const manifest = readJson(options.manifest);
  const missing = contract.manifestRequiredFields.filter((key) => !Object.hasOwn(manifest, key));
  const findings = missing.map((key) => ({ id: "ASSURANCE_REVIEW_MANIFEST_FIELD_MISSING", status: "BLOCKED_INTERNAL", field: key }));
  let currentHead = null;
  let currentTree = null;
  try {
    currentHead = git(["rev-parse", manifest.implementationBranch]);
    currentTree = git(["rev-parse", `${manifest.implementationBranch}^{tree}`]);
  } catch {
    findings.push({ id: "ASSURANCE_IMPLEMENTATION_REF_MISSING", status: "BLOCKED_INTERNAL" });
  }
  if (currentHead && currentHead !== manifest.implementationHead) findings.push({ id: "ASSURANCE_REVIEW_HEAD_STALE", status: "BLOCKED_INTERNAL", reviewed: manifest.implementationHead, current: currentHead });
  if (currentTree && currentTree !== manifest.implementationTree) findings.push({ id: "ASSURANCE_REVIEW_TREE_STALE", status: "BLOCKED_INTERNAL" });
  for (const key of ["changedFileHash", "migrationSetHash", "configHash", "testResultHash"]) {
    if (!/^[0-9a-f]{64}$/u.test(manifest[key] ?? "")) findings.push({ id: "ASSURANCE_REVIEW_HASH_INVALID", status: "BLOCKED_INTERNAL", field: key });
  }
  const level = contract.levels[manifest.reviewLevel];
  if (!level) {
    findings.push({ id: "ASSURANCE_REVIEW_LEVEL_INVALID", status: "BLOCKED_INTERNAL", reviewLevel: manifest.reviewLevel ?? null });
  } else {
    const lanes = Array.isArray(manifest.reviewerLanes) ? manifest.reviewerLanes : [];
    for (const lane of level.lanes) {
      if (!lanes.includes(lane)) findings.push({ id: "ASSURANCE_REVIEW_LANE_MISSING", status: "BLOCKED_INTERNAL", lane, reviewLevel: manifest.reviewLevel });
    }
    if (level.requires.includes("full-CI-frozen-head") || level.requires.includes("full-CI")) {
      const phase1 = manifest.testResults?.phase1Ci;
      if (phase1?.status !== "pass") findings.push({ id: "ASSURANCE_REVIEW_FROZEN_HEAD_CI_MISSING", status: "BLOCKED_INTERNAL", actual: phase1?.status ?? null });
      if (phase1?.implementationHead !== manifest.implementationHead) findings.push({ id: "ASSURANCE_REVIEW_CI_HEAD_STALE", status: "BLOCKED_INTERNAL", ciHead: phase1?.implementationHead ?? null, implementationHead: manifest.implementationHead });
    }
  }
  if (!Number.isFinite(new Date(manifest.reviewTimestamp).valueOf())) findings.push({ id: "ASSURANCE_REVIEW_TIMESTAMP_INVALID", status: "BLOCKED_INTERNAL" });
  if (currentHead) {
    const changedFileHash = sha256(git(["diff", "--name-status", "-z", manifest.baseHead, manifest.implementationHead]));
    const migrationSetHash = sha256(git(["diff", "--name-only", manifest.baseHead, manifest.implementationHead, "--", "supabase/migrations"]));
    const configHash = sha256(git(["ls-tree", "-r", manifest.implementationHead, "config/assurance"]));
    if (changedFileHash !== manifest.changedFileHash) findings.push({ id: "ASSURANCE_REVIEW_CHANGED_FILE_HASH_STALE", status: "BLOCKED_INTERNAL" });
    if (migrationSetHash !== manifest.migrationSetHash) findings.push({ id: "ASSURANCE_REVIEW_MIGRATION_HASH_STALE", status: "BLOCKED_INTERNAL" });
    if (configHash !== manifest.configHash) findings.push({ id: "ASSURANCE_REVIEW_CONFIG_HASH_STALE", status: "BLOCKED_INTERNAL" });
    if (sha256(manifest.testResults ?? null) !== manifest.testResultHash) findings.push({ id: "ASSURANCE_REVIEW_TEST_HASH_STALE", status: "BLOCKED_INTERNAL" });
    const reviewTip = git(["rev-parse", "HEAD"]);
    const reviewParent = git(["rev-parse", "HEAD^"]);
    if (![reviewTip, reviewParent].includes(manifest.reviewHead)) findings.push({ id: "ASSURANCE_REVIEW_HEAD_BINDING_STALE", status: "BLOCKED_INTERNAL" });
    if (git(["merge-base", manifest.implementationHead, reviewTip]) !== manifest.implementationHead) findings.push({ id: "ASSURANCE_REVIEW_BRANCH_DIVERGED", status: "BLOCKED_INTERNAL" });
    const reviewFiles = git(["diff", "--name-only", manifest.implementationHead, reviewTip]).split(/\r?\n/gu).filter(Boolean);
    const implementationFiles = reviewFiles.filter((file) => !file.startsWith("docs/reviews/") && !file.startsWith("config/assurance/reviews/"));
    if (implementationFiles.length) findings.push({ id: "ASSURANCE_REVIEW_BRANCH_CONTAINS_IMPLEMENTATION", status: "BLOCKED_INTERNAL", files: implementationFiles });
    const criticalFindings = (manifest.findings ?? []).filter(({ severity, status }) => ["P0", "P1"].includes(severity) && status !== "resolved");
    if (criticalFindings.length) findings.push({ id: "ASSURANCE_REVIEW_CRITICAL_FINDINGS_OPEN", status: "BLOCKED_INTERNAL", count: criticalFindings.length });
    if (Date.now() > new Date(manifest.reviewTimestamp).valueOf() + contract.criticalChangeFreshnessHours * 3600000) findings.push({ id: "ASSURANCE_REVIEW_EXPIRED", status: "BLOCKED_INTERNAL" });
  }
  emit("assurance:review-head", findings.length === 0, { manifest: options.manifest, implementationHead: currentHead, implementationTree: currentTree, findings }, [`review head: ${findings.length ? "FAIL" : "PASS"} — ${findings.length} finding${findings.length === 1 ? "" : "s"}`]);
}
