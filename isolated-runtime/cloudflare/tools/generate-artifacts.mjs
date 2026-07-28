import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";
import { OPERATION_ADAPTERS } from "../src/operation-adapters.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = resolve(root, "generated");
const configs = resolve(generated, "wrangler");
const entrypoints = resolve(generated, "entrypoints");
await mkdir(configs, { recursive: true });
await mkdir(entrypoints, { recursive: true });

const stable = (value) =>
  JSON.stringify(value, Object.keys(value).sort(), 2);

const writeJson = async (path, value) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const common = {
  compatibility_date: "2026-07-24",
  compatibility_flags: ["nodejs_compat"],
  preview_urls: false,
  workers_dev: false,
};
const adapterModuleByPrincipal = Object.freeze({
  cognitive_github_draft_pr_broker: {
    exportName: "GITHUB_BROKER_ADAPTERS",
    path: "../../src/adapters/github.mjs",
  },
  cognitive_level01_scheduler: {
    exportName: "SCHEDULER_ADAPTERS",
    path: "../../src/adapters/scheduler.mjs",
  },
  cognitive_livekit_experience_collector: {
    exportName: "LIVEKIT_COLLECTOR_ADAPTERS",
    path: "../../src/adapters/livekit.mjs",
  },
  cognitive_model_router: {
    exportName: "MODEL_ROUTER_ADAPTERS",
    path: "../../src/adapters/model.mjs",
  },
  cognitive_product_baseline_executor: {
    exportName: "PRODUCT_BASELINE_ADAPTERS",
    path: "../../src/adapters/baseline.mjs",
  },
  cognitive_product_quality_evaluator: {
    exportName: "PRODUCT_QUALITY_EVALUATOR_ADAPTERS",
    path: "../../src/adapters/evaluator.mjs",
  },
  cognitive_product_quality_triage: {
    exportName: "PRODUCT_QUALITY_TRIAGE_ADAPTERS",
    path: "../../src/adapters/triage.mjs",
  },
  cognitive_public_research_broker: {
    exportName: "PUBLIC_RESEARCH_BROKER_ADAPTERS",
    path: "../../src/adapters/research-broker.mjs",
  },
  cognitive_research_evaluator: {
    exportName: "RESEARCH_EVALUATOR_ADAPTERS",
    path: "../../src/adapters/research-evaluator.mjs",
  },
  cognitive_sentinel_collector: {
    exportName: "SENTINEL_COLLECTOR_ADAPTERS",
    path: "../../src/adapters/sentinel.mjs",
  },
});
const databaseModuleByPrincipal = Object.freeze({
  cognitive_github_draft_pr_broker: {
    exportName: "GITHUB_STATEMENTS",
    path: "../../src/database-statements/github.mjs",
  },
  cognitive_level01_scheduler: {
    exportName: "SCHEDULER_STATEMENTS",
    path: "../../src/database-statements/scheduler.mjs",
  },
  cognitive_livekit_experience_collector: {
    exportName: "LIVEKIT_STATEMENTS",
    path: "../../src/database-statements/livekit.mjs",
  },
  cognitive_model_router: {
    exportName: "MODEL_STATEMENTS",
    path: "../../src/database-statements/model.mjs",
  },
  cognitive_product_baseline_executor: {
    exportName: "BASELINE_STATEMENTS",
    path: "../../src/database-statements/baseline.mjs",
  },
  cognitive_product_quality_evaluator: {
    exportName: "EVALUATOR_STATEMENTS",
    path: "../../src/database-statements/evaluator.mjs",
  },
  cognitive_product_quality_triage: {
    exportName: "TRIAGE_STATEMENTS",
    path: "../../src/database-statements/triage.mjs",
  },
  cognitive_public_research_broker: {
    exportName: "RESEARCH_BROKER_STATEMENTS",
    path: "../../src/database-statements/research-broker.mjs",
  },
  cognitive_research_evaluator: {
    exportName: "RESEARCH_EVALUATOR_STATEMENTS",
    path: "../../src/database-statements/research-evaluator.mjs",
  },
  cognitive_sentinel_collector: {
    exportName: "SENTINEL_STATEMENTS",
    path: "../../src/database-statements/sentinel.mjs",
  },
});

const gatewayConfig = {
  ...common,
  main: "../../src/gateway.mjs",
  name: RUNTIME_MANIFEST.gateway.workerName,
  services: RUNTIME_MANIFEST.principals.map((principal) => ({
    binding: principal.binding,
    service: principal.workerName,
  })),
  vars: {
    CF_ACCESS_AUD: "REPLACE_WITH_ACCESS_APPLICATION_AUD",
    CF_ACCESS_SERVICE_TOKEN_COMMON_NAME:
      "REPLACE_WITH_ACCESS_SERVICE_TOKEN_CLIENT_ID",
    CF_ACCESS_TEAM_DOMAIN:
      "https://replace-with-team.cloudflareaccess.com",
    COGNITIVE_PRINCIPAL_STATES:
      "REPLACE_WITH_EXPLICIT_PRINCIPAL_STATES",
    RUNTIME_SCHEMA_VERSION: RUNTIME_MANIFEST.schemaVersion,
    SOURCE_COMMIT: "REPLACE_WITH_REVIEWED_SUCCESSOR_COMMIT",
    SOURCE_BASE_COMMIT: RUNTIME_MANIFEST.sourceBaseCommit,
  },
  version_metadata: { binding: "WORKER_VERSION" },
};
await writeJson(
  resolve(configs, "gateway.wrangler.template.jsonc"),
  gatewayConfig,
);

