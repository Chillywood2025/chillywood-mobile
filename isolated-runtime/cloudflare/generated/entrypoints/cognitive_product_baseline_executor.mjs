import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { PRODUCT_BASELINE_ADAPTERS } from "../../src/adapters/baseline.mjs";
import { BASELINE_STATEMENTS } from "../../src/database-statements/baseline.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_PRODUCT_BASELINE_EXECUTOR",
  "dbRole": "cognitive_product_baseline_executor",
  "edgeSource": "supabase/functions/cognitive-product-baseline-executor/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_PRODUCT_BASELINE_EXECUTOR_HYPERDRIVE",
  "maxRequestBytes": 24576,
  "networkEgress": [],
  "operations": {
    "claim": {
      "payloadKeys": [
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
        "testsHash"
      ],
      "rpcEntrypoints": [
        "governance_claim_approved_action"
      ]
    },
    "transition": {
      "payloadKeys": [
        "action",
        "executionId",
        "nextState"
      ],
      "rpcEntrypoints": [
        "governance_begin_approved_execution"
      ]
    },
    "stage_selection": {
      "payloadKeys": [
        "action",
        "baselineHash",
        "baselineId",
        "executionId",
        "selectedOption",
        "selectedOptionCode",
        "sourceCommit",
        "sourceOptionsManifestHash"
      ],
      "rpcEntrypoints": [
        "governance_stage_product_experience_baseline_v1"
      ]
    },
    "complete": {
      "payloadKeys": [
        "action",
        "evaluatorProofHash",
        "executionId",
        "executionReceiptHash"
      ],
      "rpcEntrypoints": [
        "governance_complete_approved_execution"
      ]
    },
    "persist": {
      "payloadKeys": [
        "action",
        "executionId"
      ],
      "rpcEntrypoints": [
        "governance_product_baseline_persist_completed_execution"
      ]
    },
    "fail": {
      "payloadKeys": [
        "action",
        "executionId",
        "failureHash"
      ],
      "rpcEntrypoints": [
        "governance_fail_approved_execution"
      ]
    }
  },
  "provider": "none",
  "requiredSecrets": [
    "COGNITIVE_PRODUCT_BASELINE_EXECUTOR_INVOKE_SHA256",
    "COGNITIVE_PRODUCT_BASELINE_SERVICE_ASSERTION"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-product-baseline-executor"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: BASELINE_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => PRODUCT_BASELINE_ADAPTERS[operation] ?? null,
});
