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
  "chillywood-cognitive-level01-provider-deployment-input-v2";
const outputSchema =
  "chillywood-cognitive-level01-provider-deployment-output-v2";
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
const accessTeamDomainPattern =
  /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u;
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
    !accessTeamDomainPattern.test(access.teamDomain) ||
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

const validateHyperdriveEntry = (principal, entry, ids) => {
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
  if (
    principal === "cognitive_model_router" &&
    name === "COGNITIVE_MODEL_PROVIDER" &&
    value === "openai"
  ) {
    return;
  }
  fail("runtime_variable_validator_missing");
};

const validateRuntimeVariables = (principal, runtimeVariables) => {
  const expected = Object.keys(principal.runtimeConfiguration).sort();
  exactKeys(
    runtimeVariables,
    expected,
    "runtime_principal_variable_contract_invalid",
  );
  for (const name of expected) {
    validateRuntimeVariable(
      principal.dbRole,
      name,
      runtimeVariables[name],
    );
  }
  if (principal.dbRole !== "cognitive_public_research_broker") {
    return;
  }
  const research = runtimeVariables;
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
};

const validatePrincipalReview = (input, principal, review) => {
  exactKeys(
    review,
    [
      "lane",
      "p0",
      "p1",
      "principal",
      "sourceCommit",
      "sourceModuleGraphSha256",
      "sourceTree",
      "status",
    ],
    "principal_review_contract_invalid",
  );
  if (
    review.lane !== "independent_principal_activation" ||
    review.status !== "PASSED" ||
    review.p0 !== 0 ||
    review.p1 !== 0 ||
    review.principal !== principal.dbRole ||
    review.sourceCommit !== input.source.commit ||
    review.sourceModuleGraphSha256 !== input.source.moduleGraphSha256 ||
    review.sourceTree !== input.source.tree
  ) {
    fail("principal_independent_review_required");
  }
};

const validateRollback = (principal, rollback) => {
  exactKeys(
    rollback,
    [
      "deactivationMode",
      "evidenceHash",
      "preservesSiblings",
      "principal",
      "testStatus",
    ],
    "principal_rollback_contract_invalid",
  );
  if (
    rollback.deactivationMode !==
      "redeploy_inert_remove_runtime_bindings" ||
    rollback.principal !== principal.dbRole ||
    rollback.preservesSiblings !== true ||
    rollback.testStatus !== "PASSED" ||
    !/^[a-f0-9]{64}$/u.test(rollback.evidenceHash)
  ) {
    fail("principal_rollback_not_ready");
  }
};

const validateTrigger = (principal, trigger) => {
  if (trigger === null) return;
  exactKeys(
    trigger,
    ["cron", "evidenceHash", "status"],
    "principal_trigger_contract_invalid",
  );
  if (
    principal.dbRole !== "cognitive_public_research_broker" ||
    trigger.status !== "ACTIVE_REVIEWED" ||
    trigger.cron !== "17 * * * *" ||
    !/^[a-f0-9]{64}$/u.test(trigger.evidenceHash)
  ) {
    fail("principal_trigger_not_ready");
  }
};

