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

const serviceBindings = Object.fromEntries(
  RUNTIME_MANIFEST.principals.map((principal) => [
    principal.binding,
    principal.workerName,
  ]),
);

const hyperdrive = Object.fromEntries(
  RUNTIME_MANIFEST.principals.map((principal, index) => [
    principal.dbRole,
    {
      binding: principal.hyperdriveBinding,
      cacheMode: "disabled",
      configurationId: (index + 1).toString(16).padStart(32, "0"),
      principal: principal.dbRole,
    },
  ]),
);

const activeInput = () => ({
  access: {
    applicationAudience: "a".repeat(64),
    applicationStatus: "ACTIVE",
    gatewayExposure: "access_protected_workers_dev",
    policyStatus: "ACTIVE",
    serviceTokenClientId: `${"b".repeat(32)}.access`,
    serviceTokenStatus: "ACTIVE",
    teamDomain: "https://example-team.cloudflareaccess.com",
  },
  activationMode: "active",
  hyperdrive: structuredClone(hyperdrive),
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
  runtimeVariables: {
    cognitive_model_router: {
      COGNITIVE_MODEL_FAMILY: "approved-advisory-family",
      COGNITIVE_MODEL_INPUT_USD_PER_MILLION: "1.25",
      COGNITIVE_MODEL_NAME: "approved-advisory-model",
      COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION: "4.75",
    },
    cognitive_public_research_broker: {
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
    },
  },
  schemaVersion: "chillywood-cognitive-level01-provider-deployment-input-v1",
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

test("active rendering emits ten private configs and a credential-free gateway", async () => {
  const rendered = await renderDeployment(activeInput(), repositoryState);
  assert.equal(rendered.configs.size, 11);
  assert.equal(rendered.metadata.configCount, 11);
  assert.equal(rendered.metadata.privateWorkerCount, 10);
  assert.equal(rendered.metadata.gatewayCredentialCount, 0);
  assert.equal(rendered.metadata.gate, "READY_EXACT_REVIEW_AND_NET");
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
    assert.equal(config.hyperdrive.length, 1);
    assert.equal(config.hyperdrive[0].binding, principal.hyperdriveBinding);
    assert.equal(
      config.hyperdrive[0].id,
      hyperdrive[principal.dbRole].configurationId,
    );
    assert.equal(config.vars.SOURCE_COMMIT, currentCommit);
    assert.equal(
      config.vars.SOURCE_BASE_COMMIT,
      RUNTIME_MANIFEST.sourceBaseCommit,
    );
    assert.equal("secrets" in config, false);
    assert.match(
      config.main,
      /^\.\.\/source\/repository\/isolated-runtime\/cloudflare\/generated\/entrypoints\/cognitive_[a-z0-9_]+\.mjs$/u,
    );
    ids.add(config.hyperdrive[0].id);
    if (principal.dbRole === "cognitive_public_research_broker") {
      assert.deepEqual(config.triggers, { crons: ["17 * * * *"] });
      assert.equal(
        config.vars.COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH,
        "c".repeat(64),
      );
    } else {
      assert.equal("triggers" in config, false);
    }
    assert.doesNotMatch(JSON.stringify(config), /REPLACE_WITH|replace-with/u);
  }
  assert.equal(ids.size, 10);
  const research = rendered.configs.get(
    "cognitive_public_research_broker.wrangler.jsonc",
  );
  assert.equal(
    research.vars.COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL,
    activeInput().runtimeVariables.cognitive_public_research_broker
      .COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL,
  );

  const gateway = rendered.configs.get("gateway.wrangler.jsonc");
  assert.equal(gateway.workers_dev, true);
  assert.equal(gateway.preview_urls, false);
  assert.deepEqual(gateway.routes, []);
  assert.equal("hyperdrive" in gateway, false);
  assert.equal("secrets" in gateway, false);
  assert.equal(gateway.vars.CF_ACCESS_AUD, "a".repeat(64));
  assert.equal(
    gateway.main,
    "../source/repository/isolated-runtime/cloudflare/src/gateway.mjs",
  );
  assert.equal(gateway.services.length, 10);
  assert.equal(rendered.commandPlan.preparationCommands.length, 1);
  assert.equal(
    rendered.commandPlan.sourceModuleGraphSha256,
    repositoryState.sourceGraph.hash,
  );
});

test("inert mode emits reviewed credential-free Workers without database bindings", async () => {
  const input = activeInput();
  input.activationMode = "inert";
  input.hyperdrive = null;
  input.runtimeVariables = null;
  input.providerReadiness.netBoundary =
    "WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN";
  input.providerReadiness.runtimeLoginProvisioningReady = false;
  const rendered = await renderDeployment(input, repositoryState);
  assert.equal(rendered.configs.size, 11);
  assert.equal(rendered.metadata.gate, "READY_INERT_NO_DATABASE");
  assert.equal(rendered.commandPlan.commands.length, 11);
  for (const principal of RUNTIME_MANIFEST.principals) {
    const config = rendered.configs.get(
      `${principal.dbRole}.wrangler.jsonc`,
    );
    assert.ok(config);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.routes, []);
    assert.equal("hyperdrive" in config, false);
    assert.equal("secrets" in config, false);
    const placeholderNames = Object.entries(principal.runtimeConfiguration)
      .filter(([, value]) => /REPLACE_WITH|replace-with/u.test(value))
      .map(([name]) => name);
    assert.equal(
      placeholderNames.some((name) => name in config.vars),
      false,
    );
    assert.equal(
      Object.keys(config.vars).some((name) =>
        name.startsWith("COGNITIVE_RESEARCH_RETENTION_")
      ),
      false,
    );
    assert.equal("triggers" in config, false);
  }
  const gateway = rendered.configs.get("gateway.wrangler.jsonc");
  assert.equal(gateway.workers_dev, true);
  assert.equal("hyperdrive" in gateway, false);
  assert.equal("secrets" in gateway, false);
  assert.equal(gateway.services.length, 10);
});

