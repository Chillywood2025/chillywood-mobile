import {
  planLevelThreeOrFourApprovalRequest,
  sanitizeAutonomousApprovalMetadata,
  type AutonomousApprovalRequesterType,
} from "./autonomousApprovalRequests";
import {
  validateMoneyExternalConfirmation,
  type MoneyEnvironmentMode,
  type MoneyExternalConfirmationInput,
} from "./moneyExternalConfirmation";
import type { AutonomousApprovalLevel } from "./autonomousSystemsRegistry";

export const MONEY_FLOW_CONTROL_SYSTEM_ID = "money_flow_control" as const;
export const MONEY_FLOW_CONTROL_STATUS = "scoped_write_capable_guarded" as const;

export const MONEY_FLOW_SURFACES = [
  "premium_revenue",
  "revenuecat_entitlements_readback",
  "google_play_receipts_readback",
  "revenuecat_webhook_delivery",
  "google_play_webhook_delivery",
  "stripe_connect_webhook_delivery",
  "stripe_merch_webhook_delivery",
  "provider_readiness_audit",
  "provider_delivery_error_rate",
  "stale_provider_dashboard_integration_detection",
  "duplicate_webhook_integration_detection",
  "stripe_connect_foundation",
  "creator_payout_ledger",
  "payout_review_queue",
  "payout_batches",
  "provider_transfer_records",
  "network_billing",
  "sponsor_deals",
  "fraud_holds",
  "usage_metering",
  "refunds_disputes_future",
  "tax_compliance_future",
] as const;

export type MoneyFlowSurfaceId = typeof MONEY_FLOW_SURFACES[number];

export type MoneyActionId =
  | "read_only_reconciliation_report"
  | "missing_provider_data_detection"
  | "stale_provider_sync_detection"
  | "ledger_consistency_check"
  | "duplicate_event_detection"
  | "admin_readonly_summary"
  | "approval_request_creation"
  | "sandbox_webhook_validation"
  | "sandbox_zero_dollar_proof"
  | "provider_status_row_sync"
  | "record_reconciliation_finding"
  | "mark_provider_sync_status"
  | "record_duplicate_provider_event"
  | "mark_money_item_requires_review"
  | "record_blocked_money_action"
  | "record_external_confirmation_requirement"
  | "write_sandbox_test_mode_proof_result"
  | "update_money_operator_learning_state"
  | "fraud_hold_recommendation"
  | "provider_webhook_reliability_loop"
  | "provider_delivery_history_readback"
  | "provider_delivery_error_rate_classification"
  | "stale_provider_dashboard_integration_detection"
  | "duplicate_webhook_integration_detection"
  | "premium_stale_readback_detection"
  | "provider_access_status"
  | "provider_access_probe"
  | "provider_dashboard_readback"
  | "provider_test_delivery_plan"
  | "provider_test_delivery_run"
  | "provider_access_report"
  | "enable_production_checkout"
  | "enable_live_provider_integration"
  | "enable_payout_review_mutation"
  | "enable_fraud_enforcement_mutation"
  | "change_money_facing_config"
  | "change_payout_eligibility_rules"
  | "change_premium_entitlement_logic"
  | "enable_production_webhook_money_handling"
  | "create_production_payment_link_or_invoice"
  | "change_revenue_share_formula"
  | "change_network_billing_rule"
  | "real_customer_charge"
  | "real_payout"
  | "real_transfer"
  | "real_cashout"
  | "production_stripe_mode_switch"
  | "public_payment_launch"
  | "provider_plan_or_add_on"
  | "legal_compliance_tax_activation"
  | "public_revenue_or_payout_claim"
  | "manual_premium_grant"
  | "fake_revenue"
  | "fake_creator_earnings"
  | "fake_payable_balance"
  | "fake_paid_status"
  | "fake_transfer_complete";

