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
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { RUNTIME_MANIFEST } from "../src/manifest.mjs";
import {
  PINNED_RESEARCH_EXTERNAL_PATH,
} from "../../pinned-research-transport/src/invocation-contract.mjs";

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
const sourcePackageRoot = "source/repository";
const sourceGraphPathspecs = Object.freeze([
  "config/intelligence/chillywood-product-experience-baseline-v1.json",
  "config/intelligence/product-experience-objective-accessibility-surface-bindings-v1.json",
  "config/intelligence/research-authorities.json",
  "isolated-runtime/cloudflare/generated/entrypoints",
  "isolated-runtime/cloudflare/generated/wrangler",
  "isolated-runtime/cloudflare/package-lock.json",
  "isolated-runtime/cloudflare/package.json",
  "isolated-runtime/cloudflare/src",
  "isolated-runtime/pinned-research-transport/src",
]);
const requiredSourceGraphPaths = Object.freeze([
  "config/intelligence/chillywood-product-experience-baseline-v1.json",
  "config/intelligence/product-experience-objective-accessibility-surface-bindings-v1.json",
  "config/intelligence/research-authorities.json",
  "isolated-runtime/cloudflare/generated/wrangler/gateway.wrangler.template.jsonc",
  "isolated-runtime/cloudflare/package-lock.json",
  "isolated-runtime/cloudflare/package.json",
  "isolated-runtime/cloudflare/src/gateway.mjs",
  "isolated-runtime/cloudflare/src/manifest.mjs",
  "isolated-runtime/pinned-research-transport/src/invocation-contract.mjs",
]);
const researchRetentionRuntimeVariableNames = Object.freeze([
  "COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH",
  "COGNITIVE_RESEARCH_RETENTION_BATCH_LIMIT",
  "COGNITIVE_RESEARCH_RETENTION_CRON",
  "COGNITIVE_RESEARCH_RETENTION_ENVIRONMENT",
  "COGNITIVE_RESEARCH_RETENTION_MAXIMUM_BATCHES",
  "COGNITIVE_RESEARCH_RETENTION_PLATFORM",
  "COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID",
  "COGNITIVE_RESEARCH_RETENTION_PROJECT_ID",
  "COGNITIVE_RESEARCH_RETENTION_TASK_ID",
  "COGNITIVE_RESEARCH_RETENTION_TIMEOUT_MS",
]);
const researchRuntimeVariableNames = Object.freeze([
  "COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL",
  ...researchRetentionRuntimeVariableNames,
]);
const forbiddenCredentialKey =
  /(?:api[_-]?(?:key|token)|(?:access|refresh)[_-]?token|token[_-]?value|client[_-]?secret|credential[_-]?(?:secret|value)|private[_-]?key|secret[_-]?value|password|database[_-]?url|service[_-]?role)/iu;
const unresolvedValue =
  /(?:REPLACE_WITH|replace-with|\$\{|<[A-Z][A-Z0-9_-]*>)/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const treePattern = /^[a-f0-9]{40}$/u;
const hyperdriveIdPattern = /^[a-f0-9]{32}$/u;
const accessAudiencePattern = /^[a-f0-9]{64}$/u;
const accessServiceTokenCommonNamePattern = /^[a-f0-9]{32}\.access$/u;
const safeNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const safeModelIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const safeGitPathPattern =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/-]+$/u;

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

const gitOutput = (root, args, options = {}) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? null,
    maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });

const assertSafeGitPath = (path) => {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > 512 ||
    !safeGitPathPattern.test(path) ||
    posix.normalize(path) !== path
  ) {
    fail("source_module_path_unsafe");
  }
};

