import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  hasClientProviderTransferReference,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  requestedProviderTransferRecordId,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  type AuthenticatedUser,
  type StripeConnectTransferSyncPayload,
  type SupabaseClientLike,
  userHasPlatformRole,
  writeAuditLog,
} from "../_shared/stripe-connect.ts";

type StripeConnectTransferCreatePayload = StripeConnectTransferSyncPayload & {
  amount?: unknown;
  amount_cents?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  payout_batch_id?: unknown;
  payoutBatchId?: unknown;
  payout_ledger_entry_id?: unknown;
  payoutLedgerEntryId?: unknown;
};

const FUNCTION_NAME = "stripe-connect-transfer-create";

const hasClientMoneyInstruction = (payload: StripeConnectTransferCreatePayload) =>
  !!toText(
    payload.amount ??
      payload.amount_cents ??
      payload.amountCents ??
      payload.currency ??
      payload.payout_batch_id ??
      payload.payoutBatchId ??
      payload.payout_ledger_entry_id ??
      payload.payoutLedgerEntryId,
  );

const preconditionsRequiredPayload = (extra: Record<string, unknown> = {}) => ({
  status: "preconditions_required",
  provider: "stripe",
  providerKey: "stripe_connect",
  mode: "test",
  liveMoneyAction: false,
  providerCall: false,
  providerWrite: false,
  transferCreated: false,
  payoutCreated: false,
  checkoutCreated: false,
  stripeSecretRead: false,
  providerTransferRecordWritten: false,
  payoutApprovalRequired: true,
  fraudReviewRequired: true,
  kycTaxRequired: true,
  adminReviewRequired: true,
  auditRequired: true,
  idempotencyRequired: true,
  legalAccountingRequiredForProduction: true,
  message:
    "Stripe Connect test-mode payout transfer creation is not enabled. Provider, fraud, KYC/tax, admin review, immutable audit, and idempotency gates must be proved before any transfer lane can run.",
  ...extra,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      liveMoneyAction: false,
      message: "Use POST for Stripe Connect transfer creation preflight requests.",
      provider: "stripe",
      providerKey: "stripe_connect",
    });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let requestedAuditLogId: string | null = null;
  let requestedLocalTransferRecordId: string | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<StripeConnectTransferCreatePayload>(req);
    if ("error" in parsed) return parsed.error;
    requestedLocalTransferRecordId = requestedProviderTransferRecordId(parsed.value) || null;

    if (hasClientProviderTransferReference(parsed.value)) {
      return jsonResponse(400, {
        error: "provider_reference_not_allowed",
        liveMoneyAction: false,
        message: "Provider transfer and payout ids are backend-owned and are not accepted as transfer creation input.",
        provider: "stripe",
        providerKey: "stripe_connect",
        transferCreated: false,
        payoutCreated: false,
        checkoutCreated: false,
      });
    }

    if (hasClientMoneyInstruction(parsed.value)) {
      return jsonResponse(400, {
        error: "money_instruction_not_allowed",
        liveMoneyAction: false,
        message:
          "Amounts, currencies, payout batches, and payout ledger entries are not accepted by this preflight-only transfer foundation.",
        provider: "stripe",
        providerKey: "stripe_connect",
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
        message: "Stripe Connect transfer creation preflight is admin/operator-only.",
        provider: "stripe",
        providerKey: "stripe_connect",
        transferCreated: false,
        payoutCreated: false,
        checkoutCreated: false,
      });
    }

    requestedAuditLogId = await writeAuditLog(adminClient, {
      action: "payout_transfer_preflight_requested",
      actorEmail: currentUser.email,
      actorRole: "operator",
      actorUserId: currentUser.id,
      afterState: preconditionsRequiredPayload({
        auditWritten: false,
        localTransferRecordId: requestedLocalTransferRecordId,
      }),
      metadata: {
        function_name: FUNCTION_NAME,
        local_transfer_record_id: requestedLocalTransferRecordId,
        no_provider_secret_read: true,
        no_provider_call: true,
        no_transfer_created: true,
        no_payout_created: true,
      },
      reason: "Payout transfer creation preflight requested; transfer creation remains blocked by required gates.",
      severity: "notice",
      targetId: requestedLocalTransferRecordId,
      targetType: requestedLocalTransferRecordId ? "creator_payout_provider_transfer" : "payout_transfer_preflight",
      targetUserId: null,
    });

    const blockedAuditLogId = await writeAuditLog(adminClient, {
      action: "payout_transfer_preflight_blocked",
      actorEmail: currentUser.email,
      actorRole: "operator",
      actorUserId: currentUser.id,
      beforeState: {
        requested_audit_log_id: requestedAuditLogId,
      },
      afterState: preconditionsRequiredPayload({
        auditWritten: true,
        localTransferRecordId: requestedLocalTransferRecordId,
      }),
      metadata: {
        admin_review_required: true,
        audit_required: true,
        fraud_review_required: true,
        function_name: FUNCTION_NAME,
        idempotency_required: true,
        kyc_tax_required: true,
        local_transfer_record_id: requestedLocalTransferRecordId,
        provider_proof_required: true,
      },
      reason:
        "Payout transfer creation remains unavailable until provider, fraud, KYC/tax, admin review, immutable audit, and idempotency gates are proved.",
      severity: "notice",
      targetId: requestedLocalTransferRecordId,
      targetType: requestedLocalTransferRecordId ? "creator_payout_provider_transfer" : "payout_transfer_preflight",
      targetUserId: null,
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
        localTransferRecordId: requestedLocalTransferRecordId,
      }),
    );
  } catch (error) {
    const failureAuditLogId = await safeWriteAuditLog(adminClient, {
      action: "payout_transfer_preflight_failed",
      actorEmail: currentUser?.email ?? null,
      actorRole: currentUser ? "operator" : null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        error: sanitizeErrorMessage(error),
        function_name: FUNCTION_NAME,
        local_transfer_record_id: requestedLocalTransferRecordId,
        requested_audit_log_id: requestedAuditLogId,
      },
      reason: "Payout transfer creation preflight failed; no transfer or payout creation occurred.",
      severity: "warning",
      targetId: requestedLocalTransferRecordId,
      targetType: requestedLocalTransferRecordId ? "creator_payout_provider_transfer" : "payout_transfer_preflight",
      targetUserId: null,
    });

    return jsonResponse(500, {
      error: "payout_transfer_preflight_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
      transferCreated: false,
      payoutCreated: false,
      checkoutCreated: false,
      audit: {
        failureAuditLogId,
      },
    });
  }
});
