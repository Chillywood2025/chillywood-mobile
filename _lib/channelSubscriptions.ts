import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  validateCreatorMoneyPurchaseIntent,
  type CreatorMoneyPurchaseIntentExpectation,
} from "./creatorMoneyPurchaseAuthority";
import {
  purchaseRevenueCatPackage,
  purchaseRevenueCatStoreProduct,
  readRevenueCatOfferings,
  readRevenueCatSubscriptionProducts,
  type PurchasesPackage,
} from "./revenuecat";
import { Platform } from "react-native";
import { IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY } from "./iosAppStoreCommerce";
import { resolvePaymentRailPolicy } from "./paymentRailPolicy";
import { supabase } from "./supabase";

export const CHANNEL_SUBSCRIPTION_SANDBOX_PRODUCT_KEY = "channel_subscription_sandbox_monthly_499";
export const CHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_ID = "channel_subscription_sandbox_monthly_499";
export const CHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_BASE_PLAN_ID = "channel_subscription_sandbox_monthly_499:monthly";
export const CHANNEL_SUBSCRIPTION_POLL_ATTEMPTS = 12;
export const CHANNEL_SUBSCRIPTION_POLL_DELAY_MS = 1500;

export type ChannelSubscriptionOfferStatus = "draft" | "sandbox" | "active" | "paused" | "blocked" | "archived";

export type ChannelSubscriptionOffer = {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: "monthly";
  status: ChannelSubscriptionOfferStatus;
  provider: string;
  providerProductKey: string | null;
  providerProductId: string | null;
  providerEntitlementId: string | null;
  subscriberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ChannelSubscriptionAccess = {
  allowed: boolean;
  reason: string;
  requiresPurchase: boolean;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  priceCents: number | null;
  currency: string | null;
  creatorId: string | null;
  provider: string | null;
  providerProductId: string | null;
  providerProductKey: string | null;
  providerEntitlementId: string | null;
  offer: ChannelSubscriptionOffer | null;
};

export type ChannelSubscriptionTransaction = {
  id: string;
  offerId: string;
  subscriptionId: string | null;
  subscriberId: string;
  creatorId: string;
  title: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerProductId: string | null;
  providerTransactionId: string | null;
  status: string;
  payoutStatus: string;
  environment: string;
  periodEnd: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type ChannelSubscriptionReadbackStatus = {
  label: string;
  tone: "default" | "muted" | "warning";
  accessCopy: string;
};

export type ChannelSubscriptionPurchaseResult = {
  ok: boolean;
  message: string;
  access: ChannelSubscriptionAccess;
  intentId?: string;
  productId?: string;
};

type RpcClient = {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

type OfferingsWithPackages = {
  all?: Record<string, { availablePackages?: PurchasesPackage[] }>;
  current?: { availablePackages?: PurchasesPackage[] } | null;
};

const rpcClient = supabase as unknown as RpcClient;

const toText = (value: unknown) => String(value ?? "").trim();
const resolveRevenueCatProvider = () => Platform.OS === "ios" ? "revenuecat_app_store" : "revenuecat_google_play";
const toCents = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const parseJsonArray = <T>(value: unknown, parser: (row: Record<string, unknown>) => T | null): T[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? parser(entry as Record<string, unknown>) : null))
    .filter((entry): entry is T => !!entry);
};

const normalizeOfferStatus = (value: unknown): ChannelSubscriptionOfferStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "draft"
    || normalized === "sandbox"
    || normalized === "active"
    || normalized === "paused"
    || normalized === "blocked"
    || normalized === "archived"
  ) {
    return normalized;
  }
  return "draft";
};

const parseOffer = (row: Record<string, unknown>): ChannelSubscriptionOffer | null => {
  const id = toText(row.id);
  const creatorId = toText(row.creatorId);
  if (!id || !creatorId) return null;
  return {
    id,
    creatorId,
    title: toText(row.title) || "Channel subscription",
    description: toText(row.description) || null,
    priceCents: toCents(row.priceCents),
    currency: toText(row.currency) || "usd",
    interval: "monthly",
    status: normalizeOfferStatus(row.status),
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductKey: toText(row.providerProductKey) || null,
    providerProductId: toText(row.providerProductId) || null,
    providerEntitlementId: toText(row.providerEntitlementId) || null,
    subscriberCount: toCents(row.subscriberCount),
    createdAt: toText(row.createdAt),
    updatedAt: toText(row.updatedAt),
  };
};

