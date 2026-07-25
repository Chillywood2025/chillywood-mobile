import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
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
  DeploymentRenderError,
  renderDeployment,
} from "../tools/render-provider-deployment.mjs";

const cloudflareRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(cloudflareRoot, "..", "..");
const scriptPath = fileURLToPath(
  new URL("../tools/render-provider-deployment.mjs", import.meta.url),
);
const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const currentTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const repositoryState = Object.freeze({
  baseIsAncestor: true,
  commit: currentCommit,
  tree: currentTree,
});

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
    serviceTokenClientId: "b".repeat(32),
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
    sourceTree: currentTree,
  },
  runtimeVariables: {
    cognitive_model_router: {
      COGNITIVE_MODEL_FAMILY: "approved-advisory-family",
      COGNITIVE_MODEL_INPUT_USD_PER_MILLION: "1.25",
      COGNITIVE_MODEL_NAME: "approved-advisory-model",
      COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION: "4.75",
    },
  },
  schemaVersion: "chillywood-cognitive-level01-provider-deployment-input-v1",
  serviceBindings: structuredClone(serviceBindings),
  source: {
    baseCommit: RUNTIME_MANIFEST.sourceBaseCommit,
    commit: currentCommit,
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
    ids.add(config.hyperdrive[0].id);
    assert.doesNotMatch(JSON.stringify(config), /REPLACE_WITH|replace-with/u);
  }
  assert.equal(ids.size, 10);

  const gateway = rendered.configs.get("gateway.wrangler.jsonc");
  assert.equal(gateway.workers_dev, true);
  assert.equal(gateway.preview_urls, false);
  assert.deepEqual(gateway.routes, []);
  assert.equal("hyperdrive" in gateway, false);
  assert.equal("secrets" in gateway, false);
  assert.equal(gateway.vars.CF_ACCESS_AUD, "a".repeat(64));
  assert.equal(gateway.services.length, 10);
});

test("inert mode emits no provider-usable Wrangler configs", async () => {
  const input = activeInput();
  input.activationMode = "inert";
  input.hyperdrive = null;
  input.runtimeVariables = null;
  input.providerReadiness.netBoundary =
    "WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN";
  input.providerReadiness.runtimeLoginProvisioningReady = false;
  input.review = {
    ...input.review,
    ciPassed: 0,
    exactHeadReviewed: false,
    p0: null,
    p1: null,
  };
  input.access = {
    ...input.access,
    applicationStatus: "INACTIVE",
    policyStatus: "INACTIVE",
    serviceTokenStatus: "INACTIVE",
  };
  const rendered = await renderDeployment(input, repositoryState);
  assert.equal(rendered.configs.size, 0);
  assert.equal(rendered.metadata.gate, "BLOCKED_INERT");
  assert.deepEqual(rendered.commandPlan.commands, []);
});

test("active mode fails closed before exact review or provider net readiness", async () => {
  const reviewPending = activeInput();
  reviewPending.review.exactHeadReviewed = false;
  await rejects(reviewPending, "exact_review_gate_not_satisfied");

  const ciPartial = activeInput();
  ciPartial.review.ciPassed = 12;
  await rejects(ciPartial, "exact_review_gate_not_satisfied");

  const netOpen = activeInput();
  netOpen.providerReadiness.netBoundary =
    "WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN";
  await rejects(netOpen, "net_boundary_not_ready");
});

test("wrong source, base, cross-principal bindings, and cache ambiguity fail", async () => {
  const wrongSource = activeInput();
  wrongSource.source.commit = "c".repeat(40);
  wrongSource.review.sourceCommit = wrongSource.source.commit;
  await rejects(wrongSource, "source_binding_mismatch");

  const wrongBase = activeInput();
  wrongBase.source.baseCommit = "d".repeat(40);
  await rejects(wrongBase, "source_binding_mismatch");

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

test("unresolved model configuration is rejected", async () => {
  const input = activeInput();
  input.runtimeVariables.cognitive_model_router.COGNITIVE_MODEL_NAME =
    "REPLACE_WITH_APPROVED_MODEL_NAME";
  await rejects(input, "model_variable_invalid");
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
  const commandPlan = JSON.parse(
    await readFile(join(outputPath, "command-plan.json"), "utf8"),
  );
  assert.equal(commandPlan.commands.length, 11);
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
