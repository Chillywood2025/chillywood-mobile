import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;

const SYSTEM_ID = "money_flow_control";
const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-money-operator-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
} as const;
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" } as const;

const SECRET_PATTERN = /(secret|token|password|authorization|service[_-]?role|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret|signed[_-]?url|account[_-]?number|routing[_-]?number|iban|swift)/i;
const LONG_SECRET_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

const SAFE_ACTIONS = new Set([
  "read_only_reconciliation_report",
  "missing_provider_data_detection",
  "stale_provider_sync_detection",
  "ledger_consistency_check",
  "duplicate_event_detection",
  "admin_readonly_summary",
  "approval_request_creation",
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
]);
const LEVEL_3_ACTIONS = new Set([
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
]);
const LEVEL_4_ACTIONS = new Set([
  "real_customer_charge",
  "real_payout",
  "real_transfer",
  "real_cashout",
  "production_stripe_mode_switch",
  "public_payment_launch",
  "provider_plan_or_add_on",
  "legal_compliance_tax_activation",
  "public_revenue_or_payout_claim",
]);
const FORBIDDEN_ACTIONS = new Set([
  "manual_premium_grant",
  "fake_revenue",
  "fake_creator_earnings",
  "fake_payable_balance",
  "fake_paid_status",
  "fake_transfer_complete",
]);
const ALLOWED_ENVIRONMENTS = new Set(["sandbox", "test", "production"]);
const PROVIDER_WEBHOOKS = [
  {
    provider: "revenuecat",
    capability: "revenuecat_webhook_delivery",
    surface: "revenuecat_webhook_delivery",
    functionName: "revenuecat-webhook",
    expectedHost: "bmkkhihfbmsnnmcqkoly.supabase.co",
    expectedPath: "/functions/v1/revenuecat-webhook",
    sourceOfTruth: "revenuecat_provider_backed_premium_truth",
    expectedMissingAuth: "401 invalid_signature",
    validTestExpectation: "200 test_received, premiumGranted=false, liveMoneyAction=false",
    requiredSecretNames: ["REVENUECAT_WEBHOOK_SECRET"],
  },
  {
    provider: "google_play",
    capability: "google_play_webhook_delivery",
    surface: "google_play_webhook_delivery",
    functionName: "google-play-webhook",
    expectedHost: "bmkkhihfbmsnnmcqkoly.supabase.co",
    expectedPath: "/functions/v1/google-play-webhook",
    sourceOfTruth: "revenuecat_mediated_or_readiness_only",
    expectedMissingAuth: "200 setup_required when GOOGLE_PLAY_WEBHOOK_SECRET is absent, otherwise 401 invalid_signature",
    validTestExpectation: "readiness-only unless this stack enables Google Play direct webhook processing",
    requiredSecretNames: ["GOOGLE_PLAY_WEBHOOK_SECRET"],
  },
  {
    provider: "stripe_connect",
    capability: "stripe_connect_webhook_delivery",
    surface: "stripe_connect_webhook_delivery",
    functionName: "stripe-connect-webhook",
    expectedHost: "bmkkhihfbmsnnmcqkoly.supabase.co",
    expectedPath: "/functions/v1/stripe-connect-webhook",
    sourceOfTruth: "stripe_connect_foundation_test_and_live_separated",
    expectedMissingAuth: "400 invalid_signature",
    validTestExpectation: "test-mode signed event only; no payout, transfer, checkout, or live-money action",
    requiredSecretNames: ["STRIPE_WEBHOOK_SECRET"],
  },
  {
    provider: "stripe_merch",
    capability: "stripe_merch_webhook_delivery",
    surface: "stripe_merch_webhook_delivery",
    functionName: "stripe-merch-webhook",
    expectedHost: "bmkkhihfbmsnnmcqkoly.supabase.co",
    expectedPath: "/functions/v1/stripe-merch-webhook",
    sourceOfTruth: "stripe_merch_physical_goods_only_test_and_live_separated",
    expectedMissingAuth: "400 invalid_signature",
    validTestExpectation: "sandbox signed physical-merch event only; no digital access, Premium, payout, or cashout",
    requiredSecretNames: ["STRIPE_MERCH_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET fallback"],
  },
] as const;

const toText = (value: unknown) => String(value ?? "").trim();
const safeLabel = (value: unknown, fallback = "unknown") => {
  const label = toText(value).toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 120);
  return label || fallback;
};
const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });

const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left: string, right: string) => {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const authenticateOperator = async (request: Request) => {
  const token = toText(request.headers.get("x-money-operator-token"));
  if (!token) return false;
  const actualHash = await sha256Hex(token);
  return constantTimeEqual(actualHash, readRequiredEnv("MONEY_OPERATOR_TOKEN_SHA256"));
};

const createAdminClient = (): SupabaseClientLike => createClient(
  readRequiredEnv("SUPABASE_URL"),
  readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const containsSecretLikeValue = (value: unknown): boolean => {
  if (typeof value === "string") return SECRET_PATTERN.test(value) || LONG_SECRET_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsSecretLikeValue);
  if (value && typeof value === "object") {
    return Object.entries(value as JsonObject).some(([key, entry]) => SECRET_PATTERN.test(key) || containsSecretLikeValue(entry));
  }
  return false;
};

const safeMetadata = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([key, entry]) => !SECRET_PATTERN.test(key) && !containsSecretLikeValue(entry))
      .slice(0, 48)
      .map(([key, entry]) => [key, typeof entry === "string" ? entry.replace(LONG_SECRET_PATTERN, "[redacted]") : entry]),
  );
};