const parseTransaction = (row: Record<string, unknown>): ChannelSubscriptionTransaction | null => {
  const id = toText(row.id);
  const offerId = toText(row.offerId);
  const creatorId = toText(row.creatorId);
  if (!id || !offerId || !creatorId) return null;
  return {
    id,
    offerId,
    subscriptionId: toText(row.subscriptionId) || null,
    subscriberId: toText(row.subscriberId),
    creatorId,
    title: toText(row.title) || "Channel subscription",
    amountCents: toCents(row.amountCents),
    currency: toText(row.currency) || "usd",
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductId: toText(row.providerProductId) || null,
    providerTransactionId: toText(row.providerTransactionId) || null,
    status: toText(row.status) || "pending",
    payoutStatus: toText(row.payoutStatus) || "not_payable",
    environment: toText(row.environment) || "sandbox",
    periodEnd: toText(row.periodEnd) || null,
    createdAt: toText(row.createdAt),
    paidAt: toText(row.paidAt) || null,
  };
};

const ACCESS_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const accessText = (value: unknown) => (
  typeof value === "string" && value === value.trim() ? value : ""
);
const isAccessProvider = (value: string) => (
  value === "revenuecat_app_store" || value === "revenuecat_google_play"
);
const unavailableSubscriptionAccess = (reason = "malformed_access_response"): ChannelSubscriptionAccess => ({
  allowed: false,
  reason,
  requiresPurchase: false,
  subscriptionId: null,
  currentPeriodEnd: null,
  priceCents: null,
  currency: null,
  creatorId: null,
  provider: null,
  providerProductId: null,
  providerProductKey: null,
  providerEntitlementId: null,
  offer: null,
});

const parseAuthoritativeSubscriptionOffer = (
  value: unknown,
  expectedCreatorId: string,
): ChannelSubscriptionOffer | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const offer = parseOffer(row);
  if (!offer) return null;
  const provider = accessText(row.provider);
  return ACCESS_UUID_PATTERN.test(accessText(row.id))
    && ACCESS_UUID_PATTERN.test(accessText(row.creatorId))
    && accessText(row.creatorId) === expectedCreatorId
    && accessText(row.interval) === "monthly"
    && typeof row.priceCents === "number"
    && Number.isSafeInteger(row.priceCents)
    && row.priceCents > 0
    && /^[a-z]{3}$/.test(accessText(row.currency))
    && isAccessProvider(provider)
    && !!accessText(row.providerProductId)
    && !!accessText(row.providerProductKey)
    && !!accessText(row.providerEntitlementId)
    && ["sandbox", "active", "paused"].includes(accessText(row.status))
    ? offer
    : null;
};

