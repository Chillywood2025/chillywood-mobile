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
  moneyAccess: MoneyAccessMirrorResult;
};

type MoneyAccessMirrorResult = {
  productKey: string | null;
  providerEventId: string | null;
  accessGrantId: string | null;
  ledgerEventId: string | null;
  environment: "setup" | "sandbox" | "production";
  payableState: "not_payable" | "refunded" | "reversed" | "chargeback";
  grantStatus: "setup_only" | "sandbox_only" | "active" | "pending" | "expired" | "revoked" | "blocked";
  duplicateAccessGrant: boolean;
  duplicateLedgerEvent: boolean;
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

const normalizeMoneyAccessEnvironment = (value: unknown): MoneyAccessMirrorResult["environment"] => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "sandbox") return "sandbox";
  if (normalized === "production") return "production";
  return "setup";
};

const resolveAmountMinor = (event: RevenueCatEvent) => {
  const amount = Number(event.price_in_purchased_currency);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
};

const resolveCurrency = (event: RevenueCatEvent) => {
  const currency = toText(event.currency).toLowerCase();
  return /^[a-z]{3}$/.test(currency) ? currency : "usd";
};

const resolveGrantStatus = (
  status: EntitlementWriteResult["status"],
  environment: MoneyAccessMirrorResult["environment"],
): MoneyAccessMirrorResult["grantStatus"] => {
  if (status === "revoked") return "revoked";
  if (status === "expired" || status === "canceled") return "expired";
  if (environment === "setup") return "setup_only";
  if (isActiveEntitlementStatus(status)) return environment === "production" ? "active" : "sandbox_only";
  return environment === "production" ? "pending" : "blocked";
};

const resolveLedgerState = (eventType: string) => {
  if (REVOKED_EVENT_TYPES.has(eventType)) return { payableState: "refunded" as const, ledgerStatus: "refunded" as const };
  if (EXPIRED_EVENT_TYPES.has(eventType) || CANCELED_EVENT_TYPES.has(eventType)) {
    return { payableState: "reversed" as const, ledgerStatus: "reversed" as const };
  }
  return { payableState: "not_payable" as const, ledgerStatus: "sandbox_only" as const };
};

