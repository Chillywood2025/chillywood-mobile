import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  validateCreatorMoneyPurchaseIntent,
  validateHistoricalCreatorMoneyPurchaseIntent,
  type CreatorMoneyPurchaseIntentExpectation,
} from "./creatorMoneyPurchaseAuthority";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { Platform } from "react-native";
import {
  IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY,
  resolveIosFiniteAppStoreTier,
} from "./iosAppStoreCommerce";
import { resolvePaymentRailPolicy } from "./paymentRailPolicy";
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

const ACCESS_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const accessText = (value: unknown) => (
  typeof value === "string" && value === value.trim() ? value : ""
);
const isAccessProvider = (value: string) => (
  value === "revenuecat_app_store" || value === "revenuecat_google_play"
);
const unavailableEventAccess = (reason = "malformed_access_response"): PaidCreatorEventAccess => ({
  allowed: false,
  reason,
  requiresPurchase: false,
  passId: null,
  priceCents: null,
  currency: null,
  creatorId: null,
  provider: null,
  providerProductId: null,
  providerProductKey: null,
  offer: null,
});

const parseAuthoritativeEventOffer = (
  value: unknown,
  expectedCreatorEventId: string,
): PaidCreatorEventOffer | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const offer = parseOffer(row);
  if (!offer) return null;
  const provider = accessText(row.provider);
  const status = accessText(row.status);
  return ACCESS_UUID_PATTERN.test(accessText(row.id))
    && ACCESS_UUID_PATTERN.test(accessText(row.creatorEventId))
    && accessText(row.creatorEventId) === expectedCreatorEventId
    && ACCESS_UUID_PATTERN.test(accessText(row.creatorId))
    && typeof row.priceCents === "number"
    && Number.isSafeInteger(row.priceCents)
    && row.priceCents > 0
    && /^[a-z]{3}$/.test(accessText(row.currency))
    && isAccessProvider(provider)
    && !!accessText(row.providerProductId)
    && !!accessText(row.providerProductKey)
    && ["sandbox", "active", "paused", "sold_out"].includes(status)
    ? offer
    : null;
};

const normalizeAccess = (value: unknown, expectedCreatorEventId: string): PaidCreatorEventAccess => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailableEventAccess();
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const reason = accessText(row.reason);
  if (typeof row.allowed !== "boolean" || typeof row.requiresPurchase !== "boolean" || !reason) {
    return unavailableEventAccess();
  }
  const offer = row.offer === null || row.offer === undefined
    ? null
    : parseAuthoritativeEventOffer(row.offer, expectedCreatorEventId);

  if (row.allowed) {
    if (row.requiresPurchase) return unavailableEventAccess();
    if (reason === "free_event" && row.offer == null && accessText(row.passId) === "") {
      return { ...unavailableEventAccess(reason), allowed: true };
    }
    if (
      reason === "creator_or_admin"
      && row.previewAuthority === true
      && offer
      && accessText(row.passId) === ""
    ) {
      return { ...unavailableEventAccess(reason), allowed: true, creatorId: offer.creatorId, offer };
    }
    if (reason === "event_pass_confirmed" && offer && ACCESS_UUID_PATTERN.test(accessText(row.passId))) {
      return {
        allowed: true,
        reason,
        requiresPurchase: false,
        passId: accessText(row.passId),
        priceCents: offer.priceCents,
        currency: offer.currency,
        creatorId: offer.creatorId,
        provider: offer.provider,
        providerProductId: offer.providerProductId,
        providerProductKey: offer.providerProductKey,
        offer,
      };
    }
    return unavailableEventAccess();
  }

  if (reason !== "event_pass_required") return unavailableEventAccess(reason);
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
  ) return unavailableEventAccess();
  return {
    allowed: false,
    reason,
    requiresPurchase: true,
    passId: null,
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
  return normalizeAccess(data, creatorEventId);
}

export async function createPaidCreatorEventPassPurchaseIntent(
  offerId: string,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation, "status">,
) {
  const { data, error } = await rpcClient.rpc("create_paid_creator_event_pass_purchase_intent", {
    p_event_id: offerId,
  });
  if (error) throw new Error("Event pass checkout is not available right now.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Event pass checkout authority could not be verified.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.alreadyPurchased !== "boolean") {
    throw new Error("Event pass checkout authority could not be verified.");
  }
  const validated = row.alreadyPurchased
    ? validateHistoricalCreatorMoneyPurchaseIntent(data, expected)
    : Platform.OS === "ios"
      ? (() => {
          const tier = expected.currency === "usd"
            ? resolveIosFiniteAppStoreTier("event_pass", expected.amountMinor)
            : null;
          return tier ? validateCreatorMoneyPurchaseIntent(data, {
            ...expected,
            provider: "revenuecat_app_store",
            providerProductId: tier.productId,
            status: "pending",
          }) : null;
        })()
      : Platform.OS === "android" && expected.provider === "revenuecat_google_play"
        ? validateCreatorMoneyPurchaseIntent(data, { ...expected, status: "pending" })
        : null;
  if (!validated) throw new Error("Event pass checkout authority could not be verified.");
  return {
    ...validated,
    alreadyPurchased: row.alreadyPurchased,
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
  if (
    !access.creatorId
    || (access.provider !== "revenuecat_app_store" && access.provider !== "revenuecat_google_play")
    || !access.providerProductId
    || typeof access.priceCents !== "number"
    || !access.currency
  ) return { ok: false, message: "This event pass is not available right now.", access };

  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { ok: false, message: "This event pass is not available on this device.", access };
  }
  if (Platform.OS === "android" && access.provider !== "revenuecat_google_play") {
    return { ok: false, message: "This event pass is not available right now.", access };
  }
  if (Platform.OS === "ios" && (
    access.currency !== "usd"
    || !resolveIosFiniteAppStoreTier("event_pass", access.priceCents)
  )) {
    return { ok: false, message: IOS_DYNAMIC_APP_STORE_UNAVAILABLE_COPY, access };
  }

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
      message: "Sign in again before starting Event Pass checkout. Nothing was charged.",
      access,
    };
  }
  const intent = await createPaidCreatorEventPassPurchaseIntent(access.offer.id, {
    userId: purchaseSubject.userId,
    sourceType: "event",
    sourceId: input.creatorEventId,
    creatorId: access.creatorId,
    provider: access.provider,
    providerProductId: access.providerProductId,
    environment: access.offer.status === "active" ? "production" : "sandbox",
    amountMinor: access.priceCents,
    currency: access.currency,
  });
  if (intent.alreadyPurchased) {
    const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed ? "Event pass confirmed." : "Event pass is still being confirmed.",
      access: verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = intent.providerProductId;
  const products = await readRevenueCatNonSubscriptionProducts([productId]);
  const product = products.find((entry) => String(entry.identifier ?? "").trim() === productId) ?? null;
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

  if (!await revalidateCreatorMoneyPurchaseSubject(purchaseSubject)) {
    return {
      ok: false,
      message: "Your session changed before Event Pass checkout. Nothing was charged.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  try {
    await purchaseRevenueCatStoreProduct(product, { authority: purchaseSubject.authority });
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
