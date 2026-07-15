import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export const PAID_CREATOR_EVENT_SANDBOX_PRODUCT_KEY = "event_pass_sandbox_099";
export const PAID_CREATOR_EVENT_SANDBOX_PROVIDER_PRODUCT_ID = "cw_event_pass_sandbox_099";
export const PAID_CREATOR_EVENT_POLL_ATTEMPTS = 10;
export const PAID_CREATOR_EVENT_POLL_DELAY_MS = 1500;

export type PaidCreatorEventOfferStatus =
  | "draft"
  | "sandbox"
  | "active"
  | "paused"
  | "sold_out"
  | "canceled"
  | "blocked"
  | "archived";

export type PaidCreatorEventOffer = {
  id: string;
  creatorEventId: string;
  creatorId: string;
  title: string;
  description: string | null;
  eventType: string;
  startsAt: string | null;
  endsAt: string | null;
  priceCents: number;
  currency: string;
  capacityLimit: number | null;
  passesSold: number;
  status: PaidCreatorEventOfferStatus;
  provider: string;
  providerProductKey: string | null;
  providerProductId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaidCreatorEventAccess = {
  allowed: boolean;
  reason: string;
  requiresPurchase: boolean;
  passId: string | null;
  priceCents: number | null;
  currency: string | null;
  creatorId: string | null;
  provider: string | null;
  providerProductId: string | null;
  providerProductKey: string | null;
  offer: PaidCreatorEventOffer | null;
};

export type PaidCreatorEventTransaction = {
  id: string;
  eventId: string;
  creatorEventId: string;
  eventTitle: string;
  buyerId: string;
  creatorId: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerProductId: string | null;
  status: string;
  payoutStatus: string;
  environment: string;
  passCount: number;
  createdAt: string;
  paidAt: string | null;
};

export type PaidCreatorEventPurchaseResult = {
  ok: boolean;
  message: string;
  access: PaidCreatorEventAccess;
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
const toNullableNumber = (value: unknown) => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const parseJsonArray = <T>(value: unknown, parser: (row: Record<string, unknown>) => T | null): T[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? parser(entry as Record<string, unknown>) : null))
    .filter((entry): entry is T => !!entry);
};

const normalizeOfferStatus = (value: unknown): PaidCreatorEventOfferStatus => {
  const normalized = toText(value).toLowerCase();
  if (
    normalized === "draft"
    || normalized === "sandbox"
    || normalized === "active"
    || normalized === "paused"
    || normalized === "sold_out"
    || normalized === "canceled"
    || normalized === "blocked"
    || normalized === "archived"
  ) {
    return normalized;
  }
  return "draft";
};

const parseOffer = (row: Record<string, unknown>): PaidCreatorEventOffer | null => {
  const id = toText(row.id);
  const creatorEventId = toText(row.creatorEventId);
  const creatorId = toText(row.creatorId);
  if (!id || !creatorEventId || !creatorId) return null;
  return {
    id,
    creatorEventId,
    creatorId,
    title: toText(row.title) || "Creator event pass",
    description: toText(row.description) || null,
    eventType: toText(row.eventType) || "live_first",
    startsAt: toText(row.startsAt) || null,
    endsAt: toText(row.endsAt) || null,
    priceCents: toCents(row.priceCents),
    currency: toText(row.currency) || "usd",
    capacityLimit: toNullableNumber(row.capacityLimit),
    passesSold: toCents(row.passesSold),
    status: normalizeOfferStatus(row.status),
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductKey: toText(row.providerProductKey) || null,
    providerProductId: toText(row.providerProductId) || null,
    createdAt: toText(row.createdAt),
    updatedAt: toText(row.updatedAt),
  };
};

const parseTransaction = (row: Record<string, unknown>): PaidCreatorEventTransaction | null => {
  const id = toText(row.id);
  const eventId = toText(row.eventId);
  const creatorEventId = toText(row.creatorEventId);
  const creatorId = toText(row.creatorId);
  if (!id || !eventId || !creatorEventId || !creatorId) return null;
  return {
    id,
    eventId,
    creatorEventId,
    eventTitle: toText(row.eventTitle) || "Creator event pass",
    buyerId: toText(row.buyerId),
    creatorId,
    amountCents: toCents(row.amountCents),
    currency: toText(row.currency) || "usd",
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductId: toText(row.providerProductId) || null,
    status: toText(row.status) || "pending",
    payoutStatus: toText(row.payoutStatus) || "not_payable",
    environment: toText(row.environment) || "sandbox",
    passCount: toCents(row.passCount),
    createdAt: toText(row.createdAt),
    paidAt: toText(row.paidAt) || null,
  };
};

const normalizeAccess = (value: unknown): PaidCreatorEventAccess => {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const offer = row.offer && typeof row.offer === "object" && !Array.isArray(row.offer)
    ? parseOffer(row.offer as Record<string, unknown>)
    : null;
  return {
    allowed: row.allowed === true,
    reason: toText(row.reason) || "unknown",
    requiresPurchase: row.requiresPurchase === true || toText(row.reason) === "event_pass_required",
    passId: toText(row.passId) || null,
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

export const formatPaidCreatorEventPrice = (amountCents: number, currency = "usd") =>
  formatMonetizationCurrency(amountCents, currency);

export async function listMyPaidCreatorEventOffers(): Promise<PaidCreatorEventOffer[]> {
  const { data, error } = await rpcClient.rpc("list_my_paid_creator_event_offers");
  if (error) return [];
  return parseJsonArray(data, parseOffer);
}

export async function listMyPaidCreatorEventTransactions(limit = 50): Promise<PaidCreatorEventTransaction[]> {
  const { data, error } = await rpcClient.rpc("list_my_paid_creator_event_transactions", {
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit || 50))),
  });
  if (error) return [];
  return parseJsonArray(data, parseTransaction);
}

