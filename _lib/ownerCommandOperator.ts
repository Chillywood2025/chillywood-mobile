import type { AutonomousApprovalLevel, AutonomousPlatform, AutonomousSystemId } from "./autonomousSystemsRegistry";

export type OwnerCommandTargetSystemId = Exclude<AutonomousSystemId, "owner_command_operator">;

export type OwnerCommandStatus =
  | "received"
  | "classified"
  | "needs_clarification"
  | "planned"
  | "preflight_pending"
  | "preflight_passed"
  | "approval_required"
  | "approved"
  | "executing"
  | "executed"
  | "blocked"
  | "failed"
  | "cancelled"
  | "denied"
  | "superseded";

export type OwnerCommandRiskLevel = AutonomousApprovalLevel;

export type OwnerCommandIntent =
  | "media_operations"
  | "livekit_operations"
  | "money_provider_operations"
  | "notification_delivery"
  | "release_ota_operations"
  | "security_owner_authority"
  | "moderation_safety"
  | "observability_runtime"
  | "installed_product_qa"
  | "platform_recovery"
  | "privacy_compliance"
  | "support_success"
  | "search_ranking_integrity"
  | "product_intelligence"
  | "ads_sponsor_delivery"
  | "multi_system"
  | "unknown";

export type OwnerCommandClassification = {
  platformScope: AutonomousPlatform;
  normalizedIntent: OwnerCommandIntent;
  riskLevel: OwnerCommandRiskLevel;
  approvalRequired: boolean;
  externalConfirmationRequired: boolean;
  targetSystems: OwnerCommandTargetSystemId[];
  blockers: string[];
  reason: string;
};

export type OwnerCommandExecutionStep = {
  stepIndex: number;
  targetSystem: OwnerCommandTargetSystemId;
  actionId: string;
  approvalLevel: OwnerCommandRiskLevel;
  status: OwnerCommandStatus;
  preflightPlan: string[];
  allowedScope: string[];
  forbiddenScope: string[];
  proofPlan: string[];
  rollbackPlan: string[];
};

export type OwnerCommandExecutionPlan = {
  status: OwnerCommandStatus;
  commandText: string;
  platformScope: AutonomousPlatform;
  normalizedIntent: OwnerCommandIntent;
  approvalLevel: OwnerCommandRiskLevel;
  targetSystems: OwnerCommandTargetSystemId[];
  allowedScope: string[];
  forbiddenScope: string[];
  preflightPlan: string[];
  executionPlan: OwnerCommandExecutionStep[];
  rollbackPlan: string[];
  proofPlan: string[];
  validationPlan: string[];
  approvalRequired: boolean;
  externalConfirmationRequired: boolean;
  blockers: string[];
};

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const ACTIVE_SYSTEMS: readonly OwnerCommandTargetSystemId[] = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
  "installed_product_qa_operator",
  "platform_recovery_operator",
  "privacy_compliance_operator",
  "support_success_operator",
  "search_ranking_integrity_operator",
  "product_intelligence_operator",
  "ads_sponsor_delivery_operator",
];

