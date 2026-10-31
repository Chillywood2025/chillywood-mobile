import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkoutSettlementOutcome, paymentIntentSettlementOutcome } from "../_shared/stripe-payment-settlement.ts";
import { googlePlayStripeTaxEvidence } from "../_shared/google-play-stripe-tax-evidence.ts";

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
  amount_received?: number;
  amount_refunded?: number;
  amount_total?: number;
  client_reference_id?: string;
  currency?: string;
  id?: string;
  metadata?: Record<string, unknown>;
  livemode?: boolean;
  mode?: string;
  object?: string;
  payment_status?: string;
  payment_intent?: string | null;
  refunded?: boolean;
  status?: string;
};

type TipTransactionRow = {
  creator_id?: string | null;
  currency?: string | null;
  id?: string | null;
  provider_checkout_session_id?: string | null;
  provider_payment_intent_id?: string | null;
  sender_id?: string | null;
  tip_amount_cents?: number | null;
  total_paid_cents?: number | null;
};

type WebhookClaim = {
  disposition: "claimed" | "duplicate" | "in_progress";
  processingAttemptId: string | null;
  retry: boolean;
  rowId: string;
};

type TipProjectionResult = {
  buyerAuthorityValid: boolean | null;
  compensationRequired: boolean;
  reason: string;
  tipId: string | null;
  updated: boolean;
  webhookFinalized: boolean;
};

const tipEventTypes = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
]);

const encoder = new TextEncoder();

