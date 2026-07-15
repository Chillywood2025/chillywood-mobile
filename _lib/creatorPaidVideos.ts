import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export const PAID_VIDEO_SANDBOX_PRODUCT_KEY = "paid_content_access_sandbox_099";
export const PAID_VIDEO_SANDBOX_PROVIDER_PRODUCT_ID = "cw_paid_content_access_sandbox_099";
export const PAID_VIDEO_ACCESS_POLL_ATTEMPTS = 10;
export const PAID_VIDEO_ACCESS_POLL_DELAY_MS = 1500;

export type PaidVideoOfferStatus = "draft" | "sandbox" | "active" | "paused" | "blocked" | "archived";

export type CreatorPaidVideoOffer = {
  id: string;
  videoId: string;
  creatorId: string;
  title: string;
  priceCents: number;
  currency: string;
  status: PaidVideoOfferStatus;
  isPaid: boolean;
  provider: string;
  providerProductId: string | null;
  providerProductKey: string | null;
  salesCount: number;
  totalRevenueCents: number;
  createdAt: string;
  updatedAt: string;
};

export type CreatorPaidVideoTransaction = {
  id: string;
  providerEventId: string | null;
  videoId: string;
  videoTitle: string;
  fanId: string;
  creatorId: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerProductId: string | null;
  status: "pending" | "paid" | "failed" | "canceled" | "refunded" | "revoked" | "reversed" | "chargeback" | string;
  payoutStatus: string;
  environment: string;
  createdAt: string;
  paidAt: string | null;
};

export type PaidVideoAccessResolution = {
  allowed: boolean;
  reason: string;
  requiresPurchase: boolean;
  priceCents: number | null;
  currency: string | null;
  creatorId: string | null;
  provider: string | null;
  providerProductId: string | null;
  providerProductKey: string | null;
  offerStatus: string | null;
};

export type PaidVideoPurchaseResult = {
  ok: boolean;
  message: string;
  access: PaidVideoAccessResolution;
  intentId?: string;
  productId?: string;
};

type RpcClient = {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

const paidVideoClient = supabase as unknown as RpcClient;

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

const normalizeOfferStatus = (value: unknown): PaidVideoOfferStatus => {
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

const parseOffer = (row: Record<string, unknown>): CreatorPaidVideoOffer | null => {
  const id = toText(row.id);
  const videoId = toText(row.videoId);
  const creatorId = toText(row.creatorId);
  if (!id || !videoId || !creatorId) return null;
  return {
    id,
    videoId,
    creatorId,
    title: toText(row.title) || "Creator video",
    priceCents: toCents(row.priceCents),
    currency: toText(row.currency) || "usd",
    status: normalizeOfferStatus(row.status),
    isPaid: row.isPaid === true,
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductId: toText(row.providerProductId) || null,
    providerProductKey: toText(row.providerProductKey) || null,
    salesCount: toCents(row.salesCount),
    totalRevenueCents: toCents(row.totalRevenueCents),
    createdAt: toText(row.createdAt),
    updatedAt: toText(row.updatedAt),
  };
};

const parseTransaction = (row: Record<string, unknown>): CreatorPaidVideoTransaction | null => {
  const id = toText(row.id);
  const videoId = toText(row.videoId);
  const creatorId = toText(row.creatorId);
  if (!id || !videoId || !creatorId) return null;
  return {
    id,
    providerEventId: toText(row.providerEventId) || null,
    videoId,
    videoTitle: toText(row.videoTitle) || "Creator video",
    fanId: toText(row.fanId),
    creatorId,
    amountCents: toCents(row.amountCents),
    currency: toText(row.currency) || "usd",
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductId: toText(row.providerProductId) || null,
    status: toText(row.status) || "pending",
    payoutStatus: toText(row.payoutStatus) || "not_payable",
    environment: toText(row.environment) || "sandbox",
    createdAt: toText(row.createdAt),
    paidAt: toText(row.paidAt) || null,
  };
};

const normalizeAccess = (value: unknown): PaidVideoAccessResolution => {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    allowed: row.allowed === true,
    reason: toText(row.reason) || "unknown",
    requiresPurchase: row.requiresPurchase === true || toText(row.reason) === "purchase_required",
    priceCents: row.priceCents == null ? null : toCents(row.priceCents),
    currency: toText(row.currency) || null,
    creatorId: toText(row.creatorId) || null,
    provider: toText(row.provider) || null,
    providerProductId: toText(row.providerProductId) || null,
    providerProductKey: toText(row.providerProductKey) || null,
    offerStatus: toText(row.offerStatus) || null,
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

export const formatPaidVideoPrice = (amountCents: number, currency = "usd") =>
  formatMonetizationCurrency(amountCents, currency);

export async function listMyPaidVideoOffers(): Promise<CreatorPaidVideoOffer[]> {
  const { data, error } = await paidVideoClient.rpc("list_my_paid_video_offers");
  if (error) return [];
  return parseJsonArray(data, parseOffer);
}

export async function listMyPaidVideoTransactions(limit = 50): Promise<CreatorPaidVideoTransaction[]> {
  const { data, error } = await paidVideoClient.rpc("list_my_paid_video_transactions", {
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit || 50))),
  });
  if (error) return [];
  return parseJsonArray(data, parseTransaction);
}