const SYSTEM_KEYWORDS: Record<OwnerCommandTargetSystemId, readonly string[]> = {
  media_automation: [
    "media",
    "r2",
    "hls",
    "transcode",
    "rendition",
    "video",
    "storage",
    "cdn",
    "scan",
    "quarantine",
  ],
  livekit_operator: [
    "livekit",
    "live room",
    "watch party",
    "party room",
    "heartbeat",
    "token",
    "router",
    "camera",
  ],
  money_flow_control: [
    "money",
    "revenuecat",
    "google play",
    "stripe",
    "billing",
    "payout",
    "cashout",
    "ledger",
    "premium",
    "webhook",
    "provider",
    "storekit",
    "iap",
    "in-app purchase",
    "app store purchase",
    "apple subscription",
    "restore purchases",
    "revenuecat apple",
    "tip tier",
    "seat pass",
    "refund",
    "revocation",
  ],
  notification_delivery_operator: [
    "notification",
    "push",
    "expo",
    "device token",
    "delivery",
    "alert",
    "apns",
    "pushkit",
    "callkit",
    "voip",
    "native incoming call",
    "terminal call cleanup",
  ],
  release_ota_operator: [
    "release",
    "ota",
    "eas",
    "updateid",
    "runtime",
    "channel",
    "rollback",
    "publish",
    "play store",
    "app store",
  ],
  security_owner_operator: [
    "security",
    "owner",
    "super_admin",
    "super admin",
    "admin",
    "rls",
    "auth",
    "secret scan",
    "rachi",
    "approval",
    "ios signing",
    "apple certificate",
    "provisioning profile",
    "apns key",
    "app store connect key",
  ],
  moderation_safety_operator: [
    "moderation",
    "safety",
    "user report",
    "safety report",
    "ban",
    "suspend",
    "restrict",
    "delete content",
    "case",
    "fraud hold",
  ],
  observability_runtime_operator: [
    "observability",
    "crash",
    "crashlytics",
    "analytics",
    "performance",
    "anr",
    "runtime health",
    "error rate",
    "backend error",
  ],
  installed_product_qa_operator: [
    "installed qa",
    "installed product qa",
    "installed traversal",
    "device lab",
    "browserstack",
    "route marker",
    "chat-inbox-screen",
    "creator-monetization-setup",
    "premium active account",
    "proof account",
    "two-device proof",
    "installed proof",
    "report cluster route bug",
    "user report route marker",
    "testflight",
    "ios simulator",
    "internal ios build",
    "iphone",
    "ipad",
    "build number",
    "ios-qa",
  ],
  platform_recovery_operator: [
    "platform recovery",
    "backup",
    "restore drill",
    "migration drift",
    "function deployment",
    "timer health",
    "recovery readiness",
  ],
  privacy_compliance_operator: [
    "privacy",
    "data export",
    "account deletion",
    "legal hold",
    "retention",
    "pii",
    "data rights",
  ],
  support_success_operator: [
    "support",
    "ticket",
    "refund request",
    "account help",
    "support draft",
    "support escalation",
    "user report router",
    "report cluster",
    "three unique reporters",
    "threshold routing",
  ],
  search_ranking_integrity_operator: [
    "search",
    "ranking",
    "recommendation",
    "visibility",
    "discovery",
    "index freshness",
    "shadowban",
  ],
  product_intelligence_operator: [
    "product intelligence",
    "cognitive platform",
    "research broker",
    "architecture graph",
    "experiment plan",
    "independent evaluator",
    "model budget",
  ],
  ads_sponsor_delivery_operator: [
    "ads",
    "ad provider",
    "sponsor",
    "sponsor checkout",
    "brand safety",
    "ad revenue",
  ],
};

const LEVEL_FOUR_PATTERNS = [
  /move\s+money/i,
  /charge\s+(customer|card|user)/i,
  /create\s+(payout|transfer|cashout|invoice|payment link|checkout)/i,
  /release\s+payout/i,
  /mark\s+payout\s+paid/i,
  /publish\s+(production\s+)?ota/i,
  /rollback\s+(production\s+)?ota/i,
  /public\s+release/i,
  /expose\s+(private|premium|original)/i,
];

const LEVEL_THREE_PATTERNS = [
  /change\s+(auth|rls|owner|super_admin|super admin)/i,
  /(assign|revoke|grant)\s+(owner|super_admin|super admin)/i,
  /(ban|suspend|restrict)\s+user/i,
  /delete\s+content/i,
  /remote\s+config/i,
  /feature\s+flag/i,
  /provider\s+(dashboard|config|product|secret|credential)/i,
  /broad\s+(media|push|notification|backfill|campaign)/i,
  /manual\s+premium/i,
  /bypass\s+premium/i,
  /rotate\s+secret/i,
];

const ADS_SPONSOR_ACTIVATION_PATTERNS = [
  /turn\s+on\s+(ads?|sponsors?)/i,
  /enable\s+(ads?|sponsors?)/i,
  /activate\s+(ads?|sponsors?)/i,
  /launch\s+(ads?|sponsors?)/i,
  /serve\s+ads?/i,
  /sponsor\s+checkout/i,
  /ad\s+revenue/i,
  /sponsor\s+payout/i,
  /ad\s+impressions?/i,
];

