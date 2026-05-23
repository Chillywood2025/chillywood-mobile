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

type SponsorReportingFraudPreflightPayload = {
  brand_id?: unknown;
  brandId?: unknown;
  creator_user_id?: unknown;
  creatorUserId?: unknown;
  report_id?: unknown;
  reportId?: unknown;
  sponsor_deal_id?: unknown;
  sponsorDealId?: unknown;
};

const FUNCTION_NAME = "sponsor-reporting-fraud-preflight";

const FORBIDDEN_INPUT_KEY_FRAGMENTS = [
  "amount",
  "api_key",
  "apikey",
  "ban",
  "charge",
  "checkout",
  "click",
  "conversion",
  "credential",
  "customer",
  "disable",
  "earnings",
  "enforce",
  "hold",
  "impression",
  "invoice",
  "mark_fraud",
  "payment",
  "payment_link",
  "performance",
  "provider_secret",
  "release",
  "restrict",
  "revenue",
  "risk_score",
  "secret",
  "strike",
  "stripe",
  "token",
];

const brandId = (payload: SponsorReportingFraudPreflightPayload) =>
  toText(payload.brand_id ?? payload.brandId) || null;

const creatorUserId = (payload: SponsorReportingFraudPreflightPayload) =>
  toText(payload.creator_user_id ?? payload.creatorUserId) || null;

const reportId = (payload: SponsorReportingFraudPreflightPayload) =>
  toText(payload.report_id ?? payload.reportId) || null;

const sponsorDealId = (payload: SponsorReportingFraudPreflightPayload) =>
  toText(payload.sponsor_deal_id ?? payload.sponsorDealId) || null;

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
  sponsorReportImported: false,
  reportingImportCreated: false,
  fakeSponsorPerformanceCreated: false,
  fakeSponsorRevenueCreated: false,
  fraudEnforcementActionCreated: false,
  creatorRestrictionApplied: false,
  creatorRestricted: false,
  sponsorDealRestricted: false,
  sponsorRestricted: false,
  payoutPaused: false,
  monetizationDisabled: false,
  sponsorActivated: false,
  brandCharged: false,
  creatorPayoutReleased: false,
  reportingSchemaRequired: true,
  backedProviderReportRequired: true,
  immutableAuditRequired: true,
  backedReportingRequired: true,
  disclosureReviewRequired: true,
  safetyReviewRequired: true,
  fraudReviewRequired: true,
  appealPathRequired: true,
  appealReviewPathRequired: true,
  explicitProductApprovalRequired: true,
  message:
    "Sponsor reporting and fraud integration are not active. Backed reporting data, disclosure/safety/fraud review, immutable audit, and appeal/review paths must be proved before reporting imports or enforcement can exist.",
  ...extra,
});

