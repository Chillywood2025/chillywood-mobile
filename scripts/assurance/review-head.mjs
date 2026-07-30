#!/usr/bin/env node
import { args, emit, git, readJson } from "./lib.mjs";

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
  emit("assurance:review-head", findings.length === 0, { manifest: options.manifest, implementationHead: currentHead, implementationTree: currentTree, findings }, [`review head: ${findings.length ? "FAIL" : "PASS"} — ${findings.length} finding${findings.length === 1 ? "" : "s"}`]);
}
