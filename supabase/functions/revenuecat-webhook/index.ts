import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  RevenueCatAdapter,
  type SupabaseClientLike,
  createAdminClient,
  hashText,
  jsonResponse,
  optionsResponse,
  readOptionalEnv,
  sanitizeErrorMessage,
  toText,
  verifySharedWebhookSecret,
  writeProviderReadinessAudit,
} from "../_shared/provider-readiness.ts";

const FUNCTION_NAME = "revenuecat-webhook";
const PREMIUM_ENTITLEMENT_KEY = "premium";
const PREMIUM_PRODUCT_ID = "premium_subscription";

type RevenueCatEvent = Record<string, unknown>;
type EntitlementWriteResult = {
  entitlementActive: boolean;
  status: "active" | "trialing" | "grace_period" | "pending" | "expired" | "canceled" | "revoked";
  eventType: string;
  eventId: string;
  userId: string;
  productId: string | null;
  environment: string | null;
  expiresAt: string | null;
  duplicateEvent: boolean;
};

const ACTIVE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "RENEWAL",
  "UNCANCELLATION",
]);
const CANCELED_EVENT_TYPES = new Set(["CANCELLATION"]);
const EXPIRED_EVENT_TYPES = new Set(["EXPIRATION"]);
const REVOKED_EVENT_TYPES = new Set(["REFUND", "SUBSCRIPTION_PAUSED"]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const normalizeEventType = (value: unknown) => toText(value).toUpperCase();

const toStringArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean);
  const normalized = toText(value);
  return normalized ? [normalized] : [];
};

