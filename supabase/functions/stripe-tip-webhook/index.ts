import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseStripeEvent,
  readOptionalEnv,
  readStripeWebhookSecret,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  verifyStripeWebhookSignature,
  type SupabaseClientLike,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-tip-webhook";

type StripeTipEvent = ReturnType<typeof parseStripeEvent>;
type StripeObject = Record<string, unknown> & {
  amount?: number;
  amount_total?: number;
  client_reference_id?: string;
  currency?: string;
  id?: string;
  metadata?: Record<string, unknown>;
  payment_intent?: string | null;
  status?: string;
};

const tipEventTypes = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

const encoder = new TextEncoder();

const readStripeTipWebhookSecret = () => {
  const tipSecret = readOptionalEnv("STRIPE_TIP_WEBHOOK_SECRET");
  if (tipSecret) {
    if (!tipSecret.startsWith("whsec_")) {
      return {
        configured: false as const,
        message: "Stripe tip webhook signing secret is not a valid test webhook secret.",
        reason: "stripe_tip_webhook_secret_invalid",
      };
    }
    return { configured: true as const, secret: tipSecret };
  }

  return readStripeWebhookSecret();
};

const hashText = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const eventObject = (event: StripeTipEvent): StripeObject | null => {
  const object = event.data?.object;
  if (!object || typeof object !== "object" || Array.isArray(object)) return null;
  return object as StripeObject;
};

const tipIdFromObject = (object: StripeObject | null) =>
  toText(object?.metadata?.chillywood_tip_id ?? object?.client_reference_id) || null;

const paymentIntentFromObject = (object: StripeObject | null) =>
  toText(object?.payment_intent ?? (toText(object?.id).startsWith("pi_") ? object?.id : null)) || null;

const checkoutSessionFromObject = (object: StripeObject | null, eventType: string) =>
  eventType.startsWith("checkout.session.") ? toText(object?.id) || null : null;

const insertWebhookEvent = async (adminClient: SupabaseClientLike, event: StripeTipEvent, rawBody: string) => {
  const eventId = toText(event.id);
  const eventType = toText(event.type);
  const { data, error } = await adminClient
    .from("monetization_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      idempotency_key: eventId,
      provider: "stripe_tip",
      raw_event_hash: await hashText(rawBody),
      status: "received",
    })
    .select("id")
    .single();

  if (error && error.code === "23505") {
    const { data: existing, error: readError } = await adminClient
      .from("monetization_webhook_events")
      .select("id,status")
      .eq("provider", "stripe_tip")
      .eq("idempotency_key", eventId)
      .maybeSingle();
    if (readError) throw new Error(`Tip webhook duplicate lookup failed: ${readError.message}`);
    return { duplicate: true as const, rowId: toText((existing as { id?: unknown } | null)?.id) || null };
  }

  if (error) throw new Error(`Tip webhook event insert failed: ${error.message}`);
  return { duplicate: false as const, rowId: toText((data as { id?: unknown } | null)?.id) || null };
};

const updateWebhookEvent = async (
  adminClient: SupabaseClientLike,
  rowId: string | null,
  status: "processed" | "ignored" | "failed",
) => {
  if (!rowId) return;
  const { error } = await adminClient
    .from("monetization_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      status,
    })
    .eq("id", rowId);
  if (error) throw new Error(`Tip webhook event update failed: ${error.message}`);
};