const SAFE_WRITE_PATTERNS = [
  /record\s+(finding|status|health|review)/i,
  /mark\s+requires[_\s-]?review/i,
  /sync\s+status/i,
  /cleanup\s+revoked\s+token/i,
  /device(?:\s|-)?not(?:\s|-)?registered/i,
];

const READ_ONLY_PATTERNS = [
  /status/i,
  /report/i,
  /health/i,
  /diagnos/i,
  /readback/i,
  /check/i,
  /show/i,
  /summar/i,
  /audit/i,
];

const DEFAULT_FORBIDDEN_SCOPE = [
  "approval bypass",
  "fresh preflight bypass",
  "emergency-stop bypass",
  "secret/token output",
  "broad DB mutation",
  "scope expansion beyond command plan",
];

const SYSTEM_FORBIDDEN_SCOPE: Record<OwnerCommandTargetSystemId, readonly string[]> = {
  media_automation: [
    "private/Premium/original exposure",
    "unapproved broad media processing",
    "R2/media playback behavior changes",
  ],
  livekit_operator: [
    "LiveKit routing policy change",
    "fake heartbeat",
    "participant token output",
  ],
  money_flow_control: [
    "money movement",
    "manual Premium grant",
    "provider product/mode mutation",
  ],
  notification_delivery_operator: [
    "notification preference bypass",
    "broad push campaign",
    "push credential output",
  ],
  release_ota_operator: [
    "unapproved OTA publish",
    "unapproved OTA rollback",
    "fake installed proof",
  ],
  security_owner_operator: [
    "auth/RLS mutation without approval",
    "owner role mutation without approval",
    "Rachi/operator self-approval",
  ],
  moderation_safety_operator: [
    "unapproved ban/suspend/restrict",
    "unapproved content deletion",
    "hidden enforcement",
  ],
  observability_runtime_operator: [
    "crash evidence deletion",
    "crash reporting silence",
    "Remote Config mutation without approval",
  ],
  installed_product_qa_operator: [
    "fake installed proof",
    "manual Premium grant",
    "sideload/install/clear data",
    "two-device closure without two devices",
  ],
  platform_recovery_operator: [
    "production restore without approval",
    "destructive DB mutation",
    "secret rotation without approval",
    "fake backup/restore success",
  ],
  privacy_compliance_operator: [
    "hidden deletion",
    "raw private data export",
    "legal hold bypass",
    "PII/secret exposure",
  ],
  support_success_operator: [
    "refund execution",
    "manual Premium grant",
    "auth credential reset",
    "external legal/payment commitment",
  ],
  search_ranking_integrity_operator: [
    "hidden shadowban",
    "secret demotion/boost",
    "ranking algorithm mutation",
    "moderation enforcement",
  ],
  product_intelligence_operator: [
    "production cognitive deployment",
    "self approval",
    "unrestricted model credential",
    "direct money, rights, auth/RLS, moderation, release, or provider mutation",
  ],
  ads_sponsor_delivery_operator: [
    "serving ads",
    "sponsor checkout",
    "ad revenue claim",
    "provider/billing mutation",
  ],
};

const normalizeCommandText = (commandText: unknown) => String(commandText ?? "").trim().replace(/\s+/g, " ");

const includesSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_KEY_PATTERN.test(value) || LONG_SECRET_LIKE_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(includesSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, entry]) => SECRET_KEY_PATTERN.test(key) || includesSecretLikeValue(entry));
  }
  return false;
};

const redactText = (value: unknown) => String(value ?? "")
  .replace(LONG_SECRET_LIKE_PATTERN, "[redacted]")
  .slice(0, 4000);

export const sanitizeOwnerCommandProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeOwnerCommandProof(entry));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => !SECRET_KEY_PATTERN.test(key) && !includesSecretLikeValue(entry))
      .map(([key, entry]) => [key, sanitizeOwnerCommandProof(entry)]),
  );
};

const commandMatches = (text: string, patterns: readonly RegExp[]) => patterns.some((pattern) => pattern.test(text));