export const MONEY_FLOW_LEVEL_0_OR_1_ACTIONS: readonly MoneyActionId[] = [
  "read_only_reconciliation_report",
  "missing_provider_data_detection",
  "stale_provider_sync_detection",
  "ledger_consistency_check",
  "duplicate_event_detection",
  "admin_readonly_summary",
  "approval_request_creation",
];

export const MONEY_FLOW_LEVEL_2_ACTIONS: readonly MoneyActionId[] = [
  "sandbox_webhook_validation",
  "sandbox_zero_dollar_proof",
  "provider_status_row_sync",
  "record_reconciliation_finding",
  "mark_provider_sync_status",
  "record_duplicate_provider_event",
  "mark_money_item_requires_review",
  "record_blocked_money_action",
  "record_external_confirmation_requirement",
  "write_sandbox_test_mode_proof_result",
  "update_money_operator_learning_state",
  "fraud_hold_recommendation",
  "provider_webhook_reliability_loop",
  "provider_delivery_history_readback",
  "provider_delivery_error_rate_classification",
  "stale_provider_dashboard_integration_detection",
  "duplicate_webhook_integration_detection",
  "premium_stale_readback_detection",
  "provider_access_status",
  "provider_access_probe",
  "provider_dashboard_readback",
  "provider_test_delivery_plan",
  "provider_test_delivery_run",
  "provider_access_report",
];

export const MONEY_FLOW_LEVEL_3_ACTIONS: readonly MoneyActionId[] = [
  "enable_production_checkout",
  "enable_live_provider_integration",
  "enable_payout_review_mutation",
  "enable_fraud_enforcement_mutation",
  "change_money_facing_config",
  "change_payout_eligibility_rules",
  "change_premium_entitlement_logic",
  "enable_production_webhook_money_handling",
  "create_production_payment_link_or_invoice",
  "change_revenue_share_formula",
  "change_network_billing_rule",
];

export const MONEY_FLOW_LEVEL_4_ACTIONS: readonly MoneyActionId[] = [
  "real_customer_charge",
  "real_payout",
  "real_transfer",
  "real_cashout",
  "production_stripe_mode_switch",
  "public_payment_launch",
  "provider_plan_or_add_on",
  "legal_compliance_tax_activation",
  "public_revenue_or_payout_claim",
];

export const MONEY_FLOW_FORBIDDEN_ACTIONS: readonly MoneyActionId[] = [
  "manual_premium_grant",
  "fake_revenue",
  "fake_creator_earnings",
  "fake_payable_balance",
  "fake_paid_status",
  "fake_transfer_complete",
];

export const MONEY_FLOW_BLOCKED_ACTION_LABELS = [
  "manual_premium_grant_forbidden",
  "fake_revenue_forbidden",
  "fake_creator_earnings_forbidden",
  "fake_payable_balance_forbidden",
  "fake_paid_status_forbidden",
  "fake_transfer_complete_forbidden",
  "real_money_movement_level_4",
  "production_money_setup_level_3",
  "unknown_money_action_defaults_level_4",
  "external_provider_confirmation_required_for_level_4",
] as const;

export const MONEY_OPERATOR_ALLOWED_WRITE_TABLES = [
  "money_operator_events",
  "money_reconciliation_runs",
  "money_reconciliation_findings",
  "money_provider_sync_status",
  "money_duplicate_event_detections",
  "money_required_review_flags",
  "money_flow_health_snapshots",
  "money_operator_learning_state",
  "autonomous_approval_requests",
  "provider_access_capabilities",
  "provider_access_audit_events",
  "provider_dashboard_repair_requests",
] as const;

export const MONEY_OPERATOR_SAFE_FIX_ACTIONS = [
  "record reconciliation findings",
  "mark provider sync stale/synced/failed",
  "mark duplicate provider/webhook event",
  "classify provider webhook error rate",
  "record provider delivery history readback",
  "record provider access capability status",
  "record provider access audit events",
  "record provider dashboard readback metadata",
  "detect stale provider dashboard integration",
  "detect duplicate webhook integration",
  "create provider dashboard repair approval request",
  "record Premium stale readback without entitlement grant",
  "mark ledger/payout/revenue item requires_review",
  "create approval request",
  "record blocked action",
  "record external confirmation requirement",
  "write sandbox/test-mode proof result",
  "update learning state",
] as const;