export const collectGitSourceGraph = ({
  commit,
  pathspecs,
  repository,
  requiredPaths = [],
}) => {
  if (
    !commitPattern.test(commit) ||
    !Array.isArray(pathspecs) ||
    pathspecs.length === 0 ||
    pathspecs.some((path) => typeof path !== "string") ||
    !Array.isArray(requiredPaths)
  ) {
    fail("source_module_graph_contract_invalid");
  }
  for (const path of [...pathspecs, ...requiredPaths]) assertSafeGitPath(path);

  let listing;
  try {
    listing = gitOutput(repository, [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      commit,
      "--",
      ...pathspecs,
    ]);
  } catch {
    fail("source_module_graph_unavailable");
  }

  const entries = [];
  const observed = new Set();
  for (const record of listing.toString("utf8").split("\0")) {
    if (record.length === 0) continue;
    const match = record.match(
      /^(?<mode>[0-9]{6}) blob (?<oid>[a-f0-9]{40})\t(?<path>.+)$/u,
    );
    if (!match?.groups) fail("source_module_graph_entry_invalid");
    const { mode, oid, path } = match.groups;
    assertSafeGitPath(path);
    if (mode !== "100644" || observed.has(path)) {
      fail("source_module_graph_entry_invalid");
    }
    let bytes;
    try {
      bytes = gitOutput(repository, ["cat-file", "blob", oid]);
    } catch {
      fail("source_module_graph_unavailable");
    }
    observed.add(path);
    entries.push(Object.freeze({
      blobOid: oid,
      bytes,
      bytesSha256: sha256(bytes),
      mode,
      path,
      size: bytes.length,
    }));
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  if (
    entries.length === 0 ||
    requiredPaths.some((path) => !observed.has(path))
  ) {
    fail("source_module_graph_incomplete");
  }
  const hashInput = entries.map((entry) =>
    `${entry.path}\0${entry.mode}\0${entry.blobOid}\0` +
    `${entry.bytesSha256}\0${entry.size}\n`
  ).join("");
  return Object.freeze({
    entries: Object.freeze(entries),
    fileCount: entries.length,
    hash: sha256(hashInput),
  });
};

export const assertGitWorktreeMatchesReviewedSource = ({
  pathspecs,
  repository,
}) => {
  if (
    !Array.isArray(pathspecs) ||
    pathspecs.length === 0 ||
    pathspecs.some((path) => typeof path !== "string")
  ) {
    fail("source_module_graph_contract_invalid");
  }
  for (const path of pathspecs) assertSafeGitPath(path);
  let status;
  try {
    status = gitOutput(repository, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ...pathspecs,
    ]);
  } catch {
    fail("source_module_worktree_status_unavailable");
  }
  if (status.length !== 0) fail("source_module_worktree_dirty");
};

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

const graphEntry = (sourceGraph, path, code = "source_module_graph_incomplete") => {
  const entry = sourceGraph.entries.find((candidate) => candidate.path === path);
  if (!entry) fail(code);
  return entry;
};

const readTemplate = (name, sourceGraph) => {
  const templatePath = resolve(templateRoot, name);
  if (!isWithin(templateRoot, templatePath)) fail("template_path_unsafe");
  const repositoryPath = relative(repositoryRoot, templatePath)
    .split(sep).join("/");
  assertSafeGitPath(repositoryPath);
  try {
    return JSON.parse(
      graphEntry(sourceGraph, repositoryPath, "template_missing")
        .bytes.toString("utf8"),
    );
  } catch {
    fail("template_invalid");
  }
};

const resolvePackagedMain = (main, sourceGraph) => {
  if (typeof main !== "string" || main.length === 0) fail("template_main_invalid");
  const absolute = resolve(templateRoot, main);
  if (!isWithin(cloudflareRoot, absolute)) fail("template_main_unsafe");
  const repositoryPath = relative(repositoryRoot, absolute)
    .split(sep).join("/");
  assertSafeGitPath(repositoryPath);
  graphEntry(sourceGraph, repositoryPath, "template_main_missing");
  return `../${sourcePackageRoot}/${repositoryPath}`;
};

export const getRepositoryState = () => {
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
  assertGitWorktreeMatchesReviewedSource({
    pathspecs: sourceGraphPathspecs,
    repository: repositoryRoot,
  });
  const sourceGraph = collectGitSourceGraph({
    commit,
    pathspecs: sourceGraphPathspecs,
    repository: repositoryRoot,
    requiredPaths: [
      ...requiredSourceGraphPaths,
      ...RUNTIME_MANIFEST.principals.map(
        (principal) =>
          `isolated-runtime/cloudflare/generated/entrypoints/${principal.dbRole}.mjs`,
      ),
      ...RUNTIME_MANIFEST.principals.map(
        (principal) =>
          `isolated-runtime/cloudflare/generated/wrangler/${principal.dbRole}.wrangler.template.jsonc`,
      ),
    ],
  });
  return Object.freeze({ baseIsAncestor, commit, sourceGraph, tree });
};

