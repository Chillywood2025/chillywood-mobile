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
  readProviderTransferRecord,
  readStripeTestSecret,
  requestedProviderTransferRecordId,
  retrieveStripePayout,
  retrieveStripeTransfer,
  safeTransferStatusPayload,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  type AuthenticatedUser,
  type CreatorPayoutProviderTransferRow,
  type StripeConnectTransferSyncPayload,
  type SupabaseClientLike,
  normalizeStripePayoutStatus,
  normalizeStripeTransferStatus,
  updateProviderTransferSyncResult,
  userHasPlatformRole,
  writeAuditLog,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-connect-transfer-sync";

const notSyncableResponse = (record: CreatorPayoutProviderTransferRow, message: string, auditLogId: string | null) =>
  jsonResponse(200, {
    status: "sync_unavailable",
    provider: "stripe",
    providerKey: "stripe_connect",
    mode: "test",
    liveMoneyAction: false,
    providerCall: false,
    providerWrite: false,
    transferCreated: false,
    payoutCreated: false,
    checkoutCreated: false,
    localTransferRecordId: record.id,
    audit: {
      failureAuditLogId: auditLogId,
      failed: !!auditLogId,
    },
    message,
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect transfer sync requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;
  let transferRecord: CreatorPayoutProviderTransferRow | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<StripeConnectTransferSyncPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasClientProviderTransferReference(parsed.value)) {
      return jsonResponse(400, {
        error: "provider_reference_not_allowed",
        message: "Provider transfer and payout ids are backend-owned and are not accepted as authoritative client input.",
      });
    }

    const providerTransferRecordId = requestedProviderTransferRecordId(parsed.value);
    if (!providerTransferRecordId) {
      return jsonResponse(400, {
        error: "provider_transfer_record_id_required",
        message: "provider_transfer_record_id is required for transfer status sync.",
      });
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          providerTransferRecordId,
          transferSynced: false,
        }),
      );
    }
    adminClient = adminConfig.client;

    const hasOperatorRole = await userHasPlatformRole(adminClient, currentUser, ["owner", "operator"]);
    if (!hasOperatorRole) {
      return jsonResponse(403, {
        error: "operator_required",
        liveMoneyAction: false,
        message: "Provider transfer sync is admin/operator-only in this foundation lane.",
        provider: "stripe",
        providerKey: "stripe_connect",
      });
    }

    transferRecord = await readProviderTransferRecord(adminClient, providerTransferRecordId);
    if (!transferRecord) {
      return jsonResponse(404, {
        error: "provider_transfer_record_not_found",
        liveMoneyAction: false,
        message: "No local provider transfer record exists for that id.",
        provider: "stripe",
        providerKey: "stripe_connect",
      });
    }

    const safeBeforeState = safeTransferStatusPayload(transferRecord);
    const requestedAuditId = await writeAuditLog(adminClient, {
      action: "provider_transfer_sync_requested",
      actorEmail: currentUser.email,
      actorRole: "operator",
      actorUserId: currentUser.id,
      beforeState: safeBeforeState,
      metadata: {
        function_name: FUNCTION_NAME,
        transfer_record_id: transferRecord.id,
        provider_transfer_id_present: !!transferRecord.provider_transfer_id,
        provider_payout_id_present: !!transferRecord.provider_payout_id,
      },
      reason: "Provider transfer status sync requested; no transfer or payout creation is available.",
      targetId: transferRecord.id,
      targetType: "creator_payout_provider_transfer",
      targetUserId: transferRecord.creator_user_id ?? null,
    });

    if (toText(transferRecord.provider) !== "stripe_connect") {
      const failureAuditId = await writeAuditLog(adminClient, {
        action: "provider_transfer_sync_failed",
        actorEmail: currentUser.email,
        actorRole: "operator",
        actorUserId: currentUser.id,
        beforeState: safeBeforeState,
        metadata: {
          failure_reason: "unsupported_provider",
          function_name: FUNCTION_NAME,
          requested_audit_log_id: requestedAuditId,
          transfer_record_id: transferRecord.id,
        },
        reason: "Provider transfer sync only supports Stripe Connect test-mode records in this lane.",
        severity: "warning",
        targetId: transferRecord.id,
        targetType: "creator_payout_provider_transfer",
        targetUserId: transferRecord.creator_user_id ?? null,
      });

      return notSyncableResponse(
        transferRecord,
        "This local transfer record is not a Stripe Connect test-mode record, so provider sync was not attempted.",
        failureAuditId,
      );
    }

    if (toText(transferRecord.provider_environment) !== "test") {
      const failureAuditId = await writeAuditLog(adminClient, {
        action: "provider_transfer_sync_failed",
        actorEmail: currentUser.email,
        actorRole: "operator",
        actorUserId: currentUser.id,
        beforeState: safeBeforeState,
        metadata: {
          failure_reason: "non_test_provider_environment",
          function_name: FUNCTION_NAME,
          requested_audit_log_id: requestedAuditId,
          transfer_record_id: transferRecord.id,
        },
        reason: "Live provider transfer sync is not allowed in this foundation lane.",
        severity: "warning",
        targetId: transferRecord.id,
        targetType: "creator_payout_provider_transfer",
        targetUserId: transferRecord.creator_user_id ?? null,
      });

      return notSyncableResponse(
        transferRecord,
        "Only Stripe Connect test-mode provider transfer records can be synced in this foundation lane.",
        failureAuditId,
      );
    }

    if (!transferRecord.provider_transfer_id && !transferRecord.provider_payout_id) {
      const failureAuditId = await writeAuditLog(adminClient, {
        action: "provider_transfer_sync_failed",
        actorEmail: currentUser.email,
        actorRole: "operator",
        actorUserId: currentUser.id,
        beforeState: safeBeforeState,
        metadata: {
          failure_reason: "provider_reference_missing",
          function_name: FUNCTION_NAME,
          requested_audit_log_id: requestedAuditId,
          transfer_record_id: transferRecord.id,
        },
        reason: "No provider transfer or payout id exists on the local foundation record.",
        severity: "notice",
        targetId: transferRecord.id,
        targetType: "creator_payout_provider_transfer",
        targetUserId: transferRecord.creator_user_id ?? null,
      });

      return notSyncableResponse(
        transferRecord,
        "No provider transfer or payout id is stored for this local foundation record. No Stripe transfer was created to satisfy proof.",
        failureAuditId,
      );
    }

    const stripeSecret = readStripeTestSecret();
    if (!stripeSecret.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(stripeSecret.reason, stripeSecret.message, {
          audit: {
            requested: true,
            requestedAuditLogId: requestedAuditId,
          },
          localTransferRecordId: transferRecord.id,
          transferSynced: false,
        }),
      );
    }

    const normalizedStatus = transferRecord.provider_transfer_id
      ? normalizeStripeTransferStatus(await retrieveStripeTransfer(stripeSecret.secret, transferRecord.provider_transfer_id))
      : normalizeStripePayoutStatus(await retrieveStripePayout(stripeSecret.secret, toText(transferRecord.provider_payout_id)));

    const syncedAuditAction = transferRecord.provider_transfer_id ? "provider_transfer_synced" : "provider_payout_status_imported";
    const syncedAuditId = await writeAuditLog(adminClient, {
      action: syncedAuditAction,
      actorEmail: currentUser.email,
      actorRole: "operator",
      actorUserId: currentUser.id,
      afterState: {
        ...safeBeforeState,
        provider_status: normalizedStatus.providerStatus,
        status: normalizedStatus.localStatus,
      },
      beforeState: safeBeforeState,
      metadata: {
        function_name: FUNCTION_NAME,
        provider_payout_id_present: !!transferRecord.provider_payout_id,
        provider_transfer_id_present: !!transferRecord.provider_transfer_id,
        requested_audit_log_id: requestedAuditId,
        transfer_record_id: transferRecord.id,
      },
      reason: "Provider transfer/payout status was imported from Stripe test mode; no money movement occurred.",
      targetId: transferRecord.id,
      targetType: "creator_payout_provider_transfer",
      targetUserId: transferRecord.creator_user_id ?? null,
    });

    const estimatedArrivalAt =
      "estimatedArrivalAt" in normalizedStatus && typeof normalizedStatus.estimatedArrivalAt === "string"
        ? normalizedStatus.estimatedArrivalAt
        : null;

    const updatedRecord = await updateProviderTransferSyncResult(adminClient, transferRecord, {
      auditLogId: syncedAuditId,
      estimatedArrivalAt,
      failureCode: normalizedStatus.failureCode,
      failureMessage: normalizedStatus.failureMessage,
      providerCreatedAt: normalizedStatus.providerCreatedAt,
      providerStatus: normalizedStatus.providerStatus,
      source: FUNCTION_NAME,
      status: normalizedStatus.localStatus,
    });

    let statusChangedAuditId: string | null = null;
    if (toText(transferRecord.status) !== normalizedStatus.localStatus) {
      statusChangedAuditId = await writeAuditLog(adminClient, {
        action: "provider_transfer_status_changed",
        actorEmail: currentUser.email,
        actorRole: "operator",
        actorUserId: currentUser.id,
        afterState: safeTransferStatusPayload(updatedRecord),
        beforeState: safeBeforeState,
        metadata: {
          function_name: FUNCTION_NAME,
          new_status: normalizedStatus.localStatus,
          old_status: toText(transferRecord.status),
          provider_status: normalizedStatus.providerStatus,
          synced_audit_log_id: syncedAuditId,
          transfer_record_id: transferRecord.id,
        },
        reason: "Local provider transfer status changed from a Stripe test-mode status import.",
        targetId: transferRecord.id,
        targetType: "creator_payout_provider_transfer",
        targetUserId: transferRecord.creator_user_id ?? null,
      });
    }

    return jsonResponse(200, {
      status: "synced_test",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      liveMoneyAction: false,
      providerCall: true,
      providerWrite: true,
      transferCreated: false,
      payoutCreated: false,
      checkoutCreated: false,
      localTransferRecordId: updatedRecord.id,
      providerStatus: normalizedStatus.providerStatus,
      syncedAt: updatedRecord.last_provider_sync_at ?? null,
      failureCode: normalizedStatus.failureCode,
      failureMessage: normalizedStatus.failureMessage,
      audit: {
        requested: true,
        requestedAuditLogId: requestedAuditId,
        statusChangedAuditLogId: statusChangedAuditId,
        synced: true,
        syncedAuditLogId: syncedAuditId,
      },
      message: "Stripe test-mode provider transfer status was imported. No transfer, payout, checkout, or live money movement occurred.",
    });
  } catch (error) {
    const failureAuditId = await safeWriteAuditLog(adminClient, {
      action: "provider_transfer_sync_failed",
      actorEmail: currentUser?.email ?? null,
      actorRole: currentUser ? "operator" : null,
      actorUserId: currentUser?.id ?? null,
      beforeState: transferRecord ? safeTransferStatusPayload(transferRecord) : null,
      metadata: {
        error: sanitizeErrorMessage(error),
        function_name: FUNCTION_NAME,
        transfer_record_id: transferRecord?.id ?? null,
      },
      reason: "Provider transfer sync failed; no transfer or payout creation occurred.",
      severity: "warning",
      targetId: transferRecord?.id ?? null,
      targetType: "creator_payout_provider_transfer",
      targetUserId: transferRecord?.creator_user_id ?? null,
    });

    return jsonResponse(500, {
      error: "stripe_connect_transfer_sync_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
      audit: {
        failureAuditLogId: failureAuditId,
      },
    });
  }
});
