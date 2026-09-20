import assert from "node:assert/strict";
import test from "node:test";
import { doctrineModelRevisionBlocksTask } from "../../scripts/assurance/engineering-closure.mjs";

const EXACT_TERMINAL_TRUTH = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-v1.json",
]);

const VALID_ADMISSION_CONTEXT = Object.freeze({
  type: "FINITE_TASK_ADMISSION_SUCCESSOR",
  ok: true,
  taskAuthorization: "VALID",
  source: "FINITE_TASK_ADMISSION_SUCCESSOR_V1",
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
    { taskContext: { ...VALID_ADMISSION_CONTEXT, taskAuthorization: "INVALID" } },
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
