export type CognitivePlatform = "shared" | "ios" | "android" | "web";
export type CognitiveEnvironment = "local" | "ci" | "preview" | "production";
export type CognitiveProvider =
  | "repository"
  | "github"
  | "supabase_local"
  | "research_mock"
  | "model_mock"
  | "none";

export const COGNITIVE_REPOSITORY = "Chillywood2025/chillywood-mobile" as const;
export const COGNITIVE_REMOTE = "origin" as const;
export const COGNITIVE_STATUS =
  "security_hardened_scaffold_not_deployed" as const;

export const COGNITIVE_EXECUTION_ACTIONS = [
  "repository_read_file",
  "repository_list_files",
  "repository_search",
  "repository_apply_patch",
  "repository_write_new_file",
  "test_run_allowlisted",
  "git_create_scoped_branch",
  "git_stage_allowlisted_paths",
  "git_commit_scoped",
  "git_push_scoped_draft_branch",
  "github_open_draft_pr",
  "github_update_draft_pr_body",
] as const;
export type CognitiveExecutionAction = (typeof COGNITIVE_EXECUTION_ACTIONS)[number];

export const COGNITIVE_PERMANENTLY_FORBIDDEN_ACTIONS = [
  "shell_arbitrary",
  "force_push",
  "push_main",
  "merge",
  "tag",
  "release",
  "workflow_edit",
  "workflow_dispatch",
  "deployment",
  "migration_deploy",
  "edge_function_deploy",
  "ota_publish",
  "ota_rollback",
  "build",
  "store_submit",
  "provider_mutation",
  "money_mutation",
  "role_mutation",
  "auth_rls_mutation",
] as const;

export const COGNITIVE_ALLOWED_PATH_PREFIXES = [
  "_lib/",
  "app/",
  "components/",
  "config/",
  "docs/",
  "scripts/",
  "supabase/migrations/",
  "supabase/tests/",
] as const;

export const COGNITIVE_PERMANENTLY_FORBIDDEN_PATHS = [
  ".git",
  ".github/workflows",
  "android",
  "ios",
  "node_modules",
] as const;

export type CognitiveExecutionPlan = {
  taskId: string;
  projectId: string;
  repositoryFullName: typeof COGNITIVE_REPOSITORY;
  remote: typeof COGNITIVE_REMOTE;
  branch: string;
  platform: CognitivePlatform;
  environment: CognitiveEnvironment;
  riskLevel: "low" | "medium" | "high";
  actions: readonly CognitiveExecutionAction[];
  paths: readonly string[];
  maxToolCalls: number;
  maxDurationSeconds: number;
  maxCostUsd: number;
  maxBytes: number;
  maxChildTasks: number;
  maxChildDepth: number;
  maxRetries: number;
  expiresAt: string;
  rollbackPlan: string;
  approvalRequestId: string;
  approvalScopeHash: string;
  planSnapshotHash: string;
  ownerActorId: string;
  executorActorId: string;
  requestedProductionDeployment: false;
  requestedMoneyMovement: false;
  requestedUserRightsChange: false;
};

