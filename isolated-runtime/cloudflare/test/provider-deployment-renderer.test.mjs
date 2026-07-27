import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";
import {
  assertGitWorktreeMatchesReviewedSource,
  collectGitSourceGraph,
  DeploymentRenderError,
  getRepositoryState,
  renderDeployment,
} from "../tools/render-provider-deployment.mjs";

const cloudflareRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(cloudflareRoot, "..", "..");
const scriptPath = fileURLToPath(
  new URL("../tools/render-provider-deployment.mjs", import.meta.url),
);
const repositoryState = getRepositoryState();
const currentCommit = repositoryState.commit;
const currentTree = repositoryState.tree;
const CORE = new Set([
  "cognitive_product_baseline_executor",
  "cognitive_sentinel_collector",
  "cognitive_product_quality_evaluator",
  "cognitive_product_quality_triage",
]);

const serviceBindings = Object.fromEntries(
  RUNTIME_MANIFEST.principals.map((principal) => [
    principal.binding,
    principal.workerName,
  ]),
);

const runtimeVariables = (principal) => {
  if (principal.dbRole === "cognitive_model_router") {
    return {
      COGNITIVE_MODEL_FAMILY: "approved-advisory-family",
      COGNITIVE_MODEL_INPUT_USD_PER_MILLION: "1.25",
      COGNITIVE_MODEL_NAME: "approved-advisory-model",
      COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION: "4.75",
      COGNITIVE_MODEL_PROVIDER: "openai",
    };
  }
  if (principal.dbRole === "cognitive_public_research_broker") {
    return {
      COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL:
        "https://research-transport.example.invalid/internal/cognitive-research-transport/v1/retrieve",
      COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH: "c".repeat(64),
      COGNITIVE_RESEARCH_RETENTION_BATCH_LIMIT: "100",
      COGNITIVE_RESEARCH_RETENTION_CRON: "17 * * * *",
      COGNITIVE_RESEARCH_RETENTION_ENVIRONMENT: "production",
      COGNITIVE_RESEARCH_RETENTION_MAXIMUM_BATCHES: "1",
      COGNITIVE_RESEARCH_RETENTION_PLATFORM: "shared",
      COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID:
        "10000000-0000-4000-8000-000000000001",
      COGNITIVE_RESEARCH_RETENTION_PROJECT_ID:
        "20000000-0000-4000-8000-000000000001",
      COGNITIVE_RESEARCH_RETENTION_TASK_ID:
        "30000000-0000-4000-8000-000000000001",
      COGNITIVE_RESEARCH_RETENTION_TIMEOUT_MS: "50000",
    };
  }
  return {};
};

const inertContract = () => ({
  database: null,
  installedBindings: [],
  providerBindings: [],
  review: null,
  rollback: null,
  runtimeVariables: null,
  state: "inert",
  trigger: null,
});

const activeContract = (principal, index) => ({
  database: {
    hyperdrive: {
      binding: principal.hyperdriveBinding,
      cacheMode: "disabled",
      configurationId: (index + 1).toString(16).padStart(32, "0"),
      principal: principal.dbRole,
    },
    loginIdentity: principal.loginRole,
    netAccess: "DENIED",
    principalRole: principal.dbRole,
    rpcAllowlist: [...principal.rpcAllowlist],
  },
  installedBindings: [...principal.requiredSecrets],
  providerBindings: [...principal.providerBindings],
  review: {
    lane: "independent_principal_activation",
    p0: 0,
    p1: 0,
    principal: principal.dbRole,
    sourceCommit: currentCommit,
    sourceModuleGraphSha256: repositoryState.sourceGraph.hash,
    sourceTree: currentTree,
    status: "PASSED",
  },
  rollback: {
    deactivationMode: "redeploy_inert_remove_runtime_bindings",
    evidenceHash: (index + 1).toString(16).repeat(64).slice(0, 64),
    preservesSiblings: true,
    principal: principal.dbRole,
    testStatus: "PASSED",
  },
  runtimeVariables: runtimeVariables(principal),
  state: "active",
  trigger: null,
});

