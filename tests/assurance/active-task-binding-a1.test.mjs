import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { activeTask } from "../../scripts/assurance/active-task.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const canonicalTruth = read("config/assurance/current-truth-v1.json");
const registry = read("config/assurance/feature-registry-v1.json");
const allowlist = read("config/assurance/command-allowlist-v1.json");
const binding = { ...canonicalTruth.activeTaskBinding, phase: "FORMAL_REVIEW" };
const truth = {
  ...canonicalTruth,
  activeTaskBinding: binding,
  openImplementationPrs: [{
    number: binding.implementationPr,
    branch: binding.implementationBranch,
    head: binding.currentImplementationHead,
    state: "open"
  }]
};
const identity = {
  branch: binding.implementationBranch,
  head: "1".repeat(40),
  tree: "2".repeat(40),
  originMainHead: "3".repeat(40),
  originMainTree: "4".repeat(40),
  baseHead: "3".repeat(40),
  baseTree: "4".repeat(40),
  diffHash: "5".repeat(64),
  pathHash: "6".repeat(64),
  changedFiles: ["scripts/assurance/active-task.mjs"]
};
const implementationObservations = {
  remoteHead: binding.currentImplementationHead,
  immutableTree: binding.immutableSourceTree,
  currentTree: binding.currentImplementationTree,
  immutableSourceIsAncestor: true,
  providerPrHead: binding.currentImplementationHead
};
const facts = {
  currentTruth: truth,
  registry,
  allowlist,
  truthCheck: { ok: true },
  identity,
  implementationObservations,
  directlyAffectedSymbols: ["scripts/assurance/active-task.mjs#activeTask"]
};
const withTruth = (change) => ({ ...facts, currentTruth: change(truth) });

test("frozen formal review resolves the structured feature and exact PR 194 source", () => {
  const result = activeTask(facts);
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.packet.featureId, "chilly-chat-call-lifecycle");
  assert.equal(result.packet.implementation.pr, 194);
  assert.deepEqual(result.packet.implementation.immutableSource, {
    head: "c15a58039b67d65eabdcaa03a9422ebc8d6dd95e",
    tree: "4ce01fa17e4184f2523b82a10401e3b3f59dd641"
  });
  assert.deepEqual(result.packet.implementation.currentSynchronizedSource, {
    head: "ada396a437e40a98acea75bf016c36fc3ea86739",
    tree: "662dc601bf54b8abdc78cc915d757a6c55c2b39d"
  });
  assert.equal(JSON.stringify(result.packet).includes("8c47a3a9bff9f9630ba14837652ec31c14be0629"), false);
  assert.equal(result.packet.activeBlockers.some(({ freshnessClass, status }) => freshnessClass === "PROVIDER_CRITICAL" && status === "STALE_BLOCKED"), true);
});

test("matching feature override succeeds but cannot bypass canonical truth", () => {
  assert.equal(activeTask({ ...facts, featureId: binding.featureId }).ok, true);
  const malformed = { ...binding };
  delete malformed.currentImplementationTree;
  const result = activeTask({ ...withTruth((value) => ({ ...value, activeTaskBinding: malformed })), featureId: binding.featureId });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
});

test("conflicting feature override fails closed", () => {
  const result = activeTask({ ...facts, featureId: "assurance-efficiency-e0" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["FEATURE_OVERRIDE_CONFLICT"]);
});

test("legacy fallback requires exactly one open implementation owner", () => {
  const withoutBinding = structuredClone(truth);
  delete withoutBinding.activeTaskBinding;
  assert.deepEqual(activeTask({ ...facts, currentTruth: { ...withoutBinding, openImplementationPrs: [] } }).findings, ["ACTIVE_TASK_NONE"]);
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: {
      ...withoutBinding,
      openImplementationPrs: [
        { number: 194, branch: binding.implementationBranch, head: binding.currentImplementationHead, state: "open" },
        { number: 201, branch: "codex/competing", head: "7".repeat(40), state: "open" }
      ]
    }
  }).findings, ["MULTIPLE_ACTIVE_IMPLEMENTATIONS"]);
});

test("malformed structured binding and display disagreement fail closed", () => {
  const malformed = { ...binding, implementationPr: "194" };
  assert.deepEqual(activeTask(withTruth((value) => ({ ...value, activeTaskBinding: malformed }))).findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
  const conflict = activeTask(withTruth((value) => ({
    ...value,
    assuranceProgram: { ...value.assuranceProgram, active: "assurance-efficiency-e0" }
  })));
  assert.equal(conflict.ok, false);
  assert.deepEqual(conflict.findings, ["ACTIVE_TASK_STRUCTURED_DISPLAY_CONFLICT"]);
});

test("PR, branch and synchronized identity substitutions fail closed", () => {
  const prMismatch = activeTask(withTruth((value) => ({
    ...value,
    openImplementationPrs: [{ ...value.openImplementationPrs[0], number: 999 }]
  })));
  assert.equal(prMismatch.findings.includes("ACTIVE_IMPLEMENTATION_OWNERSHIP_MISMATCH"), true);
  const branchMismatch = activeTask({ ...facts, identity: { ...identity, branch: "codex/substitute" } });
  assert.equal(branchMismatch.findings.includes("ACTIVE_IMPLEMENTATION_LOCAL_BRANCH_MISMATCH"), true);
  const remoteMismatch = activeTask({ ...facts, implementationObservations: { ...implementationObservations, remoteHead: "8".repeat(40) } });
  assert.equal(remoteMismatch.findings.includes("ACTIVE_IMPLEMENTATION_REMOTE_HEAD_MISMATCH"), true);
  const providerMismatch = activeTask({ ...facts, implementationObservations: { ...implementationObservations, providerPrHead: "9".repeat(40) } });
  assert.equal(providerMismatch.findings.includes("ACTIVE_IMPLEMENTATION_PROVIDER_HEAD_MISMATCH"), true);
});

test("tree and immutable ancestry substitutions fail closed", () => {
  const immutableTree = activeTask({ ...facts, implementationObservations: { ...implementationObservations, immutableTree: "a".repeat(40) } });
  assert.equal(immutableTree.findings.includes("ACTIVE_IMPLEMENTATION_IMMUTABLE_TREE_MISMATCH"), true);
  const currentTree = activeTask({ ...facts, implementationObservations: { ...implementationObservations, currentTree: "b".repeat(40) } });
  assert.equal(currentTree.findings.includes("ACTIVE_IMPLEMENTATION_CURRENT_TREE_MISMATCH"), true);
  const ancestry = activeTask({ ...facts, implementationObservations: { ...implementationObservations, immutableSourceIsAncestor: false } });
  assert.equal(ancestry.findings.includes("ACTIVE_IMPLEMENTATION_IMMUTABLE_ANCESTRY_MISMATCH"), true);
});

test("formal review requires a synchronized identity", () => {
  const incomplete = { ...binding };
  delete incomplete.currentImplementationHead;
  const result = activeTask(withTruth((value) => ({ ...value, activeTaskBinding: incomplete })));
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
});
