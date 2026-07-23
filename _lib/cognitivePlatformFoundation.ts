export type CognitivePlatform = "shared" | "ios" | "android" | "web";
export type CognitiveEnvironment = "local" | "ci" | "preview";
export type CognitiveProvider =
  | "repository"
  | "github"
  | "supabase_local"
  | "research_mock"
  | "model_mock"
  | "none";

export const COGNITIVE_REPOSITORY = "Chillywood2025/chillywood-mobile" as const;
export const COGNITIVE_REMOTE = "origin" as const;
export const COGNITIVE_STATUS = "security_hardened_scaffold_not_deployed" as const;

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
const CREDENTIAL_FILE = /(?:^|\/)(?:\.env(?:\.|$)|credentials?\.json$|.*\.(?:jks|keystore|p8|p12|pem|key)$)/iu;

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
const validIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(value);
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

export type CognitiveCapabilityProofVerifier = (
  opaqueBearer: string,
  opaqueNonce: string,
  expectedBearerHash: string,
  expectedNonceHash: string,
) => boolean;

export const authorizeCapabilityUse = (
  capability: CognitiveCapability,
  use: CognitiveCapabilityUse,
  gate: CognitiveRuntimeGate,
  proofVerified = false,
): readonly string[] => {
  const blockers: string[] = [];
  const nowMs = gate.now.getTime();
  if (!validIdentifier(capability.capabilityId)) blockers.push("capability_id_invalid");
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
  if (!validIdentifier(use.callId)) blockers.push("call_id_invalid");
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
  readonly capabilities = new Map<string, CognitiveCapability>();
  readonly usedCallIds = new Set<string>();
  readonly events: CognitiveCapabilityEvent[] = [];

  readonly #verifyProof: CognitiveCapabilityProofVerifier;

  constructor(verifyProof: CognitiveCapabilityProofVerifier) {
    this.#verifyProof = verifyProof;
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
      this.capabilities.has(capability.capabilityId)
      || !validIdentifier(capability.capabilityId)
      || !validHash(capability.bearerHash)
      || !validHash(capability.nonceHash)
      || !validIdentifier(capability.taskId)
      || !validIdentifier(capability.projectId)
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
      || !validIdentifier(capability.approvalRequestId)
      || !validHash(capability.approvalScopeHash)
      || !validHash(capability.planSnapshotHash)
      || capability.status !== "active"
      || capability.revokedAt !== null
      || capability.consumedAt !== null
      || capability.nextUsageSequence !== 1
    ) throw new Error("capability_issue_rejected");
    this.capabilities.set(capability.capabilityId, { ...capability, pathScopes: [...capability.pathScopes] });
  }

  consume(capabilityId: string, use: CognitiveCapabilityUse, gate: CognitiveRuntimeGate): CognitiveCapabilityEvent {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) throw new Error("capability_missing");
    const proofVerified = this.#verifyProof(
      use.opaqueBearer,
      use.opaqueNonce,
      capability.bearerHash,
      capability.nonceHash,
    );
    const blockers = [...authorizeCapabilityUse(capability, use, gate, proofVerified)];
    if (this.usedCallIds.has(use.callId)) blockers.push("capability_replay");
    if (blockers.length) {
      const event = { capabilityId, callId: use.callId, usageSequence: capability.nextUsageSequence, event: "rejected" as const, reason: [...new Set(blockers)].sort().join(","), at: gate.now.toISOString() };
      this.events.push(event);
      return event;
    }
    this.usedCallIds.add(use.callId);
    capability.remainingCalls -= 1;
    capability.remainingBytes -= use.bytes;
    capability.remainingCost -= use.cost;
    capability.consumedAt = gate.now.toISOString();
    const sequence = capability.nextUsageSequence;
    capability.nextUsageSequence += 1;
    if (capability.remainingCalls === 0) capability.status = "exhausted";
    const event = { capabilityId, callId: use.callId, usageSequence: sequence, event: "consumed" as const, reason: null, at: gate.now.toISOString() };
    this.events.push(event);
    return event;
  }

  reauthorizeAcceptedCall(
    capabilityId: string,
    use: CognitiveCapabilityUse,
    gate: CognitiveRuntimeGate,
  ): readonly string[] {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) return ["capability_missing"];
    if (!this.usedCallIds.has(use.callId)) return ["capability_call_not_consumed"];
    const proofVerified = this.#verifyProof(
      use.opaqueBearer,
      use.opaqueNonce,
      capability.bearerHash,
      capability.nonceHash,
    );
    const originalStatus = capability.status;
    if (originalStatus === "exhausted" && capability.consumedAt) capability.status = "active";
    const blockers = authorizeCapabilityUse(capability, use, gate, proofVerified)
      .filter((blocker) => !["call_budget_exhausted", "byte_budget_exhausted", "cost_budget_exhausted"].includes(blocker));
    capability.status = originalStatus;
    return blockers;
  }

  revoke(capabilityId: string, at = new Date()): void {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) return;
    capability.status = "revoked";
    capability.revokedAt = at.toISOString();
    this.events.push({ capabilityId, callId: "lifecycle-revoke", usageSequence: capability.nextUsageSequence, event: "revoked", reason: "owner_or_system_revocation", at: at.toISOString() });
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
  data: unknown;
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
  hashSanitizedValue: (value: unknown) => string,
): CognitiveToolResultEnvelope => {
  if (
    !validIdentifier(value.toolId)
    || !validIdentifier(value.callId)
    || !validIdentifier(value.taskId)
    || !validIdentifier(value.source)
    || !["application/json", "text/plain"].includes(value.contentType)
    || !validTimestamp(value.timestamp)
    || value.timestamp !== new Date(value.timestamp).toISOString()
    || typeof value.truncated !== "boolean"
  ) throw new Error("tool_envelope_metadata_invalid");
  const sanitized = sanitizeCognitivePayload(value.data);
  const operationallySafe = sanitized.accepted && !sanitized.categories.includes("untrusted_instruction");
  const retained = operationallySafe ? sanitized.value : null;
  const dataHash = hashSanitizedValue({
    accepted: operationallySafe,
    categories: sanitized.categories,
    value: retained,
  });
  if (!validHash(dataHash)) throw new Error("tool_envelope_hash_invalid");
  return {
    toolId: value.toolId,
    callId: value.callId,
    taskId: value.taskId,
    source: value.source,
    contentType: value.contentType,
    dataHash,
    timestamp: value.timestamp,
    untrusted: true,
    truncated: value.truncated,
    sanitizationState: operationallySafe ? "sanitized" : "rejected",
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

export const parseStrictModelDocument = (raw: string): StrictModelDocument => {
  if (typeof raw !== "string" || raw.length > 32_000 || !raw.startsWith("{") || !raw.endsWith("}")) throw new Error("model_document_invalid");
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
  return record as StrictModelDocument;
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
  /\b(?:password|secret|service[_-]?role|refresh[_-]?token|access[_-]?token|authorization|cookie)\s*[:=]\s*\S+/iu,
  /\b(?:api[_-]?key|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|google[_-]?api[_-]?key)\s*[:=]\s*\S+/iu,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /https:\/\/[^/\s:@]+:[^/\s@]+@/iu,
  /https?:\/\/[^\s?]+\?[^\s]*(?:token|signature|sig|key|credential)=/iu,
];

export const containsPromptInjection = (value: string): boolean =>
  PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
export const containsSecretLikeValue = (value: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(value));

const maybeDecodeEncoded = (value: string): string[] => {
  const candidates = new Set<string>();
  let frontier = [value];
  for (let depth = 0; depth < 3; depth += 1) {
    const next: string[] = [];
    for (const candidate of frontier) {
      for (const match of candidate.matchAll(/\b[A-Za-z0-9+/]{16,}={0,2}\b/gu)) {
        try {
          const decoded = globalThis.atob(match[0]);
          if (/^[\x09\x0A\x0D\x20-\x7E]+$/u.test(decoded)) {
            const bounded = decoded.slice(0, 4_096);
            if (!candidates.has(bounded)) next.push(bounded);
            candidates.add(bounded);
          }
        } catch {
          // Invalid base64 remains ordinary untrusted text.
        }
      }
      for (const match of candidate.matchAll(/\b(?:[0-9a-fA-F]{2}){8,}\b/gu)) {
        let decoded = "";
        for (let index = 0; index < Math.min(match[0].length, 8_192); index += 2) decoded += String.fromCharCode(Number.parseInt(match[0].slice(index, index + 2), 16));
        if (/^[\x09\x0A\x0D\x20-\x7E]+$/u.test(decoded)) {
          if (!candidates.has(decoded)) next.push(decoded);
          candidates.add(decoded);
        }
      }
    }
    frontier = next;
  }
  return [...candidates];
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
      if (containsPromptInjection(bounded) || decoded.some(containsPromptInjection)) categories.add("untrusted_instruction");
      return bounded
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[REDACTED_EMAIL]")
        .replace(/\+?[0-9][0-9 ()-]{7,}[0-9]/gu, "[REDACTED_PHONE]");
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
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > limits.maxKeys) categories.add("maximum_object_keys_exceeded");
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, child] of entries.slice(0, limits.maxKeys)) {
      aggregatePieces.push(key.slice(0, 256));
      aggregateKeys.push(key.slice(0, 256));
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        categories.add("prototype_pollution_key");
        continue;
      }
      if (/(?:password|secret|token|authorization|cookie|private[_-]?key|service[_-]?role)/iu.test(key)) {
        categories.add("secret_key");
        output[key] = "[REDACTED_SECRET_LIKE_VALUE]";
      } else output[key] = walk(child, depth + 1);
    }
    return output;
  };
  const value = walk(input, 0);
  const aggregateCandidates = [
    aggregatePieces.join(""),
    aggregatePieces.join("="),
    aggregatePieces.join(":"),
    aggregateStringValues.join(""),
    aggregateStringValues.join("="),
    aggregateStringValues.join(":"),
    aggregateKeys.join(""),
    aggregateKeys.join("="),
    aggregateKeys.join(":"),
    ...aggregatePieces,
  ].flatMap((candidate) => [candidate, ...maybeDecodeEncoded(candidate)]);
  if (aggregateCandidates.some(containsSecretLikeValue)) categories.add("secret_like_value");
  if (aggregateCandidates.some(containsPromptInjection)) categories.add("untrusted_instruction");
  if (totalBytes > limits.maxBytes) categories.add("maximum_total_bytes_exceeded");
  const rejected = ["secret_like_value", "secret_key", "prototype_pollution_key", "maximum_depth_exceeded", "maximum_total_bytes_exceeded", "circular_reference"];
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
  const reasons: string[] = [];
  if (!input.claim.trim() || input.claim.length > 8_000) reasons.push("claim_invalid");
  const sanitizedClaim = sanitizeCognitivePayload(input.claim);
  if (!sanitizedClaim.accepted) reasons.push("claim_sensitive_content_rejected");
  if (sanitizedClaim.categories.includes("untrusted_instruction")) reasons.push("prompt_injection_detected");
  if (!validFiniteNumber(input.confidence, 0, 1)) reasons.push("confidence_out_of_range");
  if (!input.sources.length || input.sources.length > 12) reasons.push("source_count_invalid");
  const authoritativeTypes = ["official_documentation", "security_advisory", "platform_policy", "store_policy"];
  if (input.technicalFact && !input.sources.some((source) => source.primary && authoritativeTypes.includes(source.sourceType))) reasons.push("technical_fact_requires_primary_source");
  const newsSources = input.sources.filter((source) => source.sourceType === "news");
  const newsPublishers = new Set(newsSources.map((source) => source.publisher.trim().toLowerCase()));
  const newsCanonicalUrls = new Set(newsSources.map((source) => source.canonicalUrlHash));
  const newsContent = new Set(newsSources.map((source) => source.contentHash));
  if (input.consequential && (newsPublishers.size < 2 || newsCanonicalUrls.size < 2 || newsContent.size < 2)) reasons.push("consequential_news_requires_independent_corroboration");
  if (input.contradictionState === "detected" || input.contradictionState === "unresolved") reasons.push("contradiction_unresolved");
  const claimFreshness = Date.parse(input.freshnessDeadline);
  if (!Number.isFinite(claimFreshness) || claimFreshness <= now.getTime()) reasons.push("claim_expired_refresh_required");
  for (const source of input.sources) {
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
    if (!validHash(source.canonicalUrlHash) || !validHash(source.contentHash)) reasons.push("source_hash_invalid");
    if (!source.excerpt || source.excerpt.length > 2_000) reasons.push("source_excerpt_invalid");
    const publication = source.publicationDate === null ? Number.NaN : Date.parse(source.publicationDate);
    const retrieval = Date.parse(source.retrievalDate);
    const freshness = Date.parse(source.freshnessDeadline);
    if (!Number.isFinite(retrieval) || retrieval > now.getTime() || !Number.isFinite(freshness) || freshness <= now.getTime()) reasons.push("source_stale_or_invalid");
    if (source.publicationDate !== null && (!Number.isFinite(publication) || publication > retrieval)) reasons.push("source_publication_date_invalid");
    const sanitized = sanitizeCognitivePayload({ reference: source.reference, publisher: source.publisher, excerpt: source.excerpt });
    if (!sanitized.accepted) reasons.push("source_sensitive_content_rejected");
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
export const isPrivateOrReservedAddress = (address: string): boolean => {
  const value = address.toLowerCase().replace(/^\[|\]$/gu, "");
  if (value === "::" || value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("::ffff:")) return isPrivateOrReservedAddress(value.slice(7));
  return PRIVATE_IPV4.some((pattern) => pattern.test(value));
};

export const validateResearchUrl = (raw: string): readonly string[] => {
  const blockers: string[] = [];
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return ["url_invalid"];
  }
  if (url.protocol !== "https:") blockers.push("https_required");
  if (url.username || url.password) blockers.push("embedded_credentials_forbidden");
  if (url.port && url.port !== "443") blockers.push("port_not_allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateOrReservedAddress(hostname)) blockers.push("private_or_reserved_target");
  if (hostname === "metadata.google.internal" || hostname === "metadata" || hostname.endsWith(".internal")) blockers.push("metadata_or_internal_target");
  if (url.href.length > 2_048) blockers.push("url_too_long");
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

type CognitiveEvidenceHash = (value: unknown) => string;
type CognitiveEvidenceCredentialVerifier = (
  opaqueCredential: string,
  expectedCredentialHash: string,
) => boolean;

export class CognitiveTrustedEvidenceLedger {
  readonly #runnerCredentialHashes: Readonly<Record<string, string>>;
  readonly #collectorCredentialHashes: Readonly<Record<string, string>>;
  readonly #verifyCredential: CognitiveEvidenceCredentialVerifier;
  readonly #hash: CognitiveEvidenceHash;
  readonly #testRecords = new Map<string, Readonly<TrustedTestRecord>>();
  readonly #runRecords = new Map<string, Readonly<TrustedRunEvidence>>();
  readonly #physicalRecords = new Map<string, Readonly<TrustedPhysicalEvidence>>();

  constructor(input: {
    runnerCredentialHashes: Readonly<Record<string, string>>;
    collectorCredentialHashes: Readonly<Record<string, string>>;
    verifyCredential: CognitiveEvidenceCredentialVerifier;
    hash: CognitiveEvidenceHash;
  }) {
    const runnerEntries = Object.entries(input.runnerCredentialHashes);
    const collectorEntries = Object.entries(input.collectorCredentialHashes);
    if (
      !runnerEntries.length
      || runnerEntries.some(([id, hash]) => !validIdentifier(id) || !validHash(hash))
      || collectorEntries.some(([id, hash]) => !validIdentifier(id) || !validHash(hash))
    ) throw new Error("evidence_trust_configuration_invalid");
    this.#runnerCredentialHashes = Object.freeze({ ...input.runnerCredentialHashes });
    this.#collectorCredentialHashes = Object.freeze({ ...input.collectorCredentialHashes });
    this.#verifyCredential = input.verifyCredential;
    this.#hash = input.hash;
  }

  #runnerAuthorized(runnerId: string, credential: string): boolean {
    const expected = this.#runnerCredentialHashes[runnerId];
    return Boolean(expected) && this.#verifyCredential(credential, expected);
  }

  recordTest(record: TrustedTestRecord, opaqueRunnerCredential: string): void {
    if (
      this.#testRecords.has(record.recordId)
      || !this.#runnerAuthorized(record.runnerId, opaqueRunnerCredential)
      || !validIdentifier(record.recordId)
      || !validIdentifier(record.testId)
      || !validIdentifier(record.commandId)
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
      || !validIdentifier(record.recordId)
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
      || !this.#verifyCredential(opaqueCollectorCredential, expected)
      || !validIdentifier(record.recordId)
      || !validIdentifier(record.collectorId)
      || !validIdentifier(record.testId)
      || record.evidenceType !== "physical_device"
      || !/^[a-f0-9]{40}$/u.test(record.finalCommit)
      || !validHash(record.artifactHash)
      || !validTimestamp(record.observedAt)
      || record.observedAt !== new Date(record.observedAt).toISOString()
    ) throw new Error("trusted_physical_evidence_rejected");
    this.#physicalRecords.set(record.recordId, Object.freeze({ ...record }));
  }

  getTest(recordId: string): Readonly<TrustedTestRecord> | null {
    return this.#testRecords.get(recordId) ?? null;
  }

  getRun(recordId: string): Readonly<TrustedRunEvidence> | null {
    return this.#runRecords.get(recordId) ?? null;
  }

  physicalForTest(testId: string, finalCommit: string): readonly Readonly<TrustedPhysicalEvidence>[] {
    return [...this.#physicalRecords.values()].filter((record) => record.testId === testId && record.finalCommit === finalCommit);
  }

  manifestHash(runRecordId: string, testRecordIds: readonly string[]): string {
    const run = this.getRun(runRecordId);
    const tests = testRecordIds.map((recordId) => this.getTest(recordId));
    if (!run || tests.some((record) => record === null)) throw new Error("trusted_evidence_missing");
    const hash = this.#hash({
      run,
      tests: tests.sort((left, right) => String(left?.recordId).localeCompare(String(right?.recordId))),
    });
    if (!validHash(hash)) throw new Error("trusted_evidence_manifest_hash_invalid");
    return hash;
  }

  reader(): CognitiveTrustedEvidenceReader {
    return Object.freeze({
      getTest: (recordId: string) => this.getTest(recordId),
      getRun: (recordId: string) => this.getRun(recordId),
      physicalForTest: (testId: string, finalCommit: string) =>
        this.physicalForTest(testId, finalCommit),
      manifestHash: (runRecordId: string, testRecordIds: readonly string[]) =>
        this.manifestHash(runRecordId, testRecordIds),
    });
  }
}

