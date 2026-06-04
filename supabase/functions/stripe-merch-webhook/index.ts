import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  jsonResponse,
  notConfiguredPayload,
  optionsResponse,
  parseStripeEvent,
  readStripeWebhookSecret,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  verifyStripeWebhookSignature,
  type SupabaseClientLike,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-merch-webhook";

type StripeMerchEvent = ReturnType<typeof parseStripeEvent>;
type StripeObject = Record<string, unknown> & {
  amount?: number;
  amount_subtotal?: number;
  amount_total?: number;
  client_reference_id?: string;
  currency?: string;
  id?: string;
  metadata?: Record<string, unknown>;
  payment_intent?: string | null;
  status?: string;
};

const merchEventTypes = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

const eventObject = (event: StripeMerchEvent): StripeObject | null => {
  const object = event.data?.object;
  if (!object || typeof object !== "object" || Array.isArray(object)) return null;
  return object as StripeObject;
};

const objectId = (object: StripeObject | null) => toText(object?.id) || null;

const orderIdFromObject = (object: StripeObject | null) =>
  toText(object?.metadata?.chillywood_order_id ?? object?.client_reference_id) || null;

const paymentIntentFromObject = (object: StripeObject | null) =>
  toText(object?.payment_intent ?? object?.id) || null;

const sanitizedEventMetadata = (event: StripeMerchEvent, object: StripeObject | null, extra: Record<string, unknown> = {}) => ({
  amount_total_minor: typeof object?.amount_total === "number" ? object.amount_total : null,
  charge_amount_minor: typeof object?.amount === "number" ? object.amount : null,
  checkout_session_id: toText(object?.id) || null,
  creates_digital_access: false,
  digital_access_grant_created: false,
  event_type: toText(event.type),
  live_money_action: false,
  object_id: objectId(object),
  physical_merch_only: true,
  premium_entitlement_created: false,
  provider_payload_stored: false,
  rail: "physical_merch",
  revenuecat_entitlement_created: false,
  sandbox_only: true,
  ...extra,
});

const insertStripeMerchEvent = async (
  adminClient: SupabaseClientLike,
  event: StripeMerchEvent,
  object: StripeObject | null,
) => {
  const eventId = toText(event.id);
  const eventType = toText(event.type);
  const orderId = orderIdFromObject(object);
  const { data, error } = await adminClient
    .from("stripe_merch_events")
    .insert({
      environment: "sandbox",
      event_type: eventType,
      linked_order_id: orderId,
      metadata: sanitizedEventMetadata(event, object),
      object_id: objectId(object),
      provider: "stripe",
      status: "received",
      stripe_event_id: eventId,
    })
    .select("id, linked_order_id")
    .single();

  if (error && error.code === "23505") {
    const { data: existing, error: readError } = await adminClient
      .from("stripe_merch_events")
      .select("id, linked_order_id, status")
      .eq("stripe_event_id", eventId)
      .maybeSingle();

    if (readError) throw new Error(`Stripe merch duplicate lookup failed: ${readError.message}`);
    return { duplicate: true as const, row: existing as { id?: string; linked_order_id?: string | null; status?: string } | null };
  }

  if (error) throw new Error(`Stripe merch event insert failed: ${error.message}`);
  return { duplicate: false as const, row: data as { id?: string; linked_order_id?: string | null } | null };
};