const stagedInput = (activeIds = CORE) => ({
  access: {
    applicationAudience: "a".repeat(64),
    applicationStatus: "ACTIVE",
    gatewayExposure: "access_protected_workers_dev",
    policyStatus: "ACTIVE",
    serviceTokenClientId: `${"b".repeat(32)}.access`,
    serviceTokenStatus: "ACTIVE",
    teamDomain: "https://example-team.cloudflareaccess.com",
  },
  principals: Object.fromEntries(
    RUNTIME_MANIFEST.principals.map((principal, index) => [
      principal.dbRole,
      activeIds.has(principal.dbRole)
        ? activeContract(principal, index)
        : inertContract(),
    ]),
  ),
  providerReadiness: {
    deploymentCredential: {
      activity: "ACTIVE",
      expiry: "EXPIRY_ACCEPTABLE",
      exposure: "NOT_EXPOSED",
      installedInRuntime: false,
      name: "chillywood-level01-bounded-deployment",
      permissions: [
        "ACCOUNT_ACCESS_APPS_POLICIES_EDIT",
        "ACCOUNT_ACCESS_SERVICE_TOKENS_EDIT",
        "ACCOUNT_HYPERDRIVE_EDIT",
        "ACCOUNT_WORKERS_SCRIPTS_EDIT",
      ],
      presence: "PRESENT",
      scope: "SCOPE_MATCH",
    },
    netBoundary: "PROVIDER_CONFIRMED_PUBLIC_USAGE_REVOKED",
    runtimeLoginProvisioningReady: true,
    supabaseServiceRoleInstalledInWorkers: false,
  },
  review: {
    ciPassed: 13,
    ciRequired: 13,
    exactHeadReviewed: true,
    p0: 0,
    p1: 0,
    sourceCommit: currentCommit,
    sourceModuleGraphSha256: repositoryState.sourceGraph.hash,
    sourceTree: currentTree,
  },
  schemaVersion: "chillywood-cognitive-level01-provider-deployment-input-v2",
  serviceBindings: structuredClone(serviceBindings),
  source: {
    baseCommit: RUNTIME_MANIFEST.sourceBaseCommit,
    commit: currentCommit,
    moduleGraphSha256: repositoryState.sourceGraph.hash,
    tree: currentTree,
  },
});

const rejects = async (input, code) => {
  await assert.rejects(
    () => renderDeployment(input, repositoryState),
    (error) =>
      error instanceof DeploymentRenderError && error.message === code,
  );
};

test("staged rendering activates exactly the four provider-independent core principals", async () => {
  const input = stagedInput();
  const rendered = await renderDeployment(input, repositoryState);
  assert.equal(rendered.configs.size, 11);
  assert.equal(rendered.metadata.activePrincipalCount, 4);
  assert.equal(rendered.metadata.inertPrincipalCount, 6);
  assert.equal(rendered.metadata.globalReadiness, "NOT_GLOBALLY_READY");
  assert.equal(rendered.metadata.gate, "READY_STAGED_PARTIAL");
  assert.deepEqual(rendered.metadata.activePrincipals, [...CORE].sort());
  assert.equal(rendered.commandPlan.commands.length, 11);
  assert.equal(
    rendered.commandPlan.deploymentOrder.at(-1),
    "gateway.wrangler.jsonc",
  );

  const ids = new Set();
  for (const principal of RUNTIME_MANIFEST.principals) {
    const config = rendered.configs.get(
      `${principal.dbRole}.wrangler.jsonc`,
    );
    assert.ok(config);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.routes, []);
    assert.equal("secrets" in config, false);
    assert.equal(
      config.vars.COGNITIVE_DEPLOYMENT_STATE,
      CORE.has(principal.dbRole) ? "active" : "inert",
    );
    if (CORE.has(principal.dbRole)) {
      assert.equal(config.hyperdrive.length, 1);
      assert.equal(config.hyperdrive[0].binding, principal.hyperdriveBinding);
      ids.add(config.hyperdrive[0].id);
    } else {
      assert.equal("hyperdrive" in config, false);
      assert.equal("triggers" in config, false);
      assert.deepEqual(Object.keys(config.vars).sort(), [
        "COGNITIVE_DEPLOYMENT_STATE",
        "RUNTIME_SCHEMA_VERSION",
        "SOURCE_BASE_COMMIT",
        "SOURCE_COMMIT",
      ]);
    }
    assert.doesNotMatch(JSON.stringify(config), /REPLACE_WITH|replace-with/u);
  }
  assert.equal(ids.size, 4);

  const gateway = rendered.configs.get("gateway.wrangler.jsonc");
  assert.equal(gateway.workers_dev, true);
  assert.equal(gateway.preview_urls, false);
  assert.deepEqual(gateway.routes, []);
  assert.equal("hyperdrive" in gateway, false);
  assert.equal("secrets" in gateway, false);
  assert.equal(gateway.services.length, 10);
  assert.deepEqual(
    JSON.parse(gateway.vars.COGNITIVE_PRINCIPAL_STATES),
    rendered.metadata.principalStates,
  );
});

