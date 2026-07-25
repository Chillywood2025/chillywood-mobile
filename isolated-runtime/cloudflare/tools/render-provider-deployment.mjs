import { execFileSync } from "node:child_process";
import {
  constants as fsConstants,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";

const toolPath = fileURLToPath(import.meta.url);
const cloudflareRoot = resolve(dirname(toolPath), "..");
const repositoryRoot = resolve(cloudflareRoot, "..", "..");
const templateRoot = resolve(cloudflareRoot, "generated", "wrangler");
const sourceBaseCommit = RUNTIME_MANIFEST.sourceBaseCommit;
const inputSchema =
  "chillywood-cognitive-level01-provider-deployment-input-v1";
const outputSchema =
  "chillywood-cognitive-level01-provider-deployment-output-v1";
const reviewedDeploymentPermissions = Object.freeze([
  "ACCOUNT_ACCESS_APPS_POLICIES_EDIT",
  "ACCOUNT_ACCESS_SERVICE_TOKENS_EDIT",
  "ACCOUNT_HYPERDRIVE_EDIT",
  "ACCOUNT_WORKERS_SCRIPTS_EDIT",
]);
const modelRuntimeVariableNames = Object.freeze([
  "COGNITIVE_MODEL_FAMILY",
  "COGNITIVE_MODEL_INPUT_USD_PER_MILLION",
  "COGNITIVE_MODEL_NAME",
  "COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION",
]);
const forbiddenCredentialKey =
  /(?:api[_-]?(?:key|token)|(?:access|refresh)[_-]?token|token[_-]?value|client[_-]?secret|credential[_-]?(?:secret|value)|private[_-]?key|secret[_-]?value|password|database[_-]?url|service[_-]?role)/iu;
const unresolvedValue =
  /(?:REPLACE_WITH|replace-with|\$\{|<[A-Z][A-Z0-9_-]*>)/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const treePattern = /^[a-f0-9]{40}$/u;
const hyperdriveIdPattern = /^[a-f0-9]{32}$/u;
const accessIdentifierPattern = /^[A-Za-z0-9._-]{16,160}$/u;
const safeNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const safeModelIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

export class DeploymentRenderError extends Error {
  constructor(code) {
    super(code);
    this.name = "DeploymentRenderError";
  }
}

const fail = (code) => {
  throw new DeploymentRenderError(code);
};

const stableJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
};

const prettyJson = (value) =>
  `${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`;

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const exactKeys = (value, expected, code) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code);
  }
};

const exactStringSet = (actual, expected, code) => {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) {
    fail(code);
  }
  const observed = [...actual].sort();
  const wanted = [...expected].sort();
  if (
    observed.length !== wanted.length ||
    observed.some((value, index) => value !== wanted[index])
  ) {
    fail(code);
  }
};

const isWithin = (parent, child) => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

const assertNoRawCredentialFields = (value) => {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoRawCredentialFields(entry);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      key !== "supabaseServiceRoleInstalledInWorkers" &&
      forbiddenCredentialKey.test(key)
    ) {
      fail("credential_value_field_forbidden");
    }
    assertNoRawCredentialFields(entry);
  }
};

const assertNoUnresolvedValues = (value) => {
  if (typeof value === "string" && unresolvedValue.test(value)) {
    fail("rendered_config_unresolved_value");
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnresolvedValues(entry);
  } else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) assertNoUnresolvedValues(entry);
  }
};

const readTemplate = async (name) => {
  const templatePath = resolve(templateRoot, name);
  if (!isWithin(templateRoot, templatePath)) fail("template_path_unsafe");
  try {
    return JSON.parse(await readFile(templatePath, "utf8"));
  } catch {
    fail("template_invalid");
  }
};

const resolveMain = async (templateName, main) => {
  if (typeof main !== "string" || main.length === 0) fail("template_main_invalid");
  const absolute = resolve(templateRoot, main);
  if (!isWithin(cloudflareRoot, absolute)) fail("template_main_unsafe");
  const canonical = await realpath(absolute);
  if (!isWithin(cloudflareRoot, canonical)) fail("template_main_unsafe");
  return canonical;
};

