import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";
import { createScopedDatabasePort } from "../../src/database-core.mjs";
import { GITHUB_BROKER_ADAPTERS } from "../../src/adapters/github.mjs";
import { GITHUB_STATEMENTS } from "../../src/database-statements/github.mjs";

const principal = Object.freeze({
  "binding": "COGNITIVE_GITHUB_DRAFT_PR_BROKER",
  "dbRole": "cognitive_github_draft_pr_broker",
  "edgeSource": "supabase/functions/cognitive-github-draft-pr-broker/index.ts",
  "forbiddenSecrets": [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL"
  ],
  "hyperdriveBinding": "COGNITIVE_GITHUB_DRAFT_PR_BROKER_HYPERDRIVE",
  "internalBindings": [
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256",
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN"
  ],
  "loginRole": "cognitive_github_draft_pr_broker_login",
  "maxRequestBytes": 65536,
  "networkEgress": [
    "https://api.github.com"
  ],
  "operations": {
    "status": {
      "payloadKeys": [
        "action"
      ],
      "rpcEntrypoints": []
    },
    "attest_provider_readback": {
      "payloadKeys": [
        "action",
        "projectId",
        "taskId"
      ],
      "rpcEntrypoints": [
        "cognitive_record_github_draft_pr_provider_readback"
      ]
    },
    "execute_canary": {
      "payloadKeys": [
        "action",
        "approvalScopeHash",
        "baseCommit",
        "branchName",
        "callId",
        "canaryKey",
        "capabilityId",
        "capabilityNonce",
        "capabilityToken",
        "commitMessage",
        "content",
        "path",
        "planSnapshotHash",
        "preflightReceiptId",
        "priorBlobSha",
        "projectId",
        "requiredTestsHash",
        "resourceLeaseId",
        "taskId",
        "title"
      ],
      "rpcEntrypoints": [
        "cognitive_consume_github_draft_pr_capability",
        "cognitive_accept_github_draft_pr_tool_result"
      ]
    }
  },
  "provider": "github_app_repository_installation",
  "providerBindings": [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_REPOSITORY_ID"
  ],
  "runtimeConfiguration": {},
  "requiredSecrets": [
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256",
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN",
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_REPOSITORY_ID"
  ],
  "rpcAllowlist": [
    "cognitive_accept_github_draft_pr_tool_result",
    "cognitive_consume_github_draft_pr_capability",
    "cognitive_record_github_draft_pr_provider_readback",
    "cognitive_runtime.runtime_revocation_status",
    "cognitive_runtime.runtime_role_preflight"
  ],
  "rpcHooks": [
    "cognitive_runtime.runtime_role_preflight",
    "cognitive_runtime.runtime_revocation_status"
  ],
  "workerName": "chillywood-level01-github-draft-pr-broker"
});
const createDatabase = (options) => createScopedDatabasePort({
  ...options,
  domainStatements: GITHUB_STATEMENTS,
});

export default createPrivateWorkerEntrypoint({
  createDatabase,
  principal,
  resolveAdapter: (operation) => GITHUB_BROKER_ADAPTERS[operation] ?? null,
});