export const MONEY_OPERATOR_FORBIDDEN_WRITE_SCOPES = [
  "mark payout paid",
  "release payout",
  "create transfer",
  "create payout",
  "charge customer",
  "send invoice",
  "create payment link",
  "enable cashout",
  "manual Premium grant",
  "Premium entitlement edit outside provider-backed flow",
  "fake revenue",
  "fake payable balance",
  "clear fraud hold as paid/settled",
  "auth/RLS mutation",
  "provider product mutation",
  "Stripe live mode switch",
] as const;

export type MoneyOperatorWriteTable = typeof MONEY_OPERATOR_ALLOWED_WRITE_TABLES[number];
export type ProviderWebhookErrorRateClassification = "healthy" | "degraded" | "critical" | "outage" | "unknown";

export const MONEY_PROVIDER_RELIABILITY_SURFACES = [
  "revenuecat_webhook_delivery",
  "google_play_webhook_delivery",
  "stripe_connect_webhook_delivery",
  "stripe_merch_webhook_delivery",
  "provider_readiness_audit",
  "provider_delivery_error_rate",
  "stale_provider_dashboard_integration_detection",
  "duplicate_webhook_integration_detection",
  "provider_access_broker",
  "provider_dashboard_readback",
  "provider_test_delivery_status",
] as const;

export const MONEY_PROVIDER_WEBHOOK_HEALTH_ROWS = [
  {
    provider: "revenuecat",
    surface: "revenuecat_webhook_delivery",
    expectedMode: "production provider-backed Premium entitlement events",
    ownerAction: "Review RevenueCat dashboard delivery history, endpoint URL, shared auth, and duplicate integrations when error rate is degraded/critical/outage.",
  },
  {
    provider: "google_play",
    surface: "google_play_webhook_delivery",
    expectedMode: "revenuecat_mediated_or_readiness_only",
    ownerAction: "Treat direct Google Play webhook absence as readiness-only unless direct Google handling is intentionally active.",
  },
  {
    provider: "stripe_connect",
    surface: "stripe_connect_webhook_delivery",
    expectedMode: "test/live separated; no live-mode switch here",
    ownerAction: "Review Stripe Connect webhook endpoint/event selections only through Level 3 approval; real transfer/payout remains Level 4 plus external confirmation.",
  },
  {
    provider: "stripe_merch",
    surface: "stripe_merch_webhook_delivery",
    expectedMode: "physical merch sandbox/test readiness separated from production",
    ownerAction: "Review Stripe merch webhook endpoint/event selections only through Level 3 approval; no checkout/payment link/charge is created here.",
  },
] as const;

export const classifyProviderDeliveryErrorRate = (
  errorRatePercent: number | null | undefined,
): ProviderWebhookErrorRateClassification => {
  if (typeof errorRatePercent !== "number" || !Number.isFinite(errorRatePercent)) return "unknown";
  if (errorRatePercent <= 0) return "healthy";
  if (errorRatePercent < 25) return "degraded";
  if (errorRatePercent < 100) return "critical";
  return "outage";
};

export type MoneyActionClassification = {
  actionId: string;
  approvalLevel: AutonomousApprovalLevel;
  allowedAutonomousExecution: boolean;
  approvalRequestRequired: boolean;
  externalProviderConfirmationRequired: boolean;
  forbidden: boolean;
  reason: string;
};

