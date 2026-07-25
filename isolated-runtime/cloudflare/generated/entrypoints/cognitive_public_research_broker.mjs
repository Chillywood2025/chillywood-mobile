import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { createResearchRetentionScheduledHandler } from "../../src/research-retention-scheduled.mjs";
import { PUBLIC_RESEARCH_BROKER_ADAPTERS } from "../../src/adapters/research-broker.mjs";
import { RESEARCH_BROKER_STATEMENTS } from "../../src/database-statements/research-broker.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_PUBLIC_RESEARCH_BROKER",
  "dbRole": "cognitive_public_research_broker",
  "edgeSource": "supabase/functions/cognitive-public-research-broker/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_PUBLIC_RESEARCH_BROKER_HYPERDRIVE",
  "maxRequestBytes": 1048576,
  "networkEgress": [
    "configured_peer_pinned_research_transport_origin_only"
  ],
  "operations": {
    "retrieve_source": {
      "payloadKeys": [
        "action",
        "authorityId",
        "citationLocator",
        "citationTitle",
        "environment",
        "evidenceQuery",
        "freshnessSeconds",
        "platform",
        "projectId",
        "publisher",
        "sourceType",
        "taskId",
        "url"
      ],
      "rpcEntrypoints": [
        "cognitive_record_public_research_source_v2"
      ]
    },
    "record_claim": {
      "payloadKeys": [
        "action",
        "boundedClaim",
        "canaryKey",
        "category",
        "confidence",
        "contradictionState",
        "environment",
        "freshnessDeadline",
        "platform",
        "projectId",
        "sourceIds",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.record_research_claim_with_readback"
      ]
    },
    "detect_contradiction": {
      "payloadKeys": [
        "action",
        "boundedEvidence",
        "claimId",
        "environment",
        "platform",
        "projectId",
        "sourceId",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_record_public_research_contradiction_detection"
      ]
    },
    "expire_public_memory": {
      "payloadKeys": [
        "action",
        "environment",
        "limit",
        "platform",
        "projectId",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_expire_public_research_maintenance"
      ]
    }
  },
  "provider": "isolated_pinned_research_transport",
  "runtimeConfiguration": {
    "COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL": "REPLACE_WITH_REVIEWED_PINNED_TRANSPORT_HTTPS_URL",
    "COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH": "REPLACE_WITH_REVIEWED_RETENTION_ATTESTATION_HASH",
    "COGNITIVE_RESEARCH_RETENTION_BATCH_LIMIT": "100",
    "COGNITIVE_RESEARCH_RETENTION_CRON": "17 * * * *",
    "COGNITIVE_RESEARCH_RETENTION_ENVIRONMENT": "production",
    "COGNITIVE_RESEARCH_RETENTION_MAXIMUM_BATCHES": "1",
    "COGNITIVE_RESEARCH_RETENTION_PLATFORM": "shared",
    "COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID": "REPLACE_WITH_REVIEWED_RETENTION_PROCESSOR_ATTESTATION_ID",
    "COGNITIVE_RESEARCH_RETENTION_PROJECT_ID": "REPLACE_WITH_REVIEWED_RETENTION_PROJECT_ID",
    "COGNITIVE_RESEARCH_RETENTION_TASK_ID": "REPLACE_WITH_REVIEWED_RETENTION_TASK_ID",
    "COGNITIVE_RESEARCH_RETENTION_TIMEOUT_MS": "50000"
  },
  "requiredSecrets": [
    "COGNITIVE_PUBLIC_RESEARCH_BROKER_INVOKE_SHA256",
    "COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN",
    "COGNITIVE_RESEARCH_PINNED_TRANSPORT_HMAC_KEY"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-public-research-broker"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: RESEARCH_BROKER_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  createScheduledHandler: createResearchRetentionScheduledHandler,
  principal,
  resolveAdapter: (operation) => PUBLIC_RESEARCH_BROKER_ADAPTERS[operation] ?? null,
});
