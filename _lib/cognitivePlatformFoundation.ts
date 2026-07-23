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

export type CognitiveInvocationSpec =
  | { kind: "internal"; action: CognitiveExecutionAction; paths: readonly string[] }
  | { kind: "process"; program: "git" | "npm" | "npx"; args: readonly string[]; shell: false }
  | { kind: "github_api"; action: "open_draft_pr" | "update_draft_pr_body"; repository: typeof COGNITIVE_REPOSITORY };

const ALLOWLISTED_TEST_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  lint: ["npm", "run", "lint"],
  typescript: ["npx", "tsc", "--noEmit"],
  cognitive_red_team: ["npm", "run", "test:cognitive-red-team"],
  route_contracts: ["npm", "run", "guard:route-contracts"],
};

export const buildClosedActionInvocation = (
  request: CognitiveActionRequest,
): CognitiveInvocationSpec => {
  const blockers = validateActionRequest(request);
  if (blockers.length) throw new Error(blockers.join(","));
  if (["repository_read_file", "repository_list_files", "repository_search", "repository_apply_patch", "repository_write_new_file"].includes(request.action)) {
    if (request.argv.length) throw new Error("repository_action_argv_forbidden");
    return { kind: "internal", action: request.action, paths: [...request.paths] };
  }
  if (request.action === "test_run_allowlisted") {
    const command = request.argv.length === 1 ? ALLOWLISTED_TEST_COMMANDS[request.argv[0]] : null;
    if (!command) throw new Error("test_command_not_allowlisted");
    return { kind: "process", program: command[0] as "npm" | "npx", args: command.slice(1), shell: false };
  }
  if (request.action === "git_create_scoped_branch") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "process", program: "git", args: ["switch", "-c", request.branch], shell: false };
  }
  if (request.action === "git_stage_allowlisted_paths") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "process", program: "git", args: ["add", "--", ...request.paths], shell: false };
  }
  if (request.action === "git_commit_scoped") {
    if (request.argv.length !== 1 || request.argv[0].length < 3 || request.argv[0].length > 120) throw new Error("commit_message_invalid");
    return { kind: "process", program: "git", args: ["commit", "-m", request.argv[0]], shell: false };
  }
  if (request.action === "git_push_scoped_draft_branch") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "process", program: "git", args: ["push", COGNITIVE_REMOTE, `${request.branch}:${request.branch}`], shell: false };
  }
  if (request.action === "github_open_draft_pr") return { kind: "github_api", action: "open_draft_pr", repository: COGNITIVE_REPOSITORY };
  if (request.action === "github_update_draft_pr_body") return { kind: "github_api", action: "update_draft_pr_body", repository: COGNITIVE_REPOSITORY };
  throw new Error("action_not_implemented");
};