const environmentMode = (value: unknown) => {
  const mode = safeLabel(value, "test");
  return ALLOWED_ENVIRONMENTS.has(mode) ? mode : "test";
};

const classifyMoneyAction = (actionId: string) => {
  if (FORBIDDEN_ACTIONS.has(actionId)) return { approvalLevel: 4, forbidden: true, reason: "forbidden_money_action" };
  if (LEVEL_4_ACTIONS.has(actionId)) return { approvalLevel: 4, forbidden: false, reason: "level_4_owner_approval_and_external_provider_confirmation_required" };
  if (LEVEL_3_ACTIONS.has(actionId)) return { approvalLevel: 3, forbidden: false, reason: "level_3_owner_approval_required" };
  if (SAFE_ACTIONS.has(actionId)) return { approvalLevel: 2, forbidden: false, reason: "safe_scoped_money_operator_action" };
  return { approvalLevel: 4, forbidden: false, reason: "unknown_money_action_defaults_level_4" };
};

const providerWebhookConfig = (provider: string) => (
  PROVIDER_WEBHOOKS.find((entry) => entry.provider === provider) ?? null
);

const classifyProviderDeliveryErrorRate = (value: unknown) => {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "unknown";
  if (percent <= 0) return "healthy";
  if (percent < 25) return "degraded";
  if (percent < 100) return "critical";
  return "outage";
};

const providerSyncStatusForClassification = (classification: string) => {
  if (classification === "healthy") return "synced";
  if (classification === "degraded" || classification === "critical") return "failed";
  if (classification === "outage") return "blocked";
  return "stale";
};

const classifyGooglePlaySourceTruth = (value: unknown) => {
  const mode = safeLabel(value, "revenuecat_mediated");
  if (["direct_source_of_truth", "revenuecat_mediated", "readiness_only", "unused_stale"].includes(mode)) return mode;
  return "revenuecat_mediated";
};