export const classifyMoneyActionApprovalLevel = (actionId: string): AutonomousApprovalLevel => {
  if (MONEY_FLOW_LEVEL_0_OR_1_ACTIONS.includes(actionId as MoneyActionId)) return 1;
  if (MONEY_FLOW_LEVEL_2_ACTIONS.includes(actionId as MoneyActionId)) return 2;
  if (MONEY_FLOW_LEVEL_3_ACTIONS.includes(actionId as MoneyActionId)) return 3;
  if (MONEY_FLOW_LEVEL_4_ACTIONS.includes(actionId as MoneyActionId)) return 4;
  if (MONEY_FLOW_FORBIDDEN_ACTIONS.includes(actionId as MoneyActionId)) return 4;
  return 4;
};

export const classifyMoneyAction = (actionId: string): MoneyActionClassification => {
  const approvalLevel = classifyMoneyActionApprovalLevel(actionId);
  const forbidden = MONEY_FLOW_FORBIDDEN_ACTIONS.includes(actionId as MoneyActionId);
  const externalProviderConfirmationRequired = approvalLevel === 4 && !forbidden;
  return {
    actionId,
    approvalLevel,
    allowedAutonomousExecution: approvalLevel <= 2 && !forbidden,
    approvalRequestRequired: approvalLevel >= 3 && !forbidden,
    externalProviderConfirmationRequired,
    forbidden,
    reason: forbidden
      ? "forbidden_money_action"
      : approvalLevel === 4
        ? "level_4_owner_approval_and_external_provider_confirmation_required"
        : approvalLevel === 3
          ? "level_3_owner_approval_required"
          : approvalLevel === 2
            ? "sandbox_or_test_mode_only_no_real_money_movement"
            : "read_only_reconciliation_or_reporting",
  };
};

export const classifyMoneySurfaceState = (surfaceId: MoneyFlowSurfaceId | string) => {
  if (surfaceId === "premium_revenue" || surfaceId === "revenuecat_entitlements_readback" || surfaceId === "google_play_receipts_readback") {
    return "provider_readback_only" as const;
  }
  if (MONEY_PROVIDER_RELIABILITY_SURFACES.includes(surfaceId as typeof MONEY_PROVIDER_RELIABILITY_SURFACES[number])) {
    return "provider_webhook_reliability_guarded" as const;
  }
  if (surfaceId === "refunds_disputes_future" || surfaceId === "tax_compliance_future") {
    return "future_blocked" as const;
  }
  return MONEY_FLOW_SURFACES.includes(surfaceId as MoneyFlowSurfaceId)
    ? "scoped_write_capable_guarded" as const
    : "unknown_money_surface_level_4_review" as const;
};

export const sanitizeMoneyProofMetadata = (metadata: Record<string, unknown> | null | undefined) => (
  sanitizeAutonomousApprovalMetadata(metadata)
);

export const assertNoRealMoneyMutation = (input: {
  actionId: string;
  amountCents?: number | null;
  environment?: "production" | "sandbox" | "test" | "unknown" | null;
}) => {
  const classification = classifyMoneyAction(input.actionId);
  const productionLike = input.environment === "production" || input.environment === "unknown" || !input.environment;
  const nonZeroAmount = typeof input.amountCents === "number" && input.amountCents > 0;
  const realMoneyAttempt = productionLike && (classification.approvalLevel >= 3 || nonZeroAmount);

  return {
    ok: !classification.forbidden && !realMoneyAttempt,
    classification,
    failureReason: classification.forbidden
      ? "forbidden_money_action"
      : realMoneyAttempt
        ? "real_money_mutation_blocked"
        : null,
  };
};

export const assertProviderConfirmationRequired = (actionId: string) => {
  const classification = classifyMoneyAction(actionId);
  return {
    ok: classification.approvalLevel !== 4 || classification.externalProviderConfirmationRequired || classification.forbidden,
    classification,
    requirement: classification.approvalLevel === 4
      ? "level_4_external_provider_confirmation_required"
      : "not_required_for_level_0_1_2_3",
  };
};

