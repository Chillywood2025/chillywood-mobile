export const INSTALLED_PRODUCT_QA_OPERATOR_ID = "installed_product_qa_operator" as const;

export type InstalledQaProofSource =
  | "browserstack"
  | "firebase_test_lab_uploaded_artifact"
  | "local_fixture"
  | "manual_codex_proof"
  | "play_installed";

export type InstalledQaDeviceLabProvider =
  | "browserstack"
  | "firebase_test_lab"
  | "local_physical_device"
  | "none";

export type InstalledQaBillingRisk =
  | "low"
  | "none"
  | "paid_approval_required"
  | "unknown";

export type InstalledQaQuotaMode =
  | "cost_capped_worst_case"
  | "free_quota"
  | "paid_approval_required"
  | "unknown";

export type InstalledQaFirebaseMode =
  | "cost_capped"
  | "zero_cost";

export type InstalledQaFirebaseRunReason =
  | "daily_scheduled"
  | "manual"
  | "ota_change"
  | "owner_command"
  | "source_change";

export type InstalledQaTier =
  | "tier0"
  | "tier1"
  | "tier2"
  | "tier3";

export type InstalledQaDiscoveredBy =
  | "autonomous_operator"
  | "codex_manual"
  | "device_lab";

export type InstalledQaBlockerClassification =
  | "account_fixture_not_ready"
  | "auth_session_mismatch"
  | "device_unavailable"
  | "expected_denial_copy_missing"
  | "installed_ota_stale"
  | "manual_codex_only_gap"
  | "missing_testid_or_marker"
  | "premium_provider_state_missing"
  | "route_contract_mismatch"
  | "second_device_required"
  | "source_bug"
  | "stale_proof_expectation"
  | "unknown_requires_review";

export type InstalledQaResult =
  | "blocked"
  | "failed"
  | "human_review"
  | "partial"
  | "pass"
  | "two_device_required";

export type InstalledQaFindingKind =
  | "account_fixture_health"
  | "device_availability"
  | "required_review"
  | "role_behavior"
  | "route_behavior";

export type InstalledQaFinding = {
  id: string;
  kind: InstalledQaFindingKind;
  routePath?: string;
  accountLabel?: string;
  accountRole?: string;
  expected: string;
  actual: string;
  result: InstalledQaResult;
  blockerClassification: InstalledQaBlockerClassification;
  proofSource: InstalledQaProofSource;
  discoveredBy: InstalledQaDiscoveredBy;
  status: "open" | "reviewed" | "closed" | "superseded";
  nextSafeAction: string;
  metadata?: Record<string, unknown>;
};

export type InstalledTraversalPlan = {
  systemId: typeof INSTALLED_PRODUCT_QA_OPERATOR_ID;
  activationMode: "manual_cli" | "limited_scheduled_probe";
  schedulerStatus: "device_lab_scheduler_pending" | "device_lab_scheduler_available";
  checks: readonly {
    id: string;
    routePath?: string;
    accountRole: string;
    requiredEvidence: readonly string[];
    forbiddenClaims: readonly string[];
  }[];
};

export type FirebaseTestLabReadiness = {
  provider: "firebase_test_lab";
  proofSource: "firebase_test_lab_uploaded_artifact";
  canRun: boolean;
  costEstimateUsd: number;
  maxAllowedCostUsd: number;
  monthlyBudgetUsd: number;
  monthlySpentEstimateUsd: number;
  monthlyRemainingEstimateUsd: number;
  billingRisk: InstalledQaBillingRisk;
  quotaMode: InstalledQaQuotaMode;
  labMode: InstalledQaFirebaseMode;
  qaTier: InstalledQaTier;
  runReason: InstalledQaFirebaseRunReason;
  deviceType: "physical" | "virtual";
  blockerClassification: InstalledQaBlockerClassification;
  notPlayInstalledProof: true;
  premiumProofClosed: false;
  twoDeviceProofClosed: false;
  reason: string;
};

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret|reporter|private[_-]?evidence|tax|bank)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const normalizeText = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");

const hasSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_KEY_PATTERN.test(value) || LONG_SECRET_LIKE_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(hasSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, entry]) => (
      SECRET_KEY_PATTERN.test(key) || hasSecretLikeValue(entry)
    ));
  }
  return false;
};

const redactText = (value: unknown) => String(value ?? "")
  .replace(LONG_SECRET_LIKE_PATTERN, "[redacted]")
  .slice(0, 4000);