const readTipIdByObject = async (adminClient: SupabaseClientLike, object: StripeObject | null, eventType: string) => {
  const tipId = tipIdFromObject(object);
  if (tipId) return tipId;

  const checkoutSessionId = checkoutSessionFromObject(object, eventType);
  if (checkoutSessionId) {
    const { data, error } = await adminClient
      .from("creator_tip_transactions")
      .select("id")
      .eq("provider_checkout_session_id", checkoutSessionId)
      .maybeSingle();
    if (error) throw new Error(`Tip checkout session lookup failed: ${error.message}`);
    const found = toText((data as { id?: unknown } | null)?.id);
    if (found) return found;
  }

  const paymentIntentId = paymentIntentFromObject(object);
  if (paymentIntentId) {
    const { data, error } = await adminClient
      .from("creator_tip_transactions")
      .select("id")
      .eq("provider_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (error) throw new Error(`Tip payment intent lookup failed: ${error.message}`);
    const found = toText((data as { id?: unknown } | null)?.id);
    if (found) return found;
  }

  return null;
};

const tipEventTypeForStripeEvent = (eventType: string) => {
  switch (eventType) {
    case "checkout.session.completed":
      return "checkout_completed";
    case "checkout.session.expired":
      return "checkout_canceled";
    case "payment_intent.succeeded":
      return "payment_succeeded";
    case "payment_intent.payment_failed":
      return "payment_failed";
    case "charge.refunded":
      return "refunded";
    case "charge.dispute.created":
      return "disputed";
    default:
      return "webhook_ignored";
  }
};

const updateTipForEvent = async (
  adminClient: SupabaseClientLike,
  event: StripeTipEvent,
  object: StripeObject | null,
) => {
  const eventType = toText(event.type);
  const tipId = await readTipIdByObject(adminClient, object, eventType);
  if (!tipId) return { tipId: null, updated: false, reason: "tip_not_found" };

  const now = new Date().toISOString();
  const checkoutSessionId = checkoutSessionFromObject(object, eventType);
  const paymentIntentId = paymentIntentFromObject(object);
  const currency = toText(object?.currency).toLowerCase() || undefined;
  const amount = typeof object?.amount_total === "number"
    ? object.amount_total
    : typeof object?.amount === "number"
      ? object.amount
      : undefined;

  const baseUpdate: Record<string, unknown> = {
    metadata: {
      access_granted: false,
      live_money_action: false,
      no_badge: true,
      no_digital_content: true,
      no_perk: true,
      no_room_access: true,
      no_vip: true,
      provider_event_id: toText(event.id),
      provider_event_type: eventType,
      provider_payload_stored: false,
      pure_contribution_only: true,
      test_mode: true,
      updated_by: FUNCTION_NAME,
    },
    provider_payment_intent_id: paymentIntentId || undefined,
    provider_checkout_session_id: checkoutSessionId || undefined,
    updated_at: now,
  };

  const update = (() => {
    switch (eventType) {
      case "checkout.session.completed":
      case "payment_intent.succeeded":
        return {
          ...baseUpdate,
          creator_net_cents: amount,
          currency,
          paid_at: now,
          payment_status: "succeeded",
          payout_status: "not_payable",
          status: "paid",
        };
      case "payment_intent.payment_failed":
        return {
          ...baseUpdate,
          failed_at: now,
          payment_status: "failed",
          status: "failed",
        };
      case "checkout.session.expired":
        return {
          ...baseUpdate,
          failed_at: now,
          payment_status: "canceled",
          status: "canceled",
        };
      case "charge.refunded":
        return {
          ...baseUpdate,
          payout_status: "reversed",
          payment_status: "refunded",
          refunded_at: now,
          status: "refunded",
        };
      case "charge.dispute.created":
        return {
          ...baseUpdate,
          disputed_at: now,
          payout_status: "reversed",
          payment_status: "charged_back",
          status: "disputed",
        };
      default:
        return baseUpdate;
    }
  })();

  const cleanedUpdate = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
  const { data, error } = await adminClient
    .from("creator_tip_transactions")
    .update(cleanedUpdate)
    .eq("id", tipId)
    .select("id,creator_id,sender_id,tip_amount_cents,currency,status")
    .single();
  if (error) throw new Error(`Tip transaction webhook update failed: ${error.message}`);

  await adminClient.from("creator_tip_events").insert({
    actor_id: null,
    event_type: tipEventTypeForStripeEvent(eventType),
    provider_event_id: toText(event.id),
    tip_transaction_id: tipId,
    metadata: {
      amount_cents: amount ?? (data as { tip_amount_cents?: unknown } | null)?.tip_amount_cents ?? null,
      event_type: eventType,
      no_access_granted: true,
      pure_contribution_only: true,
      status: (data as { status?: unknown } | null)?.status ?? null,
    },
  });

  return { tipId, updated: true, reason: "tip_updated" };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe tip webhook requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let webhookRowId: string | null = null;
  let event: StripeTipEvent | null = null;

  try {
    const webhookSecret = readStripeTipWebhookSecret();
    if (!webhookSecret.configured) {
      return jsonResponse(200, notConfiguredPayload(webhookSecret.reason, webhookSecret.message, {
        eventStored: false,
        signatureVerified: false,
        webhookProcessed: false,
      }));
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, {
        eventStored: false,
        signatureVerified: false,
        webhookProcessed: false,
      }));
    }
    adminClient = adminConfig.client;

    const rawBody = await req.text();
    const signatureVerified = await verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"), webhookSecret.secret);
    if (!signatureVerified) {
      await safeWriteAuditLog(adminClient, {
        action: "creator_tip_webhook_failed",
        metadata: { failure_reason: "signature_verification_failed", function_name: FUNCTION_NAME },
        reason: "Stripe tip webhook signature verification failed.",
        severity: "warning",
        targetType: "creator_tip_webhook",
      });
      return jsonResponse(400, {
        error: "invalid_signature",
        liveMoneyAction: false,
        message: "Stripe tip webhook signature verification failed.",
        mode: "test",
        provider: "stripe",
        providerKey: "stripe_connect",
        signatureVerified: false,
      });
    }

    event = parseStripeEvent(rawBody);
    if (event.livemode === true) {
      await safeWriteAuditLog(adminClient, {
        action: "creator_tip_webhook_failed",
        metadata: {
          event_id: toText(event.id),
          event_type: toText(event.type),
          failure_reason: "live_mode_event_rejected",
          function_name: FUNCTION_NAME,
        },
        reason: "Live-mode Stripe tip webhook event was rejected by the test-mode function.",
        severity: "warning",
        targetType: "creator_tip_webhook",
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
        message: "Live-mode Stripe tip events are not processed by Tips V1.",
      });
    }

    const eventType = toText(event.type);
    const object = eventObject(event);
    const webhookRecord = await insertWebhookEvent(adminClient, event, rawBody);
    webhookRowId = webhookRecord.rowId;

    if (webhookRecord.duplicate) {
      await adminClient.from("creator_tip_events").insert({
        actor_id: null,
        event_type: "webhook_duplicate",
        provider_event_id: toText(event.id),
        metadata: {
          event_type: eventType,
          no_access_granted: true,
          pure_contribution_only: true,
        },
      });

      return jsonResponse(200, {
        status: "duplicate",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: false,
        signatureVerified: true,
        webhookProcessed: false,
        message: "Stripe tip webhook event was already recorded and was not processed again.",
      });
    }

    if (!tipEventTypes.has(eventType)) {
      await updateWebhookEvent(adminClient, webhookRowId, "ignored");
      await adminClient.from("creator_tip_events").insert({
        actor_id: null,
        event_type: "webhook_ignored",
        provider_event_id: toText(event.id),
        metadata: {
          event_type: eventType,
          ignored_reason: "unsupported_tip_event_type",
          no_access_granted: true,
          pure_contribution_only: true,
        },
      });
      return jsonResponse(200, {
        status: "ignored",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: true,
        signatureVerified: true,
        webhookProcessed: true,
        message: "Stripe event was recorded but ignored because it is not a Tips V1 event.",
      });
    }

    const result = await updateTipForEvent(adminClient, event, object);
    await updateWebhookEvent(adminClient, webhookRowId, result.updated ? "processed" : "ignored");

    await safeWriteAuditLog(adminClient, {
      action: "creator_tip_webhook_processed",
      metadata: {
        event_id: toText(event.id),
        event_type: eventType,
        function_name: FUNCTION_NAME,
        no_access_granted: true,
        processing_reason: result.reason,
        pure_contribution_only: true,
        tip_id: result.tipId,
      },
      reason: "Stripe test-mode creator tip webhook processed without granting access or perks.",
      targetId: result.tipId,
      targetType: "creator_tip_transaction",
    });

    return jsonResponse(200, {
      status: result.updated ? "processed" : "ignored",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      liveMoneyAction: false,
      eventStored: true,
      signatureVerified: true,
      webhookProcessed: true,
      linkedTipId: result.tipId,
      noAccessGranted: true,
      pureContributionOnly: true,
      message: result.updated
        ? "Stripe test-mode tip event updated the tip transaction only."
        : "Stripe test-mode tip event was stored but no matching tip was found.",
    });
  } catch (error) {
    await updateWebhookEvent(adminClient as SupabaseClientLike, webhookRowId, "failed").catch(() => undefined);
    await safeWriteAuditLog(adminClient, {
      action: "creator_tip_webhook_failed",
      metadata: {
        error: sanitizeErrorMessage(error),
        event_id: toText(event?.id),
        event_type: toText(event?.type),
        function_name: FUNCTION_NAME,
      },
      reason: "Stripe test-mode creator tip webhook failed.",
      severity: "warning",
      targetType: "creator_tip_webhook",
    });

    return jsonResponse(500, {
      error: "creator_tip_webhook_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
      webhookProcessed: false,
    });
  }
});
