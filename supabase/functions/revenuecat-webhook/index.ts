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
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ANDROID_NOTIFICATION_CHANNEL_ID = "default";

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
type DynamicMoneyAccessResult = {
  status: "processed" | "ignored" | "duplicate_ignored";
  productKey: string | null;
  providerEventId: string | null;
  accessGrantId: string | null;
  ledgerEventId: string | null;
  subscriptionId?: string | null;
  purchaseIntentId: string | null;
  environment: "setup" | "sandbox" | "production";
  payableState: "not_payable" | "refunded" | "reversed" | "chargeback";
  grantStatus: "setup_only" | "sandbox_only" | "active" | "pending" | "expired" | "revoked" | "blocked";
  reason: string;
  duplicateProviderEvent: boolean;
  duplicateAccessGrant: boolean;
  duplicateLedgerEvent: boolean;
};
type MoneyNotificationType =
  | "paid_video_unlocked"
  | "watch_party_ticket_ready"
  | "channel_subscription_active"
  | "vip_access_active"
  | "event_pass_active"
  | "tip_sent_receipt"
  | "paid_video_sold"
  | "watch_party_ticket_sold"
  | "channel_subscription_started"
  | "vip_pass_sold"
  | "event_pass_sold"
  | "tip_received";
type CreatorMoneyNotificationPlan = {
  body: string;
  category: "creator_money_purchase" | "creator_money_sale";
  notificationType: MoneyNotificationType;
  priority: number;
  recipientUserId: string;
  title: string;
};
type CreatorMoneyNotificationTarget = {
  deepLink: string;
  entityId: string;
  route: string;
};
type NotificationPreference = {
  creator_money_purchases_enabled?: boolean;
  creator_money_sales_enabled?: boolean;
  in_app_enabled?: boolean;
  push_enabled?: boolean;
  user_id?: string;
};
type PushToken = {
  id: string;
  provider: string;
  token: string;
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
const BILLING_ISSUE_EVENT_TYPES = new Set(["BILLING_ISSUE"]);
const REVOKED_EVENT_TYPES = new Set(["REFUND", "REVOCATION", "SUBSCRIPTION_PAUSED"]);
const CHANNEL_SUBSCRIPTION_PRODUCT_TYPE = "channel_subscription";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const normalizeEventType = (value: unknown) => toText(value).toUpperCase();

const providerProductIdCandidates = (productId: string) => {
  const normalized = toText(productId);
  const withoutBasePlan = normalized.includes(":") ? normalized.split(":")[0] : normalized;
  return Array.from(new Set([
    normalized,
    withoutBasePlan,
    `${withoutBasePlan}:monthly`,
  ].map(toText).filter(Boolean)));
};

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

const resolveProductId = (event: RevenueCatEvent) => toText(event.product_id || event.product_identifier) || null;

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

const resolveChannelSubscriptionLifecycleState = (
  eventType: string,
  expiresAt: string | null,
  status: EntitlementWriteResult["status"],
) => {
  const expiresInFuture = !!expiresAt && Date.parse(expiresAt) > Date.now();
  if (REVOKED_EVENT_TYPES.has(eventType)) {
    return {
      subscriptionStatus: "revoked" as const,
      grantStatus: "revoked" as const,
      transactionStatus: eventType === "REFUND" ? "refunded" as const : "revoked" as const,
      payableState: "refunded" as const,
      ledgerStatus: "refunded" as const,
      channelSubscriberStatus: "revoked" as const,
      retainAccess: false,
    };
  }
  if (EXPIRED_EVENT_TYPES.has(eventType)) {
    return {
      subscriptionStatus: "expired" as const,
      grantStatus: "expired" as const,
      transactionStatus: "expired" as const,
      payableState: "reversed" as const,
      ledgerStatus: "reversed" as const,
      channelSubscriberStatus: "expired" as const,
      retainAccess: false,
    };
  }
  if (CANCELED_EVENT_TYPES.has(eventType)) {
    return {
      subscriptionStatus: expiresInFuture ? "cancel_pending" as const : "canceled" as const,
      grantStatus: expiresInFuture ? "sandbox_only" as const : "expired" as const,
      transactionStatus: "canceled" as const,
      payableState: "not_payable" as const,
      ledgerStatus: "sandbox_only" as const,
      channelSubscriberStatus: expiresInFuture ? "active" as const : "canceled" as const,
      retainAccess: expiresInFuture,
    };
  }
  if (BILLING_ISSUE_EVENT_TYPES.has(eventType)) {
    const retainAccess = status === "grace_period" && expiresInFuture;
    return {
      subscriptionStatus: retainAccess ? "grace_period" as const : "paused" as const,
      grantStatus: retainAccess ? "sandbox_only" as const : "blocked" as const,
      transactionStatus: "failed" as const,
      payableState: "not_payable" as const,
      ledgerStatus: "pending" as const,
      channelSubscriberStatus: retainAccess ? "grace_period" as const : "expired" as const,
      retainAccess,
    };
  }
  return {
    subscriptionStatus: status === "trialing" ? "trialing" as const : "active" as const,
    grantStatus: "sandbox_only" as const,
    transactionStatus: eventType === "RENEWAL" ? "renewal_paid" as const : "paid" as const,
    payableState: "not_payable" as const,
    ledgerStatus: "sandbox_only" as const,
    channelSubscriberStatus: "active" as const,
    retainAccess: true,
  };
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

const accessGrantTypeForProductType = (productType: string) => {
  if (productType === "paid_content_access") return "paid_content_access";
  if (productType === "watch_party_live_ticket") return "watch_party_live_ticket";
  if (productType === "live_watch_party_access_pass") return "live_watch_party_access_pass";
  if (productType === "live_watch_party_seat_pass") return "live_watch_party_seat_pass";
  if (productType === "event_pass") return "event_pass";
  if (productType === "channel_subscription") return "channel_subscription";
  if (productType === "vip_pass") return "vip_pass";
  return null;
};

const isCreatorMoneyNotificationProduct = (productType: string) => (
  productType === "paid_content_access"
  || productType === "watch_party_live_ticket"
  || productType === "event_pass"
  || productType === "channel_subscription"
  || productType === "vip_pass"
  || productType === "creator_tip"
);

const safeObject = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? value : {}
);

const readMoneyNotificationPreference = async (
  adminClient: SupabaseClientLike,
  userId: string,
): Promise<NotificationPreference | null> => {
  if (!userId) return null;
  const { data } = await adminClient
    .from("notification_preferences")
    .select("user_id,in_app_enabled,push_enabled,creator_money_purchases_enabled,creator_money_sales_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as NotificationPreference | null;
};

const readAndroidPushTokens = async (adminClient: SupabaseClientLike, userId: string): Promise<PushToken[]> => {
  const { data } = await adminClient
    .from("user_push_tokens")
    .select("id,provider,token")
    .eq("user_id", userId)
    .eq("platform", "android")
    .eq("enabled", true)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(5);
  return (data ?? []) as PushToken[];
};

const insertMoneyNotificationDeliveryAttempt = async (
  adminClient: SupabaseClientLike,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    notificationId: string | null;
    provider: string;
    providerMessageId?: string | null;
    pushTokenId?: string | null;
    recipientUserId: string;
    status: "attempted" | "sent" | "failed" | "skipped";
  },
) => {
  await adminClient.from("notification_delivery_attempts").insert({
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : null,
    notification_id: input.notificationId,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? null,
    push_token_id: input.pushTokenId ?? null,
    recipient_user_id: input.recipientUserId,
    status: input.status,
  });
};

const sendCreatorMoneyExpoPush = async (message: Record<string, unknown>) => {
  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(message),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  return { body, ok: response.ok, status: response.status };
};

const notificationRoutePath = (deepLink: string) => deepLink.replace(/^chillywoodmobile:\/\//u, "/");

const isAudienceBlocked = async (
  adminClient: SupabaseClientLike,
  creatorId: string | null,
  buyerId: string,
) => {
  if (!creatorId || !buyerId) return false;
  const { data } = await adminClient
    .from("channel_audience_blocks")
    .select("blocked_user_id")
    .eq("channel_user_id", creatorId)
    .eq("blocked_user_id", buyerId)
    .limit(1)
    .maybeSingle();
  return !!data;
};

const resolveWatchPartyNotificationTarget = async (
  adminClient: SupabaseClientLike,
  sourceId: string | null,
  metadata: Record<string, unknown>,
): Promise<CreatorMoneyNotificationTarget | null> => {
  const metadataPartyId = toText(metadata.party_id);
  if (metadataPartyId) {
    return {
      deepLink: `chillywoodmobile://watch-party/${metadataPartyId}`,
      entityId: metadataPartyId,
      route: "/watch-party/[partyId]",
    };
  }
  if (!sourceId) return null;
  const { data } = await adminClient
    .from("paid_watch_party_offers")
    .select("party_id")
    .eq("id", sourceId)
    .maybeSingle();
  const partyId = toText(data?.party_id) || sourceId;
  return {
    deepLink: `chillywoodmobile://watch-party/${partyId}`,
    entityId: partyId,
    route: "/watch-party/[partyId]",
  };
};

const resolveCreatorMoneyNotificationTarget = async (
  adminClient: SupabaseClientLike,
  input: {
    creatorId: string | null;
    metadata: Record<string, unknown>;
    productType: string;
    sourceId: string | null;
  },
): Promise<CreatorMoneyNotificationTarget | null> => {
  const sourceId = toText(input.sourceId) || null;
  if (input.productType === "paid_content_access" && sourceId) {
    return { deepLink: `chillywoodmobile://player/${sourceId}`, entityId: sourceId, route: "/player/[id]" };
  }
  if (input.productType === "watch_party_live_ticket") {
    return resolveWatchPartyNotificationTarget(adminClient, sourceId, input.metadata);
  }
  if (input.productType === "channel_subscription" && input.creatorId) {
    return {
      deepLink: `chillywoodmobile://channel-subscription/${input.creatorId}`,
      entityId: input.creatorId,
      route: "/channel-subscription/[creatorId]",
    };
  }
  if (input.productType === "vip_pass" && input.creatorId) {
    return {
      deepLink: `chillywoodmobile://vip-pass/${input.creatorId}`,
      entityId: input.creatorId,
      route: "/vip-pass/[creatorId]",
    };
  }
  if (input.productType === "event_pass" && sourceId) {
    return { deepLink: `chillywoodmobile://event/${sourceId}`, entityId: sourceId, route: "/event/[eventId]" };
  }
  if (input.productType === "creator_tip" && input.creatorId) {
    return { deepLink: `chillywoodmobile://channel/${input.creatorId}`, entityId: input.creatorId, route: "/channel/[userId]" };
  }
  return null;
};

const buyerNotificationPlanForProduct = (
  productType: string,
  buyerUserId: string,
): CreatorMoneyNotificationPlan | null => {
  if (productType === "paid_content_access") {
    return {
      body: "Paid Video unlocked.",
      category: "creator_money_purchase",
      notificationType: "paid_video_unlocked",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Paid Video unlocked",
    };
  }
  if (productType === "watch_party_live_ticket") {
    return {
      body: "Your Seat Pass is ready.",
      category: "creator_money_purchase",
      notificationType: "watch_party_ticket_ready",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Your Seat Pass is ready",
    };
  }
  if (productType === "channel_subscription") {
    return {
      body: "Channel Subscription active.",
      category: "creator_money_purchase",
      notificationType: "channel_subscription_active",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Channel Subscription active",
    };
  }
  if (productType === "vip_pass") {
    return {
      body: "VIP Pass active.",
      category: "creator_money_purchase",
      notificationType: "vip_access_active",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "VIP Pass active",
    };
  }
  if (productType === "event_pass") {
    return {
      body: "Event Pass confirmed.",
      category: "creator_money_purchase",
      notificationType: "event_pass_active",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Event Pass confirmed",
    };
  }
  if (productType === "creator_tip") {
    return {
      body: "Tip sent. Tips do not unlock anything.",
      category: "creator_money_purchase",
      notificationType: "tip_sent_receipt",
      priority: 5,
      recipientUserId: buyerUserId,
      title: "Tip sent",
    };
  }
  return null;
};

const creatorNotificationPlanForProduct = (
  productType: string,
  creatorUserId: string | null,
): CreatorMoneyNotificationPlan | null => {
  if (!creatorUserId) return null;
  const transactionBody = "Open Money Center Transactions for details.";
  if (productType === "paid_content_access") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "paid_video_sold",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Paid Video sold",
    };
  }
  if (productType === "watch_party_live_ticket") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "watch_party_ticket_sold",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Seat Pass sold",
    };
  }
  if (productType === "channel_subscription") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "channel_subscription_started",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Channel Subscription started",
    };
  }
  if (productType === "vip_pass") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "vip_pass_sold",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "VIP Pass sold",
    };
  }
  if (productType === "event_pass") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "event_pass_sold",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Event Pass sold",
    };
  }
  if (productType === "creator_tip") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "tip_received",
      priority: 5,
      recipientUserId: creatorUserId,
      title: "Tip received",
    };
  }
  return null;
};