const getRepositoryState = () => {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  const commit = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  let baseIsAncestor = false;
  try {
    execFileSync("git", [
      "merge-base",
      "--is-ancestor",
      sourceBaseCommit,
      commit,
    ], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
    baseIsAncestor = true;
  } catch {
    baseIsAncestor = false;
  }
  return Object.freeze({ baseIsAncestor, commit, tree });
};

const validateSource = (input, repositoryState) => {
  exactKeys(
    input.source,
    ["baseCommit", "commit", "tree"],
    "source_contract_invalid",
  );
  if (
    !commitPattern.test(input.source.commit) ||
    !treePattern.test(input.source.tree) ||
    input.source.baseCommit !== sourceBaseCommit ||
    input.source.commit !== repositoryState.commit ||
    input.source.tree !== repositoryState.tree ||
    repositoryState.baseIsAncestor !== true
  ) {
    fail("source_binding_mismatch");
  }

  exactKeys(
    input.review,
    [
      "ciPassed",
      "ciRequired",
      "exactHeadReviewed",
      "p0",
      "p1",
      "sourceCommit",
      "sourceTree",
    ],
    "review_contract_invalid",
  );
  if (
    input.review.sourceCommit !== input.source.commit ||
    input.review.sourceTree !== input.source.tree
  ) {
    fail("review_source_mismatch");
  }
};

const validateDeploymentCredential = (credential) => {
  exactKeys(
    credential,
    [
      "activity",
      "expiry",
      "exposure",
      "installedInRuntime",
      "name",
      "permissions",
      "presence",
      "scope",
    ],
    "deployment_credential_contract_invalid",
  );
  if (
    !safeNamePattern.test(credential.name) ||
    credential.presence !== "PRESENT" ||
    credential.activity !== "ACTIVE" ||
    credential.exposure !== "NOT_EXPOSED" ||
    credential.scope !== "SCOPE_MATCH" ||
    credential.expiry !== "EXPIRY_ACCEPTABLE" ||
    credential.installedInRuntime !== false
  ) {
    fail("deployment_credential_not_bounded");
  }
  exactStringSet(
    credential.permissions,
    reviewedDeploymentPermissions,
    "deployment_credential_scope_too_broad",
  );
};

const validateAccess = (access, active) => {
  exactKeys(
    access,
    [
      "applicationAudience",
      "applicationStatus",
      "gatewayExposure",
      "policyStatus",
      "serviceTokenClientId",
      "serviceTokenStatus",
      "teamDomain",
    ],
    "access_contract_invalid",
  );
  let parsedTeamDomain;
  try {
    parsedTeamDomain = new URL(access.teamDomain);
  } catch {
    fail("access_team_domain_invalid");
  }
  if (
    parsedTeamDomain.protocol !== "https:" ||
    parsedTeamDomain.username !== "" ||
    parsedTeamDomain.password !== "" ||
    parsedTeamDomain.port !== "" ||
    parsedTeamDomain.pathname !== "/" ||
    parsedTeamDomain.search !== "" ||
    parsedTeamDomain.hash !== "" ||
    !parsedTeamDomain.hostname.endsWith(".cloudflareaccess.com") ||
    !accessIdentifierPattern.test(access.applicationAudience) ||
    !accessIdentifierPattern.test(access.serviceTokenClientId) ||
    access.gatewayExposure !== "access_protected_workers_dev"
  ) {
    fail("access_contract_invalid");
  }
  if (
    active &&
    (
      access.applicationStatus !== "ACTIVE" ||
      access.policyStatus !== "ACTIVE" ||
      access.serviceTokenStatus !== "ACTIVE"
    )
  ) {
    fail("access_not_ready");
  }
};

const validateProviderReadiness = (readiness, active) => {
  exactKeys(
    readiness,
    [
      "deploymentCredential",
      "netBoundary",
      "runtimeLoginProvisioningReady",
      "supabaseServiceRoleInstalledInWorkers",
    ],
    "provider_readiness_contract_invalid",
  );
  validateDeploymentCredential(readiness.deploymentCredential);
  if (readiness.supabaseServiceRoleInstalledInWorkers !== false) {
    fail("supabase_service_role_forbidden");
  }
  if (
    active &&
    (
      readiness.netBoundary !==
        "PROVIDER_CONFIRMED_PUBLIC_USAGE_REVOKED" ||
      readiness.runtimeLoginProvisioningReady !== true
    )
  ) {
    fail("net_boundary_not_ready");
  }
};

const expectedServiceBindings = () =>
  Object.fromEntries(
    RUNTIME_MANIFEST.principals.map((principal) => [
      principal.binding,
      principal.workerName,
    ]),
  );

const validateServiceBindings = (bindings) => {
  const expected = expectedServiceBindings();
  exactKeys(
    bindings,
    Object.keys(expected),
    "service_binding_contract_invalid",
  );
  for (const [binding, worker] of Object.entries(expected)) {
    if (bindings[binding] !== worker) fail("cross_principal_binding_forbidden");
  }
};

const validateHyperdrive = (hyperdrive, active) => {
  if (!active && hyperdrive === null) return new Map();
  exactKeys(
    hyperdrive,
    RUNTIME_MANIFEST.principals.map((principal) => principal.dbRole),
    "hyperdrive_contract_invalid",
  );
  const ids = new Set();
  const result = new Map();
  for (const principal of RUNTIME_MANIFEST.principals) {
    const entry = hyperdrive[principal.dbRole];
    exactKeys(
      entry,
      ["binding", "cacheMode", "configurationId", "principal"],
      "hyperdrive_entry_invalid",
    );
    if (
      entry.principal !== principal.dbRole ||
      entry.binding !== principal.hyperdriveBinding
    ) {
      fail("cross_principal_hyperdrive_forbidden");
    }
    if (entry.cacheMode !== "disabled") {
      fail("hyperdrive_cache_must_be_disabled");
    }
    if (!hyperdriveIdPattern.test(entry.configurationId)) {
      fail("hyperdrive_id_invalid");
    }
    if (ids.has(entry.configurationId)) fail("hyperdrive_id_duplicate");
    ids.add(entry.configurationId);
    result.set(principal.dbRole, entry);
  }
  return result;
};

const validateRuntimeVariables = (runtimeVariables, active) => {
  if (!active && runtimeVariables === null) return {};
  exactKeys(
    runtimeVariables,
    ["cognitive_model_router"],
    "runtime_variable_contract_invalid",
  );
  const model = runtimeVariables.cognitive_model_router;
  exactKeys(model, modelRuntimeVariableNames, "model_variable_contract_invalid");
  for (const [name, value] of Object.entries(model)) {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 160 ||
      unresolvedValue.test(value)
    ) {
      fail("model_variable_invalid");
    }
    if (
      name.endsWith("_USD_PER_MILLION") &&
      (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/u.test(value) ||
        Number(value) > 1000)
    ) {
      fail("model_cost_variable_invalid");
    }
    if (
      !name.endsWith("_USD_PER_MILLION") &&
      !safeModelIdentifierPattern.test(value)
    ) {
      fail("model_variable_invalid");
    }
  }
  return runtimeVariables;
};