const normalizeUuid = (value: unknown) => {
  const text = toText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

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

const reserveWebhookEvent = async (
  adminClient: SupabaseClientLike,
  event: StripeTipEvent,
  rawBody: string,
): Promise<WebhookClaim> => {
  const eventId = toText(event.id);
  const eventType = toText(event.type);
  const processingAttemptId = crypto.randomUUID();
  const { data, error } = await adminClient.rpc("reserve_stripe_tip_webhook_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_processing_attempt_id: processingAttemptId,
    p_raw_event_hash: await hashText(rawBody),
  });
  if (error) throw new Error(`Tip webhook event claim failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Tip webhook event claim returned malformed authority.");
  }

  const claim = data as Record<string, unknown>;
  const disposition = toText(claim.disposition);
  const rowId = normalizeUuid(claim.rowId);
  const claimAcquired = claim.claimAcquired;
  const returnedAttemptId = normalizeUuid(claim.processingAttemptId);
  const expectedClaimAcquired = disposition === "claimed";
  if (
    !rowId
    || !["claimed", "duplicate", "in_progress"].includes(disposition)
    || typeof claimAcquired !== "boolean"
    || claimAcquired !== expectedClaimAcquired
    || (expectedClaimAcquired && returnedAttemptId !== processingAttemptId)
    || (!expectedClaimAcquired && returnedAttemptId !== null)
  ) {
    throw new Error("Tip webhook event claim returned malformed authority.");
  }

  return {
    disposition: disposition as WebhookClaim["disposition"],
    processingAttemptId: expectedClaimAcquired ? processingAttemptId : null,
    retry: claim.retry === true,
    rowId,
  };
};

const finalizeWebhookEvent = async (
  adminClient: SupabaseClientLike,
  eventId: string,
  processingAttemptId: string,
  status: "processed" | "ignored" | "failed",
) => {
  const { data, error } = await adminClient.rpc("finalize_stripe_tip_webhook_event", {
    p_event_id: eventId,
    p_processing_attempt_id: processingAttemptId,
    p_status: status,
  });
  if (error) throw new Error(`Tip webhook event finalization failed: ${error.message}`);
  if (
    !data
    || typeof data !== "object"
    || Array.isArray(data)
    || normalizeUuid((data as Record<string, unknown>).rowId) === null
    || toText((data as Record<string, unknown>).status) !== status
  ) {
    throw new Error("Tip webhook event finalization returned malformed authority.");
  }
};

const insertIdempotentTipAuditEvent = async (
  adminClient: SupabaseClientLike,
  eventType: "webhook_duplicate" | "webhook_ignored",
  providerEventId: string,
  metadata: Record<string, unknown>,
) => {
  const { error } = await adminClient.from("creator_tip_events").insert({
    actor_id: null,
    event_type: eventType,
    provider: "stripe_connect",
    provider_environment: "test",
    provider_event_id: providerEventId,
    metadata,
  });
  if (error && toText(error.code) !== "23505") {
    throw new Error("Tip webhook audit event insert failed.");
  }
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
      .eq("provider", "stripe_connect")
      .eq("provider_environment", "test")
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
      .eq("provider", "stripe_connect")
      .eq("provider_environment", "test")
      .maybeSingle();
    if (error) throw new Error(`Tip payment intent lookup failed: ${error.message}`);
    const found = toText((data as { id?: unknown } | null)?.id);
    if (found) return found;
  }

  return null;
};

const readTipTransaction = async (
  adminClient: SupabaseClientLike,
  tipId: string,
): Promise<TipTransactionRow | null> => {
  const { data, error } = await adminClient
    .from("creator_tip_transactions")
    .select("id,creator_id,sender_id,tip_amount_cents,total_paid_cents,currency,provider_checkout_session_id,provider_payment_intent_id")
    .eq("id", tipId)
    .eq("provider", "stripe_connect")
    .eq("provider_environment", "test")
    .maybeSingle();
  if (error) throw new Error(`Tip transaction authority lookup failed: ${error.message}`);
  return data as TipTransactionRow | null;
};

const providerPaymentFactsMatchTip = (
  eventType: string,
  object: StripeObject | null,
  tip: TipTransactionRow,
  requirePaymentIntent = true,
) => {
  if (!object) return false;
  const checkoutEvent = eventType.startsWith("checkout.session.");
  const amount = checkoutEvent ? object.amount_total : object.amount;
  const currency = toText(object.currency).toLowerCase();
  const senderId = normalizeUuid(tip.sender_id);
  const creatorId = normalizeUuid(tip.creator_id);
  const metadataSenderId = normalizeUuid(object.metadata?.fan_user_id);
  const metadataCreatorId = normalizeUuid(object.metadata?.creator_user_id);
  const metadataTipId = normalizeUuid(object.metadata?.chillywood_tip_id);
  const tipId = normalizeUuid(tip.id);
  const providerObjectId = toText(object.id);
  const paymentIntentId = paymentIntentFromObject(object);
  const providerIdentityExact = checkoutEvent
    ? providerObjectId.startsWith("cs_test_")
      && providerObjectId === toText(tip.provider_checkout_session_id)
      && toText(object.client_reference_id) === tipId
      && (!requirePaymentIntent || (!!paymentIntentId && /^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)))
      && (!paymentIntentId || !toText(tip.provider_payment_intent_id) || paymentIntentId === toText(tip.provider_payment_intent_id))
    : eventType.startsWith("payment_intent.")
      ? /^pi_[A-Za-z0-9_]+$/.test(providerObjectId)
        && providerObjectId === toText(tip.provider_payment_intent_id)
      : false;
  return providerIdentityExact
    && object.livemode === false
    && Number.isSafeInteger(amount)
    && typeof amount === "number" && amount > 0
    && amount === tip.tip_amount_cents
    && currency !== ""
    && currency === toText(tip.currency).toLowerCase()
    && !!senderId
    && metadataSenderId === senderId
    && !!creatorId
    && metadataCreatorId === creatorId
    && !!tipId
    && metadataTipId === tipId;
};

const providerCompletionMatchesTip = (
  eventType: string,
  object: StripeObject | null,
  tip: TipTransactionRow,
) => (checkoutSettlementOutcome(eventType, object) === "succeeded"
  || paymentIntentSettlementOutcome(eventType, object) === "succeeded")
  && providerPaymentFactsMatchTip(eventType, object, tip);

const providerRemovalOrFailureMatchesTip = (
  eventType: string,
  object: StripeObject | null,
  tip: TipTransactionRow,
) => {
  if (!object || object.livemode !== false) return false;
  if (eventType === "checkout.session.async_payment_failed") {
    return checkoutSettlementOutcome(eventType, object) === "failed"
      && providerPaymentFactsMatchTip(eventType, object, tip);
  }
  if (eventType === "checkout.session.expired") {
    return object.object === "checkout.session" && object.mode === "payment" && object.status === "expired" && object.payment_status === "unpaid"
      && providerPaymentFactsMatchTip(eventType, object, tip, false);
  }
  if (eventType === "payment_intent.payment_failed") {
    return paymentIntentSettlementOutcome(eventType, object) === "failed"
      && providerPaymentFactsMatchTip(eventType, object, tip);
  }
  if (eventType === "charge.refunded" || eventType === "charge.dispute.created") {
    const paymentIntentId = paymentIntentFromObject(object);
    if (eventType === "charge.dispute.created") {
      return object.object === "dispute" && toText(object.id).startsWith("dp_")
        && paymentIntentId !== null && paymentIntentId === toText(tip.provider_payment_intent_id)
        && Number.isSafeInteger(object.amount) && (object.amount ?? 0) > 0
        && (object.amount ?? 0) <= (tip.total_paid_cents ?? 0)
        && toText(object.currency).toLowerCase() === toText(tip.currency).toLowerCase();
    }

    const chargeAmount = object.amount;
    const amountRefunded = object.amount_refunded;
    const currency = toText(object.currency).toLowerCase();
    return object.object === "charge" && toText(object.id).startsWith("ch_")
      && paymentIntentId !== null
      && paymentIntentId === toText(tip.provider_payment_intent_id)
      && typeof chargeAmount === "number"
      && Number.isSafeInteger(chargeAmount)
      && chargeAmount === tip.total_paid_cents
      && currency !== ""
      && currency === toText(tip.currency).toLowerCase()
      && typeof amountRefunded === "number"
      && Number.isSafeInteger(amountRefunded)
      && amountRefunded > 0
      && amountRefunded <= chargeAmount
      && typeof object.refunded === "boolean"
      && object.refunded === (amountRefunded === chargeAmount);
  }
  return false;
};

const tipEventTypeForStripeEvent = (eventType: string) => {
  switch (eventType) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return "checkout_completed";
    case "checkout.session.expired":
      return "checkout_canceled";
    case "payment_intent.succeeded":
      return "payment_succeeded";
    case "payment_intent.payment_failed":
    case "checkout.session.async_payment_failed":
      return "payment_failed";
    case "charge.refunded":
      return "refunded";
    case "charge.dispute.created":
      return "disputed";
    default:
      return "webhook_ignored";
  }
};

// A signed removal can arrive before the Checkout response has persisted its
// PaymentIntent. Keep that delivery retryable without trusting metadata or
// inventing a local payment association. Exact economics are checked by SQL
// after a stored receipt makes the tip discoverable.
const removalCanAwaitTipReceipt = (eventType: string, object: StripeObject | null) => {
  if (!object || object.livemode !== false || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentFromObject(object) ?? "")
    || !Number.isSafeInteger(object.amount) || typeof object.amount !== "number" || object.amount <= 0
    || toText(object.currency).toLowerCase() !== "usd") return false;
  if (eventType === "charge.refunded") {
    return object.object === "charge" && /^ch_[A-Za-z0-9_]+$/.test(toText(object.id))
      && Number.isSafeInteger(object.amount_refunded) && typeof object.amount_refunded === "number"
      && object.amount_refunded > 0 && object.amount_refunded <= object.amount
      && typeof object.refunded === "boolean" && object.refunded === (object.amount_refunded === object.amount);
  }
  return eventType === "charge.dispute.created" && object.object === "dispute"
    && /^dp_[A-Za-z0-9_]+$/.test(toText(object.id));
};

const updateTipForEvent = async (
  adminClient: SupabaseClientLike,
  event: StripeTipEvent,
  object: StripeObject | null,
  processingAttemptId: string,
): Promise<TipProjectionResult> => {
  const eventType = toText(event.type);
  const tipId = await readTipIdByObject(adminClient, object, eventType);
  if (!tipId) return {
    tipId: null,
    updated: false,
    reason: removalCanAwaitTipReceipt(eventType, object) ? "tip_provider_identity_pending" : "tip_not_found",
    buyerAuthorityValid: null,
    compensationRequired: false,
    webhookFinalized: false,
  };

  const tip = await readTipTransaction(adminClient, tipId);
  if (!tip || normalizeUuid(tip.id) !== normalizeUuid(tipId)) {
    return {
      tipId: null,
      updated: false,
      reason: removalCanAwaitTipReceipt(eventType, object) ? "tip_provider_identity_pending" : "tip_not_found",
      buyerAuthorityValid: null,
      compensationRequired: false,
      webhookFinalized: false,
    };
  }

  const paymentIntentId = paymentIntentFromObject(object);
  const amount = eventType.startsWith("checkout.session.")
    ? object?.amount_total
    : object?.amount;
  const amountRefunded = eventType === "charge.refunded"
    ? object?.amount_refunded
    : undefined;
  const refunded = eventType === "charge.refunded"
    ? object?.refunded
    : undefined;

  const completionEvent = eventType === "checkout.session.completed"
    || eventType === "checkout.session.async_payment_succeeded"
    || eventType === "payment_intent.succeeded";
  const providerCompletionExact = completionEvent
    ? providerCompletionMatchesTip(eventType, object, tip)
    : false;
  const providerLifecycleExact = completionEvent
    ? providerCompletionExact
    : providerRemovalOrFailureMatchesTip(eventType, object, tip);

  const transition = {
    metadata: {
      access_granted: false,
      authority_granted: false,
      provider_completion_exact: completionEvent ? providerCompletionExact : undefined,
      live_money_action: false,
      no_badge: true,
      no_digital_content: true,
      no_perk: true,
      no_room_access: true,
      no_vip: true,
      provider_payload_stored: false,
      payout_eligible: false,
      pure_contribution_only: true,
      test_mode: true,
    },
  };
  const { data, error } = await adminClient.rpc("process_stripe_tip_webhook_lifecycle", {
    p_processing_attempt_id: processingAttemptId,
    p_provider_facts: {
      google_play_tax: googlePlayStripeTaxEvidence(object),
      provider_occurred_at: typeof event.created === "number" && Number.isSafeInteger(event.created)
        && event.created > 0 && event.created <= 253402300799 ? new Date(event.created * 1000).toISOString() : null,
      amount_cents: amount,
      amount_received_cents: object?.amount_received,
      amount_refunded_cents: amountRefunded,
      event_livemode: event.livemode,
      event_account: event.account ?? null,
      client_reference_id: object?.client_reference_id,
      object_livemode: object?.livemode,
      object_type: object?.object,
      object_status: object?.status,
      checkout_mode: object?.mode,
      payment_status: object?.payment_status,
      currency: toText(object?.currency).toLowerCase() || null,
      metadata_creator_id: normalizeUuid(object?.metadata?.creator_user_id),
      metadata_sender_id: normalizeUuid(object?.metadata?.fan_user_id),
      metadata_tip_id: normalizeUuid(object?.metadata?.chillywood_tip_id),
      object_id: toText(object?.id) || null,
      payment_intent_id: paymentIntentId,
      refunded,
    },
    p_tip_event_metadata: {
      amount_cents: amount ?? tip.tip_amount_cents ?? null,
      amount_refunded_cents: amountRefunded ?? null,
      event_type: eventType,
      normalized_tip_event_type: tipEventTypeForStripeEvent(eventType),
      provider_completion_exact: completionEvent ? providerCompletionExact : null,
      provider_lifecycle_exact_at_edge: providerLifecycleExact,
      refunded: refunded ?? null,
    },
    p_tip_id: tipId,
    p_transition: transition,
    p_webhook_event_id: toText(event.id),
  });
  if (error) throw new Error(`Tip transaction webhook projection failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Tip transaction webhook projection returned malformed authority.");
  }

  const projection = data as Record<string, unknown>;
  const projectedTipId = normalizeUuid(projection.tipId);
  const projectedBuyerAuthority = projection.buyerAuthorityValid;
  const projectedReason = toText(projection.reason);
  if (
    projectedTipId !== normalizeUuid(tipId)
    || typeof projection.updated !== "boolean"
    || projection.webhookFinalized !== true
    || typeof projection.compensationRequired !== "boolean"
    || (projectedBuyerAuthority !== null && typeof projectedBuyerAuthority !== "boolean")
    || !projectedReason
  ) {
    throw new Error("Tip transaction webhook projection returned malformed authority.");
  }

  return {
    tipId: projectedTipId,
    updated: projection.updated,
    reason: projectedReason,
    buyerAuthorityValid: projectedBuyerAuthority as boolean | null,
    compensationRequired: projection.compensationRequired,
    webhookFinalized: true,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe tip webhook requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let webhookProcessingAttemptId: string | null = null;
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
    if (event.livemode !== false || event.account != null) {
      await safeWriteAuditLog(adminClient, {
        action: "creator_tip_webhook_failed",
        metadata: {
          event_id: toText(event.id),
          event_type: toText(event.type),
          failure_reason: "platform_test_mode_event_required",
          function_name: FUNCTION_NAME,
        },
        reason: "Stripe tip webhook event without explicit platform test-mode authority was rejected.",
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
        message: "Only explicit platform test-mode Stripe tip events are processed by Tips V1.",
      });
    }

    const eventType = toText(event.type);
    const object = eventObject(event);
    const webhookClaim = await reserveWebhookEvent(adminClient, event, rawBody);
    webhookProcessingAttemptId = webhookClaim.processingAttemptId;

    if (webhookClaim.disposition === "duplicate") {
      await insertIdempotentTipAuditEvent(
        adminClient,
        "webhook_duplicate",
        toText(event.id),
        {
          event_type: eventType,
          no_access_granted: true,
          pure_contribution_only: true,
        },
      );

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

    if (webhookClaim.disposition === "in_progress") {
      return jsonResponse(409, {
        status: "in_progress",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        eventStored: true,
        signatureVerified: true,
        webhookProcessed: false,
        message: "Stripe tip webhook event is already being processed; retry this delivery.",
      });
    }

    if (!webhookProcessingAttemptId) {
      throw new Error("Tip webhook claim did not return a processing attempt.");
    }

    if (!tipEventTypes.has(eventType)) {
      await insertIdempotentTipAuditEvent(
        adminClient,
        "webhook_ignored",
        toText(event.id),
        {
          event_type: eventType,
          ignored_reason: "unsupported_tip_event_type",
          no_access_granted: true,
          pure_contribution_only: true,
        },
      );
      await finalizeWebhookEvent(adminClient, toText(event.id), webhookProcessingAttemptId, "ignored");
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

    const result = await updateTipForEvent(adminClient, event, object, webhookProcessingAttemptId);
    if (result.reason === "tip_provider_identity_pending") {
      if (!result.webhookFinalized) {
        await finalizeWebhookEvent(adminClient, toText(event.id), webhookProcessingAttemptId, "failed");
      }
      return jsonResponse(409, {
        status: "pending", provider: "stripe", providerKey: "stripe_connect", mode: "test",
        liveMoneyAction: false, eventStored: true, signatureVerified: true,
        webhookProcessed: false, message: "The exact checkout receipt is not bound yet; retry this delivery.",
      });
    }
    if (!result.webhookFinalized) {
      await finalizeWebhookEvent(
        adminClient,
        toText(event.id),
        webhookProcessingAttemptId,
        result.updated ? "processed" : "ignored",
      );
    }

    await safeWriteAuditLog(adminClient, {
      action: "creator_tip_webhook_processed",
      metadata: {
        event_id: toText(event.id),
        event_type: eventType,
        function_name: FUNCTION_NAME,
        buyer_authority_valid_at_completion: result.buyerAuthorityValid ?? null,
        compensation_required: result.compensationRequired ?? false,
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
      eventRetried: webhookClaim.retry,
      signatureVerified: true,
      webhookProcessed: true,
      linkedTipId: result.tipId,
      buyerAuthorityValidAtCompletion: result.buyerAuthorityValid ?? null,
      compensationRequired: result.compensationRequired ?? false,
      noAccessGranted: true,
      pureContributionOnly: true,
      message: result.updated
        ? "Stripe test-mode tip event updated the tip transaction only."
        : result.tipId
        ? "Stripe test-mode tip event was stored but its transaction authority identity did not match."
        : "Stripe test-mode tip event was stored but no matching tip was found.",
    });
  } catch (error) {
    if (adminClient && webhookProcessingAttemptId && toText(event?.id)) {
      await finalizeWebhookEvent(
        adminClient,
        toText(event?.id),
        webhookProcessingAttemptId,
        "failed",
      ).catch(() => undefined);
    }
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