export const sanitizeInstalledQaProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeInstalledQaProof(entry));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => !SECRET_KEY_PATTERN.test(key) && !hasSecretLikeValue(entry))
      .map(([key, entry]) => [key, sanitizeInstalledQaProof(entry)]),
  );
};

export const classifyTraversalBlocker = (input: {
  actual?: string | null;
  expected?: string | null;
  issue?: string | null;
  routePath?: string | null;
}): InstalledQaBlockerClassification => {
  const text = `${input.issue ?? ""} ${input.expected ?? ""} ${input.actual ?? ""} ${input.routePath ?? ""}`.toLowerCase();
  if (text.includes("manual codex") || text.includes("did not catch independently")) return "manual_codex_only_gap";
  if (text.includes("premium") && (text.includes("inactive") || text.includes("not active") || text.includes("provider"))) return "premium_provider_state_missing";
  if (text.includes("second device") || text.includes("two-device") || text.includes("two device")) return "second_device_required";
  if (text.includes("device unavailable") || text.includes("device lab unavailable") || text.includes("no play-installed device")) return "device_unavailable";
  if (text.includes("restricted") && (text.includes("inbox") || text.includes("denied") || text.includes("denial"))) return "expected_denial_copy_missing";
  if (text.includes("marker") || text.includes("testid") || text.includes("test id") || text.includes("compatibility")) return "missing_testid_or_marker";
  if (text.includes("stayed on home") || text.includes("wrong route") || text.includes("route")) return "route_contract_mismatch";
  if (text.includes("stale ota") || text.includes("old update") || text.includes("embedded launch") || text.includes("emergency launch")) return "installed_ota_stale";
  if (text.includes("session") || text.includes("login")) return "auth_session_mismatch";
  if (text.includes("fixture") || text.includes("labelled") || text.includes("labeled")) return "account_fixture_not_ready";
  return "unknown_requires_review";
};

export const classifyInstalledQaFinding = (input: {
  actual?: string | null;
  expected?: string | null;
  issue?: string | null;
  routePath?: string | null;
  sourceBugSuspected?: boolean;
  staleProofExpectation?: boolean;
}): InstalledQaBlockerClassification => {
  if (input.sourceBugSuspected) return "source_bug";
  if (input.staleProofExpectation) return "stale_proof_expectation";
  return classifyTraversalBlocker(input);
};

export const classifyRouteBehavior = (input: {
  actualRoute?: string | null;
  expectedRoute?: string | null;
  missingMarker?: boolean;
  staleOta?: boolean;
  denialCopyMissing?: boolean;
}): InstalledQaBlockerClassification => {
  if (input.staleOta) return "installed_ota_stale";
  if (input.denialCopyMissing) return "expected_denial_copy_missing";
  if (input.missingMarker) return "missing_testid_or_marker";
  if (normalizeText(input.actualRoute) && normalizeText(input.actualRoute) !== normalizeText(input.expectedRoute)) return "route_contract_mismatch";
  return "unknown_requires_review";
};

export const classifyAccountFixtureHealth = (input: {
  accountRole: string;
  actualState?: string | null;
  expectedState?: string | null;
  providerBacked?: boolean;
}): InstalledQaBlockerClassification => {
  const role = input.accountRole.toLowerCase();
  const expected = normalizeText(input.expectedState).toLowerCase();
  const actual = normalizeText(input.actualState).toLowerCase();
  if (role.includes("premium") && (!input.providerBacked || !actual.includes("active"))) return "premium_provider_state_missing";
  if (expected && actual && expected !== actual) return "account_fixture_not_ready";
  return "unknown_requires_review";
};

export const classifyDeviceReadiness = (input: {
  availableDeviceCount: number;
  requiredDeviceCount: number;
  deviceLabConfigured?: boolean;
  playInstalledDeviceAvailable?: boolean;
}): InstalledQaBlockerClassification => {
  if (!input.playInstalledDeviceAvailable && !input.deviceLabConfigured) return "device_unavailable";
  if (input.availableDeviceCount < input.requiredDeviceCount && input.requiredDeviceCount >= 2) return "second_device_required";
  if (input.availableDeviceCount < input.requiredDeviceCount) return "device_unavailable";
  return "unknown_requires_review";
};

