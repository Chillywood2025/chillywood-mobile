import { ready } from "./helpers.mjs";

const BASELINE_ID = "chillywood-product-experience-baseline-v1";
const BASELINE_HASH =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const SOURCE_OPTIONS_HASH =
  "7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df";
const SERVICE_IDENTITY = "product_experience_baseline_service";
const assertion = (env) =>
  env.COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION;

export const PRODUCT_BASELINE_ADAPTERS = Object.freeze({
  claim: ready(["claim_approved_action"], ({ database, env, payload }) =>
    database.call("baselineClaim", [
      payload.approvalVersionId,
      SERVICE_IDENTITY,
      assertion(env),
      payload.decisionManifestHash,
      payload.planSnapshotHash,
      payload.approvalHash,
      payload.taskId,
      payload.projectId,
      "Chillywood2025/chillywood-mobile",
      payload.branchName,
      payload.platform,
      payload.environment,
      "visual_sentinel",
      "visual_experience_canary",
      BASELINE_HASH,
      payload.budgetHash,
      payload.testsHash,
      payload.evaluatorRequirementHash,
      payload.rollbackHash,
    ])
  ),
  transition: ready(
    ["begin_approved_execution"],
    ({ database, env, payload }) =>
      database.call("baselineTransition", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
        payload.nextState,
      ]),
  ),
  stage_selection: ready(
    ["stage_product_baseline"],
    ({ database, env, payload }) =>
      database.call("baselineStage", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
        payload.sourceCommit,
        BASELINE_ID,
        "C",
        "creator_balanced",
        BASELINE_HASH,
        SOURCE_OPTIONS_HASH,
      ]),
  ),
  complete: ready(
    ["complete_approved_execution"],
    ({ database, env, payload }) =>
      database.call("baselineComplete", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
        payload.executionReceiptHash,
        payload.evaluatorProofHash,
      ]),
  ),
  persist: ready(
    ["persist_product_baseline"],
    ({ database, env, payload }) =>
      database.call("baselinePersist", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
      ]),
  ),
  fail: ready(["fail_approved_execution"], ({ database, env, payload }) =>
    database.call("baselineFail", [
      payload.executionId,
      SERVICE_IDENTITY,
      assertion(env),
      payload.failureHash,
    ])
  ),
});
