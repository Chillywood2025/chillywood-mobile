import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  sanitizeErrorMessage,
  toText,
  type AuthenticatedUser,
  type SupabaseClientLike,
  userHasPlatformRole,
} from "../_shared/stripe-connect.ts";

type PayoutReleasePreflightPayload = {
  amount?: unknown;
  amount_cents?: unknown;
  amountCents?: unknown;
  approve?: unknown;
  creator_user_id?: unknown;
  creatorUserId?: unknown;
  currency?: unknown;
  payout_batch_id?: unknown;
  payoutBatchId?: unknown;
  payout_review_id?: unknown;
  payoutReviewId?: unknown;
  provider_account_id?: unknown;
  provider_payout_id?: unknown;
  provider_transfer_id?: unknown;
  providerAccountId?: unknown;
  providerPayoutId?: unknown;
  providerTransferId?: unknown;
  release?: unknown;
};

const FUNCTION_NAME = "payout-release-preflight";

const hasClientMoneyOrReleaseInstruction = (payload: PayoutReleasePreflightPayload) =>
  !!toText(
    payload.amount ??
      payload.amount_cents ??
      payload.amountCents ??
      payload.approve ??
      payload.currency ??
      payload.provider_account_id ??
      payload.provider_payout_id ??
      payload.provider_transfer_id ??
      payload.providerAccountId ??
      payload.providerPayoutId ??
      payload.providerTransferId ??
      payload.release,
  );

const requestedTargetId = (payload: PayoutReleasePreflightPayload) =>
  toText(payload.payout_batch_id ?? payload.payoutBatchId ?? payload.payout_review_id ?? payload.payoutReviewId) || null;

const requestedCreatorUserId = (payload: PayoutReleasePreflightPayload) =>
  toText(payload.creator_user_id ?? payload.creatorUserId) || null;

const preconditionsRequiredPayload = (extra: Record<string, unknown> = {}) => ({
  status: "preconditions_required",
  mode: "not_active",
  liveMoneyAction: false,
  payoutReleaseCreated: false,
  payoutApproved: false,
  transferCreated: false,
  payoutCreated: false,
  checkoutCreated: false,
  providerCall: false,
  providerWrite: false,
  stripeSecretRead: false,
  fakePayableBalanceCreated: false,
  legalAccountingRequired: true,
  productionProviderApprovalRequired: true,
  taxReadyRequired: true,
  kycReadyRequired: true,
  fraudReviewRequired: true,
  adminReviewRequired: true,
  immutableAuditRequired: true,
  holdPeriodRequired: true,
  supportDisputePolicyRequired: true,
  stagedRolloutRequired: true,
  message:
    "Production payout release is not active. Legal/accounting, production provider, KYC/tax, fraud review, admin approval, hold-period, immutable audit, support/dispute, and staged-rollout gates must be proved before release can exist.",
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
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("password") ||
        lowerKey.includes("card") ||
        lowerKey.includes("bank")
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
    targetUserId?: string | null;
  },
) => {
  const { data, error } = await adminClient
    .from("platform_admin_audit_logs")
    .insert({
      action: input.action,
      action_category: "payout",
      actor_email: input.actorEmail ?? null,
      actor_role: "operator",
      actor_user_id: input.actorUserId ?? null,
      after_state: input.afterState == null ? null : redactValue(input.afterState),
      before_state: input.beforeState == null ? null : redactValue(input.beforeState),
      metadata: redactValue({
        ...input.metadata,
        function_name: FUNCTION_NAME,
        live_money_action: false,
        payout_release_created: false,
        provider_call: false,
        provider_write: false,
      }),
      reason: input.reason,
      severity: input.severity ?? "notice",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? "payout_release_preflight",
      target_user_id: input.targetUserId ?? null,
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
      message: "Use POST for payout release preflight requests.",
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let targetId: string | null = null;
  let targetUserId: string | null = null;
  let requestedAuditLogId: string | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<PayoutReleasePreflightPayload>(req);
    if ("error" in parsed) return parsed.error;
    targetId = requestedTargetId(parsed.value);
    targetUserId = requestedCreatorUserId(parsed.value);

    if (hasClientMoneyOrReleaseInstruction(parsed.value)) {
      return jsonResponse(400, {
        error: "release_instruction_not_allowed",
        liveMoneyAction: false,
        message:
          "Money amounts, provider references, approval flags, and release flags are not accepted by this preflight-only payout release foundation.",
        payoutReleaseCreated: false,
        payoutApproved: false,
        transferCreated: false,
        payoutCreated: false,
        checkoutCreated: false,
      });
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          payoutReleaseCreated: false,
          payoutApproved: false,
          transferCreated: false,
          payoutCreated: false,
          checkoutCreated: false,
          stripeSecretRead: false,
        }),
      );
    }
    adminClient = adminConfig.client;

    const hasOperatorRole = await userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        liveMoneyAction: false,
        message: "Payout release preflight is admin/operator-only.",
        payoutReleaseCreated: false,
        payoutApproved: false,
        transferCreated: false,
        payoutCreated: false,
        checkoutCreated: false,
      });
    }

    requestedAuditLogId = await writeAuditLog(adminClient, {
      action: "payout_release_preflight_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: preconditionsRequiredPayload({
        auditWritten: false,
        targetId,
        targetUserId,
      }),
      metadata: {
        target_id: targetId,
        target_user_id: targetUserId,
      },
      reason: "Production payout release preflight requested; release remains blocked by required gates.",
      targetId,
      targetType: targetId ? "payout_release_candidate" : "payout_release_preflight",
      targetUserId,
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, {
      action: "payout_release_preflight_blocked",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: preconditionsRequiredPayload({
        auditWritten: true,
        targetId,
        targetUserId,
      }),
      metadata: {
        admin_review_required: true,
        fraud_review_required: true,
        hold_period_required: true,
        kyc_ready_required: true,
        legal_accounting_required: true,
        production_provider_approval_required: true,
        staged_rollout_required: true,
        support_dispute_policy_required: true,
        tax_ready_required: true,
        target_id: targetId,
        target_user_id: targetUserId,
      },
      reason:
        "Production payout release remains unavailable until legal/accounting, provider, KYC/tax, fraud, admin review, hold, audit, support, and rollout gates are proved.",
      targetId,
      targetType: targetId ? "payout_release_candidate" : "payout_release_preflight",
      targetUserId,
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
        targetId,
        targetUserId,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, {
      action: "payout_release_preflight_failed",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        error: sanitizeErrorMessage(error),
        requested_audit_log_id: requestedAuditLogId,
        target_id: targetId,
        target_user_id: targetUserId,
      },
      reason: "Payout release preflight failed; no payout release occurred.",
      severity: "warning",
      targetId,
      targetType: targetId ? "payout_release_candidate" : "payout_release_preflight",
      targetUserId,
    });

    return jsonResponse(500, {
      error: "payout_release_preflight_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      payoutReleaseCreated: false,
      payoutApproved: false,
      transferCreated: false,
      payoutCreated: false,
      checkoutCreated: false,
      audit: {
        failureAuditLogId,
      },
    });
  }
});
