import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { SENTINEL_COLLECTOR_ADAPTERS } from "../../src/adapters/sentinel.mjs";
import { SENTINEL_STATEMENTS } from "../../src/database-statements/sentinel.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_SENTINEL_COLLECTOR",
  "dbRole": "cognitive_sentinel_collector",
  "edgeSource": "supabase/functions/cognitive-sentinel-collector/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_SENTINEL_COLLECTOR_HYPERDRIVE",
  "maxRequestBytes": 98304,
  "networkEgress": [],
  "operations": {
    "collect_sentinel_run": {
      "payloadKeys": [
        "action",
        "collectionIdempotencyHash",
        "environment",
        "evaluationExpiresAt",
        "evidenceManifestHash",
        "metricManifest",
        "observationFinishedAt",
        "observationStartedAt",
        "physicalProofStatus",
        "platform",
        "projectId",
        "resultStatus",
        "routeOrSurface",
        "runtimeIdentityHash",
        "sentinelKey",
        "sourceBuildHash",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.collect_sentinel_run"
      ]
    }
  },
  "provider": "none",
  "runtimeConfiguration": {},
  "requiredSecrets": [
    "COGNITIVE_SENTINEL_COLLECTOR_INVOKE_SHA256",
    "COGNITIVE_SENTINEL_COLLECTOR_ASSERTION"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-sentinel-collector"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: SENTINEL_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => SENTINEL_COLLECTOR_ADAPTERS[operation] ?? null,
});
