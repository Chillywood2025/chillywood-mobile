import { ready } from "./helpers.mjs";

const BASELINE_ID = "chillywood-product-experience-baseline-v1";
const BASELINE_HASH =
  "34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba";
const SOURCE_OPTIONS_HASH =
  "7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df";
const SERVICE_IDENTITY = "product_experience_baseline_service";
const SELECTED_OPTION_CODE = "C";
const SELECTED_OPTION = "creator_balanced";
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const LOWER_HEX_40 = /^[a-f0-9]{40}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const BRANCH = /^codex\/[a-z0-9][a-z0-9/_-]{2,120}$/u;
const CLAIM_KEYS = Object.freeze([
  "action",
  "approvalHash",
  "approvalVersionId",
  "baselineHash",
  "baselineId",
  "branchName",
  "budgetHash",
  "decisionManifestHash",
  "environment",
  "evaluatorRequirementHash",
  "operation",
  "planSnapshotHash",
  "platform",
  "projectId",
  "provider",
  "repositoryFullName",
  "rollbackHash",
  "selectedOption",
  "selectedOptionCode",
  "sourceOptionsManifestHash",
  "targetResourceHash",
  "taskId",
  "testsHash",
]);
const TRANSITION_KEYS = Object.freeze(["action", "executionId", "nextState"]);
const STAGE_KEYS = Object.freeze([
  "action",
  "baselineHash",
  "baselineId",
  "executionId",
  "selectedOption",
  "selectedOptionCode",
  "sourceCommit",
  "sourceOptionsManifestHash",
]);
const COMPLETE_KEYS = Object.freeze([
  "action",
  "evaluatorProofHash",
  "executionId",
  "executionReceiptHash",
]);
const PERSIST_KEYS = Object.freeze(["action", "executionId"]);
const FAIL_KEYS = Object.freeze(["action", "executionId", "failureHash"]);
const NEXT_STATES = new Set(["preflight", "executing", "evaluating"]);

const assertion = (env) =>
  env.COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
};

const exactSelection = (value) =>
  value.baselineId === BASELINE_ID &&
  value.selectedOptionCode === SELECTED_OPTION_CODE &&
  value.selectedOption === SELECTED_OPTION &&
  value.baselineHash === BASELINE_HASH &&
  value.sourceOptionsManifestHash === SOURCE_OPTIONS_HASH;

export const isStrictIsolatedBaselinePayload = (value) => {
  if (!isRecord(value)) return false;
  if (value.action === "claim") {
    return exactKeys(value, CLAIM_KEYS) &&
      UUID.test(value.approvalVersionId) &&
      UUID.test(value.taskId) &&
      UUID.test(value.projectId) &&
      LOWER_HEX_64.test(value.decisionManifestHash) &&
      LOWER_HEX_64.test(value.planSnapshotHash) &&
      LOWER_HEX_64.test(value.approvalHash) &&
      LOWER_HEX_64.test(value.targetResourceHash) &&
      LOWER_HEX_64.test(value.budgetHash) &&
      LOWER_HEX_64.test(value.testsHash) &&
      LOWER_HEX_64.test(value.evaluatorRequirementHash) &&
      LOWER_HEX_64.test(value.rollbackHash) &&
      value.repositoryFullName === "Chillywood2025/chillywood-mobile" &&
      BRANCH.test(value.branchName) &&
      !/(^|\/)(main|master|release)(\/|$)/iu.test(value.branchName) &&
      ["android", "ios", "web", "shared"].includes(value.platform) &&
      value.environment === "production" &&
      value.provider === "visual_sentinel" &&
      value.operation === "visual_experience_canary" &&
      value.targetResourceHash === BASELINE_HASH &&
      exactSelection(value);
  }
  if (value.action === "transition") {
    return exactKeys(value, TRANSITION_KEYS) &&
      UUID.test(value.executionId) &&
      NEXT_STATES.has(value.nextState);
  }
  if (value.action === "stage_selection") {
    return exactKeys(value, STAGE_KEYS) &&
      UUID.test(value.executionId) &&
      LOWER_HEX_40.test(value.sourceCommit) &&
      exactSelection(value);
  }
  if (value.action === "complete") {
    return exactKeys(value, COMPLETE_KEYS) &&
      UUID.test(value.executionId) &&
      LOWER_HEX_64.test(value.executionReceiptHash) &&
      LOWER_HEX_64.test(value.evaluatorProofHash);
  }
  if (value.action === "persist") {
    return exactKeys(value, PERSIST_KEYS) && UUID.test(value.executionId);
  }
  if (value.action === "fail") {
    return exactKeys(value, FAIL_KEYS) &&
      UUID.test(value.executionId) &&
      LOWER_HEX_64.test(value.failureHash);
  }
  return false;
};

const readyBaseline = (databaseOperations, execute) =>
  ready(databaseOperations, (context) => {
    if (!isStrictIsolatedBaselinePayload(context.payload)) {
      throw new Error("product_baseline_payload_rejected");
    }
    return execute(context);
  });

export const PRODUCT_BASELINE_ADAPTERS = Object.freeze({
  claim: readyBaseline(
    ["claim_approved_action"],
    ({ database, env, payload }) =>
    database.call("baselineClaim", [
      payload.approvalVersionId,
      SERVICE_IDENTITY,
      assertion(env),
      payload.decisionManifestHash,
      payload.planSnapshotHash,
      payload.approvalHash,
      payload.taskId,
      payload.projectId,
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
    ]),
  ),
  transition: readyBaseline(
    ["begin_approved_execution"],
    ({ database, env, payload }) =>
      database.call("baselineTransition", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
        payload.nextState,
      ]),
  ),
  stage_selection: readyBaseline(
    ["stage_product_baseline"],
    ({ database, env, payload }) =>
      database.call("baselineStage", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
        payload.sourceCommit,
        payload.baselineId,
        payload.selectedOptionCode,
        payload.selectedOption,
        payload.baselineHash,
        payload.sourceOptionsManifestHash,
      ]),
  ),
  complete: readyBaseline(
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
  persist: readyBaseline(
    ["persist_product_baseline"],
    ({ database, env, payload }) =>
      database.call("baselinePersist", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
      ]),
  ),
  fail: readyBaseline(
    ["fail_approved_execution"],
    ({ database, env, payload }) =>
      database.call("baselineFail", [
        payload.executionId,
        SERVICE_IDENTITY,
        assertion(env),
        payload.failureHash,
      ]),
  ),
});
