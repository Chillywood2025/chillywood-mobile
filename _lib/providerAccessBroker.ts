import {
  buildMoneyApprovalRequest,
  MONEY_FLOW_CONTROL_SYSTEM_ID,
  sanitizeMoneyOperatorMetadata,
  type ProviderWebhookErrorRateClassification,
} from "./moneyFlowControl";

export type ProviderAccessProvider =
  | "revenuecat"
  | "google_play"
  | "stripe_connect"
  | "stripe_merch"
  | "provider_readiness";

export type ProviderAccessCapability =
  | "webhook_endpoint_metadata"
  | "webhook_delivery_history"
  | "webhook_test_delivery"
  | "provider_readiness_audit"
  | "provider_dashboard_repair"
  | "provider_reconciliation_readback";

export type ProviderAccessMode =
  | "none"
  | "local_env"
  | "supabase_secret"
  | "host_env"
  | "github_secret"
  | "cloudflare_secret"
  | "provider_api_readonly"
  | "provider_api_test_mode_write"
  | "provider_dashboard_owner_session"
  | "provider_live_mutation_requires_approval";

export type ProviderAccessRisk =
  | "safe_readonly"
  | "safe_non_money_test"
  | "approval_required_dashboard_mutation"
  | "level_4_money_or_live_provider_risk"
  | "forbidden";

export const PROVIDER_ACCESS_BROKER_ID = "provider_access_broker" as const;
export const PROVIDER_ACCESS_BROKER_DISPLAY_NAME = "Provider Access Broker" as const;

export const PROVIDER_ACCESS_MODES: readonly ProviderAccessMode[] = [
  "none",
  "local_env",
  "supabase_secret",
  "host_env",
  "github_secret",
  "cloudflare_secret",
  "provider_api_readonly",
  "provider_api_test_mode_write",
  "provider_dashboard_owner_session",
  "provider_live_mutation_requires_approval",
] as const;

export type ProviderAccessCapabilityRow = {
  provider: ProviderAccessProvider;
  capabilities: ProviderAccessCapability[];
  safeAccessModes: ProviderAccessMode[];
  requiredSecretNames: string[];
  dashboardSessionFallback: boolean;
  sourceOfTruth: string;
};

export const PROVIDER_ACCESS_CAPABILITY_ROWS: ProviderAccessCapabilityRow[] = [
  {
    provider: "revenuecat",
    capabilities: ["webhook_endpoint_metadata", "webhook_delivery_history", "webhook_test_delivery", "provider_reconciliation_readback"],
    safeAccessModes: ["supabase_secret", "provider_api_readonly", "provider_dashboard_owner_session"],
    requiredSecretNames: ["revenuecat_readonly_api_credential", "revenuecat_project_or_integration_identifier", "revenuecat_webhook_shared_secret_name_only"],
    dashboardSessionFallback: true,
    sourceOfTruth: "provider_backed_premium_truth",
  },
  {
    provider: "google_play",
    capabilities: ["webhook_endpoint_metadata", "provider_readiness_audit", "provider_reconciliation_readback"],
    safeAccessModes: ["supabase_secret", "provider_api_readonly"],
    requiredSecretNames: ["google_play_readonly_service_account", "google_play_pubsub_topic_if_direct", "google_play_webhook_secret_name_only"],
    dashboardSessionFallback: false,
    sourceOfTruth: "revenuecat_mediated_unless_direct_google_notifications_enabled",
  },
  {
    provider: "stripe_connect",
    capabilities: ["webhook_endpoint_metadata", "webhook_delivery_history", "webhook_test_delivery", "provider_readiness_audit"],
    safeAccessModes: ["supabase_secret", "provider_api_readonly", "provider_api_test_mode_write"],
    requiredSecretNames: ["stripe_restricted_readonly_api_credential", "stripe_connect_webhook_signing_secret_name_only"],
    dashboardSessionFallback: true,
    sourceOfTruth: "stripe_connect_test_and_live_separated",
  },
  {
    provider: "stripe_merch",
    capabilities: ["webhook_endpoint_metadata", "webhook_delivery_history", "webhook_test_delivery", "provider_readiness_audit"],
    safeAccessModes: ["supabase_secret", "provider_api_readonly", "provider_api_test_mode_write"],
    requiredSecretNames: ["stripe_restricted_readonly_api_credential", "stripe_merch_webhook_signing_secret_name_only"],
    dashboardSessionFallback: true,
    sourceOfTruth: "stripe_physical_merch_only_test_and_live_separated",
  },
];

export const PROVIDER_ACCESS_FORBIDDEN_SCOPE = [
  "manual Premium grant",
  "Premium entitlement edit outside provider-backed flow",
  "provider product ID or price change",
  "Stripe live-mode switch",
  "real charge",
  "real payout",
  "real transfer",
  "invoice creation",
  "checkout session creation",
  "payment link creation",
  "cashout activation",
  "provider secret logging",
] as const;

