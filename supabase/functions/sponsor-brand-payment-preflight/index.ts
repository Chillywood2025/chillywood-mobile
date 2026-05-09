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

type SponsorBrandPaymentPreflightPayload = {
  brand_id?: unknown;
  brandId?: unknown;
  sponsor_deal_id?: unknown;
  sponsorDealId?: unknown;
  sponsor_payment_record_id?: unknown;
  sponsorPaymentRecordId?: unknown;
};

const FUNCTION_NAME = "sponsor-brand-payment-preflight";

const FORBIDDEN_INPUT_KEY_FRAGMENTS = [
  "amount",
  "api_key",
  "apikey",
  "bank",
  "card",
  "charge",
  "checkout",
  "credential",
  "currency",
  "customer",
  "payment_intent",
  "payment_link",
  "provider_reference",
  "provider_secret",
  "secret",
  "session",
  "stripe",
  "token",
];

const brandId = (payload: SponsorBrandPaymentPreflightPayload) =>
  toText(payload.brand_id ?? payload.brandId) || null;

const sponsorDealId = (payload: SponsorBrandPaymentPreflightPayload) =>
  toText(payload.sponsor_deal_id ?? payload.sponsorDealId) || null;

const sponsorPaymentRecordId = (payload: SponsorBrandPaymentPreflightPayload) =>
  toText(payload.sponsor_payment_record_id ?? payload.sponsorPaymentRecordId) || null;

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
  mode: "test_planning",
  liveMoneyAction: false,
  providerCall: false,
  providerSecretRead: false,
  checkoutSessionCreated: false,
  paymentIntentCreated: false,
  paymentLinkCreated: false,
  brandCharged: false,
  sponsorPaymentMarkedPaid: false,
  creatorPayoutSplitCalculatedAsPayable: false,
  creatorPayoutReleased: false,
  fakeSponsorRevenueCreated: false,
  reviewRequired: true,
  disclosureReviewRequired: true,
  safetyReviewRequired: true,
  fraudReviewRequired: true,
  immutableAuditRequired: true,
  testModeProviderProofRequired: true,
  explicitProductApprovalRequired: true,
  message:
    "Brand payment through Stripe is not active. Sponsor review, disclosure, safety, fraud, immutable audit, test-mode provider proof, and explicit product approval must be proved before payment can exist.",
  ...extra,
});