test("all-inert rendering has no database, runtime, provider, or cron binding", async () => {
  const input = stagedInput(new Set());
  input.providerReadiness.netBoundary =
    "WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN";
  input.providerReadiness.runtimeLoginProvisioningReady = false;
  const rendered = await renderDeployment(input, repositoryState);
  assert.equal(rendered.metadata.activePrincipalCount, 0);
  assert.equal(rendered.metadata.gate, "READY_STAGED_INERT_ONLY");
  for (const principal of RUNTIME_MANIFEST.principals) {
    const config = rendered.configs.get(
      `${principal.dbRole}.wrangler.jsonc`,
    );
    assert.equal("hyperdrive" in config, false);
    assert.equal("secrets" in config, false);
    assert.equal("triggers" in config, false);
    assert.equal(config.vars.COGNITIVE_DEPLOYMENT_STATE, "inert");
  }
});

test("an inert principal rejects every database, runtime, provider, and cron attachment", async () => {
  const id = "cognitive_model_router";
  const withDatabase = stagedInput();
  withDatabase.principals[id].database = activeContract(
    RUNTIME_MANIFEST.principals.find((entry) => entry.dbRole === id),
    6,
  ).database;
  await rejects(withDatabase, "inert_principal_runtime_forbidden");

  const withRuntimeBinding = stagedInput();
  withRuntimeBinding.principals[id].installedBindings = [
    "COGNITIVE_MODEL_OPENAI_API_KEY",
  ];
  await rejects(withRuntimeBinding, "inert_principal_binding_forbidden");

  const withProviderBinding = stagedInput();
  withProviderBinding.principals[id].providerBindings = [
    "COGNITIVE_MODEL_OPENAI_API_KEY",
  ];
  await rejects(
    withProviderBinding,
    "inert_principal_provider_binding_forbidden",
  );

  const withRuntimeVariable = stagedInput();
  withRuntimeVariable.principals[id].runtimeVariables = {
    COGNITIVE_MODEL_PROVIDER: "openai",
  };
  await rejects(withRuntimeVariable, "inert_principal_runtime_forbidden");

  const withCron = stagedInput();
  withCron.principals[id].trigger = {
    cron: "17 * * * *",
    evidenceHash: "f".repeat(64),
    status: "ACTIVE_REVIEWED",
  };
  await rejects(withCron, "inert_principal_runtime_forbidden");
});

test("every principal requires an explicit state and one active principal cannot activate a sibling", async () => {
  const missing = stagedInput();
  delete missing.principals.cognitive_model_router;
  await rejects(missing, "principal_state_matrix_invalid");

  const extra = stagedInput();
  extra.principals.implicit_default = inertContract();
  await rejects(extra, "principal_state_matrix_invalid");

  const crossed = stagedInput();
  const baseline = RUNTIME_MANIFEST.principals[0];
  const sentinel = RUNTIME_MANIFEST.principals[1];
  crossed.principals[baseline.dbRole].database.hyperdrive.binding =
    sentinel.hyperdriveBinding;
  await rejects(crossed, "cross_principal_hyperdrive_forbidden");
});

test("missing provider readiness blocks only that explicitly active principal", async () => {
  const coreOnly = stagedInput();
  assert.equal(
    (await renderDeployment(coreOnly, repositoryState)).metadata
      .activePrincipalCount,
    4,
  );

  const modelId = "cognitive_model_router";
  const withModel = stagedInput(new Set([...CORE, modelId]));
  withModel.principals[modelId].providerBindings = [];
  await rejects(withModel, "principal_provider_binding_contract_invalid");

  const modelInert = stagedInput();
  assert.equal(modelInert.principals[modelId].state, "inert");
  assert.deepEqual(modelInert.principals[modelId].providerBindings, []);
});

test("provider and internal bindings cannot cross principal domains", async () => {
  const input = stagedInput();
  input.principals.cognitive_product_baseline_executor.installedBindings.push(
    "COGNITIVE_MODEL_OPENAI_API_KEY",
  );
  await rejects(input, "principal_runtime_binding_contract_invalid");

  const providerCross = stagedInput();
  providerCross.principals.cognitive_sentinel_collector.providerBindings = [
    "GITHUB_APP_PRIVATE_KEY",
  ];
  await rejects(
    providerCross,
    "principal_provider_binding_contract_invalid",
  );
});