const updateStripeMerchEvent = async (
  adminClient: SupabaseClientLike,
  rowId: string | null,
  status: "processed" | "ignored" | "failed",
  metadata: Record<string, unknown>,
) => {
  if (!rowId) return;
  const { error } = await adminClient
    .from("stripe_merch_events")
    .update({
      metadata,
      processed_at: new Date().toISOString(),
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) throw new Error(`Stripe merch event update failed: ${error.message}`);
};

const readOrderByStripeObject = async (adminClient: SupabaseClientLike, object: StripeObject | null) => {
  const orderId = orderIdFromObject(object);
  const sessionId = toText(object?.id);
  const paymentIntentId = paymentIntentFromObject(object);

  if (orderId) {
    const result = await adminClient
      .from("merch_orders")
      .select("id")
      .eq("id", orderId)
      .maybeSingle();
    if (result.error) throw new Error(`Merch order lookup failed: ${result.error.message}`);
    if (result.data) return toText((result.data as { id?: unknown }).id);
  }

  if (sessionId) {
    const result = await adminClient
      .from("merch_orders")
      .select("id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (result.error) throw new Error(`Merch order session lookup failed: ${result.error.message}`);
    if (result.data) return toText((result.data as { id?: unknown }).id);
  }

  if (paymentIntentId) {
    const result = await adminClient
      .from("merch_orders")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (result.error) throw new Error(`Merch order payment intent lookup failed: ${result.error.message}`);
    if (result.data) return toText((result.data as { id?: unknown }).id);
  }

  return null;
};

const updateOrderForEvent = async (
  adminClient: SupabaseClientLike,
  event: StripeMerchEvent,
  object: StripeObject | null,
) => {
  const eventType = toText(event.type);
  const orderId = await readOrderByStripeObject(adminClient, object);
  if (!orderId) return { orderId: null, orderUpdated: false, reason: "order_not_found" };

  const baseUpdate: Record<string, unknown> = {
    metadata: sanitizedEventMetadata(event, object, {
      processed_by: FUNCTION_NAME,
      stripe_event_id: toText(event.id),
    }),
    stripe_payment_intent_id: paymentIntentFromObject(object),
    updated_at: new Date().toISOString(),
  };

  const update = (() => {
    switch (eventType) {
      case "checkout.session.completed":
      case "payment_intent.succeeded":
        return {
          ...baseUpdate,
          amount_subtotal_minor: typeof object?.amount_subtotal === "number" ? object.amount_subtotal : undefined,
          amount_total_minor: typeof object?.amount_total === "number" ? object.amount_total : typeof object?.amount === "number" ? object.amount : undefined,
          currency: toText(object?.currency).toLowerCase() || undefined,
          fulfillment_status: "processing",
          order_status: "paid",
          paid_at: new Date().toISOString(),
          payment_status: "paid",
          provider_order_id: toText(object?.id) || undefined,
          stripe_checkout_session_id: eventType === "checkout.session.completed" ? toText(object?.id) || undefined : undefined,
        };
      case "payment_intent.payment_failed":
        return {
          ...baseUpdate,
          order_status: "failed",
          payment_status: "failed",
        };
      case "checkout.session.expired":
        return {
          ...baseUpdate,
          canceled_at: new Date().toISOString(),
          order_status: "canceled",
          payment_status: "failed",
        };
      case "charge.refunded":
        return {
          ...baseUpdate,
          fulfillment_status: "canceled",
          order_status: "refunded",
          payment_status: "refunded",
          refunded_at: new Date().toISOString(),
        };
      case "charge.dispute.created":
        return {
          ...baseUpdate,
          fulfillment_status: "blocked",
          order_status: "chargeback",
          payment_status: "disputed",
        };
      default:
        return baseUpdate;
    }
  })();

  const cleanedUpdate = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
  const { error } = await adminClient
    .from("merch_orders")
    .update(cleanedUpdate)
    .eq("id", orderId);

  if (error) throw new Error(`Merch order webhook update failed: ${error.message}`);
  return { orderId, orderUpdated: true, reason: "order_updated" };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe merch webhook requests." });
  }

  let adminClient: SupabaseClientLike | null = null;

  try {
    const webhookSecret = readStripeWebhookSecret();
    if (!webhookSecret.configured) {
      return jsonResponse(200, notConfiguredPayload(webhookSecret.reason, webhookSecret.message, {
        eventStored: false,
        signatureVerified: false,
        webhookProcessed: false,
        physicalMerchOnly: true,
      }));
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, {
        eventStored: false,
        signatureVerified: false,
        webhookProcessed: false,
        physicalMerchOnly: true,
      }));
    }
    adminClient = adminConfig.client;

    const rawBody = await req.text();
    const signatureVerified = await verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"), webhookSecret.secret);
    if (!signatureVerified) {
      await safeWriteAuditLog(adminClient, {
        action: "stripe_merch_webhook_failed",
        metadata: {
          failure_reason: "signature_verification_failed",
          function_name: FUNCTION_NAME,
        },
        reason: "Stripe merch webhook signature verification failed.",
        severity: "warning",
        targetType: "stripe_merch_webhook",
      });

      return jsonResponse(400, {
        error: "invalid_signature",
        liveMoneyAction: false,
        message: "Stripe merch webhook signature verification failed.",
        mode: "sandbox",
        provider: "stripe",
        providerKey: "stripe_physical_goods",
        signatureVerified: false,
      });
    }

    const event = parseStripeEvent(rawBody);
    const object = eventObject(event);
    if (event.livemode === true) {
      await safeWriteAuditLog(adminClient, {
        action: "stripe_merch_webhook_failed",
        metadata: {
          event_id: toText(event.id),
          event_type: toText(event.type),
          failure_reason: "live_mode_event_rejected",
          function_name: FUNCTION_NAME,
        },
        reason: "Live-mode Stripe merch webhook event was rejected by the sandbox function.",
        severity: "warning",
        targetType: "stripe_merch_webhook",
      });

      return jsonResponse(200, {
        status: "ignored",
        provider: "stripe",
        providerKey: "stripe_physical_goods",
        mode: "sandbox",
        liveMoneyAction: false,
        eventStored: false,
        signatureVerified: true,
        webhookProcessed: false,
        message: "Live-mode Stripe merch events are not processed by this sandbox function.",
      });
    }

    const eventType = toText(event.type);
    const eventRecord = await insertStripeMerchEvent(adminClient, event, object);
    const eventRowId = toText(eventRecord.row?.id) || null;

    if (eventRecord.duplicate) {
      return jsonResponse(200, {
        status: "duplicate",
        provider: "stripe",
        providerKey: "stripe_physical_goods",
        mode: "sandbox",
        liveMoneyAction: false,
        eventStored: false,
        signatureVerified: true,
        webhookProcessed: false,
        checkoutCreated: false,
        digitalAccessGrantCreated: false,
        revenueCatEntitlementCreated: false,
        premiumEntitlementCreated: false,
        payoutCreated: false,
        cashOutEnabled: false,
        message: "Stripe merch webhook event was already recorded and was not processed again.",
      });
    }

    if (!merchEventTypes.has(eventType)) {
      await updateStripeMerchEvent(adminClient, eventRowId, "ignored", sanitizedEventMetadata(event, object, {
        ignored_reason: "unsupported_merch_event_type",
      }));
      return jsonResponse(200, {
        status: "ignored",
        provider: "stripe",
        providerKey: "stripe_physical_goods",
        mode: "sandbox",
        liveMoneyAction: false,
        eventStored: true,
        signatureVerified: true,
        webhookProcessed: true,
        checkoutCreated: false,
        digitalAccessGrantCreated: false,
        revenueCatEntitlementCreated: false,
        premiumEntitlementCreated: false,
        payoutCreated: false,
        cashOutEnabled: false,
        message: "Stripe event was recorded but ignored because it is not a physical-merch event.",
      });
    }

    const orderResult = await updateOrderForEvent(adminClient, event, object);
    await updateStripeMerchEvent(adminClient, eventRowId, orderResult.orderUpdated ? "processed" : "ignored", sanitizedEventMetadata(event, object, {
      linked_order_id: orderResult.orderId,
      processing_reason: orderResult.reason,
    }));

    await safeWriteAuditLog(adminClient, {
      action: "stripe_merch_webhook_processed",
      metadata: {
        creates_digital_access: false,
        event_id: toText(event.id),
        event_type: eventType,
        function_name: FUNCTION_NAME,
        linked_order_id: orderResult.orderId,
        physical_merch_only: true,
        processing_reason: orderResult.reason,
      },
      reason: "Stripe sandbox physical merch webhook processed without digital access, payout, or live-money action.",
      targetId: orderResult.orderId,
      targetType: "merch_order",
    });

    return jsonResponse(200, {
      status: orderResult.orderUpdated ? "processed" : "ignored",
      provider: "stripe",
      providerKey: "stripe_physical_goods",
      mode: "sandbox",
      liveMoneyAction: false,
      eventStored: true,
      signatureVerified: true,
      webhookProcessed: true,
      orderUpdated: orderResult.orderUpdated,
      linkedOrderId: orderResult.orderId,
      checkoutCreated: false,
      digitalAccessGrantCreated: false,
      revenueCatEntitlementCreated: false,
      premiumEntitlementCreated: false,
      payoutCreated: false,
      cashOutEnabled: false,
      message: orderResult.orderUpdated
        ? "Stripe sandbox physical merch event updated the merch order only."
        : "Stripe sandbox physical merch event was stored but no matching order was found.",
    });
  } catch (error) {
    await safeWriteAuditLog(adminClient, {
      action: "stripe_merch_webhook_failed",
      metadata: {
        error: sanitizeErrorMessage(error),
        function_name: FUNCTION_NAME,
      },
      reason: "Stripe sandbox physical merch webhook failed.",
      severity: "warning",
      targetType: "stripe_merch_webhook",
    });

    return jsonResponse(500, {
      error: "stripe_merch_webhook_failed",
      liveMoneyAction: false,
      eventStored: false,
      webhookProcessed: false,
      checkoutCreated: false,
      digitalAccessGrantCreated: false,
      revenueCatEntitlementCreated: false,
      premiumEntitlementCreated: false,
      payoutCreated: false,
      cashOutEnabled: false,
      message: sanitizeErrorMessage(error),
      provider: "stripe",
      providerKey: "stripe_physical_goods",
      mode: "sandbox",
    });
  }
});
