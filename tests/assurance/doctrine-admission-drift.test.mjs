import assert from "node:assert/strict";
import test from "node:test";
import {
  doctrineModelRevisionBlocksTask,
  phase1CommittedEvidenceHead,
} from "../../scripts/assurance/engineering-closure.mjs";

const EXACT_TERMINAL_TRUTH = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-v1.json",
]);

const VALID_ADMISSION_CONTEXT = Object.freeze({
  type: "FINITE_TASK_ADMISSION_SUCCESSOR",
  ok: true,
  authorizationOk: true,
  classification: "FINITE_TASK_ADMISSION_V2",
  authoritySource: "IMMUTABLE_OWNER_FINITE_TASK_ADMISSION_CHAIN",
  checks: Object.freeze({ exactScope: true }),
});

const PREEXISTING_UNATTRIBUTED_DRIFT = Object.freeze({
  modelRevisionRequired: true,
  generatorSemanticChanged: false,
  structuralGraphInputs: ["UNATTRIBUTED_STRUCTURAL_GRAPH_CHANGE"],
});

test("exact finite-task admission does not inherit pre-existing unattributed doctrine drift", () => {
  assert.equal(doctrineModelRevisionBlocksTask({
    dependencyClosure: PREEXISTING_UNATTRIBUTED_DRIFT,
    executionMode: "FINITE_TASK_ADMISSION_SUCCESSOR",
    taskContext: VALID_ADMISSION_CONTEXT,
    changedPaths: EXACT_TERMINAL_TRUTH,
  }), false);
});

test("finite-task admission still blocks real or untrusted doctrine drift", () => {
  const candidates = [
    { executionMode: "PRODUCT_DOMAIN_TASK" },
    { taskContext: { ...VALID_ADMISSION_CONTEXT, ok: false } },
    { taskContext: { ...VALID_ADMISSION_CONTEXT, authorizationOk: false } },
    { taskContext: { ...VALID_ADMISSION_CONTEXT, classification: "FINITE_TASK_ADMISSION_V1" } },
    { taskContext: { ...VALID_ADMISSION_CONTEXT, authoritySource: "UNTRUSTED" } },
    { taskContext: { ...VALID_ADMISSION_CONTEXT, checks: { exactScope: false } } },
    { changedPaths: [...EXACT_TERMINAL_TRUTH, "app/index.tsx"] },
    { dependencyClosure: { ...PREEXISTING_UNATTRIBUTED_DRIFT, generatorSemanticChanged: true } },
    { dependencyClosure: { ...PREEXISTING_UNATTRIBUTED_DRIFT, structuralGraphInputs: ["config/assurance/feature-registry-v1.json"] } },
  ];

  for (const candidate of candidates) {
    assert.equal(doctrineModelRevisionBlocksTask({
      dependencyClosure: PREEXISTING_UNATTRIBUTED_DRIFT,
      executionMode: "FINITE_TASK_ADMISSION_SUCCESSOR",
      taskContext: VALID_ADMISSION_CONTEXT,
      changedPaths: EXACT_TERMINAL_TRUTH,
      ...candidate,
    }), true);
  }
});

test("no doctrine revision requirement remains non-blocking", () => {
  assert.equal(doctrineModelRevisionBlocksTask({
    dependencyClosure: { modelRevisionRequired: false },
  }), false);
});

const EXACT_SOURCE_IDENTITY = Object.freeze({
  repository: "Chillywood2025/chillywood-mobile",
  pr: 478,
  headRef: "codex/release-delivery-automation-control-plane-admission-v1",
  headSha: "d".repeat(40),
  sourceTree: "e".repeat(40),
  baseRef: "main",
  baseSha: "5".repeat(40),
});

const EXACT_SOURCE_AUTHORITY = Object.freeze({
  contract: "PHASE1_SOURCE_AUTHORITY_RESOLUTION_V2",
  producer: "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1",
  authorityType: "FINITE_TASK_ADMISSION",
  draftSourceOnly: false,
  mergeAuthorityGranted: false,
  findings: [],
  ...EXACT_SOURCE_IDENTITY,
});

test("committed lease evidence is verified against its exact typed candidate head", () => {
  assert.equal(
    phase1CommittedEvidenceHead(EXACT_SOURCE_AUTHORITY, EXACT_SOURCE_IDENTITY),
    EXACT_SOURCE_IDENTITY.headSha,
  );
});

test("candidate evidence head cannot transfer across authority or source identities", () => {
  const candidates = [
    { authority: { ...EXACT_SOURCE_AUTHORITY, contract: "UNTRUSTED" } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, producer: "UNTRUSTED" } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, authorityType: "DRAFT_SOURCE_SCOPE" } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, draftSourceOnly: true } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, mergeAuthorityGranted: true } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, findings: ["PHASE1_SOURCE_AUTHORITY_INVALID"] } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, headSha: "a".repeat(40) } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, sourceTree: "a".repeat(40) } },
    { authority: { ...EXACT_SOURCE_AUTHORITY, baseSha: "a".repeat(40) } },
    { authority: EXACT_SOURCE_AUTHORITY, identity: { ...EXACT_SOURCE_IDENTITY, pr: 479 } },
    { authority: EXACT_SOURCE_AUTHORITY, identity: { ...EXACT_SOURCE_IDENTITY, headSha: "not-a-sha" } },
  ];

  for (const candidate of candidates) {
    assert.equal(
      phase1CommittedEvidenceHead(
        candidate.authority,
        candidate.identity ?? EXACT_SOURCE_IDENTITY,
      ),
      null,
    );
  }
});