export const validateMoneyActionScope = (input: {
  actionId: string;
  allowedWriteScope: readonly string[];
  externalProviderConfirmationId?: string | null;
  preflightFresh: boolean;
}) => {
  const classification = classifyMoneyAction(input.actionId);
  const failures: string[] = [];

  if (classification.forbidden) failures.push("forbidden_money_action");
  if (classification.approvalLevel >= 3 && !input.preflightFresh) failures.push("fresh_preflight_required");
  if (classification.approvalLevel === 4 && !input.externalProviderConfirmationId) {
    failures.push("external_provider_confirmation_required");
  }
  if (classification.approvalLevel >= 3 && !input.allowedWriteScope.length) failures.push("exact_write_scope_required");
  if (input.allowedWriteScope.some((scope) => /premium_entitlement_edit|manual_premium_grant|fake_|cashout_release|payout_release/i.test(scope))) {
    failures.push("forbidden_write_scope");
  }

  return {
    ok: failures.length === 0,
    classification,
    failures,
  };
};

export const classifyMoneyWriteScope = (writeScope: string) => {
  const normalized = writeScope.trim();
  const lower = normalized.toLowerCase();
  const allowed = MONEY_OPERATOR_ALLOWED_WRITE_TABLES.includes(normalized as MoneyOperatorWriteTable)
    || MONEY_OPERATOR_SAFE_FIX_ACTIONS.some((action) => lower === action.toLowerCase());
  const forbidden = MONEY_OPERATOR_FORBIDDEN_WRITE_SCOPES.some((scope) => lower.includes(scope.toLowerCase()));
  return {
    writeScope: normalized,
    allowed,
    forbidden,
    approvalLevel: (allowed && !forbidden ? 2 : 4) as AutonomousApprovalLevel,
    reason: forbidden
      ? "forbidden_money_operator_write_scope"
      : allowed
        ? "scoped_money_operator_write_allowed"
        : "unknown_money_write_scope_defaults_level_4",
  };
};

export const canMoneyOperatorWrite = (writeScope: string) => {
  const classification = classifyMoneyWriteScope(writeScope);
  return classification.allowed && !classification.forbidden;
};

export const sanitizeMoneyOperatorMetadata = sanitizeMoneyProofMetadata;

export const assertExternalConfirmationForLevel4 = (input: MoneyExternalConfirmationInput) => (
  validateMoneyExternalConfirmation(input)
);

export const validateMoneyOperatorAction = (input: {
  actionId: string;
  writeScopes: readonly string[];
  environmentMode: MoneyEnvironmentMode;
  amountCents?: number | null;
  externalConfirmation?: MoneyExternalConfirmationInput["confirmation"];
}) => {
  const classification = classifyMoneyAction(input.actionId);
  const scopeClassifications = input.writeScopes.map(classifyMoneyWriteScope);
  const failures: string[] = [];

  if (classification.forbidden) failures.push("forbidden_money_action");
  if (classification.approvalLevel >= 3) failures.push("approval_request_required_before_execution");
  if (input.environmentMode === "production" && typeof input.amountCents === "number" && input.amountCents > 0) {
    failures.push("real_money_mutation_blocked");
  }
  if (scopeClassifications.some((scope) => scope.forbidden)) failures.push("forbidden_write_scope");
  if (scopeClassifications.some((scope) => !scope.allowed)) failures.push("unknown_write_scope_defaults_level_4");

  const confirmationValidation = validateMoneyExternalConfirmation({
    actionId: input.actionId,
    approvalLevel: classification.approvalLevel,
    environmentMode: input.environmentMode,
    confirmation: input.externalConfirmation,
  });
  if (!confirmationValidation.ok) failures.push(...confirmationValidation.failures);

  return {
    ok: failures.length === 0,
    classification,
    scopeClassifications,
    confirmationValidation,
    failures: Array.from(new Set(failures)),
  };
};

