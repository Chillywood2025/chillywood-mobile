import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  insertProviderWebhookEvent,
  isStripeConnectFoundationWebhookEventType,
  jsonResponse,
  normalizeStripeAccount,
  notConfiguredPayload,
  optionsResponse,
  parseStripeEvent,
  readCreatorPayoutAccountByProviderId,
  readStripeWebhookSecret,
  safeAccountStatusPayload,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  stripeAccountFromEvent,
  toText,
  type StripeProviderEvent,
  type SupabaseClientLike,
  updateProviderWebhookEvent,
  upsertCreatorPayoutAccountFromStripe,
  upsertEligibilityRecord,
  verifyStripeWebhookSignature,
  writeAuditLog,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-connect-webhook";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect webhook requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let eventRowId: string | null = null;
  let event: StripeProviderEvent | null = null;

  try {
    const webhookSecret = readStripeWebhookSecret();
    if (!webhookSecret.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(webhookSecret.reason, webhookSecret.message, {
          eventStored: false,
          signatureVerified: false,
          webhookProcessed: false,
        }),
      );
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(adminConfig.reason, adminConfig.message, {
          eventStored: false,
          signatureVerified: false,
          webhookProcessed: false,
        }),
      );
    }
    adminClient = adminConfig.client;

    const rawBody = await req.text();
    const signatureVerified = await verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"), webhookSecret.secret);
    if (!signatureVerified) {
      await safeWriteAuditLog(adminClient, {
        action: "stripe_connect_webhook_failed",
        metadata: {
          failure_reason: "signature_verification_failed",
          function_name: FUNCTION_NAME,
        },
        reason: "Stripe Connect webhook signature verification failed.",
        severity: "warning",
        targetType: "stripe_connect_webhook",
      });

      return jsonResponse(400, {
        error: "invalid_signature",
        liveMoneyAction: false,
        message: "Stripe webhook signature verification failed.",
        mode: "test",
        provider: "stripe",
        providerKey: "stripe_connect",
        signatureVerified: false,
      });
    }

    event = parseStripeEvent(rawBody);
    if (event.livemode === true) {
      await safeWriteAuditLog(adminClient, {
        action: "stripe_connect_webhook_failed",
        metadata: {
          event_id: toText(event.id),
          event_type: toText(event.type),
          failure_reason: "live_mode_event_rejected",
          function_name: FUNCTION_NAME,
        },
        reason: "Live-mode Stripe webhook event was rejected by the test-mode function.",
        severity: "warning",
        targetType: "stripe_connect_webhook",
      });

      return jsonResponse(200, {
        status: "ignored",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: false,
        signatureVerified: true,
        webhookProcessed: false,
        message: "Live-mode Stripe events are not processed by this test-mode function.",
      });
    }

    const accountFromEvent = stripeAccountFromEvent(event);
    const providerAccountId = toText(accountFromEvent?.id ?? event.account) || null;
    const eventRecord = await insertProviderWebhookEvent(adminClient, event, providerAccountId);
    eventRowId = toText(eventRecord.row?.id) || null;

    if (eventRecord.duplicate) {
      return jsonResponse(200, {
        status: "duplicate",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: false,
        signatureVerified: true,
        webhookProcessed: false,
        message: "Stripe Connect webhook event was already recorded and was not processed again.",
      });
    }

    const receivedAuditId = await writeAuditLog(adminClient, {
      action: "stripe_connect_webhook_received",
      metadata: {
        event_id: toText(event.id),
        event_type: toText(event.type),
        function_name: FUNCTION_NAME,
        provider_account_id: providerAccountId,
      },
      targetId: providerAccountId,
      targetType: "stripe_connect_webhook",
    });

    const eventType = toText(event.type);
    if (eventType !== "account.updated") {
      const isFoundationEvent = isStripeConnectFoundationWebhookEventType(eventType);
      const ignoredReason = isFoundationEvent
        ? "foundation_event_recorded_no_live_money"
        : "event_type_not_supported_in_s3c";
      const ignoredAuditId = await writeAuditLog(adminClient, {
        action: "stripe_connect_webhook_processed",
        metadata: {
          event_id: toText(event.id),
          event_type: eventType,
          function_name: FUNCTION_NAME,
          ignored_reason: ignoredReason,
          supported_foundation_event: isFoundationEvent,
          provider_account_id: providerAccountId,
        },
        targetId: providerAccountId,
        targetType: "stripe_connect_webhook",
      });

      if (eventRowId) {
        await updateProviderWebhookEvent(adminClient, eventRowId, {
          auditLogId: ignoredAuditId,
          metadata: {
            event_id: toText(event.id),
            event_type: eventType,
            ignored_reason: ignoredReason,
            supported_foundation_event: isFoundationEvent,
          },
          status: "ignored",
        });
      }

      return jsonResponse(200, {
        status: "ignored",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: true,
        foundationEventSupported: isFoundationEvent,
        signatureVerified: true,
        webhookProcessed: true,
        message: isFoundationEvent
          ? "Stripe Connect webhook event was recorded for monetization foundation proof. No checkout, order, ledger, payout, or live money action is active."
          : "Stripe Connect webhook event was recorded but ignored because this foundation does not process that event type.",
      });
    }

    if (!accountFromEvent || !providerAccountId) throw new Error("account.updated webhook did not include a Stripe account object.");

    const payoutAccount = await readCreatorPayoutAccountByProviderId(adminClient, providerAccountId);
    if (!payoutAccount) {
      const ignoredAuditId = await writeAuditLog(adminClient, {
        action: "stripe_connect_webhook_processed",
        metadata: {
          event_id: toText(event.id),
          event_type: toText(event.type),
          function_name: FUNCTION_NAME,
          ignored_reason: "payout_account_not_found",
          provider_account_id: providerAccountId,
          received_audit_log_id: receivedAuditId,
        },
        targetId: providerAccountId,
        targetType: "creator_payout_account",
      });

      if (eventRowId) {
        await updateProviderWebhookEvent(adminClient, eventRowId, {
          auditLogId: ignoredAuditId,
          metadata: {
            event_id: toText(event.id),
            event_type: toText(event.type),
            ignored_reason: "payout_account_not_found",
          },
          status: "ignored",
        });
      }

      return jsonResponse(200, {
        status: "ignored",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: true,
        signatureVerified: true,
        webhookProcessed: true,
        message: "Stripe Connect account.updated event was recorded, but no matching payout account exists.",
      });
    }

    const normalizedAccount = normalizeStripeAccount(accountFromEvent);
    const processedAuditId = await writeAuditLog(adminClient, {
      action: "stripe_connect_webhook_processed",
      afterState: safeAccountStatusPayload(normalizedAccount),
      metadata: {
        event_id: toText(event.id),
        event_type: toText(event.type),
        function_name: FUNCTION_NAME,
        provider_account_id: providerAccountId,
        received_audit_log_id: receivedAuditId,
      },
      targetId: payoutAccount.id,
      targetType: "creator_payout_account",
      targetUserId: payoutAccount.creator_user_id,
    });

    const updatedAccount = await upsertCreatorPayoutAccountFromStripe(
      adminClient,
      payoutAccount.creator_user_id,
      normalizedAccount,
      payoutAccount,
      processedAuditId,
      FUNCTION_NAME,
    );
    await upsertEligibilityRecord(adminClient, updatedAccount.creator_user_id, updatedAccount.id, normalizedAccount, processedAuditId);

    if (eventRowId) {
      await updateProviderWebhookEvent(adminClient, eventRowId, {
        auditLogId: processedAuditId,
        metadata: {
          event_id: toText(event.id),
          event_type: toText(event.type),
          provider_account_id: providerAccountId,
          provider_status: normalizedAccount.legacyStatus,
        },
        status: "processed",
      });
    }

    return jsonResponse(200, {
      status: "processed",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      liveMoneyAction: false,
      eventStored: true,
      signatureVerified: true,
      webhookProcessed: true,
      payoutCreated: false,
      transferCreated: false,
      checkoutCreated: false,
      account: safeAccountStatusPayload(normalizedAccount),
      audit: {
        processed: true,
        processedAuditLogId: processedAuditId,
        received: true,
        receivedAuditLogId: receivedAuditId,
      },
      message: "Stripe Connect test-mode account.updated webhook was processed. Payout execution remains inactive.",
    });
  } catch (error) {
    const failureAuditId = await safeWriteAuditLog(adminClient, {
      action: "stripe_connect_webhook_failed",
      metadata: {
        error: sanitizeErrorMessage(error),
        event_id: toText(event?.id),
        event_type: toText(event?.type),
        function_name: FUNCTION_NAME,
      },
      reason: "Stripe Connect webhook processing failed.",
      severity: "warning",
      targetType: "stripe_connect_webhook",
    });

    if (adminClient && eventRowId) {
      await updateProviderWebhookEvent(adminClient, eventRowId, {
        auditLogId: failureAuditId,
        failureReason: sanitizeErrorMessage(error),
        metadata: {
          event_id: toText(event?.id),
          event_type: toText(event?.type),
        },
        status: "failed",
      }).catch(() => undefined);
    }

    return jsonResponse(500, {
      error: "stripe_connect_webhook_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
    });
  }
});