export const classifyOwnerCommandPlatform = (commandText: string): AutonomousPlatform => {
  const text = normalizeCommandText(commandText).toLowerCase();
  const matches = [
    /\b(ios|iphone|ipad|testflight|app store|apns|pushkit|callkit|storekit)\b/.test(text) ? "ios" : null,
    /\b(android|google play|play store|play billing|fcm|apk|aab|firebase test lab)\b/.test(text) ? "android" : null,
    /\b(web|browser|pwa|website)\b/.test(text) ? "web" : null,
  ].filter(Boolean) as AutonomousPlatform[];
  if (matches.length > 1) return "unknown";
  if (matches[0]) return matches[0];
  return "shared";
};

export const mapOwnerCommandToAutonomousSystems = (commandText: string): OwnerCommandTargetSystemId[] => {
  const text = normalizeCommandText(commandText).toLowerCase();
  const systems = ACTIVE_SYSTEMS.filter((systemId) => SYSTEM_KEYWORDS[systemId].some((keyword) => text.includes(keyword)));
  return systems.length ? systems : [];
};

export const classifyOwnerCommandIntent = (commandText: string): OwnerCommandIntent => {
  const systems = mapOwnerCommandToAutonomousSystems(commandText);
  if (systems.length > 1) return "multi_system";
  const systemId = systems[0];
  if (!systemId) return "unknown";
  if (systemId === "media_automation") return "media_operations";
  if (systemId === "livekit_operator") return "livekit_operations";
  if (systemId === "money_flow_control") return "money_provider_operations";
  if (systemId === "notification_delivery_operator") return "notification_delivery";
  if (systemId === "release_ota_operator") return "release_ota_operations";
  if (systemId === "security_owner_operator") return "security_owner_authority";
  if (systemId === "moderation_safety_operator") return "moderation_safety";
  if (systemId === "observability_runtime_operator") return "observability_runtime";
  if (systemId === "installed_product_qa_operator") return "installed_product_qa";
  if (systemId === "platform_recovery_operator") return "platform_recovery";
  if (systemId === "privacy_compliance_operator") return "privacy_compliance";
  if (systemId === "support_success_operator") return "support_success";
  if (systemId === "search_ranking_integrity_operator") return "search_ranking_integrity";
  if (systemId === "product_intelligence_operator") return "product_intelligence";
  if (systemId === "ads_sponsor_delivery_operator") return "ads_sponsor_delivery";
  return "unknown";
};

export const classifyOwnerCommandRisk = (commandText: string): OwnerCommandRiskLevel => {
  const text = normalizeCommandText(commandText);
  if (!text) return 3;
  const mappedSystems = mapOwnerCommandToAutonomousSystems(text);
  if (mappedSystems.includes("ads_sponsor_delivery_operator") && commandMatches(text, ADS_SPONSOR_ACTIVATION_PATTERNS)) return 4;
  if (commandMatches(text, LEVEL_FOUR_PATTERNS)) return 4;
  if (commandMatches(text, LEVEL_THREE_PATTERNS)) return 3;
  if (commandMatches(text, SAFE_WRITE_PATTERNS)) return 2;
  if (commandMatches(text, READ_ONLY_PATTERNS)) return 1;
  return mappedSystems.length ? 2 : 3;
};

export const classifyOwnerCommand = (commandText: string): OwnerCommandClassification => {
  const normalized = normalizeCommandText(commandText);
  const targetSystems = mapOwnerCommandToAutonomousSystems(normalized);
  const riskLevel = classifyOwnerCommandRisk(normalized);
  const blockers: string[] = [];

  if (!normalized) blockers.push("command_text_required");
  if (includesSecretLikeValue(normalized)) blockers.push("secret_like_command_payload_blocked");
  if (!targetSystems.length) blockers.push("target_system_not_identified");
  if (classifyOwnerCommandPlatform(normalized) === "unknown") blockers.push("multiple_platform_scopes_require_separate_approval_requests");

  return {
    platformScope: classifyOwnerCommandPlatform(normalized),
    normalizedIntent: classifyOwnerCommandIntent(normalized),
    riskLevel,
    approvalRequired: riskLevel >= 3,
    externalConfirmationRequired: riskLevel === 4,
    targetSystems,
    blockers,
    reason: riskLevel >= 3
      ? "High-risk owner judgment must become an approval request before execution."
      : "Command maps to safe scoped report/write work inside existing autonomous system boundaries.",
  };
};