const assertActiveGates = (input) => {
  if (
    input.review.exactHeadReviewed !== true ||
    input.review.p0 !== 0 ||
    input.review.p1 !== 0 ||
    input.review.ciRequired !== 13 ||
    input.review.ciPassed !== 13
  ) {
    fail("exact_review_gate_not_satisfied");
  }
};

export const validateDeploymentInput = (
  input,
  repositoryState = getRepositoryState(),
) => {
  exactKeys(
    input,
    [
      "access",
      "activationMode",
      "hyperdrive",
      "providerReadiness",
      "review",
      "runtimeVariables",
      "schemaVersion",
      "serviceBindings",
      "source",
    ],
    "deployment_input_contract_invalid",
  );
  assertNoRawCredentialFields(input);
  if (
    input.schemaVersion !== inputSchema ||
    !["active", "inert"].includes(input.activationMode)
  ) {
    fail("deployment_input_contract_invalid");
  }
  const active = input.activationMode === "active";
  validateSource(input, repositoryState);
  validateProviderReadiness(input.providerReadiness, active);
  validateAccess(input.access, active);
  validateServiceBindings(input.serviceBindings);
  const hyperdrive = validateHyperdrive(input.hyperdrive, active);
  const runtimeVariables = validateRuntimeVariables(
    input.runtimeVariables,
    active,
  );
  if (active) assertActiveGates(input);
  return Object.freeze({ active, hyperdrive, runtimeVariables });
};