const endpointParts = (input: unknown) => {
  const value = toText(input);
  if (!value) return { host: null as string | null, path: null as string | null };
  try {
    const parsed = new URL(value);
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    const [host, ...pathParts] = value.replace(/^https?:\/\//, "").split("/");
    return { host: safeLabel(host, "unknown"), path: pathParts.length ? `/${pathParts.join("/")}`.slice(0, 160) : null };
  }
};

const safeProviderIntegrationIssues = async (payload: JsonObject, providerConfig: typeof PROVIDER_WEBHOOKS[number]) => {
  const integrations = Array.isArray(payload.dashboard_integrations)
    ? payload.dashboard_integrations.filter((entry) => entry && typeof entry === "object").slice(0, 12) as JsonObject[]
    : [];
  const activeIntegrations = integrations.filter((entry) => entry.active !== false && safeLabel(entry.status ?? "active") !== "disabled");
  const issues: string[] = [];
  const redactedIntegrations = [];

  for (const entry of activeIntegrations) {
    const endpoint = endpointParts(entry.endpoint_url ?? entry.endpointUrl ?? `${toText(entry.endpoint_host ?? entry.endpointHost) || providerConfig.expectedHost}${toText(entry.endpoint_path ?? entry.endpointPath) || ""}`);
    const integrationId = toText(entry.integration_id_hash ?? entry.integrationIdHash ?? entry.integration_id ?? entry.integrationId);
    redactedIntegrations.push({
      active: true,
      endpoint_host: endpoint.host,
      endpoint_path: endpoint.path,
      event_type: safeLabel(entry.event_type ?? entry.eventType ?? "unknown"),
      integration_id_hash: integrationId ? await sha256Hex(integrationId) : null,
    });
    if (endpoint.host && endpoint.host !== providerConfig.expectedHost) issues.push("old_supabase_project_url_or_wrong_host");
    if (endpoint.path && endpoint.path !== providerConfig.expectedPath) issues.push("wrong_function_path");
  }

  if (activeIntegrations.length > 1) issues.push("duplicate_webhook_integration_detection");
  if (payload.stale_integration_detected === true) issues.push("stale_provider_dashboard_integration_detection");

  return {
    issues: Array.from(new Set(issues)),
    integrations: redactedIntegrations,
    ownerActionRequired: issues.length > 0,
  };
};

const safeProviderWebhookRows = () => PROVIDER_WEBHOOKS.map((entry) => ({
  provider: entry.provider,
  capability: entry.capability,
  surface: entry.surface,
  functionName: entry.functionName,
  expectedEndpointHost: entry.expectedHost,
  expectedEndpointPath: entry.expectedPath,
  sourceOfTruth: entry.sourceOfTruth,
  expectedMissingAuth: entry.expectedMissingAuth,
  validTestExpectation: entry.validTestExpectation,
  requiredSecretNames: entry.requiredSecretNames,
  webhookUrlPath: `/functions/v1/${entry.functionName}`,
}));

const rejectSecretPayload = (payload: JsonObject) => {
  if (containsSecretLikeValue(payload)) throw new Error("secret_like_payload_blocked");
};

const assertNoRealMoneyMutation = (payload: JsonObject) => {
  const actionId = safeLabel(payload.action_id ?? payload.actionId ?? payload.money_action_id ?? payload.moneyActionId);
  const classification = classifyMoneyAction(actionId);
  const mode = environmentMode(payload.environment_mode ?? payload.environmentMode);
  const amountCents = Number(payload.amount_cents ?? payload.amountCents ?? 0);
  if (classification.forbidden) throw new Error("forbidden_money_action");
  if (mode === "production" && Number.isFinite(amountCents) && amountCents > 0) throw new Error("real_money_mutation_blocked");
  return { actionId, classification, environmentMode: mode };
};

const insertEvent = async (client: SupabaseClientLike, event: JsonObject) => {
  const { data, error } = await client
    .from("money_operator_events")
    .insert({
      system_id: SYSTEM_ID,
      event_type: safeLabel(event.event_type ?? "operator_event"),
      action_id: event.action_id ? safeLabel(event.action_id) : null,
      surface: event.surface ? safeLabel(event.surface) : null,
      severity: safeLabel(event.severity ?? "info"),
      result: safeLabel(event.result ?? "recorded"),
      environment_mode: environmentMode(event.environment_mode),
      money_moved: false,
      external_confirmation_required: Boolean(event.external_confirmation_required),
      external_confirmation_status: safeLabel(event.external_confirmation_status ?? "not_required"),
      blocked_reason: event.blocked_reason ? safeLabel(event.blocked_reason) : null,
      metadata: safeMetadata(event.metadata),
    })
    .select("id,event_type,result,created_at,money_moved")
    .single();
  if (error) throw error;
  return data as JsonObject;
};

const recordProviderFinding = async (client: SupabaseClientLike, input: {
  environmentMode: string;
  findingType: string;
  metadata: JsonObject;
  providerConfig: typeof PROVIDER_WEBHOOKS[number];
  severity: "info" | "warning" | "error" | "critical";
}) => {
  const { data, error } = await client
    .from("money_reconciliation_findings")
    .insert({
      system_id: SYSTEM_ID,
      finding_type: input.findingType,
      severity: input.severity,
      surface: input.providerConfig.surface,
      status: "requires_review",
      environment_mode: input.environmentMode,
      money_moved: false,
      external_confirmation_required: false,
      external_confirmation_status: "not_required",
      metadata: safeMetadata({
        provider: input.providerConfig.provider,
        capability: input.providerConfig.capability,
        function_name: input.providerConfig.functionName,
        ...input.metadata,
        provider_dashboard_mutated: false,
        money_moved: false,
      }),
    })
    .select("id,finding_type,status,money_moved")
    .single();
  if (error) throw error;
  return data as JsonObject;
};

const createApprovalRequest = async (client: SupabaseClientLike, payload: JsonObject) => {
  const actionId = safeLabel(payload.money_action_id ?? payload.action_id ?? payload.actionId);
  const classification = classifyMoneyAction(actionId);
  if (classification.forbidden) throw new Error("forbidden_money_action");
  if (classification.approvalLevel < 3) throw new Error("approval_not_required_for_safe_money_action");

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const allowedWriteScope = Array.isArray(payload.allowed_write_scope)
    ? payload.allowed_write_scope.map((entry) => toText(entry)).filter(Boolean).slice(0, 32)
    : ["approval_request_only"];
  const forbiddenScope = [
    "manual Premium grant",
    "fake revenue or payable balance",
    "real money movement without Level 4 external provider confirmation",
    "provider secrets in logs/artifacts",
  ];
  const { data, error } = await client
    .from("autonomous_approval_requests")
    .insert({
      system_id: SYSTEM_ID,
      action_id: actionId,
      requested_by_actor_type: "money_flow_control",
      approval_level: classification.approvalLevel,
      status: "pending",
      title: toText(payload.title) || `Money Flow Control approval required: ${actionId}`,
      reason: toText(payload.reason) || classification.reason,
      risk_summary: toText(payload.risk_summary) || "Money action requires owner/super-admin approval; real money movement also requires external provider confirmation.",
      proposed_action: toText(payload.proposed_action) || "Create approval request only; do not move money.",
      allowed_write_scope: allowedWriteScope,
      forbidden_scope: forbiddenScope,
      rollback_plan: toText(payload.rollback_plan) || "If fresh preflight or provider readback fails, mark request preflight_failed and leave money state unchanged.",
      kill_switch_plan: toText(payload.kill_switch_plan) || "money_flow_control emergency_stop blocks non-read-only money mutations.",
      proof_plan: toText(payload.proof_plan) || "Run proof:money-flow-control, proof:money-operator-write-scope, proof:money-external-confirmation, and guard:money-flow-control.",
      validation_plan: toText(payload.validation_plan) || "Verify exact scope, unexpired approval, fresh preflight, no secrets, and external provider confirmation for Level 4.",
      expires_at: expiresAt,
      metadata: safeMetadata(payload.metadata),
    })
    .select("id,status,approval_level,action_id,expires_at")
    .single();
  if (error) throw error;

  const eventError = await client.from("autonomous_approval_request_events").insert({
    request_id: data.id,
    event_type: "requested",
    actor_type: "money_flow_control",
    event_summary: "Money Flow Control created a Level 3/4 approval request and stopped before execution.",
    metadata: { action_id: actionId, money_moved: false },
  });
  if (eventError.error) throw eventError.error;
  return data as JsonObject;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS, status: 204 });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  try {
    if (!(await authenticateOperator(request))) return jsonResponse(401, { error: "money_operator_token_required" });
    const payload = await request.json().catch(() => ({})) as JsonObject;
    rejectSecretPayload(payload);
    const action = safeLabel(payload.action);
    const client = createAdminClient();

    if (action === "health_snapshot") {
      const mode = environmentMode(payload.environment_mode);
      const { data, error } = await client
        .from("money_flow_health_snapshots")
        .insert({
          system_id: SYSTEM_ID,
          health_state: "healthy",
          eligible_for_safe_writes: true,
          latest_operator_action: "health_snapshot",
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata(payload.metadata),
        })
        .select("id,health_state,eligible_for_safe_writes,created_at,money_moved")
        .single();
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, snapshot: data, moneyMoved: false });
    }

    if (action === "reconciliation_plan") {
      return jsonResponse(200, {
        ok: true,
        action,
        systemId: SYSTEM_ID,
        plannedWrites: ["money_reconciliation_runs", "money_reconciliation_findings", "money_operator_events"],
        forbiddenWrites: ["payout release", "charge customer", "manual Premium grant", "fake revenue", "mark paid"],
        moneyMoved: false,
      });
    }

    if (action === "provider_webhook_health") {
      const mode = environmentMode(payload.environment_mode);
      const snapshot = await insertEvent(client, {
        event_type: "provider_webhook_health_snapshot",
        action_id: "mark_provider_sync_status",
        environment_mode: mode,
        result: "reported",
        metadata: {
          providers: PROVIDER_WEBHOOKS.map((entry) => entry.provider),
          money_moved: false,
          secrets_returned: false,
          provider_dashboard_mutated: false,
        },
      });
      return jsonResponse(200, {
        ok: true,
        action,
        continuousReadiness: "watch_once_supported_manual_or_scheduler_safe",
        providerWebhooks: safeProviderWebhookRows(),
        snapshot,
        moneyMoved: false,
      });
    }

    if (action === "provider_webhook_test_plan") {
      return jsonResponse(200, {
        ok: true,
        action,
        providerWebhooks: safeProviderWebhookRows(),
        tests: [
          "missing/invalid RevenueCat shared secret must fail closed with no Premium grant",
          "Google Play direct webhook is monitored as readiness-only when RevenueCat is entitlement source of truth",
          "Stripe invalid signatures must fail closed",
          "Stripe test-mode events cannot claim production readiness",
          "dashboard/provider mutation requires autonomous approval request",
          "100% provider webhook error rate records failed/blocked status and reconciliation finding",
          "duplicate provider webhook event replay records duplicate detection without entitlement/ledger/payout duplication",
          "RevenueCat active while Supabase Premium stale records stale_readback and requests provider replay/readback without manual grant",
        ],
        moneyMoved: false,
      });
    }

    if (action === "record_provider_webhook_delivery_status") {
      const mode = environmentMode(payload.environment_mode);
      const provider = safeLabel(payload.provider);
      const providerConfig = providerWebhookConfig(provider);
      if (!providerConfig) return jsonResponse(400, { error: "unsupported_provider_webhook" });
      const errorRateClassification = classifyProviderDeliveryErrorRate(payload.error_rate_percent ?? payload.errorRatePercent);
      const derivedSyncStatus = providerSyncStatusForClassification(errorRateClassification);
      const syncStatus = safeLabel(payload.sync_status ?? payload.status ?? derivedSyncStatus);
      if (!["stale", "synced", "failed", "blocked"].includes(syncStatus)) return jsonResponse(400, { error: "invalid_sync_status" });
      const dashboardIssues = await safeProviderIntegrationIssues(payload, providerConfig);
      const { data: statusRow, error: statusError } = await client
        .from("money_provider_sync_status")
        .upsert({
          system_id: SYSTEM_ID,
          provider: providerConfig.provider,
          capability: providerConfig.capability,
          sync_status: syncStatus,
          environment_mode: mode,
          money_moved: false,
          last_checked_at: new Date().toISOString(),
          last_success_at: syncStatus === "synced" ? new Date().toISOString() : null,
          failure_reason: syncStatus === "failed" || syncStatus === "blocked" ? safeLabel(payload.failure_reason ?? "provider_webhook_delivery_issue") : null,
          metadata: safeMetadata({
            ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata as JsonObject : {}),
            function_name: providerConfig.functionName,
            provider_surface: providerConfig.surface,
            source_of_truth: providerConfig.provider === "google_play"
              ? classifyGooglePlaySourceTruth(payload.google_play_source_truth ?? payload.googlePlaySourceTruth)
              : providerConfig.sourceOfTruth,
            error_rate_classification: errorRateClassification,
            error_rate_percent: Number.isFinite(Number(payload.error_rate_percent ?? payload.errorRatePercent)) ? Number(payload.error_rate_percent ?? payload.errorRatePercent) : null,
            last_failure_code: safeLabel(payload.last_failure_code ?? payload.lastFailureCode ?? "unknown"),
            last_success_at: toText(payload.last_success_at ?? payload.lastSuccessAt) || null,
            endpoint_host: toText(payload.endpoint_host ?? payload.endpointHost) || null,
            endpoint_path: toText(payload.endpoint_path ?? payload.endpointPath) || null,
            event_type: safeLabel(payload.event_type ?? payload.eventType ?? "unknown"),
            dashboard_issues: dashboardIssues.issues,
            provider_dashboard_mutated: false,
            premium_manually_granted: false,
            money_moved: false,
          }),
        }, { onConflict: "provider,capability,environment_mode" })
        .select("id,provider,capability,sync_status,environment_mode,money_moved")
        .single();
      if (statusError) throw statusError;

      let finding: JsonObject | null = null;
      if (syncStatus === "failed" || syncStatus === "blocked") {
        finding = await recordProviderFinding(client, {
          environmentMode: mode,
          findingType: "provider_webhook_delivery_issue",
          providerConfig,
          severity: syncStatus === "blocked" ? "error" : "warning",
          metadata: {
            failure_reason: payload.failure_reason ?? "provider_webhook_delivery_issue",
            error_rate_classification: errorRateClassification,
            dashboard_issues: dashboardIssues.issues,
          },
        });
      }

      let approvalRequest: JsonObject | null = null;
      if (dashboardIssues.ownerActionRequired || payload.provider_dashboard_mutation_required === true || payload.providerDashboardMutationRequired === true) {
        approvalRequest = await createApprovalRequest(client, {
          money_action_id: "change_money_facing_config",
          title: `Provider dashboard repair approval required: ${providerConfig.provider}`,
          reason: "Provider dashboard delivery errors or stale/duplicate integrations require owner approval before dashboard mutation.",
          risk_summary: "Provider dashboard webhook changes can affect billing/event delivery and must not be autonomous.",
          proposed_action: `Review ${providerConfig.provider} dashboard webhook endpoint, event selection, shared auth, and duplicate integrations.`,
          allowed_write_scope: [
            `provider_dashboard:${providerConfig.provider}:webhook_configuration`,
            "money_operator_events",
            "money_reconciliation_findings",
            "money_provider_sync_status",
          ],
          metadata: {
            provider: providerConfig.provider,
            dashboard_issues: dashboardIssues.issues,
            provider_dashboard_mutated: false,
            money_moved: false,
          },
        });
      }

      const event = await insertEvent(client, {
        event_type: "provider_webhook_delivery_status_recorded",
        action_id: "mark_provider_sync_status",
        surface: providerConfig.surface,
        environment_mode: mode,
        result: syncStatus,
        metadata: {
          provider: providerConfig.provider,
          capability: providerConfig.capability,
          function_name: providerConfig.functionName,
          error_rate_classification: errorRateClassification,
          finding_created: !!finding,
          approval_request_created: !!approvalRequest,
        },
      });
      return jsonResponse(200, { ok: true, action, status: statusRow, finding, approvalRequest, event, errorRateClassification, dashboardIssues, moneyMoved: false });
    }

    if (action === "provider_delivery_history_readback") {
      const mode = environmentMode(payload.environment_mode);
      const provider = safeLabel(payload.provider);
      const providerConfig = providerWebhookConfig(provider);
      if (!providerConfig) return jsonResponse(400, { error: "unsupported_provider_webhook" });
      const dashboardAccessAvailable = payload.dashboard_access_available === true || payload.provider_api_access_available === true;
      const errorRateClassification = classifyProviderDeliveryErrorRate(payload.error_rate_percent ?? payload.errorRatePercent);
      const syncStatus = providerSyncStatusForClassification(errorRateClassification);
      const dashboardIssues = await safeProviderIntegrationIssues(payload, providerConfig);

      const event = await insertEvent(client, {
        event_type: "provider_delivery_history_readback",
        action_id: "provider_delivery_history_readback",
        surface: providerConfig.surface,
        environment_mode: mode,
        result: dashboardAccessAvailable ? errorRateClassification : "owner_action_required",
        metadata: {
          provider: providerConfig.provider,
          endpoint_host: toText(payload.endpoint_host ?? payload.endpointHost) || null,
          endpoint_path: toText(payload.endpoint_path ?? payload.endpointPath) || null,
          event_type: safeLabel(payload.event_type ?? payload.eventType ?? "unknown"),
          integration_id_hash: toText(payload.integration_id_hash ?? payload.integrationIdHash) || null,
          last_failure_code: safeLabel(payload.last_failure_code ?? payload.lastFailureCode ?? "unknown"),
          last_success_at: toText(payload.last_success_at ?? payload.lastSuccessAt) || null,
          error_rate_classification: errorRateClassification,
          dashboard_access_available: dashboardAccessAvailable,
          dashboard_issues: dashboardIssues.issues,
          money_moved: false,
        },
      });

      let status: JsonObject | null = null;
      let finding: JsonObject | null = null;
      if (dashboardAccessAvailable) {
        const { data, error } = await client
          .from("money_provider_sync_status")
          .upsert({
            system_id: SYSTEM_ID,
            provider: providerConfig.provider,
            capability: providerConfig.capability,
            sync_status: syncStatus,
            environment_mode: mode,
            money_moved: false,
            last_checked_at: new Date().toISOString(),
            last_success_at: syncStatus === "synced" ? new Date().toISOString() : null,
            failure_reason: syncStatus === "failed" || syncStatus === "blocked" ? "provider_delivery_error_rate" : null,
            metadata: safeMetadata({
              error_rate_classification: errorRateClassification,
              endpoint_host: toText(payload.endpoint_host ?? payload.endpointHost) || null,
              endpoint_path: toText(payload.endpoint_path ?? payload.endpointPath) || null,
              event_type: safeLabel(payload.event_type ?? payload.eventType ?? "unknown"),
              integration_id_hash: toText(payload.integration_id_hash ?? payload.integrationIdHash) || null,
              last_failure_code: safeLabel(payload.last_failure_code ?? payload.lastFailureCode ?? "unknown"),
              last_success_at: toText(payload.last_success_at ?? payload.lastSuccessAt) || null,
              dashboard_issues: dashboardIssues.issues,
              provider_dashboard_mutated: false,
            }),
          }, { onConflict: "provider,capability,environment_mode" })
          .select("id,provider,capability,sync_status,environment_mode,money_moved")
          .single();
        if (error) throw error;
        status = data as JsonObject;
        if (syncStatus === "failed" || syncStatus === "blocked" || dashboardIssues.issues.length > 0) {
          finding = await recordProviderFinding(client, {
            environmentMode: mode,
            findingType: dashboardIssues.issues.length ? "provider_dashboard_integration_issue" : "provider_delivery_error_rate",
            providerConfig,
            severity: syncStatus === "blocked" ? "error" : "warning",
            metadata: {
              error_rate_classification: errorRateClassification,
              dashboard_issues: dashboardIssues.issues,
              last_failure_code: payload.last_failure_code ?? payload.lastFailureCode ?? "unknown",
            },
          });
        }
      }

      let approvalRequest: JsonObject | null = null;
      if (!dashboardAccessAvailable || dashboardIssues.ownerActionRequired || syncStatus === "blocked") {
        approvalRequest = await createApprovalRequest(client, {
          money_action_id: "change_money_facing_config",
          title: `Provider webhook delivery owner action required: ${providerConfig.provider}`,
          reason: dashboardAccessAvailable
            ? "Provider dashboard integration issue or outage requires owner-approved dashboard repair."
            : "Provider dashboard/API access is unavailable to the operator; owner must read provider delivery history and repair if needed.",
          risk_summary: "Provider webhook dashboard changes affect billing/event delivery and cannot be autonomous.",
          proposed_action: `Owner should review ${providerConfig.provider} latest webhook failures, endpoint host/path, event type, integration id, duplicate/stale integrations, and shared auth configuration.`,
          allowed_write_scope: [
            `provider_dashboard:${providerConfig.provider}:webhook_configuration_review`,
            "money_operator_events",
            "money_reconciliation_findings",
            "money_provider_sync_status",
          ],
          metadata: {
            provider: providerConfig.provider,
            dashboard_access_available: dashboardAccessAvailable,
            dashboard_issues: dashboardIssues.issues,
            error_rate_classification: errorRateClassification,
            provider_dashboard_mutated: false,
            money_moved: false,
          },
        });
      }

      return jsonResponse(200, {
        ok: true,
        action,
        provider: providerConfig.provider,
        sourceOfTruth: providerConfig.provider === "google_play"
          ? classifyGooglePlaySourceTruth(payload.google_play_source_truth ?? payload.googlePlaySourceTruth)
          : providerConfig.sourceOfTruth,
        errorRateClassification,
        dashboardIssues,
        ownerAction: dashboardAccessAvailable ? null : "provider_dashboard_or_api_access_required",
        status,
        finding,
        approvalRequest,
        event,
        moneyMoved: false,
      });
    }

    if (action === "provider_dashboard_repair_request") {
      const provider = safeLabel(payload.provider);
      const providerConfig = providerWebhookConfig(provider);
      if (!providerConfig) return jsonResponse(400, { error: "unsupported_provider_webhook" });
      const approvalRequest = await createApprovalRequest(client, {
        ...payload,
        money_action_id: "change_money_facing_config",
        title: toText(payload.title) || `Provider dashboard repair approval required: ${providerConfig.provider}`,
        reason: toText(payload.reason) || "Provider webhook dashboard URL/secret/event selection repair requires owner approval before mutation.",
        risk_summary: toText(payload.risk_summary) || "Provider dashboard mutation can affect billing/webhook delivery and must not be autonomous.",
        proposed_action: toText(payload.proposed_action) || `Review and repair ${providerConfig.provider} webhook dashboard configuration only after approval.`,
        allowed_write_scope: [
          `provider_dashboard:${providerConfig.provider}:webhook_configuration`,
          "money_operator_events",
          "money_reconciliation_findings",
        ],
        metadata: {
          provider: providerConfig.provider,
          function_name: providerConfig.functionName,
          required_secret_names: providerConfig.requiredSecretNames,
          money_moved: false,
        },
      });
      const event = await insertEvent(client, {
        event_type: "provider_dashboard_repair_request_created",
        action_id: "change_money_facing_config",
        surface: providerConfig.provider,
        result: "pending_owner_approval",
        metadata: {
          request_id: approvalRequest.id,
          provider_dashboard_mutated: false,
        },
      });
      return jsonResponse(200, { ok: true, action, approvalRequest, event, moneyMoved: false });
    }

    if (action === "provider_webhook_reliability_report") {
      const { data: statuses, error } = await client
        .from("money_provider_sync_status")
        .select("provider,capability,sync_status,environment_mode,last_checked_at,last_success_at,failure_reason,money_moved,metadata")
        .in("provider", PROVIDER_WEBHOOKS.map((entry) => entry.provider))
        .order("last_checked_at", { ascending: false })
        .limit(32);
      if (error) throw error;
      return jsonResponse(200, {
        ok: true,
        action,
        providerWebhooks: safeProviderWebhookRows(),
        statuses: (statuses ?? []).map((row: JsonObject) => ({
          provider: row.provider,
          capability: row.capability,
          sync_status: row.sync_status,
          environment_mode: row.environment_mode,
          last_checked_at: row.last_checked_at,
          last_success_at: row.last_success_at,
          failure_reason: row.failure_reason,
          money_moved: row.money_moved,
          error_rate_classification: safeLabel((row.metadata as JsonObject | undefined)?.error_rate_classification ?? "unknown"),
          owner_action_required: ["failed", "blocked"].includes(safeLabel(row.sync_status)),
        })),
        moneyMoved: false,
      });
    }

    if (action === "watch_once" || action === "money_provider_reliability_watch_once") {
      const mode = environmentMode(payload.environment_mode);
      const { data: statuses, error } = await client
        .from("money_provider_sync_status")
        .select("provider,capability,sync_status,environment_mode,last_checked_at,last_success_at,failure_reason,money_moved,metadata")
        .in("provider", PROVIDER_WEBHOOKS.map((entry) => entry.provider))
        .order("last_checked_at", { ascending: false })
        .limit(32);
      if (error) throw error;
      const activeStatuses = statuses ?? [];
      const hasOutage = activeStatuses.some((row: JsonObject) => safeLabel(row.sync_status) === "blocked");
      const hasDegraded = activeStatuses.some((row: JsonObject) => safeLabel(row.sync_status) === "failed");
      const healthState = hasOutage ? "outage" : hasDegraded ? "degraded" : "healthy";
      const snapshot = await client
        .from("money_flow_health_snapshots")
        .insert({
          system_id: SYSTEM_ID,
          health_state: healthState,
          eligible_for_safe_writes: true,
          latest_operator_action: "money_provider_reliability_watch_once",
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata({
            provider_count: PROVIDER_WEBHOOKS.length,
            statuses_seen: activeStatuses.length,
            safe_recovery: "audit_status_only_no_provider_dashboard_mutation",
          }),
        })
        .select("id,health_state,eligible_for_safe_writes,created_at,money_moved")
        .single();
      if (snapshot.error) throw snapshot.error;
      const event = await insertEvent(client, {
        event_type: "money_provider_reliability_watch_once",
        action_id: "provider_webhook_reliability_loop",
        environment_mode: mode,
        result: healthState,
        metadata: {
          provider_count: PROVIDER_WEBHOOKS.length,
          statuses_seen: activeStatuses.length,
          money_moved: false,
        },
      });
      return jsonResponse(200, {
        ok: true,
        action,
        healthState,
        snapshot: snapshot.data,
        event,
        providerWebhooks: safeProviderWebhookRows(),
        statuses: activeStatuses,
        recoveryExecuted: false,
        moneyMoved: false,
      });
    }

    if (action === "run_readonly_reconciliation") {
      const mode = environmentMode(payload.environment_mode);
      const { data: run, error: runError } = await client
        .from("money_reconciliation_runs")
        .insert({
          system_id: SYSTEM_ID,
          run_type: "readonly_reconciliation",
          status: "succeeded",
          environment_mode: mode,
          money_moved: false,
          completed_at: new Date().toISOString(),
          summary: safeMetadata(payload.summary ?? { result: "readonly_reconciliation_recorded" }),
        })
        .select("id,status,environment_mode,created_at,money_moved")
        .single();
      if (runError) throw runError;
      await insertEvent(client, { event_type: "readonly_reconciliation_run", action_id: "read_only_reconciliation_report", environment_mode: mode, result: "succeeded" });
      return jsonResponse(200, { ok: true, action, run, moneyMoved: false });
    }

    if (action === "sync_provider_status_safe") {
      const { actionId, environmentMode: mode } = assertNoRealMoneyMutation({ ...payload, action_id: "mark_provider_sync_status" });
      const provider = safeLabel(payload.provider);
      const capability = safeLabel(payload.capability);
      const syncStatus = safeLabel(payload.sync_status ?? "stale");
      if (!["stale", "synced", "failed", "blocked"].includes(syncStatus)) return jsonResponse(400, { error: "invalid_sync_status" });
      const { data, error } = await client
        .from("money_provider_sync_status")
        .upsert({
          system_id: SYSTEM_ID,
          provider,
          capability,
          sync_status: syncStatus,
          environment_mode: mode,
          money_moved: false,
          last_checked_at: new Date().toISOString(),
          last_success_at: syncStatus === "synced" ? new Date().toISOString() : null,
          failure_reason: syncStatus === "failed" ? safeLabel(payload.failure_reason) : null,
          metadata: safeMetadata(payload.metadata),
        }, { onConflict: "provider,capability,environment_mode" })
        .select("id,provider,capability,sync_status,environment_mode,money_moved")
        .single();
      if (error) throw error;
      await insertEvent(client, { event_type: "provider_sync_status_recorded", action_id: actionId, environment_mode: mode, result: syncStatus });
      return jsonResponse(200, { ok: true, action, status: data, moneyMoved: false });
    }

    if (action === "record_duplicate_event") {
      const mode = environmentMode(payload.environment_mode);
      const provider = safeLabel(payload.provider);
      const rawEvent = toText(payload.event_id_hash ?? payload.event_id ?? payload.eventId);
      const eventIdHash = /^[a-f0-9]{64}$/i.test(rawEvent) ? rawEvent.toLowerCase() : await sha256Hex(rawEvent);
      const { data, error } = await client
        .from("money_duplicate_event_detections")
        .upsert({
          system_id: SYSTEM_ID,
          provider,
          event_id_hash: eventIdHash,
          source_table: payload.source_table ? safeLabel(payload.source_table) : null,
          source_row_id: payload.source_row_id ? safeLabel(payload.source_row_id) : null,
          detection_status: safeLabel(payload.detection_status ?? "suspected_duplicate"),
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata(payload.metadata),
        }, { onConflict: "provider,event_id_hash,environment_mode" })
        .select("id,provider,detection_status,environment_mode,money_moved")
        .single();
      if (error) throw error;
      await insertEvent(client, { event_type: "duplicate_event_recorded", action_id: "record_duplicate_provider_event", environment_mode: mode, result: data.detection_status });
      return jsonResponse(200, { ok: true, action, duplicateDetection: data, moneyMoved: false });
    }

    if (action === "mark_requires_review") {
      const mode = environmentMode(payload.environment_mode);
      const { data, error } = await client
        .from("money_required_review_flags")
        .upsert({
          system_id: SYSTEM_ID,
          subject_type: safeLabel(payload.subject_type),
          subject_id: safeLabel(payload.subject_id),
          review_reason: safeLabel(payload.review_reason ?? "operator_requires_review"),
          severity: safeLabel(payload.severity ?? "warning"),
          status: "open",
          environment_mode: mode,
          money_moved: false,
          metadata: safeMetadata(payload.metadata),
        }, { onConflict: "subject_type,subject_id,review_reason,environment_mode" })
        .select("id,subject_type,subject_id,review_reason,status,environment_mode,money_moved")
        .single();
      if (error) throw error;
      await insertEvent(client, { event_type: "requires_review_flag_recorded", action_id: "mark_money_item_requires_review", environment_mode: mode, result: "open" });
      return jsonResponse(200, { ok: true, action, reviewFlag: data, moneyMoved: false });
    }

    if (action === "create_approval_request") {
      const approvalRequest = await createApprovalRequest(client, payload);
      await insertEvent(client, { event_type: "approval_request_created", action_id: approvalRequest.action_id, environment_mode: payload.environment_mode, result: "pending" });
      return jsonResponse(200, { ok: true, action, approvalRequest, moneyMoved: false });
    }

    if (action === "mark_sandbox_proof_result") {
      const mode = environmentMode(payload.environment_mode ?? "sandbox");
      if (mode === "production") return jsonResponse(400, { error: "sandbox_proof_cannot_be_production" });
      const event = await insertEvent(client, {
        event_type: "sandbox_proof_result",
        action_id: "write_sandbox_test_mode_proof_result",
        environment_mode: mode,
        result: safeLabel(payload.result ?? "recorded"),
        metadata: payload.metadata,
      });
      return jsonResponse(200, { ok: true, action, event, moneyMoved: false });
    }

    if (action === "learning_report") {
      const { data, error } = await client
        .from("money_operator_learning_state")
        .select("incident_key,surface,reason,occurrence_count,confidence,recommended_next_action,last_seen_at")
        .order("last_seen_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return jsonResponse(200, { ok: true, action, learningState: data ?? [], moneyMoved: false });
    }

    if (action === "execute_approved_money_action_dry_run") {
      const actionId = safeLabel(payload.money_action_id ?? payload.action_id);
      const classification = classifyMoneyAction(actionId);
      const event = await insertEvent(client, {
        event_type: "approved_money_action_dry_run",
        action_id: actionId,
        environment_mode: payload.environment_mode,
        result: "dry_run_only",
        external_confirmation_required: classification.approvalLevel === 4,
        external_confirmation_status: classification.approvalLevel === 4 ? "required" : "not_required",
        metadata: { approval_level: classification.approvalLevel, reason: classification.reason, money_moved: false },
      });
      return jsonResponse(200, { ok: true, action, event, execution: "dry_run_only", moneyMoved: false });
    }

    if (action === "execute_approved_money_action") {
      const actionId = safeLabel(payload.money_action_id ?? payload.action_id ?? payload.actionId);
      const classification = classifyMoneyAction(actionId);
      const mode = environmentMode(payload.environment_mode ?? payload.environmentMode);
      const amountCents = Number(payload.amount_cents ?? payload.amountCents ?? 0);
      const realMoneyAttempt = mode === "production" && Number.isFinite(amountCents) && amountCents > 0;
      const event = await insertEvent(client, {
        event_type: "approved_money_action_blocked_or_audited",
        action_id: actionId,
        environment_mode: mode,
        result: classification.forbidden || realMoneyAttempt || classification.approvalLevel >= 3
          ? "blocked_pending_owner_scope_and_external_confirmation"
          : "safe_action_audited_no_money_movement",
        blocked_reason: classification.forbidden
          ? "forbidden_money_action"
          : realMoneyAttempt
            ? "real_money_mutation_blocked"
            : classification.approvalLevel >= 3
              ? classification.reason
              : null,
        external_confirmation_required: classification.approvalLevel === 4,
        external_confirmation_status: classification.approvalLevel === 4 ? "required" : "not_required",
        metadata: { approval_level: classification.approvalLevel, money_moved: false },
      });
      const status = classification.forbidden || realMoneyAttempt || classification.approvalLevel >= 3 ? 409 : 200;
      return jsonResponse(status, { ok: status === 200, action, event, execution: event.result, moneyMoved: false });
    }

    return jsonResponse(400, { error: "unknown_money_operator_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const safeError = SECRET_PATTERN.test(message) || LONG_SECRET_PATTERN.test(message) ? "redacted_error" : message;
    return jsonResponse(400, { ok: false, error: safeError });
  }
});