export const classifyProviderAccessCapability = (input: {
  accessMode: ProviderAccessMode | string;
  capability: ProviderAccessCapability | string;
  provider: ProviderAccessProvider | string;
}) => {
  const row = PROVIDER_ACCESS_CAPABILITY_ROWS.find((entry) => entry.provider === input.provider);
  const capabilityKnown = !!row?.capabilities.includes(input.capability as ProviderAccessCapability);
  const accessModeKnown = PROVIDER_ACCESS_MODES.includes(input.accessMode as ProviderAccessMode);
  const canRead = !!row?.safeAccessModes.includes(input.accessMode as ProviderAccessMode)
    && capabilityKnown
    && input.capability !== "provider_dashboard_repair";

  return {
    provider: input.provider,
    capability: input.capability,
    accessMode: accessModeKnown ? input.accessMode : "none",
    capabilityKnown,
    canRead,
    canRunNonMoneyTest: canRead
      && input.capability === "webhook_test_delivery"
      && (input.accessMode === "provider_api_test_mode_write" || input.accessMode === "provider_dashboard_owner_session"),
    requiredSecretNames: row?.requiredSecretNames ?? [],
    dashboardOwnerSessionMayBeRequired: row?.dashboardSessionFallback ?? false,
    sourceOfTruth: row?.sourceOfTruth ?? "unknown_provider_access",
  };
};

export const classifyProviderAccessRisk = (input: {
  accessMode: ProviderAccessMode | string;
  capability: ProviderAccessCapability | string;
  liveMode?: boolean;
  moneyMovementRequested?: boolean;
  providerDashboardMutationRequested?: boolean;
  providerProductMutationRequested?: boolean;
}): ProviderAccessRisk => {
  if (input.providerProductMutationRequested) return "forbidden";
  if (input.moneyMovementRequested || input.liveMode || input.accessMode === "provider_live_mutation_requires_approval") {
    return "level_4_money_or_live_provider_risk";
  }
  if (input.providerDashboardMutationRequested || input.capability === "provider_dashboard_repair") {
    return "approval_required_dashboard_mutation";
  }
  if (input.capability === "webhook_test_delivery") return "safe_non_money_test";
  return "safe_readonly";
};

export const canProviderAccessAutoRead = (input: {
  accessMode: ProviderAccessMode | string;
  capability: ProviderAccessCapability | string;
  provider: ProviderAccessProvider | string;
}) => classifyProviderAccessCapability(input).canRead;

export const canProviderAccessAutoRepair = (input: {
  accessMode: ProviderAccessMode | string;
  capability: ProviderAccessCapability | string;
  liveMode?: boolean;
  moneyMovementRequested?: boolean;
  providerDashboardMutationRequested?: boolean;
  providerProductMutationRequested?: boolean;
}) => {
  const risk = classifyProviderAccessRisk(input);
  return risk === "safe_readonly" || risk === "safe_non_money_test";
};

export const buildProviderAccessRequest = (input: {
  capability: ProviderAccessCapability | string;
  oldValueRedacted?: string | null;
  provider: ProviderAccessProvider | string;
  proposedSafeValue?: string | null;
  reason: string;
}) => buildMoneyApprovalRequest({
  actionId: "change_money_facing_config",
  allowedWriteScope: [
    `provider_dashboard:${input.provider}:${input.capability}`,
    "provider_access_audit_events",
    "money_operator_events",
    "money_provider_sync_status",
  ],
  proposedAction: `Review provider dashboard/API setting for ${input.provider}:${input.capability}; old=${input.oldValueRedacted ?? "redacted"} proposed=${input.proposedSafeValue ?? "redacted"}.`,
  reason: input.reason,
  requestedByActorType: "money_flow_control",
  riskSummary: "Provider access repair can affect webhook delivery and must not mutate provider dashboard state without owner/super-admin approval.",
  title: `Provider Access Broker approval required: ${input.provider}`,
});

export const sanitizeProviderAccessProof = (metadata: Record<string, unknown> | null | undefined) => (
  sanitizeMoneyOperatorMetadata({
    ...(metadata ?? {}),
    provider_access_broker: true,
    moneyMoved: false,
    providerDashboardMutated: false,
  })
);

export const summarizeProviderAccessBroker = () => ({
  systemId: MONEY_FLOW_CONTROL_SYSTEM_ID,
  brokerId: PROVIDER_ACCESS_BROKER_ID,
  providers: PROVIDER_ACCESS_CAPABILITY_ROWS.map((row) => row.provider),
  accessModes: PROVIDER_ACCESS_MODES,
  capabilities: Array.from(new Set(PROVIDER_ACCESS_CAPABILITY_ROWS.flatMap((row) => row.capabilities))),
  forbiddenScope: PROVIDER_ACCESS_FORBIDDEN_SCOPE,
  defaultRisk: "unknown access or provider mutation requires owner approval",
  moneyMovement: "blocked",
  dashboardMutation: "approval_required",
} as const);

export const classifyProviderDeliveryReadback = (classification: ProviderWebhookErrorRateClassification) => ({
  classification,
  providerAccessHealth: classification === "healthy"
    ? "synced"
    : classification === "unknown"
      ? "unknown_requires_dashboard_or_api_readback"
      : "requires_review",
  moneyMoved: false,
});