export type CognitiveTrustedEvidenceReader = Readonly<{
  getTest: (recordId: string) => Readonly<TrustedTestRecord> | null;
  getRun: (recordId: string) => Readonly<TrustedRunEvidence> | null;
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
  requiredTests: readonly RequiredTest[];
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
  const records = new Map(
    input.testEvidenceRecordIds
      .map((recordId) => evidenceLedger.getTest(recordId))
      .filter((record): record is Readonly<TrustedTestRecord> => record !== null)
      .map((record) => [record.testId, record]),
  );
  for (const required of input.requiredTests) {
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
    for (const [capabilityId, capability] of this.#capabilityLedger.capabilities.entries()) {
      if (capability.taskId === taskId) this.#capabilityLedger.revoke(capabilityId, at);
    }
    for (const childId of this.taskChildren.get(taskId) ?? []) this.childTaskStates.set(childId, "stopped");
    this.criticalFindings.add(taskId);
    this.ownerReviewRequests.add(taskId);
    this.events.push(
      { taskId, eventType: "task_quarantined", at: at.toISOString() },
      { taskId, eventType: "critical_finding_created", at: at.toISOString() },
      { taskId, eventType: "owner_review_requested", at: at.toISOString() },
    );
    const capabilitiesRevoked = [...this.#capabilityLedger.capabilities.values()]
      .filter((capability) => capability.taskId === taskId)
      .every((capability) => capability.status === "revoked");
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
  sourceManifestOnly: true,
  readOnly: true,
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