const notConfiguredPayload = (reason: string, message: string, extra: Record<string, unknown> = {}) => ({
  status: "not_configured",
  mode: "test_planning",
  liveMoneyAction: false,
  providerCall: false,
  providerSecretRead: false,
  checkoutSessionCreated: false,
  paymentIntentCreated: false,
  paymentLinkCreated: false,
  brandCharged: false,
  sponsorPaymentMarkedPaid: false,
  creatorPayoutSplitCalculatedAsPayable: false,
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
    severity?: string;
    targetId?: string | null;
    targetType?: string | null;
  },
) => {
  const { data, error } = await adminClient
    .from("platform_admin_audit_logs")
    .insert({
      action: input.action,
      action_category: "sponsor",
      actor_email: input.actorEmail ?? null,
      actor_role: "operator",
      actor_user_id: input.actorUserId ?? null,
      after_state: input.afterState == null ? null : redactValue(input.afterState),
      before_state: input.beforeState == null ? null : redactValue(input.beforeState),
      metadata: redactValue({
        ...input.metadata,
        function_name: FUNCTION_NAME,
        backend_only: true,
        foundation_only: true,
        live_money_action: false,
        provider_secret_read: false,
        provider_call: false,
        checkout_session_created: false,
        payment_intent_created: false,
        payment_link_created: false,
        brand_charged: false,
        sponsor_payment_marked_paid: false,
        creator_payout_split_calculated_as_payable: false,
        creator_payout_released: false,
      }),
      reason: input.reason,
      severity: input.severity ?? "notice",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? "sponsor_brand_payment_preflight",
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
      message: "Use POST for sponsor brand payment preflight requests.",
      brandCharged: false,
      checkoutSessionCreated: false,
      paymentIntentCreated: false,
      paymentLinkCreated: false,
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let requestedAuditLogId: string | null = null;
  let requestedBrandId: string | null = null;
  let requestedSponsorDealId: string | null = null;
  let requestedSponsorPaymentRecordId: string | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<SponsorBrandPaymentPreflightPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasForbiddenInput(parsed.value)) {
      return jsonResponse(400, {
        error: "brand_payment_instruction_not_allowed",
        liveMoneyAction: false,
        message:
          "Payment, checkout, provider credential, customer, charge, currency, amount, and Stripe instructions are not accepted by this preflight-only foundation.",
        providerCall: false,
        providerSecretRead: false,
        checkoutSessionCreated: false,
        paymentIntentCreated: false,
        paymentLinkCreated: false,
        brandCharged: false,
        creatorPayoutSplitCalculatedAsPayable: false,
      });
    }

    requestedBrandId = brandId(parsed.value);
    requestedSponsorDealId = sponsorDealId(parsed.value);
    requestedSponsorPaymentRecordId = sponsorPaymentRecordId(parsed.value);

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          brandId: requestedBrandId,
          sponsorDealId: requestedSponsorDealId,
          sponsorPaymentRecordId: requestedSponsorPaymentRecordId,
        }),
      );
    }
    adminClient = adminConfig.client;

    const hasOperatorRole = await userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        liveMoneyAction: false,
        message: "Sponsor brand payment preflight is admin/operator-only.",
        providerCall: false,
        providerSecretRead: false,
        checkoutSessionCreated: false,
        paymentIntentCreated: false,
        paymentLinkCreated: false,
        brandCharged: false,
      });
    }

    requestedAuditLogId = await writeAuditLog(adminClient, {
      action: "sponsor_brand_payment_preflight_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: preconditionsRequiredPayload({
        auditWritten: false,
        brandId: requestedBrandId,
        sponsorDealId: requestedSponsorDealId,
        sponsorPaymentRecordId: requestedSponsorPaymentRecordId,
      }),
      metadata: {
        brand_id: requestedBrandId,
        sponsor_deal_id: requestedSponsorDealId,
        sponsor_payment_record_id: requestedSponsorPaymentRecordId,
      },
      reason:
        "Sponsor brand payment preflight requested; payment remains blocked by review, disclosure, safety, fraud, audit, provider proof, and product-approval gates.",
      targetId: requestedSponsorPaymentRecordId ?? requestedSponsorDealId,
      targetType: requestedSponsorPaymentRecordId ? "sponsor_payment_record" : "sponsor_brand_payment_preflight",
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, {
      action: "sponsor_brand_payment_preflight_blocked",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: preconditionsRequiredPayload({
        auditWritten: true,
        brandId: requestedBrandId,
        sponsorDealId: requestedSponsorDealId,
        sponsorPaymentRecordId: requestedSponsorPaymentRecordId,
      }),
      metadata: {
        brand_id: requestedBrandId,
        disclosure_review_required: true,
        explicit_product_approval_required: true,
        fraud_review_required: true,
        immutable_audit_required: true,
        provider_test_mode_proof_required: true,
        safety_review_required: true,
        sponsor_deal_id: requestedSponsorDealId,
        sponsor_payment_record_id: requestedSponsorPaymentRecordId,
      },
      reason:
        "Sponsor brand payment remains unavailable until review, disclosure, safety, fraud, immutable audit, test-mode provider proof, and explicit product approval are proved.",
      targetId: requestedSponsorPaymentRecordId ?? requestedSponsorDealId,
      targetType: requestedSponsorPaymentRecordId ? "sponsor_payment_record" : "sponsor_brand_payment_preflight",
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
        brandId: requestedBrandId,
        sponsorDealId: requestedSponsorDealId,
        sponsorPaymentRecordId: requestedSponsorPaymentRecordId,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, {
      action: "sponsor_brand_payment_preflight_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        brand_id: requestedBrandId,
        error: sanitizeErrorMessage(error),
        requested_audit_log_id: requestedAuditLogId,
        sponsor_deal_id: requestedSponsorDealId,
        sponsor_payment_record_id: requestedSponsorPaymentRecordId,
      },
      reason: "Sponsor brand payment preflight failed; no payment, checkout, payment link, brand charge, or payout split occurred.",
      severity: "warning",
      targetId: requestedSponsorPaymentRecordId ?? requestedSponsorDealId,
      targetType: requestedSponsorPaymentRecordId ? "sponsor_payment_record" : "sponsor_brand_payment_preflight",
    });

    return jsonResponse(500, {
      error: "sponsor_brand_payment_preflight_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      providerCall: false,
      providerSecretRead: false,
      checkoutSessionCreated: false,
      paymentIntentCreated: false,
      paymentLinkCreated: false,
      brandCharged: false,
      sponsorPaymentMarkedPaid: false,
      creatorPayoutSplitCalculatedAsPayable: false,
      audit: {
        failureAuditLogId,
      },
    });
  }
});