const notConfiguredPayload = (reason: string, message: string, extra: Record<string, unknown> = {}) => ({
  status: "not_configured",
  mode: "foundation",
  liveMoneyAction: false,
  providerCall: false,
  providerSecretRead: false,
  sponsorReportImported: false,
  reportingImportCreated: false,
  fraudEnforcementActionCreated: false,
  creatorRestrictionApplied: false,
  sponsorDealRestricted: false,
  sponsorActivated: false,
  brandCharged: false,
  creatorPayoutReleased: false,
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
        sponsor_report_imported: false,
        reporting_import_created: false,
        fake_sponsor_performance_created: false,
        fake_sponsor_revenue_created: false,
        fraud_enforcement_action_created: false,
        creator_restriction_applied: false,
        creator_restricted: false,
        sponsor_deal_restricted: false,
        sponsor_restricted: false,
        sponsor_activated: false,
        brand_charged: false,
        creator_payout_released: false,
      }),
      reason: input.reason,
      severity: input.severity ?? "notice",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? "sponsor_reporting_fraud_preflight",
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
      message: "Use POST for sponsor reporting/fraud preflight requests.",
      sponsorReportImported: false,
      reportingImportCreated: false,
      fraudEnforcementActionCreated: false,
      creatorRestrictionApplied: false,
      sponsorDealRestricted: false,
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let requestedAuditLogId: string | null = null;
  let requestedBrandId: string | null = null;
  let requestedCreatorUserId: string | null = null;
  let requestedReportId: string | null = null;
  let requestedSponsorDealId: string | null = null;
  let securityContext: SecurityRequestContextResult | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<SponsorReportingFraudPreflightPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasForbiddenInput(parsed.value)) {
      return jsonResponse(400, {
        error: "sponsor_reporting_fraud_instruction_not_allowed",
        liveMoneyAction: false,
        message:
          "Provider credentials, fake performance, revenue, payment, checkout, charge, risk-score, and enforcement instructions are not accepted by this preflight-only foundation.",
        providerCall: false,
        providerSecretRead: false,
        sponsorReportImported: false,
        reportingImportCreated: false,
        fakeSponsorPerformanceCreated: false,
        fraudEnforcementActionCreated: false,
        creatorRestrictionApplied: false,
        creatorRestricted: false,
        sponsorDealRestricted: false,
        sponsorRestricted: false,
      });
    }

    requestedBrandId = brandId(parsed.value);
    requestedCreatorUserId = creatorUserId(parsed.value);
    requestedReportId = reportId(parsed.value);
    requestedSponsorDealId = sponsorDealId(parsed.value);

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          brandId: requestedBrandId,
          creatorUserId: requestedCreatorUserId,
          reportId: requestedReportId,
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
        message: "Sponsor reporting/fraud preflight is admin/operator-only.",
        sponsorReportImported: false,
        reportingImportCreated: false,
        fraudEnforcementActionCreated: false,
        creatorRestrictionApplied: false,
        sponsorDealRestricted: false,
      });
    }

    requestedAuditLogId = await writeAuditLog(adminClient, {
      action: "sponsor_reporting_fraud_preflight_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: preconditionsRequiredPayload({
        auditWritten: false,
        brandId: requestedBrandId,
        creatorUserId: requestedCreatorUserId,
        reportId: requestedReportId,
        sponsorDealId: requestedSponsorDealId,
      }),
      metadata: {
        brand_id: requestedBrandId,
        creator_user_id: requestedCreatorUserId,
        report_id: requestedReportId,
        sponsor_deal_id: requestedSponsorDealId,
      },
      reason:
        "Sponsor reporting/fraud preflight requested; reporting imports and enforcement remain blocked by backed reporting, review, audit, and appeal gates.",
      securityContext,
      targetId: requestedSponsorDealId,
      targetType: requestedSponsorDealId ? "sponsor_deal_record" : "sponsor_reporting_fraud_preflight",
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, {
      action: "sponsor_reporting_fraud_preflight_blocked",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: preconditionsRequiredPayload({
        auditWritten: true,
        brandId: requestedBrandId,
        creatorUserId: requestedCreatorUserId,
        reportId: requestedReportId,
        sponsorDealId: requestedSponsorDealId,
      }),
      metadata: {
        appeal_path_required: true,
        backed_reporting_required: true,
        brand_id: requestedBrandId,
        creator_user_id: requestedCreatorUserId,
        disclosure_review_required: true,
        fraud_review_required: true,
        immutable_audit_required: true,
        report_id: requestedReportId,
        safety_review_required: true,
        sponsor_deal_id: requestedSponsorDealId,
      },
      reason:
        "Sponsor reporting imports and fraud integration remain unavailable until backed reporting, disclosure/safety/fraud review, immutable audit, and appeal/review gates are proved.",
      securityContext,
      targetId: requestedSponsorDealId,
      targetType: requestedSponsorDealId ? "sponsor_deal_record" : "sponsor_reporting_fraud_preflight",
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
        reportId: requestedReportId,
        sponsorDealId: requestedSponsorDealId,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, {
      action: "sponsor_reporting_fraud_preflight_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        brand_id: requestedBrandId,
        creator_user_id: requestedCreatorUserId,
        error: sanitizeErrorMessage(error),
        report_id: requestedReportId,
        requested_audit_log_id: requestedAuditLogId,
        sponsor_deal_id: requestedSponsorDealId,
      },
      reason: "Sponsor reporting/fraud preflight failed; no reporting import or fraud enforcement occurred.",
      securityContext,
      severity: "warning",
      targetId: requestedSponsorDealId,
      targetType: requestedSponsorDealId ? "sponsor_deal_record" : "sponsor_reporting_fraud_preflight",
    });

    return jsonResponse(500, {
      error: "sponsor_reporting_fraud_preflight_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      sponsorReportImported: false,
      reportingImportCreated: false,
      fakeSponsorPerformanceCreated: false,
      fraudEnforcementActionCreated: false,
      creatorRestrictionApplied: false,
      creatorRestricted: false,
      sponsorDealRestricted: false,
      sponsorRestricted: false,
      audit: {
        failureAuditLogId,
      },
    });
  }
});
