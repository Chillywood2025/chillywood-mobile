import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  purchaseRevenueCatPackage,
  purchaseRevenueCatStoreProduct,
  readRevenueCatOfferings,
  readRevenueCatSubscriptionProducts,
  type PurchasesPackage,
} from "./revenuecat";
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
    provider: toText(row.provider) || "revenuecat_google_play",
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
    provider: toText(row.provider) || "revenuecat_google_play",
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

const normalizeAccess = (value: unknown): ChannelSubscriptionAccess => {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const offer = row.offer && typeof row.offer === "object" && !Array.isArray(row.offer)
    ? parseOffer(row.offer as Record<string, unknown>)
    : null;
  return {
    allowed: row.allowed === true,
    reason: toText(row.reason) || "unknown",
    requiresPurchase: row.requiresPurchase === true || toText(row.reason) === "subscription_required",
    subscriptionId: toText(row.subscriptionId) || null,
    currentPeriodEnd: toText(row.currentPeriodEnd) || null,
    priceCents: row.priceCents == null ? offer?.priceCents ?? null : toCents(row.priceCents),
    currency: toText(row.currency) || offer?.currency || null,
    creatorId: toText(row.creatorId) || offer?.creatorId || null,
    provider: toText(row.provider) || offer?.provider || null,
    providerProductId: toText(row.providerProductId) || offer?.providerProductId || null,
    providerProductKey: toText(row.providerProductKey) || offer?.providerProductKey || null,
    providerEntitlementId: toText(row.providerEntitlementId) || offer?.providerEntitlementId || null,
    offer,
  };
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const withoutBasePlan = normalized.includes(":") ? normalized.split(":")[0] : normalized;
  return Array.from(new Set([
    normalized,
    withoutBasePlan,
    `${withoutBasePlan}:monthly`,
    CHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_ID,
    CHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_BASE_PLAN_ID,
  ].map(toText).filter(Boolean)));
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
  return normalizeAccess(data);
}

export async function createChannelSubscriptionPurchaseIntent(offerId: string) {
  const { data, error } = await rpcClient.rpc("create_creator_channel_subscription_purchase_intent", {
    p_offer_id: offerId,
  });
  if (error) throw new Error("Channel Subscription checkout is not available right now.");
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    id: toText(row.id),
    providerProductId: toText(row.providerProductId) || CHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_ID,
    alreadySubscribed: row.alreadySubscribed === true,
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

  const intent = await createChannelSubscriptionPurchaseIntent(access.offer.id);
  if (intent.alreadySubscribed) {
    const verifiedAccess = await waitForChannelSubscriptionAccess(input.creatorId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed ? "Subscribed." : "Subscription is still being confirmed.",
      access: verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = intent.providerProductId || access.providerProductId || CHANNEL_SUBSCRIPTION_SANDBOX_PROVIDER_PRODUCT_ID;
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

  if (pkg) {
    await purchaseRevenueCatPackage(pkg);
  } else if (storeProduct) {
    await purchaseRevenueCatStoreProduct(storeProduct);
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