const normalizeAccess = (value: unknown, expectedCreatorId: string): ChannelSubscriptionAccess => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailableSubscriptionAccess();
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const reason = accessText(row.reason);
  if (typeof row.allowed !== "boolean" || typeof row.requiresPurchase !== "boolean" || !reason) {
    return unavailableSubscriptionAccess();
  }
  const offer = row.offer === null || row.offer === undefined
    ? null
    : parseAuthoritativeSubscriptionOffer(row.offer, expectedCreatorId);

  if (row.allowed) {
    if (row.requiresPurchase || !offer) return unavailableSubscriptionAccess();
    if (
      reason === "creator_or_admin"
      && row.previewAuthority === true
      && accessText(row.subscriptionId) === ""
      && accessText(row.currentPeriodEnd) === ""
    ) {
      return { ...unavailableSubscriptionAccess(reason), allowed: true, creatorId: offer.creatorId, offer };
    }
    const currentPeriodEnd = accessText(row.currentPeriodEnd);
    if (
      (reason === "subscription_active" || reason === "subscription_cancel_pending")
      && ACCESS_UUID_PATTERN.test(accessText(row.subscriptionId))
      && currentPeriodEnd
      && Number.isFinite(Date.parse(currentPeriodEnd))
      && Date.parse(currentPeriodEnd) > Date.now()
    ) {
      return {
        allowed: true,
        reason,
        requiresPurchase: false,
        subscriptionId: accessText(row.subscriptionId),
        currentPeriodEnd,
        priceCents: offer.priceCents,
        currency: offer.currency,
        creatorId: offer.creatorId,
        provider: offer.provider,
        providerProductId: offer.providerProductId,
        providerProductKey: offer.providerProductKey,
        providerEntitlementId: offer.providerEntitlementId,
        offer,
      };
    }
    return unavailableSubscriptionAccess();
  }

  if (reason !== "subscription_required") return unavailableSubscriptionAccess(reason);
  const priceCents = row.priceCents;
  const currency = accessText(row.currency);
  const creatorId = accessText(row.creatorId);
  const provider = accessText(row.provider);
  const providerProductId = accessText(row.providerProductId);
  const providerProductKey = accessText(row.providerProductKey);
  const providerEntitlementId = accessText(row.providerEntitlementId);
  if (
    row.requiresPurchase !== true
    || !offer
    || (offer.status !== "sandbox" && offer.status !== "active")
    || typeof priceCents !== "number"
    || !Number.isSafeInteger(priceCents)
    || priceCents <= 0
    || priceCents !== offer.priceCents
    || currency !== offer.currency
    || creatorId !== offer.creatorId
    || provider !== offer.provider
    || providerProductId !== offer.providerProductId
    || providerProductKey !== offer.providerProductKey
    || providerEntitlementId !== offer.providerEntitlementId
  ) return unavailableSubscriptionAccess();
  return {
    allowed: false,
    reason,
    requiresPurchase: true,
    subscriptionId: null,
    currentPeriodEnd: null,
    priceCents,
    currency,
    creatorId,
    provider,
    providerProductId,
    providerProductKey,
    providerEntitlementId,
    offer,
  };
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const purchaseErrorText = (error: unknown, key: string) => {
  if (!error || typeof error !== "object") return "";
  return toText((error as Record<string, unknown>)[key]);
};

const isRevenueCatUserCancellation = (error: unknown) => {
  if (error && typeof error === "object" && (error as Record<string, unknown>).userCancelled === true) {
    return true;
  }
  const combined = [
    purchaseErrorText(error, "code"),
    purchaseErrorText(error, "codeName"),
    purchaseErrorText(error, "message"),
    purchaseErrorText(error, "underlyingErrorMessage"),
  ].join(" ").toLowerCase();
  return combined.includes("cancel");
};

const extractPackages = (offerings: unknown): PurchasesPackage[] => {
  const typed = offerings as OfferingsWithPackages | null;
  const packages: PurchasesPackage[] = [];
  typed?.current?.availablePackages?.forEach((pkg) => packages.push(pkg));
  Object.values(typed?.all ?? {}).forEach((offering) => {
    offering.availablePackages?.forEach((pkg) => packages.push(pkg));
  });
  return packages;
};

const buildSubscriptionProductIdentifierCandidates = (productId: string) => {
  const normalized = toText(productId);
  return normalized ? [normalized] : [];
};

const findSubscriptionPackage = async (productId: string) => {
  const offerings = await readRevenueCatOfferings();
  const packages = extractPackages(offerings);
  const productIds = buildSubscriptionProductIdentifierCandidates(productId);
  return packages.find((pkg) => productIds.includes(toText(pkg.product.identifier))) ?? null;
};

const findSubscriptionStoreProduct = async (productId: string) => {
  const productIds = buildSubscriptionProductIdentifierCandidates(productId);
  const products = await readRevenueCatSubscriptionProducts(productIds);
  return products.find((product) => productIds.includes(toText(product.identifier))) ?? null;
};

export const formatChannelSubscriptionPrice = (amountCents: number, currency = "usd") =>
  `${formatMonetizationCurrency(amountCents, currency)}/month`;

export const isChannelSubscriptionPeriodCurrent = (periodEnd: string | null) => {
  if (!periodEnd) return false;
  const periodEndMs = Date.parse(periodEnd);
  if (!Number.isFinite(periodEndMs)) return false;
  return periodEndMs > Date.now();
};