const validateSource = (input, repositoryState) => {
  exactKeys(
    input.source,
    ["baseCommit", "commit", "moduleGraphSha256", "tree"],
    "source_contract_invalid",
  );
  if (
    !commitPattern.test(input.source.commit) ||
    !treePattern.test(input.source.tree) ||
    !/^[a-f0-9]{64}$/u.test(input.source.moduleGraphSha256) ||
    repositoryState?.sourceGraph?.hash !== input.source.moduleGraphSha256 ||
    repositoryState?.sourceGraph?.fileCount < 1 ||
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
      "sourceModuleGraphSha256",
      "sourceTree",
    ],
    "review_contract_invalid",
  );
  if (
    input.review.sourceCommit !== input.source.commit ||
    input.review.sourceModuleGraphSha256 !== input.source.moduleGraphSha256 ||
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

const validateAccess = (access) => {
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
    !accessAudiencePattern.test(access.applicationAudience) ||
    !accessServiceTokenCommonNamePattern.test(access.serviceTokenClientId) ||
    access.gatewayExposure !== "access_protected_workers_dev"
  ) {
    fail("access_contract_invalid");
  }
  if (
    access.applicationStatus !== "ACTIVE" ||
    access.policyStatus !== "ACTIVE" ||
    access.serviceTokenStatus !== "ACTIVE"
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

const placeholderConfigurationByPrincipal = () =>
  new Map(
    RUNTIME_MANIFEST.principals
      .map((principal) => [
        principal.dbRole,
        Object.keys(principal.runtimeConfiguration)
          .filter((name) =>
            unresolvedValue.test(principal.runtimeConfiguration[name])
          )
          .sort(),
      ])
      .filter(([, names]) => names.length > 0),
  );

const runtimeConfigurationInputByPrincipal = () => {
  const expected = placeholderConfigurationByPrincipal();
  const research = RUNTIME_MANIFEST.principals.find(
    (principal) =>
      principal.dbRole === "cognitive_public_research_broker",
  );
  if (!research) fail("research_runtime_configuration_missing");
  expected.set(
    research.dbRole,
    Object.keys(research.runtimeConfiguration).sort(),
  );
  return expected;
};

const validatePinnedResearchTransportUrl = (value) => {
  if (typeof value !== "string" || value.length > 2_048) {
    fail("runtime_variable_invalid");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("runtime_variable_invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== PINNED_RESEARCH_EXTERNAL_PATH ||
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".localhost") ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname.endsWith(".internal") ||
    /^[0-9.:[\]]+$/u.test(parsed.hostname) ||
    !/^[a-z0-9.-]+$/u.test(parsed.hostname) ||
    parsed.hostname.includes("..") ||
    parsed.toString() !== value
  ) {
    fail("runtime_variable_invalid");
  }
};

const validateModelRuntimeVariable = (name, value) => {
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
    (
      !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/u.test(value) ||
      Number(value) > 1000
    )
  ) {
    fail("model_cost_variable_invalid");
  }
  if (
    !name.endsWith("_USD_PER_MILLION") &&
    !safeModelIdentifierPattern.test(value)
  ) {
    fail("model_variable_invalid");
  }
};

const validateRuntimeVariable = (principal, name, value) => {
  if (
    principal === "cognitive_public_research_broker" &&
    name === "COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL"
  ) {
    validatePinnedResearchTransportUrl(value);
    return;
  }
  if (
    principal === "cognitive_public_research_broker" &&
    researchRetentionRuntimeVariableNames.includes(name)
  ) {
    return;
  }
  if (
    principal === "cognitive_model_router" &&
    [
      "COGNITIVE_MODEL_FAMILY",
      "COGNITIVE_MODEL_INPUT_USD_PER_MILLION",
      "COGNITIVE_MODEL_NAME",
      "COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION",
    ].includes(name)
  ) {
    validateModelRuntimeVariable(name, value);
    return;
  }
  fail("runtime_variable_validator_missing");
};

const validateRuntimeVariables = (runtimeVariables, active) => {
  if (!active) {
    if (runtimeVariables !== null) {
      fail("runtime_variable_contract_invalid");
    }
    return {};
  }
  const expected = runtimeConfigurationInputByPrincipal();
  exactKeys(
    runtimeVariables,
    [...expected.keys()],
    "runtime_variable_contract_invalid",
  );
  for (const [principal, names] of expected) {
    exactKeys(
      runtimeVariables[principal],
      names,
      "runtime_principal_variable_contract_invalid",
    );
    for (const name of names) {
      validateRuntimeVariable(
        principal,
        name,
        runtimeVariables[principal][name],
      );
    }
  }
  const research = runtimeVariables.cognitive_public_research_broker;
  exactKeys(
    research,
    researchRuntimeVariableNames,
    "research_retention_variable_contract_invalid",
  );
  if (
    research.COGNITIVE_RESEARCH_RETENTION_CRON !== "17 * * * *" ||
    research.COGNITIVE_RESEARCH_RETENTION_PLATFORM !== "shared" ||
    research.COGNITIVE_RESEARCH_RETENTION_ENVIRONMENT !== "production" ||
    research.COGNITIVE_RESEARCH_RETENTION_BATCH_LIMIT !== "100" ||
    research.COGNITIVE_RESEARCH_RETENTION_MAXIMUM_BATCHES !== "1" ||
    research.COGNITIVE_RESEARCH_RETENTION_TIMEOUT_MS !== "50000" ||
    !/^[a-f0-9]{64}$/u.test(
      research.COGNITIVE_RESEARCH_RETENTION_ATTESTATION_HASH,
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(
        research.COGNITIVE_RESEARCH_RETENTION_PROCESSOR_ATTESTATION_ID,
      ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(research.COGNITIVE_RESEARCH_RETENTION_PROJECT_ID) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
      .test(research.COGNITIVE_RESEARCH_RETENTION_TASK_ID)
  ) {
    fail("research_retention_variable_invalid");
  }
  return runtimeVariables;
};

const assertReviewGates = (input) => {
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
  validateAccess(input.access);
  validateServiceBindings(input.serviceBindings);
  const hyperdrive = validateHyperdrive(input.hyperdrive, active);
  const runtimeVariables = validateRuntimeVariables(
    input.runtimeVariables,
    active,
  );
  assertReviewGates(input);
  return Object.freeze({ active, hyperdrive, runtimeVariables });
};

const renderGateway = (input, sourceGraph) => {
  const templateName = "gateway.wrangler.template.jsonc";
  const template = readTemplate(templateName, sourceGraph);
  const config = {
    ...template,
    main: resolvePackagedMain(template.main, sourceGraph),
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

const renderPrivateWorker = (
  input,
  principal,
  active,
  hyperdrive,
  runtimeVariables,
  sourceGraph,
) => {
  const templateName = `${principal.dbRole}.wrangler.template.jsonc`;
  const template = readTemplate(templateName, sourceGraph);
  const placeholderNames = Object.keys(principal.runtimeConfiguration)
    .filter((name) => unresolvedValue.test(principal.runtimeConfiguration[name]));
  const config = {
    ...template,
    ...(active
      ? {
        hyperdrive: [{
          binding: principal.hyperdriveBinding,
          id: hyperdrive.get(principal.dbRole).configurationId,
        }],
      }
      : {}),
    main: resolvePackagedMain(template.main, sourceGraph),
    preview_urls: false,
    routes: [],
    vars: {
      ...template.vars,
      SOURCE_COMMIT: input.source.commit,
      SOURCE_BASE_COMMIT: input.source.baseCommit,
      ...(active
        ? runtimeVariables[principal.dbRole] ?? {}
        : {}),
    },
    workers_dev: false,
  };
  delete config.secrets;
  if (!active) {
    delete config.hyperdrive;
    for (const name of placeholderNames) delete config.vars[name];
    for (const name of researchRetentionRuntimeVariableNames) {
      delete config.vars[name];
    }
    delete config.triggers;
  }
  assertNoUnresolvedValues(config);
  if (
    (active &&
      (
        config.hyperdrive.length !== 1 ||
        config.hyperdrive[0].binding !== principal.hyperdriveBinding
      )) ||
    (!active && "hyperdrive" in config) ||
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
    sourceModuleGraphFileCount: repositoryState.sourceGraph.fileCount,
    sourceModuleGraphSha256: input.source.moduleGraphSha256,
    sourceTree: input.source.tree,
  };
  const configs = new Map();
  for (const principal of RUNTIME_MANIFEST.principals) {
    configs.set(
      `${principal.dbRole}.wrangler.jsonc`,
      await renderPrivateWorker(
        input,
        principal,
        validated.active,
        validated.hyperdrive,
        validated.runtimeVariables,
        repositoryState.sourceGraph,
      ),
    );
  }
  configs.set(
    "gateway.wrangler.jsonc",
    renderGateway(input, repositoryState.sourceGraph),
  );

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
  const gate = validated.active
    ? "READY_EXACT_REVIEW_AND_NET"
    : "READY_INERT_NO_DATABASE";
  const commandPlan = {
    commands: deploymentOrder.map((config) => ({
      argv: [
        join(
          sourcePackageRoot,
          "isolated-runtime",
          "cloudflare",
          "node_modules",
          ".bin",
          "wrangler",
        ),
        "deploy",
        "--config",
        join("wrangler", config),
      ],
      configSha256: configHashes[config],
      sourceModuleGraphSha256: input.source.moduleGraphSha256,
    })),
    deploymentOrder,
    gate,
    preparationCommands: [{
      argv: [
        "npm",
        "ci",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--prefix",
        join(
          sourcePackageRoot,
          "isolated-runtime",
          "cloudflare",
        ),
      ],
      sourceModuleGraphSha256: input.source.moduleGraphSha256,
    }],
    schemaVersion: outputSchema,
    sourceModuleGraphSha256: input.source.moduleGraphSha256,
  };
  return Object.freeze({
    commandPlan,
    configs,
    metadata: {
      ...baseMetadata,
      configCount: configs.size,
      configHashes,
      gatewayCredentialCount: 0,
      gate,
      inputAttestationHash: sha256(stableJson(input)),
      privateWorkerCount: RUNTIME_MANIFEST.principals.length,
      schemaVersion: outputSchema,
    },
    sourceGraph: repositoryState.sourceGraph,
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
    await handle.writeFile(
      content,
      typeof content === "string" ? "utf8" : undefined,
    );
  } finally {
    await handle.close();
  }
};

const writeReviewedSourcePackage = async (
  canonicalOutput,
  sourceGraph,
  source,
) => {
  const packageRoot = join(canonicalOutput, sourcePackageRoot);
  await mkdir(packageRoot, { mode: 0o700, recursive: true });
  for (const entry of sourceGraph.entries) {
    assertSafeGitPath(entry.path);
    const destination = resolve(packageRoot, entry.path);
    if (!isWithin(packageRoot, destination)) fail("source_module_path_unsafe");
    await mkdir(dirname(destination), { mode: 0o700, recursive: true });
    await writeOwnerOnly(destination, entry.bytes);
    const written = await readFile(destination);
    if (
      written.length !== entry.size ||
      sha256(written) !== entry.bytesSha256
    ) {
      fail("source_package_readback_mismatch");
    }
  }
  const manifest = {
    entries: sourceGraph.entries.map((entry) => ({
      blobOid: entry.blobOid,
      bytesSha256: entry.bytesSha256,
      mode: entry.mode,
      path: entry.path,
      size: entry.size,
    })),
    fileCount: sourceGraph.fileCount,
    schemaVersion: "chillywood-reviewed-worker-source-package-v1",
    sourceCommit: source.commit,
    sourceModuleGraphSha256: source.moduleGraphSha256,
    sourceTree: source.tree,
  };
  const content = prettyJson(manifest);
  await writeOwnerOnly(
    join(canonicalOutput, "source-manifest.json"),
    content,
  );
  return sha256(content);
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
  const sourceManifestSha256 = await writeReviewedSourcePackage(
    canonicalOutput,
    rendered.sourceGraph,
    input.source,
  );
  const wranglerDirectory = join(canonicalOutput, "wrangler");
  await mkdir(wranglerDirectory, { mode: 0o700 });
  for (const [name, config] of rendered.configs) {
    await writeOwnerOnly(join(wranglerDirectory, name), prettyJson(config));
  }
  const writtenCommandPlan = {
    ...rendered.commandPlan,
    sourceManifestSha256,
  };
  await writeOwnerOnly(
    join(canonicalOutput, "command-plan.json"),
    prettyJson(writtenCommandPlan),
  );
  const writtenMetadataContent = prettyJson({
    ...rendered.metadata,
    sourceManifestSha256,
  });
  await writeOwnerOnly(
    join(canonicalOutput, "deployment-metadata.json"),
    writtenMetadataContent,
  );
  return Object.freeze({
    configCount: rendered.configs.size,
    gate: rendered.metadata.gate,
    metadataSha256: sha256(writtenMetadataContent),
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