const ACTION_SET = new Set<string>(COGNITIVE_EXECUTION_ACTIONS);
const PLATFORM_SET = new Set<string>(["shared", "ios", "android", "web"]);
const ENVIRONMENT_SET = new Set<string>(["local", "ci", "preview"]);
const PROVIDER_SET = new Set<string>([
  "repository",
  "github",
  "supabase_local",
  "research_mock",
  "model_mock",
  "none",
]);
const RISK_SET = new Set<string>(["low", "medium", "high"]);
const FORBIDDEN_PATH_SEGMENTS = new Set([".git", "node_modules", "android", "ios"]);
const COMMAND_METACHARACTERS = /(?:[\n\r;|><`]|\$\(|\|\||&&|&\s*$)/u;
const FORBIDDEN_ARGUMENT = /^(?:-f|--force(?:-with-lease)?|--delete|main|master|release|env|printenv|export|-x|--upload-pack)$/iu;
const ENCODED_TRAVERSAL = /%(?:2e|2f|5c)/iu;
const CREDENTIAL_FILE = /(?:^|\/)(?:\.env(?:\.|$)|\.envrc$|\.git-credentials$|\.htpasswd$|\.npmrc$|\.yarnrc(?:\.ya?ml)?$|\.netrc$|\.pypirc$|\.pgpass$|\.my\.cnf$|\.boto$|\.s3cfg$|kubeconfig$|vault[-_]?token$|id_(?:rsa|dsa|ecdsa|ed25519)$|(?:auth|token|secrets?|credentials?|service[-_]?account(?:[-_]?key)?|serviceaccountkey|gcp[-_]?service[-_]?account|firebase[-_]?admin(?:sdk(?:-[^/]+)?)?|application[-_]?default[-_]?credentials|client[-_]?secrets?(?:[-_][^/]*)?|access[-_]?tokens?|msal[-_]?token[-_]?cache)\.(?:json|ya?ml|toml|ini|cfg|conf)$|credentials?\.tfrc\.json$|\.aws\/credentials$|\.kube\/config$|\.config\/gh\/hosts\.ya?ml$|\.azure\/accessTokens\.json$|\.config\/gcloud\/application_default_credentials\.json$|\.docker\/config\.json$|\.gem\/credentials$|\.cargo\/credentials(?:\.toml)?$|.*\.(?:jks|keystore|p8|p12|pem|key)$)/iu;

const decodeUntilStable = (value: string): string | null => {
  let current = value;
  for (let index = 0; index < 3; index += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) return decoded;
    current = decoded;
  }
  return ENCODED_TRAVERSAL.test(current) ? null : current;
};

export const validateLexicalRepositoryPath = (value: unknown): readonly string[] => {
  const blockers: string[] = [];
  if (typeof value !== "string" || !value || value.length > 512) return ["path_invalid"];
  const decoded = decodeUntilStable(value.normalize("NFKC"));
  if (decoded === null) return ["path_encoding_invalid"];
  const normalized = decoded.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith("//")) blockers.push("absolute_path_forbidden");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "." || segment === "")) blockers.push("path_traversal_forbidden");
  if (segments.some((segment) => FORBIDDEN_PATH_SEGMENTS.has(segment))) blockers.push("forbidden_path");
  if (normalized === ".github/workflows" || normalized.startsWith(".github/workflows/")) blockers.push("workflow_edit_forbidden");
  if (CREDENTIAL_FILE.test(normalized)) blockers.push("credential_path_forbidden");
  if (!COGNITIVE_ALLOWED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) blockers.push("path_outside_allowlist");
  return [...new Set(blockers)].sort();
};

const validFiniteInteger = (value: unknown, minimum: number, maximum: number): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const validFiniteNumber = (value: unknown, minimum: number, maximum: number): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const SHA256_CONSTANTS = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
] as const;
const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
export const cognitiveSha256 = (text: string): string => {
  const input = new TextEncoder().encode(text);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + (index * 4), false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0;
    }
    hash[0]=(hash[0]+a)>>>0; hash[1]=(hash[1]+b)>>>0; hash[2]=(hash[2]+c)>>>0; hash[3]=(hash[3]+d)>>>0;
    hash[4]=(hash[4]+e)>>>0; hash[5]=(hash[5]+f)>>>0; hash[6]=(hash[6]+g)>>>0; hash[7]=(hash[7]+h)>>>0;
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
};
const validIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(value);
const SECRET_SHAPED_IDENTIFIER = /(?:\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|^(?:ghp|github_pat|xox[baprs]|AIza)[A-Za-z0-9_-]{12,}$|^eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$|^(?:access|refresh)[_.:-]?token[_.:-][A-Za-z0-9._:-]+$|^(?:api[_.:-]?key|client[_.:-]?secret|password|passwd|passphrase|pwd|secret|credential|service[_.:-]?role|authorization|auth|cookie|private[_.:-]?key|token|bearer|signature|sig|key)[_.:-][A-Za-z0-9._:-]+$)/u;
function securityIdentifierContainsSecret(value: string): boolean {
  return SECRET_SHAPED_IDENTIFIER.test(value)
    || containsSensitiveIdentifierLabel(value)
    || containsSecretLikeValue(value)
    || containsPrivateIdentifier(value)
    || maybeDecodeEncoded(value).some((candidate) =>
      containsSecretLikeValue(candidate) || containsPrivateIdentifier(candidate)
    );
}
const validSecurityIdentifier = (value: unknown): value is string =>
  validIdentifier(value) && !securityIdentifierContainsSecret(value);
const validBranch = (value: unknown): value is string =>
  typeof value === "string"
  && /^codex\/[a-z0-9][a-z0-9/_-]{2,120}$/u.test(value)
  && !/(?:^|\/)(?:main|master|release(?:\/|$))/iu.test(value);

export const validateCognitiveExecutionPlan = (
  plan: Partial<CognitiveExecutionPlan> & Record<string, unknown>,
  now = new Date(),
): readonly string[] => {
  const blockers: string[] = [];
  const allowedKeys = new Set([
    "taskId", "projectId", "repositoryFullName", "remote", "branch", "platform", "environment", "riskLevel", "actions", "paths",
    "maxToolCalls", "maxDurationSeconds", "maxCostUsd", "maxBytes", "maxChildTasks", "maxChildDepth", "maxRetries",
    "expiresAt", "rollbackPlan", "approvalRequestId", "approvalScopeHash", "planSnapshotHash", "ownerActorId",
    "executorActorId", "requestedProductionDeployment", "requestedMoneyMovement", "requestedUserRightsChange",
  ]);
  if (Object.keys(plan).some((key) => !allowedKeys.has(key))) blockers.push("unknown_plan_field");
  if (!validIdentifier(plan.taskId)) blockers.push("task_id_required");
  if (!validIdentifier(plan.projectId)) blockers.push("project_id_required");
  if (plan.repositoryFullName !== COGNITIVE_REPOSITORY) blockers.push("repository_not_allowed");
  if (plan.remote !== COGNITIVE_REMOTE) blockers.push("remote_not_allowed");
  if (!validBranch(plan.branch)) blockers.push("branch_not_allowed");
  if (!["shared", "ios", "android", "web"].includes(String(plan.platform))) blockers.push("platform_invalid");
  if (!["local", "ci", "preview"].includes(String(plan.environment))) blockers.push("environment_invalid");
  if (!["low", "medium", "high"].includes(String(plan.riskLevel))) blockers.push("risk_level_invalid");
  if (!Array.isArray(plan.actions) || plan.actions.length < 1 || plan.actions.length > 32) blockers.push("actions_invalid");
  else if (plan.actions.some((action) => typeof action !== "string" || !ACTION_SET.has(action))) blockers.push("action_not_allowed");
  if (!Array.isArray(plan.paths) || plan.paths.length < 1 || plan.paths.length > 128) blockers.push("paths_invalid");
  else for (const entry of plan.paths) {
    blockers.push(...validateLexicalRepositoryPath(entry));
    if (requiresHighRiskCapability(entry) && plan.riskLevel !== "high") blockers.push("high_risk_capability_required");
  }
  if (!validFiniteInteger(plan.maxToolCalls, 1, 100)) blockers.push("tool_call_cap_invalid");
  if (!validFiniteInteger(plan.maxDurationSeconds, 1, 14_400)) blockers.push("time_budget_invalid");
  if (!validFiniteNumber(plan.maxCostUsd, 0, 25)) blockers.push("cost_budget_invalid");
  if (!validFiniteInteger(plan.maxBytes, 1, 10_000_000)) blockers.push("byte_budget_invalid");
  if (!validFiniteInteger(plan.maxChildTasks, 0, 20)) blockers.push("child_task_cap_invalid");
  if (!validFiniteInteger(plan.maxChildDepth, 0, 4)) blockers.push("child_depth_cap_invalid");
  if (!validFiniteInteger(plan.maxRetries, 0, 5)) blockers.push("retry_cap_invalid");
  const expiry = typeof plan.expiresAt === "string" ? Date.parse(plan.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) blockers.push("capability_expired");
  if (typeof plan.rollbackPlan !== "string" || plan.rollbackPlan.trim().length < 8 || plan.rollbackPlan.length > 4_000) blockers.push("rollback_plan_required");
  if (!validIdentifier(plan.approvalRequestId)) blockers.push("approval_request_required");
  if (!validHash(plan.approvalScopeHash)) blockers.push("approval_scope_hash_invalid");
  if (!validHash(plan.planSnapshotHash)) blockers.push("plan_snapshot_hash_invalid");
  if (!validIdentifier(plan.ownerActorId) || !validIdentifier(plan.executorActorId)) blockers.push("actor_identity_invalid");
  if (plan.ownerActorId === plan.executorActorId) blockers.push("self_approval_forbidden");
  if (plan.requestedProductionDeployment !== false) blockers.push("production_deployment_forbidden");
  if (plan.requestedMoneyMovement !== false) blockers.push("money_movement_forbidden");
  if (plan.requestedUserRightsChange !== false) blockers.push("user_rights_change_forbidden");
  return [...new Set(blockers)].sort();
};

export type CognitiveActionRequest = {
  action: CognitiveExecutionAction;
  argv: readonly string[];
  repositoryFullName: typeof COGNITIVE_REPOSITORY;
  remote: typeof COGNITIVE_REMOTE;
  branch: string;
  paths: readonly string[];
};

export const validateActionRequest = (request: CognitiveActionRequest): readonly string[] => {
  const blockers: string[] = [];
  if (!ACTION_SET.has(request.action)) blockers.push("action_not_allowed");
  if (request.repositoryFullName !== COGNITIVE_REPOSITORY) blockers.push("repository_not_allowed");
  if (request.remote !== COGNITIVE_REMOTE) blockers.push("remote_not_allowed");
  if (!validBranch(request.branch)) blockers.push("branch_not_allowed");
  if (!Array.isArray(request.argv) || request.argv.length > 64) blockers.push("argv_invalid");
  else {
    if (request.argv.some((entry) => typeof entry !== "string" || entry.length > 1_024 || COMMAND_METACHARACTERS.test(entry))) blockers.push("command_injection_forbidden");
    if (request.argv.some((entry) => FORBIDDEN_ARGUMENT.test(entry) || /(?:^|:)(?:main|master|release)(?:$|\/)/iu.test(entry))) blockers.push("forbidden_argument");
  }
  for (const entry of request.paths) blockers.push(...validateLexicalRepositoryPath(entry));
  return [...new Set(blockers)].sort();
};

export type CognitiveCapability = {
  capabilityId: string;
  bearerHash: string;
  nonceHash: string;
  taskId: string;
  projectId: string;
  repositoryFullName: typeof COGNITIVE_REPOSITORY;
  branch: string;
  platform: CognitivePlatform;
  environment: CognitiveEnvironment;
  riskLevel: "low" | "medium" | "high";
  provider: CognitiveProvider;
  operation: CognitiveExecutionAction;
  pathScopes: readonly string[];
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  maximumCalls: number;
  remainingCalls: number;
  maximumBytes: number;
  remainingBytes: number;
  maximumCost: number;
  remainingCost: number;
  approvalRequestId: string;
  approvalScopeHash: string;
  planSnapshotHash: string;
  status: "active" | "revoked" | "exhausted" | "expired";
  revokedAt: string | null;
  consumedAt: string | null;
  nextUsageSequence: number;
};

export type CognitiveCapabilityUse = {
  callId: string;
  opaqueBearer: string;
  opaqueNonce: string;
  taskId: string;
  projectId: string;
  repositoryFullName: typeof COGNITIVE_REPOSITORY;
  branch: string;
  platform: CognitivePlatform;
  environment: CognitiveEnvironment;
  requiredRiskLevel: "low" | "medium" | "high";
  provider: CognitiveProvider;
  operation: CognitiveExecutionAction;
  path: string;
  bytes: number;
  cost: number;
  approvalRequestId: string;
  approvalScopeHash: string;
  planSnapshotHash: string;
};

export type CognitiveRuntimeGate = {
  now: Date;
  emergencyStop: boolean;
  taskCancelled: boolean;
  taskQuarantined: boolean;
  approvalValid: boolean;
};

export type CognitiveCapabilityEvent = {
  capabilityId: string;
  callId: string;
  usageSequence: number;
  event: "consumed" | "rejected" | "revoked" | "expired";
  reason: string | null;
  at: string;
};

const pathInsideScopes = (pathValue: string, scopes: readonly string[]): boolean =>
  scopes.some((scope) => pathValue === scope.replace(/\/$/u, "") || pathValue.startsWith(scope.endsWith("/") ? scope : `${scope}/`));

const HIGH_RISK_PATH = /^(?:supabase\/migrations\/|app\.json$|app\.config\.|eas\.json$|config\/release\/)|(?:^|\/)(?:auth|rls|role|money|payment|revenuecat|provider)(?:[._/-]|$)/iu;
export const requiresHighRiskCapability = (pathValue: string): boolean => HIGH_RISK_PATH.test(pathValue);
const riskRank = (value: "low" | "medium" | "high"): number => ({ low: 1, medium: 2, high: 3 })[value];

const validTimestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const capabilityScopeIsValid = (scope: unknown): scope is string => {
  if (typeof scope !== "string" || !scope || scope.length > 512) return false;
  const candidate = scope.endsWith("/") ? `${scope}scope-placeholder` : scope;
  return validateLexicalRepositoryPath(candidate).length === 0;
};

export const authorizeCapabilityUse = (
  capability: CognitiveCapability,
  use: CognitiveCapabilityUse,
  gate: CognitiveRuntimeGate,
): readonly string[] => {
  const blockers: string[] = [];
  const nowMs = gate.now.getTime();
  const proofVerified = cognitiveSha256(use.opaqueBearer) === capability.bearerHash
    && cognitiveSha256(use.opaqueNonce) === capability.nonceHash;
  if (!validSecurityIdentifier(capability.capabilityId)) blockers.push("capability_id_invalid");
  if (!validSecurityIdentifier(capability.taskId) || !validSecurityIdentifier(use.taskId)) blockers.push("task_id_invalid");
  if (!validSecurityIdentifier(capability.projectId) || !validSecurityIdentifier(use.projectId)) blockers.push("project_id_invalid");
  if (!validHash(capability.bearerHash) || !validHash(capability.nonceHash)) blockers.push("capability_proof_hash_invalid");
  if (!proofVerified) blockers.push("capability_proof_invalid");
  if (capability.repositoryFullName !== COGNITIVE_REPOSITORY || use.repositoryFullName !== COGNITIVE_REPOSITORY) blockers.push("repository_not_allowed");
  if (!validBranch(capability.branch) || !validBranch(use.branch)) blockers.push("branch_not_allowed");
  if (!PLATFORM_SET.has(capability.platform) || !PLATFORM_SET.has(use.platform)) blockers.push("platform_invalid");
  if (!ENVIRONMENT_SET.has(capability.environment) || !ENVIRONMENT_SET.has(use.environment)) blockers.push("environment_invalid");
  if (!RISK_SET.has(capability.riskLevel) || !RISK_SET.has(use.requiredRiskLevel)) blockers.push("risk_level_invalid");
  if (!PROVIDER_SET.has(capability.provider) || !PROVIDER_SET.has(use.provider)) blockers.push("provider_invalid");
  if (!ACTION_SET.has(capability.operation) || !ACTION_SET.has(use.operation)) blockers.push("operation_invalid");
  if (!validTimestamp(capability.issuedAt) || !validTimestamp(capability.notBefore) || !validTimestamp(capability.expiresAt)
      || Date.parse(capability.issuedAt) > Date.parse(capability.notBefore)
      || Date.parse(capability.notBefore) >= Date.parse(capability.expiresAt)) blockers.push("capability_time_invalid");
  if (capability.status !== "active") blockers.push("capability_not_active");
  if (Date.parse(capability.notBefore) > nowMs) blockers.push("capability_not_yet_valid");
  if (Date.parse(capability.expiresAt) <= nowMs) blockers.push("capability_expired");
  if (capability.revokedAt) blockers.push("capability_revoked");
  if (capability.taskId !== use.taskId) blockers.push("task_scope_mismatch");
  if (capability.projectId !== use.projectId) blockers.push("project_scope_mismatch");
  if (capability.repositoryFullName !== use.repositoryFullName) blockers.push("repository_scope_mismatch");
  if (capability.branch !== use.branch) blockers.push("branch_scope_mismatch");
  if (capability.platform !== use.platform) blockers.push("platform_scope_mismatch");
  if (capability.environment !== use.environment) blockers.push("environment_scope_mismatch");
  if (riskRank(capability.riskLevel) < riskRank(use.requiredRiskLevel) || (requiresHighRiskCapability(use.path) && capability.riskLevel !== "high")) blockers.push("risk_scope_mismatch");
  if (capability.provider !== use.provider) blockers.push("provider_scope_mismatch");
  if (capability.operation !== use.operation) blockers.push("operation_scope_mismatch");
  if (validateLexicalRepositoryPath(use.path).length || !pathInsideScopes(use.path, capability.pathScopes)) blockers.push("path_scope_mismatch");
  if (capability.approvalRequestId !== use.approvalRequestId || capability.approvalScopeHash !== use.approvalScopeHash) blockers.push("approval_scope_mismatch");
  if (capability.planSnapshotHash !== use.planSnapshotHash) blockers.push("plan_snapshot_mismatch");
  if (!validSecurityIdentifier(use.callId)) blockers.push("call_id_invalid");
  if (!validFiniteInteger(use.bytes, 0, 10_000_000) || use.bytes > capability.remainingBytes) blockers.push("byte_budget_exhausted");
  if (!validFiniteNumber(use.cost, 0, 25) || use.cost > capability.remainingCost) blockers.push("cost_budget_exhausted");
  if (capability.remainingCalls < 1) blockers.push("call_budget_exhausted");
  if (!gate.approvalValid) blockers.push("approval_invalid");
  if (gate.emergencyStop) blockers.push("emergency_stop_active");
  if (gate.taskCancelled) blockers.push("task_cancelled");
  if (gate.taskQuarantined) blockers.push("task_quarantined");
  return [...new Set(blockers)].sort();
};

export class CognitiveCapabilityLedger {
  readonly #capabilities = new Map<string, CognitiveCapability>();
  readonly #usedCallIds = new Set<string>();
  readonly #events: CognitiveCapabilityEvent[] = [];

  capabilitySnapshot(capabilityId: string): Readonly<CognitiveCapability> | null {
    const capability = this.#capabilities.get(capabilityId);
    return capability
      ? Object.freeze({ ...capability, pathScopes: Object.freeze([...capability.pathScopes]) })
      : null;
  }

  capabilityIdsForTask(taskId: string): readonly string[] {
    return Object.freeze([...this.#capabilities.values()]
      .filter((capability) => capability.taskId === taskId)
      .map((capability) => capability.capabilityId)
      .sort());
  }

  eventSnapshot(): readonly Readonly<CognitiveCapabilityEvent>[] {
    return Object.freeze(this.#events.map((event) => Object.freeze({ ...event })));
  }

  issue(capability: CognitiveCapability): void {
    const timeValid = validTimestamp(capability.issuedAt)
      && validTimestamp(capability.notBefore)
      && validTimestamp(capability.expiresAt)
      && Date.parse(capability.issuedAt) <= Date.parse(capability.notBefore)
      && Date.parse(capability.notBefore) < Date.parse(capability.expiresAt);
    const scopeValid = Array.isArray(capability.pathScopes)
      && capability.pathScopes.length >= 1
      && capability.pathScopes.length <= 128
      && capability.pathScopes.every(capabilityScopeIsValid);
    if (
      this.#capabilities.has(capability.capabilityId)
      || !validSecurityIdentifier(capability.capabilityId)
      || !validHash(capability.bearerHash)
      || !validHash(capability.nonceHash)
      || !validSecurityIdentifier(capability.taskId)
      || !validSecurityIdentifier(capability.projectId)
      || capability.repositoryFullName !== COGNITIVE_REPOSITORY
      || !validBranch(capability.branch)
      || !PLATFORM_SET.has(capability.platform)
      || !ENVIRONMENT_SET.has(capability.environment)
      || !RISK_SET.has(capability.riskLevel)
      || !PROVIDER_SET.has(capability.provider)
      || !ACTION_SET.has(capability.operation)
      || !scopeValid
      || !timeValid
      || !validFiniteInteger(capability.maximumCalls, 1, 100)
      || capability.remainingCalls !== capability.maximumCalls
      || !validFiniteInteger(capability.maximumBytes, 1, 10_000_000)
      || capability.remainingBytes !== capability.maximumBytes
      || !validFiniteNumber(capability.maximumCost, 0, 25)
      || capability.remainingCost !== capability.maximumCost
      || !validSecurityIdentifier(capability.approvalRequestId)
      || !validHash(capability.approvalScopeHash)
      || !validHash(capability.planSnapshotHash)
      || capability.status !== "active"
      || capability.revokedAt !== null
      || capability.consumedAt !== null
      || capability.nextUsageSequence !== 1
    ) throw new Error("capability_issue_rejected");
    this.#capabilities.set(capability.capabilityId, { ...capability, pathScopes: [...capability.pathScopes] });
  }

  authorizeComposedRequest(
    capabilityId: string,
    request: Pick<CognitiveActionRequest, "action" | "repositoryFullName" | "branch" | "paths">,
    use: CognitiveCapabilityUse,
  ): readonly string[] {
    const capability = this.#capabilities.get(capabilityId);
    if (!capability) return ["capability_missing"];
    const blockers: string[] = [];
    if (request.repositoryFullName !== capability.repositoryFullName
      || request.repositoryFullName !== use.repositoryFullName) blockers.push("request_repository_scope_mismatch");
    if (request.branch !== capability.branch || request.branch !== use.branch) blockers.push("request_branch_scope_mismatch");
    if (request.action !== capability.operation || request.action !== use.operation) blockers.push("request_operation_scope_mismatch");
    if (!Array.isArray(request.paths) || request.paths.length < 1) blockers.push("request_paths_missing");
    else {
      for (const requestedPath of request.paths) {
        if (validateLexicalRepositoryPath(requestedPath).length
          || !pathInsideScopes(requestedPath, capability.pathScopes)) blockers.push("request_path_scope_mismatch");
        if (requiresHighRiskCapability(requestedPath) && capability.riskLevel !== "high") blockers.push("request_risk_scope_mismatch");
      }
      if (!request.paths.includes(use.path)) blockers.push("capability_primary_path_missing");
    }
    return [...new Set(blockers)].sort();
  }

  consume(capabilityId: string, use: CognitiveCapabilityUse, gate: CognitiveRuntimeGate): CognitiveCapabilityEvent {
    const capability = this.#capabilities.get(capabilityId);
    if (!capability) throw new Error("capability_missing");
    const blockers = [...authorizeCapabilityUse(capability, use, gate)];
    if (this.#usedCallIds.has(use.callId)) blockers.push("capability_replay");
    if (blockers.length) {
      const event = { capabilityId, callId: use.callId, usageSequence: capability.nextUsageSequence, event: "rejected" as const, reason: [...new Set(blockers)].sort().join(","), at: gate.now.toISOString() };
      this.#events.push(event);
      return event;
    }
    this.#usedCallIds.add(use.callId);
    capability.remainingCalls -= 1;
    capability.remainingBytes -= use.bytes;
    capability.remainingCost -= use.cost;
    capability.consumedAt = gate.now.toISOString();
    const sequence = capability.nextUsageSequence;
    capability.nextUsageSequence += 1;
    if (capability.remainingCalls === 0) capability.status = "exhausted";
    const event = { capabilityId, callId: use.callId, usageSequence: sequence, event: "consumed" as const, reason: null, at: gate.now.toISOString() };
    this.#events.push(event);
    return event;
  }

  reauthorizeAcceptedCall(
    capabilityId: string,
    use: CognitiveCapabilityUse,
    gate: CognitiveRuntimeGate,
  ): readonly string[] {
    const capability = this.#capabilities.get(capabilityId);
    if (!capability) return ["capability_missing"];
    if (!this.#usedCallIds.has(use.callId)) return ["capability_call_not_consumed"];
    const originalStatus = capability.status;
    if (originalStatus === "exhausted" && capability.consumedAt) capability.status = "active";
    const blockers = authorizeCapabilityUse(capability, use, gate)
      .filter((blocker) => !["call_budget_exhausted", "byte_budget_exhausted", "cost_budget_exhausted"].includes(blocker));
    capability.status = originalStatus;
    return blockers;
  }

  revoke(capabilityId: string, at = new Date()): void {
    const capability = this.#capabilities.get(capabilityId);
    if (!capability) return;
    capability.status = "revoked";
    capability.revokedAt = at.toISOString();
    this.#events.push({ capabilityId, callId: "lifecycle-revoke", usageSequence: capability.nextUsageSequence, event: "revoked", reason: "owner_or_system_revocation", at: at.toISOString() });
  }
}

export type CognitiveBudgetLimits = {
  modelTokens: number;
  modelCost: number;
  toolCalls: number;
  toolBytes: number;
  elapsedMs: number;
  childTasks: number;
  recursionDepth: number;
  concurrentCalls: number;
  retries: number;
};

export type CognitiveBudgetRuntimeGate = {
  now: Date;
  deadlineAt: string;
  emergencyStop: boolean;
  taskCancelled: boolean;
  taskQuarantined: boolean;
  actionFingerprint: string;
  planSnapshotHash: string;
};

export class CognitiveBudgetLedger {
  readonly limits: Readonly<CognitiveBudgetLimits>;
  readonly consumed: CognitiveBudgetLimits;
  readonly reservations = new Map<string, Partial<CognitiveBudgetLimits>>();
  readonly actionOccurrences = new Map<string, number>();
  readonly planOccurrences = new Map<string, number>();

  constructor(limits: CognitiveBudgetLimits) {
    for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("budget_limit_invalid");
    this.limits = Object.freeze({ ...limits });
    this.consumed = { modelTokens: 0, modelCost: 0, toolCalls: 0, toolBytes: 0, elapsedMs: 0, childTasks: 0, recursionDepth: 0, concurrentCalls: 0, retries: 0 };
  }

  reserve(
    reservationId: string,
    requested: Partial<CognitiveBudgetLimits>,
    gate: CognitiveBudgetRuntimeGate,
  ): boolean {
    const deadline = Date.parse(gate.deadlineAt);
    if (
      gate.emergencyStop
      || gate.taskCancelled
      || gate.taskQuarantined
      || !Number.isFinite(deadline)
      || gate.now.getTime() >= deadline
      || !validIdentifier(reservationId)
      || !validHash(gate.actionFingerprint)
      || !validHash(gate.planSnapshotHash)
      || this.reservations.has(reservationId)
      || Object.keys(requested).length === 0
    ) return false;
    if ((this.actionOccurrences.get(gate.actionFingerprint) ?? 0) >= 3) return false;
    if ((this.planOccurrences.get(gate.planSnapshotHash) ?? 0) >= 3) return false;
    for (const [key, raw] of Object.entries(requested) as [keyof CognitiveBudgetLimits, number][]) {
      if (!Number.isSafeInteger(raw) || raw < 0 || this.consumed[key] + raw > this.limits[key]) return false;
    }
    for (const [key, raw] of Object.entries(requested) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] += raw;
    this.reservations.set(reservationId, { ...requested });
    this.actionOccurrences.set(gate.actionFingerprint, (this.actionOccurrences.get(gate.actionFingerprint) ?? 0) + 1);
    this.planOccurrences.set(gate.planSnapshotHash, (this.planOccurrences.get(gate.planSnapshotHash) ?? 0) + 1);
    return true;
  }

  settle(
    reservationId: string,
    actual: Partial<CognitiveBudgetLimits>,
    gate: Pick<CognitiveBudgetRuntimeGate, "emergencyStop" | "taskCancelled" | "taskQuarantined">,
  ): boolean {
    const reserved = this.reservations.get(reservationId);
    if (!reserved) return false;
    if (gate.emergencyStop || gate.taskCancelled || gate.taskQuarantined) {
      for (const [key, prior] of Object.entries(reserved) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] -= prior;
      this.reservations.delete(reservationId);
      return false;
    }
    for (const [key, raw] of Object.entries(actual) as [keyof CognitiveBudgetLimits, number][]) {
      const prior = reserved[key] ?? 0;
      if (!Number.isSafeInteger(raw) || raw < 0 || this.consumed[key] - prior + raw > this.limits[key]) return false;
    }
    for (const [key, prior] of Object.entries(reserved) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] -= prior;
    for (const [key, raw] of Object.entries(actual) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] += raw;
    this.reservations.delete(reservationId);
    return true;
  }

  release(reservationId: string): boolean {
    const reserved = this.reservations.get(reservationId);
    if (!reserved) return false;
    for (const [key, prior] of Object.entries(reserved) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] -= prior;
    this.reservations.delete(reservationId);
    return true;
  }

  retryAllowed(attempt: number, lastAttemptAt: string, now: Date, baseDelayMs = 1_000): boolean {
    if (!validFiniteInteger(attempt, 1, this.limits.retries) || !validTimestamp(lastAttemptAt)) return false;
    const delay = baseDelayMs * (2 ** (attempt - 1));
    return Number.isSafeInteger(delay) && now.getTime() - Date.parse(lastAttemptAt) >= delay;
  }
}

export type CognitiveToolResultEnvelope = {
  toolId: string;
  callId: string;
  taskId: string;
  source: string;
  contentType: "application/json" | "text/plain";
  dataHash: string;
  timestamp: string;
  untrusted: true;
  truncated: boolean;
  sanitizationState: "sanitized" | "rejected";
  ownerReviewRequired: boolean;
  findingType: "provider_scope_expansion_request" | null;
  data: unknown;
};

const PROVIDER_SCOPE_ACTION = String.raw`(?:allows?|permits?|grants?|provides?|requir(?:e|es|ed)|requests?|needs?|expands?|broadens?|elevates?|switch(?:es)?|changes?|assumes?|authenticates?|promotes?|upgrades?|authorizes?|uses?|sets?|enabl(?:e|es|ed)|runs?|has|have|gives?|makes?)`;
const PROVIDER_SCOPE_TARGET = String.raw`(?:owner(?:\s+role)?|super[- ]?admin|administrator|admin|production|root|all\s+(?:actions?|resources?|permissions?)|wildcard|credentials?|permissions?|privileges?|scope|access|roles?|rights?|service\s+accounts?)`;
const PROVIDER_SCOPE_EXPANSION = new RegExp(
  String.raw`\b(?:${PROVIDER_SCOPE_ACTION})\b[\s\S]{0,100}\b(?:${PROVIDER_SCOPE_TARGET})\b|\b(?:${PROVIDER_SCOPE_TARGET})\b[\s\S]{0,100}\b(?:(?:is|are|must|should|needs?)(?:\s+be|\s+to\s+be)?\s+)?(?:${PROVIDER_SCOPE_ACTION})\b`,
  "iu",
);
const PROVIDER_PRIVILEGED_SCOPE_MENTION = /\b(?:(?:owner|super[- ]?admin|administrator(?:access)?|admin|root|superuser|uid[-_\s]*0|sudo|wheel|poweruseraccess|privileged|elevated|production|full[- ]?control|unrestricted|break[- ]?glass|god[-_\s]+mode|emergency[-_\s]+master)\b[\s\S]{0,60}\b(?:access|accounts?|identity|roles?|credentials?|permissions?|privileges?|rights?|service\s+accounts?|mandatory|required|enabled)|(?:access|accounts?|identity|roles?|credentials?|permissions?|privileges?|rights?|service\s+accounts?)\b[\s\S]{0,60}\b(?:owner|super[- ]?admin|administrator(?:access)?|admin|root|superuser|uid[-_\s]*0|sudo|wheel|poweruseraccess|privileged|elevated|production|full[- ]?control|unrestricted|break[- ]?glass|god[-_\s]+mode|emergency[-_\s]+master|mandatory|required|enabled)|(?:run|operate|execute|authenticate|switch|use|set)\b[\s\S]{0,24}\b(?:root|superuser|uid[-_\s]*0)\b|sudo|wheel\s+account|poweruseraccess|supreme\s+authority|tenant\s+owner|impersonate[\s\S]{0,24}\bowner|escalate[\s\S]{0,24}\bsuperuser|principal[\s\S]{0,40}\bno\s+limits?|operate[\s\S]{0,40}\babove\s+all[\s\S]{0,24}\broles?|full[- ]?control|unrestricted\s+account|break[- ]?glass\s+identity|god[-_\s]+mode|carte[-_\s]+blanche|administratoraccess|emergency[-_\s]+master\s+identity|(?:all|wildcard)[-_\s]+permissions?|iam\s*:\s*\*|(?:allow|permit|grant)[\s\S]{0,60}\ball\s+(?:actions?|resources?|permissions?)\b|(?:permissions?|privileges?|rights?)[\s\S]{0,24}\ball\b|\ball\b[\s\S]{0,24}\b(?:permissions?|privileges?|rights?)|(?:permit|allow|grant|enable|use|switch)[\s\S]{0,60}\b(?:everything|anything|unrestricted|without\s+restriction)\b|identity[\s\S]{0,60}\b(?:do|access|control)[\s\S]{0,24}\b(?:anything|everything)\b)\b/iu;
const PROVIDER_STANDALONE_PRIVILEGE = /(?:\b[a-z][a-z0-9-]{1,31}\s*:\s*\*|^\s*(?:poweruseraccess|wheel|no\s+(?:restrictions?|limits?)|cluster-admin|system:masters|nopasswd\s*:\s*all)\s*[.!]?\s*$)/iu;
const PROVIDER_PRIVILEGE_TERM = String.raw`(?:poweruseraccess|wheel|cluster-admin|system:masters|nopasswd\s*:\s*all|root|superuser|admin(?:istrator)?|privileged|elevated|production|full[- ]?control|unrestricted)`;
const PROVIDER_SAFE_DENIAL = new RegExp(
  String.raw`^\s*(?:policy\s+)?(?:(?:strictly\s+)?(?:prohibits?|denies?|forbids?|disables?|blocks?)\s+${PROVIDER_PRIVILEGE_TERM}|${PROVIDER_PRIVILEGE_TERM}\s+(?:(?:is|are|was|were|remains?)\s+(?:strictly\s+)?(?:prohibited|denied|forbidden|disabled|blocked|not\s+allowed)(?:\s+by\s+policy)?|(?:esta|está)\s+prohibido|est\s+interdit|ist\s+verboten))(?:(?:\s*[.!]\s*|\s+and\s+)(?:no\s+exceptions?\s+(?:(?:are|will\s+be)\s+)?permitted|(?:remains?|stays?|will\s+stay)\s+(?:disabled|blocked)))*\s*[.!]?\s*$`,
  "iu",
);
const PROVIDER_NEGATION_REVERSAL = new RegExp(
  String.raw`(?:\b(?:(?:the\s+)?(?:assertion|claim)\s+that\s+)?(?:it\s+is\s+)?(?:false|incorrect|untrue|a\s+lie)\s+that\s+${PROVIDER_PRIVILEGE_TERM}\s+(?:is|remains?)\s+(?:disabled|blocked|prohibited|denied|forbidden)\b|\b(?:the\s+)?(?:assertion|claim)\s+that\s+${PROVIDER_PRIVILEGE_TERM}\s+(?:is|remains?)\s+(?:disabled|blocked)\s+is\s+(?:false|incorrect|untrue|a\s+lie)\b|\b${PROVIDER_PRIVILEGE_TERM}\s+being\s+(?:disabled|blocked)\s+is\s+(?:a\s+)?(?:lie|falsehood|fiction)\b|\b(?:do\s+not|don['’]?t|must\s+not|mustn['’]?t|should\s+not|shouldn['’]?t|cannot|can['’]?t)\s+(?:keep|leave)\s+${PROVIDER_PRIVILEGE_TERM}\s+(?:disabled|blocked)\b|\bkeep\s+${PROVIDER_PRIVILEGE_TERM}\s+from\s+(?:remaining|staying)\s+(?:disabled|blocked)\b|\b${PROVIDER_PRIVILEGE_TERM}\b[\s\S]{0,80}\b(?:(?:must|should|does)\s+not|mustn['’]?t|shouldn['’]?t|doesn['’]?t)\s+(?:remain|stay)\s+(?:disabled|blocked)\b|\b${PROVIDER_PRIVILEGE_TERM}\b[\s\S]{0,80}\bshould\s+cease\s+to\s+be\s+(?:disabled|blocked)\b|\b${PROVIDER_PRIVILEGE_TERM}(?:['’]s)?\s+(?:disabled|blocked)\s+state\s+must\s+end\b|\blift\s+(?:the\s+)?(?:ban|block|prohibition)\s+(?:on|against)\s+${PROVIDER_PRIVILEGE_TERM}\b|\b${PROVIDER_PRIVILEGE_TERM}\b[\s\S]{0,80}\b(?:not\s+allowed\s+to|prohibited\s+from|forbidden\s+from)\s+(?:remain|remaining|stay|staying)\s+(?:disabled|blocked)\b|\b${PROVIDER_PRIVILEGE_TERM}\b[\s\S]{0,80}\b(?:prohibited|denied|forbidden|disabled|blocked|not\s+allowed)\b[\s\S]{0,80}\b(?:but|however|instead|actually|nevertheless)\b[\s\S]{0,60}\b(?:enable|grant|allow|activate|restore|use)\b)`,
  "iu",
);

const decodeProviderScalar = (value: string): string[] => {
  const candidates = new Set<string>([normalizeSecurityText(value).toLowerCase().trim()]);
  try {
    candidates.add(normalizeSecurityText(decodeURIComponent(value)).toLowerCase().trim());
  } catch {
    // Invalid percent encoding remains untrusted ordinary provider text.
  }
  for (const decoded of maybeDecodeEncoded(value)) candidates.add(normalizeSecurityText(decoded).toLowerCase().trim());
  if (/^[A-Za-z0-9+/_-]{2,8}={0,2}$/u.test(value)) {
    try {
      const encoded = value.replace(/-/gu, "+").replace(/_/gu, "/");
      const binary = globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      );
      candidates.add(normalizeSecurityText(decoded).toLowerCase().trim());
    } catch {
      // A short non-base64 scalar remains ordinary untrusted provider text.
    }
  }
  return [...candidates];
};

const providerScalarValues = (value: unknown, depth = 0): string[] => {
  if (depth > 8) return [];
  if (typeof value === "string") return decodeProviderScalar(value);
  if (Array.isArray(value)) return value.slice(0, 128).flatMap((entry) => providerScalarValues(entry, depth + 1));
  return [];
};

const providerPrivilegeFragmentsRequireReview = (fragments: readonly string[]): boolean => {
  const tokens = new Set(
    fragments
      .flatMap((fragment) => decodeProviderScalar(fragment))
      .flatMap((fragment) => fragment.split(/[^a-z0-9*]+/gu))
      .filter(Boolean),
  );
  const has = (...required: readonly string[]) => required.every((token) => tokens.has(token));
  const hasPrivilegeTerm = [
    "poweruseraccess", "administratoraccess", "cluster-admin", "root", "superuser",
  ].some((token) => tokens.has(token));
  return canAssembleFragmentTarget(fragments, PROVIDER_FRAGMENT_TARGETS)
    || (hasPrivilegeTerm && has("must", "not", "remain", "disabled"))
    || (hasPrivilegeTerm && has("do", "not", "keep", "disabled"))
    || has("power", "user", "access")
    || has("cluster", "admin")
    || has("system", "masters")
    || has("no", "passwd", "all")
    || has("full", "control")
    || has("break", "glass")
    || has("super", "admin")
    || has("root", "access")
    || has("owner", "access")
    || has("all", "permissions");
};

const providerCandidateRequiresReview = (candidate: string): boolean => {
  const reviewCandidate = normalizeSecurityText(candidate);
  if (PROVIDER_SAFE_DENIAL.test(reviewCandidate)) return false;
  return PROVIDER_NEGATION_REVERSAL.test(reviewCandidate)
    || PROVIDER_SCOPE_EXPANSION.test(reviewCandidate)
    || PROVIDER_PRIVILEGED_SCOPE_MENTION.test(reviewCandidate)
    || PROVIDER_STANDALONE_PRIVILEGE.test(reviewCandidate);
};

const hasStructuredProviderPrivilege = (value: unknown, depth = 0): boolean => {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.slice(0, 128).some((entry) => hasStructuredProviderPrivilege(entry, depth + 1));
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record).slice(0, 64);
  const normalized = new Map<string, unknown>();
  for (const [key, child] of entries) normalized.set(normalizeSecurityLabel(key), child);
  const effects = providerScalarValues(normalized.get("effect"));
  const actions = [
    ...providerScalarValues(normalized.get("action")),
    ...providerScalarValues(normalized.get("actions")),
  ];
  const resources = [
    ...providerScalarValues(normalized.get("resource")),
    ...providerScalarValues(normalized.get("resources")),
  ];
  const explicitDeny = effects.includes("deny");
  const privilegeEffect = !explicitDeny && (effects.length === 0 || effects.includes("allow"));
  if (
    privilegeEffect
    && actions.includes("*")
    && resources.includes("*")
  ) return true;
  const notActions = [
    ...providerScalarValues(normalized.get("notaction")),
    ...providerScalarValues(normalized.get("notactions")),
  ];
  const apiGroups = providerScalarValues(normalized.get("apigroups"));
  const verbs = providerScalarValues(normalized.get("verbs"));
  const includedPermissions = providerScalarValues(normalized.get("includedpermissions"));
  const permissions = providerScalarValues(normalized.get("permissions"));
  const assignableScopes = providerScalarValues(normalized.get("assignablescopes"));
  const nonResourceUrls = providerScalarValues(normalized.get("nonresourceurls"));
  const administration = providerScalarValues(normalized.get("administration"));
  const allScalars = entries.flatMap(([, child]) => providerScalarValues(child));
  const dataActions = providerScalarValues(normalized.get("dataactions"));
  const githubWrite = ["members", "actions", "administration"].some((key) =>
    providerScalarValues(normalized.get(key)).includes("write")
  );
  const kubernetesImpersonation = verbs.some((entry) => /^(?:impersonate|\*)$/iu.test(entry))
    && resources.some((entry) => /^(?:users|groups|serviceaccounts|\*)$/iu.test(entry));
  if (privilegeEffect && (actions.includes("*") || permissions.includes("*") || includedPermissions.includes("*"))) return true;
  if (privilegeEffect && (notActions.length > 0 || normalized.has("notresource"))) return true;
  if (privilegeEffect && assignableScopes.includes("/") && allScalars.includes("*")) return true;
  if (privilegeEffect && nonResourceUrls.includes("*") && verbs.includes("*")) return true;
  if (privilegeEffect && apiGroups.includes("*") && resources.includes("*") && verbs.includes("*")) return true;
  if (privilegeEffect && (administration.includes("write") || dataActions.includes("*") || githubWrite || kubernetesImpersonation)) return true;
  if (privilegeEffect && allScalars.some((entry) =>
    /(?:resourcemanager\.projects\.setiampolicy|roles\/editor|roles\/iam\.serviceaccounttokencreator|iam\.serviceaccounts\.(?:actas|getaccesstoken)|(?:users|groups|serviceaccounts)[/:]impersonate|sts:assumerole|iam:(?:passrole|createpolicyversion))/iu.test(entry)
  )) return true;
  return entries.some(([, child]) => hasStructuredProviderPrivilege(child, depth + 1));
};

const canonicalCognitiveJson = (value: unknown): string => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.keys(entry as Record<string, unknown>)
          .sort()
          .map((key) => [key, normalize((entry as Record<string, unknown>)[key])]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};

const collectBoundedUntrustedText = (
  value: unknown,
  output: string[] = [],
  depth = 0,
): string[] => {
  if (depth > 8 || output.length >= 128) return output;
  if (typeof value === "string") {
    output.push(value.slice(0, 4_000));
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 128)) collectBoundedUntrustedText(entry, output, depth + 1);
    return output;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value).slice(0, 64)) {
      output.push(key.slice(0, 256));
      collectBoundedUntrustedText(child, output, depth + 1);
      if (output.length >= 128) break;
    }
  }
  return output;
};

export const createUntrustedToolEnvelope = (
  value: {
    toolId: string;
    callId: string;
    taskId: string;
    source: string;
    contentType: CognitiveToolResultEnvelope["contentType"];
    timestamp: string;
    truncated: boolean;
    data: unknown;
  },
): CognitiveToolResultEnvelope => {
  if (
    !validSecurityIdentifier(value.toolId)
    || !validSecurityIdentifier(value.callId)
    || !validSecurityIdentifier(value.taskId)
    || !validSecurityIdentifier(value.source)
    || !["application/json", "text/plain"].includes(value.contentType)
    || !validTimestamp(value.timestamp)
    || value.timestamp !== new Date(value.timestamp).toISOString()
    || typeof value.truncated !== "boolean"
  ) throw new Error("tool_envelope_metadata_invalid");
  const sanitized = sanitizeCognitivePayload(value.data);
  const serialized = typeof value.data === "string"
    ? value.data
    : String(JSON.stringify(value.data) ?? "").slice(0, 64_000);
  const providerFragments = collectBoundedUntrustedText(value.data);
  const providerScopeCandidates = [
    ...(typeof value.data === "string" ? [serialized] : []),
    ...providerFragments,
  ].flatMap((candidate) => [
    candidate,
    normalizeSecurityText(candidate),
    ...maybeDecodeEncoded(candidate),
  ]);
  const exactSafeProviderDenial = typeof value.data === "string"
    && PROVIDER_SAFE_DENIAL.test(normalizeSecurityText(value.data));
  const ownerReviewRequired = (!exactSafeProviderDenial && (
    providerScopeCandidates.some(providerCandidateRequiresReview)
    || providerCandidateRequiresReview(providerFragments.join(" "))
    || (Array.isArray(value.data) && providerCandidateRequiresReview(providerFragments.join("")))
    || providerPrivilegeFragmentsRequireReview(providerFragments)
  ))
    || hasStructuredProviderPrivilege(value.data)
    || sanitized.categories.includes("secret_like_value");
  const boundaryTruncated = sanitized.categories.some((category) =>
    category.startsWith("maximum_")
  );
  const effectiveTruncated = value.truncated || boundaryTruncated;
  const operationallySafe = sanitized.accepted
    && !sanitized.categories.includes("untrusted_instruction")
    && !boundaryTruncated
    && !ownerReviewRequired;
  const retained = operationallySafe ? sanitized.value : null;
  const dataHash = cognitiveSha256(canonicalCognitiveJson({
    accepted: operationallySafe,
    categories: sanitized.categories,
    truncated: effectiveTruncated,
    value: retained,
  }));
  return {
    toolId: value.toolId,
    callId: value.callId,
    taskId: value.taskId,
    source: value.source,
    contentType: value.contentType,
    dataHash,
    timestamp: value.timestamp,
    untrusted: true,
    truncated: effectiveTruncated,
    sanitizationState: operationallySafe ? "sanitized" : "rejected",
    ownerReviewRequired,
    findingType: ownerReviewRequired ? "provider_scope_expansion_request" : null,
    data: retained,
  };
};

export type StrictModelDocument = {
  schemaVersion: 1;
  objective: string;
  proposedActions: CognitiveExecutionAction[];
  evidenceIds: string[];
  blockers: string[];
};

const assertBoundedStringArray = (value: unknown, maxItems: number, maxLength: number): value is string[] =>
  Array.isArray(value) && value.length <= maxItems && value.every((entry) => typeof entry === "string" && entry.length <= maxLength);

const hasDuplicateJsonObjectKeys = (raw: string): boolean => {
  const stack: { type: "object" | "array"; keys?: Set<string>; expectingKey?: boolean }[] = [];
  let index = 0;
  while (index < raw.length) {
    const character = raw[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "{") {
      stack.push({ type: "object", keys: new Set(), expectingKey: true });
      index += 1;
      continue;
    }
    if (character === "[") {
      stack.push({ type: "array" });
      index += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      index += 1;
      continue;
    }
    if (character === ",") {
      const current = stack.at(-1);
      if (current?.type === "object") current.expectingKey = true;
      index += 1;
      continue;
    }
    if (character !== "\"") {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    let escaped = false;
    while (index < raw.length) {
      const current = raw[index];
      index += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === "\"") break;
    }
    const context = stack.at(-1);
    if (context?.type === "object" && context.expectingKey) {
      let cursor = index;
      while (cursor < raw.length && /\s/u.test(raw[cursor])) cursor += 1;
      if (raw[cursor] === ":") {
        let key: string;
        try {
          key = JSON.parse(raw.slice(start, index)) as string;
        } catch {
          return true;
        }
        if (context.keys?.has(key)) return true;
        context.keys?.add(key);
        context.expectingKey = false;
      }
    }
  }
  return false;
};

export const parseStrictModelDocument = (raw: string): StrictModelDocument => {
  if (typeof raw !== "string" || raw.length > 32_000 || !raw.startsWith("{") || !raw.endsWith("}")) throw new Error("model_document_invalid");
  if (hasDuplicateJsonObjectKeys(raw)) throw new Error("model_document_duplicate_key");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("model_document_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("model_document_invalid");
  const record = parsed as Record<string, unknown>;
  const allowed = ["schemaVersion", "objective", "proposedActions", "evidenceIds", "blockers"];
  if (Object.keys(record).some((key) => !allowed.includes(key)) || Object.keys(record).length !== allowed.length) throw new Error("model_document_unknown_field");
  if (record.schemaVersion !== 1 || typeof record.objective !== "string" || record.objective.length < 1 || record.objective.length > 2_000) throw new Error("model_document_invalid");
  const sanitizedObjective = sanitizeCognitivePayload(record.objective);
  if (!sanitizedObjective.accepted || sanitizedObjective.categories.includes("untrusted_instruction")) throw new Error("model_document_objective_rejected");
  if (!Array.isArray(record.proposedActions) || record.proposedActions.length > 20 || record.proposedActions.some((action) => !ACTION_SET.has(String(action)))) throw new Error("model_document_action_invalid");
  if (!assertBoundedStringArray(record.evidenceIds, 64, 128) || !assertBoundedStringArray(record.blockers, 64, 256)) throw new Error("model_document_bounds_invalid");
  const sanitizedEvidenceIds = sanitizeCognitivePayload(record.evidenceIds);
  if ((record.evidenceIds as string[]).some((entry) =>
    !validSecurityIdentifier(entry) || containsSecretLikeValue(entry) || containsPromptInjection(entry))
    || !sanitizedEvidenceIds.accepted
    || sanitizedEvidenceIds.categories.includes("untrusted_instruction")) {
    throw new Error("model_document_evidence_id_invalid");
  }
  const sanitizedBlockerArray = sanitizeCognitivePayload(record.blockers);
  const sanitizedBlockers = (record.blockers as string[]).map((entry) => sanitizeCognitivePayload(entry));
  if (!sanitizedBlockerArray.accepted
    || sanitizedBlockerArray.categories.includes("untrusted_instruction")
    || sanitizedBlockers.some((result) => !result.accepted || result.categories.includes("untrusted_instruction"))) {
    throw new Error("model_document_blocker_rejected");
  }
  return {
    schemaVersion: 1,
    objective: sanitizedObjective.value as string,
    proposedActions: [...record.proposedActions as CognitiveExecutionAction[]],
    evidenceIds: [...record.evidenceIds as string[]],
    blockers: sanitizedBlockers.map((result) => result.value as string),
  };
};

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\b[\s\S]{0,80}\b(?:previous|prior|system|developer)\b[\s\S]{0,40}\binstructions?\b/iu,
  /\b(?:system|developer)\s*(?:message|override|instruction)\b/iu,
  /\b(?:call|invoke|use|execute|run)\b[\s\S]{0,40}\b(?:tool|shell|command|github|merge|deploy)\b/iu,
  /\b(?:merge|deploy|release|publish|force[- ]?push)\b[\s\S]{0,60}\b(?:pull request|pr|branch|build|ota|production|track)\b/iu,
  /\b(?:read|dump|print|send|reveal|exfiltrate)\b[\s\S]{0,60}\b(?:environment|secret|token|password|credential|system prompt)\b/iu,
  /\b(?:disable|bypass|weaken|lower)\b[\s\S]{0,40}\b(?:guard|safety|approval|rls|policy)\b/iu,
  /\b(?:expand|widen|broaden|elevate)\b[\s\S]{0,40}\b(?:scope|permission|privilege|authority|access)\b/iu,
];
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/u,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/u,
  /\b(?:ghp|github_pat|xox[baprs]|AIza)[A-Za-z0-9_-]{12,}\b/u,
  /\b(?:password|passwd|passphrase|pwd|secret|service[_-]?role|refresh[_-]?token|access[_-]?token|authorization|auth|cookie|private[_-]?key|token|bearer|signature|sig|key)\s*[:=]\s*\S+/iu,
  /\b(?:api[_-]?key|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|google[_-]?api[_-]?key)\s*[:=]\s*\S+/iu,
  /\b(?:api[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|authorization|cookie|private[_-]?key|token|bearer)[\s.:=_-]+[A-Za-z0-9][A-Za-z0-9._-]*\b/iu,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /https:\/\/[^/\s:@]+:[^/\s@]+@/iu,
  /https?:\/\/[^\s?]+\?[^\s]*(?:token|signature|sig|key|credential)=/iu,
];

const SENSITIVE_ASSIGNMENT_LABELS = new Set([
  "accesskey", "accesstoken", "apikey", "auth", "authorization", "authorizationtoken",
  "bearer", "clientsecret", "cookie", "credential", "credentialkey", "credentialtoken", "key", "password", "passwd", "passphrase", "privatekey", "pwd",
  "refreshtoken", "secret", "servicerole", "sig", "signature", "token", "xapikey",
]);
const SENSITIVE_ASSIGNMENT_PARTS = new Set([
  "auth", "authorization", "bearer", "cookie", "credential", "key", "password", "passwd", "passphrase",
  "pwd", "secret", "sig", "signature", "token",
]);
const SECURITY_CONFUSABLES: Readonly<Record<string, string>> = Object.freeze({
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c",
  т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w",
  ү: "y", ӏ: "l", һ: "h", α: "a", β: "b", ε: "e", η: "h", ι: "i", κ: "k", μ: "m",
  ν: "v", ο: "o", ρ: "p", τ: "t", υ: "y", χ: "x", ϲ: "c", ն: "n", օ: "o",
  ı: "i", ɑ: "a", ɡ: "g", ɪ: "i", ɩ: "i", հ: "h",
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g",
  ʜ: "h", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o",
  ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w",
  ʏ: "y", ᴢ: "z",
});
const SECURITY_DECIMAL_BLOCKS = [
  48,1632,1776,1984,2406,2534,2662,2790,2918,3046,3174,3302,3430,3558,
  3664,3792,3872,4160,4240,6112,6160,6470,6608,6784,6800,6992,7088,7232,
  7248,42528,43216,43264,43472,43504,43600,44016,66720,68912,69734,69872,
  69942,70096,70384,70736,70864,71248,71360,71472,71904,72016,72784,73040,
  73120,73552,92768,92864,93008,120782,120792,120802,120812,120822,
  123200,123632,124144,125264,130032,
] as const;
const normalizeDecimalDigit = (character: string): string => {
  const codePoint = character.codePointAt(0);
  const block = codePoint === undefined
    ? undefined
    : SECURITY_DECIMAL_BLOCKS.find((start) => codePoint >= start && codePoint <= start + 9);
  return block === undefined || codePoint === undefined ? character : String(codePoint - block);
};
const normalizeSecurityText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u3002\uff0e\uff61]/gu, ".")
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Mark}]/gu, "")
    .replace(/\p{Nd}/gu, normalizeDecimalDigit)
    .replace(/[АВЕКМНОРСТУХІЈЅԀԚԜҮӀҺавекмнорстухіјѕԁԛԝүӏһΑΒΕΗΙΚΜΝΟΡΤΥΧϹαβεηικμνορτυχϲՆՕնօıɑɡꞬɪɩՀհᴀʙᴄᴅᴇꜰɢʜᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ]/gu, (character) =>
      SECURITY_CONFUSABLES[character.toLowerCase()] ?? character
    );
const normalizeSecurityLabel = (value: string): string =>
  normalizeSecurityText(value).toLowerCase().replace(/[^a-z0-9]/gu, "");
const SENSITIVE_FRAGMENT_TARGETS = [
  "accesskey", "accesstoken", "apikey", "auth", "authorization",
  "authorizationtoken", "bearer", "clientsecret", "cookie", "credential",
  "credentialkey", "credentialtoken", "key", "password", "passwd", "passphrase", "privatekey", "pwd",
  "refreshtoken", "secret", "servicerole", "servicekey", "servicetoken", "sig",
  "signature", "token", "xapikey",
] as const;
const PROVIDER_FRAGMENT_TARGETS = [
  "poweruseraccess", "administratoraccess", "clusteradmin", "systemmasters",
  "nopasswdall", "fullcontrol", "breakglass", "superadmin", "rootaccess",
  "owneraccess", "allpermissions",
] as const;
const SAFE_FRAGMENT_ASSIGNMENT_VALUES = new Set([
  "active", "disabled", "enabled", "inactive", "none", "ok", "state", "status",
  "unavailable", "unknown",
]);
const REVIEWED_STATUS_LABELS = new Set(["authorization", "password"]);

const normalizedFragmentCandidates = (values: readonly string[]): string[] => {
  const candidates: string[] = [];
  for (const value of values.slice(0, 128)) {
    const localCandidates = new Set<string>();
    for (const decoded of [value, ...maybeDecodeEncoded(value)]) {
      const normalized = normalizeSecurityText(decoded).toLowerCase().slice(0, 1_024);
      for (const piece of normalized.split(/[^a-z0-9]+/gu)) {
        if (piece) localCandidates.add(piece);
      }
      const label = normalizeSecurityLabel(normalized.split(/[:=]/u, 1)[0]);
      if (label) localCandidates.add(label);
    }
    candidates.push(...localCandidates);
  }
  return candidates.slice(0, 512);
};

const canAssembleFragmentTarget = (
  values: readonly string[],
  targets: readonly string[],
): boolean => {
  const allFragments = normalizedFragmentCandidates(values);
  for (const target of targets) {
    const fragments = allFragments.filter((fragment) =>
      fragment.length <= target.length && target.includes(fragment)
    );
    if (fragments.length === 0) continue;
    const availableCharacters = fragments.join("");
    if ([...new Set(target)].some((character) =>
      (availableCharacters.match(new RegExp(character, "gu"))?.length ?? 0)
      < (target.match(new RegExp(character, "gu"))?.length ?? 0)
    )) continue;
    const reachable = new Array<boolean>(target.length + 1).fill(false);
    reachable[0] = true;
    for (let position = 0; position < target.length; position += 1) {
      if (!reachable[position]) continue;
      for (const fragment of fragments) {
        if (target.startsWith(fragment, position)) reachable[position + fragment.length] = true;
      }
    }
    if (reachable[target.length]) return true;
  }
  return false;
};
const containsSensitiveAssignment = (value: string): boolean => {
  const normalized = normalizeSecurityText(value);
  for (const match of normalized.matchAll(/([^?&=:\s]{1,256})\s*[:=]/gu)) {
    const label = normalizeSecurityLabel(match[1]);
    const labelParts = match[1]
      .toLowerCase()
      .split(/[^a-z0-9]+/gu)
      .filter(Boolean);
    if (
      SENSITIVE_ASSIGNMENT_LABELS.has(label)
      || labelParts.some((part) => SENSITIVE_ASSIGNMENT_PARTS.has(part))
      || /^(?:access|refresh)(?:key|token)$/u.test(label)
      || /^(?:api|private)(?:key|token)$/u.test(label)
      || /^service(?:key|role|token)$/u.test(label)
      || /^authorization(?:key|token)$/u.test(label)
    ) return true;
  }
  return false;
};
const containsSensitiveIdentifierLabel = (value: string): boolean =>
  normalizeSecurityText(value).toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter(Boolean)
    .some((part) => SENSITIVE_ASSIGNMENT_PARTS.has(part));
export const containsPromptInjection = (value: string): boolean =>
  PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalizeSecurityText(value)))
  || (
    /[^\x00-\x7f]/u.test(normalizeSecurityText(value))
    && /\b(?:system|developer|instructions?|shell|command|tool|github|merge|deploy|secret|credential|approval|rls|policy)\b/iu
      .test(normalizeSecurityText(value))
  );
export const containsSecretLikeValue = (value: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(normalizeSecurityText(value)))
  || containsSensitiveAssignment(value);
const containsPrivateIdentifier = (value: string): boolean => {
  const normalized = normalizeSecurityText(value);
  if (/^\p{Nd}+$/u.test(normalized)) {
    return normalized.length >= 10 && normalized.length <= 15;
  }
  if (
    /^[a-f0-9]{16}$/iu.test(normalized)
    || /^[a-f0-9]{40,128}$/iu.test(normalized)
    || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(normalized)
    || /^(?:task|project|finding):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(normalized)
  ) return false;
  if (/[\p{L}\p{N}._%+-]+@[^\s@]+\.[^\s@]{2,}/u.test(normalized)) return true;
  const reviewedOpaqueRemoved = normalized
    .replace(/digest\s*[:=]\s*[a-f0-9]{16}\b/giu, "")
    .replace(/\b[12][0-9]{3}-[01][0-9]-[0-3][0-9](?:T[0-9:.+-]+Z?)?\b/gu, "");
  if (
    /(?:^|[^\p{L}\p{N}-])\+?\p{Nd}[\p{Nd} ()-]{7,}\p{Nd}(?![\p{L}\p{N}-])/u.test(reviewedOpaqueRemoved)
    || /\b(?:\p{Nd}{1,3}\.){3}\p{Nd}{1,3}\b/u.test(reviewedOpaqueRemoved)
  ) return true;
  return reviewedOpaqueRemoved
    .split(/[\s?&=,;()[\]{}<>"']/gu)
    .some((fragment) => fragment.includes(":") && parseIpv6Address(fragment) !== null);
};

const maybeDecodeEncoded = (value: string): string[] => {
  const candidates = new Set<string>();
  const decodeUtf8 = (bytes: Uint8Array): string | null => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  };
  const addDecodedCandidate = (value: string, next: string[]): void => {
    const normalized = normalizeSecurityText(value).slice(0, 4_096);
    if (
      normalized.length < 3
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
      || candidates.has(normalized)
    ) return;
    candidates.add(normalized);
    next.push(normalized);
  };
  let frontier = [normalizeSecurityText(value)];
  for (let depth = 0; depth < 6; depth += 1) {
    const next: string[] = [];
    for (const candidate of frontier) {
      try {
        const percentDecoded = normalizeSecurityText(decodeURIComponent(candidate));
        if (percentDecoded !== candidate && !candidates.has(percentDecoded)) {
          candidates.add(percentDecoded);
          next.push(percentDecoded);
        }
      } catch {
        // Malformed percent encoding remains untrusted ordinary text.
      }
      for (const match of candidate.matchAll(/\b[A-Za-z0-9+/_-]{4,}={0,2}\b/gu)) {
        try {
          const normalized = match[0].replace(/-/gu, "+").replace(/_/gu, "/");
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
          const binary = globalThis.atob(padded);
          const decoded = decodeUtf8(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
          if (decoded !== null) {
            addDecodedCandidate(decoded, next);
          }
        } catch {
          // Invalid base64 remains ordinary untrusted text.
        }
      }
      for (const match of candidate.matchAll(/\b(?:[0-9a-fA-F]{2}){4,}\b/gu)) {
        const bytes = new Uint8Array(Math.min(match[0].length, 8_192) / 2);
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(match[0].slice(index * 2, (index * 2) + 2), 16);
        const decoded = decodeUtf8(bytes);
        if (decoded !== null) {
          addDecodedCandidate(decoded, next);
        }
      }
    }
    if (depth === 5 && next.length > 0) {
      // Encoded content that remains recursively decodable beyond the reviewed
      // inspection bound is rejected rather than retained as ordinary text.
      candidates.add("secret=encoded_depth_exceeded");
      break;
    }
    if (next.length > 128) {
      candidates.add("secret=encoded_candidate_limit_exceeded");
      break;
    }
    frontier = next;
  }
  return [...candidates];
};

const boundedPermutationReconstructions = (
  values: readonly string[],
  maximumCandidates = 8_192,
): string[] => {
  const fragments = values
    .slice(0, 16)
    .map((value) => (maybeDecodeEncoded(value).at(-1) ?? value).slice(0, 1_024))
    .filter(Boolean);
  if (fragments.length < 2 || fragments.length > 10) return [];
  const candidates = new Set<string>();
  const used = new Array<boolean>(fragments.length).fill(false);
  const visit = (parts: string[]): void => {
    if (candidates.size >= maximumCandidates) return;
    if (parts.length >= 2) candidates.add(parts.join(""));
    if (parts.length >= Math.min(6, fragments.length)) return;
    const visitedAtDepth = new Set<string>();
    for (let index = 0; index < fragments.length && candidates.size < maximumCandidates; index += 1) {
      if (used[index] || visitedAtDepth.has(fragments[index])) continue;
      visitedAtDepth.add(fragments[index]);
      used[index] = true;
      parts.push(fragments[index]);
      visit(parts);
      parts.pop();
      used[index] = false;
    }
  };
  visit([]);
  return [...candidates];
};

const boundedFragmentReconstructions = (
  values: readonly string[],
  options: { detectPrivateFragments?: boolean; inferSensitiveLabel?: boolean } = {},
): string[] => {
  const bounded = values.slice(0, 128).map((value) => value.slice(0, 1_024));
  const safeTwoNumericCounters = bounded.length === 2
    && bounded.every((value) => /^\p{Nd}{1,8}$/u.test(normalizeSecurityText(value)));
  const candidates = new Set<string>(safeTwoNumericCounters ? bounded : [
    bounded.join(""),
    [...bounded].reverse().join(""),
    [...bounded].sort().join(""),
    [...bounded].sort().reverse().join(""),
  ]);
  const decodedFragments = bounded.map((value) => {
    const decoded = maybeDecodeEncoded(value);
    return decoded.at(-1) ?? value;
  });
  if (!safeTwoNumericCounters) {
    candidates.add(decodedFragments.join(""));
    candidates.add([...decodedFragments].reverse().join(""));
  }
  const assembledSensitiveLabel = canAssembleFragmentTarget(
    decodedFragments,
    SENSITIVE_FRAGMENT_TARGETS,
  );
  const normalizedWithoutSeparators = decodedFragments
    .filter((value) => !/^\s*[:=]\s*$/u.test(normalizeSecurityText(value)))
    .map(normalizeSecurityLabel)
    .filter(Boolean);
  const hasAssignmentMarker = decodedFragments.some((value) =>
    /[:=]/u.test(normalizeSecurityText(value))
  );
  const reviewedSafeStatus = !hasAssignmentMarker
    && SAFE_FRAGMENT_ASSIGNMENT_VALUES.has(normalizedWithoutSeparators.at(-1) ?? "")
    && REVIEWED_STATUS_LABELS.has(normalizedWithoutSeparators.slice(0, -1).join(""));
  if (reviewedSafeStatus) {
    candidates.clear();
    for (const value of bounded) candidates.add(value);
  }
  if (options.inferSensitiveLabel !== false && assembledSensitiveLabel && !reviewedSafeStatus) {
    candidates.add("secret=fragment_reconstruction");
  }
  const digitBearingFragments = decodedFragments
    .map((value) => normalizeSecurityText(value).trim())
    .filter((value) => {
      const digits = value.replace(/[^\p{Nd}]/gu, "");
      return digits.length > 0 && digits.length <= 9 && value.length <= 64;
    });
  const phoneDigitCount = digitBearingFragments.reduce(
    (count, value) => count + (value.match(/\p{Nd}/gu)?.length ?? 0),
    0,
  );
  const reviewedYearSeries = digitBearingFragments.length >= 2
    && digitBearingFragments.every((value) => {
      if (!/^\p{Nd}{4}$/u.test(value)) return false;
      const year = Number(value);
      return year >= 1900 && year <= 2100;
    });
  const reviewedLongNumericPair = digitBearingFragments.length === 2
    && phoneDigitCount > 15
    && digitBearingFragments.every((value) => /^\p{Nd}{4,9}$/u.test(value));
  const reviewedDateCounterPair = digitBearingFragments.length === 2
    && /^20\p{Nd}{6}$/u.test(digitBearingFragments[0])
    && /^\p{Nd}{1,6}$/u.test(digitBearingFragments[1]);
  const reviewedVersionFragments = decodedFragments.length >= 3
    && decodedFragments.every((value) => /^\s*(?:\p{Nd}{1,6}|\.)\s*$/u.test(normalizeSecurityText(value)))
    && decodedFragments.some((value) => normalizeSecurityText(value).trim() === ".")
    && decodedFragments
      .filter((value) => /^\p{Nd}+$/u.test(normalizeSecurityText(value).trim()))
      .every((value) => Number(normalizeSecurityText(value).trim()) <= 99);
  if (options.detectPrivateFragments === true
    && !reviewedYearSeries
    && !reviewedLongNumericPair
    && !reviewedDateCounterPair
    && !reviewedVersionFragments
    && digitBearingFragments.length >= 2
    && phoneDigitCount >= 10
    && phoneDigitCount <= 15) {
    candidates.add("private@example.invalid");
  }
  const normalizedTextFragments = decodedFragments.map((value) =>
    normalizeSecurityText(value).trim()
  );
  const hasStandaloneAt = normalizedTextFragments.some((value) => value === "@");
  const hasAnyAt = normalizedTextFragments.some((value) => value.includes("@"));
  const hasLocalPart = decodedFragments.some((value) =>
    /^[\p{L}\p{N}._%+-]{1,64}$/u.test(normalizeSecurityText(value))
    && !/^\p{Nd}+$/u.test(normalizeSecurityText(value))
  );
  const hasDomain = decodedFragments.some((value) =>
    /^[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63})*\.[\p{L}]{2,}$/u
      .test(normalizeSecurityText(value))
  );
  const hasTldFragment = normalizedTextFragments.some((value) =>
    /(?:^|\.)\p{L}{2,63}$/u.test(value)
  );
  const dotCount = normalizedTextFragments.reduce(
    (count, value) => count + (value.match(/\./gu)?.length ?? 0),
    0,
  );
  if (options.detectPrivateFragments === true && (
    (hasStandaloneAt && hasLocalPart && (hasDomain || hasTldFragment || dotCount > 0))
    || (hasAnyAt && hasTldFragment && hasLocalPart)
  )) candidates.add("private@example.invalid");
  const ipv4Numbers = normalizedTextFragments.flatMap((value) =>
    [...value.matchAll(/(?:^|[^0-9])([0-9]{1,3})(?=$|[^0-9])/gu)]
      .map((match) => Number(match[1]))
      .filter((number) => number >= 0 && number <= 255)
  );
  if (options.detectPrivateFragments === true && !reviewedVersionFragments
    && dotCount >= 3 && ipv4Numbers.length >= 4) candidates.add("192.0.2.1");
  return [...candidates];
};

type PositionedFragmentScan = {
  fragments: Array<{ position: number; value: string }>;
  invalid: boolean;
};
const POSITION_ALIAS_LABELS = new Set([
  "position", "index", "ordinal", "order", "idx", "sequence", "seq", "offset",
  "rank", "slot", "fragmentindex", "positionindex",
]);
const FRAGMENT_ALIAS_LABELS = new Set([
  "chunk", "fragment", "piece", "part", "value", "payload",
]);
const isPositionAliasLabel = (label: string): boolean =>
  POSITION_ALIAS_LABELS.has(label)
  || /^(?:(?:fragment|piece|chunk|part|payload|value)?(?:position|index|ordinal|order|sequence|seq|offset|rank|slot))$/u.test(label);
const isFragmentAliasLabel = (label: string): boolean => FRAGMENT_ALIAS_LABELS.has(label);
const SEMANTIC_ORDER: Readonly<Record<string, number>> = Object.freeze({
  zero: 0, head: 0, header: 0, prefix: 0, start: 0, beginning: 0,
  primary: 1, first: 1, one: 1, body: 1,
  secondary: 2, second: 2, two: 2, fragment: 2,
  tertiary: 3, third: 3, three: 3, checksum: 3,
  fourth: 4, four: 4, fifth: 5, five: 5, sixth: 6, six: 6,
  seventh: 7, seven: 7, eighth: 8, eight: 8, ninth: 9, nine: 9,
  tenth: 10, ten: 10, eleventh: 11, eleven: 11, twelfth: 12, twelve: 12,
  thirteenth: 13, thirteen: 13, fourteenth: 14, fourteen: 14,
  fifteenth: 15, fifteen: 15, sixteenth: 16, sixteen: 16,
  seventeenth: 17, seventeen: 17, eighteenth: 18, eighteen: 18,
  nineteenth: 19, nineteen: 19, twentieth: 20, twenty: 20,
  mid: 50, middle: 50, penultimate: 98, tail: 99, footer: 99, end: 99,
  ending: 99, last: 99,
});
const REVIEWED_NUMERIC_METADATA_LABEL = /^(?:queued|completed|failed|year|build|patch|count|version|zero|first|one|second|two|third|three|fourth|four|fifth|five|sixth|six|seventh|seven|eighth|eight|ninth|nine|tenth|ten)$/u;
const REVIEWED_URL_COUNTER_LABEL = /^(?:year|build|patch|count|version|item|page|release)[0-9]+$/u;
const ROMAN_ORDER: Readonly<Record<string, number>> = Object.freeze({
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17,
  xviii: 18, xix: 19, xx: 20,
});
const semanticOrderIndex = (value: string): number | null => {
  const normalized = normalizeSecurityLabel(value);
  if (Object.hasOwn(SEMANTIC_ORDER, normalized)) return SEMANTIC_ORDER[normalized];
  if (Object.hasOwn(ROMAN_ORDER, normalized)) return ROMAN_ORDER[normalized];
  const numeric = normalized.match(/([0-9]{1,9})/u);
  if (numeric) return Number(numeric[1]);
  for (const [word, order] of Object.entries(SEMANTIC_ORDER)
    .sort(([left], [right]) => right.length - left.length)) {
    if (normalized.includes(word)) return order;
  }
  if (/^(?:part|chunk|fragment|piece|payload|value|position|index|ordinal|order|sequence|seq|offset|rank|slot)[ivx]+$/u.test(normalized)) {
    for (const [roman, order] of Object.entries(ROMAN_ORDER)
      .sort(([left], [right]) => right.length - left.length)) {
      if (normalized.endsWith(roman)) return order;
    }
  }
  return null;
};
const collectSemanticObjectFragments = (
  value: unknown,
  output: string[][] = [],
  depth = 0,
): string[][] => {
  if (depth > 8 || output.length >= 128 || value === null || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 128)) collectSemanticObjectFragments(entry, output, depth + 1);
    return output;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const ordered = entries.flatMap(([key, child]) => {
    const order = semanticOrderIndex(key);
    return order !== null && typeof child === "string" ? [{ order, value: child }] : [];
  });
  if (ordered.length >= 2) {
    const grouped = new Map<number, string[]>();
    for (const entry of ordered) grouped.set(entry.order, [...(grouped.get(entry.order) ?? []), entry.value]);
    const groups = [...grouped.entries()].sort(([left], [right]) => left - right).map(([, fragments]) => fragments);
    const alternatives: string[][] = [];
    const visit = (position: number, selected: string[]): void => {
      if (alternatives.length >= 512) return;
      if (position === groups.length) {
        alternatives.push([...selected]);
        return;
      }
      for (const fragment of groups[position]) {
        selected.push(fragment);
        visit(position + 1, selected);
        selected.pop();
      }
    };
    visit(0, []);
    output.push(...alternatives);
  }
  for (const child of entries.slice(0, 64).map(([, child]) => child)) {
    collectSemanticObjectFragments(child, output, depth + 1);
  }
  return output;
};
const collectPositionedFragments = (
  value: unknown,
  output: PositionedFragmentScan = { fragments: [], invalid: false },
  depth = 0,
): PositionedFragmentScan => {
  if (depth > 8 || output.fragments.length >= 128 || value === null || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 128)) collectPositionedFragments(entry, output, depth + 1);
    return output;
  }
  const record = value as Record<string, unknown>;
  const normalizedEntries = Object.entries(record).map(([key, child]) => ({
    label: normalizeSecurityLabel(key),
    value: child,
  }));
  const positionEntries = normalizedEntries.filter((entry) => isPositionAliasLabel(entry.label));
  const fragmentEntries = normalizedEntries.filter((entry) => isFragmentAliasLabel(entry.label));
  if (positionEntries.length > 0) {
    if (positionEntries.length !== 1 || fragmentEntries.length !== 1) {
      output.invalid = true;
    } else {
      const position = positionEntries[0].value;
      const fragment = fragmentEntries[0].value;
      const normalizedPosition = typeof position === "number"
        ? position
        : Number(normalizeSecurityText(String(position ?? "")));
      if (
        Number.isSafeInteger(normalizedPosition)
        && normalizedPosition >= 0
        && normalizedPosition < 128
        && typeof fragment === "string"
        && fragment.length <= 1_024
      ) {
        output.fragments.push({ position: normalizedPosition, value: fragment });
      } else output.invalid = true;
    }
  }
  for (const child of Object.values(record).slice(0, 64)) collectPositionedFragments(child, output, depth + 1);
  return output;
};

export type CognitiveSanitizationResult = {
  accepted: boolean;
  value: unknown;
  categories: readonly string[];
  totalBytes: number;
};

export const sanitizeCognitivePayload = (
  input: unknown,
  limits = { maxDepth: 8, maxKeys: 64, maxArray: 128, maxString: 4_000, maxBytes: 64_000 },
): CognitiveSanitizationResult => {
  const categories = new Set<string>();
  let totalBytes = 0;
  const seen = new WeakSet<object>();
  const aggregatePieces: string[] = [];
  const aggregateStringValues: string[] = [];
  const aggregateKeys: string[] = [];
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > limits.maxDepth) {
      categories.add("maximum_depth_exceeded");
      return null;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) categories.add("non_finite_number");
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      aggregatePieces.push(value.slice(0, limits.maxString));
      aggregateStringValues.push(value.slice(0, limits.maxString));
      totalBytes += new TextEncoder().encode(value).byteLength;
      if (value.length > limits.maxString) categories.add("maximum_string_length_exceeded");
      const bounded = value.slice(0, limits.maxString);
      const decoded = maybeDecodeEncoded(bounded);
      if (containsSecretLikeValue(bounded) || decoded.some(containsSecretLikeValue)) {
        categories.add("secret_like_value");
        return "[REDACTED_SECRET_LIKE_VALUE]";
      }
      if (containsPrivateIdentifier(bounded)) {
        categories.add("private_identifier");
        const redacted = bounded
          .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[REDACTED_EMAIL]")
          .replace(/\+?[0-9][0-9 ()-]{7,}[0-9]/gu, "[REDACTED_PHONE]")
          .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, "[REDACTED_IP]")
          .replace(/\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{0,4}\b/gu, "[REDACTED_IP]");
        return redacted === bounded ? "[REDACTED_PRIVATE_IDENTIFIER]" : redacted;
      }
      if (decoded.some(containsPrivateIdentifier)) {
        categories.add("private_identifier");
        return "[REDACTED_PRIVATE_IDENTIFIER]";
      }
      if (containsPromptInjection(bounded) || decoded.some(containsPromptInjection)) categories.add("untrusted_instruction");
      return bounded;
    }
    if (typeof value !== "object") {
      categories.add("unsupported_value_type");
      return null;
    }
    if (seen.has(value)) {
      categories.add("circular_reference");
      return null;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > limits.maxArray) categories.add("maximum_array_length_exceeded");
      return value.slice(0, limits.maxArray).map((entry) => walk(entry, depth + 1));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      categories.add("non_plain_object");
      return null;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > limits.maxKeys) categories.add("maximum_object_keys_exceeded");
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, child] of entries.slice(0, limits.maxKeys)) {
      totalBytes += new TextEncoder().encode(key).byteLength;
      aggregatePieces.push(key.slice(0, 256));
      aggregateKeys.push(key.slice(0, 256));
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        categories.add("prototype_pollution_key");
        continue;
      }
      const safeStatusValue = typeof child === "string"
        && SAFE_FRAGMENT_ASSIGNMENT_VALUES.has(normalizeSecurityLabel(child))
        && REVIEWED_STATUS_LABELS.has(normalizeSecurityLabel(key));
      if (containsSensitiveIdentifierLabel(key) && !safeStatusValue) {
        categories.add("secret_key");
        output[key] = "[REDACTED_SECRET_LIKE_VALUE]";
      } else output[key] = walk(child, depth + 1);
    }
    return output;
  };
  const value = walk(input, 0);
  const positionedScan = collectPositionedFragments(input);
  const positionedFragments = positionedScan.fragments
    .sort((left, right) => left.position - right.position);
  const positionedValues = positionedFragments.map((entry) => entry.value);
  if (positionedScan.invalid) categories.add("ambiguous_fragment_position");
  if (
    positionedFragments.length > 1
    && new Set(positionedFragments.map((entry) => entry.position)).size !== positionedFragments.length
  ) categories.add("ambiguous_fragment_position");
  const permutationCandidates = !Array.isArray(input)
    && aggregateStringValues.length > 0
    && aggregateStringValues.every((entry) => /^\p{Nd}{1,9}$/u.test(normalizeSecurityText(entry)))
    ? []
    : boundedPermutationReconstructions(aggregateStringValues);
  const numericArrayValues = Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalizeSecurityText(entry).trim())
    : [];
  const reviewedNumericFragmentPayload = Array.isArray(input)
    && numericArrayValues.length === input.length
    && (
      (
        numericArrayValues.length === 2
        && /^20\p{Nd}{6}$/u.test(numericArrayValues[0])
        && /^\p{Nd}{1,6}$/u.test(numericArrayValues[1])
      )
      || (
        numericArrayValues.length >= 2
        && numericArrayValues.every((entry) => /^\p{Nd}{4}$/u.test(entry)
          && Number(entry) >= 1900 && Number(entry) <= 2100)
      )
      || (
        numericArrayValues.length === 2
        && numericArrayValues.every((entry) => /^\p{Nd}{9}$/u.test(entry))
      )
      || (
        numericArrayValues.every((entry) => /^(?:\p{Nd}{1,6}|\.)$/u.test(entry))
        && /^\p{Nd}{1,6}(?:\.\p{Nd}{1,6}){1,7}$/u.test(numericArrayValues.join(""))
        && numericArrayValues.filter((entry) => /^\p{Nd}+$/u.test(entry))
          .every((entry) => Number(entry) <= 99)
      )
    );
  const reviewedNumericMetadataPayload = input !== null
    && typeof input === "object"
    && !Array.isArray(input)
    && Object.entries(input as Record<string, unknown>).length > 0
    && Object.entries(input as Record<string, unknown>).every(([key, child]) =>
      typeof child === "string"
      && /^\p{Nd}{1,9}$/u.test(normalizeSecurityText(child))
      && REVIEWED_NUMERIC_METADATA_LABEL.test(normalizeSecurityLabel(key))
    );
  const semanticCandidates = collectSemanticObjectFragments(input).flatMap((values) =>
    [
      ...boundedFragmentReconstructions(values, {
        detectPrivateFragments: !reviewedNumericMetadataPayload,
      }),
      ...(reviewedNumericMetadataPayload ? [] : boundedPermutationReconstructions(values)),
    ]
  );
  const aggregateCandidates = [
    ...aggregatePieces,
    ...aggregateKeys,
    ...boundedFragmentReconstructions(aggregatePieces, {
      detectPrivateFragments: Array.isArray(input),
    }),
    ...boundedFragmentReconstructions(aggregateStringValues, {
      detectPrivateFragments: Array.isArray(input),
    }),
    ...permutationCandidates,
    ...boundedFragmentReconstructions(positionedValues, {
      detectPrivateFragments: true,
    }),
    ...semanticCandidates,
  ].flatMap((candidate) => [candidate, ...maybeDecodeEncoded(candidate)]);
  if (aggregateCandidates.some(containsSecretLikeValue)) categories.add("secret_like_value");
  if (aggregateCandidates.some((candidate) =>
    containsPrivateIdentifier(candidate)
    && !(
      (reviewedNumericFragmentPayload || reviewedNumericMetadataPayload)
      && /^[\p{Nd}.]+$/u.test(normalizeSecurityText(candidate))
    )
  )) categories.add("private_identifier");
  if (aggregateCandidates.some(containsPromptInjection)) categories.add("untrusted_instruction");
  if (totalBytes > limits.maxBytes) categories.add("maximum_total_bytes_exceeded");
  const rejected = ["secret_like_value", "secret_key", "private_identifier", "prototype_pollution_key", "non_plain_object", "maximum_depth_exceeded", "maximum_total_bytes_exceeded", "circular_reference", "ambiguous_fragment_position"];
  return { accepted: !rejected.some((category) => categories.has(category)), value, categories: [...categories].sort(), totalBytes };
};

export const sanitizeCognitiveText = (value: string): string => {
  const result = sanitizeCognitivePayload(value);
  return typeof result.value === "string" ? result.value : "";
};

export type CognitiveResearchSourceType =
  | "official_documentation"
  | "security_advisory"
  | "platform_policy"
  | "store_policy"
  | "product_research"
  | "competitor_research"
  | "engineering_practice"
  | "news";
export type CognitiveResearchSource = {
  id: string;
  reference: string;
  publisher: string;
  publicationDate: string | null;
  retrievalDate: string;
  sourceType: CognitiveResearchSourceType;
  primary: boolean;
  canonicalUrlHash: string;
  contentHash: string;
  excerpt: string;
  freshnessDeadline: string;
  retrievalStatus: "succeeded" | "failed" | "blocked";
  citationMetadata: {
    title: string;
    locator: string;
  };
  trustedForTools: false;
};
// BEGIN GENERATED RESEARCH AUTHORITIES — config/intelligence/research-authorities.json
const COGNITIVE_SOURCE_AUTHORITY_REGISTRY = [
  { authorityId: "apple-docs", hostname: "developer.apple.com", ownerId: "apple", publisher: "Apple", sourceType: "official_documentation" },
  { authorityId: "apple-policy", hostname: "developer.apple.com", ownerId: "apple", publisher: "Apple", sourceType: "platform_policy" },
  { authorityId: "apple-store-policy", hostname: "developer.apple.com", ownerId: "apple", publisher: "Apple", sourceType: "store_policy" },
  { authorityId: "apple-security", hostname: "developer.apple.com", ownerId: "apple", publisher: "Apple", sourceType: "security_advisory" },
  { authorityId: "android-docs", hostname: "developer.android.com", ownerId: "google", publisher: "Google", sourceType: "official_documentation" },
  { authorityId: "android-policy", hostname: "developer.android.com", ownerId: "google", publisher: "Google", sourceType: "platform_policy" },
  { authorityId: "android-store-policy", hostname: "developer.android.com", ownerId: "google", publisher: "Google", sourceType: "store_policy" },
  { authorityId: "android-security", hostname: "developer.android.com", ownerId: "google", publisher: "Google", sourceType: "security_advisory" },
  { authorityId: "firebase-docs", hostname: "firebase.google.com", ownerId: "google", publisher: "Google", sourceType: "official_documentation" },
  { authorityId: "firebase-security", hostname: "firebase.google.com", ownerId: "google", publisher: "Google", sourceType: "security_advisory" },
  { authorityId: "expo-docs", hostname: "docs.expo.dev", ownerId: "expo", publisher: "Expo", sourceType: "official_documentation" },
  { authorityId: "expo-security", hostname: "docs.expo.dev", ownerId: "expo", publisher: "Expo", sourceType: "security_advisory" },
  { authorityId: "supabase-docs", hostname: "supabase.com", ownerId: "supabase", publisher: "Supabase", sourceType: "official_documentation" },
  { authorityId: "supabase-security", hostname: "supabase.com", ownerId: "supabase", publisher: "Supabase", sourceType: "security_advisory" },
  { authorityId: "github-docs", hostname: "docs.github.com", ownerId: "github", publisher: "GitHub", sourceType: "official_documentation" },
  { authorityId: "github-security", hostname: "docs.github.com", ownerId: "github", publisher: "GitHub", sourceType: "security_advisory" },
  { authorityId: "revenuecat-docs", hostname: "revenuecat.com", ownerId: "revenuecat", publisher: "RevenueCat", sourceType: "official_documentation" },
  { authorityId: "revenuecat-security", hostname: "revenuecat.com", ownerId: "revenuecat", publisher: "RevenueCat", sourceType: "security_advisory" },
  { authorityId: "stripe-docs", hostname: "stripe.com", ownerId: "stripe", publisher: "Stripe", sourceType: "official_documentation" },
  { authorityId: "stripe-security", hostname: "stripe.com", ownerId: "stripe", publisher: "Stripe", sourceType: "security_advisory" },
  { authorityId: "livekit-docs", hostname: "docs.livekit.io", ownerId: "livekit", publisher: "LiveKit", sourceType: "official_documentation" },
  { authorityId: "livekit-security", hostname: "docs.livekit.io", ownerId: "livekit", publisher: "LiveKit", sourceType: "security_advisory" },
  { authorityId: "cloudflare-docs", hostname: "developers.cloudflare.com", ownerId: "cloudflare", publisher: "Cloudflare", sourceType: "official_documentation" },
  { authorityId: "cloudflare-security", hostname: "developers.cloudflare.com", ownerId: "cloudflare", publisher: "Cloudflare", sourceType: "security_advisory" },
  { authorityId: "iana-docs", hostname: "iana.org", ownerId: "iana", publisher: "IANA", sourceType: "official_documentation" },
  { authorityId: "reuters-news", hostname: "reuters.com", ownerId: "reuters", publisher: "Reuters", sourceType: "news" },
  { authorityId: "ap-news", hostname: "apnews.com", ownerId: "associated-press", publisher: "Associated Press", sourceType: "news" },
] as const;
// END GENERATED RESEARCH AUTHORITIES
const registeredResearchAuthority = (source: CognitiveResearchSource) => {
  let hostname = "";
  try {
    const parsed = new URL(source.reference);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || (parsed.port && parsed.port !== "443")) return null;
    hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  } catch {
    return null;
  }
  const entry = COGNITIVE_SOURCE_AUTHORITY_REGISTRY.find((candidate) =>
    (hostname === candidate.hostname || hostname.endsWith(`.${candidate.hostname}`))
    && candidate.sourceType === source.sourceType);
  if (!entry
    || entry.publisher.toLowerCase() !== source.publisher.trim().toLowerCase()) return null;
  return { hostname, ownerId: entry.ownerId };
};
const canonicalResearchReference = (reference: string): string | null => {
  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash
      || (parsed.port && parsed.port !== "443")) return null;
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
    return parsed.toString();
  } catch {
    return null;
  }
};
export type CognitiveResearchClaimInput = {
  claim: string;
  confidence: number;
  freshnessDeadline: string;
  consequential: boolean;
  technicalFact: boolean;
  sources: readonly CognitiveResearchSource[];
  contradictionState: "none" | "detected" | "unresolved" | "resolved";
};
export type CognitiveResearchDecision = {
  accepted: boolean;
  reasons: readonly string[];
  contradictionState: CognitiveResearchClaimInput["contradictionState"];
  sourceIds: readonly string[];
  toolInvocationAllowed: false;
};

export const evaluateResearchClaim = (input: CognitiveResearchClaimInput, now = new Date()): CognitiveResearchDecision => {
  // This undeployed scaffold intentionally has no constructible broker receipt
  // authority. Caller-provided URLs, excerpts, dates, publishers, and hashes can
  // be structurally reviewed, but they can never make a claim supported. A
  // future deployment must inject service-owned transport/retrieval evidence
  // through a separately reviewed, non-exported authority boundary.
  const reasons: string[] = ["research_broker_authority_not_configured"];
  if (!input.claim.trim() || input.claim.length > 8_000) reasons.push("claim_invalid");
  const sanitizedClaim = sanitizeCognitivePayload(input.claim);
  if (!sanitizedClaim.accepted) reasons.push("claim_sensitive_content_rejected");
  if (sanitizedClaim.categories.includes("private_identifier")) reasons.push("claim_private_identifier_rejected");
  if (sanitizedClaim.categories.includes("untrusted_instruction")) reasons.push("prompt_injection_detected");
  if (!validFiniteNumber(input.confidence, 0, 1)) reasons.push("confidence_out_of_range");
  if (!input.sources.length || input.sources.length > 12) reasons.push("source_count_invalid");
  if (new Set(input.sources.map((source) => source.id)).size !== input.sources.length) reasons.push("source_id_duplicate");
  const authoritativeTypes = ["official_documentation", "security_advisory", "platform_policy", "store_policy"];
  const sourceAuthorities = input.sources.map((source) => registeredResearchAuthority(source));
  if (input.technicalFact && !input.sources.some((source, index) =>
    source.primary && authoritativeTypes.includes(source.sourceType) && sourceAuthorities[index])) {
    reasons.push("technical_fact_requires_verified_primary_source");
  }
  const newsSourceEntries = input.sources
    .map((source, index) => ({ source, authority: sourceAuthorities[index] }))
    .filter(({ source }) => source.sourceType === "news");
  const newsSources = newsSourceEntries.map(({ source }) => source);
  const newsOwners = new Set(newsSourceEntries.map(({ authority }) => authority?.ownerId).filter(Boolean));
  const newsCanonicalUrls = new Set(newsSources.map((source) => source.canonicalUrlHash));
  const newsContent = new Set(newsSources.map((source) => source.contentHash));
  if (input.consequential && (newsOwners.size < 2 || newsCanonicalUrls.size < 2 || newsContent.size < 2)) reasons.push("consequential_news_requires_verified_independent_corroboration");
  if (input.contradictionState === "detected" || input.contradictionState === "unresolved") reasons.push("contradiction_unresolved");
  const claimFreshness = Date.parse(input.freshnessDeadline);
  if (!Number.isFinite(claimFreshness) || claimFreshness <= now.getTime()) reasons.push("claim_expired_refresh_required");
  const claimTtlDays = input.consequential ? 7 : input.technicalFact ? 90 : 30;
  if (Number.isFinite(claimFreshness) && claimFreshness > now.getTime() + (claimTtlDays * 86_400_000)) {
    reasons.push("claim_freshness_ceiling_exceeded");
  }
  for (const [sourceIndex, source] of input.sources.entries()) {
    if (!validSecurityIdentifier(source.id) || containsSecretLikeValue(source.id)
      || containsPromptInjection(source.id)) reasons.push("source_id_invalid");
    if (!sourceAuthorities[sourceIndex]) reasons.push("source_authority_unverified");
    if (source.trustedForTools !== false) reasons.push("source_must_remain_untrusted");
    if (source.primary && !authoritativeTypes.includes(source.sourceType)) reasons.push("primary_source_type_invalid");
    if (source.retrievalStatus !== "succeeded") reasons.push("source_retrieval_not_verified");
    if (
      !source.citationMetadata
      || typeof source.citationMetadata.title !== "string"
      || source.citationMetadata.title.trim().length < 1
      || source.citationMetadata.title.length > 512
      || typeof source.citationMetadata.locator !== "string"
      || source.citationMetadata.locator.trim().length < 1
      || source.citationMetadata.locator.length > 512
    ) reasons.push("source_citation_missing");
    const canonicalReference = canonicalResearchReference(source.reference);
    if (!canonicalReference
      || source.canonicalUrlHash !== cognitiveSha256(canonicalReference)
      || source.contentHash !== cognitiveSha256(source.excerpt)) reasons.push("source_hash_binding_invalid");
    if (!source.excerpt || source.excerpt.length > 2_000) reasons.push("source_excerpt_invalid");
    const publication = source.publicationDate === null ? Number.NaN : Date.parse(source.publicationDate);
    const retrieval = Date.parse(source.retrievalDate);
    const freshness = Date.parse(source.freshnessDeadline);
    const sourceTtlDays = source.sourceType === "news" ? 7
      : source.sourceType === "security_advisory" ? 14
      : ["platform_policy", "store_policy"].includes(source.sourceType) ? 30
      : 90;
    if (!Number.isFinite(retrieval)
      || retrieval > now.getTime()
      || retrieval < now.getTime() - (2 * 86_400_000)
      || !Number.isFinite(freshness)
      || freshness <= now.getTime()
      || freshness > retrieval + (sourceTtlDays * 86_400_000)) reasons.push("source_stale_or_invalid");
    if (Number.isFinite(claimFreshness) && Number.isFinite(freshness) && claimFreshness > freshness) {
      reasons.push("claim_freshness_exceeds_source");
    }
    if (source.publicationDate !== null && (!Number.isFinite(publication) || publication > retrieval)) reasons.push("source_publication_date_invalid");
    const sanitized = sanitizeCognitivePayload({
      id: source.id,
      reference: source.reference,
      publisher: source.publisher,
      excerpt: source.excerpt,
      citationMetadata: source.citationMetadata,
    });
    if (!sanitized.accepted) reasons.push("source_sensitive_content_rejected");
    if (sanitized.categories.includes("private_identifier")) reasons.push("source_private_identifier_rejected");
    if (sanitized.categories.includes("untrusted_instruction")) reasons.push("source_prompt_injection_detected");
  }
  return {
    accepted: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
    contradictionState: input.contradictionState,
    sourceIds: [...new Set(input.sources.map((source) => source.id))].sort(),
    toolInvocationAllowed: false,
  };
};

const PRIVATE_IPV4 = [
  /^0\./u, /^10\./u, /^100\.(?:6[4-9]|[7-9]\d|1(?:[01]\d|2[0-7]))\./u, /^127\./u,
  /^169\.254\./u, /^172\.(?:1[6-9]|2\d|3[01])\./u, /^192\.0\.0\./u,
  /^192\.0\.2\./u, /^192\.88\.99\./u, /^192\.168\./u, /^198\.(?:1[89]|51\.100)\./u,
  /^203\.0\.113\./u, /^224\./u, /^23[0-9]\./u, /^24[0-9]\./u, /^25[0-5]\./u,
];
const parseIpv6Address = (address: string): bigint | null => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, "").split("%")[0];
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
};
const ipv6Matches = (value: bigint, base: string, bits: number): boolean => {
  const parsedBase = parseIpv6Address(base);
  if (parsedBase === null) return true;
  const shift = BigInt(128 - bits);
  return (value >> shift) === (parsedBase >> shift);
};
const RESERVED_IPV6: readonly [string, number][] = [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96],
  ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["3fff::", 20], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
];
export const isPrivateOrReservedAddress = (address: string): boolean => {
  const value = address.toLowerCase().replace(/^\[|\]$/gu, "");
  if (value.startsWith("::ffff:") && value.slice(7).includes(".")) {
    return isPrivateOrReservedAddress(value.slice(7));
  }
  const ipv6 = parseIpv6Address(value);
  if (ipv6 !== null) {
    if (!ipv6Matches(ipv6, "2000::", 3)) return true;
    return RESERVED_IPV6.some(([base, bits]) => ipv6Matches(ipv6, base, bits));
  }
  return PRIVATE_IPV4.some((pattern) => pattern.test(value));
};

type UrlFragmentReconstructions = {
  all: string[];
  structured: string[];
};
const appendOrderedFragmentAlternatives = (
  output: string[],
  fragments: ReadonlyArray<{ position: number; value: string }>,
): void => {
  if (fragments.length < 2 || fragments.length > 128) return;
  const groups = new Map<number, string[]>();
  for (const fragment of fragments) {
    groups.set(fragment.position, [...(groups.get(fragment.position) ?? []), fragment.value]);
  }
  const orderedGroups = [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, values]) => [...new Set(values)]);
  let alternatives: string[][] = [[]];
  for (const values of orderedGroups) {
    alternatives = alternatives
      .flatMap((prefix) => values.map((value) => [...prefix, value]))
      .slice(0, 512);
  }
  for (const alternative of alternatives) {
    output.push(...boundedFragmentReconstructions(alternative, {
      detectPrivateFragments: true,
      inferSensitiveLabel: false,
    }));
    output.push(...boundedPermutationReconstructions(alternative, 2_048));
    if (canAssembleFragmentTarget(alternative, SENSITIVE_FRAGMENT_TARGETS)) {
      output.push("secret=fragment_reconstruction");
    }
  }
};

const reconstructNamedUrlFragments = (searchParams: URLSearchParams): UrlFragmentReconstructions => {
  const groups = new Map<string, Array<{ position: number; value: string }>>();
  const allIndexed: Array<{ position: number; value: string }> = [];
  const entries = [...searchParams.entries()].slice(0, 128);
  const candidates: string[] = [];
  const structured: string[] = [];
  const appendSequenceCandidates = (values: readonly string[]): void => {
    const bounded = values.slice(0, 64).map((value) => value.slice(0, 1_024));
    if (bounded.length < 2) return;
    candidates.push(...boundedFragmentReconstructions(bounded, {
      detectPrivateFragments: false,
      inferSensitiveLabel: false,
    }));
    candidates.push(...boundedPermutationReconstructions(bounded, 2_048));
    for (let start = 0; start < bounded.length; start += 1) {
      let joined = "";
      for (let end = start; end < bounded.length; end += 1) {
        joined += bounded[end];
        if (end > start) candidates.push(joined);
      }
    }
  };
  appendSequenceCandidates(entries.map(([, value]) => value));
  if (entries.length >= 2) {
    appendSequenceCandidates(entries.flatMap(([key, value]) => [key, value]));
  }
  const pairedFragments: Array<{ position: number; value: string }> = [];
  let pendingPosition: number | null = null;
  for (const [key, value] of entries) {
    const normalizedKey = normalizeSecurityText(key).slice(0, 128);
    const keyLabel = normalizeSecurityLabel(normalizedKey);
    if (isPositionAliasLabel(keyLabel)) {
      pendingPosition = semanticOrderIndex(value);
      continue;
    }
    if (isFragmentAliasLabel(keyLabel) && pendingPosition !== null) {
      pairedFragments.push({ position: pendingPosition, value: value.slice(0, 1_024) });
      pendingPosition = null;
    }
    const embedded = normalizeSecurityText(value)
      .match(/^\s*([a-z0-9]{1,32})\s*[:|]\s*([\s\S]+)$/iu);
    if (embedded) {
      const embeddedPosition = semanticOrderIndex(embedded[1]);
      if (embeddedPosition !== null) {
        pairedFragments.push({ position: embeddedPosition, value: embedded[2].slice(0, 1_024) });
      }
    }
    const position = REVIEWED_URL_COUNTER_LABEL.test(keyLabel)
      ? null
      : semanticOrderIndex(normalizedKey);
    if (position !== null) {
      const fragment = { position, value: value.slice(0, 1_024) };
      const groupKey = normalizeSecurityLabel(normalizedKey
        .replace(/[0-9]{1,9}/gu, "")
        .replace(new RegExp(Object.keys(SEMANTIC_ORDER).sort((left, right) => right.length - left.length).join("|"), "giu"), "")
      ) || "indexed";
      const group = groups.get(groupKey) ?? [];
      group.push(fragment);
      groups.set(groupKey, group);
      allIndexed.push(fragment);
    }
  }
  allIndexed.push(...pairedFragments);
  if (allIndexed.length >= 2) {
    const values = allIndexed.map((fragment) => fragment.value);
    structured.push(...boundedFragmentReconstructions(values, {
      detectPrivateFragments: true,
      inferSensitiveLabel: false,
    }));
    structured.push(...boundedPermutationReconstructions(values, 2_048));
    if (canAssembleFragmentTarget(values, SENSITIVE_FRAGMENT_TARGETS)) {
      structured.push("secret=fragment_reconstruction");
    }
    appendOrderedFragmentAlternatives(structured, allIndexed);
  }
  for (const fragments of groups.values()) {
    if (fragments.length < 2 || fragments.length > 128) continue;
    const values = fragments.map((fragment) => fragment.value);
    structured.push(...boundedFragmentReconstructions(values, {
      detectPrivateFragments: true,
      inferSensitiveLabel: false,
    }));
    structured.push(...boundedPermutationReconstructions(values, 2_048));
    if (canAssembleFragmentTarget(values, SENSITIVE_FRAGMENT_TARGETS)) {
      structured.push("secret=fragment_reconstruction");
    }
    appendOrderedFragmentAlternatives(structured, fragments);
  }
  return {
    all: [...new Set([...candidates, ...structured])],
    structured: [...new Set(structured)],
  };
};

const pathFragmentCandidates = (pathname: string): UrlFragmentReconstructions => {
  const segments = pathname.split(/[\/;]/u).filter(Boolean).slice(0, 64).map((segment) => {
    try {
      return decodeURIComponent(segment).slice(0, 1_024);
    } catch {
      return segment.slice(0, 1_024);
    }
  });
  const candidates = boundedFragmentReconstructions(segments, {
    detectPrivateFragments: false,
    inferSensitiveLabel: false,
  });
  candidates.push(...boundedPermutationReconstructions(segments, 2_048));
  const structured: string[] = [];
  const positioned: Array<{ position: number; value: string }> = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const position = semanticOrderIndex(segments[index].split("=", 1)[0]);
    if (position !== null) {
      const value = segments[index].includes("=")
        ? segments[index].slice(segments[index].indexOf("=") + 1)
        : segments[index + 1];
      if (value) positioned.push({ position, value });
    }
  }
  appendOrderedFragmentAlternatives(structured, positioned);
  if (canAssembleFragmentTarget(positioned.map((fragment) => fragment.value), SENSITIVE_FRAGMENT_TARGETS)) {
    structured.push("secret=fragment_reconstruction");
  }
  for (let start = 0; start < segments.length; start += 1) {
    let joined = "";
    for (let end = start; end < segments.length; end += 1) {
      joined += segments[end];
      if (end > start) candidates.push(joined);
    }
  }
  return {
    all: [...new Set([...candidates, ...structured])],
    structured: [...new Set(structured)],
  };
};

export const validateResearchUrl = (raw: string): readonly string[] => {
  const blockers: string[] = [];
  const canonicalUrlText = raw.normalize("NFKC").replace(/[\u3002\uff0e\uff61]/gu, ".");
  if (new TextEncoder().encode(canonicalUrlText).byteLength > 2_048) blockers.push("url_too_long");
  let url: URL;
  try {
    url = new URL(canonicalUrlText);
  } catch {
    return ["url_invalid"];
  }
  if (url.protocol !== "https:") blockers.push("https_required");
  if (url.username || url.password) blockers.push("embedded_credentials_forbidden");
  const queryFragments = reconstructNamedUrlFragments(url.searchParams);
  const pathFragments = pathFragmentCandidates(url.pathname);
  const hashText = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashFragments = hashText.includes("=") || hashText.includes("&")
    ? reconstructNamedUrlFragments(new URLSearchParams(hashText))
    : pathFragmentCandidates(hashText);
  const decodedCandidates = [...new Set([
    ...maybeDecodeEncoded(canonicalUrlText),
    ...maybeDecodeEncoded(url.href),
    ...queryFragments.all,
    ...pathFragments.all,
    ...hashFragments.all,
  ])];
  if (containsSecretLikeValue(canonicalUrlText) || containsSecretLikeValue(url.href)
    || decodedCandidates.some(containsSecretLikeValue)) {
    blockers.push("credential_bearing_url_forbidden");
  }
  const researchDataCandidates = [
    url.search,
    url.hash,
    ...url.searchParams.values(),
    ...queryFragments.structured,
    ...pathFragments.structured,
    ...hashFragments.structured,
  ].flatMap((candidate) => [candidate, ...maybeDecodeEncoded(candidate)]);
  if (researchDataCandidates.some((candidate) =>
    containsSecretLikeValue(candidate) || containsPrivateIdentifier(candidate)
  )) {
    blockers.push("credential_bearing_url_forbidden");
  }
  if (url.port && url.port !== "443") blockers.push("port_not_allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateOrReservedAddress(hostname)) blockers.push("private_or_reserved_target");
  if (hostname === "metadata.google.internal" || hostname === "metadata" || hostname.endsWith(".internal")) blockers.push("metadata_or_internal_target");
  return [...new Set(blockers)].sort();
};

export type RequiredTest = {
  id: string;
  commandId: string;
  platform: CognitivePlatform;
  finalCommit: string;
  risk: "low" | "medium" | "high" | "critical";
  physicalEvidenceRequired: boolean;
};
export const requiredCognitiveTestsForChanges = (
  changedPaths: readonly string[],
  finalCommit: string,
  platform: CognitivePlatform,
): readonly RequiredTest[] => {
  if (!/^[a-f0-9]{40}$/u.test(finalCommit)
    || !PLATFORM_SET.has(platform)
    || !Array.isArray(changedPaths)
    || changedPaths.length > 2_000
    || changedPaths.some((entry) => validateLexicalRepositoryPath(entry).length)) {
    throw new Error("required_test_input_invalid");
  }
  const tests = new Map<string, RequiredTest>();
  const add = (
    id: string,
    commandId: string,
    risk: RequiredTest["risk"] = "medium",
    physicalEvidenceRequired = false,
  ) => tests.set(id, { id, commandId, platform, finalCommit, risk, physicalEvidenceRequired });
  add("lint", "npm:lint", "low");
  add("typescript", "npx:tsc-no-emit", "low");
  add("runtime", "npm:validate-runtime", "medium");
  add("routes", "npm:guard-route-contracts", "medium");
  for (const relative of [...changedPaths].sort()) {
    if (relative.startsWith(".github/workflows/")) throw new Error("workflow_edit_forbidden");
    if (relative.startsWith("supabase/migrations/") || relative.startsWith("supabase/tests/")) {
      add("database", "supabase:test-db", "high");
      add("rls-control-plane", "npm:proof-autonomous-systems-contract", "high");
    }
    if (/(?:app\.config|app\.json|package-lock\.json|android|ios|native|runtime)/u.test(relative)) {
      add("native-runtime", "npm:guard-android-native-runtime-compatibility", "critical", true);
      add("expo-doctor", "npx:expo-doctor", "high");
    }
    if (/cognitive|intelligence|research/iu.test(relative)) {
      add("cognitive-red-team", "npm:test-cognitive-red-team", "high");
      add("cognitive-executor", "npm:test-cognitive-executor-confinement", "high");
      add("cognitive-capability", "npm:test-cognitive-capability-contract", "high");
      add("cognitive-evaluator", "npm:test-cognitive-evaluator-independence", "high");
      add("research-broker", "npm:test-research-source-broker", "high");
      add("cognitive-admin", "npm:guard-cognitive-admin-truth", "medium");
    }
    if (/call|notification|livekit/iu.test(relative)) {
      add("call-policy", "npm:guard-notification-room-call-policy", "high");
      add("livekit", "npm:proof-livekit-autonomous-operator", "high");
    }
    if (/money|payment|revenuecat|stripe|storekit|billing/iu.test(relative)) {
      add("payment-policy", "npm:guard-payment-rail-policy", "critical");
    }
    if (/release|eas|ota|update|runtime/iu.test(relative)) {
      add("release-operator", "npm:proof-release-ota-operator", "critical");
    }
    if (/supabase\/functions\/|(?:^|\/)_shared\//u.test(relative)) add("deno-check", "deno:check-modified", "high");
    if (/ios/iu.test(relative) || platform === "ios") add("ios-policy", "npm:guard-ios-config-policy", "high");
    if (/android/iu.test(relative) || platform === "android") add("android-regression", "npm:guard-android-launcher-icon-policy", "high");
  }
  return [...tests.values()].sort((left, right) => left.id.localeCompare(right.id));
};
export type TrustedTestRecord = {
  recordId: string;
  runnerId: string;
  testId: string;
  commandId: string;
  commit: string;
  exitCode: number;
  stdoutHash: string;
  stderrHash: string;
  skipped: boolean;
  completedAt: string;
};
export type TrustedRunEvidence = {
  recordId: string;
  runnerId: string;
  finalCommit: string;
  objectiveHash: string;
  planSnapshotHash: string;
  diffHash: string;
  rollbackPlanHash: string;
  permissionExpansion: boolean;
  moneyMoved: boolean;
  userRightsChanged: boolean;
  productionActionExecuted: boolean;
  completedAt: string;
};
export type TrustedPhysicalEvidence = {
  recordId: string;
  collectorId: string;
  testId: string;
  evidenceType: "physical_device";
  finalCommit: string;
  artifactHash: string;
  observedAt: string;
};
export type TrustedChangedPathManifest = {
  recordId: string;
  collectorId: string;
  finalCommit: string;
  diffHash: string;
  changedPaths: readonly string[];
  observedAt: string;
};

const COGNITIVE_EVIDENCE_AUTHORITY_CONSTRUCTION = Symbol("cognitive-evidence-authority-construction");

export class CognitiveTrustedEvidenceLedger {
  readonly authorityId: string;
  readonly #runnerCredentialHashes: Readonly<Record<string, string>>;
  readonly #collectorCredentialHashes: Readonly<Record<string, string>>;
  readonly #testRecords = new Map<string, Readonly<TrustedTestRecord>>();
  readonly #runRecords = new Map<string, Readonly<TrustedRunEvidence>>();
  readonly #physicalRecords = new Map<string, Readonly<TrustedPhysicalEvidence>>();
  readonly #changedPathRecords = new Map<string, Readonly<TrustedChangedPathManifest>>();

  constructor(input: {
    authorityId: string;
    runnerCredentialHashes: Readonly<Record<string, string>>;
    collectorCredentialHashes: Readonly<Record<string, string>>;
  }, authorityConstruction?: symbol) {
    // The scaffold has no deployed evidence authority. Keeping the construction
    // token module-private prevents a caller from minting a trust root by choosing
    // its own runner hashes. A reviewed deployment may add an internal broker
    // factory without exposing this token to model/executor input.
    if (authorityConstruction !== COGNITIVE_EVIDENCE_AUTHORITY_CONSTRUCTION) {
      throw new Error("trusted_evidence_authority_unconfigured");
    }
    const runnerEntries = Object.entries(input.runnerCredentialHashes);
    const collectorEntries = Object.entries(input.collectorCredentialHashes);
    if (
      !validSecurityIdentifier(input.authorityId)
      || !runnerEntries.length
      || runnerEntries.some(([id, hash]) => !validSecurityIdentifier(id) || !validHash(hash))
      || collectorEntries.some(([id, hash]) => !validSecurityIdentifier(id) || !validHash(hash))
    ) throw new Error("evidence_trust_configuration_invalid");
    this.authorityId = input.authorityId;
    this.#runnerCredentialHashes = Object.freeze({ ...input.runnerCredentialHashes });
    this.#collectorCredentialHashes = Object.freeze({ ...input.collectorCredentialHashes });
  }

  #runnerAuthorized(runnerId: string, credential: string): boolean {
    const expected = this.#runnerCredentialHashes[runnerId];
    return Boolean(expected) && cognitiveSha256(credential) === expected;
  }

  recordTest(record: TrustedTestRecord, opaqueRunnerCredential: string): void {
    if (
      this.#testRecords.has(record.recordId)
      || !this.#runnerAuthorized(record.runnerId, opaqueRunnerCredential)
      || !validSecurityIdentifier(record.recordId)
      || !validSecurityIdentifier(record.testId)
      || !validSecurityIdentifier(record.commandId)
      || !/^[a-f0-9]{40}$/u.test(record.commit)
      || !validFiniteInteger(record.exitCode, 0, 255)
      || !validHash(record.stdoutHash)
      || !validHash(record.stderrHash)
      || typeof record.skipped !== "boolean"
      || !validTimestamp(record.completedAt)
      || record.completedAt !== new Date(record.completedAt).toISOString()
    ) throw new Error("trusted_test_evidence_rejected");
    this.#testRecords.set(record.recordId, Object.freeze({ ...record }));
  }

  recordRun(record: TrustedRunEvidence, opaqueRunnerCredential: string): void {
    if (
      this.#runRecords.has(record.recordId)
      || !this.#runnerAuthorized(record.runnerId, opaqueRunnerCredential)
      || !validSecurityIdentifier(record.recordId)
      || !/^[a-f0-9]{40}$/u.test(record.finalCommit)
      || [record.objectiveHash, record.planSnapshotHash, record.diffHash, record.rollbackPlanHash].some((hash) => !validHash(hash))
      || !validTimestamp(record.completedAt)
      || record.completedAt !== new Date(record.completedAt).toISOString()
      || [record.permissionExpansion, record.moneyMoved, record.userRightsChanged, record.productionActionExecuted].some((value) => typeof value !== "boolean")
    ) throw new Error("trusted_run_evidence_rejected");
    this.#runRecords.set(record.recordId, Object.freeze({ ...record }));
  }

  recordPhysical(record: TrustedPhysicalEvidence, opaqueCollectorCredential: string): void {
    const expected = this.#collectorCredentialHashes[record.collectorId];
    if (
      this.#physicalRecords.has(record.recordId)
      || !expected
      || cognitiveSha256(opaqueCollectorCredential) !== expected
      || !validSecurityIdentifier(record.recordId)
      || !validSecurityIdentifier(record.collectorId)
      || !validSecurityIdentifier(record.testId)
      || record.evidenceType !== "physical_device"
      || !/^[a-f0-9]{40}$/u.test(record.finalCommit)
      || !validHash(record.artifactHash)
      || !validTimestamp(record.observedAt)
      || record.observedAt !== new Date(record.observedAt).toISOString()
    ) throw new Error("trusted_physical_evidence_rejected");
    this.#physicalRecords.set(record.recordId, Object.freeze({ ...record }));
  }

  recordChangedPaths(record: TrustedChangedPathManifest, opaqueCollectorCredential: string): void {
    const expected = this.#collectorCredentialHashes[record.collectorId];
    if (
      this.#changedPathRecords.has(record.recordId)
      || !expected
      || cognitiveSha256(opaqueCollectorCredential) !== expected
      || !validSecurityIdentifier(record.recordId)
      || !validSecurityIdentifier(record.collectorId)
      || !/^[a-f0-9]{40}$/u.test(record.finalCommit)
      || !validHash(record.diffHash)
      || !Array.isArray(record.changedPaths)
      || record.changedPaths.length > 2_000
      || record.changedPaths.some((entry) => validateLexicalRepositoryPath(entry).length)
      || !validTimestamp(record.observedAt)
      || record.observedAt !== new Date(record.observedAt).toISOString()
    ) throw new Error("trusted_changed_path_manifest_rejected");
    this.#changedPathRecords.set(record.recordId, Object.freeze({
      ...record,
      changedPaths: Object.freeze([...new Set(record.changedPaths)].sort()),
    }));
  }

  getTest(recordId: string): Readonly<TrustedTestRecord> | null {
    return this.#testRecords.get(recordId) ?? null;
  }

  getRun(recordId: string): Readonly<TrustedRunEvidence> | null {
    return this.#runRecords.get(recordId) ?? null;
  }

  getChangedPaths(recordId: string): Readonly<TrustedChangedPathManifest> | null {
    return this.#changedPathRecords.get(recordId) ?? null;
  }

  physicalForTest(testId: string, finalCommit: string): readonly Readonly<TrustedPhysicalEvidence>[] {
    return [...this.#physicalRecords.values()].filter((record) => record.testId === testId && record.finalCommit === finalCommit);
  }

  manifestHash(runRecordId: string, testRecordIds: readonly string[]): string {
    const run = this.getRun(runRecordId);
    const tests = testRecordIds.map((recordId) => this.getTest(recordId));
    if (!run || tests.some((record) => record === null)) throw new Error("trusted_evidence_missing");
    const hash = cognitiveSha256(canonicalCognitiveJson({
      run,
      tests: tests.sort((left, right) => String(left?.recordId).localeCompare(String(right?.recordId))),
    }));
    if (!validHash(hash)) throw new Error("trusted_evidence_manifest_hash_invalid");
    return hash;
  }

  reader(): CognitiveTrustedEvidenceReader {
    return Object.freeze({
      authorityId: this.authorityId,
      getTest: (recordId: string) => this.getTest(recordId),
      getRun: (recordId: string) => this.getRun(recordId),
      getChangedPaths: (recordId: string) => this.getChangedPaths(recordId),
      physicalForTest: (testId: string, finalCommit: string) =>
        this.physicalForTest(testId, finalCommit),
      manifestHash: (runRecordId: string, testRecordIds: readonly string[]) =>
        this.manifestHash(runRecordId, testRecordIds),
    });
  }
}

export type CognitiveTrustedEvidenceReader = Readonly<{
  authorityId: string;
  getTest: (recordId: string) => Readonly<TrustedTestRecord> | null;
  getRun: (recordId: string) => Readonly<TrustedRunEvidence> | null;
  getChangedPaths: (recordId: string) => Readonly<TrustedChangedPathManifest> | null;
  physicalForTest: (
    testId: string,
    finalCommit: string,
  ) => readonly Readonly<TrustedPhysicalEvidence>[];
  manifestHash: (runRecordId: string, testRecordIds: readonly string[]) => string;
}>;

export type CognitiveEvaluationInput = {
  evaluatorIdentity: string;
  executorIdentity: string;
  objectiveHash: string;
  planSnapshotHash: string;
  runEvidenceManifestHash: string;
  runEvidenceRecordId: string;
  testEvidenceRecordIds: readonly string[];
  finalCommit: string;
  finalCommitAt: string;
  changedPathManifestRecordId: string;
  platform: CognitivePlatform;
};
export type CognitiveEvaluation = {
  status: "PASS" | "FAIL" | "INCOMPLETE" | "BLOCKED";
  passed: boolean;
  blockers: readonly string[];
  evaluatorWriteAllowed: false;
  ownerApprovalGranted: false;
  completionSupported: boolean;
};

export const evaluateCognitiveRun = (
  input: CognitiveEvaluationInput,
  evidenceLedger: CognitiveTrustedEvidenceReader,
  now = new Date(),
): CognitiveEvaluation => {
  const blockers: string[] = [];
  // No production evidence authority is configured for this undeployed scaffold.
  // A future deployment must add reviewed public verifier identities here; callers
  // cannot manufacture a trust root by supplying their own verifier.
  const trustedEvidenceAuthorityIds = new Set<string>();
  if (!trustedEvidenceAuthorityIds.has(evidenceLedger.authorityId)) blockers.push("trusted_evidence_authority_not_configured");
  if (!validIdentifier(input.evaluatorIdentity) || input.evaluatorIdentity === input.executorIdentity) blockers.push("evaluator_identity_not_independent");
  for (const hash of [input.objectiveHash, input.planSnapshotHash, input.runEvidenceManifestHash]) if (!validHash(hash)) blockers.push("trusted_evidence_hash_invalid");
  if (!/^[a-f0-9]{40}$/u.test(input.finalCommit) || !validTimestamp(input.finalCommitAt) || Date.parse(input.finalCommitAt) > now.getTime()) blockers.push("final_commit_identity_invalid");
  const runEvidence = evidenceLedger.getRun(input.runEvidenceRecordId);
  if (!runEvidence) blockers.push("run_evidence_missing");
  else {
    if (runEvidence.finalCommit !== input.finalCommit) blockers.push("run_evidence_wrong_commit");
    if (runEvidence.objectiveHash !== input.objectiveHash || runEvidence.planSnapshotHash !== input.planSnapshotHash) blockers.push("run_evidence_scope_mismatch");
    if (Date.parse(runEvidence.completedAt) < Date.parse(input.finalCommitAt) || Date.parse(runEvidence.completedAt) > now.getTime()) blockers.push("run_evidence_time_invalid");
    if (runEvidence.permissionExpansion) blockers.push("permission_expansion_requires_owner_review");
    if (runEvidence.moneyMoved) blockers.push("money_boundary_violated");
    if (runEvidence.userRightsChanged) blockers.push("user_rights_boundary_violated");
    if (runEvidence.productionActionExecuted) blockers.push("production_action_boundary_violated");
  }
  try {
    if (evidenceLedger.manifestHash(input.runEvidenceRecordId, input.testEvidenceRecordIds) !== input.runEvidenceManifestHash) blockers.push("run_evidence_manifest_mismatch");
  } catch {
    blockers.push("run_evidence_manifest_unverifiable");
  }
  let requiredTests: readonly RequiredTest[] = [];
  const changedPathManifest = evidenceLedger.getChangedPaths(input.changedPathManifestRecordId);
  try {
    if (!changedPathManifest
      || changedPathManifest.finalCommit !== input.finalCommit
      || changedPathManifest.diffHash !== runEvidence?.diffHash) {
      blockers.push("trusted_changed_path_manifest_missing_or_mismatched");
    } else {
      requiredTests = requiredCognitiveTestsForChanges(changedPathManifest.changedPaths, input.finalCommit, input.platform);
    }
  } catch {
    blockers.push("required_test_manifest_invalid");
  }
  const records = new Map(
    input.testEvidenceRecordIds
      .map((recordId) => evidenceLedger.getTest(recordId))
      .filter((record): record is Readonly<TrustedTestRecord> => record !== null)
      .map((record) => [record.testId, record]),
  );
  for (const required of requiredTests) {
    const record = records.get(required.id);
    if (!record) blockers.push(`required_test_missing:${required.id}`);
    else {
      if (record.commandId !== required.commandId) blockers.push(`test_command_mismatch:${required.id}`);
      if (record.commit !== input.finalCommit || record.commit !== required.finalCommit) blockers.push(`test_wrong_commit:${required.id}`);
      if (Date.parse(record.completedAt) < Date.parse(input.finalCommitAt) || Date.parse(record.completedAt) > now.getTime()) blockers.push(`test_time_invalid:${required.id}`);
      if (record.skipped) blockers.push(`required_test_skipped:${required.id}`);
      if (record.exitCode !== 0) blockers.push(`required_test_failed:${required.id}`);
      if (!validHash(record.stdoutHash) || !validHash(record.stderrHash)) blockers.push(`test_output_unverifiable:${required.id}`);
    }
    if (required.physicalEvidenceRequired && evidenceLedger.physicalForTest(required.id, input.finalCommit).length === 0) blockers.push(`physical_evidence_missing:${required.id}`);
  }
  const unique = [...new Set(blockers)].sort();
  const incomplete = unique.some((blocker) => /missing|unverifiable|skipped/u.test(blocker));
  return {
    status: unique.length === 0 ? "PASS" : incomplete ? "INCOMPLETE" : "FAIL",
    passed: unique.length === 0,
    blockers: unique,
    evaluatorWriteAllowed: false,
    ownerApprovalGranted: false,
    completionSupported: unique.length === 0,
  };
};

export const COGNITIVE_LEARNING_FIELDS = {
  source_reliability_score: { minimum: 0, maximum: 1 },
  tool_success_score: { minimum: 0, maximum: 1 },
  expected_duration_seconds: { minimum: 1, maximum: 14_400 },
  test_priority_weight: { minimum: 0, maximum: 10 },
  rollback_strategy_rank: { minimum: 0, maximum: 100 },
  model_routing_preference: { minimum: 0, maximum: 100 },
  retry_timing_seconds: { minimum: 1, maximum: 3_600 },
} as const;

export const validateLearningPatch = (patch: unknown): readonly string[] => {
  const blockers: string[] = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return ["learning_patch_invalid"];
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const rule = COGNITIVE_LEARNING_FIELDS[key as keyof typeof COGNITIVE_LEARNING_FIELDS];
    if (!rule) blockers.push(`learning_field_forbidden:${key}`);
    else if (!validFiniteNumber(value, rule.minimum, rule.maximum)) blockers.push(`learning_value_invalid:${key}`);
  }
  const sanitized = sanitizeCognitivePayload(patch);
  if (!sanitized.accepted || sanitized.categories.includes("untrusted_instruction")) blockers.push("learning_payload_rejected");
  return [...new Set(blockers)].sort();
};

export type CognitiveLease = {
  resourceKey: string;
  taskId: string;
  mode: "read" | "write";
  issuedAt: string;
  expiresAt: string;
  revoked: boolean;
};
export class CognitiveResourceLeaseRegistry {
  readonly leases = new Map<string, CognitiveLease[]>();
  acquire(lease: CognitiveLease, now = new Date()): boolean {
    if (Date.parse(lease.expiresAt) <= now.getTime() || lease.revoked) return false;
    const active = (this.leases.get(lease.resourceKey) ?? []).filter((item) => !item.revoked && Date.parse(item.expiresAt) > now.getTime());
    if (active.some((item) => item.taskId !== lease.taskId && (item.mode === "write" || lease.mode === "write"))) return false;
    this.leases.set(lease.resourceKey, [...active, { ...lease }]);
    return true;
  }
}

export type RollbackResult = {
  status: "rollback_succeeded" | "rollback_failed";
  taskStatus: "remediated" | "quarantined";
  capabilitiesRevoked: boolean;
  childTasksStopped: boolean;
  criticalFindingCreated: boolean;
  ownerReviewRequested: boolean;
};

export type CognitiveRollbackEvent = {
  taskId: string;
  eventType: "rollback_succeeded" | "rollback_failed" | "task_quarantined" | "critical_finding_created" | "owner_review_requested";
  at: string;
};

export class CognitiveRollbackCoordinator {
  readonly #capabilityLedger: CognitiveCapabilityLedger;
  readonly taskStates = new Map<string, "rollback_pending" | "remediated" | "quarantined">();
  readonly childTaskStates = new Map<string, "active" | "stopped">();
  readonly taskChildren = new Map<string, readonly string[]>();
  readonly criticalFindings = new Set<string>();
  readonly ownerReviewRequests = new Set<string>();
  readonly events: CognitiveRollbackEvent[] = [];

  constructor(capabilityLedger: CognitiveCapabilityLedger) {
    this.#capabilityLedger = capabilityLedger;
  }

  register(taskId: string, childTaskIds: readonly string[] = []): void {
    if (!validIdentifier(taskId) || childTaskIds.some((id) => !validIdentifier(id))) throw new Error("rollback_task_invalid");
    this.taskStates.set(taskId, "rollback_pending");
    this.taskChildren.set(taskId, [...new Set(childTaskIds)]);
    childTaskIds.forEach((id) => this.childTaskStates.set(id, "active"));
  }

  record(taskId: string, succeeded: boolean, at = new Date()): RollbackResult {
    if (this.taskStates.get(taskId) !== "rollback_pending" || !Number.isFinite(at.getTime())) throw new Error("rollback_state_invalid");
    if (succeeded) {
      this.taskStates.set(taskId, "remediated");
      this.events.push({ taskId, eventType: "rollback_succeeded", at: at.toISOString() });
      return {
        status: "rollback_succeeded",
        taskStatus: "remediated",
        capabilitiesRevoked: false,
        childTasksStopped: false,
        criticalFindingCreated: false,
        ownerReviewRequested: false,
      };
    }
    this.taskStates.set(taskId, "quarantined");
    this.events.push({ taskId, eventType: "rollback_failed", at: at.toISOString() });
    for (const capabilityId of this.#capabilityLedger.capabilityIdsForTask(taskId)) {
      this.#capabilityLedger.revoke(capabilityId, at);
    }
    for (const childId of this.taskChildren.get(taskId) ?? []) this.childTaskStates.set(childId, "stopped");
    this.criticalFindings.add(taskId);
    this.ownerReviewRequests.add(taskId);
    this.events.push(
      { taskId, eventType: "task_quarantined", at: at.toISOString() },
      { taskId, eventType: "critical_finding_created", at: at.toISOString() },
      { taskId, eventType: "owner_review_requested", at: at.toISOString() },
    );
    const capabilitiesRevoked = this.#capabilityLedger.capabilityIdsForTask(taskId)
      .every((capabilityId) => this.#capabilityLedger.capabilitySnapshot(capabilityId)?.status === "revoked");
    const childTasksStopped = (this.taskChildren.get(taskId) ?? [])
      .every((childId) => this.childTaskStates.get(childId) === "stopped");
    return {
      status: "rollback_failed",
      taskStatus: "quarantined",
      capabilitiesRevoked,
      childTasksStopped,
      criticalFindingCreated: this.criticalFindings.has(taskId),
      ownerReviewRequested: this.ownerReviewRequests.has(taskId),
    };
  }
}

export const COGNITIVE_OWNER_CONTROL_CENTER_FOUNDATION = {
  deploymentState: COGNITIVE_STATUS,
  sourceManifestOnly: false,
  sourceManifestFallback: true,
  liveReadbackCapable: true,
  boundedLevel01OwnerControls: false,
  readOnly: true,
  readOnlyForNonOwner: true,
  liveMemory: false,
  liveResearch: false,
  liveExecutor: false,
  liveEvaluator: false,
  scheduler: "none",
  modelCredentials: "none",
  toolCredentials: "none",
  productionAuthority: false,
  requiredReadPermission: "admin.cognitive.read",
  visibleSections: ["source manifest", "undeployed schema contract", "security blockers", "required human reviews"],
  disabledControls: ["pause", "stop", "deny", "approve exact scope", "reduce budget", "quarantine playbook", "emergency stop"],
  productionExecutionWired: false,
  disabledControlHandlerWired: false,
} as const;