const buildActionId = (systemId: OwnerCommandTargetSystemId, riskLevel: OwnerCommandRiskLevel) => {
  if (riskLevel >= 3) return "owner_command_approval_required";
  if (riskLevel === 2) return "owner_command_scoped_safe_write";
  return "owner_command_report";
};

export const validateOwnerCommandScope = (input: {
  commandText: string;
  targetSystems: readonly OwnerCommandTargetSystemId[];
  approvalLevel: OwnerCommandRiskLevel;
}) => {
  const failures: string[] = [];
  if (includesSecretLikeValue(input.commandText)) failures.push("secret_like_command_payload_blocked");
  if (!input.targetSystems.length) failures.push("target_system_required");
  if (input.targetSystems.some((systemId) => !ACTIVE_SYSTEMS.includes(systemId))) failures.push("unknown_target_system");
  if (input.approvalLevel < 3 && commandMatches(input.commandText, [...LEVEL_THREE_PATTERNS, ...LEVEL_FOUR_PATTERNS])) {
    failures.push("high_risk_command_cannot_be_low_risk");
  }
  return { ok: failures.length === 0, failures };
};

export const buildOwnerCommandExecutionPlan = (commandText: string): OwnerCommandExecutionPlan => {
  const command = normalizeCommandText(commandText);
  const classification = classifyOwnerCommand(command);
  const targetSystems = classification.targetSystems;
  const allowedScope = targetSystems.map((systemId) => `${systemId}:route_via_existing_operator_scope`);
  const forbiddenScope = [...DEFAULT_FORBIDDEN_SCOPE, ...targetSystems.flatMap((systemId) => SYSTEM_FORBIDDEN_SCOPE[systemId])];
  const commonPreflight = [
    "verify command owner/super_admin authority",
    "verify target system registry entry",
    "verify emergency state is active",
    "verify fresh preflight for each target operator",
    "verify exact scope match",
  ];

  return {
    status: classification.blockers.length ? "blocked" : classification.approvalRequired ? "approval_required" : "planned",
    commandText: redactText(command),
    platformScope: classification.platformScope,
    normalizedIntent: classification.normalizedIntent,
    approvalLevel: classification.riskLevel,
    targetSystems,
    allowedScope,
    forbiddenScope,
    preflightPlan: classification.externalConfirmationRequired
      ? [...commonPreflight, "verify external confirmation for Level 4"]
      : commonPreflight,
    executionPlan: targetSystems.map((systemId, index) => ({
      stepIndex: index + 1,
      targetSystem: systemId,
      actionId: buildActionId(systemId, classification.riskLevel),
      approvalLevel: classification.riskLevel,
      status: classification.approvalRequired ? "approval_required" : "preflight_pending",
      preflightPlan: commonPreflight,
      allowedScope: [`${systemId}:scoped_operator_command_step`],
      forbiddenScope: [...DEFAULT_FORBIDDEN_SCOPE, ...SYSTEM_FORBIDDEN_SCOPE[systemId]],
      proofPlan: [
        "write owner_command_events audit row",
        "write owner_command_execution_steps audit row",
        "collect target operator proof/report",
      ],
      rollbackPlan: [
        "stop remaining steps on failure",
        "use target operator rollback/quarantine policy when the target system supports it",
      ],
    })),
    rollbackPlan: [
      "stop execution at first failed preflight or scope mismatch",
      "record blocker and leave high-risk action unexecuted",
      "use target operator rollback/quarantine plan for any scoped action already executed",
    ],
    proofPlan: [
      "owner command request row",
      "owner command events",
      "execution step audit",
      "approval request id for Level 3/4",
      "target operator proof where execution is allowed",
    ],
    validationPlan: [
      "owner/super_admin authority",
      "registry scope",
      "approval status for Level 3/4",
      "external confirmation for Level 4",
      "fresh preflight",
      "exact scope match",
      "emergency state active",
    ],
    approvalRequired: classification.approvalRequired,
    externalConfirmationRequired: classification.externalConfirmationRequired,
    blockers: classification.blockers,
  };
};

