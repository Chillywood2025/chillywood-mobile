import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  validateCreatorMoneyPurchaseIntent,
  type CreatorMoneyPurchaseIntentExpectation,
} from "./creatorMoneyPurchaseAuthority";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { Platform } from "react-native";
import { IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY } from "./iosAppStoreCommerce";
import { resolvePaymentRailPolicy } from "./paymentRailPolicy";
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

export type CreatorVipVideoAccess = {
  allowed: boolean;
  reason: string;
  vipRequired: boolean;
  creatorId: string | null;
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
    provider: toText(row.provider) || resolveRevenueCatProvider(),
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
    provider: toText(row.provider) || resolveRevenueCatProvider(),
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

const ACCESS_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const accessText = (value: unknown) => (
  typeof value === "string" && value === value.trim() ? value : ""
);
const isAccessProvider = (value: string) => (
  value === "revenuecat_app_store" || value === "revenuecat_google_play"
);
const unavailableVipAccess = (reason = "malformed_access_response"): CreatorVipPassAccess => ({
  allowed: false,
  reason,
  requiresPurchase: false,
  vipPassId: null,
  priceCents: null,
  currency: null,
  creatorId: null,
  provider: null,
  providerProductId: null,
  providerProductKey: null,
  offer: null,
});

const parseAuthoritativeVipOffer = (
  value: unknown,
  expectedCreatorId: string,
): CreatorVipPassOffer | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const offer = parseOffer(row);
  if (!offer) return null;
  const provider = accessText(row.provider);
  return ACCESS_UUID_PATTERN.test(accessText(row.id))
    && ACCESS_UUID_PATTERN.test(accessText(row.creatorId))
    && accessText(row.creatorId) === expectedCreatorId
    && accessText(row.passType) === "one_time"
    && typeof row.priceCents === "number"
    && Number.isSafeInteger(row.priceCents)
    && row.priceCents > 0
    && /^[a-z]{3}$/.test(accessText(row.currency))
    && isAccessProvider(provider)
    && !!accessText(row.providerProductId)
    && !!accessText(row.providerProductKey)
    && ["sandbox", "active", "paused"].includes(accessText(row.status))
    ? offer
    : null;
};

const normalizeAccess = (value: unknown, expectedCreatorId: string): CreatorVipPassAccess => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailableVipAccess();
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const reason = accessText(row.reason);
  if (typeof row.allowed !== "boolean" || typeof row.requiresPurchase !== "boolean" || !reason) {
    return unavailableVipAccess();
  }
  const offer = row.offer === null || row.offer === undefined
    ? null
    : parseAuthoritativeVipOffer(row.offer, expectedCreatorId);

  if (row.allowed) {
    if (row.requiresPurchase || !offer) return unavailableVipAccess();
    if (
      reason === "creator_or_admin"
      && row.previewAuthority === true
      && accessText(row.vipPassId) === ""
    ) {
      return { ...unavailableVipAccess(reason), allowed: true, creatorId: offer.creatorId, offer };
    }
    if (reason === "vip_active" && ACCESS_UUID_PATTERN.test(accessText(row.vipPassId))) {
      return {
        allowed: true,
        reason,
        requiresPurchase: false,
        vipPassId: accessText(row.vipPassId),
        priceCents: offer.priceCents,
        currency: offer.currency,
        creatorId: offer.creatorId,
        provider: offer.provider,
        providerProductId: offer.providerProductId,
        providerProductKey: offer.providerProductKey,
        offer,
      };
    }
    return unavailableVipAccess();
  }

  if (reason !== "vip_required") return unavailableVipAccess(reason);
  const priceCents = row.priceCents;
  const currency = accessText(row.currency);
  const creatorId = accessText(row.creatorId);
  const provider = accessText(row.provider);
  const providerProductId = accessText(row.providerProductId);
  const providerProductKey = accessText(row.providerProductKey);
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
  ) return unavailableVipAccess();
  return {
    allowed: false,
    reason,
    requiresPurchase: true,
    vipPassId: null,
    priceCents,
    currency,
    creatorId,
    provider,
    providerProductId,
    providerProductKey,
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
  return normalizeAccess(data, creatorId);
}