export const getChannelSubscriptionReadbackStatus = (
  transaction: ChannelSubscriptionTransaction,
): ChannelSubscriptionReadbackStatus => {
  const status = transaction.status.toLowerCase();
  if (status === "refunded" || status === "revoked" || status === "expired") {
    return {
      label: status === "expired" ? "Expired" : status === "refunded" ? "Refunded" : "Revoked",
      tone: "warning",
      accessCopy: "Effective subscriber access is inactive.",
    };
  }
  if ((status === "paid" || status === "renewal_paid") && !isChannelSubscriptionPeriodCurrent(transaction.periodEnd)) {
    return {
      label: "Expired",
      tone: "warning",
      accessCopy: "The provider period has ended. Subscriber access uses effective access and is not treated as active from this stale row.",
    };
  }
  if (status === "paid" || status === "renewal_paid") {
    return {
      label: status === "renewal_paid" ? "Renewed" : "Paid",
      tone: "default",
      accessCopy: "Subscriber access still depends on the effective access gate.",
    };
  }
  return {
    label: transaction.status || "Pending",
    tone: status === "failed" || status === "canceled" ? "warning" : "muted",
    accessCopy: "Subscriber access is not granted unless the effective access gate is active.",
  };
};

export async function listMyChannelSubscriptionOffers(): Promise<ChannelSubscriptionOffer[]> {
  const { data, error } = await rpcClient.rpc("list_my_creator_channel_subscription_offers");
  if (error) return [];
  return parseJsonArray(data, parseOffer);
}

export async function listMyChannelSubscriptionTransactions(limit = 50): Promise<ChannelSubscriptionTransaction[]> {
  const { data, error } = await rpcClient.rpc("list_my_creator_channel_subscription_transactions", {
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit || 50))),
  });
  if (error) return [];
  return parseJsonArray(data, parseTransaction);
}

export async function saveChannelSubscriptionOffer(input: {
  title?: string | null;
  description?: string | null;
  status?: ChannelSubscriptionOfferStatus;
}): Promise<ChannelSubscriptionOffer> {
  const { data, error } = await rpcClient.rpc("set_creator_channel_subscription_offer", {
    p_title: input.title ?? "Channel subscription",
    p_description: input.description ?? null,
    p_status: input.status ?? "sandbox",
  });
  if (error) throw new Error("Channel Subscription settings could not be saved.");
  const offer = data && typeof data === "object" && !Array.isArray(data)
    ? parseOffer(data as Record<string, unknown>)
    : null;
  if (!offer) throw new Error("Channel Subscription settings could not be read.");
  return offer;
}

export async function resolveChannelSubscriptionAccess(creatorId: string): Promise<ChannelSubscriptionAccess> {
  const { data, error } = await rpcClient.rpc("resolve_creator_channel_subscription_access", {
    p_creator_id: creatorId,
  });
  if (error) {
    return {
      allowed: false,
      reason: "access_check_failed",
      requiresPurchase: false,
      subscriptionId: null,
      currentPeriodEnd: null,
      priceCents: null,
      currency: null,
      creatorId: null,
      provider: null,
      providerProductId: null,
      providerProductKey: null,
      providerEntitlementId: null,
      offer: null,
    };
  }
  return normalizeAccess(data, creatorId);
}

export async function createChannelSubscriptionPurchaseIntent(
  offerId: string,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation, "status">,
) {
  const { data, error } = await rpcClient.rpc("create_creator_channel_subscription_purchase_intent", {
    p_offer_id: offerId,
  });
  if (error) throw new Error("Channel Subscription checkout is not available right now.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Channel Subscription checkout authority could not be verified.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.alreadySubscribed !== "boolean") {
    throw new Error("Channel Subscription checkout authority could not be verified.");
  }
  const validated = validateCreatorMoneyPurchaseIntent(data, {
    ...expected,
    status: row.alreadySubscribed ? "consumed" : "pending",
  });
  if (!validated) throw new Error("Channel Subscription checkout authority could not be verified.");
  return {
    ...validated,
    alreadySubscribed: row.alreadySubscribed,
  };
}

export async function waitForChannelSubscriptionAccess(creatorId: string): Promise<ChannelSubscriptionAccess> {
  let latest = await resolveChannelSubscriptionAccess(creatorId);
  if (latest.allowed) return latest;
  for (let attempt = 0; attempt < CHANNEL_SUBSCRIPTION_POLL_ATTEMPTS; attempt += 1) {
    await delay(CHANNEL_SUBSCRIPTION_POLL_DELAY_MS);
    latest = await resolveChannelSubscriptionAccess(creatorId);
    if (latest.allowed) return latest;
  }
  return latest;
}