const renderGateway = async (input) => {
  const templateName = "gateway.wrangler.template.jsonc";
  const template = await readTemplate(templateName);
  const config = {
    ...template,
    main: await resolveMain(templateName, template.main),
    preview_urls: false,
    routes: [],
    services: RUNTIME_MANIFEST.principals.map((principal) => ({
      binding: principal.binding,
      service: input.serviceBindings[principal.binding],
    })),
    vars: {
      ...template.vars,
      CF_ACCESS_AUD: input.access.applicationAudience,
      CF_ACCESS_SERVICE_TOKEN_COMMON_NAME:
        input.access.serviceTokenClientId,
      CF_ACCESS_TEAM_DOMAIN: input.access.teamDomain,
      SOURCE_COMMIT: input.source.commit,
      SOURCE_BASE_COMMIT: input.source.baseCommit,
    },
    workers_dev: true,
  };
  delete config.secrets;
  delete config.hyperdrive;
  assertNoUnresolvedValues(config);
  return config;
};

const renderPrivateWorker = async (
  input,
  principal,
  hyperdrive,
  runtimeVariables,
) => {
  const templateName = `${principal.dbRole}.wrangler.template.jsonc`;
  const template = await readTemplate(templateName);
  const config = {
    ...template,
    hyperdrive: [{
      binding: principal.hyperdriveBinding,
      id: hyperdrive.get(principal.dbRole).configurationId,
    }],
    main: await resolveMain(templateName, template.main),
    preview_urls: false,
    routes: [],
    vars: {
      ...template.vars,
      SOURCE_COMMIT: input.source.commit,
      SOURCE_BASE_COMMIT: input.source.baseCommit,
      ...(principal.dbRole === "cognitive_model_router"
        ? runtimeVariables.cognitive_model_router
        : {}),
    },
    workers_dev: false,
  };
  delete config.secrets;
  assertNoUnresolvedValues(config);
  if (
    config.hyperdrive.length !== 1 ||
    config.hyperdrive[0].binding !== principal.hyperdriveBinding ||
    config.workers_dev !== false ||
    config.preview_urls !== false ||
    config.routes.length !== 0
  ) {
    fail("private_worker_exposure_invalid");
  }
  return config;
};

export const renderDeployment = async (
  input,
  repositoryState = getRepositoryState(),
) => {
  const validated = validateDeploymentInput(input, repositoryState);
  const baseMetadata = {
    activationMode: input.activationMode,
    sourceBaseCommit: input.source.baseCommit,
    sourceCommit: input.source.commit,
    sourceTree: input.source.tree,
  };
  if (!validated.active) {
    return Object.freeze({
      commandPlan: {
        commands: [],
        deploymentOrder: [],
        gate: "BLOCKED_INERT",
        schemaVersion: outputSchema,
      },
      configs: new Map(),
      metadata: {
        ...baseMetadata,
        configCount: 0,
        gate: "BLOCKED_INERT",
        inputAttestationHash: sha256(stableJson(input)),
        schemaVersion: outputSchema,
      },
    });
  }

  const configs = new Map();
  for (const principal of RUNTIME_MANIFEST.principals) {
    configs.set(
      `${principal.dbRole}.wrangler.jsonc`,
      await renderPrivateWorker(
        input,
        principal,
        validated.hyperdrive,
        validated.runtimeVariables,
      ),
    );
  }
  configs.set("gateway.wrangler.jsonc", await renderGateway(input));

  const configHashes = Object.fromEntries(
    [...configs.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([name, config]) => [name, sha256(prettyJson(config))]),
  );
  const deploymentOrder = [
    ...RUNTIME_MANIFEST.principals.map(
      (principal) => `${principal.dbRole}.wrangler.jsonc`,
    ),
    "gateway.wrangler.jsonc",
  ];
  const commandPlan = {
    commands: deploymentOrder.map((config) => ({
      argv: ["npx", "wrangler", "deploy", "--config", join("wrangler", config)],
      configSha256: configHashes[config],
    })),
    deploymentOrder,
    gate: "READY_EXACT_REVIEW_AND_NET",
    schemaVersion: outputSchema,
  };
  return Object.freeze({
    commandPlan,
    configs,
    metadata: {
      ...baseMetadata,
      configCount: configs.size,
      configHashes,
      gatewayCredentialCount: 0,
      gate: "READY_EXACT_REVIEW_AND_NET",
      inputAttestationHash: sha256(stableJson(input)),
      privateWorkerCount: RUNTIME_MANIFEST.principals.length,
      schemaVersion: outputSchema,
    },
  });
};

