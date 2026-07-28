import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { PRODUCT_QUALITY_EVALUATOR_ADAPTERS } from "../../src/adapters/evaluator.mjs";
import { EVALUATOR_STATEMENTS } from "../../src/database-statements/evaluator.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_PRODUCT_QUALITY_EVALUATOR",
  "dbRole": "cognitive_product_quality_evaluator",
  "edgeSource": "supabase/functions/cognitive-product-quality-evaluator/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_HYPERDRIVE",
  "internalBindings": [
    "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_INVOKE_SHA256",
    "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION"
  ],
  "loginRole": "cognitive_product_quality_evaluator_login",
  "maxRequestBytes": 32768,
  "networkEgress": [],
  "operations": {
    "evaluate_product_baseline_selection": {
      "payloadKeys": [
        "action",
        "executionId",
        "executionReceiptHash"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.product_quality_evaluator_snapshot",
        "governance_evaluate_product_experience_baseline_v1"
      ]
    },
    "attest_livekit_bounded_failure_no_finding": {
      "payloadKeys": [
        "action",
        "sentinelRunId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.product_quality_evaluator_snapshot",
        "cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding"
      ]
    },
    "evaluate_sentinel_detection": {
      "payloadKeys": [
        "action",
        "affectedComponentsHash",
        "buildRuntimeHash",
        "confidence",
        "evidenceHashes",
        "findingClass",
        "physicalProofStatus",
        "proposedNextInvestigationHash",
        "providerBackendStateHash",
        "reproductionState",
        "routeOrSurface",
        "sentinelRunId",
        "severity",
        "suspectedLayer",
        "userImpactHash"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.product_quality_evaluator_snapshot",
        "product_quality_detection_assessment_hash",
        "product_quality_record_sentinel_evaluator_proof"
      ]
    },
    "evaluate_sentinel_no_finding": {
      "payloadKeys": [
        "action",
        "sentinelRunId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.product_quality_evaluator_snapshot",
        "cognitive_runtime.product_quality_no_finding_assessment_hash",
        "product_quality_record_sentinel_evaluator_proof"
      ]
    },
    "evaluate_sentinel_resolution": {
      "payloadKeys": [
        "action",
        "findingId",
        "resolutionReasonHash",
        "sentinelRunId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.product_quality_evaluator_snapshot",
        "product_quality_resolution_assessment_hash",
        "product_quality_record_sentinel_evaluator_proof"
      ]
    }
  },
  "provider": "none",
  "providerBindings": [],
  "runtimeConfiguration": {},
  "requiredSecrets": [
    "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_INVOKE_SHA256",
    "COGNITIVE_PRODUCT_QUALITY_EVALUATOR_ASSERTION"
  ],
  "rpcAllowlist": [
    "cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding",
    "cognitive_runtime.product_quality_evaluator_snapshot",
    "cognitive_runtime.product_quality_no_finding_assessment_hash",
    "cognitive_runtime.runtime_revocation_status",
    "cognitive_runtime.runtime_role_preflight",
    "governance_evaluate_product_experience_baseline_v1",
    "product_quality_detection_assessment_hash",
    "product_quality_record_sentinel_evaluator_proof",
    "product_quality_resolution_assessment_hash"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-product-quality-evaluator"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: EVALUATOR_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => PRODUCT_QUALITY_EVALUATOR_ADAPTERS[operation] ?? null,
});