for (const principal of RUNTIME_MANIFEST.principals) {
  const adapterModule = adapterModuleByPrincipal[principal.dbRole];
  const databaseModule = databaseModuleByPrincipal[principal.dbRole];
  if (!adapterModule) throw new Error("principal_adapter_export_missing");
  if (!databaseModule) throw new Error("principal_database_export_missing");
  const entrypoint = [
    'import { createPrivateWorkerEntrypoint } from "../../src/private-worker.mjs";',
    'import { createScopedDatabasePort } from "../../src/database-core.mjs";',
    ...(principal.dbRole === "cognitive_public_research_broker"
      ? [
        'import { createResearchRetentionScheduledHandler } from "../../src/research-retention-scheduled.mjs";',
      ]
      : []),
    `import { ${adapterModule.exportName} } from "${adapterModule.path}";`,
    `import { ${databaseModule.exportName} } from "${databaseModule.path}";`,
    "",
    `const principal = Object.freeze(${JSON.stringify(principal, null, 2)});`,
    `const createDatabase = (options) => createScopedDatabasePort({`,
    "  ...options,",
    `  domainStatements: ${databaseModule.exportName},`,
    "});",
    "",
    "export default createPrivateWorkerEntrypoint({",
    "  createDatabase,",
    ...(principal.dbRole === "cognitive_public_research_broker"
      ? ["  createScheduledHandler: createResearchRetentionScheduledHandler,"]
      : []),
    "  principal,",
    `  resolveAdapter: (operation) => ${adapterModule.exportName}[operation] ?? null,`,
    "});",
    "",
  ].join("\n");
  await writeFile(
    resolve(entrypoints, `${principal.dbRole}.mjs`),
    entrypoint,
    "utf8",
  );
  const config = {
    ...common,
    hyperdrive: [{
      binding: principal.hyperdriveBinding,
      id: `REPLACE_WITH_${principal.hyperdriveBinding}_ID`,
    }],
    main: `../entrypoints/${principal.dbRole}.mjs`,
    name: principal.workerName,
    secrets: { required: principal.requiredSecrets },
    vars: {
      COGNITIVE_DEPLOYMENT_STATE: "REPLACE_WITH_EXPLICIT_PRINCIPAL_STATE",
      RUNTIME_SCHEMA_VERSION: RUNTIME_MANIFEST.schemaVersion,
      SOURCE_COMMIT: "REPLACE_WITH_REVIEWED_SUCCESSOR_COMMIT",
      SOURCE_BASE_COMMIT: RUNTIME_MANIFEST.sourceBaseCommit,
      ...principal.runtimeConfiguration,
    },
    version_metadata: { binding: "WORKER_VERSION" },
  };
  if (principal.dbRole === "cognitive_public_research_broker") {
    config.triggers = { crons: ["17 * * * *"] };
  }
  await writeJson(
    resolve(configs, `${principal.dbRole}.wrangler.template.jsonc`),
    config,
  );
}

const nodes = [
  {
    credentials: [],
    id: RUNTIME_MANIFEST.gateway.workerName,
    kind: "access_protected_gateway",
    public: true,
  },
  ...RUNTIME_MANIFEST.principals.map((principal) => ({
    credentials: [
      principal.hyperdriveBinding,
      ...principal.requiredSecrets,
    ],
    databaseRole: principal.dbRole,
    id: principal.workerName,
    kind: "private_service_binding_worker",
    provider: principal.provider,
    public: false,
  })),
].sort((left, right) => left.id.localeCompare(right.id));

const edges = RUNTIME_MANIFEST.principals.flatMap((principal) => [
  {
    from: RUNTIME_MANIFEST.gateway.workerName,
    kind: "cloudflare_service_binding",
    to: principal.workerName,
  },
  {
    from: principal.workerName,
    kind: "cache_disabled_hyperdrive",
    to: `postgres-role:${principal.dbRole}`,
  },
  ...principal.networkEgress.map((target) => ({
    from: principal.workerName,
    kind: "allowlisted_network_egress",
    to: target,
  })),
]).sort((left, right) =>
  stable(left).localeCompare(stable(right))
);

await writeJson(resolve(generated, "architecture-graph.json"), {
  edges,
  nodes,
  schemaVersion: RUNTIME_MANIFEST.schemaVersion,
  sourceBaseCommit: RUNTIME_MANIFEST.sourceBaseCommit,
});

await writeJson(resolve(generated, "secret-inventory.names-only.json"), {
  gateway: [],
  principals: Object.fromEntries(
    RUNTIME_MANIFEST.principals.map((principal) => [
      principal.dbRole,
      principal.requiredSecrets,
    ]),
  ),
  schemaVersion: RUNTIME_MANIFEST.schemaVersion,
});

await writeJson(resolve(generated, "hyperdrive-plan.template.json"), {
  caching: "disabled",
  configurations: RUNTIME_MANIFEST.principals.map((principal) => ({
    binding: principal.hyperdriveBinding,
    configurationId: null,
    databaseRole: principal.dbRole,
    principal: principal.dbRole,
  })),
  schemaVersion: RUNTIME_MANIFEST.schemaVersion,
});

await writeJson(resolve(generated, "operation-readiness.json"), {
  principals: Object.fromEntries(
    Object.entries(OPERATION_ADAPTERS).map(([principal, operations]) => [
      principal,
      Object.fromEntries(
        Object.entries(operations).map(([operation, adapter]) => [
          operation,
          {
            databaseOperations: adapter.databaseOperations,
            ready: adapter.ready,
            reason: adapter.reason,
          },
        ]),
      ),
    ]),
  ),
  schemaVersion: RUNTIME_MANIFEST.schemaVersion,
});