export const classifyFirebaseTestLabReadiness = (input: {
  firebaseProjectConfigured?: boolean;
  testLabApiAvailable?: boolean;
  virtualDeviceRequested?: boolean;
  physicalDeviceRequested?: boolean;
  scheduledRequested?: boolean;
  broadCrawlRequested?: boolean;
  twoDeviceRequested?: boolean;
  zeroCostConfirmed?: boolean;
  estimatedCostUsd?: number;
  perRunCapUsd?: number;
  monthlyBudgetUsd?: number;
  monthlySpentEstimateUsd?: number;
  scheduledRunCountToday?: number;
  maxScheduledRunsPerDay?: number;
  quotaMode?: InstalledQaQuotaMode;
  billingRisk?: InstalledQaBillingRisk;
  labMode?: InstalledQaFirebaseMode;
  qaTier?: InstalledQaTier;
  runReason?: InstalledQaFirebaseRunReason;
  allowBroadCrawl?: boolean;
  allowTwoDevice?: boolean;
  ownerApprovedPhysical?: boolean;
}): FirebaseTestLabReadiness => {
  const quotaMode = input.quotaMode ?? "unknown";
  const billingRisk = input.billingRisk ?? "unknown";
  const labMode = input.labMode ?? "cost_capped";
  const qaTier = input.qaTier ?? "tier1";
  const runReason = input.runReason ?? (input.scheduledRequested ? "daily_scheduled" : "manual");
  const deviceType: FirebaseTestLabReadiness["deviceType"] = input.physicalDeviceRequested ? "physical" : "virtual";
  const costEstimateUsd = Number.isFinite(input.estimatedCostUsd) ? Math.max(0, Number(input.estimatedCostUsd)) : Number.NaN;
  const maxAllowedCostUsd = Number.isFinite(input.perRunCapUsd) ? Math.max(0, Number(input.perRunCapUsd)) : 0.25;
  const monthlyBudgetUsd = Number.isFinite(input.monthlyBudgetUsd) ? Math.max(0, Number(input.monthlyBudgetUsd)) : 5;
  const monthlySpentEstimateUsd = Number.isFinite(input.monthlySpentEstimateUsd)
    ? Math.max(0, Number(input.monthlySpentEstimateUsd))
    : 0;
  const monthlyRemainingEstimateUsd = Math.max(0, monthlyBudgetUsd - monthlySpentEstimateUsd);
  const base = {
    provider: "firebase_test_lab" as const,
    proofSource: "firebase_test_lab_uploaded_artifact" as const,
    costEstimateUsd: Number.isFinite(costEstimateUsd) ? costEstimateUsd : 0,
    maxAllowedCostUsd,
    monthlyBudgetUsd,
    monthlySpentEstimateUsd,
    monthlyRemainingEstimateUsd,
    billingRisk,
    quotaMode,
    labMode,
    qaTier,
    runReason,
    deviceType,
    notPlayInstalledProof: true as const,
    premiumProofClosed: false as const,
    twoDeviceProofClosed: false as const,
  };
  const blocked = (
    reason: string,
    blockerClassification: InstalledQaBlockerClassification,
    overrides?: Partial<FirebaseTestLabReadiness>,
  ): FirebaseTestLabReadiness => ({
    ...base,
    canRun: false,
    blockerClassification,
    reason,
    ...overrides,
  });
  if (!input.firebaseProjectConfigured) {
    return blocked("firebase_project_missing", "device_unavailable", { billingRisk: "unknown" });
  }
  if (!input.testLabApiAvailable) {
    return blocked("firebase_test_lab_api_unavailable", "device_unavailable", { billingRisk: "unknown" });
  }
  if (input.physicalDeviceRequested && !input.ownerApprovedPhysical) {
    return blocked("firebase_physical_device_blocked_by_default", "unknown_requires_review", {
      billingRisk: "paid_approval_required",
    });
  }
  if (input.twoDeviceRequested && !input.allowTwoDevice) {
    return blocked("firebase_two_device_blocked_by_default", "second_device_required");
  }
  if (input.broadCrawlRequested && !input.allowBroadCrawl) {
    return blocked("firebase_broad_crawl_blocked_by_default", "device_unavailable");
  }
  if (input.scheduledRequested && Number(input.scheduledRunCountToday ?? 0) >= Number(input.maxScheduledRunsPerDay ?? 1)) {
    return blocked("firebase_scheduled_daily_limit_reached", "device_unavailable");
  }
  if (!Number.isFinite(costEstimateUsd)) {
    return blocked("firebase_cost_unbounded", "device_unavailable", {
      billingRisk: "unknown",
      quotaMode: "unknown",
    });
  }
  if (labMode === "zero_cost" && costEstimateUsd > 0) {
    return blocked("firebase_zero_cost_mode_blocks_paid_estimate", "device_unavailable");
  }
  if (costEstimateUsd > maxAllowedCostUsd) {
    return blocked("firebase_per_run_cap_exceeded", "device_unavailable", {
      billingRisk: "paid_approval_required",
    });
  }
  if (monthlySpentEstimateUsd + costEstimateUsd > monthlyBudgetUsd) {
    return blocked("firebase_monthly_cap_exceeded", "device_unavailable", {
      billingRisk: "paid_approval_required",
    });
  }
  return {
    ...base,
    canRun: true,
    costEstimateUsd,
    billingRisk: input.zeroCostConfirmed && quotaMode === "free_quota" ? "none" : "low",
    quotaMode: input.zeroCostConfirmed && quotaMode === "free_quota" ? "free_quota" : "cost_capped_worst_case",
    blockerClassification: "unknown_requires_review",
    reason: input.zeroCostConfirmed && costEstimateUsd === 0
      ? "firebase_virtual_device_free_quota_confirmed"
      : "firebase_virtual_device_cost_capped_smoke_allowed",
  };
};