test("active mode fails closed before exact review or provider net readiness", async () => {
  const reviewPending = activeInput();
  reviewPending.review.exactHeadReviewed = false;
  await rejects(reviewPending, "exact_review_gate_not_satisfied");

  const ciPartial = activeInput();
  ciPartial.review.ciPassed = 12;
  await rejects(ciPartial, "exact_review_gate_not_satisfied");

  const inertReviewPending = activeInput();
  inertReviewPending.activationMode = "inert";
  inertReviewPending.hyperdrive = null;
  inertReviewPending.runtimeVariables = null;
  inertReviewPending.review.exactHeadReviewed = false;
  await rejects(inertReviewPending, "exact_review_gate_not_satisfied");

  const inertAccessPending = activeInput();
  inertAccessPending.activationMode = "inert";
  inertAccessPending.hyperdrive = null;
  inertAccessPending.runtimeVariables = null;
  inertAccessPending.access.applicationStatus = "INACTIVE";
  await rejects(inertAccessPending, "access_not_ready");

  const inertWithRuntimeValues = activeInput();
  inertWithRuntimeValues.activationMode = "inert";
  inertWithRuntimeValues.hyperdrive = null;
  await rejects(
    inertWithRuntimeValues,
    "runtime_variable_contract_invalid",
  );

  const netOpen = activeInput();
  netOpen.providerReadiness.netBoundary =
    "WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN";
  await rejects(netOpen, "net_boundary_not_ready");
});

test("Access identifiers match the gateway verifier exactly", async () => {
  const clientIdWithoutAccessSuffix = activeInput();
  clientIdWithoutAccessSuffix.access.serviceTokenClientId = "b".repeat(32);
  await rejects(clientIdWithoutAccessSuffix, "access_contract_invalid");

  const malformedAudience = activeInput();
  malformedAudience.access.applicationAudience = `${"a".repeat(63)}-`;
  await rejects(malformedAudience, "access_contract_invalid");

  const uppercaseTeamDomain = activeInput();
  uppercaseTeamDomain.access.teamDomain =
    "https://Example-team.cloudflareaccess.com";
  await rejects(uppercaseTeamDomain, "access_contract_invalid");

  const nestedTeamDomain = activeInput();
  nestedTeamDomain.access.teamDomain =
    "https://nested.example-team.cloudflareaccess.com";
  await rejects(nestedTeamDomain, "access_contract_invalid");
});