export const buildMoneyApprovalRequest = (input: {
  actionId: string;
  allowedWriteScope: readonly string[];
  externalProviderConfirmationId?: string | null;
  proposedAction: string;
  reason: string;
  requestedByActorType: AutonomousApprovalRequesterType;
  riskSummary: string;
  title: string;
}) => {
  const classification = classifyMoneyAction(input.actionId);
  if (classification.forbidden) {
    return {
      approvalRequest: null,
      classification,
      executionStatus: "forbidden_money_action" as const,
    };
  }
  if (classification.approvalLevel < 3) {
    return {
      approvalRequest: null,
      classification,
      executionStatus: "approval_not_required_for_readonly_or_sandbox_proof" as const,
    };
  }

  const externalProviderConfirmationCopy = classification.approvalLevel === 4
    ? "Level 4 money movement requires owner approval plus external provider confirmation/readback before execution."
    : "Level 3 money setup/mutation requires owner approval and fresh preflight before execution.";

  return {
    approvalRequest: planLevelThreeOrFourApprovalRequest({
      actionId: input.actionId,
      allowedWriteScope: input.allowedWriteScope,
      approvalLevel: classification.approvalLevel as 3 | 4,
      forbiddenScope: [
        "manual Premium grant",
        "fake revenue or creator earnings",
        "fake payable balance or paid status",
        "real money movement outside approved provider confirmation",
        "provider secrets in logs or artifacts",
      ],
      killSwitchPlan: "money_flow_control emergency_stop blocks non-read-only money mutations; read-only reports remain allowed.",
      proofPlan: "Run proof:money-flow-control, guard:money-flow-control, and provider readback proof for any Level 4 external action.",
      proposedAction: input.proposedAction,
      reason: input.reason,
      requestedByActorType: input.requestedByActorType,
      riskSummary: `${input.riskSummary} ${externalProviderConfirmationCopy}`,
      rollbackPlan: "Do not execute until fresh preflight passes; if preflight or provider readback fails, mark request preflight_failed and leave money state unchanged.",
      systemId: MONEY_FLOW_CONTROL_SYSTEM_ID,
      title: input.title,
      validationPlan: "Verify exact scope match, unexpired approval, emergency state active, no forbidden scopes, no secrets, and external provider confirmation for Level 4.",
    }),
    classification,
    executionStatus: "approval_request_required" as const,
  };
};

export const getMoneyFlowControlSummary = () => ({
  systemId: MONEY_FLOW_CONTROL_SYSTEM_ID,
  status: MONEY_FLOW_CONTROL_STATUS,
  activationMode: "manual_cli",
  operatorStatus: "scoped_safe_write_operator_no_money_movement",
  surfaces: MONEY_FLOW_SURFACES,
  allowedReadonlyActions: MONEY_FLOW_LEVEL_0_OR_1_ACTIONS,
  allowedSandboxActions: MONEY_FLOW_LEVEL_2_ACTIONS,
  allowedSafeWriteTables: MONEY_OPERATOR_ALLOWED_WRITE_TABLES,
  allowedSafeFixes: MONEY_OPERATOR_SAFE_FIX_ACTIONS,
  providerReliabilitySurfaces: MONEY_PROVIDER_RELIABILITY_SURFACES,
  providerAccessBroker: "controlled_provider_api_and_dashboard_session_readback_no_secret_output",
  providerWebhookHealthRows: MONEY_PROVIDER_WEBHOOK_HEALTH_ROWS,
  level3OwnerApprovalRequired: MONEY_FLOW_LEVEL_3_ACTIONS,
  level4ExternalConfirmationRequired: MONEY_FLOW_LEVEL_4_ACTIONS,
  forbiddenActions: MONEY_FLOW_FORBIDDEN_ACTIONS,
  blockedActionLabels: MONEY_FLOW_BLOCKED_ACTION_LABELS,
  forbiddenWriteScopes: MONEY_OPERATOR_FORBIDDEN_WRITE_SCOPES,
  emergencyStop: "money_flow_control emergency_stop blocks all non-reconciliation money mutations",
});