export type CognitiveCapability = {
  capabilityId: string;
  bearerHash: string;
  nonce: string;
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

export const authorizeCapabilityUse = (
  capability: CognitiveCapability,
  use: CognitiveCapabilityUse,
  gate: CognitiveRuntimeGate,
): readonly string[] => {
  const blockers: string[] = [];
  const nowMs = gate.now.getTime();
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

  issue(capability: CognitiveCapability): void {
    if (this.capabilities.has(capability.capabilityId) || !validHash(capability.bearerHash)) throw new Error("capability_issue_rejected");
    if (capability.maximumCalls < 1 || capability.remainingCalls !== capability.maximumCalls) throw new Error("capability_call_budget_invalid");
    this.capabilities.set(capability.capabilityId, { ...capability, pathScopes: [...capability.pathScopes] });
  }

  consume(capabilityId: string, use: CognitiveCapabilityUse, gate: CognitiveRuntimeGate): CognitiveCapabilityEvent {
    const capability = this.capabilities.get(capabilityId);
    if (!capability) throw new Error("capability_missing");
    const blockers = [...authorizeCapabilityUse(capability, use, gate)];
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

export class CognitiveBudgetLedger {
  readonly limits: Readonly<CognitiveBudgetLimits>;
  readonly consumed: CognitiveBudgetLimits;
  readonly reservations = new Map<string, Partial<CognitiveBudgetLimits>>();

  constructor(limits: CognitiveBudgetLimits) {
    for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("budget_limit_invalid");
    this.limits = Object.freeze({ ...limits });
    this.consumed = { modelTokens: 0, modelCost: 0, toolCalls: 0, toolBytes: 0, elapsedMs: 0, childTasks: 0, recursionDepth: 0, concurrentCalls: 0, retries: 0 };
  }

  reserve(reservationId: string, requested: Partial<CognitiveBudgetLimits>, cancelled = false): boolean {
    if (cancelled || this.reservations.has(reservationId)) return false;
    for (const [key, raw] of Object.entries(requested) as [keyof CognitiveBudgetLimits, number][]) {
      if (!Number.isSafeInteger(raw) || raw < 0 || this.consumed[key] + raw > this.limits[key]) return false;
    }
    for (const [key, raw] of Object.entries(requested) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] += raw;
    this.reservations.set(reservationId, { ...requested });
    return true;
  }

  settle(reservationId: string, actual: Partial<CognitiveBudgetLimits>): boolean {
    const reserved = this.reservations.get(reservationId);
    if (!reserved) return false;
    for (const [key, raw] of Object.entries(actual) as [keyof CognitiveBudgetLimits, number][]) {
      const prior = reserved[key] ?? 0;
      if (!Number.isSafeInteger(raw) || raw < 0 || this.consumed[key] - prior + raw > this.limits[key]) return false;
    }
    for (const [key, prior] of Object.entries(reserved) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] -= prior;
    for (const [key, raw] of Object.entries(actual) as [keyof CognitiveBudgetLimits, number][]) this.consumed[key] += raw;
    this.reservations.delete(reservationId);
    return true;
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
  value: Omit<CognitiveToolResultEnvelope, "untrusted">,
): CognitiveToolResultEnvelope => ({ ...value, untrusted: true });

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
];
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/u,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/u,
  /\b(?:ghp|github_pat|xox[baprs]|AIza)[A-Za-z0-9_-]{12,}\b/u,
  /\b(?:password|secret|service[_-]?role|refresh[_-]?token|access[_-]?token|authorization|cookie)\s*[:=]\s*\S+/iu,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /https:\/\/[^/\s:@]+:[^/\s@]+@/iu,
  /https?:\/\/[^\s?]+\?[^\s]*(?:token|signature|sig|key|credential)=/iu,
];

export const containsPromptInjection = (value: string): boolean =>
  PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
export const containsSecretLikeValue = (value: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(value));

const maybeDecodeEncoded = (value: string): string[] => {
  const candidates: string[] = [];
  for (const match of value.matchAll(/\b[A-Za-z0-9+/]{20,}={0,2}\b/gu)) {
    try {
      const decoded = globalThis.atob(match[0]);
      if (/^[\x09\x0A\x0D\x20-\x7E]+$/u.test(decoded)) candidates.push(decoded.slice(0, 4_096));
    } catch {
      // Invalid base64 remains ordinary untrusted text.
    }
  }
  for (const match of value.matchAll(/\b(?:[0-9a-fA-F]{2}){10,}\b/gu)) {
    let decoded = "";
    for (let index = 0; index < Math.min(match[0].length, 8_192); index += 2) decoded += String.fromCharCode(Number.parseInt(match[0].slice(index, index + 2), 16));
    if (/^[\x09\x0A\x0D\x20-\x7E]+$/u.test(decoded)) candidates.push(decoded);
  }
  return candidates;
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
  if (input.technicalFact && !input.sources.some((source) => source.primary && ["official_documentation", "security_advisory", "platform_policy", "store_policy"].includes(source.sourceType))) reasons.push("technical_fact_requires_primary_source");
  const newsPublishers = new Set(input.sources.filter((source) => source.sourceType === "news").map((source) => source.publisher.trim().toLowerCase()));
  if (input.consequential && newsPublishers.size < 2) reasons.push("consequential_news_requires_independent_corroboration");
  if (input.contradictionState === "detected" || input.contradictionState === "unresolved") reasons.push("contradiction_unresolved");
  const claimFreshness = Date.parse(input.freshnessDeadline);
  if (!Number.isFinite(claimFreshness) || claimFreshness <= now.getTime()) reasons.push("claim_expired_refresh_required");
  for (const source of input.sources) {
    if (source.trustedForTools !== false) reasons.push("source_must_remain_untrusted");
    if (!validHash(source.canonicalUrlHash) || !validHash(source.contentHash)) reasons.push("source_hash_invalid");
    if (!source.excerpt || source.excerpt.length > 2_000) reasons.push("source_excerpt_invalid");
    const publication = source.publicationDate === null ? Number.NaN : Date.parse(source.publicationDate);
    const retrieval = Date.parse(source.retrievalDate);
    const freshness = Date.parse(source.freshnessDeadline);
    if (!Number.isFinite(retrieval) || !Number.isFinite(freshness) || freshness <= now.getTime()) reasons.push("source_stale_or_invalid");
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
  testId: string;
  commandId: string;
  commit: string;
  exitCode: number;
  stdoutHash: string;
  stderrHash: string;
  skipped: boolean;
  trustedRunner: boolean;
  completedAt: string;
};
export type CognitiveEvaluationInput = {
  evaluatorIdentity: string;
  executorIdentity: string;
  objectiveHash: string;
  planSnapshotHash: string;
  runEvidenceManifestHash: string;
  finalCommit: string;
  requiredTests: readonly RequiredTest[];
  trustedTestRecords: readonly TrustedTestRecord[];
  diffHash: string;
  rollbackPlanHash: string;
  physicalEvidenceTypes: readonly string[];
  permissionExpansion: boolean;
  moneyMoved: boolean;
  userRightsChanged: boolean;
  productionActionExecuted: boolean;
};
export type CognitiveEvaluation = {
  status: "PASS" | "FAIL" | "INCOMPLETE" | "BLOCKED";
  passed: boolean;
  blockers: readonly string[];
  evaluatorWriteAllowed: false;
  ownerApprovalGranted: false;
  completionSupported: boolean;
};

export const evaluateCognitiveRun = (input: CognitiveEvaluationInput): CognitiveEvaluation => {
  const blockers: string[] = [];
  if (!validIdentifier(input.evaluatorIdentity) || input.evaluatorIdentity === input.executorIdentity) blockers.push("evaluator_identity_not_independent");
  for (const hash of [input.objectiveHash, input.planSnapshotHash, input.runEvidenceManifestHash, input.diffHash, input.rollbackPlanHash]) if (!validHash(hash)) blockers.push("trusted_evidence_hash_invalid");
  const records = new Map(input.trustedTestRecords.map((record) => [record.testId, record]));
  for (const required of input.requiredTests) {
    const record = records.get(required.id);
    if (!record) blockers.push(`required_test_missing:${required.id}`);
    else {
      if (!record.trustedRunner) blockers.push(`test_runner_untrusted:${required.id}`);
      if (record.commandId !== required.commandId) blockers.push(`test_command_mismatch:${required.id}`);
      if (record.commit !== input.finalCommit || record.commit !== required.finalCommit) blockers.push(`test_wrong_commit:${required.id}`);
      if (record.skipped) blockers.push(`required_test_skipped:${required.id}`);
      if (record.exitCode !== 0) blockers.push(`required_test_failed:${required.id}`);
      if (!validHash(record.stdoutHash) || !validHash(record.stderrHash)) blockers.push(`test_output_unverifiable:${required.id}`);
    }
    if (required.physicalEvidenceRequired && !input.physicalEvidenceTypes.includes(`physical:${required.id}`)) blockers.push(`physical_evidence_missing:${required.id}`);
  }
  if (input.permissionExpansion) blockers.push("permission_expansion_requires_owner_review");
  if (input.moneyMoved) blockers.push("money_boundary_violated");
  if (input.userRightsChanged) blockers.push("user_rights_boundary_violated");
  if (input.productionActionExecuted) blockers.push("production_action_boundary_violated");
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
export const handleRollbackResult = (succeeded: boolean): RollbackResult => succeeded
  ? { status: "rollback_succeeded", taskStatus: "remediated", capabilitiesRevoked: true, childTasksStopped: true, criticalFindingCreated: false, ownerReviewRequested: false }
  : { status: "rollback_failed", taskStatus: "quarantined", capabilitiesRevoked: true, childTasksStopped: true, criticalFindingCreated: true, ownerReviewRequested: true };

export const executeAbortableTool = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<{ accepted: boolean; result: T | null; status: "completed" | "cancelled" }> => {
  if (signal.aborted) return { accepted: false, result: null, status: "cancelled" };
  const result = await operation(signal);
  if (signal.aborted) return { accepted: false, result: null, status: "cancelled" };
  return { accepted: true, result, status: "completed" };
};

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