test("wrong source, base, cross-principal bindings, and cache ambiguity fail", async () => {
  const wrongSource = activeInput();
  wrongSource.source.commit = "c".repeat(40);
  wrongSource.review.sourceCommit = wrongSource.source.commit;
  await rejects(wrongSource, "source_binding_mismatch");

  const wrongBase = activeInput();
  wrongBase.source.baseCommit = "d".repeat(40);
  await rejects(wrongBase, "source_binding_mismatch");

  const wrongModuleGraph = activeInput();
  wrongModuleGraph.source.moduleGraphSha256 = "d".repeat(64);
  wrongModuleGraph.review.sourceModuleGraphSha256 =
    wrongModuleGraph.source.moduleGraphSha256;
  await rejects(wrongModuleGraph, "source_binding_mismatch");

  const crossedBinding = activeInput();
  const [first, second] = RUNTIME_MANIFEST.principals;
  crossedBinding.serviceBindings[first.binding] = second.workerName;
  await rejects(crossedBinding, "cross_principal_binding_forbidden");

  const crossedHyperdrive = activeInput();
  crossedHyperdrive.hyperdrive[first.dbRole].binding =
    second.hyperdriveBinding;
  await rejects(crossedHyperdrive, "cross_principal_hyperdrive_forbidden");

  const cacheAmbiguous = activeInput();
  cacheAmbiguous.hyperdrive[first.dbRole].cacheMode = "default";
  await rejects(cacheAmbiguous, "hyperdrive_cache_must_be_disabled");
});

test("duplicate Hyperdrive IDs and broad or runtime deployment credentials fail", async () => {
  const duplicate = activeInput();
  const [first, second] = RUNTIME_MANIFEST.principals;
  duplicate.hyperdrive[second.dbRole].configurationId =
    duplicate.hyperdrive[first.dbRole].configurationId;
  await rejects(duplicate, "hyperdrive_id_duplicate");

  const broad = activeInput();
  broad.providerReadiness.deploymentCredential.permissions.push(
    "ACCOUNT_BILLING_EDIT",
  );
  await rejects(broad, "deployment_credential_scope_too_broad");

  const installed = activeInput();
  installed.providerReadiness.deploymentCredential.installedInRuntime = true;
  await rejects(installed, "deployment_credential_not_bounded");

  const serviceRole = activeInput();
  serviceRole.providerReadiness.supabaseServiceRoleInstalledInWorkers = true;
  await rejects(serviceRole, "supabase_service_role_forbidden");

  const rawSecretField = activeInput();
  rawSecretField.providerReadiness.deploymentCredential.tokenValue =
    "must-never-be-accepted";
  await rejects(rawSecretField, "credential_value_field_forbidden");
});

test("runtime configuration is exact per principal and rejects unresolved or unsafe values", async () => {
  const input = activeInput();
  input.runtimeVariables.cognitive_model_router.COGNITIVE_MODEL_NAME =
    "REPLACE_WITH_APPROVED_MODEL_NAME";
  await rejects(input, "model_variable_invalid");

  const missingResearch = activeInput();
  delete missingResearch.runtimeVariables.cognitive_public_research_broker;
  await rejects(missingResearch, "runtime_variable_contract_invalid");

  const extraPrincipal = activeInput();
  extraPrincipal.runtimeVariables.cognitive_sentinel_collector = {};
  await rejects(extraPrincipal, "runtime_variable_contract_invalid");

  const extraResearchValue = activeInput();
  extraResearchValue.runtimeVariables.cognitive_public_research_broker
    .COGNITIVE_MODEL_NAME = "cross-principal-value";
  await rejects(
    extraResearchValue,
    "runtime_principal_variable_contract_invalid",
  );

  for (const unsafe of [
    "http://research-transport.example.invalid/internal/cognitive-research-transport/v1/retrieve",
    "https://127.0.0.1/internal/cognitive-research-transport/v1/retrieve",
    "https://research-transport.example.invalid/incorrect",
    "https://user:pass@research-transport.example.invalid/internal/cognitive-research-transport/v1/retrieve",
  ]) {
    const unsafeResearch = activeInput();
    unsafeResearch.runtimeVariables.cognitive_public_research_broker
      .COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL = unsafe;
    await rejects(unsafeResearch, "runtime_variable_invalid");
  }
});

test("source graph packages committed bytes and excludes tracked or untracked worktree tampering", async (t) => {
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
  await writeFile(
    join(fixtureRoot, "runtime", "shadow.mjs"),
    'export const value = "untracked";\n',
  );
  const afterTamper = collectGitSourceGraph({
    commit,
    pathspecs: ["runtime"],
    repository: fixtureRoot,
    requiredPaths: ["runtime/main.mjs"],
  });
  assert.equal(afterTamper.hash, reviewed.hash);
  assert.equal(afterTamper.fileCount, 1);
  assert.equal(
    afterTamper.entries[0].bytes.toString("utf8"),
    'export const value = "reviewed";\n',
  );
  assert.equal(
    afterTamper.entries.some((entry) => entry.path.endsWith("shadow.mjs")),
    false,
  );
  assert.throws(
    () =>
      assertGitWorktreeMatchesReviewedSource({
        pathspecs: ["runtime"],
        repository: fixtureRoot,
      }),
    (error) =>
      error instanceof DeploymentRenderError &&
      error.message === "source_module_worktree_dirty",
  );
});