const toIsoFromMs = (value: unknown) => {
  const millis = Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return null;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const extractRevenueCatEvent = (rawBody: string): RevenueCatEvent => {
  const parsed = JSON.parse(rawBody) as unknown;
  if (isRecord(parsed) && isRecord(parsed.event)) return parsed.event;
  if (isRecord(parsed)) return parsed;
  throw new Error("Invalid RevenueCat webhook payload.");
};

const resolveEntitlementIds = (event: RevenueCatEvent) => [
  ...toStringArray(event.entitlement_ids),
  ...toStringArray(event.entitlement_id),
  ...toStringArray(event.entitlements),
].map((entry) => entry.toLowerCase());

const hasPremiumSignal = (event: RevenueCatEvent) => {
  const entitlementIds = resolveEntitlementIds(event);
  const productId = toText(event.product_id || event.product_identifier);
  return entitlementIds.includes(PREMIUM_ENTITLEMENT_KEY) || productId === PREMIUM_PRODUCT_ID;
};

const resolveUserId = (event: RevenueCatEvent) => {
  const appUserId = toText(event.app_user_id || event.appUserId);
  if (!appUserId || appUserId.startsWith("$RCAnonymousID:")) return "";
  return appUserId;
};

const resolveEventId = async (event: RevenueCatEvent, rawBody: string) => (
  toText(event.id || event.event_id || event.transaction_id || event.original_transaction_id)
  || await hashText(rawBody)
);

const resolveEntitlementStatus = (event: RevenueCatEvent): EntitlementWriteResult["status"] => {
  const eventType = normalizeEventType(event.type);
  const expiresAt = toIsoFromMs(event.expiration_at_ms);
  const notExpired = !expiresAt || Date.parse(expiresAt) > Date.now();
  const periodType = toText(event.period_type).toUpperCase();

  if (REVOKED_EVENT_TYPES.has(eventType)) return "revoked";
  if (EXPIRED_EVENT_TYPES.has(eventType)) return "expired";
  if (CANCELED_EVENT_TYPES.has(eventType)) return "canceled";
  if (eventType === "BILLING_ISSUE") return notExpired ? "grace_period" : "pending";
  if (ACTIVE_EVENT_TYPES.has(eventType)) return periodType === "TRIAL" ? "trialing" : "active";
  return "pending";
};

const isActiveEntitlementStatus = (status: EntitlementWriteResult["status"]) => (
  status === "active" || status === "trialing" || status === "grace_period"
);

const writePremiumEntitlementFromRevenueCatEvent = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
): Promise<EntitlementWriteResult> => {
  const eventType = normalizeEventType(event.type);
  const eventId = await resolveEventId(event, rawBody);
  const userId = resolveUserId(event);
  const productId = toText(event.product_id || event.product_identifier) || null;
  const environment = toText(event.environment) || null;
  const expiresAt = toIsoFromMs(event.expiration_at_ms);
  const startsAt = toIsoFromMs(event.purchased_at_ms || event.event_timestamp_ms);
  const status = resolveEntitlementStatus(event);
  const entitlementActive = isActiveEntitlementStatus(status);
  const rawEventHash = await hashText(rawBody);

  if (!eventType) throw new Error("RevenueCat webhook event type is missing.");
  if (!userId) throw new Error("RevenueCat webhook app user id is missing or anonymous.");
  if (!hasPremiumSignal(event)) throw new Error("RevenueCat webhook event is not mapped to Premium.");

  const { data: existingBillingEvent, error: duplicateCheckError } = await adminClient
    .from("billing_events")
    .select("id")
    .eq("provider", "revenuecat")
    .eq("event_type", eventType)
    .eq("metadata->>revenuecat_event_id", eventId)
    .maybeSingle();
  if (duplicateCheckError) {
    throw new Error(`RevenueCat duplicate check failed: ${duplicateCheckError.message}`);
  }

  const duplicateEvent = !!existingBillingEvent;

  const { error: entitlementError } = await adminClient
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      entitlement_key: PREMIUM_ENTITLEMENT_KEY,
      status,
      source: "revenuecat",
      starts_at: startsAt,
      expires_at: expiresAt,
      revoked_at: status === "revoked" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      metadata: {
        revenuecat_event_id: eventId,
        revenuecat_event_hash: rawEventHash,
        revenuecat_event_type: eventType,
        product_id: productId,
        environment,
        period_type: toText(event.period_type) || null,
        store: toText(event.store) || null,
        entitlement_ids: resolveEntitlementIds(event),
        sandbox: environment?.toLowerCase() === "sandbox",
        raw_provider_payload_stored: false,
      },
    }, { onConflict: "user_id,entitlement_key" });
  if (entitlementError) {
    throw new Error(`RevenueCat entitlement sync failed: ${entitlementError.message}`);
  }

  if (!duplicateEvent) {
    const { error: billingEventError } = await adminClient.from("billing_events").insert({
      user_id: userId,
      event_type: eventType,
      provider: "revenuecat",
      entitlement_key: PREMIUM_ENTITLEMENT_KEY,
      status,
      metadata: {
        revenuecat_event_id: eventId,
        revenuecat_event_hash: rawEventHash,
        product_id: productId,
        environment,
        duplicate_safe: true,
        raw_provider_payload_stored: false,
        premium_granted: entitlementActive,
        live_money_action: false,
      },
    });
    if (billingEventError) {
      throw new Error(`RevenueCat billing event sync failed: ${billingEventError.message}`);
    }
  }

  return {
    entitlementActive,
    status,
    eventType,
    eventId,
    userId,
    productId,
    environment,
    expiresAt,
    duplicateEvent,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for RevenueCat webhook requests." });
  }

  const webhookSecret = readOptionalEnv("REVENUECAT_WEBHOOK_SECRET");
  const adapter = new RevenueCatAdapter({
    configured: !!webhookSecret,
    configuredSummary: "RevenueCat webhook secret is configured server-side.",
    missingSummary: "RevenueCat webhook secret is not configured server-side.",
  });
  const safeStatus = adapter.getSafeStatus();

  if (!webhookSecret) {
    const adminConfig = createAdminClient();
    if (adminConfig.configured) {
      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "revenuecat",
        capability: "premium_entitlement",
        action: "revenuecat_webhook_setup_required",
        statusAfter: "setup_needed",
        reason: "RevenueCat webhook setup proof reached the fail-closed missing-secret path.",
        proofSource: FUNCTION_NAME,
        metadata: {
          signature_verified: false,
          webhook_processed: false,
          premium_granted: false,
          setup_required: true,
        },
      });
    }

    return jsonResponse(200, {
      status: "setup_required",
      provider: "revenuecat",
      capability: "premium_entitlement",
      signatureVerified: false,
      webhookProcessed: false,
      premiumGranted: false,
      liveMoneyAction: false,
      message: safeStatus.safeSummary,
    });
  }

  try {
    const rawBody = await req.text();
    const signatureVerified = verifySharedWebhookSecret(req, webhookSecret);
    const adminConfig = createAdminClient();

    if (!signatureVerified) {
      if (adminConfig.configured) {
        await writeProviderReadinessAudit(adminConfig.client, {
          provider: "revenuecat",
          capability: "premium_entitlement",
          action: "revenuecat_webhook_rejected",
          statusAfter: "blocked",
          reason: "RevenueCat webhook rejected because the shared webhook secret did not match.",
          proofSource: FUNCTION_NAME,
          metadata: {
            signature_verified: false,
          },
        });
      }

      return jsonResponse(401, {
        error: "invalid_signature",
        provider: "revenuecat",
        capability: "premium_entitlement",
        signatureVerified: false,
        webhookProcessed: false,
        premiumGranted: false,
        liveMoneyAction: false,
        message: "RevenueCat webhook verification failed.",
      });
    }

    if (!adminConfig.configured) {
      return jsonResponse(200, {
        status: "setup_required",
        provider: "revenuecat",
        capability: "premium_entitlement",
        signatureVerified: true,
        webhookProcessed: false,
        premiumGranted: false,
        liveMoneyAction: false,
        message: "RevenueCat webhook was verified but backend entitlement sync is not configured.",
      });
    }

    const event = extractRevenueCatEvent(rawBody);
    const entitlementWrite = await writePremiumEntitlementFromRevenueCatEvent(adminConfig.client, event, rawBody);

    if (adminConfig.configured) {
      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "revenuecat",
        capability: "premium_entitlement",
        action: entitlementWrite.duplicateEvent
          ? "revenuecat_webhook_duplicate_ignored"
          : "revenuecat_webhook_entitlement_synced",
        statusAfter: entitlementWrite.entitlementActive ? "sandbox_ready" : "configured",
        reason: "RevenueCat webhook verified a provider event and reconciled the backend Premium entitlement row.",
        proofSource: FUNCTION_NAME,
        metadata: {
          revenuecat_event_hash: await hashText(rawBody),
          revenuecat_event_type: entitlementWrite.eventType,
          revenuecat_event_id_hash: await hashText(entitlementWrite.eventId),
          user_id_hash: await hashText(entitlementWrite.userId),
          product_id: entitlementWrite.productId,
          environment: entitlementWrite.environment,
          entitlement_status: entitlementWrite.status,
          entitlement_active: entitlementWrite.entitlementActive,
          duplicate_event: entitlementWrite.duplicateEvent,
          raw_provider_payload_stored: false,
          premium_granted: entitlementWrite.entitlementActive,
        },
      });
    }

    return jsonResponse(200, {
      status: entitlementWrite.duplicateEvent ? "duplicate_ignored" : "processed",
      provider: "revenuecat",
      capability: "premium_entitlement",
      signatureVerified: true,
      webhookProcessed: true,
      premiumGranted: entitlementWrite.entitlementActive,
      entitlementStatus: entitlementWrite.status,
      entitlementKey: PREMIUM_ENTITLEMENT_KEY,
      duplicateEvent: entitlementWrite.duplicateEvent,
      liveMoneyAction: false,
      message: entitlementWrite.entitlementActive
        ? "RevenueCat webhook synced an active Premium entitlement."
        : "RevenueCat webhook synced a non-active Premium entitlement status.",
    });
  } catch (error) {
    return jsonResponse(200, {
      status: "error",
      provider: "revenuecat",
      capability: "premium_entitlement",
      signatureVerified: false,
      webhookProcessed: false,
      premiumGranted: false,
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
    });
  }
});
