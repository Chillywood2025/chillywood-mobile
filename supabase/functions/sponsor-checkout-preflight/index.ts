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

type SponsorCheckoutPreflightPayload = {
  brand_id?: unknown;
  brandId?: unknown;
  creator_user_id?: unknown;
  creatorUserId?: unknown;
  sponsor_deal_id?: unknown;
  sponsorDealId?: unknown;
};

const FUNCTION_NAME = "sponsor-checkout-preflight";

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
  "payment",
  "payment_link",
  "provider_reference",
  "provider_secret",
  "secret",
  "session",
  "stripe",
  "token",
];

const sponsorDealId = (payload: SponsorCheckoutPreflightPayload) =>
  toText(payload.sponsor_deal_id ?? payload.sponsorDealId) || null;

const brandId = (payload: SponsorCheckoutPreflightPayload) =>
  toText(payload.brand_id ?? payload.brandId) || null;

const creatorUserId = (payload: SponsorCheckoutPreflightPayload) =>
  toText(payload.creator_user_id ?? payload.creatorUserId) || null;

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
  paymentLinkCreated: false,
  brandCharged: false,
  sponsorApproved: false,
  sponsorActivated: false,
  creatorPayoutSplitExecuted: false,
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
    "Sponsor checkout is not active. Review, disclosure, safety, fraud, immutable audit, test-mode provider proof, and explicit product approval must be proved before checkout can exist.",
  ...extra,
});

const notConfiguredPayload = (reason: string, message: string, extra: Record<string, unknown> = {}) => ({
  status: "not_configured",
  mode: "test_planning",
  liveMoneyAction: false,
  providerCall: false,
  providerSecretRead: false,
  checkoutSessionCreated: false,
  paymentLinkCreated: false,
  brandCharged: false,
  sponsorApproved: false,
  sponsorActivated: false,
  creatorPayoutSplitExecuted: false,
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
    targetUserId?: string | null;
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
        ...securityContextAuditMetadata(input.securityContext ?? null),
        function_name: FUNCTION_NAME,
        backend_only: true,
        foundation_only: true,
        live_money_action: false,
        provider_secret_read: false,
        provider_call: false,
        checkout_session_created: false,
        payment_link_created: false,
        brand_charged: false,
        sponsor_approved: false,
        sponsor_activated: false,
        creator_payout_split_executed: false,
        creator_payout_released: false,
      }),
      reason: input.reason,
      severity: input.severity ?? "notice",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? "sponsor_checkout_preflight",
      target_user_id: input.targetUserId ?? null,
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
      message: "Use POST for sponsor checkout preflight requests.",
      checkoutSessionCreated: false,
      paymentLinkCreated: false,
      brandCharged: false,
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let requestedAuditLogId: string | null = null;
  let requestedBrandId: string | null = null;
  let requestedCreatorUserId: string | null = null;
  let requestedSponsorDealId: string | null = null;
  let securityContext: SecurityRequestContextResult | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<SponsorCheckoutPreflightPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasForbiddenInput(parsed.value)) {
      return jsonResponse(400, {
        error: "sponsor_checkout_instruction_not_allowed",
        liveMoneyAction: false,
        message:
          "Checkout, payment, provider credential, customer, charge, currency, amount, and Stripe instructions are not accepted by this preflight-only foundation.",
        providerCall: false,
        providerSecretRead: false,
        checkoutSessionCreated: false,
        paymentLinkCreated: false,
        brandCharged: false,
        creatorPayoutSplitExecuted: false,
      });
    }

    requestedBrandId = brandId(parsed.value);
    requestedCreatorUserId = creatorUserId(parsed.value);
    requestedSponsorDealId = sponsorDealId(parsed.value);

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          brandId: requestedBrandId,
          creatorUserId: requestedCreatorUserId,
          sponsorDealId: requestedSponsorDealId,
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
        message: "Sponsor checkout preflight is admin/operator-only.",
        providerCall: false,
        providerSecretRead: false,
        checkoutSessionCreated: false,
        paymentLinkCreated: false,
        brandCharged: false,
      });
    }

    requestedAuditLogId = await writeAuditLog(adminClient, {
      action: "sponsor_checkout_preflight_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: preconditionsRequiredPayload({
        auditWritten: false,
        brandId: requestedBrandId,
        creatorUserId: requestedCreatorUserId,
        sponsorDealId: requestedSponsorDealId,
      }),
      metadata: {
        brand_id: requestedBrandId,
        creator_user_id: requestedCreatorUserId,
        sponsor_deal_id: requestedSponsorDealId,
      },
      reason:
        "Sponsor checkout preflight requested; checkout remains blocked by review, disclosure, safety, fraud, audit, provider proof, and product-approval gates.",
      securityContext,
      targetId: requestedSponsorDealId,
      targetType: requestedSponsorDealId ? "sponsor_deal_record" : "sponsor_checkout_preflight",
      targetUserId: requestedCreatorUserId,
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, {
      action: "sponsor_checkout_preflight_blocked",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: preconditionsRequiredPayload({
        auditWritten: true,
        brandId: requestedBrandId,
        creatorUserId: requestedCreatorUserId,
        sponsorDealId: requestedSponsorDealId,
      }),
      metadata: {
        brand_id: requestedBrandId,
        creator_user_id: requestedCreatorUserId,
        disclosure_review_required: true,
        explicit_product_approval_required: true,
        fraud_review_required: true,
        immutable_audit_required: true,
        provider_test_mode_proof_required: true,
        safety_review_required: true,
        sponsor_deal_id: requestedSponsorDealId,
      },
      reason:
        "Sponsor checkout remains unavailable until review, disclosure, safety, fraud, immutable audit, test-mode provider proof, and explicit product approval are proved.",
      securityContext,
      targetId: requestedSponsorDealId,
      targetType: requestedSponsorDealId ? "sponsor_deal_record" : "sponsor_checkout_preflight",
      targetUserId: requestedCreatorUserId,
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
        creatorUserId: requestedCreatorUserId,
        sponsorDealId: requestedSponsorDealId,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, {
      action: "sponsor_checkout_preflight_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        brand_id: requestedBrandId,
        creator_user_id: requestedCreatorUserId,
        error: sanitizeErrorMessage(error),
        requested_audit_log_id: requestedAuditLogId,
        sponsor_deal_id: requestedSponsorDealId,
      },
      reason: "Sponsor checkout preflight failed; no checkout, payment link, brand charge, or payout split occurred.",
      securityContext,
      severity: "warning",
      targetId: requestedSponsorDealId,
      targetType: requestedSponsorDealId ? "sponsor_deal_record" : "sponsor_checkout_preflight",
      targetUserId: requestedCreatorUserId,
    });

    return jsonResponse(500, {
      error: "sponsor_checkout_preflight_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      providerCall: false,
      providerSecretRead: false,
      checkoutSessionCreated: false,
      paymentLinkCreated: false,
      brandCharged: false,
      creatorPayoutSplitExecuted: false,
      audit: {
        failureAuditLogId,
      },
    });
  }
});