export const classifyProofSource = (source: InstalledQaProofSource): InstalledQaDiscoveredBy => {
  if (source === "manual_codex_proof" || source === "local_fixture") return "codex_manual";
  if (source === "browserstack" || source === "firebase_test_lab_uploaded_artifact") return "device_lab";
  return "autonomous_operator";
};

export const buildInstalledTraversalPlan = (input?: {
  deviceLabConfigured?: boolean;
}): InstalledTraversalPlan => ({
  systemId: INSTALLED_PRODUCT_QA_OPERATOR_ID,
  activationMode: "manual_cli",
  schedulerStatus: input?.deviceLabConfigured ? "device_lab_scheduler_available" : "device_lab_scheduler_pending",
  checks: [
    {
      id: "normal_chat_route_marker",
      routePath: "/chat",
      accountRole: "normal",
      requiredEvidence: ["Play-installed app", "current updateId", "chat-inbox-screen", "chat-search-input"],
      forbiddenClaims: ["Home route counted as chat", "admin controls exposed"],
    },
    {
      id: "restricted_chat_denial",
      routePath: "/chat",
      accountRole: "restricted",
      requiredEvidence: ["restricted account readback", "restricted/denied copy or action block"],
      forbiddenClaims: ["unrestricted inbox counted as denial", "manual account restriction during proof"],
    },
    {
      id: "creator_monetization_setup_marker",
      routePath: "/creator-monetization-setup",
      accountRole: "creator",
      requiredEvidence: ["Platform Studio or compatibility marker", "Premium required or Manage Premium marker"],
      forbiddenClaims: ["provider mutation", "payout creation", "manual Premium grant"],
    },
    {
      id: "premium_active_account_health",
      routePath: "/subscribe",
      accountRole: "premium",
      requiredEvidence: ["RevenueCat/provider-backed active entitlement", "app active receipt", "backend active readback"],
      forbiddenClaims: ["manual entitlement row", "fake Premium row", "provider product mutation"],
    },
    {
      id: "moderator_boundary_visibility",
      routePath: "/admin",
      accountRole: "moderator",
      requiredEvidence: ["bounded moderation entry", "broad Admin Search absent", "private evidence absent"],
      forbiddenClaims: ["owner approvals visible", "direct enforcement visible", "reporter identity visible"],
    },
    {
      id: "two_device_realtime_readiness",
      accountRole: "two_device",
      requiredEvidence: ["two Play-installed devices or approved device lab", "same runtime/updateId/channel", "identity-safe realtime render"],
      forbiddenClaims: ["one device counted as two-device proof", "sideloaded device counted"],
    },
  ],
});

