import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { LIVEKIT_COLLECTOR_ADAPTERS } from "../../src/adapters/livekit.mjs";
import { LIVEKIT_STATEMENTS } from "../../src/database-statements/livekit.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_LIVEKIT_EXPERIENCE_COLLECTOR",
  "dbRole": "cognitive_livekit_experience_collector",
  "edgeSource": "supabase/functions/cognitive-livekit-experience-collector/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_LIVEKIT_EXPERIENCE_COLLECTOR_HYPERDRIVE",
  "maxRequestBytes": 98304,
  "networkEgress": [],
  "operations": {
    "prepare_run": {
      "payloadKeys": [
        "action",
        "evidenceManifestHash",
        "metricManifest",
        "observationFinishedAt",
        "observationStartedAt",
        "platform",
        "routeOrSurface",
        "runtimeIdentityHash",
        "sourceBuildHash"
      ],
      "rpcEntrypoints": []
    },
    "record_run": {
      "payloadKeys": [
        "action",
        "evidenceManifestHash",
        "metricManifest",
        "observationFinishedAt",
        "observationStartedAt",
        "platform",
        "routeOrSurface",
        "runtimeIdentityHash",
        "sourceBuildHash"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.collect_livekit_sentinel_run"
      ]
    }
  },
  "provider": "none",
  "runtimeConfiguration": {},
  "requiredSecrets": [
    "COGNITIVE_LIVEKIT_EXPERIENCE_COLLECTOR_INVOKE_SHA256",
    "COGNITIVE_LIVEKIT_SENTINEL_ASSERTION"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-livekit-experience-collector"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: LIVEKIT_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => LIVEKIT_COLLECTOR_ADAPTERS[operation] ?? null,
});