test("rollback can deactivate one principal without deactivating siblings", async () => {
  const before = await renderDeployment(stagedInput(), repositoryState);
  const afterInput = stagedInput(
    new Set([...CORE].filter((id) => id !== "cognitive_sentinel_collector")),
  );
  const after = await renderDeployment(afterInput, repositoryState);
  const sentinel = after.configs.get(
    "cognitive_sentinel_collector.wrangler.jsonc",
  );
  assert.equal(sentinel.vars.COGNITIVE_DEPLOYMENT_STATE, "inert");
  assert.equal("hyperdrive" in sentinel, false);
  for (
    const id of [
      "cognitive_product_baseline_executor",
      "cognitive_product_quality_evaluator",
      "cognitive_product_quality_triage",
    ]
  ) {
    const name = `${id}.wrangler.jsonc`;
    assert.deepEqual(after.configs.get(name), before.configs.get(name), id);
  }
});

test("partial activation cannot fabricate global readiness", async () => {
  const partial = await renderDeployment(stagedInput(), repositoryState);
  assert.equal(partial.metadata.globalReadiness, "NOT_GLOBALLY_READY");
  assert.equal(partial.metadata.gate, "READY_STAGED_PARTIAL");
  assert.notEqual(partial.metadata.activePrincipalCount, 10);

  const all = await renderDeployment(
    stagedInput(new Set(RUNTIME_MANIFEST.principals.map((entry) => entry.dbRole))),
    repositoryState,
  );
  assert.equal(all.metadata.globalReadiness, "ALL_PRINCIPALS_ACTIVE");
  assert.equal(all.metadata.gate, "READY_STAGED_ALL_PRINCIPALS");
});

test("exact review, Access, net, source, RPC, and rollback gates fail closed", async () => {
  const reviewPending = stagedInput();
  reviewPending.review.exactHeadReviewed = false;
  await rejects(reviewPending, "exact_review_gate_not_satisfied");

  const principalReview = stagedInput();
  principalReview.principals.cognitive_sentinel_collector.review.status =
    "PENDING";
  await rejects(principalReview, "principal_independent_review_required");

  const accessPending = stagedInput();
  accessPending.access.applicationStatus = "INACTIVE";
  await rejects(accessPending, "access_not_ready");

  const netOpen = stagedInput();
  netOpen.providerReadiness.netBoundary =
    "WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN";
  await rejects(netOpen, "net_boundary_not_ready");

  const rpcWidened = stagedInput();
  rpcWidened.principals.cognitive_sentinel_collector.database.rpcAllowlist.push(
    "cognitive_runtime.issue_recurring_child_task",
  );
  await rejects(rpcWidened, "principal_rpc_allowlist_invalid");

  const rollbackMissing = stagedInput();
  rollbackMissing.principals.cognitive_product_quality_triage.rollback = null;
  await rejects(rollbackMissing, "principal_rollback_contract_invalid");

  const wrongSource = stagedInput();
  wrongSource.source.commit = "d".repeat(40);
  wrongSource.review.sourceCommit = wrongSource.source.commit;
  await rejects(wrongSource, "source_binding_mismatch");
});

test("duplicate Hyperdrive IDs and broad or runtime deployment credentials fail", async () => {
  const duplicate = stagedInput();
  duplicate.principals.cognitive_sentinel_collector.database.hyperdrive
    .configurationId = duplicate.principals
      .cognitive_product_baseline_executor.database.hyperdrive.configurationId;
  await rejects(duplicate, "hyperdrive_id_duplicate");

  const broad = stagedInput();
  broad.providerReadiness.deploymentCredential.permissions.push(
    "ACCOUNT_BILLING_EDIT",
  );
  await rejects(broad, "deployment_credential_scope_too_broad");

  const installed = stagedInput();
  installed.providerReadiness.deploymentCredential.installedInRuntime = true;
  await rejects(installed, "deployment_credential_not_bounded");

  const serviceRole = stagedInput();
  serviceRole.providerReadiness.supabaseServiceRoleInstalledInWorkers = true;
  await rejects(serviceRole, "supabase_service_role_forbidden");

  const rawCredentialField = stagedInput();
  rawCredentialField.providerReadiness.deploymentCredential.tokenValue =
    "must-never-be-accepted";
  await rejects(rawCredentialField, "credential_value_field_forbidden");
});

