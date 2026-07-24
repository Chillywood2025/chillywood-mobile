import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { MODEL_ROUTER_ADAPTERS } from "../../src/adapters/model.mjs";
import { NO_DOMAIN_STATEMENTS } from "../../src/database-statements/none.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_MODEL_ROUTER",
  "dbRole": "cognitive_model_router",
  "edgeSource": "supabase/functions/cognitive-model-router/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_MODEL_ROUTER_HYPERDRIVE",
  "maxRequestBytes": 65536,
  "networkEgress": [
    "configured_model_api_origin_only"
  ],
  "operations": {
    "assess_sanitized_evidence": {
      "payloadKeys": [
        "action",
        "approvalTargetHash",
        "assessmentId",
        "blindFirstRound",
        "budget",
        "capabilityId",
        "councilRole",
        "environment",
        "evidencePacket",
        "evidencePacketHash",
        "idempotencyKey",
        "platform",
        "projectId",
        "schemaVersion",
        "scopeHash",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_model_router_recover_expired",
        "cognitive_model_router_reserve",
        "cognitive_model_router_settle"
      ]
    }
  },
  "provider": "approved_model_provider",
  "requiredSecrets": [
    "COGNITIVE_MODEL_ROUTER_INVOKE_SHA256",
    "COGNITIVE_MODEL_ROUTER_SERVICE_ASSERTION",
    "COGNITIVE_MODEL_OPENAI_API_KEY"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-model-router"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: NO_DOMAIN_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => MODEL_ROUTER_ADAPTERS[operation] ?? null,
});