export const buildOwnerCommandApprovalRequest = (plan: OwnerCommandExecutionPlan) => {
  if (plan.approvalLevel < 3) return null;
  return {
    systemId: plan.targetSystems[0] ?? "security_owner_operator",
    platform: plan.platformScope,
    actionId: "owner_command_high_risk_execution",
    approvalLevel: plan.approvalLevel as Extract<AutonomousApprovalLevel, 3 | 4>,
    title: `Owner command approval: ${plan.normalizedIntent}`,
    reason: "Owner judgment maps to a Level 3/4 action and must be approved before execution.",
    riskSummary: plan.externalConfirmationRequired
      ? "Level 4 command requires owner/super_admin approval, fresh preflight, exact scope match, and external confirmation."
      : "Level 3 command requires owner/super_admin approval, fresh preflight, and exact scope match.",
    proposedAction: plan.commandText,
    allowedWriteScope: plan.allowedScope,
    forbiddenScope: plan.forbiddenScope,
    rollbackPlan: plan.rollbackPlan.join("; "),
    killSwitchPlan: "Autonomous emergency state must be active for each target system before execution.",
    proofPlan: plan.proofPlan.join("; "),
    validationPlan: plan.validationPlan.join("; "),
  };
};

export const executeOwnerCommandDryRun = (commandText: string) => ({
  executed: false,
  dryRun: true,
  plan: sanitizeOwnerCommandProof(buildOwnerCommandExecutionPlan(commandText)) as OwnerCommandExecutionPlan,
});

export const executeOwnerCommandIfApproved = (input: {
  approvalFresh: boolean;
  approved: boolean;
  commandText: string;
  emergencyStateActive: boolean;
  exactScopeMatch: boolean;
  externalConfirmationProvided?: boolean;
  preflightFresh: boolean;
}) => {
  const plan = buildOwnerCommandExecutionPlan(input.commandText);
  const blockers = [...plan.blockers];
  if (!input.emergencyStateActive) blockers.push("emergency_stop_or_pause_active");
  if (!input.preflightFresh) blockers.push("fresh_preflight_required");
  if (!input.exactScopeMatch) blockers.push("exact_scope_match_required");
  if (plan.approvalLevel >= 3 && (!input.approved || !input.approvalFresh)) blockers.push("owner_approval_required");
  if (plan.externalConfirmationRequired && !input.externalConfirmationProvided) blockers.push("external_confirmation_required");

  if (blockers.length) {
    return {
      executed: false,
      status: "blocked" as OwnerCommandStatus,
      blockers,
      nextAction: blockers[0],
      plan: sanitizeOwnerCommandProof(plan),
    };
  }

  return {
    executed: true,
    status: "executed" as OwnerCommandStatus,
    proof: sanitizeOwnerCommandProof({
      targetSystems: plan.targetSystems,
      approvalLevel: plan.approvalLevel,
      highRiskExecuted: plan.approvalLevel >= 3,
      exactScopeMatch: true,
      freshPreflight: true,
    }),
  };
};

export const assertNoForbiddenOwnerCommandMutation = (input: {
  commandText: string;
  directDbMutation?: boolean;
  externalConfirmationProvided?: boolean;
  ownerApprovalPresent?: boolean;
}) => {
  const riskLevel = classifyOwnerCommandRisk(input.commandText);
  if (input.directDbMutation) throw new Error("owner_command_direct_db_mutation_forbidden");
  if (riskLevel >= 3 && !input.ownerApprovalPresent) throw new Error("owner_command_owner_approval_required");
  if (riskLevel === 4 && !input.externalConfirmationProvided) throw new Error("owner_command_external_confirmation_required");
  if (includesSecretLikeValue(input.commandText)) throw new Error("owner_command_secret_like_payload_blocked");
};
