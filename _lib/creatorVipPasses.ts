import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { supabase } from "./supabase";

export const VIP_PASS_SANDBOX_PRODUCT_KEY = "vip_pass_sandbox_499";
export const VIP_PASS_SANDBOX_PROVIDER_PRODUCT_ID = "cw_vip_pass_sandbox_499";
export const VIP_PASS_POLL_ATTEMPTS = 10;
export const VIP_PASS_POLL_DELAY_MS = 1500;

export type CreatorVipPassOfferStatus = "draft" | "sandbox" | "active" | "paused" | "blocked" | "archived";

export type CreatorVipPassOffer = {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  passType: "one_time";
  status: CreatorVipPassOfferStatus;
  provider: string;
  providerProductKey: string | null;
  providerProductId: string | null;
  vipCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreatorVipPassAccess = {
  allowed: boolean;
  reason: string;
  requiresPurchase: boolean;
  vipPassId: string | null;
  priceCents: number | null;
  currency: string | null;
  creatorId: string | null;
  provider: string | null;
  providerProductId: string | null;
  providerProductKey: string | null;
  offer: CreatorVipPassOffer | null;
};

export type CreatorVipTransaction = {
  id: string;
  offerId: string;
  creatorId: string;
  fanId: string;
  title: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerProductId: string | null;
  providerTransactionId: string | null;
  status: string;
  payoutStatus: string;
  environment: string;
  vipCount: number;
  createdAt: string;
  paidAt: string | null;
};

export type CreatorVipPurchaseResult = {
  ok: boolean;
  message: string;
  access: CreatorVipPassAccess;
  intentId?: string;
  productId?: string;
};

type RpcClient = {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
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

const normalizeOfferStatus = (value: unknown): CreatorVipPassOfferStatus => {
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

const parseOffer = (row: Record<string, unknown>): CreatorVipPassOffer | null => {
  const id = toText(row.id);
  const creatorId = toText(row.creatorId);
  if (!id || !creatorId) return null;
  return {
    id,
    creatorId,
    title: toText(row.title) || "VIP Pass",
    description: toText(row.description) || null,
    priceCents: toCents(row.priceCents),
    currency: toText(row.currency) || "usd",
    passType: "one_time",
    status: normalizeOfferStatus(row.status),
    provider: toText(row.provider) || "revenuecat_google_play",
    providerProductKey: toText(row.providerProductKey) || null,
    providerProductId: toText(row.providerProductId) || null,
    vipCount: toCents(row.vipCount),
    createdAt: toText(row.createdAt),
    updatedAt: toText(row.updatedAt),
  };
};

const parseTransaction = (row: Record<string, unknown>): CreatorVipTransaction | null => {
  const id = toText(row.id);
  const offerId = toText(row.offerId);
  const creatorId = toText(row.creatorId);
  if (!id || !offerId || !creatorId) return null;
  return {
    id,
    offerId,
    creatorId,
    fanId: toText(row.fanId),
    title: toText(row.title) || "VIP Pass",
    amountCents: toCents(row.amountCents),
    currency: toText(row.currency) || "usd",
    provider: toText(row.provider) || "revenuecat_google_play",
    providerProductId: toText(row.providerProductId) || null,
    providerTransactionId: toText(row.providerTransactionId) || null,
    status: toText(row.status) || "pending",
    payoutStatus: toText(row.payoutStatus) || "not_payable",
    environment: toText(row.environment) || "sandbox",
    vipCount: toCents(row.vipCount),
    createdAt: toText(row.createdAt),
    paidAt: toText(row.paidAt) || null,
  };
};

const normalizeAccess = (value: unknown): CreatorVipPassAccess => {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const offer = row.offer && typeof row.offer === "object" && !Array.isArray(row.offer)
    ? parseOffer(row.offer as Record<string, unknown>)
    : null;
  return {
    allowed: row.allowed === true,
    reason: toText(row.reason) || "unknown",
    requiresPurchase: row.requiresPurchase === true || toText(row.reason) === "vip_required",
    vipPassId: toText(row.vipPassId) || null,
    priceCents: row.priceCents == null ? offer?.priceCents ?? null : toCents(row.priceCents),
    currency: toText(row.currency) || offer?.currency || null,
    creatorId: toText(row.creatorId) || offer?.creatorId || null,
    provider: toText(row.provider) || offer?.provider || null,
    providerProductId: toText(row.providerProductId) || offer?.providerProductId || null,
    providerProductKey: toText(row.providerProductKey) || offer?.providerProductKey || null,
    offer,
  };
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const formatCreatorVipPassPrice = (amountCents: number, currency = "usd") =>
  formatMonetizationCurrency(amountCents, currency);

export async function listMyCreatorVipPassOffers(): Promise<CreatorVipPassOffer[]> {
  const { data, error } = await rpcClient.rpc("list_my_creator_vip_pass_offers");
  if (error) return [];
  return parseJsonArray(data, parseOffer);
}

export async function listMyCreatorVipTransactions(limit = 50): Promise<CreatorVipTransaction[]> {
  const { data, error } = await rpcClient.rpc("list_my_creator_vip_transactions", {
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit || 50))),
  });
  if (error) return [];
  return parseJsonArray(data, parseTransaction);
}

export async function saveCreatorVipPassOffer(input: {
  title?: string | null;
  description?: string | null;
  status?: CreatorVipPassOfferStatus;
}): Promise<CreatorVipPassOffer> {
  const { data, error } = await rpcClient.rpc("set_creator_vip_pass_offer", {
    p_title: input.title ?? "VIP Pass",
    p_description: input.description ?? "Creator-specific VIP status for this channel only.",
    p_status: input.status ?? "sandbox",
  });
  if (error) throw new Error("VIP Pass settings could not be saved.");
  const offer = data && typeof data === "object" && !Array.isArray(data)
    ? parseOffer(data as Record<string, unknown>)
    : null;
  if (!offer) throw new Error("VIP Pass settings could not be read.");
  return offer;
}

export async function resolveCreatorVipPassAccess(creatorId: string): Promise<CreatorVipPassAccess> {
  const { data, error } = await rpcClient.rpc("resolve_creator_vip_pass_access", {
    p_creator_id: creatorId,
  });
  if (error) {
    return {
      allowed: false,
      reason: "access_check_failed",
      requiresPurchase: false,
      vipPassId: null,
      priceCents: null,
      currency: null,
      creatorId: null,
      provider: null,
      providerProductId: null,
      providerProductKey: null,
      offer: null,
    };
  }
  return normalizeAccess(data);
}

export async function createCreatorVipPassPurchaseIntent(offerId: string) {
  const { data, error } = await rpcClient.rpc("create_creator_vip_pass_purchase_intent", {
    p_offer_id: offerId,
  });
  if (error) throw new Error("VIP Pass checkout is not available right now.");
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    id: toText(row.id),
    providerProductId: toText(row.providerProductId) || VIP_PASS_SANDBOX_PROVIDER_PRODUCT_ID,
    alreadyPurchased: row.alreadyPurchased === true,
  };
}

