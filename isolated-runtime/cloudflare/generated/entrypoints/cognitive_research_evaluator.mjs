import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { RESEARCH_EVALUATOR_ADAPTERS } from "../../src/adapters/research-evaluator.mjs";
import { RESEARCH_EVALUATOR_STATEMENTS } from "../../src/database-statements/research-evaluator.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_RESEARCH_EVALUATOR",
  "dbRole": "cognitive_research_evaluator",
  "edgeSource": "supabase/functions/cognitive-research-evaluator/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_RESEARCH_EVALUATOR_HYPERDRIVE",
  "internalBindings": [
    "COGNITIVE_RESEARCH_EVALUATOR_INVOKE_SHA256",
    "COGNITIVE_INDEPENDENT_EVALUATOR_SERVICE_TOKEN"
  ],
  "loginRole": "cognitive_research_evaluator_login",
  "maxRequestBytes": 32768,
  "networkEgress": [],
  "operations": {
    "evaluate_research_claim": {
      "payloadKeys": [
        "action",
        "environment",
        "platform",
        "projectId",
        "researchClaimId",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.research_evaluator_snapshot",
        "cognitive_runtime.derive_research_evaluation_with_readback"
      ]
    },
    "evaluate_contradiction_resolution": {
      "payloadKeys": [
        "action",
        "boundedEvidence",
        "contradictionId",
        "environment",
        "platform",
        "projectId",
        "resolutionSourceId",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_resolve_public_research_contradiction"
      ]
    }
  },
  "provider": "none",
  "providerBindings": [],
  "runtimeConfiguration": {},
  "requiredSecrets": [
    "COGNITIVE_RESEARCH_EVALUATOR_INVOKE_SHA256",
    "COGNITIVE_INDEPENDENT_EVALUATOR_SERVICE_TOKEN"
  ],
  "rpcAllowlist": [
    "cognitive_resolve_public_research_contradiction",
    "cognitive_runtime.derive_research_evaluation_with_readback",
    "cognitive_runtime.research_evaluator_snapshot",
    "cognitive_runtime.runtime_revocation_status",
    "cognitive_runtime.runtime_role_preflight"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-research-evaluator"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: RESEARCH_EVALUATOR_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => RESEARCH_EVALUATOR_ADAPTERS[operation] ?? null,
});