export async function savePaidVideoOffer(input: {
  videoId: string;
  isPaid: boolean;
  priceCents: number;
  currency?: string | null;
}) {
  const { data, error } = await paidVideoClient.rpc("set_creator_content_price", {
    p_content_type: "creator_video",
    p_content_id: input.videoId,
    p_is_paid: input.isPaid,
    p_price_cents: Math.max(0, Math.trunc(input.priceCents || 0)),
    p_currency: input.currency ?? "usd",
  });
  if (error) throw new Error("Paid video settings could not be saved.");
  return data;
}

export async function resolvePaidVideoAccess(videoId: string): Promise<PaidVideoAccessResolution> {
  const { data, error } = await paidVideoClient.rpc("resolve_creator_content_access", {
    p_content_type: "creator_video",
    p_content_id: videoId,
  });
  if (error) {
    return {
      allowed: false,
      reason: "access_check_failed",
      requiresPurchase: true,
      priceCents: null,
      currency: null,
      creatorId: null,
      provider: null,
      providerProductId: null,
      providerProductKey: null,
      offerStatus: null,
    };
  }
  return normalizeAccess(data);
}

export async function createPaidVideoPurchaseIntent(input: {
  videoId: string;
  creatorId: string;
  amountCents: number;
  currency?: string | null;
}) {
  const { data, error } = await paidVideoClient.rpc("create_money_purchase_intent", {
    p_product_key: PAID_VIDEO_SANDBOX_PRODUCT_KEY,
    p_source_type: "paid_content",
    p_source_id: input.videoId,
    p_metadata: {
      creator_id: input.creatorId,
      amount_minor: Math.max(0, Math.trunc(input.amountCents || 0)),
      currency: toText(input.currency).toLowerCase() || "usd",
      source_surface: "paid_video_player",
      paid_video_v1: true,
      premium_unlock: false,
      tips_path: false,
    },
  });
  if (error) throw new Error("Paid video checkout is not available right now.");
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    id: toText(row.id),
    providerProductId: toText(row.providerProductId) || PAID_VIDEO_SANDBOX_PROVIDER_PRODUCT_ID,
  };
}

export async function waitForPaidVideoAccess(videoId: string): Promise<PaidVideoAccessResolution> {
  let latest = await resolvePaidVideoAccess(videoId);
  if (latest.allowed) return latest;
  for (let attempt = 0; attempt < PAID_VIDEO_ACCESS_POLL_ATTEMPTS; attempt += 1) {
    await delay(PAID_VIDEO_ACCESS_POLL_DELAY_MS);
    latest = await resolvePaidVideoAccess(videoId);
    if (latest.allowed) return latest;
  }
  return latest;
}

export async function purchasePaidVideoAccess(input: {
  videoId: string;
  creatorId: string;
  amountCents: number;
  currency?: string | null;
}): Promise<PaidVideoPurchaseResult> {
  const access = await resolvePaidVideoAccess(input.videoId);
  if (access.allowed) {
    return { ok: true, message: "You already unlocked this video.", access };
  }
  if (!access.requiresPurchase) {
    return { ok: true, message: "This video is available.", access };
  }
  if (!access.creatorId || access.creatorId !== input.creatorId) {
    return { ok: false, message: "This paid video offer is not ready.", access };
  }

  const intent = await createPaidVideoPurchaseIntent(input);
  const productId = intent.providerProductId || access.providerProductId || PAID_VIDEO_SANDBOX_PROVIDER_PRODUCT_ID;
  const products = await readRevenueCatNonSubscriptionProducts([productId]);
  const product = products.find((entry) => String(entry.identifier ?? "").trim() === productId) ?? products[0] ?? null;
  if (!product) {
    return {
      ok: false,
      message: "Paid video sandbox product is not available on this device yet.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("paid_video_unlock_started", {
    creator_id: input.creatorId,
    offer_type: "paid_video",
    price_bucket: formatPaidVideoPrice(input.amountCents, input.currency ?? "usd"),
    route_name: "player",
    source_surface: "video_player_locked_state",
  });

  try {
    await purchaseRevenueCatStoreProduct(product);
  } catch (error) {
    return {
      ok: false,
      message: isRevenueCatUserCancellation(error)
        ? "Paid Video unlock was canceled. Nothing changed."
        : "Paid Video checkout could not be completed. Try again later.",
      access,
      intentId: intent.id,
      productId,
    };
  }
  const verifiedAccess = await waitForPaidVideoAccess(input.videoId);
  if (!verifiedAccess.allowed) {
    return {
      ok: false,
      message: "Purchase received. Waiting for the verified unlock to finish.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("paid_video_unlock_succeeded", {
    creator_id: input.creatorId,
    offer_type: "paid_video",
    price_bucket: formatPaidVideoPrice(input.amountCents, input.currency ?? "usd"),
    route_name: "player",
    source_surface: "video_player_locked_state",
  });

  return {
    ok: true,
    message: "Video unlocked.",
    access: verifiedAccess,
    intentId: intent.id,
    productId,
  };
}
