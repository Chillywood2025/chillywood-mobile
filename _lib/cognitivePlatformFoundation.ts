export type CognitivePlatform = "shared" | "ios" | "android" | "web";

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
  trustedForTools: false;
};

export type CognitiveResearchClaimInput = {
  claim: string;
  confidence: number;
  freshnessDeadline: string;
  consequential: boolean;
  technicalFact: boolean;
  sources: readonly CognitiveResearchSource[];
};

export type CognitiveResearchDecision = {
  accepted: boolean;
  reasons: readonly string[];
  contradictionState: "none" | "detected" | "unresolved";
  sourceIds: readonly string[];
  toolInvocationAllowed: false;
};

export type CognitiveExecutionAction =
  | "create_branch"
  | "edit_source"
  | "add_tests"
  | "run_local_validation"
  | "commit"
  | "push_branch"
  | "open_or_update_draft_pr"
  | "produce_migration_plan"
  | "produce_deployment_plan"
  | "generate_evidence";

export type CognitiveExecutionPlan = {
  taskId: string;
  branch: string;
  actions: readonly CognitiveExecutionAction[];
  paths: readonly string[];
  maxToolCalls: number;
  maxDurationSeconds: number;
  maxCostUsd: number;
  expiresAt: string;
  rollbackPlan: string;
  ownerApprovalId: string | null;
  executorApprovalId: string | null;
  requestedProductionDeployment: boolean;
  requestedMoneyMovement: boolean;
  requestedUserRightsChange: boolean;
};

export type CognitiveEvaluationInput = {
  objective: string;
  completionClaimed: boolean;
  testsPassed: boolean;
  hiddenTestFailures: number;
  physicalProofClaimed: boolean;
  physicalEvidenceCount: number;
  crossPlatformChecks: { ios: boolean; android: boolean; web: boolean };
  permissionExpansion: boolean;
  permissionExpansionApproved: boolean;
  rollbackPlan: string;
  secretExposureDetected: boolean;
  moneyMoved: boolean;
  userRightsChanged: boolean;
};

export type CognitiveEvaluation = {
  passed: boolean;
  blockers: readonly string[];
  evaluatorWriteAllowed: false;
  completionSupported: boolean;
};

export const COGNITIVE_ALLOWED_PATH_PREFIXES = [
  "_lib/",
  "app/",
  "components/",
  "config/",
  "docs/",
  "scripts/",
  "supabase/migrations/",
  "supabase/tests/",
  ".github/workflows/",
] as const;

export const COGNITIVE_FORBIDDEN_EXECUTION = [
  "merge",
  "force_push",
  "direct_main_write",
  "production_deploy",
  "store_release",
  "ota_publish_or_rollback",
  "money_movement",
  "auth_or_rls_mutation",
  "role_mutation",
  "moderation_enforcement",
  "provider_product_mutation",
] as const;

export const COGNITIVE_LEARNING_ALLOWED_FIELDS = [
  "playbook_confidence",
  "source_reliability",
  "tool_ordering",
  "expected_duration",
  "test_selection",
  "failure_pattern",
  "rollback_preference",
  "model_routing_preference",
] as const;

export const COGNITIVE_LEARNING_FORBIDDEN_FIELDS = [
  "forbidden_scope",
  "approval_level",
  "owner_authority",
  "money_policy",
  "public_release_policy",
  "auth_rls_policy",
  "legal_policy",
  "secret_policy",
] as const;

const PROMPT_INJECTION_PATTERNS = [
  /ignore (?:all|any|the) (?:previous|prior|system) instructions/iu,
  /reveal (?:the )?(?:secret|token|password|system prompt)/iu,
  /execute (?:this|the following) (?:command|tool)/iu,
  /disable (?:the )?(?:guard|safety|approval)/iu,
];

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk_live|sk_test|rk_live)_[A-Za-z0-9_-]{12,}\b/u,
  /\b(?:password|secret|service_role|refresh_token|access_token)\s*[:=]\s*\S+/iu,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
];

export const containsPromptInjection = (value: string): boolean =>
  PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));

export const containsSecretLikeValue = (value: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(value));

export const sanitizeCognitiveText = (value: string): string => {
  if (containsSecretLikeValue(value)) return "[REDACTED_SECRET_LIKE_VALUE]";
  return value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[REDACTED_EMAIL]").slice(0, 4_000);
};

