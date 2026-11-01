import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkoutSettlementOutcome, paymentIntentSettlementOutcome } from "../_shared/stripe-payment-settlement.ts";
import {
  createAdminClient, jsonResponse, notConfiguredPayload, optionsResponse,
  parseStripeEvent, readOptionalEnv, readStripeWebhookSecret, safeWriteAuditLog,
  toText, verifyStripeWebhookSignature, type SupabaseClientLike,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-merch-webhook";
const readStripeMerchWebhookSecret = () => {
  const secret = readOptionalEnv("STRIPE_MERCH_WEBHOOK_SECRET");
  if (!secret) return readStripeWebhookSecret();
  if (!secret.startsWith("whsec_")) return { configured: false as const,
    message: "Stripe merch webhook signing secret is not a valid test webhook secret.",
    reason: "stripe_merch_webhook_secret_invalid" };
  return { configured: true as const, secret };
};
type StripeMerchEvent = ReturnType<typeof parseStripeEvent>;
type StripeObject = Record<string, unknown>;
const merchEventTypes = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
  "payment_intent.succeeded", "payment_intent.payment_failed",
  "charge.refunded", "charge.dispute.created",
]);
const eventObject = (event: StripeMerchEvent): StripeObject | null => {
  const object = event.data?.object;
  return object && typeof object === "object" && !Array.isArray(object) ? object as StripeObject : null;
};
const minorAmount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const providerEventStateSupported = (type: string, object: StripeObject | null) => {
  if (!object) return false;
  if (type.startsWith("checkout.session.") && type !== "checkout.session.expired") {
    const outcome = checkoutSettlementOutcome(type, object);
    return type === "checkout.session.async_payment_succeeded"
      ? outcome === "succeeded" : outcome !== "unsupported";
  }
  if (type.startsWith("payment_intent.")) return paymentIntentSettlementOutcome(type, object) !== "unsupported";
  if (type === "checkout.session.expired") return object.object === "checkout.session"
    && object.mode === "payment" && object.status === "expired" && object.payment_status === "unpaid"
    && (minorAmount(object.amount_total) ?? 0) > 0;
  if (type === "charge.refunded") {
    const amount = minorAmount(object.amount), refunded = minorAmount(object.amount_refunded);
    return object.object === "charge" && amount !== null && amount > 0 && refunded !== null
      && refunded > 0 && refunded <= amount && object.refunded === (refunded === amount);
  }
  return type === "charge.dispute.created" && object.object === "dispute"
    && (minorAmount(object.amount) ?? 0) > 0 && /^ch_[A-Za-z0-9_]+$/.test(toText(object.charge));
};
const providerFacts = (event: StripeMerchEvent, object: StripeObject) => {
  const type = toText(event.type);
  // Pinned Clover Checkout shape. Never substitute billing details or metadata.
  const collected = object.collected_information as Record<string, unknown> | undefined;
  const shipping = collected?.shipping_details as Record<string, unknown> | undefined;
  const destination = shipping?.address as Record<string, unknown> | undefined;
  const metadata = object.metadata && typeof object.metadata === "object" && !Array.isArray(object.metadata)
    ? object.metadata as Record<string, unknown> : {};
  return {
    // Only the canonical pinned Checkout shipping fields, never billing/metadata.
    // The private SQL wrapper consumes these before invoking payment reconciliation.
    shipping_fulfillment: type.startsWith("checkout.session.") ? {
      name: shipping?.name, line1: destination?.line1, line2: destination?.line2,
      city: destination?.city, state: destination?.state,
      country: destination?.country, postal_code: destination?.postal_code,
    } : null,
    shipping_country: type.startsWith("checkout.session.") ? toText(destination?.country) || null : null,
    shipping_postal_code: type.startsWith("checkout.session.") ? toText(destination?.postal_code) || null : null,
    event_livemode: event.livemode,
    // Event creation on the canonical succeeded event is the provider-confirmed
    // purchase boundary, not the PaymentIntent's creation or webhook arrival.
    event_created_seconds: minorAmount((event as unknown as Record<string, unknown>).created),
    object_livemode: object.livemode,
    event_account_id: toText((event as unknown as Record<string, unknown>).account) || null,
    object_id: toText(object.id) || null,
    object_type: toText(object.object) || null,
    payment_intent_id: toText(type.startsWith("payment_intent.") ? object.id : object.payment_intent) || null,
    charge_id: toText(object.charge) || null,
    client_reference_id: toText(object.client_reference_id) || null,
    metadata_order_id: toText(metadata.chillywood_order_id) || null,
    metadata_buyer_id: toText(metadata.buyer_user_id) || null,
    metadata_environment: toText(metadata.environment) || null,
    metadata_tax_policy_id: toText(metadata.commerce_tax_policy_id) || null,
    metadata_rail: toText(metadata.rail) || null,
    amount_minor: minorAmount(type.startsWith("checkout.session.") ? object.amount_total : object.amount),
    amount_received_minor: minorAmount(object.amount_received),
    refunded_amount_minor: minorAmount(object.amount_refunded),
    refunded: typeof object.refunded === "boolean" ? object.refunded : null,
    currency: toText(object.currency).toLowerCase() || null,
    mode: toText(object.mode) || null,
    status: toText(object.status) || null,
    payment_status: toText(object.payment_status) || null,
  };
};
const hashText = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
)).map(byte => byte.toString(16).padStart(2, "0")).join("");
const responseFacts = {
  provider: "stripe", providerKey: "stripe_physical_goods", mode: "sandbox",
  liveMoneyAction: false, physicalMerchOnly: true, checkoutCreated: false,
  digitalAccessGrantCreated: false, revenueCatEntitlementCreated: false,
  premiumEntitlementCreated: false, payoutCreated: false, cashOutEnabled: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe merch webhook requests." });
  let adminClient: SupabaseClientLike | null = null;
  try {
    const secret = readStripeMerchWebhookSecret();
    const liveSecret = readOptionalEnv("STRIPE_MERCH_LIVE_WEBHOOK_SECRET");
    const liveAccount = readOptionalEnv("STRIPE_MERCH_LIVE_ACCOUNT_ID");
    const liveConfigured = !!liveSecret?.startsWith("whsec_") && /^acct_[A-Za-z0-9]+$/.test(liveAccount ?? "")
      && (!secret.configured || liveSecret !== secret.secret);
    if (!secret.configured && !liveConfigured) return jsonResponse(200, notConfiguredPayload(secret.reason, secret.message, {
      ...responseFacts, eventStored: false, signatureVerified: false, webhookProcessed: false,
    }));
    const admin = createAdminClient();
    if (!admin.configured) return jsonResponse(200, notConfiguredPayload(admin.reason, admin.message, {
      ...responseFacts, eventStored: false, signatureVerified: false, webhookProcessed: false,
    }));
    adminClient = admin.client;
    const rawBody = await req.text();
    // Mode comes from the matching endpoint secret, never unsigned JSON.
    const testVerified = secret.configured && await verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"), secret.secret);
    const liveVerified = liveConfigured && await verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"), liveSecret!);
    if (Number(testVerified) + Number(liveVerified) !== 1) {
      await safeWriteAuditLog(adminClient, {
        action: "stripe_merch_webhook_failed", targetType: "stripe_merch_webhook", severity: "warning",
        reason: "Stripe merch webhook signature verification failed.",
        metadata: { failure_reason: "signature_verification_failed", function_name: FUNCTION_NAME },
      });
      return jsonResponse(400, { ...responseFacts, error: "invalid_signature", signatureVerified: false,
        eventStored: false, webhookProcessed: false, message: "Stripe merch webhook signature verification failed." });
    }
    const environment = liveVerified ? "production" : "sandbox";
    const event = parseStripeEvent(rawBody), object = eventObject(event), type = toText(event.type);
    // Missing environment is not evidence of a test event; connected-account
    // events are not this platform's physical-merch Checkout authority.
    if (event.livemode !== liveVerified || object?.livemode !== liveVerified
      || toText((event as unknown as Record<string, unknown>).account)) {
      await safeWriteAuditLog(adminClient, {
        action: "stripe_merch_webhook_failed", targetType: "stripe_merch_webhook", severity: "warning",
        reason: "Stripe merch webhook did not match the authenticated environment or platform account.",
        metadata: { event_id: toText(event.id), event_type: type,
          failure_reason: "test_environment_required", function_name: FUNCTION_NAME },
      });
      return jsonResponse(200, { ...responseFacts, status: "ignored", reason: "test_environment_required",
        eventStored: false, signatureVerified: true, webhookProcessed: false,
        message: "The event environment and account must match the authenticated platform webhook lane." });
    }
    if (!merchEventTypes.has(type) || !providerEventStateSupported(type, object)) {
      return jsonResponse(200, { ...responseFacts, status: "ignored", reason: "payment_state_not_confirmed",
        eventStored: false, signatureVerified: true, webhookProcessed: false,
        message: "This event does not confirm a supported physical-merch payment state." });
    }
    // Sale eligibility belongs to initiation. Verified callbacks for an existing
    // order still settle after sales are disabled, through the same test guards.
    const { data, error } = await adminClient.rpc("process_stripe_merch_webhook_lifecycle", {
      p_event_id: toText(event.id), p_event_type: type,
      p_raw_event_hash: await hashText(rawBody), p_facts: { ...providerFacts(event, object!), verified_environment: environment,
        provider_account_id: liveVerified ? liveAccount : null },
    });
    if (error) throw new Error(`Merch reconciliation failed: ${error.message}`);
    const result = data as Record<string, unknown> | null;
    if (!result || !["processed", "ignored", "duplicate", "pending"].includes(toText(result.status))
      || typeof result.retryable !== "boolean" || typeof result.orderUpdated !== "boolean"
      || typeof result.eventStored !== "boolean") throw new Error("Merch reconciliation returned no confirmed outcome.");
    await safeWriteAuditLog(adminClient, {
      action: "stripe_merch_webhook_processed", targetType: "merch_order",
      targetId: toText(result.orderId) || null,
      reason: "Verified account-bound merch payment state reconciled without payout or digital access.",
      metadata: { event_id: toText(event.id), event_type: type, function_name: FUNCTION_NAME,
        processing_reason: toText(result.reason), physical_merch_only: true, creates_digital_access: false },
    });
    return jsonResponse(result.retryable ? 409 : 200, {
      ...responseFacts, mode: environment, status: result.status, reason: result.reason, signatureVerified: true,
      eventStored: result.eventStored, webhookProcessed: !result.retryable && result.status !== "duplicate",
      orderUpdated: result.orderUpdated, linkedOrderId: result.orderId ?? null, retryable: result.retryable,
      message: result.retryable
        ? "The exact stored payment identity is not available yet. Retry this same delivery."
        : "The verified physical-merch payment state was reconciled.",
    });
  } catch {
    await safeWriteAuditLog(adminClient, { action: "stripe_merch_webhook_failed", targetType: "stripe_merch_webhook",
      severity: "warning", reason: "Stripe sandbox physical merch webhook failed.",
      metadata: { error: "merch_reconciliation_failed", function_name: FUNCTION_NAME } });
    return jsonResponse(500, { ...responseFacts, error: "stripe_merch_webhook_failed",
      eventStored: false, webhookProcessed: false, message: "The merch payment update could not be reconciled. Retry this delivery." });
  }
});
