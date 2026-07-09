export type ChillywoodAutonomyApprovalLevel =
  | "level_0_fully_autonomous"
  | "level_1_autonomous_with_reporting"
  | "level_2_autonomous_with_emergency_stop"
  | "level_3_owner_approval_required"
  | "level_4_owner_approval_plus_external_confirmation";

export type ChillywoodAutonomousOperationKind =
  | "eligible_media_discovery"
  | "safe_batch_sizing"
  | "scoped_logical_backup"
  | "restore_drill"
  | "public_safe_transcode_inside_caps"
  | "post_write_audit"
  | "scoped_rollback_quarantine"
  | "fallback_playback"
  | "telemetry_reporting"
  | "cache_verification"
  | "auto_pause_anomaly"
  | "batch_completion_report"
  | "cost_cache_summary"
  | "failure_summary"
  | "batch_automation_with_kill_switch"
  | "cache_fallback_automation"
  | "paid_provider_billing_change"
  | "paid_pitr_or_plan_upgrade"
  | "auth_rls_change"
  | "premium_entitlement_change"
  | "payout_cashout_change"
  | "destructive_production_db_change"
  | "broad_uncapped_backfill"
  | "public_private_exposure_policy_change"
  | "premium_private_cdn_token_policy"
  | "app_store_public_release"
  | "legal_compliance_policy"
  | "payment_production_mutation"
  | "public_marketing_claim"
  | string;

export type ChillywoodAutonomyPolicyInput = {
  operationKind: ChillywoodAutonomousOperationKind;
  emergencyStopAvailable?: boolean | null;
  rollbackAvailable?: boolean | null;
  auditRequired?: boolean | null;
  fallbackAvailable?: boolean | null;
  capsEnforced?: boolean | null;
  changesMoneyOrBilling?: boolean | null;
  changesProviderPlan?: boolean | null;
  changesAuthOrRls?: boolean | null;
  changesPremiumEntitlement?: boolean | null;
  changesPayoutOrCashout?: boolean | null;
  destructiveProductionDbChange?: boolean | null;
  broadUncappedBackfill?: boolean | null;
  changesPublicPrivateExposurePolicy?: boolean | null;
  changesAppStorePublicLaunch?: boolean | null;
  changesLegalCompliancePolicy?: boolean | null;
  paymentProductionMutation?: boolean | null;
  publicMarketingClaim?: boolean | null;
  processesPrivatePremiumOriginalMedia?: boolean | null;
  printsOrCommitsSecrets?: boolean | null;
};

export type ChillywoodAutonomyPolicyDecision = {
  operationKind: string;
  approvalLevel: ChillywoodAutonomyApprovalLevel;
  ownerApprovalRequired: boolean;
  externalConfirmationRequired: boolean;
  allowedWithoutOwnerApproval: boolean;
  emergencyStopRequired: boolean;
  auditRequired: boolean;
  rollbackRequired: boolean;
  fallbackRequired: boolean;
  blockedReason: string | null;
  reasonCodes: string[];
};

const level0 = new Set<string>([
  "eligible_media_discovery",
  "safe_batch_sizing",
  "scoped_logical_backup",
  "restore_drill",
  "public_safe_transcode_inside_caps",
  "post_write_audit",
  "scoped_rollback_quarantine",
  "fallback_playback",
  "cache_verification",
]);

const level1 = new Set<string>([
  "telemetry_reporting",
  "batch_completion_report",
  "cost_cache_summary",
  "failure_summary",
]);

const level2 = new Set<string>([
  "auto_pause_anomaly",
  "batch_automation_with_kill_switch",
  "cache_fallback_automation",
]);

const level3 = new Set<string>([
  "paid_provider_billing_change",
  "paid_pitr_or_plan_upgrade",
  "auth_rls_change",
  "premium_entitlement_change",
  "payout_cashout_change",
  "destructive_production_db_change",
  "broad_uncapped_backfill",
  "public_private_exposure_policy_change",
  "premium_private_cdn_token_policy",
]);

const level4 = new Set<string>([
  "app_store_public_release",
  "legal_compliance_policy",
  "payment_production_mutation",
  "public_marketing_claim",
]);

const toText = (value: unknown) => String(value ?? "").trim();

function baseLevelForKind(kind: string): ChillywoodAutonomyApprovalLevel {
  if (level4.has(kind)) return "level_4_owner_approval_plus_external_confirmation";
  if (level3.has(kind)) return "level_3_owner_approval_required";
  if (level2.has(kind)) return "level_2_autonomous_with_emergency_stop";
  if (level1.has(kind)) return "level_1_autonomous_with_reporting";
  if (level0.has(kind)) return "level_0_fully_autonomous";
  return "level_3_owner_approval_required";
}

function escalateForBoundary(input: ChillywoodAutonomyPolicyInput): ChillywoodAutonomyApprovalLevel {
  if (
    input.changesAppStorePublicLaunch === true
    || input.changesLegalCompliancePolicy === true
    || input.paymentProductionMutation === true
    || input.publicMarketingClaim === true
  ) {
    return "level_4_owner_approval_plus_external_confirmation";
  }

  if (
    input.changesMoneyOrBilling === true
    || input.changesProviderPlan === true
    || input.changesAuthOrRls === true
    || input.changesPremiumEntitlement === true
    || input.changesPayoutOrCashout === true
    || input.destructiveProductionDbChange === true
    || input.broadUncappedBackfill === true
    || input.changesPublicPrivateExposurePolicy === true
  ) {
    return "level_3_owner_approval_required";
  }

  return baseLevelForKind(toText(input.operationKind));
}

