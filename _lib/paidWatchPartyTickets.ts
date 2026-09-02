import { trackEvent } from "./analytics";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  validateCreatorMoneyPurchaseIntent,
  type CreatorMoneyPurchaseIntentExpectation,
} from "./creatorMoneyPurchaseAuthority";
import {
  getRevenueCatProductionReadiness,
  purchaseRevenueCatStoreProduct,
  readRevenueCatCustomerInfo,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import {
  findIosStoreProductByProductId,
  type IosStoreProductRecord,
} from "./iosAppStoreCommerce";
import { resolvePaymentRailPolicy } from "./paymentRailPolicy";
import { Platform } from "react-native";
import { reportRuntimeError } from "./logger";
import { getRuntimeConfig } from "./runtimeConfig";
import { supabase } from "./supabase";

export const PAID_WATCH_PARTY_TICKET_SANDBOX_PRODUCT_KEY = "watch_party_live_ticket_sandbox_099";
export const PAID_WATCH_PARTY_TICKET_SANDBOX_PROVIDER_PRODUCT_ID = "cw_watch_party_live_ticket_sandbox_099";
export const PAID_WATCH_PARTY_TICKET_POLL_ATTEMPTS = 10;
export const PAID_WATCH_PARTY_TICKET_POLL_DELAY_MS = 1500;

export type PaidWatchPartyOfferStatus =
  | "draft"
  | "sandbox"
  | "active"
  | "paused"
  | "sold_out"
  | "canceled"
  | "blocked"
  | "archived";

export type PaidWatchPartyOffer = {
  id: string;
  partyId: string | null;
  creatorId: string;
  hostId: string;
  titleId: string | null;
  videoId: string | null;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  seatLimit: number | null;
  seatsSold: number;
  startsAt: string | null;
  endsAt: string | null;
  status: PaidWatchPartyOfferStatus;
  provider: string;
  providerProductKey: string | null;
  providerProductId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaidWatchPartyTicketAccess = {
  allowed: boolean;
  reason: string;
  requiresPurchase: boolean;
  ticketId: string | null;
  priceCents: number | null;
  currency: string | null;
  creatorId: string | null;
  provider: string | null;
  providerProductId: string | null;
  providerProductKey: string | null;
  offer: PaidWatchPartyOffer | null;
};

export type PaidWatchPartyTransaction = {
  id: string;
  offerId: string;
  partyId: string | null;
  roomTitle: string;
  buyerId: string;
  creatorId: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerProductId: string | null;
  status: string;
  payoutStatus: string;
  environment: string;
  seatCount: number;
  createdAt: string;
  paidAt: string | null;
};

export type PaidWatchPartyTicketPurchaseResult = {
  ok: boolean;
  message: string;
  access: PaidWatchPartyTicketAccess;
  intentId?: string;
  productId?: string;
};

type RpcClient = {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

const toText = (value: unknown) => String(value ?? "").trim();
const ACCESS_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const accessText = (value: unknown) => (
  typeof value === "string"
    && value === value.trim()
    && value.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : ""
);
const isAccessProvider = (value: string) => (
  value === "revenuecat_app_store" || value === "revenuecat_google_play"
);
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

const normalizeOfferStatus = (value: unknown): PaidWatchPartyOfferStatus => {
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

const parseOffer = (row: Record<string, unknown>): PaidWatchPartyOffer | null => {
  const id = toText(row.id);
  const creatorId = toText(row.creatorId);
  const hostId = toText(row.hostId);
  if (!id || !creatorId || !hostId) return null;
  return {
    id,
    partyId: toText(row.partyId) || null,
    creatorId,
    hostId,
    titleId: toText(row.titleId) || null,
    videoId: toText(row.videoId) || null,
    title: toText(row.title) || "Party Room Pass",
    description: toText(row.description) || null,
    priceCents: toCents(row.priceCents),
    currency: toText(row.currency) || "usd",
    seatLimit: toNullableNumber(row.seatLimit),
    seatsSold: toCents(row.seatsSold),
    startsAt: toText(row.startsAt) || null,
    endsAt: toText(row.endsAt) || null,
    status: normalizeOfferStatus(row.status),
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductKey: toText(row.providerProductKey) || null,
    providerProductId: toText(row.providerProductId) || null,
    createdAt: toText(row.createdAt),
    updatedAt: toText(row.updatedAt),
  };
};

const parseTransaction = (row: Record<string, unknown>): PaidWatchPartyTransaction | null => {
  const id = toText(row.id);
  const offerId = toText(row.offerId);
  const creatorId = toText(row.creatorId);
  if (!id || !offerId || !creatorId) return null;
  return {
    id,
    offerId,
    partyId: toText(row.partyId) || null,
    roomTitle: toText(row.roomTitle) || "Party Room Pass",
    buyerId: toText(row.buyerId),
    creatorId,
    amountCents: toCents(row.amountCents),
    currency: toText(row.currency) || "usd",
    provider: toText(row.provider) || resolveRevenueCatProvider(),
    providerProductId: toText(row.providerProductId) || null,
    status: toText(row.status) || "pending",
    payoutStatus: toText(row.payoutStatus) || "not_payable",
    environment: toText(row.environment) || "sandbox",
    seatCount: toCents(row.seatCount),
    createdAt: toText(row.createdAt),
    paidAt: toText(row.paidAt) || null,
  };
};

const unavailableTicketAccess = (reason = "malformed_access_response"): PaidWatchPartyTicketAccess => ({
  allowed: false,
  reason,
  requiresPurchase: false,
  ticketId: null,
  priceCents: null,
  currency: null,
  creatorId: null,
  provider: null,
  providerProductId: null,
  providerProductKey: null,
  offer: null,
});

const parseAuthoritativeTicketOffer = (
  value: unknown,
  expectedPartyId: string,
): PaidWatchPartyOffer | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const offer = parseOffer(row);
  if (!offer) return null;
  const status = accessText(row.status);
  return ACCESS_UUID_PATTERN.test(accessText(row.id))
    && accessText(row.partyId) === expectedPartyId
    && ACCESS_UUID_PATTERN.test(accessText(row.creatorId))
    && ACCESS_UUID_PATTERN.test(accessText(row.hostId))
    && typeof row.priceCents === "number"
    && Number.isSafeInteger(row.priceCents)
    && row.priceCents > 0
    && /^[a-z]{3}$/.test(accessText(row.currency))
    && isAccessProvider(accessText(row.provider))
    && !!accessText(row.providerProductId)
    && !!accessText(row.providerProductKey)
    && ["sandbox", "active", "paused", "sold_out"].includes(status)
    ? offer
    : null;
};

const normalizeAccess = (value: unknown, expectedPartyId: string): PaidWatchPartyTicketAccess => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailableTicketAccess();
  const row = value as Record<string, unknown>;
  const reason = accessText(row.reason);
  if (typeof row.allowed !== "boolean" || typeof row.requiresPurchase !== "boolean" || !reason) {
    return unavailableTicketAccess();
  }
  const offer = row.offer == null ? null : parseAuthoritativeTicketOffer(row.offer, expectedPartyId);
  if (row.allowed) {
    if (row.requiresPurchase) return unavailableTicketAccess();
    if (reason === "free_room" && row.offer == null && accessText(row.ticketId) === "") {
      return { ...unavailableTicketAccess(reason), allowed: true };
    }
    if (
      reason === "host_or_admin"
      && row.previewAuthority === true
      && offer
      && accessText(row.ticketId) === ""
    ) {
      return { ...unavailableTicketAccess(reason), allowed: true, creatorId: offer.creatorId, offer };
    }
    if (reason === "ticket_confirmed" && offer && ACCESS_UUID_PATTERN.test(accessText(row.ticketId))) {
      return {
        allowed: true,
        reason,
        requiresPurchase: false,
        ticketId: accessText(row.ticketId),
        priceCents: offer.priceCents,
        currency: offer.currency,
        creatorId: offer.creatorId,
        provider: offer.provider,
        providerProductId: offer.providerProductId,
        providerProductKey: offer.providerProductKey,
        offer,
      };
    }
    return unavailableTicketAccess();
  }
  if (reason !== "ticket_required") return unavailableTicketAccess(reason);
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
  ) return unavailableTicketAccess();
  return {
    allowed: false,
    reason,
    requiresPurchase: true,
    ticketId: null,
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
  const value = (error as Record<string, unknown>)[key];
  return toText(value);
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

export const formatPaidWatchPartyTicketPrice = (amountCents: number, currency = "usd") =>
  formatMonetizationCurrency(amountCents, currency);

export async function listMyPaidWatchPartyOffers(): Promise<PaidWatchPartyOffer[]> {
  const { data, error } = await rpcClient.rpc("list_my_paid_watch_party_offers");
  if (error) return [];
  return parseJsonArray(data, parseOffer);
}

export async function listMyPaidWatchPartyTransactions(limit = 50): Promise<PaidWatchPartyTransaction[]> {
  const { data, error } = await rpcClient.rpc("list_my_paid_watch_party_transactions", {
    p_limit: Math.max(1, Math.min(100, Math.trunc(limit || 50))),
  });
  if (error) return [];
  return parseJsonArray(data, parseTransaction);
}

export async function readPublicPaidWatchPartyTicketOfferForCreator(creatorId: string): Promise<PaidWatchPartyOffer | null> {
  const normalizedCreatorId = toText(creatorId);
  if (!normalizedCreatorId) return null;

  const { data, error } = await (supabase as any)
    .from("paid_watch_party_offers")
    .select("id,party_id,creator_id,host_id,title_id,video_id,title,description,price_cents,currency,seat_limit,seats_sold,starts_at,ends_at,status,provider,provider_product_key,provider_product_id,created_at,updated_at")
    .eq("creator_id", normalizedCreatorId)
    .in("status", ["sandbox", "active"])
    .not("party_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return parseOffer({
    id: data.id,
    partyId: data.party_id,
    creatorId: data.creator_id,
    hostId: data.host_id,
    titleId: data.title_id,
    videoId: data.video_id,
    title: data.title,
    description: data.description,
    priceCents: data.price_cents,
    currency: data.currency,
    seatLimit: data.seat_limit,
    seatsSold: data.seats_sold,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    provider: data.provider,
    providerProductKey: data.provider_product_key,
    providerProductId: data.provider_product_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}

export async function savePaidWatchPartyOffer(input: {
  partyId: string;
  title?: string | null;
  priceCents?: number | null;
  seatLimit?: number | null;
  status?: PaidWatchPartyOfferStatus;
}): Promise<PaidWatchPartyOffer> {
  const { data, error } = await rpcClient.rpc("set_paid_watch_party_offer", {
    p_party_id: input.partyId,
    p_title: input.title ?? null,
    p_price_cents: Math.max(0, Math.trunc(input.priceCents ?? 99)),
    p_seat_limit: input.seatLimit == null ? null : Math.max(1, Math.trunc(input.seatLimit)),
    p_status: input.status ?? "sandbox",
  });
  if (error) throw new Error("Party Room entry settings could not be saved.");
  const offer = data && typeof data === "object" && !Array.isArray(data)
    ? parseOffer(data as Record<string, unknown>)
    : null;
  if (!offer) throw new Error("Party Room entry settings could not be read.");
  return offer;
}

export async function resolvePaidWatchPartyTicketAccess(partyId: string): Promise<PaidWatchPartyTicketAccess> {
  const { data, error } = await rpcClient.rpc("resolve_paid_watch_party_ticket_access", {
    p_party_id: partyId,
  });
  if (error) {
    return {
      allowed: false,
      reason: "access_check_failed",
      requiresPurchase: false,
      ticketId: null,
      priceCents: null,
      currency: null,
      creatorId: null,
      provider: null,
      providerProductId: null,
      providerProductKey: null,
      offer: null,
    };
  }
  return normalizeAccess(data, partyId);
}

export async function createPaidWatchPartyTicketPurchaseIntent(
  offerId: string,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation, "status">,
) {
  const { data, error } = await rpcClient.rpc("create_paid_watch_party_ticket_purchase_intent", {
    p_offer_id: offerId,
  });
  if (error) throw new Error("Party Room Pass checkout is not available right now.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Party Room Pass checkout authority could not be verified.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.alreadyPurchased !== "boolean") {
    throw new Error("Party Room Pass checkout authority could not be verified.");
  }
  const validated = validateCreatorMoneyPurchaseIntent(data, {
    ...expected,
    status: row.alreadyPurchased ? "consumed" : "pending",
  });
  if (!validated) throw new Error("Party Room Pass checkout authority could not be verified.");
  return {
    ...validated,
    alreadyPurchased: row.alreadyPurchased,
  };
}

const createIosPaidWatchPartyTicketPurchaseIntent = async (
  offerId: string,
  product: IosStoreProductRecord,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation, "status">,
) => {
  const { data, error } = await rpcClient.rpc("create_ios_app_store_purchase_intent", {
    p_metadata: {
      amount_minor: String(product.referencePriceMinor),
      currency: "usd",
      no_live_payout: true,
      not_payable: true,
      sandbox_only: true,
      source_surface: "watch_party_seat_pass",
      viewer_only: true,
    },
    p_provider_product_id: product.productId,
    p_source_id: offerId,
    p_source_type: "watch_party_live",
  });
  if (error) throw new Error("App Store Party Room Pass checkout is not available right now.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("App Store Party Room Pass checkout authority could not be verified.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.alreadyPurchased !== "boolean") {
    throw new Error("App Store Party Room Pass checkout authority could not be verified.");
  }
  const validated = validateCreatorMoneyPurchaseIntent(data, {
    ...expected,
    status: row.alreadyPurchased ? "consumed" : "pending",
  });
  if (!validated || validated.providerProductId !== product.productId) {
    throw new Error("App Store Party Room Pass checkout authority could not be verified.");
  }
  return {
    ...validated,
    alreadyPurchased: row.alreadyPurchased,
  };
};

export async function waitForPaidWatchPartyTicketAccess(partyId: string): Promise<PaidWatchPartyTicketAccess> {
  let latest = await resolvePaidWatchPartyTicketAccess(partyId);
  if (latest.allowed) return latest;
  for (let attempt = 0; attempt < PAID_WATCH_PARTY_TICKET_POLL_ATTEMPTS; attempt += 1) {
    await delay(PAID_WATCH_PARTY_TICKET_POLL_DELAY_MS);
    latest = await resolvePaidWatchPartyTicketAccess(partyId);
    if (latest.allowed) return latest;
  }
  return latest;
}

export async function purchasePaidWatchPartyTicket(input: {
  partyId: string;
  sourceSurface: string;
}): Promise<PaidWatchPartyTicketPurchaseResult> {
  const access = await resolvePaidWatchPartyTicketAccess(input.partyId);
  if (access.allowed) {
    return { ok: true, message: "Party Room Pass active. You're cleared to enter this Party Room.", access };
  }
  if (!access.requiresPurchase || !access.offer?.id) {
    return { ok: false, message: "This Party Room Pass is not available right now.", access };
  }
  if (
    !access.creatorId
    || (access.provider !== "revenuecat_app_store" && access.provider !== "revenuecat_google_play")
    || !access.providerProductId
    || typeof access.priceCents !== "number"
    || !access.currency
  ) return { ok: false, message: "This Party Room Pass is not available right now.", access };

  const iosProduct = Platform.OS === "ios"
    ? access.offer.providerProductId
      ? findIosStoreProductByProductId(access.offer.providerProductId)
      : null
    : null;
  if (Platform.OS === "ios") {
    if (
      !iosProduct
      || iosProduct.concept !== "seat_pass"
      || iosProduct.productType !== "consumable"
      || iosProduct.referencePriceMinor !== access.offer.priceCents
      || access.priceCents !== access.offer.priceCents
      || access.providerProductId !== iosProduct.productId
    ) {
      return {
        ok: false,
        message: "This Party Room Pass does not match an approved App Store tier. Nothing was charged.",
        access,
      };
    }
    const runtime = getRuntimeConfig();
    const readiness = getRevenueCatProductionReadiness();
    const decision = resolvePaymentRailPolicy({
      appStorePurchasesEnabled: runtime.revenueCat.appStorePurchasesEnabled,
      environment: "sandbox",
      liveMoneyEnabled: false,
      platform: "ios",
      providerReady: readiness.iosPublicKeyConfigured,
      store: "app_store",
      unlocksDigitalAccess: true,
      useCase: "watch_party_seat_pass",
    });
    if (!decision.allowed || decision.provider !== "revenuecat_app_store") {
      return {
        ok: false,
        message: "App Store sandbox Party Room Passes are disabled for this build. Nothing was charged.",
        access,
      };
    }
  }

  const purchaseSubject = await prepareCreatorMoneyPurchaseSubject();
  if (!purchaseSubject) {
    return {
      ok: false,
      message: "Sign in again before starting Party Room Pass checkout. Nothing was charged.",
      access,
    };
  }
  const expectedIntent: Omit<CreatorMoneyPurchaseIntentExpectation, "status"> = {
    userId: purchaseSubject.userId,
    sourceType: "watch_party_live",
    sourceId: access.offer.id,
    creatorId: access.creatorId,
    provider: access.provider,
    providerProductId: access.providerProductId,
    environment: access.offer.status === "active" ? "production" : "sandbox",
    amountMinor: access.priceCents,
    currency: access.currency,
  };
  const intent = Platform.OS === "ios" && iosProduct
    ? await createIosPaidWatchPartyTicketPurchaseIntent(access.offer.id, iosProduct, expectedIntent)
    : await createPaidWatchPartyTicketPurchaseIntent(access.offer.id, expectedIntent);
  if (intent.alreadyPurchased) {
    const verifiedAccess = await waitForPaidWatchPartyTicketAccess(input.partyId);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed
        ? "Party Room Pass active. You're cleared to enter this Party Room."
        : "Party Room Pass is still being confirmed.",
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
      message: "Party Room Pass sandbox product is not available on this device yet.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("room_ticket_purchase_started", {
    creator_id: access.creatorId,
    offer_type: "paid_watch_party",
    price_bucket: formatPaidWatchPartyTicketPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "watch-party",
    room_type: "party_room",
    source_surface: input.sourceSurface,
  });

  if (!await revalidateCreatorMoneyPurchaseSubject(purchaseSubject)) {
    return {
      ok: false,
      message: "Your session changed before Party Room Pass checkout. Nothing was charged.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  try {
    await purchaseRevenueCatStoreProduct(product, { authority: purchaseSubject.authority });
  } catch (error) {
    await readRevenueCatCustomerInfo({ refresh: true });
    const verifiedAccess = await waitForPaidWatchPartyTicketAccess(input.partyId);
    if (verifiedAccess.allowed) {
      return {
        ok: true,
        message: "Party Room Pass active. You're cleared to enter this Party Room.",
        access: verifiedAccess,
        intentId: intent.id,
        productId,
      };
    }

    if (isRevenueCatUserCancellation(error)) {
      return {
        ok: false,
        message: "Party Room Pass purchase was canceled. Nothing changed.",
        access: verifiedAccess,
        intentId: intent.id,
        productId,
      };
    }

    reportRuntimeError("watch-party-ticket-purchase", error, {
      productId,
      sourceSurface: input.sourceSurface,
    });

    return {
      ok: false,
      message: Platform.OS === "ios"
        ? "Party Room Pass purchase did not finish. If the App Store shows it as pending, refresh this room in a moment."
        : "Party Room Pass purchase did not finish. If Google Play shows it as pending, refresh this room in a moment.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  await readRevenueCatCustomerInfo({ refresh: true });
  const verifiedAccess = await waitForPaidWatchPartyTicketAccess(input.partyId);
  if (!verifiedAccess.allowed) {
    return {
      ok: false,
      message: "Purchase received. Waiting for the verified Party Room Pass to finish.",
      access: verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  trackEvent("room_ticket_purchase_succeeded", {
    creator_id: verifiedAccess.creatorId ?? access.creatorId,
    offer_type: "paid_watch_party",
    price_bucket: formatPaidWatchPartyTicketPrice(access.priceCents ?? access.offer.priceCents, access.currency ?? access.offer.currency),
    route_name: "watch-party",
    room_type: "party_room",
    source_surface: input.sourceSurface,
  });

  return {
    ok: true,
    message: "Party Room Pass active. You're cleared to enter this Party Room.",
    access: verifiedAccess,
    intentId: intent.id,
    productId,
  };
}
