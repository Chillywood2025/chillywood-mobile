import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { SCHEDULER_ADAPTERS } from "../../src/adapters/scheduler.mjs";
import { SCHEDULER_STATEMENTS } from "../../src/database-statements/scheduler.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_LEVEL01_SCHEDULER",
  "dbRole": "cognitive_level01_scheduler",
  "edgeSource": "supabase/functions/cognitive-level01-scheduler/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_LEVEL01_SCHEDULER_HYPERDRIVE",
  "internalBindings": [
    "COGNITIVE_LEVEL01_SCHEDULER_INVOKE_SHA256",
    "COGNITIVE_LEVEL01_SCHEDULER_ASSERTION"
  ],
  "loginRole": "cognitive_level01_scheduler_login",
  "maxRequestBytes": 32768,
  "networkEgress": [],
  "operations": {
    "evaluate_prerequisites": {
      "payloadKeys": [
        "action",
        "projectId",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.scheduler_prerequisite_snapshot"
      ]
    },
    "dispatch_occurrence": {
      "payloadKeys": [
        "action",
        "capabilityId",
        "executionIdempotencyHash",
        "noWorkReasonHash",
        "objectiveHash",
        "projectId",
        "scheduleDefinitionId",
        "scheduleKey",
        "scheduledFor",
        "taskId",
        "workState"
      ],
      "rpcEntrypoints": [
        "cognitive_runtime.scheduler_prerequisite_snapshot",
        "cognitive_runtime.issue_recurring_child_task"
      ]
    }
  },
  "provider": "none",
  "providerBindings": [],
  "runtimeConfiguration": {},
  "requiredSecrets": [
    "COGNITIVE_LEVEL01_SCHEDULER_INVOKE_SHA256",
    "COGNITIVE_LEVEL01_SCHEDULER_ASSERTION"
  ],
  "rpcAllowlist": [
    "cognitive_runtime.issue_recurring_child_task",
    "cognitive_runtime.runtime_revocation_status",
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.scheduler_prerequisite_snapshot"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-level01-scheduler"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: SCHEDULER_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => SCHEDULER_ADAPTERS[operation] ?? null,
});