export const buildQaOwnerCommand = (finding: InstalledQaFinding) => ({
  commandText: `Installed Product QA finding ${finding.id}: ${finding.blockerClassification}. ${finding.nextSafeAction}`,
  normalizedIntent: "installed_product_qa",
  targetSystems: [INSTALLED_PRODUCT_QA_OPERATOR_ID],
  approvalLevel: finding.blockerClassification === "source_bug" ? 2 : 1,
  status: "planned",
  allowedScope: [
    "safe source/proof/testID fix proposal",
    "QA finding and blocker tracking",
    "owner command request creation",
  ],
  forbiddenScope: [
    "manual Premium grant",
    "auth/RLS mutation",
    "owner role mutation",
    "money movement",
    "provider product mutation",
    "ban/restrict/delete content",
    "fake installed proof",
    "two-device closure without two devices",
  ],
  proofPlan: [
    "record QA finding",
    "run targeted proof",
    "run guard:installed-product-qa-operator",
    "keep installed verdict Partial when fixture/device/provider is missing",
  ],
  validationPlan: ["npm run proof:installed-product-qa-operator", "npm run guard:installed-product-qa-operator"],
  rollbackPlan: ["mark owner command superseded; leave QA finding open until real proof exists"],
  metadata: sanitizeInstalledQaProof({ finding }),
});

export const CURRENT_MANUAL_BLOCKER_FINDINGS: readonly InstalledQaFinding[] = [
  {
    id: "manual-normal-chat-stayed-home",
    kind: "route_behavior",
    routePath: "/chat",
    accountLabel: "proof_normal_001",
    accountRole: "normal",
    expected: "chat-inbox-screen",
    actual: "Home",
    result: "blocked",
    blockerClassification: "route_contract_mismatch",
    proofSource: "manual_codex_proof",
    discoveredBy: "codex_manual",
    status: "open",
    nextSafeAction: "Run proactive installed normal /chat route marker check and create safe source/proof/testID owner command if mismatch recurs.",
  },
  {
    id: "manual-restricted-chat-showed-inbox",
    kind: "role_behavior",
    routePath: "/chat",
    accountLabel: "proof_restricted_001",
    accountRole: "restricted",
    expected: "restricted/denied chat copy or blocked action",
    actual: "Chat inbox",
    result: "blocked",
    blockerClassification: "expected_denial_copy_missing",
    proofSource: "manual_codex_proof",
    discoveredBy: "codex_manual",
    status: "open",
    nextSafeAction: "Verify restricted fixture state first; do not ban/restrict a real user or fake denial proof.",
  },
  {
    id: "manual-creator-monetization-marker-missing",
    kind: "route_behavior",
    routePath: "/creator-monetization-setup",
    accountLabel: "proof_creator_001",
    accountRole: "creator",
    expected: "Platform Studio / Premium required compatibility marker",
    actual: "expected marker missing",
    result: "blocked",
    blockerClassification: "missing_testid_or_marker",
    proofSource: "manual_codex_proof",
    discoveredBy: "codex_manual",
    status: "open",
    nextSafeAction: "Run proactive compatibility marker check and create safe source/proof/testID owner command if marker is missing.",
  },
  {
    id: "manual-premium-labelled-account-inactive",
    kind: "account_fixture_health",
    routePath: "/subscribe",
    accountLabel: "proof_premium_001",
    accountRole: "premium",
    expected: "provider-backed Premium active",
    actual: "Premium is not active in installed traversal",
    result: "blocked",
    blockerClassification: "premium_provider_state_missing",
    proofSource: "manual_codex_proof",
    discoveredBy: "codex_manual",
    status: "open",
    nextSafeAction: "Use only provider-backed active account, restore, or approved Google Play / RevenueCat sandbox renewal; never manually grant Premium.",
  },
  {
    id: "manual-moderator-boundary-pending",
    kind: "required_review",
    routePath: "/admin",
    accountLabel: "proof_moderator_001",
    accountRole: "moderator",
    expected: "broad Admin Search/private evidence boundaries proved",
    actual: "focused boundary proof pending at time of manual blocker discovery",
    result: "human_review",
    blockerClassification: "manual_codex_only_gap",
    proofSource: "manual_codex_proof",
    discoveredBy: "codex_manual",
    status: "open",
    nextSafeAction: "Run focused moderator boundary packet and keep private evidence/reporter identity absent by default.",
  },
  {
    id: "manual-two-device-realtime-pending",
    kind: "device_availability",
    accountRole: "two_device",
    expected: "two Play-installed devices or approved device lab",
    actual: "one Play-installed device available",
    result: "two_device_required",
    blockerClassification: "second_device_required",
    proofSource: "manual_codex_proof",
    discoveredBy: "codex_manual",
    status: "open",
    nextSafeAction: "Do not claim realtime closure until two Play-installed devices or an approved device lab prove the flow.",
  },
];
