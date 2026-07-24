import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { PRODUCT_QUALITY_TRIAGE_ADAPTERS } from "../../src/adapters/triage.mjs";
import { TRIAGE_STATEMENTS } from "../../src/database-statements/triage.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_PRODUCT_QUALITY_TRIAGE",
  "dbRole": "cognitive_product_quality_triage",
  "edgeSource": "supabase/functions/cognitive-product-quality-triage/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_PRODUCT_QUALITY_TRIAGE_HYPERDRIVE",
  "maxRequestBytes": 32768,
  "networkEgress": [],
  "operations": {
    "triage_detection": {
      "payloadKeys": [
        "action",
        "affectedComponentsHash",
        "buildRuntimeHash",
        "confidence",
        "evaluatorProofHash",
        "evaluatorProofId",
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
        "product_quality_triage_detection"
      ]
    },
    "triage_resolution": {
      "payloadKeys": [
        "action",
        "evaluatorProofHash",
        "evaluatorProofId",
        "findingId",
        "resolutionReasonHash",
        "sentinelRunId"
      ],
      "rpcEntrypoints": [
        "product_quality_triage_resolution"
      ]
    }
  },
  "provider": "none",
  "requiredSecrets": [
    "COGNITIVE_PRODUCT_QUALITY_TRIAGE_INVOKE_SHA256",
    "COGNITIVE_PRODUCT_QUALITY_TRIAGE_ASSERTION"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-product-quality-triage"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: TRIAGE_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => PRODUCT_QUALITY_TRIAGE_ADAPTERS[operation] ?? null,
});