const mirrorRevenueCatPremiumMoneyAccess = async (
  adminClient: SupabaseClientLike,
  input: {
    event: RevenueCatEvent;
    eventType: string;
    eventId: string;
    userId: string;
    productId: string | null;
    environment: string | null;
    status: EntitlementWriteResult["status"];
    expiresAt: string | null;
    startsAt: string | null;
    rawEventHash: string;
  },
): Promise<MoneyAccessMirrorResult> => {
  const environment = normalizeMoneyAccessEnvironment(input.environment);
  const idempotencyKey = `${input.eventType}:${input.eventId}`;
  const occurredAt = toIsoFromMs(input.event.event_timestamp_ms || input.event.purchased_at_ms) || new Date().toISOString();
  const grantStatus = resolveGrantStatus(input.status, environment);
  const { payableState, ledgerStatus } = resolveLedgerState(input.eventType);

  const { data: product, error: productError } = await adminClient
    .from("monetization_products")
    .select("id, product_key")
    .eq("product_type", "premium_subscription")
    .eq("provider_product_id", input.productId ?? PREMIUM_PRODUCT_ID)
    .maybeSingle();
  if (productError) throw new Error(`Money access product lookup failed: ${productError.message}`);
  if (!product?.id) throw new Error("Money access Premium product mapping is missing.");

  const { data: providerEvent, error: providerError } = await adminClient
    .from("provider_events")
    .upsert({
      provider_event_id: input.eventId,
      provider: "revenuecat",
      product_id: product.id,
      product_key: product.product_key,
      user_id: input.userId,
      app_user_id: input.userId,
      environment,
      event_type: input.eventType,
      status: ledgerStatus === "refunded" ? "refunded" : ledgerStatus === "reversed" ? "reversed" : "processed",
      occurred_at: occurredAt,
      idempotency_key: idempotencyKey,
      raw_payload_hash: input.rawEventHash,
      metadata: {
        provider_payload_stored: false,
        product_id: input.productId,
        entitlement_key: PREMIUM_ENTITLEMENT_KEY,
        store: toText(input.event.store) || null,
        period_type: toText(input.event.period_type) || null,
        sandbox_only: environment === "sandbox",
        live_money_action: false,
        payout_ready: false,
      },
    }, { onConflict: "provider,idempotency_key" })
    .select("id")
    .single();
  if (providerError) throw new Error(`Money access provider event sync failed: ${providerError.message}`);

  const { data: existingGrant, error: existingGrantError } = await adminClient
    .from("access_grants")
    .select("id")
    .eq("provider_event_id", providerEvent.id)
    .eq("user_id", input.userId)
    .eq("grant_type", "premium")
    .maybeSingle();
  if (existingGrantError) throw new Error(`Money access grant duplicate check failed: ${existingGrantError.message}`);

  let accessGrantId = existingGrant?.id ?? null;
  if (!accessGrantId) {
    const { data: grant, error: grantError } = await adminClient
      .from("access_grants")
      .insert({
        user_id: input.userId,
        grant_type: "premium",
        source_type: "provider_event",
        source_id: providerEvent.id,
        product_id: product.id,
        provider: "revenuecat",
        provider_event_id: providerEvent.id,
        environment,
        status: grantStatus,
        starts_at: input.startsAt ?? occurredAt,
        expires_at: input.expiresAt,
        revoked_at: grantStatus === "revoked" ? new Date().toISOString() : null,
        revoke_reason: grantStatus === "revoked" ? "RevenueCat provider revoke event." : null,
        metadata: {
          entitlement_key: PREMIUM_ENTITLEMENT_KEY,
          user_entitlements_remain_source_of_truth: true,
          viewer_access_only: true,
          authority_granted: false,
          payout_access: false,
        },
      })
      .select("id")
      .single();
    if (grantError) throw new Error(`Money access grant sync failed: ${grantError.message}`);
    accessGrantId = grant.id;
  }

  const { data: existingLedger, error: existingLedgerError } = await adminClient
    .from("money_access_ledger_events")
    .select("id")
    .eq("provider_event_id", providerEvent.id)
    .eq("event_type", input.eventType)
    .maybeSingle();
  if (existingLedgerError) throw new Error(`Money access ledger duplicate check failed: ${existingLedgerError.message}`);

  let ledgerEventId = existingLedger?.id ?? null;
  if (!ledgerEventId) {
    const { data: ledger, error: ledgerError } = await adminClient
      .from("money_access_ledger_events")
      .insert({
        user_id: input.userId,
        product_id: product.id,
        provider_event_id: providerEvent.id,
        event_type: input.eventType,
        amount_minor: resolveAmountMinor(input.event),
        currency: resolveCurrency(input.event),
        environment,
        payable_state: payableState,
        status: ledgerStatus,
        source_type: "provider_event",
        source_id: providerEvent.id,
        metadata: {
          product_key: product.product_key,
          entitlement_key: PREMIUM_ENTITLEMENT_KEY,
          sandbox_only: environment === "sandbox",
          not_payable: payableState === "not_payable",
          production_money: false,
          payout_readiness_proved: false,
          live_money_enabled_at_verification: false,
        },
      })
      .select("id")
      .single();
    if (ledgerError) throw new Error(`Money access ledger sync failed: ${ledgerError.message}`);
    ledgerEventId = ledger.id;
  }

  return {
    productKey: product.product_key,
    providerEventId: providerEvent.id,
    accessGrantId,
    ledgerEventId,
    environment,
    payableState,
    grantStatus,
    duplicateAccessGrant: !!existingGrant?.id,
    duplicateLedgerEvent: !!existingLedger?.id,
  };
};

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

  const moneyAccess = await mirrorRevenueCatPremiumMoneyAccess(adminClient, {
    event,
    eventType,
    eventId,
    userId,
    productId,
    environment,
    status,
    expiresAt,
    startsAt,
    rawEventHash,
  });

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
    moneyAccess,
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
    if (normalizeEventType(event.type) === "TEST") {
      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "revenuecat",
        capability: "premium_entitlement",
        action: "revenuecat_webhook_test_received",
        statusAfter: "configured",
        reason: "RevenueCat dashboard test webhook reached the verified endpoint. Test events do not grant Premium.",
        proofSource: FUNCTION_NAME,
        metadata: {
          revenuecat_event_hash: await hashText(rawBody),
          revenuecat_event_id_hash: await hashText(await resolveEventId(event, rawBody)),
          revenuecat_event_type: "TEST",
          environment: toText(event.environment) || null,
          raw_provider_payload_stored: false,
          premium_granted: false,
          live_money_action: false,
        },
      });

      return jsonResponse(200, {
        status: "test_received",
        provider: "revenuecat",
        capability: "premium_entitlement",
        signatureVerified: true,
        webhookProcessed: true,
        premiumGranted: false,
        liveMoneyAction: false,
        message: "RevenueCat dashboard test webhook received. No Premium entitlement was granted.",
      });
    }

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
          money_access_mirror: {
            product_key: entitlementWrite.moneyAccess.productKey,
            environment: entitlementWrite.moneyAccess.environment,
            grant_status: entitlementWrite.moneyAccess.grantStatus,
            payable_state: entitlementWrite.moneyAccess.payableState,
            duplicate_access_grant: entitlementWrite.moneyAccess.duplicateAccessGrant,
            duplicate_ledger_event: entitlementWrite.moneyAccess.duplicateLedgerEvent,
          },
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
      moneyAccessMirrored: true,
      moneyAccessEnvironment: entitlementWrite.moneyAccess.environment,
      moneyAccessPayableState: entitlementWrite.moneyAccess.payableState,
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
