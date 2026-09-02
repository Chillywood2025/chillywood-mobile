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
import {
  IOS_NOTIFICATION_CATEGORIES,
  buildPlatformExpoPushMessage,
} from "../_shared/notification-payload.mjs";
import { reconcileRecentExpoPushReceipts } from "../_shared/expo-push-receipts.ts";
import {
  isSafeStoreMapping,
  isVerifiedRevenueCatTransferPolicy,
  resolveRevenueCatTransferUserId,
  resolveRevenueCatTransferUsers,
  resolveRevenueCatStorePolicy,
} from "./store-policy.mjs";

const FUNCTION_NAME = "revenuecat-webhook";
const PREMIUM_ENTITLEMENT_KEY = "premium";
const PREMIUM_PRODUCT_ID = "premium_subscription";
const APP_STORE_PREMIUM_PRODUCT_IDS = new Set([
  "com.chillywood.premium.monthly",
  "com.chillywood.premium.yearly",
]);
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ANDROID_NOTIFICATION_CHANNEL_ID = "default";
const UNRESOLVED_PROVIDER_PRODUCT_ID = "<missing-or-ambiguous>";
const UNRESOLVED_PROVIDER_PRODUCT_REASON = "provider_product_identity_missing_or_ambiguous";
const INVALID_REVENUECAT_PAYLOAD_MARKER = "__chillywood_invalid_revenuecat_payload";