function reasonCodesFor(input: ChillywoodAutonomyPolicyInput, level: ChillywoodAutonomyApprovalLevel): string[] {
  const reasons: string[] = [level];
  if (input.changesMoneyOrBilling === true) reasons.push("money_or_billing_boundary");
  if (input.changesProviderPlan === true) reasons.push("provider_plan_boundary");
  if (input.changesAuthOrRls === true) reasons.push("auth_rls_boundary");
  if (input.changesPremiumEntitlement === true) reasons.push("premium_entitlement_boundary");
  if (input.changesPayoutOrCashout === true) reasons.push("payout_cashout_boundary");
  if (input.destructiveProductionDbChange === true) reasons.push("destructive_production_db_boundary");
  if (input.broadUncappedBackfill === true) reasons.push("broad_uncapped_backfill_boundary");
  if (input.changesPublicPrivateExposurePolicy === true) reasons.push("public_private_exposure_boundary");
  if (input.processesPrivatePremiumOriginalMedia === true) reasons.push("private_premium_original_media_blocked");
  if (input.printsOrCommitsSecrets === true) reasons.push("secret_output_blocked");
  if (input.emergencyStopAvailable === false) reasons.push("emergency_stop_missing");
  if (input.rollbackAvailable === false) reasons.push("rollback_missing");
  if (input.auditRequired === false) reasons.push("audit_missing");
  if (input.fallbackAvailable === false) reasons.push("fallback_missing");
  if (input.capsEnforced === false) reasons.push("caps_missing");
  return reasons;
}

export function classifyAutonomousOperation(
  input: ChillywoodAutonomyPolicyInput,
): ChillywoodAutonomyPolicyDecision {
  const operationKind = toText(input.operationKind) || "unknown";
  const approvalLevel = escalateForBoundary({ ...input, operationKind });
  const ownerApprovalRequired = approvalLevel === "level_3_owner_approval_required"
    || approvalLevel === "level_4_owner_approval_plus_external_confirmation";
  const externalConfirmationRequired = approvalLevel === "level_4_owner_approval_plus_external_confirmation";
  const emergencyStopRequired = approvalLevel === "level_2_autonomous_with_emergency_stop"
    || operationKind.includes("automation")
    || operationKind.includes("transcode")
    || operationKind.includes("rollback");
  const auditRequired = operationKind.includes("transcode")
    || operationKind.includes("audit")
    || operationKind.includes("rollback")
    || operationKind.includes("automation");
  const rollbackRequired = operationKind.includes("transcode")
    || operationKind.includes("rollback")
    || operationKind.includes("automation");
  const fallbackRequired = operationKind.includes("playback")
    || operationKind.includes("cdn")
    || operationKind.includes("transcode")
    || operationKind.includes("automation");
  const reasonCodes = reasonCodesFor(input, approvalLevel);
  const blockedReason = input.processesPrivatePremiumOriginalMedia === true
    ? "private_premium_original_media_blocked"
    : input.printsOrCommitsSecrets === true
      ? "secret_output_blocked"
      : emergencyStopRequired && input.emergencyStopAvailable === false
        ? "emergency_stop_missing"
        : rollbackRequired && input.rollbackAvailable === false
          ? "rollback_missing"
          : auditRequired && input.auditRequired === false
            ? "audit_missing"
            : fallbackRequired && input.fallbackAvailable === false
              ? "fallback_missing"
              : input.capsEnforced === false
                ? "caps_missing"
                : null;

  return {
    operationKind,
    approvalLevel,
    ownerApprovalRequired,
    externalConfirmationRequired,
    allowedWithoutOwnerApproval: !ownerApprovalRequired && blockedReason === null,
    emergencyStopRequired,
    auditRequired,
    rollbackRequired,
    fallbackRequired,
    blockedReason,
    reasonCodes,
  };
}

export function requiresOwnerApproval(input: ChillywoodAutonomyPolicyInput): boolean {
  return classifyAutonomousOperation(input).ownerApprovalRequired;
}

export function assertAutonomousOperationAllowed(input: ChillywoodAutonomyPolicyInput): ChillywoodAutonomyPolicyDecision {
  const decision = classifyAutonomousOperation(input);
  if (decision.ownerApprovalRequired) {
    throw new Error(`owner_approval_required:${decision.approvalLevel}`);
  }
  if (decision.blockedReason) {
    throw new Error(`autonomous_operation_blocked:${decision.blockedReason}`);
  }
  return decision;
}

export function sanitizeAutonomyPolicyProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/postgres(?:ql)?:\/\//i.test(entry)) return "[REDACTED_DB_URL]";
    if (new RegExp(`X-Amz-${"Signature"}=`, "i").test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/eyJ[A-Za-z0-9_-]{20,}\./.test(entry)) return "[REDACTED_TOKEN]";
    return entry;
  })) as T;
}