export async function purchaseChannelSubscription(input: {
  creatorId: string;
  sourceSurface: string;
}): Promise<ChannelSubscriptionPurchaseResult> {
  const access = await resolveChannelSubscriptionAccess(input.creatorId);
  if (access.allowed) {
    return { ok: true, message: "Subscribed.", access };
  }
  if (!access.requiresPurchase || !access.offer?.id) {
    return { ok: false, message: "This creator subscription is not available right now.", access };
  }
  if (
    !access.creatorId
    || (access.provider !== "revenuecat_app_store" && access.provider !== "revenuecat_google_play")
    || !access.providerProductId
    || typeof access.priceCents !== "number"
    || !access.currency
  ) return { ok: false, message: "This creator subscription is not available right now.", access };

  if (Platform.OS === "ios") {
    const decision = resolvePaymentRailPolicy({
      environment: "sandbox",
      liveMoneyEnabled: false,
      platform: "ios",
      store: "app_store",
      unlocksDigitalAccess: true,
      useCase: "creator_paid_digital_content",
    });
    if (!decision.allowed) {
      return { ok: false, message: IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY, access };
    }
  }

  const purchaseSubject = await prepareCreatorMoneyPurchaseSubject();
  if (!purchaseSubject) {
    return {
      ok: false,
      message: "Sign in again before starting Channel Subscription checkout. Nothing was charged.",
      access,
    };
  }
  const intent = await createChannelSubscriptionPurchaseIntent(access.offer.id, {
    userId: purchaseSubject.userId,
    sourceType: "channel_subscription",
    sourceId: access.offer.id,
    creatorId: access.creatorId,
    provider: access.provider,
    providerProductId: access.providerProductId,
    environment: access.offer.status === "active" ? "production" : "sandbox",
    amountMinor: access.priceCents,
    currency: access.currency,
  });
  if (intent.alreadySubscribed) {
    const verifiedAccess = await waitForChannelSubscriptionAccess(input.creatorId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed ? "Subscribed." : "Subscription is still being confirmed.",
      access: verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = access.providerProductId;
  const pkg = await findSubscriptionPackage(productId);
  const storeProduct = pkg ? null : await findSubscriptionStoreProduct(productId);
  if (!pkg && !storeProduct) {
    return {
      ok: false,
      message: "Channel Subscription sandbox product is not available on this device yet.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("creator_subscription_started", {
    creator_id: access.creatorId ?? input.creatorId,
    feature_key: "channel_subscriptions",
    offer_type: "channel_subscription",
    price_bucket: formatChannelSubscriptionPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "channel",
    source_surface: input.sourceSurface,
  });

  if (!await revalidateCreatorMoneyPurchaseSubject(purchaseSubject)) {
    return {
      ok: false,
      message: "Your session changed before Channel Subscription checkout. Nothing was charged.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  try {
    if (pkg) {
      await purchaseRevenueCatPackage(pkg, { authority: purchaseSubject.authority });
    } else if (storeProduct) {
      await purchaseRevenueCatStoreProduct(storeProduct, { authority: purchaseSubject.authority });
    }
  } catch (error) {
    const verifiedAccess = await waitForChannelSubscriptionAccess(input.creatorId);
    if (verifiedAccess.allowed) {
      return {
        ok: true,
        message: "Subscribed.",
        access: verifiedAccess,
        intentId: intent.id,
        productId,
      };
    }

    return {
      ok: false,
      message: isRevenueCatUserCancellation(error)
        ? "Channel Subscription was canceled. Nothing changed."
        : "Channel Subscription checkout could not be completed. Try again later.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  const verifiedAccess = await waitForChannelSubscriptionAccess(input.creatorId);
  if (!verifiedAccess.allowed) {
    return {
      ok: false,
      message: "Subscription received. Waiting for the verified channel status to finish.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("creator_subscription_succeeded", {
    creator_id: verifiedAccess.creatorId ?? access.creatorId ?? input.creatorId,
    feature_key: "channel_subscriptions",
    offer_type: "channel_subscription",
    price_bucket: formatChannelSubscriptionPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "channel",
    source_surface: input.sourceSurface,
  });

  return {
    ok: true,
    message: "Subscribed.",
    access: verifiedAccess,
    intentId: intent.id,
    productId,
  };
}