export const evaluateResearchClaim = (
  input: CognitiveResearchClaimInput,
  now = new Date(),
): CognitiveResearchDecision => {
  const reasons: string[] = [];
  if (!input.claim.trim()) reasons.push("claim_missing");
  if (containsPromptInjection(input.claim)) reasons.push("prompt_injection_detected");
  if (containsSecretLikeValue(input.claim)) reasons.push("secret_like_content_detected");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) reasons.push("confidence_out_of_range");
  if (!input.sources.length) reasons.push("source_missing");
  if (input.technicalFact && !input.sources.some((source) => source.primary)) reasons.push("technical_fact_requires_primary_source");
  if (input.consequential && input.sources.filter((source) => source.sourceType === "news").length === 1) {
    reasons.push("consequential_news_requires_corroboration");
  }
  if (input.sources.some((source) => source.trustedForTools !== false)) reasons.push("web_source_must_remain_untrusted_for_tools");
  if (input.sources.some((source) => containsPromptInjection(`${source.reference}\n${source.publisher}`))) reasons.push("source_prompt_injection_detected");
  if (input.sources.some((source) => containsSecretLikeValue(`${source.reference}\n${source.publisher}`))) reasons.push("source_secret_like_content_detected");
  const freshness = Date.parse(input.freshnessDeadline);
  if (!Number.isFinite(freshness) || freshness < now.getTime()) reasons.push("claim_expired_refresh_required");
  return {
    accepted: reasons.length === 0,
    reasons,
    contradictionState: "none",
    sourceIds: [...new Set(input.sources.map((source) => source.id))].sort(),
    toolInvocationAllowed: false,
  };
};

export const validateCognitiveExecutionPlan = (
  plan: CognitiveExecutionPlan,
  now = new Date(),
): readonly string[] => {
  const blockers: string[] = [];
  if (!plan.taskId.trim()) blockers.push("task_id_required");
  if (!plan.branch.startsWith("codex/") || plan.branch === "main" || plan.branch === "master") blockers.push("branch_not_allowed");
  if (!plan.actions.length) blockers.push("actions_required");
  if (plan.paths.some((entry) => !COGNITIVE_ALLOWED_PATH_PREFIXES.some((prefix) => entry.startsWith(prefix)))) blockers.push("path_outside_allowlist");
  if (plan.maxToolCalls < 1 || plan.maxToolCalls > 100) blockers.push("tool_call_cap_invalid");
  if (plan.maxDurationSeconds < 1 || plan.maxDurationSeconds > 14_400) blockers.push("time_budget_invalid");
  if (plan.maxCostUsd < 0 || plan.maxCostUsd > 25) blockers.push("cost_budget_invalid");
  const expiry = Date.parse(plan.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) blockers.push("capability_expired");
  if (!plan.rollbackPlan.trim()) blockers.push("rollback_plan_required");
  if (plan.ownerApprovalId && plan.ownerApprovalId === plan.executorApprovalId) blockers.push("self_approval_forbidden");
  if (plan.requestedProductionDeployment) blockers.push("production_deployment_forbidden");
  if (plan.requestedMoneyMovement) blockers.push("money_movement_forbidden");
  if (plan.requestedUserRightsChange) blockers.push("user_rights_change_forbidden");
  return [...new Set(blockers)].sort();
};

export const evaluateCognitiveRun = (input: CognitiveEvaluationInput): CognitiveEvaluation => {
  const blockers: string[] = [];
  if (!input.testsPassed || input.hiddenTestFailures > 0) blockers.push("test_failure_detected");
  if (input.completionClaimed && (!input.testsPassed || input.hiddenTestFailures > 0)) blockers.push("unsupported_completion_claim");
  if (input.physicalProofClaimed && input.physicalEvidenceCount < 1) blockers.push("fabricated_physical_proof");
  if (!input.crossPlatformChecks.ios || !input.crossPlatformChecks.android || !input.crossPlatformChecks.web) blockers.push("cross_platform_regression_not_cleared");
  if (input.permissionExpansion && !input.permissionExpansionApproved) blockers.push("unsafe_permission_expansion");
  if (!input.rollbackPlan.trim()) blockers.push("rollback_missing");
  if (input.secretExposureDetected) blockers.push("secret_exposure_detected");
  if (input.moneyMoved) blockers.push("money_boundary_violated");
  if (input.userRightsChanged) blockers.push("user_rights_boundary_violated");
  return {
    passed: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    evaluatorWriteAllowed: false,
    completionSupported: input.completionClaimed ? blockers.length === 0 : true,
  };
};

export const validateLearningPatch = (patch: Readonly<Record<string, unknown>>): readonly string[] => {
  const allowed = new Set<string>(COGNITIVE_LEARNING_ALLOWED_FIELDS);
  return Object.keys(patch).filter((key) => !allowed.has(key)).sort();
};

export const COGNITIVE_OWNER_CONTROL_CENTER_FOUNDATION = {
  deploymentState: "source_complete_not_deployed",
  readOnly: true,
  visibleSections: [
    "intelligence tasks",
    "research evidence",
    "plans",
    "experiments",
    "budgets",
    "execution state",
    "evaluator result",
    "blockers",
    "rollback readiness",
    "approval requirements",
  ],
  disabledControls: [
    "pause",
    "stop",
    "deny",
    "approve exact scope",
    "reduce budget",
    "quarantine playbook",
    "emergency stop",
  ],
  productionExecutionWired: false,
} as const;