const validatePrincipalStates = (input) => {
  exactKeys(
    input.principals,
    RUNTIME_MANIFEST.principals.map((principal) => principal.dbRole),
    "principal_state_matrix_invalid",
  );
  const active = new Map();
  const hyperdriveIds = new Set();
  for (const principal of RUNTIME_MANIFEST.principals) {
    const contract = input.principals[principal.dbRole];
    exactKeys(
      contract,
      [
        "database",
        "installedBindings",
        "providerBindings",
        "review",
        "rollback",
        "runtimeVariables",
        "state",
        "trigger",
      ],
      "principal_activation_contract_invalid",
    );
    if (!["active", "inert"].includes(contract.state)) {
      fail("principal_state_invalid");
    }
    if (contract.state === "inert") {
      if (
        contract.database !== null ||
        contract.review !== null ||
        contract.rollback !== null ||
        contract.runtimeVariables !== null ||
        contract.trigger !== null
      ) {
        fail("inert_principal_runtime_forbidden");
      }
      exactStringSet(
        contract.installedBindings,
        [],
        "inert_principal_binding_forbidden",
      );
      exactStringSet(
        contract.providerBindings,
        [],
        "inert_principal_provider_binding_forbidden",
      );
      continue;
    }

    exactKeys(
      contract.database,
      [
        "hyperdrive",
        "loginIdentity",
        "netAccess",
        "principalRole",
        "rpcAllowlist",
      ],
      "principal_database_contract_invalid",
    );
    validateHyperdriveEntry(
      principal,
      contract.database.hyperdrive,
      hyperdriveIds,
    );
    if (
      contract.database.loginIdentity !== principal.loginRole ||
      contract.database.principalRole !== principal.dbRole ||
      contract.database.netAccess !== "DENIED"
    ) {
      fail("principal_database_identity_invalid");
    }
    exactStringSet(
      contract.database.rpcAllowlist,
      principal.rpcAllowlist,
      "principal_rpc_allowlist_invalid",
    );
    exactStringSet(
      contract.installedBindings,
      principal.requiredSecrets,
      "principal_runtime_binding_contract_invalid",
    );
    exactStringSet(
      contract.providerBindings,
      principal.providerBindings,
      "principal_provider_binding_contract_invalid",
    );
    validateRuntimeVariables(principal, contract.runtimeVariables);
    validatePrincipalReview(input, principal, contract.review);
    validateRollback(principal, contract.rollback);
    validateTrigger(principal, contract.trigger);
    active.set(principal.dbRole, contract);
  }
  return active;
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
      "principals",
      "providerReadiness",
      "review",
      "schemaVersion",
      "serviceBindings",
      "source",
    ],
    "deployment_input_contract_invalid",
  );
  assertNoRawCredentialFields(input);
  if (input.schemaVersion !== inputSchema) {
    fail("deployment_input_contract_invalid");
  }
  assertNoUnresolvedValues(input);
  validateSource(input, repositoryState);
  validateAccess(input.access);
  validateServiceBindings(input.serviceBindings);
  assertReviewGates(input);
  const active = validatePrincipalStates(input);
  validateProviderReadiness(input.providerReadiness, active.size > 0);
  return Object.freeze({ active });
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
      COGNITIVE_PRINCIPAL_STATES: stableJson(
        Object.fromEntries(
          RUNTIME_MANIFEST.principals.map((principal) => [
            principal.dbRole,
            input.principals[principal.dbRole].state,
          ]),
        ),
      ),
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
  contract,
  sourceGraph,
) => {
  const templateName = `${principal.dbRole}.wrangler.template.jsonc`;
  const template = readTemplate(templateName, sourceGraph);
  const active = contract.state === "active";
  const config = {
    ...template,
    ...(active
      ? {
        hyperdrive: [{
          binding: principal.hyperdriveBinding,
          id: contract.database.hyperdrive.configurationId,
        }],
      }
      : {}),
    main: resolvePackagedMain(template.main, sourceGraph),
    preview_urls: false,
    routes: [],
    vars: active
      ? {
        ...template.vars,
        ...contract.runtimeVariables,
        COGNITIVE_DEPLOYMENT_STATE: "active",
        SOURCE_COMMIT: input.source.commit,
        SOURCE_BASE_COMMIT: input.source.baseCommit,
      }
      : {
        COGNITIVE_DEPLOYMENT_STATE: "inert",
        RUNTIME_SCHEMA_VERSION: template.vars.RUNTIME_SCHEMA_VERSION,
        SOURCE_COMMIT: input.source.commit,
        SOURCE_BASE_COMMIT: input.source.baseCommit,
      },
    workers_dev: false,
  };
  delete config.secrets;
  delete config.triggers;
  if (!active) {
    delete config.hyperdrive;
  } else if (contract.trigger !== null) {
    config.triggers = { crons: [contract.trigger.cron] };
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
  const principalStates = Object.fromEntries(
    RUNTIME_MANIFEST.principals.map((principal) => [
      principal.dbRole,
      input.principals[principal.dbRole].state,
    ]),
  );
  const activePrincipals = Object.entries(principalStates)
    .filter(([, state]) => state === "active")
    .map(([principal]) => principal)
    .sort();
  const inertPrincipals = Object.entries(principalStates)
    .filter(([, state]) => state === "inert")
    .map(([principal]) => principal)
    .sort();
  const baseMetadata = {
    activePrincipalCount: activePrincipals.length,
    activePrincipals,
    globalReadiness: activePrincipals.length ===
        RUNTIME_MANIFEST.principals.length
      ? "ALL_PRINCIPALS_ACTIVE"
      : "NOT_GLOBALLY_READY",
    inertPrincipalCount: inertPrincipals.length,
    inertPrincipals,
    principalStates,
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
        input.principals[principal.dbRole],
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
  const gate = validated.active.size === 0
    ? "READY_STAGED_INERT_ONLY"
    : validated.active.size === RUNTIME_MANIFEST.principals.length
    ? "READY_STAGED_ALL_PRINCIPALS"
    : "READY_STAGED_PARTIAL";
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
