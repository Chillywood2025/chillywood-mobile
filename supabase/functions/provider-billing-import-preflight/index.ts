import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  jsonResponse,
  optionsResponse,
  parseJsonPayload,
  sanitizeErrorMessage,
  toText,
  type AuthenticatedUser,
  type SupabaseClientLike,
  userHasPlatformRole,
} from "../_shared/stripe-connect.ts";
import {
  captureSecurityRequestContext,
  securityContextAuditMetadata,
  type SecurityRequestContextResult,
} from "../_shared/security-request-context.ts";

type ProviderBillingImportPreflightPayload = {
  billing_period?: unknown;
  billingPeriod?: unknown;
  network_account_id?: unknown;
  networkAccountId?: unknown;
  provider?: unknown;
};

const FUNCTION_NAME = "provider-billing-import-preflight";

const FORBIDDEN_INPUT_KEY_FRAGMENTS = [
  "api_key",
  "apikey",
  "amount",
  "bank",
  "billing_total",
  "card",
  "charge",
  "credential",
  "currency",
  "customer_charge",
  "invoice",
  "payment",
  "payment_link",
  "provider_secret",
  "secret",
  "token",
];

const allowedProviderKey = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "cloudflare_r2"
    || normalized === "hetzner_object_storage"
    || normalized === "hetzner_server"
    || normalized === "ovh_object_storage"
    || normalized === "ovh_server"
    || normalized === "all_configured"
  ) {
    return normalized;
  }

  return normalized ? "unsupported" : "unspecified";
};

const billingPeriod = (payload: ProviderBillingImportPreflightPayload) =>
  toText(payload.billing_period ?? payload.billingPeriod) || null;

const networkAccountId = (payload: ProviderBillingImportPreflightPayload) =>
  toText(payload.network_account_id ?? payload.networkAccountId) || null;

const hasForbiddenInput = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasForbiddenInput);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    return FORBIDDEN_INPUT_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment)) || hasForbiddenInput(item);
  });
};

const preconditionsRequiredPayload = (extra: Record<string, unknown> = {}) => ({
  status: "preconditions_required",
  mode: "foundation",
  liveMoneyAction: false,
  providerCall: false,
  providerSecretRead: false,
  providerBillImported: false,
  invoiceCreated: false,
  invoiceSent: false,
  customerCharged: false,
  paymentLinkCreated: false,
  overageBillingExecuted: false,
  fakeProviderBillCreated: false,
  fakeRevenueCreated: false,
  idempotencyRequired: true,
  immutableAuditRequired: true,
  legalAccountingRequired: true,
  providerCredentialRequiredLater: true,
  reconciliationRequired: true,
  trustedUsageRequired: true,
  message:
    "Provider billing API imports are not active. Server-side credentials, idempotency, trusted usage, provider reconciliation, immutable audit, and legal/accounting review must be proved before provider bill import can exist.",
  ...extra,
});

const notConfiguredPayload = (reason: string, message: string, extra: Record<string, unknown> = {}) => ({
  status: "not_configured",
  mode: "foundation",
  liveMoneyAction: false,
  providerCall: false,
  providerSecretRead: false,
  providerBillImported: false,
  invoiceCreated: false,
  invoiceSent: false,
  customerCharged: false,
  paymentLinkCreated: false,
  overageBillingExecuted: false,
  fakeProviderBillCreated: false,
  reason,
  message,
  ...extra,
});

const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeErrorMessage(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("secret")
        || lowerKey.includes("token")
        || lowerKey.includes("password")
        || lowerKey.includes("credential")
        || lowerKey.includes("card")
        || lowerKey.includes("bank")
      ) {
        return [key, "[redacted]"];
      }

      return [key, redactValue(item)];
    }),
  );
};