test("CLI requires owner-only external input and writes owner-only dry-run artifacts", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "chillywood-render-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await chmod(scratch, 0o700);
  const inputPath = join(scratch, "deployment-input.json");
  const outputPath = join(scratch, "rendered");
  await writeFile(inputPath, JSON.stringify(activeInput()), { mode: 0o600 });

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath, "--output", outputPath],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^GATE=READY_EXACT_REVIEW_AND_NET$/mu);
  assert.match(result.stdout, /^CONFIG_COUNT=11$/mu);
  assert.match(result.stdout, /^METADATA_SHA256=[a-f0-9]{64}$/mu);
  assert.doesNotMatch(result.stdout, /chillywood-level01-bounded-deployment/u);
  assert.equal(result.stderr, "");

  const outputStat = await lstat(outputPath);
  assert.equal(outputStat.mode & 0o077, 0);
  const files = (await readdir(outputPath)).sort();
  assert.deepEqual(files, [
    "command-plan.json",
    "deployment-metadata.json",
    "source",
    "source-manifest.json",
    "wrangler",
  ]);
  for (const file of await readdir(join(outputPath, "wrangler"))) {
    const stat = await lstat(join(outputPath, "wrangler", file));
    assert.equal(stat.mode & 0o077, 0);
  }
  const metadata = JSON.parse(
    await readFile(join(outputPath, "deployment-metadata.json"), "utf8"),
  );
  assert.equal(metadata.configCount, 11);
  assert.equal(Object.keys(metadata.configHashes).length, 11);
  assert.equal(
    metadata.sourceModuleGraphSha256,
    repositoryState.sourceGraph.hash,
  );
  assert.match(metadata.sourceManifestSha256, /^[a-f0-9]{64}$/u);
  const sourceManifest = JSON.parse(
    await readFile(join(outputPath, "source-manifest.json"), "utf8"),
  );
  assert.equal(
    sourceManifest.sourceModuleGraphSha256,
    repositoryState.sourceGraph.hash,
  );
  assert.equal(
    sourceManifest.fileCount,
    repositoryState.sourceGraph.fileCount,
  );
  const packagedEntrypoint = join(
    outputPath,
    "source",
    "repository",
    "isolated-runtime",
    "cloudflare",
    "generated",
    "entrypoints",
    "cognitive_public_research_broker.mjs",
  );
  const reviewedEntrypoint = execFileSync(
    "git",
    [
      "show",
      `${currentCommit}:isolated-runtime/cloudflare/generated/entrypoints/cognitive_public_research_broker.mjs`,
    ],
  );
  assert.deepEqual(await readFile(packagedEntrypoint), reviewedEntrypoint);
  const commandPlan = JSON.parse(
    await readFile(join(outputPath, "command-plan.json"), "utf8"),
  );
  assert.equal(commandPlan.commands.length, 11);
  assert.equal(commandPlan.preparationCommands.length, 1);
  assert.equal(commandPlan.commands.some(({ argv }) => argv[0] === "npx"), false);
  assert.equal(
    commandPlan.sourceManifestSha256,
    metadata.sourceManifestSha256,
  );
});

test("CLI rejects repository input, permissive input, and unsafe output", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "chillywood-render-path-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await chmod(scratch, 0o700);
  const inputPath = join(scratch, "deployment-input.json");
  await writeFile(inputPath, JSON.stringify(activeInput()), { mode: 0o644 });
  let result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath, "--output", join(scratch, "output-a")],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "ERROR=input_file_not_owner_only");

  await chmod(inputPath, 0o600);
  const unsafeOutput = join(repositoryRoot, ".provider-render-test");
  result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath, "--output", unsafeOutput],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "ERROR=output_path_inside_repository");

  const repositoryInput = join(
    cloudflareRoot,
    ".provider-deployment-input.test.json",
  );
  await writeFile(repositoryInput, JSON.stringify(activeInput()), { mode: 0o600 });
  t.after(() => rm(repositoryInput, { force: true }));
  result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--input",
      repositoryInput,
      "--output",
      join(scratch, "output-b"),
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "ERROR=input_file_inside_repository");
});