type RevenueCatEvent = Record<string, unknown>;
type RevenueCatProvider = "revenuecat" | "revenuecat_app_store" | "revenuecat_google_play";
type RevenueCatStorePolicy = {
  platform: "android" | "ios" | "unknown";
  provider: RevenueCatProvider;
  rawStore: string;
  store: "app_store" | "google_play" | "unknown";
  supportsGoogleBasePlans: boolean;
};
type StoreProductResolution = {
  mapping: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  providerProductId: string;
  storePolicy: RevenueCatStorePolicy;
};
type EntitlementWriteResult = {
  applied: boolean;
  entitlementActive: boolean | null;
  ignoredEvent: boolean;
  ignoreReason: string | null;
  status: "active" | "trialing" | "grace_period" | "pending" | "expired" | "canceled" | "revoked";
  eventType: string;
  eventId: string;
  userId: string;
  productId: string | null;
  environment: string | null;
  expiresAt: string | null;
  duplicateEvent: boolean;
  staleEvent: boolean;
  moneyAccess: MoneyAccessMirrorResult;
};
type PremiumTransferWriteResult = {
  status: "processed" | "duplicate_ignored" | "ignored";
  reason: string | null;
  duplicateEvent: boolean;
  sourceRevoked: boolean;
  targetActive: boolean;
  environment: "sandbox";
};
type RevenueCatTerminalDomain = "premium" | "creator_money" | "missing" | "ambiguous";
type RevenueCatTerminalWriteResult = {
  status: "processed" | "ignored" | "duplicate_ignored";
  reason: string;
  domain: RevenueCatTerminalDomain;
  providerEventId: string | null;
  originalTransactionId: string;
  duplicateEvent: boolean;
  authorityGranted: boolean;
  entitlementStatus: string | null;
  entitlementActive: boolean;
  grantStatus: string | null;
  ledgerEventId: string | null;
  productKey: string | null;
  productType: string | null;
  purchaseIntentId: string | null;
};
type RevenueCatTerminalQuarantineResult = {
  status: "quarantined";
  quarantineId: string;
  duplicateEvent: boolean;
  authorityGranted: false;
  scope: string;
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

const ignoredDynamicMoneyAccess = (
  environment: DynamicMoneyAccessResult["environment"],
  reason: string,
): DynamicMoneyAccessResult => ({
  status: "ignored",
  productKey: null,
  providerEventId: null,
  accessGrantId: null,
  ledgerEventId: null,
  purchaseIntentId: null,
  environment,
  payableState: "not_payable",
  grantStatus: "blocked",
  reason,
  duplicateProviderEvent: false,
  duplicateAccessGrant: false,
  duplicateLedgerEvent: false,
});
type MoneyNotificationType =
  | "paid_video_unlocked"
  | "watch_party_ticket_ready"
  | "live_watch_party_access_ready"
  | "live_watch_party_seat_eligible"
  | "channel_subscription_active"
  | "vip_access_active"
  | "event_pass_active"
  | "tip_sent_receipt"
  | "paid_video_sold"
  | "watch_party_ticket_sold"
  | "live_watch_party_access_sold"
  | "live_watch_party_seat_sold"
  | "creator_money_refunded"
  | "creator_money_revoked"
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
  platform: "android" | "ios";
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
const TERMINAL_DISPATCH_EVENT_TYPES = new Set([
  "CANCELLATION",
  "BILLING_ISSUE",
  "EXPIRATION",
  "REFUND",
  "REVOCATION",
  "SUBSCRIPTION_PAUSED",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const isRevenueCatStaleEventError = (value: unknown) => (
  isRecord(value) && toText(value.message) === "revenuecat_event_stale"
);

const isIosOrdinaryPushRolloutEnabled = () => (
  toText(Deno.env.get("IOS_ORDINARY_PUSH_ROLLOUT_ENABLED")).toLowerCase() === "true"
);

const normalizeEventType = (value: unknown) => toText(value).toUpperCase();
const providerText = (value: unknown) => (
  typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : ""
);
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const providerAliasPresent = (event: RevenueCatEvent, key: string) => (
  Object.prototype.hasOwnProperty.call(event, key) && event[key] !== null && event[key] !== undefined
);

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
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (isRecord(parsed) && isRecord(parsed.event)) return parsed.event;
    if (isRecord(parsed)) return parsed;
  } catch {
    // A valid provider signature makes unparseable bytes indeterminate
    // authority evidence. Return an internal marker so the handler can apply
    // the global UNKNOWN quarantine instead of acknowledging the delivery as
    // an ordinary malformed request.
  }
  return { [INVALID_REVENUECAT_PAYLOAD_MARKER]: true };
};

const resolveEntitlementIds = (event: RevenueCatEvent) => [
  ...toStringArray(event.entitlement_ids),
  ...toStringArray(event.entitlement_id),
  ...toStringArray(event.entitlements),
].map((entry) => entry.toLowerCase());

const hasPremiumProviderProductSignal = (value: string) => {
  if (value === PREMIUM_PRODUCT_ID || APP_STORE_PREMIUM_PRODUCT_IDS.has(value)) return true;
  const parts = value.split(":");
  return parts.length === 2 && parts[0] === PREMIUM_PRODUCT_ID && !!parts[1];
};

const hasPremiumSignal = (event: RevenueCatEvent) => {
  const entitlementIds = resolveEntitlementIds(event);
  // An exact Premium entitlement marker selects the Premium projector even
  // when the accompanying product aliases are malformed. That projector can
  // then durably consume the exact event/original-transaction tuple as ignored
  // instead of accidentally routing it through an unrelated creator product.
  if (entitlementIds.includes(PREMIUM_ENTITLEMENT_KEY)) return true;
  const productId = providerText(event.product_id);
  const productIdentifier = providerText(event.product_identifier);
  const productSignalsPremium = hasPremiumProviderProductSignal(productId)
    || hasPremiumProviderProductSignal(productIdentifier);
  // A conflict can select the fail-closed Premium projector when either exact
  // alias identifies Premium, but resolveProductId still returns null so the
  // atomic database path records ignored evidence and cannot grant access.
  if (productId && productIdentifier && productId !== productIdentifier) return productSignalsPremium;
  const resolvedProductId = productId || productIdentifier;
  return hasPremiumProviderProductSignal(resolvedProductId);
};

const resolveUserId = (event: RevenueCatEvent) => {
  const snakeCaseId = providerText(event.app_user_id);
  const camelCaseId = providerText(event.appUserId);
  if (
    (providerAliasPresent(event, "app_user_id") && !snakeCaseId)
    || (providerAliasPresent(event, "appUserId") && !camelCaseId)
  ) return "";
  if (snakeCaseId && camelCaseId && snakeCaseId !== camelCaseId) return "";
  const appUserId = snakeCaseId || camelCaseId;
  if (!appUserId || appUserId.startsWith("$RCAnonymousID:")) return "";
  return appUserId;
};

const resolveEventId = async (event: RevenueCatEvent, _rawBody: string) => {
  const id = providerText(event.id);
  const eventId = providerText(event.event_id);
  if (
    (providerAliasPresent(event, "id") && !id)
    || (providerAliasPresent(event, "event_id") && !eventId)
  ) throw new Error("RevenueCat webhook event id is missing or invalid.");
  if (id && eventId && id !== eventId) {
    throw new Error("RevenueCat webhook event id is ambiguous.");
  }
  const resolved = id || eventId;
  if (!resolved) throw new Error("RevenueCat webhook event id is missing.");
  return resolved;
};

const resolveEntitlementStatus = (event: RevenueCatEvent): EntitlementWriteResult["status"] => {
  const eventType = normalizeEventType(event.type);
  const expiresAt = toIsoFromMs(event.expiration_at_ms);
  const notExpired = !expiresAt || Date.parse(expiresAt) > Date.now();
  const periodType = toText(event.period_type).toUpperCase();

  if (REVOKED_EVENT_TYPES.has(eventType)) return "revoked";
  if (EXPIRED_EVENT_TYPES.has(eventType)) return "expired";
  // Store cancellation means auto-renew is off; verified access remains valid
  // through the current paid period and expires on the later expiration event.
  if (CANCELED_EVENT_TYPES.has(eventType)) return notExpired ? "active" : "canceled";
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

type CreatorMoneyProviderValue = {
  amountMinor: number | null;
  currency: string | null;
  invalidReason: string | null;
};

const ISO_CURRENCY_ZERO_MINOR_UNITS = new Set(
  "bif clp djf gnf isk jpy kmf krw pyg rwf ugx vnd vuv xaf xof xpf".split(" "),
);
const ISO_CURRENCY_THREE_MINOR_UNITS = new Set(
  "bhd iqd jod kwd lyd omr tnd".split(" "),
);
const ISO_CURRENCY_TWO_MINOR_UNITS = new Set(
  (
    "aed afn all amd aoa ars aud awg azn bam bbd bdt bmd bnd bob brl bsd btn bwp byn bzd "
    + "cad cdf chf cny cop crc cve czk dkk dop dzd egp ern etb eur fjd fkp gbp gel ghs gip gmd gtq gyd "
    + "hkd hnl htg huf idr ils inr irr jmd kes kgs khr kyd kzt lak lbp lkr lrd lsl mad mdl mkd mmk mnt "
    + "mga mop mru mur mvr mwk mxn myr mzn nad ngn nio nok npr nzd pab pen pgk php pkr pln qar ron rsd rub "
    + "sar sbd scr sdg sek sgd shp sle sos srd ssp stn svc szl thb tjs tmt top try ttd twd tzs uah usd "
    + "uyu uzs ves wst xcd xcg yer zar zmw zwg"
  ).split(" "),
);

const currencyMinorUnitExponent = (currency: string) => {
  if (ISO_CURRENCY_ZERO_MINOR_UNITS.has(currency)) return 0;
  if (ISO_CURRENCY_TWO_MINOR_UNITS.has(currency)) return 2;
  if (ISO_CURRENCY_THREE_MINOR_UNITS.has(currency)) return 3;
  return null;
};

const decimalMajorToMinor = (rawAmount: unknown, exponent: number) => {
  const amountText = typeof rawAmount === "number" && Number.isFinite(rawAmount)
    ? String(rawAmount)
    : typeof rawAmount === "string" && rawAmount === rawAmount.trim()
      ? rawAmount
      : "";
  if (amountText.length === 0 || amountText.length > 32 || !/^\d+(?:\.\d+)?$/.test(amountText)) {
    return { amountMinor: null, invalidReason: "provider_price_missing_or_invalid" };
  }

  const [majorUnits, fractionalUnits = ""] = amountText.split(".");
  if (fractionalUnits.length > exponent) {
    return { amountMinor: null, invalidReason: "provider_price_precision_invalid" };
  }

  try {
    const scale = 10n ** BigInt(exponent);
    const paddedFraction = fractionalUnits.padEnd(exponent, "0") || "0";
    const amountMinorBigInt = BigInt(majorUnits) * scale + BigInt(paddedFraction);
    if (amountMinorBigInt <= 0n || amountMinorBigInt > 2_147_483_647n) {
      return { amountMinor: null, invalidReason: "provider_price_minor_invalid" };
    }
    return { amountMinor: Number(amountMinorBigInt), invalidReason: null };
  } catch {
    return { amountMinor: null, invalidReason: "provider_price_minor_invalid" };
  }
};

const resolveAuthorityProviderValue = (
  event: RevenueCatEvent,
  authorityActive: boolean,
): CreatorMoneyProviderValue => {
  // A non-active lifecycle event is authorized only by its durable original-
  // transaction binding. Its payload amount must never become money truth.
  if (!authorityActive) {
    return { amountMinor: null, currency: null, invalidReason: null };
  }

  const currency = typeof event.currency === "string" && event.currency === event.currency.trim()
    ? event.currency.toLowerCase()
    : "";
  const exponent = /^[a-z]{3}$/.test(currency) ? currencyMinorUnitExponent(currency) : null;
  if (exponent === null) {
    return { amountMinor: null, currency: null, invalidReason: "provider_currency_missing_or_invalid" };
  }

  const amountResult = decimalMajorToMinor(event.price_in_purchased_currency, exponent);
  if (amountResult.invalidReason || amountResult.amountMinor === null) {
    return { amountMinor: null, currency: null, invalidReason: amountResult.invalidReason };
  }

  return { amountMinor: amountResult.amountMinor, currency, invalidReason: null };
};

const resolveCreatorMoneyProviderValue = (
  event: RevenueCatEvent,
  eventType: string,
) => resolveAuthorityProviderValue(event, ACTIVE_EVENT_TYPES.has(eventType));

const resolvePremiumProviderValue = (
  event: RevenueCatEvent,
  status: EntitlementWriteResult["status"],
) => resolveAuthorityProviderValue(event, isActiveEntitlementStatus(status));

const resolveProductId = (event: RevenueCatEvent) => {
  const productId = providerText(event.product_id);
  const productIdentifier = providerText(event.product_identifier);
  if (
    (providerAliasPresent(event, "product_id") && !productId)
    || (providerAliasPresent(event, "product_identifier") && !productIdentifier)
  ) return null;
  if (productId && productIdentifier && productId !== productIdentifier) return null;
  return productId || productIdentifier || null;
};

const resolveOriginalTransactionId = (event: RevenueCatEvent) => {
  const snakeCaseId = providerText(event.original_transaction_id);
  const camelCaseId = providerText(event.originalTransactionId);
  if (
    (providerAliasPresent(event, "original_transaction_id") && !snakeCaseId)
    || (providerAliasPresent(event, "originalTransactionId") && !camelCaseId)
  ) return null;
  if (snakeCaseId && camelCaseId && snakeCaseId !== camelCaseId) return null;
  return snakeCaseId || camelCaseId || null;
};

const resolveGooglePlayProductReference = (value: unknown) => {
  const rawProductId = providerText(value);
  if (!rawProductId) return null;
  const parts = rawProductId.split(":");
  if (parts.length === 1) {
    return { providerProductId: parts[0], providerBasePlanId: null };
  }
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { providerProductId: parts[0], providerBasePlanId: parts[1] };
};

const hasExactPremiumStoreProductIdentity = (
  resolution: StoreProductResolution,
  rawProviderProductId: string,
) => {
  const product = resolution.product;
  const productId = providerText(product?.id);
  if (!productId || providerText(product?.product_type) !== "premium_subscription") return false;
  if (resolution.storePolicy.provider === "revenuecat_app_store") {
    const mapping = resolution.mapping;
    return providerText(mapping?.id) !== ""
      && providerText(mapping?.product_id) === productId
      && providerText(mapping?.platform) === "ios"
      && providerText(mapping?.store) === "app_store"
      && providerText(mapping?.provider) === "revenuecat_app_store"
      && providerText(mapping?.provider_product_id) === rawProviderProductId
      && providerText(mapping?.provider_base_plan_id) === "";
  }
  if (resolution.storePolicy.provider !== "revenuecat_google_play") return false;
  const reference = resolveGooglePlayProductReference(rawProviderProductId);
  return !!reference
    && providerText(product?.provider_product_id) === reference.providerProductId
    && providerText(product?.provider_base_plan_id) === (reference.providerBasePlanId ?? "");
};

const revenueCatStorePolicy = (event: RevenueCatEvent) => (
  resolveRevenueCatStorePolicy(event.store) as RevenueCatStorePolicy
);

const readStoreProductResolution = async (
  adminClient: SupabaseClientLike,
  input: {
    event: RevenueCatEvent;
    productId: string;
  },
): Promise<StoreProductResolution> => {
  const storePolicy = revenueCatStorePolicy(input.event);

  if (storePolicy.provider === "revenuecat_app_store") {
    const { data: mappingRows, error: mappingError } = await adminClient
      .from("monetization_product_store_mappings")
      .select("id, product_id, concept, platform, store, provider, provider_product_id, provider_base_plan_id, store_product_type, tier, environment, status, unlocks_digital_access, grants_livekit_authority, creates_payable_balance")
      .eq("platform", "ios")
      .eq("store", "app_store")
      .eq("provider", "revenuecat_app_store")
      .eq("provider_product_id", input.productId)
      .is("provider_base_plan_id", null)
      .limit(2);
    if (mappingError) throw new Error(`App Store product mapping lookup failed: ${mappingError.message}`);
    const mappings = Array.isArray(mappingRows) ? mappingRows : [];
    const mapping = mappings.length === 1 ? mappings[0] : null;

    if (!mapping?.product_id || !isSafeStoreMapping(mapping)) {
      return {
        mapping: (mapping ?? null) as Record<string, unknown> | null,
        product: null,
        providerProductId: input.productId,
        storePolicy,
      };
    }

    const { data: product, error: productError } = await adminClient
      .from("monetization_products")
      .select("id, product_key, product_type, provider, provider_product_id, provider_base_plan_id, environment, status, is_android_digital")
      .eq("id", mapping.product_id)
      .limit(1)
      .maybeSingle();
    if (productError) throw new Error(`App Store conceptual product lookup failed: ${productError.message}`);

    return {
      mapping: mapping as Record<string, unknown>,
      product: (product ?? null) as Record<string, unknown> | null,
      providerProductId: input.productId,
      storePolicy,
    };
  }

  const googleReference = resolveGooglePlayProductReference(input.productId);
  if (!googleReference) {
    return {
      mapping: null,
      product: null,
      providerProductId: "",
      storePolicy,
    };
  }
  let productQuery = adminClient
    .from("monetization_products")
    .select("id, product_key, product_type, provider, provider_product_id, provider_base_plan_id, environment, status, is_android_digital")
    .eq("provider_product_id", googleReference.providerProductId);
  productQuery = googleReference.providerBasePlanId
    ? productQuery.eq("provider_base_plan_id", googleReference.providerBasePlanId)
    : productQuery.is("provider_base_plan_id", null);
  const { data: productRows, error: productError } = await productQuery.limit(2);
  if (productError) throw new Error(`RevenueCat product lookup failed: ${productError.message}`);
  const products = Array.isArray(productRows) ? productRows : [];
  const product = products.length === 1 ? products[0] : null;

  return {
    mapping: null,
    product: (product ?? null) as Record<string, unknown> | null,
    providerProductId: providerText(product?.provider_product_id),
    storePolicy,
  };
};

const isCreatorMoneyNotificationProduct = (productType: string) => (
  productType === "paid_content_access"
  || productType === "watch_party_live_ticket"
  || productType === "live_watch_party_access_pass"
  || productType === "live_watch_party_seat_pass"
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

const readPushTokens = async (adminClient: SupabaseClientLike, userId: string): Promise<PushToken[]> => {
  const readPlatformTokens = async (platform: PushToken["platform"]) => {
    const { data } = await adminClient
      .from("user_push_tokens")
      .select("id,platform,provider,token")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("provider", "expo")
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(5);
    return (data ?? []) as PushToken[];
  };
  const [androidTokens, iosTokens] = await Promise.all([
    readPlatformTokens("android"),
    readPlatformTokens("ios"),
  ]);
  return [...androidTokens, ...iosTokens];
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
  creatorId: string | null,
): Promise<CreatorMoneyNotificationTarget | null> => {
  if (!sourceId || !creatorId) return null;
  const metadataPartyId = toText(metadata.party_id);
  const { data } = await adminClient
    .from("paid_watch_party_offers")
    .select("party_id,creator_id")
    .eq("id", sourceId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  const partyId = toText(data?.party_id);
  if (!partyId || (metadataPartyId && metadataPartyId !== partyId)) return null;
  return {
    deepLink: `chillywoodmobile://watch-party/${partyId}`,
    entityId: partyId,
    route: "/watch-party/[partyId]",
  };
};

const resolveLiveWatchPartyNotificationTarget = async (
  adminClient: SupabaseClientLike,
  input: {
    creatorId: string | null;
    metadata: Record<string, unknown>;
    productType: "live_watch_party_access_pass" | "live_watch_party_seat_pass";
    sourceId: string | null;
  },
): Promise<CreatorMoneyNotificationTarget | null> => {
  if (!input.sourceId || !input.creatorId) return null;
  const { data } = await adminClient
    .from("paid_live_watch_party_offers")
    .select("party_id,creator_id,pass_type")
    .eq("id", input.sourceId)
    .eq("creator_id", input.creatorId)
    .eq("pass_type", input.productType)
    .maybeSingle();
  const partyId = toText(data?.party_id);
  const metadataPartyId = toText(input.metadata.party_id);
  if (!partyId || (metadataPartyId && metadataPartyId !== partyId)) return null;
  return {
    deepLink: `chillywoodmobile://watch-party/live-stage/${partyId}`,
    entityId: partyId,
    route: "/watch-party/live-stage/[partyId]",
  };
};

const resolveEventNotificationTarget = async (
  adminClient: SupabaseClientLike,
  sourceId: string | null,
  creatorId: string | null,
): Promise<CreatorMoneyNotificationTarget | null> => {
  if (!sourceId || !creatorId) return null;
  const { data } = await adminClient
    .from("paid_creator_events")
    .select("creator_event_id,creator_id")
    .eq("creator_event_id", sourceId)
    .eq("creator_id", creatorId)
    .maybeSingle();
  const creatorEventId = toText(data?.creator_event_id);
  if (!creatorEventId || creatorEventId !== sourceId) return null;
  return {
    deepLink: `chillywoodmobile://event/${creatorEventId}`,
    entityId: creatorEventId,
    route: "/event/[eventId]",
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
    return resolveWatchPartyNotificationTarget(adminClient, sourceId, input.metadata, input.creatorId);
  }
  if (input.productType === "live_watch_party_access_pass" || input.productType === "live_watch_party_seat_pass") {
    return resolveLiveWatchPartyNotificationTarget(adminClient, {
      creatorId: input.creatorId,
      metadata: input.metadata,
      productType: input.productType,
      sourceId,
    });
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
    return resolveEventNotificationTarget(adminClient, sourceId, input.creatorId);
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
      body: "You're cleared to enter this exact Party Room. This does not include Live Stage or any speaker, host, moderator, camera, microphone, or publish authority.",
      category: "creator_money_purchase",
      notificationType: "watch_party_ticket_ready",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Party Room Pass active",
    };
  }
  if (productType === "live_watch_party_access_pass") {
    return {
      body: "You can watch/listen to this exact Live Stage. This does not include a speaking seat, camera, microphone, host, moderator, or publish authority.",
      category: "creator_money_purchase",
      notificationType: "live_watch_party_access_ready",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Live Stage Pass active",
    };
  }
  if (productType === "live_watch_party_seat_pass") {
    return {
      body: "You're eligible for a speaking seat on this exact Live Stage. Host approval is still required before speaking, camera, or microphone.",
      category: "creator_money_purchase",
      notificationType: "live_watch_party_seat_eligible",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Live Stage Seat Pass active",
    };
  }
  if (productType === "channel_subscription") {
    return {
      body: "Platform Subscription active. This creator's ordinary Paid Videos are included while it remains active; VIP-only content is separate.",
      category: "creator_money_purchase",
      notificationType: "channel_subscription_active",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Platform Subscription active",
    };
  }
  if (productType === "vip_pass") {
    return {
      body: "Your creator-specific VIP Pass is active for 30 days, including this creator's VIP-only shelf.",
      category: "creator_money_purchase",
      notificationType: "vip_access_active",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "VIP Pass active",
    };
  }
  if (productType === "event_pass") {
    return {
      body: "You have access to this exact Event. It does not generically unlock Party Room or Live Stage.",
      category: "creator_money_purchase",
      notificationType: "event_pass_active",
      priority: 4,
      recipientUserId: buyerUserId,
      title: "Event Pass active",
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
      title: "Party Room Pass sold",
    };
  }
  if (productType === "live_watch_party_access_pass") {
    return {
      body: "Exact Live Stage viewer/listener access sold. Open Money Center Transactions for completion and hold status.",
      category: "creator_money_sale",
      notificationType: "live_watch_party_access_sold",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Live Stage Pass sold",
    };
  }
  if (productType === "live_watch_party_seat_pass") {
    return {
      body: "Live Stage Seat Pass sold. The viewer may submit a request in the exact Live Stage; payment did not create or approve a speaker request.",
      category: "creator_money_sale",
      notificationType: "live_watch_party_seat_sold",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Live Stage Seat Pass sold",
    };
  }
  if (productType === "channel_subscription") {
    return {
      body: transactionBody,
      category: "creator_money_sale",
      notificationType: "channel_subscription_started",
      priority: 4,
      recipientUserId: creatorUserId,
      title: "Platform Subscription started",
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

  await reconcileRecentExpoPushReceipts(adminClient, input.plan.recipientUserId);
  const tokens = await readPushTokens(adminClient, input.plan.recipientUserId);
  if (!tokens.length) {
    await insertMoneyNotificationDeliveryAttempt(adminClient, {
      errorCode: "no_enabled_push_token",
      notificationId: input.notificationId,
      provider: "expo",
      recipientUserId: input.plan.recipientUserId,
      status: "skipped",
    });
    return;
  }

  const iosRolloutEnabled = isIosOrdinaryPushRolloutEnabled();
  const rolloutBlockedTokens = tokens.filter((token) => token.platform === "ios" && !iosRolloutEnabled);
  for (const token of rolloutBlockedTokens) {
    await insertMoneyNotificationDeliveryAttempt(adminClient, {
      errorCode: "ios_push_rollout_disabled",
      notificationId: input.notificationId,
      provider: token.provider,
      pushTokenId: token.id,
      recipientUserId: input.plan.recipientUserId,
      status: "skipped",
    });
  }
  const deliverableTokens = tokens.filter((token) => token.platform === "android" || iosRolloutEnabled);
  if (!deliverableTokens.length) return;

  let sentCount = 0;
  for (const token of deliverableTokens) {
    const pushResult = await sendCreatorMoneyExpoPush(buildPlatformExpoPushMessage({
      androidChannelId: ANDROID_NOTIFICATION_CHANNEL_ID,
      badge: 1,
      body: input.plan.body,
      categoryId: IOS_NOTIFICATION_CATEGORIES.activity,
      data: {
        category: input.plan.category,
        deepLink: input.target.deepLink,
        notificationId: input.notificationId,
        notificationType: input.plan.notificationType,
        path: notificationRoutePath(input.target.deepLink),
        triggerType: input.plan.notificationType,
      },
      interruptionLevel: "active",
      platform: token.platform,
      priority: "high",
      sound: "default",
      title: input.plan.title,
      to: token.token,
    }));
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

const createLiveWatchPartyTerminalNotifications = async (
  adminClient: SupabaseClientLike,
  input: { buyerUserId: string; eventType: string; terminal: RevenueCatTerminalWriteResult },
) => {
  if (input.terminal.status !== "processed" || !input.terminal.purchaseIntentId
    || !input.terminal.ledgerEventId || !input.terminal.providerEventId
    || !input.terminal.productKey || !input.terminal.productType
    || !["live_watch_party_access_pass", "live_watch_party_seat_pass"].includes(input.terminal.productType)) return;
  const { data: intent } = await adminClient.from("money_purchase_intents")
    .select("creator_id,metadata,source_id,source_type")
    .eq("id", input.terminal.purchaseIntentId).maybeSingle();
  const creatorId = toText(intent?.creator_id);
  const sourceId = toText(intent?.source_id);
  const sourceType = toText(intent?.source_type);
  if (!creatorId || !sourceId || !["live_watch_party_access", "live_watch_party_seat"].includes(sourceType)) return;
  const target = await resolveCreatorMoneyNotificationTarget(adminClient, {
    creatorId, metadata: safeObject(intent?.metadata), productType: input.terminal.productType, sourceId,
  });
  if (!target) return;
  const refunded = input.eventType === "REFUND";
  const seat = input.terminal.productType === "live_watch_party_seat_pass";
  const notificationType: MoneyNotificationType = refunded ? "creator_money_refunded" : "creator_money_revoked";
  const label = seat ? "Live Stage Seat Pass" : "Live Stage Pass";
  const buyerBody = seat
    ? `${label} for this exact target was ${refunded ? "refunded" : "revoked"}. It no longer makes you eligible for a speaking seat and never guaranteed host approval or LiveKit publish authority.`
    : `${label} for this exact target was ${refunded ? "refunded" : "revoked"}. It no longer grants viewer/listener entry to this Live Stage.`;
  await createCreatorMoneyNotification(adminClient, {
    actorUserId: creatorId, dedupeEventId: input.terminal.providerEventId,
    ledgerEventId: input.terminal.ledgerEventId, productKey: input.terminal.productKey,
    sourceId, sourceType, target,
    plan: { body: buyerBody,
      category: "creator_money_purchase", notificationType, priority: 5,
      recipientUserId: input.buyerUserId, title: refunded ? `${label} refunded` : `${label} revoked` },
  });
  if (creatorId !== input.buyerUserId) await createCreatorMoneyNotification(adminClient, {
    actorUserId: input.buyerUserId, dedupeEventId: input.terminal.providerEventId,
    ledgerEventId: input.terminal.ledgerEventId, productKey: input.terminal.productKey,
    sourceId, sourceType,
    target: { deepLink: "chillywoodmobile://channel-studio?tab=monetization&focus=transactions", entityId: creatorId, route: "/channel-studio" },
    plan: { body: `${label} was ${refunded ? "refunded" : "reversed"}. Its earnings cannot become payout-ready.`,
      category: "creator_money_sale", notificationType, priority: 5,
      recipientUserId: creatorId, title: refunded ? `${label} refund recorded` : `${label} reversal recorded` },
  });
};

const writeIosConsumableFromRevenueCatEvent = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
): Promise<DynamicMoneyAccessResult> => {
  const eventType = normalizeEventType(event.type);
  const eventId = await resolveEventId(event, rawBody);
  const userId = resolveUserId(event);
  const productId = resolveProductId(event);
  if (!eventType) throw new Error("RevenueCat webhook event type is missing.");
  if (!userId) throw new Error("RevenueCat webhook app user id is missing or anonymous.");

  const environment = normalizeMoneyAccessEnvironment(event.environment);
  const providerValue = resolveCreatorMoneyProviderValue(event, eventType);
  const providerOccurredAt = toIsoFromMs(event.event_timestamp_ms);
  const inputReason = !productId
    ? UNRESOLVED_PROVIDER_PRODUCT_REASON
    : !providerOccurredAt
    ? "provider_occurred_at_missing_or_invalid"
    : providerValue.invalidReason;

  const { data, error } = await adminClient.rpc("process_revenuecat_app_store_event_atomic", {
    p_amount_minor: providerValue.amountMinor,
    p_currency: providerValue.currency,
    p_environment: environment,
    p_event_type: eventType,
    p_expires_at: toIsoFromMs(event.expiration_at_ms),
    // Active malformed input is finalized as ignored by the atomic wrapper;
    // a signed non-active event may use receipt time only to remove/retain the
    // exact previously bound authority.
    p_occurred_at: providerOccurredAt ?? new Date().toISOString(),
    p_original_transaction_id: resolveOriginalTransactionId(event),
    p_provider_event_id: eventId,
    // A signed delivery with unusable product aliases is still immutable
    // provider evidence. The atomic projector records this sentinel plus the
    // exact event/original-transaction tuple as ignored so a later corrected
    // replay cannot turn the same provider identity into authority.
    p_provider_product_id: productId ?? UNRESOLVED_PROVIDER_PRODUCT_ID,
    p_raw_payload_hash: await hashText(rawBody),
    p_user_id: userId,
    p_input_reason: inputReason,
  });
  if (error) throw new Error(`RevenueCat atomic App Store consumable transaction failed: ${error.message}`);
  const result = safeObject(data);
  const purchaseIntentId = toText(result.purchaseIntentId) || null;
  const ledgerEventId = toText(result.ledgerEventId) || null;
  const providerEventId = toText(result.providerEventId) || null;
  const resultStatus = toText(result.status) === "processed" ? "processed" : "ignored";

  if (resultStatus === "processed" && purchaseIntentId && ledgerEventId && providerEventId) {
    const { data: intent } = await adminClient
      .from("money_purchase_intents")
      .select("creator_id,metadata,source_id,source_type")
      .eq("id", purchaseIntentId)
      .maybeSingle();
    await createCreatorMoneyNotifications(adminClient, {
      buyerUserId: userId,
      creatorId: toText(intent?.creator_id) || null,
      eventType,
      ledgerEventId,
      metadata: safeObject(intent?.metadata),
      productKey: toText(result.productKey),
      productType: toText(result.productType),
      providerEventId,
      sourceId: toText(intent?.source_id) || null,
      sourceType: toText(intent?.source_type) || null,
    });
  }

  return {
    status: resultStatus,
    productKey: toText(result.productKey) || null,
    providerEventId,
    accessGrantId: toText(result.accessGrantId) || null,
    ledgerEventId,
    purchaseIntentId,
    environment: normalizeMoneyAccessEnvironment(result.environment),
    payableState: toText(result.payableState) as DynamicMoneyAccessResult["payableState"],
    grantStatus: toText(result.grantStatus) as DynamicMoneyAccessResult["grantStatus"],
    reason: toText(result.reason) || "atomic_consumable_transaction_complete",
    duplicateProviderEvent: result.duplicateProviderEvent === true,
    duplicateAccessGrant: result.duplicateAccessGrant === true,
    duplicateLedgerEvent: result.duplicateLedgerEvent === true,
  };
};

const writeLiveWatchPartyMoneyFromRevenueCatEvent = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
): Promise<DynamicMoneyAccessResult> => {
  const eventType = normalizeEventType(event.type);
  const eventId = await resolveEventId(event, rawBody);
  const userId = resolveUserId(event);
  const rawProductId = resolveProductId(event);
  const environment = normalizeMoneyAccessEnvironment(event.environment);
  const storePolicy = revenueCatStorePolicy(event);
  const googleReference = storePolicy.provider === "revenuecat_google_play"
    ? resolveGooglePlayProductReference(rawProductId)
    : null;
  const providerProductId = storePolicy.provider === "revenuecat_google_play"
    ? googleReference?.providerProductId ?? ""
    : toText(rawProductId);
  const providerValue = resolveCreatorMoneyProviderValue(event, eventType);
  if (!eventType || !userId || !providerProductId) {
    return ignoredDynamicMoneyAccess(environment, "live_watch_party_provider_identity_required");
  }
  if (storePolicy.provider !== "revenuecat_app_store" && storePolicy.provider !== "revenuecat_google_play") {
    return ignoredDynamicMoneyAccess(environment, "live_watch_party_store_identity_required");
  }
  const { data, error } = await adminClient.rpc("process_revenuecat_live_watch_party_event_atomic", {
    p_amount_minor: providerValue.amountMinor,
    p_currency: providerValue.currency,
    p_environment: environment,
    p_event_type: eventType,
    p_occurred_at: toIsoFromMs(event.event_timestamp_ms) ?? new Date().toISOString(),
    p_original_transaction_id: resolveOriginalTransactionId(event),
    p_provider: storePolicy.provider,
    p_provider_event_id: eventId,
    p_provider_product_id: providerProductId,
    p_raw_payload_hash: await hashText(rawBody),
    p_user_id: userId,
  });
  if (error) throw new Error(`RevenueCat exact Live Watch-Party transaction failed: ${error.message}`);
  const result = safeObject(data);
  const purchaseIntentId = toText(result.purchaseIntentId) || null;
  const ledgerEventId = toText(result.ledgerEventId) || null;
  const providerEventId = toText(result.providerEventId) || null;
  const status = toText(result.status) === "processed" ? "processed" : "ignored";
  if (status === "processed" && purchaseIntentId && ledgerEventId && providerEventId) {
    const { data: intent } = await adminClient.from("money_purchase_intents")
      .select("creator_id,metadata,source_id,source_type")
      .eq("id", purchaseIntentId)
      .maybeSingle();
    await createCreatorMoneyNotifications(adminClient, {
      buyerUserId: userId,
      creatorId: toText(intent?.creator_id) || null,
      eventType,
      ledgerEventId,
      metadata: safeObject(intent?.metadata),
      productKey: toText(result.productKey),
      productType: toText(result.productType),
      providerEventId,
      sourceId: toText(intent?.source_id) || null,
      sourceType: toText(intent?.source_type) || null,
    });
  }
  return {
    status,
    productKey: toText(result.productKey) || null,
    providerEventId,
    accessGrantId: toText(result.accessGrantId) || null,
    ledgerEventId,
    purchaseIntentId,
    environment,
    payableState: toText(result.payableState) as DynamicMoneyAccessResult["payableState"],
    grantStatus: toText(result.grantStatus) as DynamicMoneyAccessResult["grantStatus"],
    reason: toText(result.reason) || "exact_live_watch_party_transaction_complete",
    duplicateProviderEvent: result.duplicateProviderEvent === true,
    duplicateAccessGrant: false,
    duplicateLedgerEvent: false,
  };
};

const writeGooglePlayCreatorMoneyFromRevenueCatEvent = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
): Promise<DynamicMoneyAccessResult> => {
  const eventType = normalizeEventType(event.type);
  const eventId = await resolveEventId(event, rawBody);
  const userId = resolveUserId(event);
  const productId = resolveProductId(event);
  const environment = normalizeMoneyAccessEnvironment(event.environment);
  if (!eventType) throw new Error("RevenueCat webhook event type is missing.");
  if (!userId) throw new Error("RevenueCat webhook app user id is missing or ambiguous.");

  const storePolicy = revenueCatStorePolicy(event);
  if (
    storePolicy.provider !== "revenuecat_google_play"
    || storePolicy.platform !== "android"
    || storePolicy.store !== "google_play"
  ) {
    return ignoredDynamicMoneyAccess(environment, "google_play_store_identity_required");
  }

  const providerValue = resolveCreatorMoneyProviderValue(event, eventType);
  const providerOccurredAt = toIsoFromMs(event.event_timestamp_ms);
  const inputReason = !productId
    ? UNRESOLVED_PROVIDER_PRODUCT_REASON
    : environment !== "sandbox"
    ? "google_play_sandbox_required"
    : !providerOccurredAt
    ? "provider_occurred_at_missing_or_invalid"
    : providerValue.invalidReason;

  const { data, error } = await adminClient.rpc("process_revenuecat_google_play_event_atomic", {
    p_amount_minor: providerValue.amountMinor,
    p_currency: providerValue.currency,
    p_environment: environment,
    p_event_type: eventType,
    p_expires_at: toIsoFromMs(event.expiration_at_ms),
    // Active events with a missing provider time are ignored through
    // p_input_reason. For a signed non-active delivery, receipt time is a
    // conservative ordering fallback: the RPC must recover the exact durable
    // original-transaction binding and can only retain or remove authority.
    p_occurred_at: providerOccurredAt ?? new Date().toISOString(),
    p_original_transaction_id: resolveOriginalTransactionId(event),
    p_provider_event_id: eventId,
    p_provider_product_id: productId ?? UNRESOLVED_PROVIDER_PRODUCT_ID,
    p_raw_payload_hash: await hashText(rawBody),
    p_user_id: userId,
    p_input_reason: inputReason,
  });
  if (error) throw new Error(`RevenueCat atomic Google Play creator-money transaction failed: ${error.message}`);

  const result = safeObject(data);
  const purchaseIntentId = toText(result.purchaseIntentId) || null;
  const ledgerEventId = toText(result.ledgerEventId) || null;
  const providerEventId = toText(result.providerEventId) || null;
  const resultStatus = toText(result.status) === "processed" ? "processed" : "ignored";

  if (resultStatus === "processed" && purchaseIntentId && ledgerEventId && providerEventId) {
    const { data: intent, error: intentError } = await adminClient
      .from("money_purchase_intents")
      .select("creator_id,metadata,source_id,source_type")
      .eq("id", purchaseIntentId)
      .maybeSingle();
    if (intentError) throw new Error(`Google Play creator-money notification intent lookup failed: ${intentError.message}`);
    await createCreatorMoneyNotifications(adminClient, {
      buyerUserId: userId,
      creatorId: toText(intent?.creator_id) || null,
      eventType,
      ledgerEventId,
      metadata: safeObject(intent?.metadata),
      productKey: toText(result.productKey),
      productType: toText(result.productType),
      providerEventId,
      sourceId: toText(intent?.source_id) || null,
      sourceType: toText(intent?.source_type) || null,
    });
  }

  return {
    status: resultStatus,
    productKey: toText(result.productKey) || null,
    providerEventId,
    accessGrantId: toText(result.accessGrantId) || null,
    ledgerEventId,
    purchaseIntentId,
    environment: normalizeMoneyAccessEnvironment(result.environment),
    payableState: toText(result.payableState) as DynamicMoneyAccessResult["payableState"],
    grantStatus: toText(result.grantStatus) as DynamicMoneyAccessResult["grantStatus"],
    reason: toText(result.reason) || "atomic_google_play_creator_money_transaction_complete",
    duplicateProviderEvent: result.duplicateProviderEvent === true,
    duplicateAccessGrant: result.duplicateAccessGrant === true,
    duplicateLedgerEvent: result.duplicateLedgerEvent === true,
  };
};

const writeRevenueCatTerminalEventFromRevenueCatEvent = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
): Promise<RevenueCatTerminalWriteResult> => {
  const eventType = normalizeEventType(event.type);
  const eventId = await resolveEventId(event, rawBody);
  const userId = resolveUserId(event);
  const originalTransactionId = resolveOriginalTransactionId(event);
  const productId = resolveProductId(event);
  const storePolicy = revenueCatStorePolicy(event);
  if (!TERMINAL_DISPATCH_EVENT_TYPES.has(eventType)) {
    throw new Error("RevenueCat terminal dispatcher event type is invalid.");
  }
  if (!userId) throw new Error("RevenueCat webhook app user id is missing or ambiguous.");
  if (!originalTransactionId) {
    throw new Error("RevenueCat terminal dispatcher original transaction id is missing or ambiguous.");
  }
  if (storePolicy.provider !== "revenuecat_app_store" && storePolicy.provider !== "revenuecat_google_play") {
    throw new Error("RevenueCat terminal dispatcher store identity is unsupported.");
  }

  const googleReference = storePolicy.provider === "revenuecat_google_play"
    ? resolveGooglePlayProductReference(productId)
    : null;
  const reportedProviderProductId = storePolicy.provider === "revenuecat_google_play"
    ? googleReference?.providerProductId ?? null
    : productId;
  const reportedProviderBasePlanId = storePolicy.provider === "revenuecat_google_play"
    ? googleReference?.providerBasePlanId ?? null
    : null;
  const providerOccurredAt = toIsoFromMs(event.event_timestamp_ms);
  const { data, error } = await adminClient.rpc("process_revenuecat_terminal_event_atomic", {
    p_entitlement_status: resolveEntitlementStatus(event),
    p_environment: normalizeMoneyAccessEnvironment(event.environment),
    p_event_type: eventType,
    p_expires_at: toIsoFromMs(event.expiration_at_ms),
    p_occurred_at: providerOccurredAt ?? new Date().toISOString(),
    p_original_transaction_id: originalTransactionId,
    p_period_type: providerText(event.period_type) || null,
    p_platform: storePolicy.platform,
    p_provider: storePolicy.provider,
    p_provider_event_id: eventId,
    p_raw_payload_hash: await hashText(rawBody),
    p_reported_provider_base_plan_id: reportedProviderBasePlanId,
    p_reported_provider_product_id: reportedProviderProductId,
    p_starts_at: toIsoFromMs(event.purchased_at_ms),
    p_store: storePolicy.store,
    p_user_id: userId,
  });
  if (error) throw new Error(`RevenueCat atomic terminal dispatch failed: ${error.message}`);

  const result = safeObject(data);
  const domain = toText(result.domain) as RevenueCatTerminalDomain;
  if (!["premium", "creator_money", "missing", "ambiguous"].includes(domain)) {
    throw new Error("RevenueCat atomic terminal dispatch returned an invalid authority domain.");
  }
  const duplicateEvent = result.duplicateEvent === true || result.duplicateProviderEvent === true;
  const ignored = toText(result.status) === "ignored" || domain === "missing" || domain === "ambiguous";
  const status = ignored ? "ignored" : duplicateEvent ? "duplicate_ignored" : "processed";
  const authorityGranted = result.authorityGranted === true;
  const entitlementActive = result.entitlementActive === true;
  if (authorityGranted && (domain !== "premium" || !entitlementActive
    || (eventType !== "CANCELLATION" && eventType !== "BILLING_ISSUE"))) {
    throw new Error("RevenueCat atomic terminal dispatch returned incoherent retained authority.");
  }
  return {
    status,
    reason: toText(result.reason) || "terminal_dispatch_complete",
    domain,
    providerEventId: toText(result.providerEventId) || null,
    originalTransactionId,
    duplicateEvent,
    authorityGranted,
    entitlementStatus: toText(result.entitlementStatus) || null,
    entitlementActive,
    grantStatus: toText(result.grantStatus) || null,
    ledgerEventId: toText(result.ledgerEventId) || null,
    productKey: toText(result.productKey) || null,
    productType: toText(result.productType) || null,
    purchaseIntentId: toText(result.purchaseIntentId) || null,
  };
};

const inspectRevenueCatTerminalEnvelope = (event: RevenueCatEvent) => {
  const reasons: string[] = [];
  if (event[INVALID_REVENUECAT_PAYLOAD_MARKER] === true) {
    return {
      eventType: "UNKNOWN",
      reportedEventType: null,
      providerEventId: null,
      userId: null,
      originalTransactionId: null,
      provider: "revenuecat" as const,
      environment: null,
      transferTargetUserId: null,
      occurredAt: null,
      reasonDetails: ["payload_missing_or_invalid"],
      reason: "terminal_identity_invalid:payload_missing_or_invalid",
    };
  }
  const reportedEventType = normalizeEventType(event.type);
  if (
    reportedEventType === "TEST"
    || ACTIVE_EVENT_TYPES.has(reportedEventType)
  ) return null;

  if (reportedEventType === "TRANSFER") {
    const id = providerText(event.id);
    const eventIdAlias = providerText(event.event_id);
    const invalidEventAlias = (providerAliasPresent(event, "id") && !id)
      || (providerAliasPresent(event, "event_id") && !eventIdAlias);
    const conflictingEventAlias = !!id && !!eventIdAlias && id !== eventIdAlias;
    const providerEventId = invalidEventAlias || conflictingEventAlias ? null : id || eventIdAlias || null;
    if (!providerEventId) reasons.push(conflictingEventAlias ? "event_id_conflicting" : "event_id_missing_or_invalid");

    const sourceUserId = resolveRevenueCatTransferUserId(event.transferred_from);
    const targetUserId = resolveRevenueCatTransferUserId(event.transferred_to);
    if (!sourceUserId) reasons.push("transfer_source_identity_missing_or_ambiguous");
    if (!targetUserId || targetUserId === sourceUserId) {
      reasons.push("transfer_target_identity_missing_or_ambiguous");
    }

    const eventTime = toIsoFromMs(event.event_timestamp_ms);
    const transferredTime = toIsoFromMs(event.transferred_at_ms);
    const invalidEventTime = providerAliasPresent(event, "event_timestamp_ms") && !eventTime;
    const invalidTransferredTime = providerAliasPresent(event, "transferred_at_ms") && !transferredTime;
    const conflictingTime = !!eventTime && !!transferredTime && eventTime !== transferredTime;
    const occurredAt = invalidEventTime || invalidTransferredTime || conflictingTime
      ? null
      : eventTime || transferredTime;
    if (!occurredAt) reasons.push(conflictingTime
      ? "transfer_time_conflicting"
      : "transfer_time_missing_or_invalid");

    const storePolicy = revenueCatStorePolicy(event);
    const rawEnvironment = providerText(event.environment).toLowerCase();
    const environment = rawEnvironment === "sandbox" || rawEnvironment === "production"
      ? rawEnvironment
      : null;
    const exactTransferStore = storePolicy.provider === "revenuecat_app_store"
      && storePolicy.rawStore === "APP_STORE";
    const provider = storePolicy.provider === "revenuecat_app_store"
      || storePolicy.provider === "revenuecat_google_play"
      ? storePolicy.provider
      : "revenuecat";
    if (!exactTransferStore) reasons.push("transfer_store_identity_missing_or_unsupported");
    if (!environment || rawEnvironment !== "sandbox") {
      reasons.push("transfer_environment_missing_or_invalid");
    }

    return {
      eventType: "TRANSFER",
      reportedEventType,
      providerEventId,
      userId: sourceUserId,
      originalTransactionId: null,
      provider,
      environment,
      transferTargetUserId: targetUserId,
      occurredAt,
      reasonDetails: reasons,
      reason: reasons.length === 1
        ? `terminal_identity_invalid:${reasons[0]}`
        : reasons.length > 1
        ? "terminal_identity_multiple_invalid"
        : null,
    };
  }

  const eventType = TERMINAL_DISPATCH_EVENT_TYPES.has(reportedEventType) ? reportedEventType : "UNKNOWN";
  if (eventType === "UNKNOWN") reasons.push("event_type_missing_or_unsupported");
  const id = providerText(event.id);
  const eventIdAlias = providerText(event.event_id);
  const invalidEventAlias = (providerAliasPresent(event, "id") && !id)
    || (providerAliasPresent(event, "event_id") && !eventIdAlias);
  const conflictingEventAlias = !!id && !!eventIdAlias && id !== eventIdAlias;
  const providerEventId = invalidEventAlias || conflictingEventAlias ? null : id || eventIdAlias || null;
  if (!providerEventId) reasons.push(conflictingEventAlias ? "event_id_conflicting" : "event_id_missing_or_invalid");

  const snakeUserId = providerText(event.app_user_id);
  const camelUserId = providerText(event.appUserId);
  const invalidUserAlias = (providerAliasPresent(event, "app_user_id") && !snakeUserId)
    || (providerAliasPresent(event, "appUserId") && !camelUserId);
  const conflictingUserAlias = !!snakeUserId && !!camelUserId && snakeUserId !== camelUserId;
  const rawUserId = invalidUserAlias || conflictingUserAlias
    ? null
    : snakeUserId || camelUserId || null;
  const userId = rawUserId && PROVIDER_UUID_PATTERN.test(rawUserId) && !rawUserId.startsWith("$RCAnonymousID:")
    ? rawUserId
    : null;
  if (!userId) reasons.push(conflictingUserAlias
    ? "user_id_conflicting"
    : "user_id_missing_or_invalid");

  const snakeOriginal = providerText(event.original_transaction_id);
  const camelOriginal = providerText(event.originalTransactionId);
  const invalidOriginalAlias = (providerAliasPresent(event, "original_transaction_id") && !snakeOriginal)
    || (providerAliasPresent(event, "originalTransactionId") && !camelOriginal);
  const conflictingOriginalAlias = !!snakeOriginal && !!camelOriginal && snakeOriginal !== camelOriginal;
  const originalTransactionId = invalidOriginalAlias || conflictingOriginalAlias
    ? null
    : snakeOriginal || camelOriginal || null;
  if (!originalTransactionId) reasons.push(conflictingOriginalAlias
    ? "original_transaction_id_conflicting"
    : "original_transaction_id_missing_or_invalid");

  const storePolicy = revenueCatStorePolicy(event);
  const provider = storePolicy.provider === "revenuecat_app_store" || storePolicy.provider === "revenuecat_google_play"
    ? storePolicy.provider
    : "revenuecat";
  if (provider === "revenuecat") reasons.push("store_identity_missing_or_unsupported");

  const rawEnvironment = providerText(event.environment).toLowerCase();
  const environment = rawEnvironment === "sandbox" || rawEnvironment === "production" ? rawEnvironment : null;
  if (!environment) reasons.push("environment_missing_or_invalid");

  return {
    eventType,
    reportedEventType: reportedEventType || null,
    providerEventId,
    userId,
    originalTransactionId,
    provider,
    environment,
    transferTargetUserId: null,
    occurredAt: null,
    reasonDetails: reasons,
    reason: reasons.length === 1
      ? `terminal_identity_invalid:${reasons[0]}`
      : reasons.length > 1
      ? "terminal_identity_multiple_invalid"
      : null,
  };
};

const quarantineRevenueCatTerminalAuthority = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
  envelope: NonNullable<ReturnType<typeof inspectRevenueCatTerminalEnvelope>>,
): Promise<RevenueCatTerminalQuarantineResult> => {
  if (!envelope.reason) throw new Error("RevenueCat terminal quarantine requires malformed authority identity.");
  const { data, error } = await adminClient.rpc("quarantine_revenuecat_terminal_authority", {
    p_environment: envelope.environment,
    p_event_type: envelope.eventType,
    p_provider: envelope.provider,
    p_provider_event_id: envelope.providerEventId,
    p_raw_payload_hash: await hashText(rawBody),
    p_reason: envelope.reason,
    p_user_id: envelope.userId,
  });
  if (error) throw new Error(`RevenueCat terminal authority quarantine failed: ${error.message}`);
  const result = safeObject(data);
  const quarantineId = providerText(result.quarantineId);
  const scope = providerText(result.scope);
  if (
    toText(result.status) !== "quarantined"
    || !PROVIDER_UUID_PATTERN.test(quarantineId)
    || typeof result.duplicateEvent !== "boolean"
    || result.authorityGranted !== false
    || !scope
  ) throw new Error("RevenueCat terminal authority quarantine returned an invalid result.");
  return {
    status: "quarantined",
    quarantineId,
    duplicateEvent: result.duplicateEvent,
    authorityGranted: false,
    scope,
  };
};

const reserveRevenueCatWebhookIngress = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
) => {
  const eventId = await resolveEventId(event, rawBody);
  const rawPayloadHash = await hashText(rawBody);
  const { data, error } = await adminClient.rpc("reserve_revenuecat_webhook_ingress_event", {
    p_provider_event_id: eventId,
    p_raw_payload_hash: rawPayloadHash,
  });
  if (error) throw new Error(`RevenueCat webhook ingress reservation failed: ${error.message}`);
  const result = safeObject(data);
  if (
    (toText(result.status) !== "reserved" && toText(result.status) !== "duplicate")
    || toText(result.providerEventId) !== eventId
    || typeof result.duplicateEvent !== "boolean"
    || result.authorityGranted !== false
  ) {
    throw new Error("RevenueCat webhook ingress reservation returned an invalid result.");
  }
  return { eventId, rawPayloadHash, duplicateEvent: result.duplicateEvent };
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
  const originalTransactionId = resolveOriginalTransactionId(event);
  const environment = toText(event.environment) || null;
  const expiresAt = toIsoFromMs(event.expiration_at_ms);
  const startsAt = toIsoFromMs(event.purchased_at_ms);
  const providerOccurredAt = toIsoFromMs(event.event_timestamp_ms);
  const status = resolveEntitlementStatus(event);
  const rawEventHash = await hashText(rawBody);

  if (!eventType) throw new Error("RevenueCat webhook event type is missing.");
  if (!userId) throw new Error("RevenueCat webhook app user id is missing or anonymous.");
  if (!hasPremiumSignal(event)) throw new Error("RevenueCat webhook event is not mapped to Premium.");
  const writeContext = { status, eventType, eventId, userId, productId, environment, expiresAt };
  const ignoredPremiumWrite = (reason: string): EntitlementWriteResult => ({
    ...writeContext,
    applied: false,
    entitlementActive: false,
    ignoredEvent: true,
    ignoreReason: reason,
    duplicateEvent: false,
    staleEvent: false,
    moneyAccess: {
      productKey: null, providerEventId: null, accessGrantId: null, ledgerEventId: null,
      environment: normalizeMoneyAccessEnvironment(environment),
      payableState: "not_payable", grantStatus: "blocked",
      duplicateAccessGrant: false, duplicateLedgerEvent: false,
    },
  });
  const authorityActive = isActiveEntitlementStatus(status);
  const storePolicy = revenueCatStorePolicy(event);
  if (storePolicy.provider !== "revenuecat_app_store" && storePolicy.provider !== "revenuecat_google_play") {
    return ignoredPremiumWrite("provider_store_identity_missing_or_unsupported");
  }
  const googleProductReference = storePolicy.provider === "revenuecat_google_play"
    ? resolveGooglePlayProductReference(productId)
    : null;
  const rawProductIdentityUsable = !!productId
    && (storePolicy.provider !== "revenuecat_google_play" || !!googleProductReference);
  const providerProductIdentity = rawProductIdentityUsable && productId
    ? productId
    : UNRESOLVED_PROVIDER_PRODUCT_ID;
  const providerValue = resolvePremiumProviderValue(event, status);

  const productResolution = rawProductIdentityUsable
    ? await readStoreProductResolution(adminClient, { event, productId: providerProductIdentity })
    : {
      mapping: null,
      product: null,
      providerProductId: UNRESOLVED_PROVIDER_PRODUCT_ID,
      storePolicy,
    };
  const productIdentityResolved = rawProductIdentityUsable
    && hasExactPremiumStoreProductIdentity(productResolution, providerProductIdentity);
  const resolvedProductId = productIdentityResolved ? toText(productResolution.product?.id) || null : null;
  const resolvedStoreMappingId = productIdentityResolved
    ? toText(productResolution.mapping?.id) || null
    : null;
  const resolvedProviderProductId = productIdentityResolved
    ? productResolution.providerProductId
    : !rawProductIdentityUsable
    ? UNRESOLVED_PROVIDER_PRODUCT_ID
    : storePolicy.provider === "revenuecat_google_play"
    ? googleProductReference?.providerProductId ?? ""
    : productId;
  const resolvedProviderBasePlanId = productIdentityResolved
    ? storePolicy.provider === "revenuecat_google_play"
      ? providerText(productResolution.product?.provider_base_plan_id) || null
      : providerText(productResolution.mapping?.provider_base_plan_id) || null
    : googleProductReference?.providerBasePlanId ?? null;

  const { data, error } = await adminClient.rpc("process_revenuecat_premium_event_atomic", {
    p_amount_minor: providerValue.amountMinor,
    p_currency: providerValue.currency,
    p_entitlement_status: status,
    p_environment: normalizeMoneyAccessEnvironment(environment),
    p_event_type: eventType,
    p_expires_at: expiresAt,
    // Exact active authority requires provider time. A verified non-active
    // lifecycle delivery may use receipt time only to conservatively remove or
    // retain finite authority through the ordered database projector.
    p_occurred_at: authorityActive ? providerOccurredAt : providerOccurredAt ?? new Date().toISOString(),
    p_original_transaction_id: originalTransactionId,
    p_period_type: toText(event.period_type) || null,
    p_platform: storePolicy.platform,
    p_product_id: resolvedProductId,
    p_provider: storePolicy.provider,
    p_provider_base_plan_id: resolvedProviderBasePlanId,
    p_provider_event_id: eventId,
    p_provider_product_id: resolvedProviderProductId,
    p_raw_payload_hash: rawEventHash,
    p_starts_at: startsAt,
    p_store: storePolicy.store,
    p_store_mapping_id: resolvedStoreMappingId,
    p_user_id: userId,
  });
  if (error && isRevenueCatStaleEventError(error)) {
    return {
      ...writeContext,
      applied: false,
      entitlementActive: null,
      ignoredEvent: false,
      ignoreReason: null,
      duplicateEvent: false,
      staleEvent: true,
      moneyAccess: {
        productKey: null, providerEventId: null, accessGrantId: null, ledgerEventId: null,
        environment: normalizeMoneyAccessEnvironment(environment),
        payableState: "not_payable", grantStatus: "blocked",
        duplicateAccessGrant: false, duplicateLedgerEvent: false,
      },
    };
  }
  if (error) throw new Error(`RevenueCat atomic Premium transaction failed: ${error.message}`);
  const result = safeObject(data);
  const ignoredEvent = toText(result.status) === "ignored";
  const entitlementActive = result.entitlementActive === true;
  const duplicateEvent = result.duplicateEvent === true;
  const moneyAccess: MoneyAccessMirrorResult = {
    productKey: toText(result.productKey) || null,
    providerEventId: toText(result.providerEventId) || null,
    accessGrantId: toText(result.accessGrantId) || null,
    ledgerEventId: toText(result.ledgerEventId) || null,
    environment: normalizeMoneyAccessEnvironment(result.environment || environment),
    payableState: (toText(result.payableState) || "not_payable") as MoneyAccessMirrorResult["payableState"],
    grantStatus: (toText(result.grantStatus) || "blocked") as MoneyAccessMirrorResult["grantStatus"],
    duplicateAccessGrant: result.duplicateAccessGrant === true,
    duplicateLedgerEvent: result.duplicateLedgerEvent === true,
  };

  return {
    ...writeContext,
    applied: !duplicateEvent && !ignoredEvent,
    entitlementActive,
    ignoredEvent,
    ignoreReason: ignoredEvent ? toText(result.reason) || "premium_provider_input_ignored" : null,
    duplicateEvent,
    staleEvent: false,
    moneyAccess,
  };
};

const writePremiumTransferFromRevenueCatEvent = async (
  adminClient: SupabaseClientLike,
  event: RevenueCatEvent,
  rawBody: string,
): Promise<PremiumTransferWriteResult> => {
  const eventType = normalizeEventType(event.type);
  const environment = normalizeMoneyAccessEnvironment(event.environment);
  const storePolicy = revenueCatStorePolicy(event);
  const transferUsers = resolveRevenueCatTransferUsers(event);
  if (eventType !== "TRANSFER") throw new Error("RevenueCat transfer event type is invalid.");
  if (!isVerifiedRevenueCatTransferPolicy(storePolicy, environment)) {
    throw new Error("RevenueCat transfer is limited to verified sandbox App Store events.");
  }
  if (!transferUsers) throw new Error("RevenueCat transfer identities are invalid.");

  const { data, error } = await adminClient.rpc("process_revenuecat_premium_transfer_atomic", {
    p_environment: environment,
    p_occurred_at: toIsoFromMs(event.event_timestamp_ms || event.transferred_at_ms),
    p_provider_event_id: await resolveEventId(event, rawBody),
    p_raw_payload_hash: await hashText(rawBody),
    p_source_user_id: transferUsers.sourceUserId,
    p_target_user_id: transferUsers.targetUserId,
  });
  if (error) throw new Error(`RevenueCat atomic Premium transfer failed: ${error.message}`);

  const result = safeObject(data);
  const duplicateEvent = result.duplicateEvent === true;
  const ignoredEvent = toText(result.status) === "ignored";
  return {
    status: ignoredEvent ? "ignored" : duplicateEvent ? "duplicate_ignored" : "processed",
    reason: toText(result.reason) || null,
    duplicateEvent,
    sourceRevoked: result.sourceRevoked === true,
    targetActive: result.targetActive === true,
    environment: "sandbox",
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
      // A verified delivery cannot be acknowledged while durable provider
      // evidence is unavailable. In particular, acknowledging a terminal
      // event here could strand already-granted authority with no revocation
      // record. Ask RevenueCat to retry; no authority is granted locally.
      return jsonResponse(503, {
        status: "backend_unavailable",
        provider: "revenuecat",
        capability: "premium_entitlement",
        signatureVerified: true,
        webhookProcessed: false,
        premiumGranted: false,
        retryable: true,
        liveMoneyAction: false,
        message: "RevenueCat webhook was verified but durable entitlement processing is temporarily unavailable.",
      });
    }

    const event = extractRevenueCatEvent(rawBody);
    const terminalEnvelope = inspectRevenueCatTerminalEnvelope(event);
    if (terminalEnvelope?.reason) {
      // Malformed signed terminal deliveries are authority-removal evidence,
      // not ordinary ignored input. Quarantine before exact ingress reservation
      // so missing/conflicting event identity cannot strand existing paid state.
      const quarantine = await quarantineRevenueCatTerminalAuthority(
        adminConfig.client,
        event,
        rawBody,
        terminalEnvelope,
      );
      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "revenuecat",
        capability: "paid_authority_terminal_quarantine",
        action: "revenuecat_terminal_authority_quarantined",
        statusAfter: "blocked",
        reason: `Verified terminal provider input was quarantined fail-closed: ${terminalEnvelope.reason}.`,
        proofSource: FUNCTION_NAME,
        metadata: {
          revenuecat_event_hash: await hashText(rawBody),
          revenuecat_event_type: terminalEnvelope.eventType,
          revenuecat_reported_event_type: terminalEnvelope.reportedEventType,
          provider: terminalEnvelope.provider,
          provider_event_id_present: !!terminalEnvelope.providerEventId,
          user_id_present: !!terminalEnvelope.userId,
          original_transaction_id_present: !!terminalEnvelope.originalTransactionId,
          transfer_target_user_id_present: !!terminalEnvelope.transferTargetUserId,
          transfer_occurred_at_present: !!terminalEnvelope.occurredAt,
          environment: terminalEnvelope.environment,
          quarantine_reasons: terminalEnvelope.reasonDetails,
          quarantine_id: quarantine.quarantineId,
          quarantine_scope: quarantine.scope,
          duplicate_event: quarantine.duplicateEvent,
          authority_granted: false,
          raw_provider_payload_stored: false,
          live_money_action: false,
        },
      });
      return jsonResponse(200, {
        status: quarantine.status,
        provider: terminalEnvelope.provider,
        capability: "paid_authority_terminal_quarantine",
        signatureVerified: true,
        webhookProcessed: true,
        authorityQuarantined: true,
        authorityGranted: false,
        premiumGranted: false,
        duplicateEvent: quarantine.duplicateEvent,
        quarantineScope: quarantine.scope,
        reason: terminalEnvelope.reason,
        liveMoneyAction: false,
        message: "Malformed terminal provider authority was quarantined and existing paid authority now fails closed.",
      });
    }
    // Reserve immutable signed bytes before TEST/store/product/domain routing.
    // An exact retry may continue to the idempotent atomic projector, while the
    // same provider event id with changed payload bytes is permanently denied.
    try {
      await reserveRevenueCatWebhookIngress(adminConfig.client, event, rawBody);
    } catch (error) {
      const ingressError = sanitizeErrorMessage(error);
      if (
        terminalEnvelope
        && /revenuecat_webhook_ingress_identity_mismatch/i.test(ingressError)
      ) {
        // A terminal delivery which reuses an already-reserved provider event
        // id with different signed bytes cannot overwrite ingress evidence or
        // be projected to a guessed transaction. Quarantine its narrow exact
        // subject/provider/environment scope; the changed bytes remain sticky
        // blocked rather than being acknowledged as an ordinary replay error.
        const collisionEnvelope = {
          ...terminalEnvelope,
          reasonDetails: ["event_payload_identity_mismatch"],
          reason: "terminal_identity_invalid:event_payload_identity_mismatch",
        };
        const quarantine = await quarantineRevenueCatTerminalAuthority(
          adminConfig.client,
          event,
          rawBody,
          collisionEnvelope,
        );
        await writeProviderReadinessAudit(adminConfig.client, {
          provider: "revenuecat",
          capability: "paid_authority_terminal_quarantine",
          action: "revenuecat_terminal_ingress_collision_quarantined",
          statusAfter: "blocked",
          reason: "A signed terminal event reused an immutable provider event id with changed bytes and was quarantined fail-closed.",
          proofSource: FUNCTION_NAME,
          metadata: {
            revenuecat_event_hash: await hashText(rawBody),
            revenuecat_event_type: collisionEnvelope.eventType,
            provider: collisionEnvelope.provider,
            provider_event_id_present: !!collisionEnvelope.providerEventId,
            user_id_present: !!collisionEnvelope.userId,
            environment: collisionEnvelope.environment,
            quarantine_reasons: collisionEnvelope.reasonDetails,
            quarantine_id: quarantine.quarantineId,
            quarantine_scope: quarantine.scope,
            duplicate_event: quarantine.duplicateEvent,
            ingress_identity_overwritten: false,
            authority_granted: false,
            raw_provider_payload_stored: false,
            live_money_action: false,
          },
        });
        return jsonResponse(200, {
          status: quarantine.status,
          provider: collisionEnvelope.provider,
          capability: "paid_authority_terminal_quarantine",
          signatureVerified: true,
          webhookProcessed: true,
          authorityQuarantined: true,
          authorityGranted: false,
          premiumGranted: false,
          duplicateEvent: quarantine.duplicateEvent,
          quarantineScope: quarantine.scope,
          reason: collisionEnvelope.reason,
          ingressIdentityOverwritten: false,
          liveMoneyAction: false,
          message: "Conflicting terminal provider bytes were quarantined without overwriting immutable ingress evidence.",
        });
      }
      throw error;
    }
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

    const storePolicy = revenueCatStorePolicy(event);
    if (normalizeEventType(event.type) === "TRANSFER") {
      const transferWrite = await writePremiumTransferFromRevenueCatEvent(adminConfig.client, event, rawBody);
      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "revenuecat",
        capability: "premium_entitlement",
        action: transferWrite.status === "ignored"
          ? "revenuecat_webhook_transfer_ignored"
          : transferWrite.duplicateEvent
          ? "revenuecat_webhook_transfer_duplicate_ignored"
          : "revenuecat_webhook_entitlement_transferred",
        statusAfter: transferWrite.targetActive ? "sandbox_ready" : "blocked",
        reason: transferWrite.status === "ignored"
          ? `RevenueCat verified and durably ignored a sandbox App Store transfer: ${transferWrite.reason ?? "transfer_not_authoritative"}.`
          : "RevenueCat verified a sandbox App Store entitlement transfer; the backend atomically revoked the source grant and activated the destination grant.",
        proofSource: FUNCTION_NAME,
        metadata: {
          revenuecat_event_hash: await hashText(rawBody),
          revenuecat_event_id_hash: await hashText(await resolveEventId(event, rawBody)),
          revenuecat_event_type: "TRANSFER",
          environment: transferWrite.environment,
          source_revoked: transferWrite.sourceRevoked,
          target_active: transferWrite.targetActive,
          duplicate_event: transferWrite.duplicateEvent,
          raw_provider_payload_stored: false,
          premium_granted: transferWrite.targetActive,
          live_money_action: false,
        },
      });

      return jsonResponse(200, {
        status: transferWrite.status,
        provider: "revenuecat_app_store",
        capability: "premium_entitlement",
        signatureVerified: true,
        webhookProcessed: transferWrite.status !== "ignored",
        premiumGranted: transferWrite.targetActive,
        sourceRevoked: transferWrite.sourceRevoked,
        duplicateEvent: transferWrite.duplicateEvent,
        reason: transferWrite.reason,
        moneyAccessEnvironment: transferWrite.environment,
        liveMoneyAction: false,
        message: transferWrite.status === "ignored"
          ? "RevenueCat Premium transfer was durably ignored without changing entitlement authority."
          : transferWrite.duplicateEvent
          ? "RevenueCat Premium transfer was already reconciled."
          : "RevenueCat Premium transfer was reconciled atomically.",
        });
      }

      const terminalEventType = normalizeEventType(event.type);
      const terminalOriginalTransactionId = resolveOriginalTransactionId(event);
      if (
        TERMINAL_DISPATCH_EVENT_TYPES.has(terminalEventType)
        && terminalOriginalTransactionId
        && (storePolicy.provider === "revenuecat_app_store" || storePolicy.provider === "revenuecat_google_play")
      ) {
        // Product and entitlement fields can be omitted or stale on removal
        // deliveries. The service-only atomic dispatcher chooses exactly one
        // durable Premium-versus-creator binding by provider+original+subject;
        // the Edge layer never performs a TOCTOU-prone authority lookup.
        const terminalWrite = await writeRevenueCatTerminalEventFromRevenueCatEvent(
          adminConfig.client,
          event,
          rawBody,
        );
        await createLiveWatchPartyTerminalNotifications(adminConfig.client, {
          buyerUserId: resolveUserId(event), eventType: terminalEventType, terminal: terminalWrite,
        });
        const capability = terminalWrite.domain === "premium"
          ? "premium_entitlement"
          : "digital_access_sandbox";
        await writeProviderReadinessAudit(adminConfig.client, {
          provider: "revenuecat",
          capability,
          action: terminalWrite.status === "processed"
            ? "revenuecat_webhook_terminal_reconciled"
            : terminalWrite.status === "duplicate_ignored"
            ? "revenuecat_webhook_terminal_duplicate_ignored"
            : "revenuecat_webhook_terminal_ignored",
          statusAfter: terminalWrite.entitlementActive ? "sandbox_ready" : "blocked",
          reason: `RevenueCat terminal lifecycle delivery was atomically dispatched to ${terminalWrite.domain}: ${terminalWrite.reason}.`,
          proofSource: FUNCTION_NAME,
          metadata: {
            revenuecat_event_hash: await hashText(rawBody),
            revenuecat_event_type: terminalEventType,
            revenuecat_event_id_hash: await hashText(await resolveEventId(event, rawBody)),
            original_transaction_id_hash: await hashText(terminalOriginalTransactionId),
            authority_domain: terminalWrite.domain,
            authority_granted: terminalWrite.authorityGranted,
            entitlement_active: terminalWrite.entitlementActive,
            grant_status: terminalWrite.grantStatus,
            duplicate_event: terminalWrite.duplicateEvent,
            raw_provider_payload_stored: false,
            live_money_action: false,
          },
        });

        return jsonResponse(200, {
          status: terminalWrite.status,
          provider: storePolicy.provider,
          capability,
          signatureVerified: true,
          webhookProcessed: terminalWrite.status === "processed",
          authorityDomain: terminalWrite.domain,
          authorityGranted: terminalWrite.authorityGranted,
          premiumGranted: terminalWrite.domain === "premium" && terminalWrite.entitlementActive,
          entitlementStatus: terminalWrite.entitlementStatus,
          accessRetained: terminalWrite.grantStatus === "active" || terminalWrite.grantStatus === "sandbox_only",
          duplicateEvent: terminalWrite.duplicateEvent,
          reason: terminalWrite.reason,
          liveMoneyAction: false,
          message: terminalWrite.status === "processed"
            ? "RevenueCat terminal lifecycle authority was reconciled atomically."
            : "RevenueCat terminal lifecycle delivery was durably ignored without granting new authority.",
        });
      }

      if (!hasPremiumSignal(event)) {
      const eventType = normalizeEventType(event.type);
      const eventId = await resolveEventId(event, rawBody);
      const userId = resolveUserId(event);
      const productId = resolveProductId(event);
      if (!eventType) throw new Error("RevenueCat webhook event type is missing.");
      if (!userId) throw new Error("RevenueCat webhook app user id is missing or anonymous.");

      const productResolution = productId
        ? await readStoreProductResolution(adminConfig.client, { event, productId })
        : null;
      const resolvedProductType = toText(productResolution?.product?.product_type);
      const isExactLiveWatchPartyProduct = resolvedProductType === "live_watch_party_access_pass"
        || resolvedProductType === "live_watch_party_seat_pass";

      const dynamicWrite = isExactLiveWatchPartyProduct
        ? await writeLiveWatchPartyMoneyFromRevenueCatEvent(adminConfig.client, event, rawBody)
        : storePolicy.provider === "revenuecat_app_store"
        ? await writeIosConsumableFromRevenueCatEvent(adminConfig.client, event, rawBody)
        : storePolicy.provider === "revenuecat_google_play"
        ? await writeGooglePlayCreatorMoneyFromRevenueCatEvent(adminConfig.client, event, rawBody)
        : ignoredDynamicMoneyAccess(
          normalizeMoneyAccessEnvironment(event.environment),
          "supported_store_identity_required",
        );

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
        provider: storePolicy.provider,
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
        action: entitlementWrite.staleEvent ? "revenuecat_webhook_stale_event_ignored"
          : entitlementWrite.ignoredEvent ? "revenuecat_webhook_invalid_authority_ignored"
          : entitlementWrite.duplicateEvent ? "revenuecat_webhook_duplicate_ignored"
          : "revenuecat_webhook_entitlement_synced",
        statusAfter: entitlementWrite.entitlementActive ? "sandbox_ready"
          : entitlementWrite.ignoredEvent ? "blocked" : "configured",
        reason: entitlementWrite.staleEvent
          ? "RevenueCat webhook verified an older provider event and left the newer backend Premium authority unchanged."
          : entitlementWrite.ignoredEvent
          ? `RevenueCat Premium authority was ignored fail-closed: ${entitlementWrite.ignoreReason ?? "invalid_provider_authority"}.`
          : "RevenueCat webhook verified a provider event and reconciled the backend Premium entitlement row.",
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
          entitlement_applied: entitlementWrite.applied,
          ignored_event: entitlementWrite.ignoredEvent,
          ignore_reason: entitlementWrite.ignoreReason,
          stale_event: entitlementWrite.staleEvent,
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
      status: entitlementWrite.staleEvent ? "stale_ignored"
        : entitlementWrite.ignoredEvent ? "ignored"
        : entitlementWrite.duplicateEvent ? "duplicate_ignored" : "processed",
      provider: storePolicy.provider,
      capability: "premium_entitlement",
      signatureVerified: true,
      webhookProcessed: !entitlementWrite.ignoredEvent,
      premiumGranted: entitlementWrite.entitlementActive === true,
      entitlementStatus: entitlementWrite.staleEvent || entitlementWrite.ignoredEvent ? null : entitlementWrite.status,
      entitlementKey: PREMIUM_ENTITLEMENT_KEY,
      entitlementApplied: entitlementWrite.applied,
      entitlementUnchanged: entitlementWrite.staleEvent || entitlementWrite.ignoredEvent,
      ignoredEvent: entitlementWrite.ignoredEvent,
      ignoreReason: entitlementWrite.ignoreReason,
      staleEvent: entitlementWrite.staleEvent,
      duplicateEvent: entitlementWrite.duplicateEvent,
      moneyAccessMirrored: !entitlementWrite.staleEvent && !entitlementWrite.ignoredEvent,
      moneyAccessEnvironment: entitlementWrite.moneyAccess.environment,
      moneyAccessPayableState: entitlementWrite.moneyAccess.payableState,
      liveMoneyAction: false,
      message: entitlementWrite.staleEvent ? "RevenueCat webhook ignored an older event and preserved newer Premium authority."
        : entitlementWrite.ignoredEvent ? "RevenueCat webhook ignored malformed or non-authoritative Premium input without granting access."
        : entitlementWrite.entitlementActive ? "RevenueCat webhook synced an active Premium entitlement."
        : "RevenueCat webhook synced a non-active Premium entitlement status.",
    });
  } catch (error) {
    const safeMessage = sanitizeErrorMessage(error);
    const nonRetriablePayloadError = /invalid revenuecat webhook payload|event type is missing|event id is (missing|ambiguous)|app user id is missing or (anonymous|ambiguous)|event is not mapped to premium|transfer event type is invalid|transfer identities are invalid|transfer is limited to verified sandbox app store events|revenuecat_webhook_ingress_identity_(?:invalid|mismatch)/i.test(safeMessage);
    const responseStatus = nonRetriablePayloadError ? 200 : 500;
    return jsonResponse(responseStatus, {
      status: nonRetriablePayloadError ? "ignored" : "error",
      provider: "revenuecat",
      capability: "premium_entitlement",
      signatureVerified: true,
      webhookProcessed: false,
      premiumGranted: false,
      liveMoneyAction: false,
      retryableFailure: !nonRetriablePayloadError,
      message: safeMessage,
    });
  }
});