const dispatchCreatorMoneyPushIfEligible = async (
  adminClient: SupabaseClientLike,
  input: {
    notificationId: string | null;
    plan: CreatorMoneyNotificationPlan;
    preference: NotificationPreference | null;
    target: CreatorMoneyNotificationTarget;
  },
) => {
  const prefEnabled = input.plan.category === "creator_money_sale"
    ? input.preference?.creator_money_sales_enabled !== false
    : input.preference?.creator_money_purchases_enabled !== false;
  const pushAllowed = input.preference?.push_enabled !== false && prefEnabled;
  if (!pushAllowed) {
    await insertMoneyNotificationDeliveryAttempt(adminClient, {
      errorCode: "preference_disabled",
      notificationId: input.notificationId,
      provider: "none",
      recipientUserId: input.plan.recipientUserId,
      status: "skipped",
    });
    return;
  }

  const tokens = await readAndroidPushTokens(adminClient, input.plan.recipientUserId);
  if (!tokens.length) {
    await insertMoneyNotificationDeliveryAttempt(adminClient, {
      errorCode: "no_enabled_android_token",
      notificationId: input.notificationId,
      provider: "expo",
      recipientUserId: input.plan.recipientUserId,
      status: "skipped",
    });
    return;
  }

  let sentCount = 0;
  for (const token of tokens) {
    const pushResult = await sendCreatorMoneyExpoPush({
      body: input.plan.body,
      channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
      data: {
        category: input.plan.category,
        deepLink: input.target.deepLink,
        notificationId: input.notificationId,
        notificationType: input.plan.notificationType,
        path: notificationRoutePath(input.target.deepLink),
        triggerType: input.plan.notificationType,
      },
      priority: "high",
      sound: "default",
      title: input.plan.title,
      to: token.token,
    });
    const body = safeObject(pushResult.body);
    const ticketRaw = Array.isArray(body.data) ? body.data[0] : body.data;
    const ticket = safeObject(ticketRaw);
    const status = toText(ticket.status || (pushResult.ok ? "sent" : "failed"));
    const sent = pushResult.ok && (status === "ok" || status === "sent");
    const details = safeObject(ticket.details);
    const errorCode = toText(details.error || ticket.message) || null;
    const providerMessageId = toText(ticket.id) || null;
    if (sent) sentCount += 1;
    await insertMoneyNotificationDeliveryAttempt(adminClient, {
      errorCode,
      errorMessage: sent ? null : toText(ticket.message) || `Expo push returned ${pushResult.status}`,
      notificationId: input.notificationId,
      provider: token.provider,
      providerMessageId,
      pushTokenId: token.id,
      recipientUserId: input.plan.recipientUserId,
      status: sent ? "sent" : "failed",
    });
    if (errorCode === "DeviceNotRegistered") {
      await adminClient
        .from("user_push_tokens")
        .update({
          enabled: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", token.id);
    }
  }

  if (input.notificationId) {
    await adminClient
      .from("notifications")
      .update({
        delivered_at: sentCount > 0 ? new Date().toISOString() : null,
        status: sentCount > 0 ? "sent" : "pending",
      })
      .eq("id", input.notificationId);
  }
};

const createCreatorMoneyNotification = async (
  adminClient: SupabaseClientLike,
  input: {
    actorUserId: string;
    dedupeEventId: string;
    ledgerEventId: string;
    plan: CreatorMoneyNotificationPlan;
    productKey: string;
    sourceId: string | null;
    sourceType: string | null;
    target: CreatorMoneyNotificationTarget;
  },
) => {
  const preference = await readMoneyNotificationPreference(adminClient, input.plan.recipientUserId);
  const prefEnabled = input.plan.category === "creator_money_sale"
    ? preference?.creator_money_sales_enabled !== false
    : preference?.creator_money_purchases_enabled !== false;
  const inAppAllowed = preference?.in_app_enabled !== false && prefEnabled;
  const timingKey = input.dedupeEventId || input.ledgerEventId;
  const dedupeKey = [
    "creator_money",
    input.plan.notificationType,
    input.plan.recipientUserId,
    input.sourceType || "unknown",
    input.sourceId || "unknown",
    timingKey,
  ].join(":");

  const { error: dedupeError } = await adminClient.from("notification_event_dedupes").insert({
    dedupe_key: dedupeKey,
    recipient_user_id: input.plan.recipientUserId,
    source_id: input.sourceId,
    source_type: input.sourceType || "creator_money",
    timing_key: timingKey,
    trigger_type: input.plan.notificationType,
  });
  if (dedupeError) return;

  let notificationId: string | null = null;
  if (inAppAllowed) {
    const { data, error } = await adminClient
      .from("notifications")
      .insert({
        actor_user_id: input.actorUserId || null,
        body: input.plan.body,
        category: input.plan.category,
        deep_link: input.target.deepLink,
        eligibility_reason: "verified_provider_ledger_event",
        notification_type: input.plan.notificationType,
        priority: input.plan.priority,
        source_id: input.sourceId,
        source_type: input.sourceType || "creator_money",
        status: "pending",
        target_context: {
          flow: input.plan.notificationType,
          product_key: input.productKey,
          ledger_event_id: input.ledgerEventId,
          provider_event_id: input.dedupeEventId,
          sandbox_only: true,
          not_payable: true,
          no_access_grant_from_notification: true,
          no_payout_from_notification: true,
          premium_unlock: false,
          livekit_authority: false,
        },
        target_entity_id: input.target.entityId,
        target_route: input.target.route,
        title: input.plan.title,
        user_id: input.plan.recipientUserId,
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      await adminClient.from("notification_event_dedupes").delete().eq("dedupe_key", dedupeKey);
      return;
    }
    notificationId = data.id;
    await adminClient.from("notification_event_dedupes").update({ notification_id: notificationId }).eq("dedupe_key", dedupeKey);
  }

  await dispatchCreatorMoneyPushIfEligible(adminClient, {
    notificationId,
    plan: input.plan,
    preference,
    target: input.target,
  });
};

const createCreatorMoneyNotifications = async (
  adminClient: SupabaseClientLike,
  input: {
    buyerUserId: string;
    creatorId: string | null;
    eventType: string;
    ledgerEventId: string | null;
    metadata: Record<string, unknown>;
    productKey: string;
    productType: string;
    providerEventId: string | null;
    sourceId: string | null;
    sourceType: string | null;
  },
) => {
  // Creator-money notifications guide buyers and creators to route destinations only.
  // They never grant access, create payable balances, or execute payouts.
  if (!ACTIVE_EVENT_TYPES.has(input.eventType)) return;
  if (!input.ledgerEventId || !input.providerEventId) return;
  if (!isCreatorMoneyNotificationProduct(input.productType)) return;
  if (await isAudienceBlocked(adminClient, input.creatorId, input.buyerUserId)) return;

  const buyerTarget = await resolveCreatorMoneyNotificationTarget(adminClient, {
    creatorId: input.creatorId,
    metadata: input.metadata,
    productType: input.productType,
    sourceId: input.sourceId,
  });
  if (!buyerTarget) return;

  const buyerPlan = buyerNotificationPlanForProduct(input.productType, input.buyerUserId);
  if (buyerPlan) {
    await createCreatorMoneyNotification(adminClient, {
      actorUserId: input.creatorId || input.buyerUserId,
      dedupeEventId: input.providerEventId,
      ledgerEventId: input.ledgerEventId,
      plan: buyerPlan,
      productKey: input.productKey,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      target: buyerTarget,
    });
  }

  const creatorPlan = input.creatorId === input.buyerUserId
    ? null
    : creatorNotificationPlanForProduct(input.productType, input.creatorId);
  if (creatorPlan) {
    await createCreatorMoneyNotification(adminClient, {
      actorUserId: input.buyerUserId,
      dedupeEventId: input.providerEventId,
      ledgerEventId: input.ledgerEventId,
      plan: creatorPlan,
      productKey: input.productKey,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      target: {
        deepLink: "chillywoodmobile://channel-studio?tab=monetization&focus=transactions",
        entityId: input.creatorId || input.buyerUserId,
        route: "/channel-studio",
      },
    });
  }
};

const syncChannelSubscriptionLifecycle = async (
  adminClient: SupabaseClientLike,
  input: {
    event: RevenueCatEvent;
    eventType: string;
    eventId: string;
    userId: string;
    productId: string;
    environment: "setup" | "sandbox" | "production";
    status: EntitlementWriteResult["status"];
    rawEventHash: string;
    product: Record<string, unknown>;
    providerEventId: string;
    occurredAt: string;
  },
): Promise<DynamicMoneyAccessResult> => {
  const productIdCandidates = providerProductIdCandidates(input.productId);
  const startsAt = toIsoFromMs(input.event.purchased_at_ms || input.event.event_timestamp_ms) || input.occurredAt;
  const expiresAt = toIsoFromMs(input.event.expiration_at_ms);
  const originalTransactionId = toText(input.event.original_transaction_id) || null;
  const providerProductId = toText(input.product.provider_product_id) || input.productId;
  const state = resolveChannelSubscriptionLifecycleState(input.eventType, expiresAt, input.status);

  const { data: offer, error: offerError } = await adminClient
    .from("creator_channel_subscription_offers")
    .select("id, creator_id, price_cents, currency, provider_product_id, provider_product_key")
    .eq("provider_product_key", toText(input.product.product_key))
    .in("provider_product_id", productIdCandidates)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (offerError) throw new Error(`Channel subscription offer lookup failed: ${offerError.message}`);

  const ignoreLifecycle = async (reason: string): Promise<DynamicMoneyAccessResult> => {
    await adminClient
      .from("provider_events")
      .update({
        status: "ignored",
        metadata: {
          provider_payload_stored: false,
          provider_product_id: input.productId,
          original_transaction_id: originalTransactionId,
          dynamic_product: true,
          channel_subscription_lifecycle: true,
          sandbox_only: input.environment === "sandbox",
          ignored_reason: reason,
          access_granted: false,
          ledger_created: false,
          live_money_action: false,
          payout_ready: false,
        },
      })
      .eq("id", input.providerEventId);

    return {
      status: "ignored",
      productKey: toText(input.product.product_key) || null,
      providerEventId: input.providerEventId,
      accessGrantId: null,
      ledgerEventId: null,
      subscriptionId: null,
      purchaseIntentId: null,
      environment: input.environment,
      payableState: state.payableState,
      grantStatus: state.grantStatus,
      reason,
      duplicateProviderEvent: false,
      duplicateAccessGrant: false,
      duplicateLedgerEvent: false,
    };
  };

  if (!offer?.id) return ignoreLifecycle("channel_subscription_offer_missing");

  let subscription: Record<string, unknown> | null = null;
  if (originalTransactionId) {
    const { data: subscriptionByOriginal, error: subscriptionByOriginalError } = await adminClient
      .from("creator_channel_subscriptions")
      .select("id, access_grant_id, provider_original_transaction_id")
      .eq("offer_id", offer.id)
      .eq("subscriber_id", input.userId)
      .eq("provider_original_transaction_id", originalTransactionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionByOriginalError) throw new Error(`Channel subscription original transaction lookup failed: ${subscriptionByOriginalError.message}`);
    subscription = subscriptionByOriginal ?? null;
  }

  if (!subscription?.id) {
    const { data: latestSubscription, error: latestSubscriptionError } = await adminClient
      .from("creator_channel_subscriptions")
      .select("id, access_grant_id, provider_original_transaction_id")
      .eq("offer_id", offer.id)
      .eq("subscriber_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestSubscriptionError) throw new Error(`Channel subscription row lookup failed: ${latestSubscriptionError.message}`);
    subscription = latestSubscription ?? null;
  }

  if (!subscription?.id) return ignoreLifecycle("channel_subscription_row_missing");

  let accessGrantId = toText(subscription.access_grant_id) || null;
  if (!accessGrantId) {
    const { data: latestGrant, error: latestGrantError } = await adminClient
      .from("access_grants")
      .select("id")
      .eq("user_id", input.userId)
      .eq("grant_type", "channel_subscription")
      .eq("source_id", offer.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestGrantError) throw new Error(`Channel subscription access grant lookup failed: ${latestGrantError.message}`);
    accessGrantId = latestGrant?.id ?? null;
  }

  if (!accessGrantId) return ignoreLifecycle("channel_subscription_access_grant_missing");

  const originalTransactionForWrite = originalTransactionId ?? (toText(subscription.provider_original_transaction_id) || null);

  /*
   * From this point on the event is tied to a real provider-delivered
   * subscription row. No client or manual DB path can create the paid state.
   */
  const { data: existingLedger, error: existingLedgerError } = await adminClient
    .from("money_access_ledger_events")
    .select("id")
    .eq("provider_event_id", input.providerEventId)
    .maybeSingle();
  if (existingLedgerError) throw new Error(`Channel subscription lifecycle ledger lookup failed: ${existingLedgerError.message}`);

  let ledgerEventId = existingLedger?.id ?? null;
  if (!ledgerEventId) {
    const { data: ledger, error: ledgerError } = await adminClient
      .from("money_access_ledger_events")
      .insert({
        user_id: input.userId,
        creator_id: offer.creator_id,
        product_id: input.product.id,
        provider_event_id: input.providerEventId,
        event_type: input.eventType,
        amount_minor: resolveAmountMinor(input.event) || offer.price_cents || 0,
        currency: resolveCurrency(input.event) || offer.currency || "usd",
        environment: input.environment,
        payable_state: state.payableState,
        status: state.ledgerStatus,
        source_type: "channel_subscription",
        source_id: offer.id,
        metadata: {
          product_key: toText(input.product.product_key),
          channel_subscription_lifecycle: true,
          original_transaction_id: originalTransactionForWrite,
          sandbox_only: input.environment === "sandbox",
          not_payable: state.payableState === "not_payable",
          production_money: false,
          payout_readiness_proved: false,
          live_money_enabled_at_verification: false,
        },
      })
      .select("id")
      .single();
    if (ledgerError) throw new Error(`Channel subscription lifecycle ledger sync failed: ${ledgerError.message}`);
    ledgerEventId = ledger.id;
  }

  const accessGrantPatch = {
    provider_event_id: input.providerEventId,
    status: state.grantStatus,
    starts_at: startsAt,
    expires_at: expiresAt,
    refunded_at: state.transactionStatus === "refunded" ? input.occurredAt : null,
    revoked_at: state.retainAccess ? null : (state.transactionStatus === "refunded" || state.transactionStatus === "revoked" ? input.occurredAt : null),
    revoke_reason: state.retainAccess ? null : `RevenueCat ${input.eventType.toLowerCase()} event.`,
    metadata: {
      product_key: toText(input.product.product_key),
      channel_subscription_lifecycle: true,
      original_transaction_id: originalTransactionForWrite,
      viewer_access_only: true,
      payment_authority: false,
      payout_access: false,
      premium_unlock: false,
      vip_unlock: false,
      paid_video_unlock: false,
      paid_watch_party_ticket_unlock: false,
      paid_event_unlock: false,
      platform_wide_badge: false,
    },
  };

  const { data: accessGrant, error: grantError } = await adminClient
    .from("access_grants")
    .update(accessGrantPatch)
    .eq("id", accessGrantId)
    .eq("user_id", input.userId)
    .eq("grant_type", "channel_subscription")
    .select("id")
    .maybeSingle();
  if (grantError) throw new Error(`Channel subscription lifecycle access sync failed: ${grantError.message}`);
  if (!accessGrant?.id) return ignoreLifecycle("channel_subscription_access_grant_missing");

  const timestampPatch = {
    canceled_at: CANCELED_EVENT_TYPES.has(input.eventType) ? input.occurredAt : null,
    expired_at: EXPIRED_EVENT_TYPES.has(input.eventType) ? input.occurredAt : null,
    revoked_at: REVOKED_EVENT_TYPES.has(input.eventType) ? input.occurredAt : null,
  };

  const { error: subscriptionUpdateError } = await adminClient
    .from("creator_channel_subscriptions")
    .update({
      access_grant_id: accessGrant.id,
      provider_original_transaction_id: originalTransactionForWrite,
      provider_latest_transaction_id: input.eventId,
      status: state.subscriptionStatus,
      current_period_start: startsAt,
      current_period_end: expiresAt,
      canceled_at: timestampPatch.canceled_at,
      expired_at: timestampPatch.expired_at,
      revoked_at: timestampPatch.revoked_at,
      metadata: {
        sandbox_only: input.environment === "sandbox",
        viewer_access_only: true,
        channel_subscription_lifecycle: true,
        latest_event_type: input.eventType,
        cancellation_pending: state.subscriptionStatus === "cancel_pending",
        platform_wide_badge: false,
      },
    })
    .eq("id", subscription.id);
  if (subscriptionUpdateError) throw new Error(`Channel subscription lifecycle subscription update failed: ${subscriptionUpdateError.message}`);

  const { error: subscriberUpdateError } = await adminClient
    .from("channel_subscribers")
    .update({
      status: state.channelSubscriberStatus,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("channel_user_id", toText(offer.creator_id))
    .eq("subscriber_user_id", input.userId)
    .eq("source", "billing_sync");
  if (subscriberUpdateError) throw new Error(`Channel subscription lifecycle subscriber read-model update failed: ${subscriberUpdateError.message}`);

  const transactionPatch = {
    offer_id: offer.id,
    creator_id: offer.creator_id,
    subscriber_id: input.userId,
    subscription_id: subscription.id,
    amount_cents: resolveAmountMinor(input.event) || offer.price_cents || 0,
    currency: resolveCurrency(input.event) || offer.currency || "usd",
    provider: "revenuecat_google_play",
    provider_product_id: providerProductId,
    provider_transaction_id: input.eventId,
    provider_original_transaction_id: originalTransactionForWrite,
    provider_event_id: input.providerEventId,
    ledger_event_id: ledgerEventId,
    status: state.transactionStatus,
    payout_status: state.payableState,
    paid_at: state.transactionStatus === "paid" || state.transactionStatus === "renewal_paid" ? input.occurredAt : null,
    metadata: {
      sandbox_only: input.environment === "sandbox",
      channel_subscription_lifecycle: true,
      premium_unlock: false,
      vip_unlock: false,
      paid_video_unlock: false,
      paid_watch_party_ticket_unlock: false,
      paid_event_unlock: false,
      tips_path: false,
      platform_wide_badge: false,
    },
  };
  const { data: existingTransaction, error: existingTransactionError } = await adminClient
    .from("creator_channel_subscription_transactions")
    .select("id")
    .eq("provider_event_id", input.providerEventId)
    .maybeSingle();
  if (existingTransactionError) throw new Error(`Channel subscription lifecycle transaction lookup failed: ${existingTransactionError.message}`);

  const { data: transaction, error: transactionError } = existingTransaction?.id
    ? await adminClient
      .from("creator_channel_subscription_transactions")
      .update(transactionPatch)
      .eq("id", existingTransaction.id)
      .select("id")
      .single()
    : await adminClient
      .from("creator_channel_subscription_transactions")
      .insert(transactionPatch)
      .select("id")
      .single();
  if (transactionError) throw new Error(`Channel subscription lifecycle transaction sync failed: ${transactionError.message}`);

  const { error: eventLogError } = await adminClient
    .from("creator_channel_subscription_events")
    .insert({
      offer_id: offer.id,
      subscription_id: subscription.id,
      transaction_id: transaction.id,
      actor_id: input.userId,
      event_type: `provider_${input.eventType.toLowerCase()}`,
      metadata: {
        provider_event_id: input.providerEventId,
        channel_subscription_lifecycle: true,
        subscription_status: state.subscriptionStatus,
        grant_status: state.grantStatus,
        sandbox_only: input.environment === "sandbox",
      },
    });
  if (eventLogError) throw new Error(`Channel subscription lifecycle event log failed: ${eventLogError.message}`);

  const { count: subscriberCount, error: subscriberCountError } = await adminClient
    .from("creator_channel_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offer.id)
    .in("status", ["active", "trialing", "grace_period", "cancel_pending"])
    .or(`current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`)
    .is("revoked_at", null)
    .is("expired_at", null);
  if (subscriberCountError) throw new Error(`Channel subscription lifecycle subscriber count failed: ${subscriberCountError.message}`);

  const { error: offerCountError } = await adminClient
    .from("creator_channel_subscription_offers")
    .update({
      subscriber_count: subscriberCount ?? 0,
    })
    .eq("id", offer.id);
  if (offerCountError) throw new Error(`Channel subscription lifecycle offer count update failed: ${offerCountError.message}`);

  const { error: providerUpdateError } = await adminClient
    .from("provider_events")
    .update({
      status: state.ledgerStatus === "refunded" ? "refunded" : state.ledgerStatus === "reversed" ? "reversed" : "processed",
      metadata: {
        provider_payload_stored: false,
        provider_product_id: input.productId,
        original_transaction_id: originalTransactionForWrite,
        dynamic_product: true,
        channel_subscription_lifecycle: true,
        subscription_id: subscription.id,
        access_grant_id: accessGrant.id,
        ledger_event_id: ledgerEventId,
        transaction_id: transaction.id,
        sandbox_only: input.environment === "sandbox",
        live_money_action: false,
        payout_ready: false,
      },
    })
    .eq("id", input.providerEventId);
  if (providerUpdateError) throw new Error(`Channel subscription lifecycle provider event finalize failed: ${providerUpdateError.message}`);

  return {
    status: "processed",
    productKey: toText(input.product.product_key) || null,
    providerEventId: input.providerEventId,
    accessGrantId: accessGrant.id,
    ledgerEventId,
    subscriptionId: toText(subscription.id),
    purchaseIntentId: null,
    environment: input.environment,
    payableState: state.payableState,
    grantStatus: state.grantStatus,
    reason: `channel_subscription_${input.eventType.toLowerCase()}_synced`,
    duplicateProviderEvent: false,
    duplicateAccessGrant: true,
    duplicateLedgerEvent: !!existingLedger?.id,
  };
};

const mirrorRevenueCatDynamicMoneyAccess = async (
  adminClient: SupabaseClientLike,
  input: {
    event: RevenueCatEvent;
    eventType: string;
    eventId: string;
    userId: string;
    productId: string | null;
    environment: string | null;
    status: EntitlementWriteResult["status"];
    rawEventHash: string;
  },
): Promise<DynamicMoneyAccessResult> => {
  const environment = normalizeMoneyAccessEnvironment(input.environment);
  const idempotencyKey = `${input.eventType}:${input.eventId}`;
  const occurredAt = toIsoFromMs(input.event.event_timestamp_ms || input.event.purchased_at_ms) || new Date().toISOString();
  const grantStatus = resolveGrantStatus(input.status, environment);
  const { payableState, ledgerStatus } = resolveLedgerState(input.eventType);

  if (!input.productId) {
    return {
      status: "ignored",
      productKey: null,
      providerEventId: null,
      accessGrantId: null,
      ledgerEventId: null,
      purchaseIntentId: null,
      environment,
      payableState,
      grantStatus,
      reason: "product_id_missing",
      duplicateProviderEvent: false,
      duplicateAccessGrant: false,
      duplicateLedgerEvent: false,
    };
  }

  const { data: existingProviderEvent, error: existingProviderError } = await adminClient
    .from("provider_events")
    .select("id, product_key, environment, status")
    .eq("provider", "revenuecat_google_play")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingProviderError) throw new Error(`Dynamic provider event duplicate check failed: ${existingProviderError.message}`);

  if (existingProviderEvent?.id) {
    if (
      existingProviderEvent.status === "ignored"
      && toText(existingProviderEvent.product_key) === "channel_subscription_sandbox_monthly_499"
      && input.productId
    ) {
      const { data: lifecycleProduct, error: lifecycleProductError } = await adminClient
        .from("monetization_products")
        .select("id, product_key, product_type, provider, provider_product_id, environment, status, is_android_digital")
        .eq("product_key", existingProviderEvent.product_key)
        .eq("product_type", CHANNEL_SUBSCRIPTION_PRODUCT_TYPE)
        .maybeSingle();
      if (lifecycleProductError) throw new Error(`Channel subscription duplicate lifecycle product lookup failed: ${lifecycleProductError.message}`);
      if (lifecycleProduct?.id && existingProviderEvent.environment === "sandbox") {
        return syncChannelSubscriptionLifecycle(adminClient, {
          event: input.event,
          eventType: input.eventType,
          eventId: input.eventId,
          userId: input.userId,
          productId: input.productId,
          environment,
          status: input.status,
          rawEventHash: input.rawEventHash,
          product: lifecycleProduct,
          providerEventId: existingProviderEvent.id,
          occurredAt,
        });
      }
    }

    const { data: existingLedger, error: existingLedgerError } = await adminClient
      .from("money_access_ledger_events")
      .select("id")
      .eq("provider_event_id", existingProviderEvent.id)
      .maybeSingle();
    if (existingLedgerError) throw new Error(`Dynamic ledger duplicate check failed: ${existingLedgerError.message}`);

    const { data: existingGrant, error: existingGrantError } = await adminClient
      .from("access_grants")
      .select("id")
      .eq("provider_event_id", existingProviderEvent.id)
      .maybeSingle();
    if (existingGrantError) throw new Error(`Dynamic access grant duplicate check failed: ${existingGrantError.message}`);

    return {
      status: "duplicate_ignored",
      productKey: toText(existingProviderEvent.product_key) || null,
      providerEventId: existingProviderEvent.id,
      accessGrantId: existingGrant?.id ?? null,
      ledgerEventId: existingLedger?.id ?? null,
      purchaseIntentId: null,
      environment,
      payableState,
      grantStatus,
      reason: "duplicate_provider_event",
      duplicateProviderEvent: true,
      duplicateAccessGrant: !!existingGrant?.id,
      duplicateLedgerEvent: !!existingLedger?.id,
    };
  }

  const productIdCandidates = providerProductIdCandidates(input.productId);
  const { data: product, error: productError } = await adminClient
    .from("monetization_products")
    .select("id, product_key, product_type, provider, provider_product_id, environment, status, is_android_digital")
    .in("provider_product_id", productIdCandidates)
    .neq("product_type", "premium_subscription")
    .limit(1)
    .maybeSingle();
  if (productError) throw new Error(`Dynamic product lookup failed: ${productError.message}`);

  const providerEventStatus = product?.id && environment === "sandbox" ? "received" : "ignored";
  const { data: providerEvent, error: providerError } = await adminClient
    .from("provider_events")
    .insert({
      provider_event_id: input.eventId,
      provider: "revenuecat_google_play",
      product_id: product?.id ?? null,
      product_key: product?.product_key ?? null,
      user_id: input.userId,
      app_user_id: input.userId,
      environment,
      event_type: input.eventType,
      status: providerEventStatus,
      occurred_at: occurredAt,
      idempotency_key: idempotencyKey,
      raw_payload_hash: input.rawEventHash,
      metadata: {
        provider_payload_stored: false,
        provider_product_id: input.productId,
        original_transaction_id: toText(input.event.original_transaction_id) || null,
        dynamic_product: true,
        sandbox_only: environment === "sandbox",
        live_money_action: false,
        payout_ready: false,
      },
    })
    .select("id")
    .single();
  if (providerError) throw new Error(`Dynamic provider event sync failed: ${providerError.message}`);

  const ignored = async (reason: string): Promise<DynamicMoneyAccessResult> => {
    await adminClient
      .from("provider_events")
      .update({
        status: "ignored",
        metadata: {
          provider_payload_stored: false,
          provider_product_id: input.productId,
          dynamic_product: true,
          sandbox_only: environment === "sandbox",
          ignored_reason: reason,
          access_granted: false,
          ledger_created: false,
          live_money_action: false,
          payout_ready: false,
        },
      })
      .eq("id", providerEvent.id);

    return {
      status: "ignored",
      productKey: product?.product_key ?? null,
      providerEventId: providerEvent.id,
      accessGrantId: null,
      ledgerEventId: null,
      purchaseIntentId: null,
      environment,
      payableState,
      grantStatus,
      reason,
      duplicateProviderEvent: false,
      duplicateAccessGrant: false,
      duplicateLedgerEvent: false,
    };
  };

  if (!product?.id) return ignored("product_mapping_missing");
  if (environment !== "sandbox") return ignored("production_or_setup_event_blocked");
  if (product.environment !== "sandbox" || product.status !== "sandbox") return ignored("product_not_sandbox_enabled");
  if (!ACTIVE_EVENT_TYPES.has(input.eventType) && !REVOKED_EVENT_TYPES.has(input.eventType) && !CANCELED_EVENT_TYPES.has(input.eventType) && !EXPIRED_EVENT_TYPES.has(input.eventType) && !BILLING_ISSUE_EVENT_TYPES.has(input.eventType)) {
    return ignored("unsupported_event_type");
  }

  if (product.product_type === CHANNEL_SUBSCRIPTION_PRODUCT_TYPE && input.eventType !== "INITIAL_PURCHASE") {
    return syncChannelSubscriptionLifecycle(adminClient, {
      event: input.event,
      eventType: input.eventType,
      eventId: input.eventId,
      userId: input.userId,
      productId: input.productId,
      environment,
      status: input.status,
      rawEventHash: input.rawEventHash,
      product,
      providerEventId: providerEvent.id,
      occurredAt,
    });
  }

  const nowIso = new Date().toISOString();
  const { data: intent, error: intentError } = await adminClient
    .from("money_purchase_intents")
    .select("id, product_id, product_type, source_type, source_id, creator_id, platform_id, status, expires_at, metadata")
    .eq("user_id", input.userId)
    .eq("product_id", product.id)
    .eq("provider_product_id", product.provider_product_id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (intentError) throw new Error(`Dynamic purchase intent lookup failed: ${intentError.message}`);
  if (!intent?.id) return ignored("purchase_intent_missing_or_expired");

  const accessGrantType = accessGrantTypeForProductType(product.product_type);
  let accessGrantId: string | null = null;
  let duplicateAccessGrant = false;

  if (accessGrantType && ACTIVE_EVENT_TYPES.has(input.eventType)) {
    const { data: grant, error: grantError } = await adminClient
      .from("access_grants")
      .insert({
        user_id: input.userId,
        grant_type: accessGrantType,
        source_type: "provider_event",
        source_id: intent.source_id,
        product_id: product.id,
        provider: "revenuecat_google_play",
        provider_event_id: providerEvent.id,
        environment,
        status: grantStatus,
        starts_at: occurredAt,
        expires_at: toIsoFromMs(input.event.expiration_at_ms),
        metadata: {
          product_key: product.product_key,
          purchase_intent_id: intent.id,
          original_transaction_id: toText(input.event.original_transaction_id) || null,
          viewer_access_only: true,
          payment_authority: false,
          payout_access: false,
          premium_unlock: false,
          vip_unlock: product.product_type === "vip_pass",
          creator_specific_vip_only: product.product_type === "vip_pass",
          platform_wide_badge: false,
        },
      })
      .select("id")
      .single();
    if (grantError) throw new Error(`Dynamic access grant sync failed: ${grantError.message}`);
    accessGrantId = grant.id;
  } else if (accessGrantType && (REVOKED_EVENT_TYPES.has(input.eventType) || CANCELED_EVENT_TYPES.has(input.eventType) || EXPIRED_EVENT_TYPES.has(input.eventType))) {
    const revokedStatus = REVOKED_EVENT_TYPES.has(input.eventType) ? "refunded" : "expired";
    const { data: grant, error: grantUpdateError } = await adminClient
      .from("access_grants")
      .update({
        status: revokedStatus,
        refunded_at: REVOKED_EVENT_TYPES.has(input.eventType) ? occurredAt : null,
        revoked_at: occurredAt,
        revoke_reason: `RevenueCat ${input.eventType.toLowerCase()} event.`,
      })
      .eq("user_id", input.userId)
      .eq("product_id", product.id)
      .eq("source_id", intent.source_id)
      .select("id")
      .maybeSingle();
    if (grantUpdateError) throw new Error(`Dynamic access revoke sync failed: ${grantUpdateError.message}`);
    accessGrantId = grant?.id ?? null;
  }

  const { data: existingLedger, error: existingLedgerError } = await adminClient
    .from("money_access_ledger_events")
    .select("id")
    .eq("provider_event_id", providerEvent.id)
    .maybeSingle();
  if (existingLedgerError) throw new Error(`Dynamic ledger duplicate check failed: ${existingLedgerError.message}`);

  let ledgerEventId = existingLedger?.id ?? null;
  if (!ledgerEventId) {
    const { data: ledger, error: ledgerError } = await adminClient
      .from("money_access_ledger_events")
      .insert({
        user_id: input.userId,
        creator_id: intent.creator_id ?? null,
        platform_id: intent.platform_id ?? null,
        product_id: product.id,
        provider_event_id: providerEvent.id,
        event_type: input.eventType,
        amount_minor: resolveAmountMinor(input.event),
        currency: resolveCurrency(input.event),
        environment,
        payable_state: payableState,
        status: ledgerStatus,
        source_type: intent.source_type,
        source_id: intent.source_id,
        metadata: {
          product_key: product.product_key,
          purchase_intent_id: intent.id,
          sandbox_only: true,
          not_payable: payableState === "not_payable",
          production_money: false,
          payout_readiness_proved: false,
          live_money_enabled_at_verification: false,
        },
      })
      .select("id")
      .single();
    if (ledgerError) throw new Error(`Dynamic ledger sync failed: ${ledgerError.message}`);
    ledgerEventId = ledger.id;
  }

  const { error: consumeError } = await adminClient
    .from("money_purchase_intents")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      metadata: {
        consumed_by_provider_event_id: providerEvent.id,
        sandbox_only: true,
        not_payable: true,
      },
    })
    .eq("id", intent.id)
    .eq("status", "pending");
  if (consumeError) throw new Error(`Dynamic purchase intent consume failed: ${consumeError.message}`);

  const { error: providerUpdateError } = await adminClient
    .from("provider_events")
    .update({
      status: ledgerStatus === "refunded" ? "refunded" : ledgerStatus === "reversed" ? "reversed" : "processed",
      metadata: {
        provider_payload_stored: false,
        provider_product_id: input.productId,
        original_transaction_id: toText(input.event.original_transaction_id) || null,
        dynamic_product: true,
        purchase_intent_id: intent.id,
        sandbox_only: true,
        access_grant_id: accessGrantId,
        ledger_event_id: ledgerEventId,
        live_money_action: false,
        payout_ready: false,
      },
    })
    .eq("id", providerEvent.id);
  if (providerUpdateError) throw new Error(`Dynamic provider event finalize failed: ${providerUpdateError.message}`);

  await createCreatorMoneyNotifications(adminClient, {
    buyerUserId: input.userId,
    creatorId: toText(intent.creator_id) || null,
    eventType: input.eventType,
    ledgerEventId,
    metadata: safeObject(intent.metadata),
    productKey: toText(product.product_key),
    productType: toText(product.product_type),
    providerEventId: providerEvent.id,
    sourceId: toText(intent.source_id) || null,
    sourceType: toText(intent.source_type) || null,
  });

  return {
    status: "processed",
    productKey: product.product_key,
    providerEventId: providerEvent.id,
    accessGrantId,
    ledgerEventId,
    purchaseIntentId: intent.id,
    environment,
    payableState,
    grantStatus,
    reason: accessGrantType ? "access_and_ledger_recorded" : "ledger_recorded_no_access_grant",
    duplicateProviderEvent: false,
    duplicateAccessGrant,
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
  const productId = resolveProductId(event);
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

    if (!hasPremiumSignal(event)) {
      const eventType = normalizeEventType(event.type);
      const eventId = await resolveEventId(event, rawBody);
      const userId = resolveUserId(event);
      const productId = resolveProductId(event);
      if (!eventType) throw new Error("RevenueCat webhook event type is missing.");
      if (!userId) throw new Error("RevenueCat webhook app user id is missing or anonymous.");

      const dynamicWrite = await mirrorRevenueCatDynamicMoneyAccess(adminConfig.client, {
        event,
        eventType,
        eventId,
        userId,
        productId,
        environment: toText(event.environment) || null,
        status: resolveEntitlementStatus(event),
        rawEventHash: await hashText(rawBody),
      });

      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "revenuecat",
        capability: "digital_access_sandbox",
        action: dynamicWrite.status === "processed"
          ? "revenuecat_webhook_dynamic_access_synced"
          : "revenuecat_webhook_dynamic_access_ignored",
        statusAfter: dynamicWrite.status === "processed" ? "sandbox_ready" : "configured",
        reason: "RevenueCat webhook handled a non-Premium digital product through the purchase-intent money access path.",
        proofSource: FUNCTION_NAME,
        metadata: {
          revenuecat_event_hash: await hashText(rawBody),
          revenuecat_event_type: eventType,
          revenuecat_event_id_hash: await hashText(eventId),
          user_id_hash: await hashText(userId),
          product_id: productId,
          product_key: dynamicWrite.productKey,
          environment: dynamicWrite.environment,
          status: dynamicWrite.status,
          reason: dynamicWrite.reason,
          purchase_intent_id: dynamicWrite.purchaseIntentId,
          payable_state: dynamicWrite.payableState,
          raw_provider_payload_stored: false,
          live_money_action: false,
        },
      });

      return jsonResponse(200, {
        status: dynamicWrite.status,
        provider: "revenuecat",
        capability: "digital_access_sandbox",
        signatureVerified: true,
        webhookProcessed: dynamicWrite.status === "processed",
        productKey: dynamicWrite.productKey,
        purchaseIntentMatched: !!dynamicWrite.purchaseIntentId,
        accessGrantCreated: !!dynamicWrite.accessGrantId,
        ledgerEventCreated: !!dynamicWrite.ledgerEventId,
        moneyAccessEnvironment: dynamicWrite.environment,
        moneyAccessPayableState: dynamicWrite.payableState,
        liveMoneyAction: false,
        reason: dynamicWrite.reason,
        message: dynamicWrite.status === "processed"
          ? "RevenueCat sandbox digital product event synced through money access."
          : "RevenueCat digital product event was recorded or ignored without granting unsafe access.",
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
