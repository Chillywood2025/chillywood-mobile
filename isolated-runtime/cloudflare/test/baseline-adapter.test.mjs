import assert from "node:assert/strict";
import test from "node:test";
import {
  isStrictIsolatedBaselinePayload,
  PRODUCT_BASELINE_ADAPTERS,
} from "../src/adapters/baseline.mjs";

const BASELINE_ID = "chillywood-product-experience-baseline-v1";
const BASELINE_HASH =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const SOURCE_OPTIONS_HASH =
  "7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df";
const EXECUTION_ID = "11111111-1111-4111-8111-111111111111";
const APPROVAL_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";
const hash = (value) => value.repeat(64);
const env = {
  COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION: "assertion-not-logged",
};

const claimPayload = () => ({
  action: "claim",
  approvalHash: hash("a"),
  approvalVersionId: APPROVAL_VERSION_ID,
  baselineHash: BASELINE_HASH,
  baselineId: BASELINE_ID,
  branchName: "codex/cognitive-level01-isolated-runtime-activation",
  budgetHash: hash("b"),
  decisionManifestHash: hash("c"),
  environment: "production",
  evaluatorRequirementHash: hash("d"),
  operation: "visual_experience_canary",
  planSnapshotHash: hash("e"),
  platform: "android",
  projectId: PROJECT_ID,
  provider: "visual_sentinel",
  repositoryFullName: "Chillywood2025/chillywood-mobile",
  rollbackHash: hash("f"),
  selectedOption: "creator_balanced",
  selectedOptionCode: "C",
  sourceOptionsManifestHash: SOURCE_OPTIONS_HASH,
  targetResourceHash: BASELINE_HASH,
  taskId: TASK_ID,
  testsHash: hash("1"),
});

const stagePayload = () => ({
  action: "stage_selection",
  baselineHash: BASELINE_HASH,
  baselineId: BASELINE_ID,
  executionId: EXECUTION_ID,
  selectedOption: "creator_balanced",
  selectedOptionCode: "C",
  sourceCommit: "1".repeat(40),
  sourceOptionsManifestHash: SOURCE_OPTIONS_HASH,
});

const recordingDatabase = () => {
  const calls = [];
  return {
    calls,
    call: async (...arguments_) => {
      calls.push(arguments_);
      return { accepted: true };
    },
  };
};

test("isolated baseline claim accepts and forwards only reviewed Option C bindings", async () => {
  const database = recordingDatabase();
  const payload = claimPayload();
  assert.equal(isStrictIsolatedBaselinePayload(payload), true);

  await PRODUCT_BASELINE_ADAPTERS.claim.execute({
    database,
    env,
    payload,
  });

  assert.equal(database.calls.length, 1);
  assert.deepEqual(database.calls[0], [
    "baselineClaim",
    [
      APPROVAL_VERSION_ID,
      "product_experience_baseline_service",
      env.COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION,
      payload.decisionManifestHash,
      payload.planSnapshotHash,
      payload.approvalHash,
      TASK_ID,
      PROJECT_ID,
      payload.repositoryFullName,
      payload.branchName,
      payload.platform,
      payload.environment,
      payload.provider,
      payload.operation,
      payload.targetResourceHash,
      payload.budgetHash,
      payload.testsHash,
      payload.evaluatorRequirementHash,
      payload.rollbackHash,
    ],
  ]);
});

test("isolated baseline claim rejects every caller-controlled selection mismatch before database access", async () => {
  const rejected = [
    { ...claimPayload(), baselineId: "chillywood-product-experience-baseline-v2" },
    { ...claimPayload(), selectedOptionCode: "A" },
    { ...claimPayload(), selectedOption: "dense_discovery" },
    { ...claimPayload(), baselineHash: hash("9") },
    { ...claimPayload(), sourceOptionsManifestHash: hash("8") },
    { ...claimPayload(), targetResourceHash: hash("7") },
    { ...claimPayload(), approvalVersionId: "not-an-approval-version" },
    {
      ...claimPayload(),
      sourceOptionsVersion: "chillywood-product-experience-baseline-options-v2",
    },
    {
      ...claimPayload(),
      selectionStatus: "owner_approved",
    },
  ];

  for (const payload of rejected) {
    const database = recordingDatabase();
    assert.equal(isStrictIsolatedBaselinePayload(payload), false);
    await assert.rejects(
      async () =>
        PRODUCT_BASELINE_ADAPTERS.claim.execute({ database, env, payload }),
      /product_baseline_payload_rejected/u,
    );
    assert.equal(database.calls.length, 0);
  }
});

test("isolated baseline staging rejects mismatches instead of replacing them with constants", async () => {
  const canonical = stagePayload();
  const database = recordingDatabase();
  assert.equal(isStrictIsolatedBaselinePayload(canonical), true);
  await PRODUCT_BASELINE_ADAPTERS.stage_selection.execute({
    database,
    env,
    payload: canonical,
  });
  assert.deepEqual(database.calls, [[
    "baselineStage",
    [
      EXECUTION_ID,
      "product_experience_baseline_service",
      env.COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION,
      canonical.sourceCommit,
      canonical.baselineId,
      canonical.selectedOptionCode,
      canonical.selectedOption,
      canonical.baselineHash,
      canonical.sourceOptionsManifestHash,
    ],
  ]]);

  for (
    const payload of [
      { ...stagePayload(), baselineId: "chillywood-product-experience-baseline-v2" },
      { ...stagePayload(), selectedOptionCode: "B" },
      { ...stagePayload(), selectedOption: "cinematic" },
      { ...stagePayload(), baselineHash: hash("9") },
      { ...stagePayload(), sourceOptionsManifestHash: hash("8") },
      { ...stagePayload(), sourceCommit: "not-a-source-commit" },
    ]
  ) {
    const rejectedDatabase = recordingDatabase();
    assert.equal(isStrictIsolatedBaselinePayload(payload), false);
    await assert.rejects(
      async () =>
        PRODUCT_BASELINE_ADAPTERS.stage_selection.execute({
          database: rejectedDatabase,
          env,
          payload,
        }),
      /product_baseline_payload_rejected/u,
    );
    assert.equal(rejectedDatabase.calls.length, 0);
  }
});

test("isolated baseline lifecycle schemas remain closed", () => {
  assert.equal(isStrictIsolatedBaselinePayload({
    action: "transition",
    executionId: EXECUTION_ID,
    nextState: "preflight",
  }), true);
  assert.equal(isStrictIsolatedBaselinePayload({
    action: "transition",
    executionId: EXECUTION_ID,
    nextState: "completed",
  }), false);
  assert.equal(isStrictIsolatedBaselinePayload({
    action: "complete",
    evaluatorProofHash: hash("2"),
    executionId: EXECUTION_ID,
    executionReceiptHash: hash("3"),
  }), true);
  assert.equal(isStrictIsolatedBaselinePayload({
    action: "persist",
    executionId: EXECUTION_ID,
  }), true);
  assert.equal(isStrictIsolatedBaselinePayload({
    action: "fail",
    executionId: EXECUTION_ID,
    failureHash: hash("4"),
  }), true);
  assert.equal(isStrictIsolatedBaselinePayload({
    action: "persist",
    executionId: EXECUTION_ID,
    status: "owner_approved",
  }), false);
});