export async function resolveCreatorVipVideoAccess(videoId: string): Promise<CreatorVipVideoAccess> {
  const normalizedVideoId = accessText(videoId);
  if (!ACCESS_UUID_PATTERN.test(normalizedVideoId)) {
    return { allowed: false, reason: "invalid_video_id", vipRequired: true, creatorId: null };
  }
  const { data, error } = await rpcClient.rpc("resolve_creator_vip_video_access", { p_video_id: normalizedVideoId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { allowed: false, reason: "access_check_failed", vipRequired: true, creatorId: null };
  }
  const row = data as Record<string, unknown>;
  if (typeof row.allowed !== "boolean" || typeof row.vipRequired !== "boolean") {
    return { allowed: false, reason: "malformed_access_response", vipRequired: true, creatorId: null };
  }
  const creatorId = accessText(row.creatorId);
  if (creatorId && !ACCESS_UUID_PATTERN.test(creatorId)) {
    return { allowed: false, reason: "malformed_access_response", vipRequired: true, creatorId: null };
  }
  const reason = accessText(row.reason);
  if (!reason) return { allowed: false, reason: "malformed_access_response", vipRequired: true, creatorId: null };
  return { allowed: row.allowed, reason, vipRequired: row.vipRequired, creatorId: creatorId || null };
}

export async function setCreatorVideoVipAccess(videoId: string, required: boolean) {
  const normalizedVideoId = accessText(videoId);
  if (!ACCESS_UUID_PATTERN.test(normalizedVideoId)) throw new Error("VIP video access could not be updated.");
  const { data, error } = await rpcClient.rpc("set_creator_video_vip_access", { p_video_id: normalizedVideoId, p_required: required });
  if (error) throw new Error("VIP video access could not be updated.");
  const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  if (accessText(row.status) !== "ok") {
    if (accessText(row.reason) === "vip_video_must_be_public") throw new Error("Make this video Public before adding it to the VIP shelf.");
    throw new Error("VIP video access could not be updated.");
  }
  const returnedVideoId = accessText(row.videoId);
  if (returnedVideoId !== normalizedVideoId || typeof row.vipRequired !== "boolean") throw new Error("VIP video access could not be verified.");
  return { videoId: returnedVideoId, vipRequired: row.vipRequired };
}

export async function createCreatorVipPassPurchaseIntent(
  offerId: string,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation, "status">,
) {
  const { data, error } = await rpcClient.rpc("create_creator_vip_pass_purchase_intent", {
    p_offer_id: offerId,
  });
  if (error) throw new Error("VIP Pass checkout is not available right now.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("VIP Pass checkout authority could not be verified.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.alreadyPurchased !== "boolean") {
    throw new Error("VIP Pass checkout authority could not be verified.");
  }
  const validated = validateCreatorMoneyPurchaseIntent(data, {
    ...expected,
    status: row.alreadyPurchased ? "consumed" : "pending",
  });
  if (!validated) throw new Error("VIP Pass checkout authority could not be verified.");
  return {
    ...validated,
    alreadyPurchased: row.alreadyPurchased,
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
  if (
    !access.creatorId
    || (access.provider !== "revenuecat_app_store" && access.provider !== "revenuecat_google_play")
    || !access.providerProductId
    || typeof access.priceCents !== "number"
    || !access.currency
  ) return { ok: false, message: "VIP is not available for this creator right now.", access };

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
      message: "Sign in again before starting VIP Pass checkout. Nothing was charged.",
      access,
    };
  }
  const intent = await createCreatorVipPassPurchaseIntent(access.offer.id, {
    userId: purchaseSubject.userId,
    sourceType: "vip_pass",
    sourceId: access.offer.id,
    creatorId: access.creatorId,
    provider: access.provider,
    providerProductId: access.providerProductId,
    environment: access.offer.status === "active" ? "production" : "sandbox",
    amountMinor: access.priceCents,
    currency: access.currency,
  });
  if (intent.alreadyPurchased) {
    const verifiedAccess = await waitForCreatorVipPassAccess(input.creatorId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed ? "VIP confirmed." : "VIP is still being confirmed.",
      access: verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = access.providerProductId;
  const products = await readRevenueCatNonSubscriptionProducts([productId]);
  const product = products.find((entry) => String(entry.identifier ?? "").trim() === productId) ?? null;
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

  if (!await revalidateCreatorMoneyPurchaseSubject(purchaseSubject)) {
    return {
      ok: false,
      message: "Your session changed before VIP Pass checkout. Nothing was charged.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  try {
    await purchaseRevenueCatStoreProduct(product, { authority: purchaseSubject.authority });
  } catch (error) {
    const verifiedAccess = await waitForCreatorVipPassAccess(input.creatorId);
    if (verifiedAccess.allowed) {
      return {
        ok: true,
        message: "VIP confirmed.",
        access: verifiedAccess,
        intentId: intent.id,
        productId,
      };
    }

    return {
      ok: false,
      message: isRevenueCatUserCancellation(error)
        ? "VIP Pass purchase was canceled. Nothing changed."
        : "VIP Pass checkout could not be completed. Try again later.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

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