const writeAuditLog = async (
  adminClient: SupabaseClientLike,
  input: {
    action: string;
    actorEmail?: string | null;
    actorUserId?: string | null;
    afterState?: unknown;
    beforeState?: unknown;
    metadata?: Record<string, unknown>;
    reason: string;
    securityContext?: SecurityRequestContextResult | null;
    severity?: string;
    targetId?: string | null;
    targetType?: string | null;
  },
) => {
  const { data, error } = await adminClient
    .from("platform_admin_audit_logs")
    .insert({
      action: input.action,
      action_category: "network_billing",
      actor_email: input.actorEmail ?? null,
      actor_role: "operator",
      actor_user_id: input.actorUserId ?? null,
      after_state: input.afterState == null ? null : redactValue(input.afterState),
      before_state: input.beforeState == null ? null : redactValue(input.beforeState),
      metadata: redactValue({
        ...input.metadata,
        ...securityContextAuditMetadata(input.securityContext ?? null),
        function_name: FUNCTION_NAME,
        backend_only: true,
        foundation_only: true,
        live_money_action: false,
        provider_secret_read: false,
        provider_call: false,
        provider_bill_imported: false,
        invoice_created: false,
        invoice_sent: false,
        customer_charged: false,
        payment_link_created: false,
        overage_billing_executed: false,
        fake_provider_bill_created: false,
      }),
      reason: input.reason,
      severity: input.severity ?? "notice",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? "provider_billing_import_preflight",
      security_context_id: input.securityContext?.id ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Audit log insert failed: ${error.message}`);
  return toText((data as { id?: unknown } | null)?.id) || null;
};

const safeWriteAuditLog = async (
  adminClient: SupabaseClientLike | null,
  input: Parameters<typeof writeAuditLog>[1],
) => {
  if (!adminClient) return null;

  try {
    return await writeAuditLog(adminClient, input);
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      liveMoneyAction: false,
      message: "Use POST for provider billing import preflight requests.",
      providerBillImported: false,
      invoiceCreated: false,
      customerCharged: false,
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let requestedAuditLogId: string | null = null;
  let requestedNetworkAccountId: string | null = null;
  let requestedProvider = "unspecified";
  let requestedBillingPeriod: string | null = null;
  let securityContext: SecurityRequestContextResult | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<ProviderBillingImportPreflightPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasForbiddenInput(parsed.value)) {
      return jsonResponse(400, {
        error: "billing_import_instruction_not_allowed",
        liveMoneyAction: false,
        message:
          "Provider credentials, invoice, payment link, customer charge, currency, and amount instructions are not accepted by this preflight-only foundation.",
        providerCall: false,
        providerSecretRead: false,
        providerBillImported: false,
        invoiceCreated: false,
        invoiceSent: false,
        customerCharged: false,
        paymentLinkCreated: false,
      });
    }

    requestedProvider = allowedProviderKey(parsed.value.provider);
    requestedBillingPeriod = billingPeriod(parsed.value);
    requestedNetworkAccountId = networkAccountId(parsed.value);

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          provider: requestedProvider,
          billingPeriod: requestedBillingPeriod,
          networkAccountId: requestedNetworkAccountId,
        }),
      );
    }
    adminClient = adminConfig.client;
    securityContext = await captureSecurityRequestContext(adminClient, req, {
      source: FUNCTION_NAME,
      userId: currentUser.id,
    });

    const hasOperatorRole = await userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        liveMoneyAction: false,
        message: "Provider billing import preflight is admin/operator-only.",
        providerCall: false,
        providerSecretRead: false,
        providerBillImported: false,
        invoiceCreated: false,
        customerCharged: false,
        paymentLinkCreated: false,
      });
    }

    requestedAuditLogId = await writeAuditLog(adminClient, {
      action: "provider_billing_import_preflight_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: preconditionsRequiredPayload({
        auditWritten: false,
        billingPeriod: requestedBillingPeriod,
        networkAccountId: requestedNetworkAccountId,
        provider: requestedProvider,
      }),
      metadata: {
        billing_period: requestedBillingPeriod,
        network_account_id: requestedNetworkAccountId,
        provider_key: requestedProvider,
      },
      reason:
        "Provider billing API import preflight requested; import remains blocked by credential, idempotency, reconciliation, audit, and legal/accounting gates.",
      securityContext,
      targetId: requestedNetworkAccountId,
      targetType: requestedNetworkAccountId ? "network_billing_account" : "provider_billing_import_preflight",
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, {
      action: "provider_billing_import_preflight_blocked",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: preconditionsRequiredPayload({
        auditWritten: true,
        billingPeriod: requestedBillingPeriod,
        networkAccountId: requestedNetworkAccountId,
        provider: requestedProvider,
      }),
      metadata: {
        billing_period: requestedBillingPeriod,
        idempotency_required: true,
        immutable_audit_required: true,
        legal_accounting_required: true,
        network_account_id: requestedNetworkAccountId,
        provider_credential_required_later: true,
        provider_key: requestedProvider,
        reconciliation_required: true,
        trusted_usage_required: true,
      },
      reason:
        "Provider billing API import remains unavailable until server-side credentials, idempotency, trusted usage, reconciliation, audit, and legal/accounting gates are proved.",
      securityContext,
      targetId: requestedNetworkAccountId,
      targetType: requestedNetworkAccountId ? "network_billing_account" : "provider_billing_import_preflight",
    });

    return jsonResponse(
      200,
      preconditionsRequiredPayload({
        audit: {
          blockedAuditLogId,
          requested: true,
          requestedAuditLogId,
          written: true,
        },
        billingPeriod: requestedBillingPeriod,
        networkAccountId: requestedNetworkAccountId,
        provider: requestedProvider,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, {
      action: "provider_billing_import_preflight_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        billing_period: requestedBillingPeriod,
        error: sanitizeErrorMessage(error),
        network_account_id: requestedNetworkAccountId,
        provider_key: requestedProvider,
        requested_audit_log_id: requestedAuditLogId,
      },
      reason: "Provider billing API import preflight failed; no provider bill import or billing execution occurred.",
      securityContext,
      severity: "warning",
      targetId: requestedNetworkAccountId,
      targetType: requestedNetworkAccountId ? "network_billing_account" : "provider_billing_import_preflight",
    });

    return jsonResponse(500, {
      error: "provider_billing_import_preflight_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      provider: requestedProvider,
      providerCall: false,
      providerSecretRead: false,
      providerBillImported: false,
      invoiceCreated: false,
      invoiceSent: false,
      customerCharged: false,
      paymentLinkCreated: false,
      audit: {
        failureAuditLogId,
      },
    });
  }
});