export async function waitForCreatorVipPassAccess(creatorId: string): Promise<CreatorVipPassAccess> {
  let latest = await resolveCreatorVipPassAccess(creatorId);
  if (latest.allowed) return latest;
  for (let attempt = 0; attempt < VIP_PASS_POLL_ATTEMPTS; attempt += 1) {
    await delay(VIP_PASS_POLL_DELAY_MS);
    latest = await resolveCreatorVipPassAccess(creatorId);
    if (latest.allowed) return latest;
  }
  return latest;
}

export async function purchaseCreatorVipPass(input: {
  creatorId: string;
  sourceSurface: string;
}): Promise<CreatorVipPurchaseResult> {
  const access = await resolveCreatorVipPassAccess(input.creatorId);
  if (access.allowed) {
    return { ok: true, message: "VIP confirmed.", access };
  }
  if (!access.requiresPurchase || !access.offer?.id) {
    return { ok: false, message: "VIP is not available for this creator right now.", access };
  }

  const intent = await createCreatorVipPassPurchaseIntent(access.offer.id);
  if (intent.alreadyPurchased) {
    const verifiedAccess = await waitForCreatorVipPassAccess(input.creatorId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed ? "VIP confirmed." : "VIP is still being confirmed.",
      access: verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = intent.providerProductId || access.providerProductId || VIP_PASS_SANDBOX_PROVIDER_PRODUCT_ID;
  const products = await readRevenueCatNonSubscriptionProducts([productId]);
  const product = products.find((entry) => String(entry.identifier ?? "").trim() === productId) ?? products[0] ?? null;
  if (!product) {
    return {
      ok: false,
      message: "VIP Pass sandbox product is not available on this device yet.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("vip_purchase_started", {
    creator_id: access.creatorId ?? input.creatorId,
    feature_key: "vip_passes",
    offer_type: "vip_pass",
    price_bucket: formatCreatorVipPassPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "channel",
    source_surface: input.sourceSurface,
  });

  await purchaseRevenueCatStoreProduct(product);
  const verifiedAccess = await waitForCreatorVipPassAccess(input.creatorId);
  if (!verifiedAccess.allowed) {
    return {
      ok: false,
      message: "Purchase received. Waiting for the verified VIP pass to finish.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("vip_purchase_succeeded", {
    creator_id: verifiedAccess.creatorId ?? access.creatorId ?? input.creatorId,
    feature_key: "vip_passes",
    offer_type: "vip_pass",
    price_bucket: formatCreatorVipPassPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "channel",
    source_surface: input.sourceSurface,
  });

  return {
    ok: true,
    message: "VIP confirmed.",
    access: verifiedAccess,
    intentId: intent.id,
    productId,
  };
}