export async function savePaidCreatorEventOffer(input: {
  creatorEventId: string;
  description?: string | null;
  priceCents?: number | null;
  capacityLimit?: number | null;
  status?: PaidCreatorEventOfferStatus;
}): Promise<PaidCreatorEventOffer> {
  const { data, error } = await rpcClient.rpc("set_paid_creator_event_offer", {
    p_creator_event_id: input.creatorEventId,
    p_description: input.description ?? null,
    p_price_cents: Math.max(0, Math.trunc(input.priceCents ?? 99)),
    p_capacity_limit: input.capacityLimit == null ? null : Math.max(1, Math.trunc(input.capacityLimit)),
    p_status: input.status ?? "sandbox",
  });
  if (error) throw new Error("Paid Event settings could not be saved.");
  const offer = data && typeof data === "object" && !Array.isArray(data)
    ? parseOffer(data as Record<string, unknown>)
    : null;
  if (!offer) throw new Error("Paid Event settings could not be read.");
  return offer;
}

export async function resolvePaidCreatorEventPassAccess(creatorEventId: string): Promise<PaidCreatorEventAccess> {
  const { data, error } = await rpcClient.rpc("resolve_paid_creator_event_pass_access", {
    p_creator_event_id: creatorEventId,
  });
  if (error) {
    return {
      allowed: false,
      reason: "access_check_failed",
      requiresPurchase: false,
      passId: null,
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

export async function createPaidCreatorEventPassPurchaseIntent(offerId: string) {
  const { data, error } = await rpcClient.rpc("create_paid_creator_event_pass_purchase_intent", {
    p_event_id: offerId,
  });
  if (error) throw new Error("Event pass checkout is not available right now.");
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    id: toText(row.id),
    providerProductId: toText(row.providerProductId) || PAID_CREATOR_EVENT_SANDBOX_PROVIDER_PRODUCT_ID,
    alreadyPurchased: row.alreadyPurchased === true,
  };
}

export async function waitForPaidCreatorEventPassAccess(creatorEventId: string): Promise<PaidCreatorEventAccess> {
  let latest = await resolvePaidCreatorEventPassAccess(creatorEventId);
  if (latest.allowed) return latest;
  for (let attempt = 0; attempt < PAID_CREATOR_EVENT_POLL_ATTEMPTS; attempt += 1) {
    await delay(PAID_CREATOR_EVENT_POLL_DELAY_MS);
    latest = await resolvePaidCreatorEventPassAccess(creatorEventId);
    if (latest.allowed) return latest;
  }
  return latest;
}

export async function purchasePaidCreatorEventPass(input: {
  creatorEventId: string;
  sourceSurface: string;
}): Promise<PaidCreatorEventPurchaseResult> {
  const access = await resolvePaidCreatorEventPassAccess(input.creatorEventId);
  if (access.allowed) {
    return { ok: true, message: "Event pass confirmed.", access };
  }
  if (!access.requiresPurchase || !access.offer?.id) {
    return { ok: false, message: "This event pass is not available right now.", access };
  }

  const intent = await createPaidCreatorEventPassPurchaseIntent(access.offer.id);
  if (intent.alreadyPurchased) {
    const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed ? "Event pass confirmed." : "Event pass is still being confirmed.",
      access: verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = intent.providerProductId || access.providerProductId || PAID_CREATOR_EVENT_SANDBOX_PROVIDER_PRODUCT_ID;
  const products = await readRevenueCatNonSubscriptionProducts([productId]);
  const product = products.find((entry) => String(entry.identifier ?? "").trim() === productId) ?? products[0] ?? null;
  if (!product) {
    return {
      ok: false,
      message: "Event pass sandbox product is not available on this device yet.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("event_pass_purchase_started", {
    creator_id: access.creatorId,
    feature_key: "paid_events",
    offer_type: "paid_event",
    price_bucket: formatPaidCreatorEventPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "event",
    source_surface: input.sourceSurface,
  });

  try {
    await purchaseRevenueCatStoreProduct(product);
  } catch (error) {
    const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId);
    if (verifiedAccess.allowed) {
      return {
        ok: true,
        message: "Event pass confirmed. Open Event.",
        access: verifiedAccess,
        intentId: intent.id,
        productId,
      };
    }

    return {
      ok: false,
      message: isRevenueCatUserCancellation(error)
        ? "Event Pass purchase was canceled. Nothing changed."
        : "Event Pass checkout could not be completed. Try again later.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId);
  if (!verifiedAccess.allowed) {
    return {
      ok: false,
      message: "Purchase received. Waiting for the verified event pass to finish.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("event_pass_purchase_succeeded", {
    creator_id: verifiedAccess.creatorId ?? access.creatorId,
    feature_key: "paid_events",
    offer_type: "paid_event",
    price_bucket: formatPaidCreatorEventPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "event",
    source_surface: input.sourceSurface,
  });

  return {
    ok: true,
    message: "Event pass confirmed. Open Event.",
    access: verifiedAccess,
    intentId: intent.id,
    productId,
  };
}