test("active runtime configuration is exact per principal", async () => {
  const modelId = "cognitive_model_router";
  const model = stagedInput(new Set([...CORE, modelId]));
  model.principals[modelId].runtimeVariables.COGNITIVE_MODEL_NAME =
    "REPLACE_WITH_APPROVED_MODEL_NAME";
  await rejects(model, "rendered_config_unresolved_value");

  const researchId = "cognitive_public_research_broker";
  const research = stagedInput(new Set([...CORE, researchId]));
  research.principals[researchId].runtimeVariables
    .COGNITIVE_MODEL_NAME = "cross-principal-value";
  await rejects(research, "runtime_principal_variable_contract_invalid");
});

test("source graph packages committed bytes and excludes worktree tampering", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "chillywood-source-graph-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const fixtureRoot = join(scratch, "repository");
  await mkdir(join(fixtureRoot, "runtime"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "runtime", "main.mjs"),
    'export const value = "reviewed";\n',
  );
  execFileSync("git", ["init", "--quiet"], { cwd: fixtureRoot });
  execFileSync("git", ["config", "user.name", "Cognitive Runtime Test"], {
    cwd: fixtureRoot,
  });
  execFileSync("git", ["config", "user.email", "runtime-test@example.invalid"], {
    cwd: fixtureRoot,
  });
  execFileSync("git", ["add", "runtime/main.mjs"], { cwd: fixtureRoot });
  execFileSync("git", ["commit", "--quiet", "-m", "reviewed source"], {
    cwd: fixtureRoot,
  });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  }).trim();
  const reviewed = collectGitSourceGraph({
    commit,
    pathspecs: ["runtime"],
    repository: fixtureRoot,
    requiredPaths: ["runtime/main.mjs"],
  });
  assert.doesNotThrow(() =>
    assertGitWorktreeMatchesReviewedSource({
      pathspecs: ["runtime"],
      repository: fixtureRoot,
    })
  );
  await writeFile(
    join(fixtureRoot, "runtime", "main.mjs"),
    'export const value = "tampered";\n',
  );
  await assert.rejects(
    async () =>
      assertGitWorktreeMatchesReviewedSource({
        pathspecs: ["runtime"],
        repository: fixtureRoot,
      }),
    /source_module_worktree_dirty/u,
  );
  const afterTamper = collectGitSourceGraph({
    commit,
    pathspecs: ["runtime"],
    repository: fixtureRoot,
    requiredPaths: ["runtime/main.mjs"],
  });
  assert.equal(afterTamper.hash, reviewed.hash);
});

test("CLI writes owner-only staged artifacts bound to reviewed source", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "chillywood-render-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await chmod(scratch, 0o700);
  const inputPath = join(scratch, "deployment-input.json");
  const outputPath = join(scratch, "rendered");
  await writeFile(inputPath, JSON.stringify(stagedInput()), { mode: 0o600 });

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath, "--output", outputPath],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^GATE=READY_STAGED_PARTIAL$/mu);
  assert.match(result.stdout, /^CONFIG_COUNT=11$/mu);
  assert.match(result.stdout, /^METADATA_SHA256=[a-f0-9]{64}$/mu);
  assert.equal(result.stderr, "");

  const outputStat = await lstat(outputPath);
  assert.equal(outputStat.mode & 0o077, 0);
  assert.deepEqual((await readdir(outputPath)).sort(), [
    "command-plan.json",
    "deployment-metadata.json",
    "source",
    "source-manifest.json",
    "wrangler",
  ]);
  const metadata = JSON.parse(
    await readFile(join(outputPath, "deployment-metadata.json"), "utf8"),
  );
  assert.equal(metadata.activePrincipalCount, 4);
  assert.equal(metadata.globalReadiness, "NOT_GLOBALLY_READY");
  assert.match(metadata.sourceManifestSha256, /^[a-f0-9]{64}$/u);
  const commandPlan = JSON.parse(
    await readFile(join(outputPath, "command-plan.json"), "utf8"),
  );
  assert.equal(commandPlan.commands.length, 11);
  assert.equal(commandPlan.preparationCommands.length, 1);
  assert.equal(commandPlan.commands.some(({ argv }) => argv[0] === "npx"), false);
});

test("CLI rejects permissive input and repository output", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "chillywood-render-path-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await chmod(scratch, 0o700);
  const inputPath = join(scratch, "deployment-input.json");
  await writeFile(inputPath, JSON.stringify(stagedInput()), { mode: 0o644 });
  let result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath, "--output", join(scratch, "output-a")],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), "ERROR=input_file_not_owner_only");

  await chmod(inputPath, 0o600);
  result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--input",
      inputPath,
      "--output",
      join(repositoryRoot, ".provider-render-test"),
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), "ERROR=output_path_inside_repository");
});