const assertOwnerOnlyInput = async (inputPath) => {
  if (!isAbsolute(inputPath)) fail("input_path_must_be_absolute");
  const stat = await lstat(inputPath).catch(() => fail("input_file_missing"));
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 1_048_576 ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0
  ) {
    fail("input_file_not_owner_only");
  }
  const canonical = await realpath(inputPath);
  if (isWithin(repositoryRoot, canonical)) fail("input_file_inside_repository");
  return canonical;
};

const temporaryRoots = async () => {
  const candidates = [tmpdir(), "/tmp"];
  const roots = [];
  for (const candidate of candidates) {
    try {
      roots.push(await realpath(candidate));
    } catch {
      // A platform may not provide /tmp.
    }
  }
  return [...new Set(roots)];
};

const assertOwnerOnlyOutput = async (outputPath) => {
  if (!isAbsolute(outputPath)) fail("output_path_must_be_absolute");
  const resolved = resolve(outputPath);
  if (isWithin(repositoryRoot, resolved)) fail("output_path_inside_repository");
  const parent = await realpath(dirname(resolved)).catch(() =>
    fail("output_parent_missing")
  );
  const canonicalTarget = resolve(parent, resolved.slice(dirname(resolved).length + 1));
  const roots = await temporaryRoots();
  if (!roots.some((root) => isWithin(root, canonicalTarget))) {
    fail("output_path_not_temporary");
  }

  let stat;
  try {
    stat = await lstat(canonicalTarget);
  } catch (error) {
    if (error?.code !== "ENOENT") fail("output_path_invalid");
  }
  if (stat) {
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0
    ) {
      fail("output_directory_not_owner_only");
    }
    if ((await readdir(canonicalTarget)).length !== 0) {
      fail("output_directory_not_empty");
    }
    return canonicalTarget;
  }
  await mkdir(canonicalTarget, { mode: 0o700 });
  const created = await lstat(canonicalTarget);
  if ((created.mode & 0o077) !== 0) fail("output_directory_not_owner_only");
  return canonicalTarget;
};

const writeOwnerOnly = async (path, content) => {
  const handle = await open(
    path,
    fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_WRONLY |
      (fsConstants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
};

export const renderFromOwnerOnlyFile = async ({
  inputPath,
  outputPath,
  repositoryState = getRepositoryState(),
}) => {
  const canonicalInput = await assertOwnerOnlyInput(inputPath);
  const raw = await readFile(canonicalInput, "utf8");
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    fail("input_json_invalid");
  }
  const rendered = await renderDeployment(input, repositoryState);
  const canonicalOutput = await assertOwnerOnlyOutput(outputPath);
  const wranglerDirectory = join(canonicalOutput, "wrangler");
  await mkdir(wranglerDirectory, { mode: 0o700 });
  for (const [name, config] of rendered.configs) {
    await writeOwnerOnly(join(wranglerDirectory, name), prettyJson(config));
  }
  await writeOwnerOnly(
    join(canonicalOutput, "command-plan.json"),
    prettyJson(rendered.commandPlan),
  );
  const metadataContent = prettyJson(rendered.metadata);
  await writeOwnerOnly(
    join(canonicalOutput, "deployment-metadata.json"),
    metadataContent,
  );
  return Object.freeze({
    configCount: rendered.configs.size,
    gate: rendered.metadata.gate,
    metadataSha256: sha256(metadataContent),
  });
};

const main = async () => {
  const args = process.argv.slice(2);
  if (
    args.length !== 4 ||
    args[0] !== "--input" ||
    args[2] !== "--output"
  ) {
    fail("usage_invalid");
  }
  const result = await renderFromOwnerOnlyFile({
    inputPath: args[1],
    outputPath: args[3],
  });
  process.stdout.write(
    `GATE=${result.gate}\nCONFIG_COUNT=${result.configCount}\n` +
      `METADATA_SHA256=${result.metadataSha256}\n`,
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    const code = error instanceof DeploymentRenderError
      ? error.message
      : "deployment_render_failed";
    process.stderr.write(`ERROR=${code}\n`);
    process.exitCode = 1;
  });
}
