import { isStrictBaselineExecutorPayload } from "./index.ts";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};
const hash = (value: string): string => value.repeat(64);
const baselineHash =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const manifestHash =
  "7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df";
const executionId = "11111111-1111-4111-8111-111111111111";

const claimPayload = () => ({
  action: "claim",
  approvalHash: hash("a"),
  approvalVersionId: "22222222-2222-4222-8222-222222222222",
  baselineHash,
  baselineId: "chillywood-product-experience-baseline-v1",
  branchName: "codex/cognitive-level01-operationalization",
  budgetHash: hash("b"),
  decisionManifestHash: hash("c"),
  environment: "production",
  evaluatorRequirementHash: hash("d"),
  operation: "visual_experience_canary",
  planSnapshotHash: hash("e"),
  platform: "android",
  projectId: "33333333-3333-4333-8333-333333333333",
  provider: "visual_sentinel",
  repositoryFullName: "Chillywood2025/chillywood-mobile",
  rollbackHash: hash("f"),
  selectedOption: "creator_balanced",
  selectedOptionCode: "C",
  sourceOptionsManifestHash: manifestHash,
  targetResourceHash: baselineHash,
  taskId: "44444444-4444-4444-8444-444444444444",
  testsHash: hash("1"),
});

Deno.test("baseline executor claim is exact Option C only", () => {
  assert(
    isStrictBaselineExecutorPayload(claimPayload()),
    "valid claim rejected",
  );
  for (
    const rejected of [
      { ...claimPayload(), selectedOptionCode: "A" },
      { ...claimPayload(), selectedOption: "dense_discovery" },
      { ...claimPayload(), baselineHash: hash("9") },
      { ...claimPayload(), sourceOptionsManifestHash: hash("8") },
      { ...claimPayload(), provider: "repository" },
      { ...claimPayload(), operation: "set_switch" },
      { ...claimPayload(), environment: "staging" },
      { ...claimPayload(), extraAuthority: true },
    ]
  ) {
    assert(
      !isStrictBaselineExecutorPayload(rejected),
      "noncanonical claim accepted",
    );
  }
});

Deno.test("baseline executor accepts only closed transition and stage schemas", () => {
  assert(
    isStrictBaselineExecutorPayload({
      action: "transition",
      executionId,
      nextState: "preflight",
    }),
    "preflight rejected",
  );
  assert(
    !isStrictBaselineExecutorPayload({
      action: "transition",
      executionId,
      nextState: "completed",
    }),
    "direct completion transition accepted",
  );
  assert(
    isStrictBaselineExecutorPayload({
      action: "stage_selection",
      baselineHash,
      baselineId: "chillywood-product-experience-baseline-v1",
      executionId,
      selectedOption: "creator_balanced",
      selectedOptionCode: "C",
      sourceCommit: "1".repeat(40),
      sourceOptionsManifestHash: manifestHash,
    }),
    "canonical stage rejected",
  );
});

Deno.test("baseline executor exposes completion, persistence, and failure only", () => {
  assert(
    isStrictBaselineExecutorPayload({
      action: "complete",
      evaluatorProofHash: hash("2"),
      executionId,
      executionReceiptHash: hash("3"),
    }),
    "completion rejected",
  );
  assert(
    isStrictBaselineExecutorPayload({ action: "persist", executionId }),
    "persistence rejected",
  );
  assert(
    isStrictBaselineExecutorPayload({
      action: "fail",
      executionId,
      failureHash: hash("4"),
    }),
    "failure rejected",
  );
  for (const action of ["merge", "deploy", "release", "set_switch"]) {
    assert(
      !isStrictBaselineExecutorPayload({ action, executionId }),
      `${action} authority accepted`,
    );
  }
});
