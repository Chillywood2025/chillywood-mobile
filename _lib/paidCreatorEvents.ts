import { trackEvent } from "./analytics";
import "react-native-get-random-values";
import { formatMonetizationCurrency } from "./creatorMonetization";
import {
  captureCreatorMoneyPurchaseAuthority,
  isCreatorMoneyPurchaseAuthorityCurrent,
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  invokeCreatorMoneyPurchaseSubjectRpc,
  validateCreatorMoneyPurchaseIntent,
  validateHistoricalCreatorMoneyPurchaseIntent,
  type CreatorMoneyPurchaseIntentExpectation,
  type CreatorMoneyPurchaseSubject,
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
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY, isCreatorMoneyStoreQuoteMatch } from "./creatorMoneyStoreQuote";

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
  termsRevisionId: string | null;
  timeZone: string;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  salesPaused: boolean;
  terms: PaidCreatorEventTerms | null;
};

export type PaidCreatorEventTerms = {
  id: string; offerId: string; creatorEventId: string; revision: number;
  title: string; description: string; priceCents: number; currency: string;
  startsAt: string; endsAt: string | null; timeZone: string;
  salesOpenAt: string | null; salesCloseAt: string | null; capacityLimit: number | null;
  attendance: "virtual"; replayPolicy: "none" | "indefinite" | "until_expiration";
  replayAvailableAt: string | null; replayExpiresAt: string | null;
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
    title: toText(row.title) || "Event Pass",
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
    termsRevisionId: toText(row.termsRevisionId) || null,
    timeZone: toText(row.timeZone) || "UTC",
    salesOpenAt: toText(row.salesOpenAt) || null,
    salesCloseAt: toText(row.salesCloseAt) || null,
    salesPaused: row.salesPaused === true,
    terms: parsePaidCreatorEventTerms(row.terms, { offerId: id, creatorEventId }),
  };
};

export function parsePaidCreatorEventTerms(value: unknown, expected: { offerId: string; creatorEventId: string }): PaidCreatorEventTerms | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!ACCESS_UUID_PATTERN.test(toText(row.id)) || row.offerId !== expected.offerId
    || row.creatorEventId !== expected.creatorEventId || row.attendance !== "virtual"
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || !Number.isSafeInteger(row.priceCents) || Number(row.priceCents) < 1
    || row.currency !== "usd" || !Number.isFinite(Date.parse(toText(row.startsAt)))
    || !["none", "indefinite", "until_expiration"].includes(toText(row.replayPolicy))) return null;
  const timeZone = toText(row.timeZone);
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(0); } catch { return null; }
  for (const key of ["endsAt", "salesOpenAt", "salesCloseAt", "replayAvailableAt", "replayExpiresAt"]) {
    if (row[key] != null && !Number.isFinite(Date.parse(toText(row[key])))) return null;
  }
  if (row.capacityLimit != null && (!Number.isSafeInteger(row.capacityLimit) || Number(row.capacityLimit) < 1)) return null;
  return {
    id: toText(row.id), offerId: expected.offerId, creatorEventId: expected.creatorEventId,
    revision: Number(row.revision), title: toText(row.title), description: toText(row.description),
    priceCents: Number(row.priceCents), currency: "usd", startsAt: toText(row.startsAt),
    endsAt: row.endsAt == null ? null : toText(row.endsAt), timeZone,
    salesOpenAt: row.salesOpenAt == null ? null : toText(row.salesOpenAt),
    salesCloseAt: row.salesCloseAt == null ? null : toText(row.salesCloseAt),
    capacityLimit: row.capacityLimit == null ? null : Number(row.capacityLimit), attendance: "virtual",
    replayPolicy: row.replayPolicy as PaidCreatorEventTerms["replayPolicy"],
    replayAvailableAt: row.replayAvailableAt == null ? null : toText(row.replayAvailableAt),
    replayExpiresAt: row.replayExpiresAt == null ? null : toText(row.replayExpiresAt),
  };
}

export async function configurePaidCreatorEventSale(input: {
  creatorEventId: string; description: string; priceCents: number; capacityLimit: number | null;
  status: PaidCreatorEventOfferStatus; timeZone: string; salesOpenAt: string | null; salesCloseAt: string | null;
  expectedUpdatedAt: string;
  expectedTerms: Pick<PaidCreatorEventTerms, "title" | "startsAt" | "endsAt" | "replayPolicy" | "replayAvailableAt" | "replayExpiresAt">;
}): Promise<PaidCreatorEventOffer> {
  if (!Number.isFinite(Date.parse(input.expectedUpdatedAt)) || !input.expectedTerms) throw new Error("Refresh the event schedule before saving ticket terms.");
  const authority = captureCreatorMoneyPurchaseAuthority();
  if (!authority || !isCreatorMoneyPurchaseAuthorityCurrent(authority)) throw new Error("Sign in to the creator account before saving ticket terms.");
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>("configure_paid_creator_event_sale", {
    p_creator_event_id: input.creatorEventId, p_description: input.description,
    p_price_cents: input.priceCents, p_capacity_limit: input.capacityLimit, p_status: input.status,
    p_time_zone: input.timeZone, p_sales_open_at: input.salesOpenAt, p_sales_close_at: input.salesCloseAt,
    p_expected_updated_at: input.expectedUpdatedAt,
  }, authority.userId);
  if (error) throw new Error("Event ticket settings could not be verified. Your changes are still here; refresh before retrying.");
  const offer = data && typeof data === "object" ? parseOffer(data) : null;
  const sameTime = (actual: string | null, expected: string | null) => actual === null || expected === null
    ? actual === expected : Date.parse(actual) === Date.parse(expected);
  if (!isCreatorMoneyPurchaseAuthorityCurrent(authority) || !offer || !offer.terms || offer.termsRevisionId !== offer.terms.id
    || offer.creatorEventId !== input.creatorEventId || offer.creatorId !== authority.userId
    || offer.priceCents !== input.priceCents || offer.currency !== "usd"
    || offer.capacityLimit !== input.capacityLimit || offer.description !== input.description
    || offer.terms.priceCents !== input.priceCents || offer.terms.currency !== "usd"
    || offer.terms.capacityLimit !== input.capacityLimit || offer.terms.description !== input.description
    || offer.timeZone !== input.timeZone || offer.terms.timeZone !== input.timeZone
    || offer.title !== input.expectedTerms.title || offer.terms.title !== input.expectedTerms.title
    || !sameTime(offer.startsAt, input.expectedTerms.startsAt) || !sameTime(offer.endsAt, input.expectedTerms.endsAt)
    || !sameTime(offer.terms.startsAt, input.expectedTerms.startsAt) || !sameTime(offer.terms.endsAt, input.expectedTerms.endsAt)
    || offer.terms.replayPolicy !== input.expectedTerms.replayPolicy
    || !sameTime(offer.terms.replayAvailableAt, input.expectedTerms.replayAvailableAt)
    || !sameTime(offer.terms.replayExpiresAt, input.expectedTerms.replayExpiresAt)
    || !sameTime(offer.salesOpenAt, input.salesOpenAt) || !sameTime(offer.salesCloseAt, input.salesCloseAt)
    || !sameTime(offer.terms.salesOpenAt, input.salesOpenAt) || !sameTime(offer.terms.salesCloseAt, input.salesCloseAt)
    || (input.status === "paused" ? !offer.salesPaused || !["active", "sandbox"].includes(offer.status) : offer.status !== input.status || offer.salesPaused)
  ) throw new Error("Event ticket terms could not be verified. Refresh before retrying.");
  return offer;
}

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
    eventTitle: toText(row.eventTitle) || "Event Pass",
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

const createEventCheckoutAttemptId = () => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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

export async function listMyPaidCreatorEventOffers(options?: { throwOnUnavailable?: boolean }): Promise<PaidCreatorEventOffer[]> {
  const { data, error } = await rpcClient.rpc("list_my_paid_creator_event_offers");
  const offers = parseJsonArray(data, parseOffer);
  if (error || !Array.isArray(data) || offers.length !== data.length) {
    if (options?.throwOnUnavailable) throw new Error("Event ticket settings could not be verified.");
    return [];
  }
  return offers;
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
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>("set_paid_creator_event_offer", {
    p_creator_event_id: input.creatorEventId,
    p_description: input.description ?? null,
    p_price_cents: Math.max(0, Math.trunc(input.priceCents ?? 99)),
    p_capacity_limit: input.capacityLimit == null ? null : Math.max(1, Math.trunc(input.capacityLimit)),
    p_status: input.status ?? "sandbox",
  });
  if (error) throw new Error("Event Pass settings could not be saved.");
  const offer = data && typeof data === "object" && !Array.isArray(data)
    ? parseOffer(data as Record<string, unknown>)
    : null;
  if (!offer) throw new Error("Event Pass settings could not be read.");
  return offer;
}

export async function resolvePaidCreatorEventPassAccess(creatorEventId: string): Promise<PaidCreatorEventAccess> {
  const response = await withAuthorityReadDeadline(
    rpcClient.rpc("resolve_paid_creator_event_pass_access", { p_creator_event_id: creatorEventId }),
    null,
  );
  if (!response || response.error) {
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
  return normalizeAccess(response.data, creatorEventId);
}

export async function createPaidCreatorEventPassPurchaseIntent(
  offerId: string,
  expected: Omit<CreatorMoneyPurchaseIntentExpectation, "status">,
  subject: CreatorMoneyPurchaseSubject,
  termsRevisionId: string,
) {
  if (!ACCESS_UUID_PATTERN.test(termsRevisionId)) throw new Error("Refresh the Event Pass terms before checkout.");
  const response = await invokeCreatorMoneyPurchaseSubjectRpc<Record<string, unknown>>(
    subject,
    "create_reserved_creator_event_purchase_intent",
    { p_event_id: offerId, p_expected_revision_id: termsRevisionId },
  );
  if (!response || response.error) throw new Error("Event Pass checkout is not available right now.");
  const data = response.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Event Pass checkout authority could not be verified.");
  }
  const row = data as Record<string, unknown>;
  if (typeof row.alreadyPurchased !== "boolean") {
    throw new Error("Event Pass checkout authority could not be verified.");
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
  if (!validated) throw new Error("Event Pass checkout authority could not be verified.");
  return {
    ...validated,
    alreadyPurchased: row.alreadyPurchased,
  };
}

export async function waitForPaidCreatorEventPassAccess(
  creatorEventId: string,
  subject?: CreatorMoneyPurchaseSubject,
  accountChangedFallback?: PaidCreatorEventAccess,
): Promise<PaidCreatorEventAccess> {
  if (subject && !await revalidateCreatorMoneyPurchaseSubject(subject)) return accountChangedFallback!;
  let latest = await resolvePaidCreatorEventPassAccess(creatorEventId);
  if (subject && !await revalidateCreatorMoneyPurchaseSubject(subject)) return accountChangedFallback!;
  if (latest.allowed) return latest;
  for (let attempt = 0; attempt < PAID_CREATOR_EVENT_POLL_ATTEMPTS; attempt += 1) {
    await delay(PAID_CREATOR_EVENT_POLL_DELAY_MS);
    if (subject && !await revalidateCreatorMoneyPurchaseSubject(subject)) return accountChangedFallback!;
    latest = await resolvePaidCreatorEventPassAccess(creatorEventId);
    if (subject && !await revalidateCreatorMoneyPurchaseSubject(subject)) return accountChangedFallback!;
    if (latest.allowed) return latest;
  }
  return latest;
}

export async function purchasePaidCreatorEventPass(input: {
  creatorEventId: string;
  sourceSurface: string;
  expectedTermsRevisionId?: string;
}): Promise<PaidCreatorEventPurchaseResult> {
  const initiatingAuthority = captureCreatorMoneyPurchaseAuthority();
  const access = await resolvePaidCreatorEventPassAccess(input.creatorEventId);
  if (!isCreatorMoneyPurchaseAuthorityCurrent(initiatingAuthority)) {
    return { ok: false, message: "Account changed before Event Pass checkout. Nothing was charged.", access };
  }
  if (access.allowed) {
    return { ok: true, message: "Event Pass active. You have access to this Event.", access };
  }
  if (!access.requiresPurchase || !access.offer?.id) {
    return { ok: false, message: "This Event Pass is not available right now.", access };
  }
  if (!input.expectedTermsRevisionId || !access.offer.terms
    || input.expectedTermsRevisionId !== access.offer.termsRevisionId
    || access.offer.terms.id !== input.expectedTermsRevisionId
    || access.offer.terms.priceCents !== access.priceCents
    || access.offer.terms.currency !== access.currency) {
    return { ok: false, message: "Event ticket details changed or could not be verified. Refresh and review the price, time, and included access before checkout.", access };
  }
  if (
    !access.creatorId
    || (access.provider !== "revenuecat_app_store" && access.provider !== "revenuecat_google_play")
    || !access.providerProductId
    || typeof access.priceCents !== "number"
    || !access.currency
  ) return { ok: false, message: "This Event Pass is not available right now.", access };

  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { ok: false, message: "This Event Pass is not available on this device.", access };
  }
  if (Platform.OS === "android" && access.provider !== "revenuecat_google_play") {
    return { ok: false, message: "This Event Pass is not available right now.", access };
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

  const purchaseSubject = await prepareCreatorMoneyPurchaseSubject(initiatingAuthority);
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
  }, purchaseSubject, input.expectedTermsRevisionId);
  if (intent.alreadyPurchased) {
    const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId, purchaseSubject, access);
    return {
      ok: verifiedAccess.allowed,
      message: verifiedAccess.allowed
        ? "Event Pass active. You have access to this Event."
        : "Event Pass is still being confirmed.",
      access: verifiedAccess.requiresPurchase
        ? { ...verifiedAccess, requiresPurchase: false, reason: "reconciliation_required" }
        : verifiedAccess,
      intentId: intent.id,
    };
  }

  const productId = intent.providerProductId;
  const cancelUnstarted = async () => {
    try {
      if (await revalidateCreatorMoneyPurchaseSubject(purchaseSubject)) await invokeCreatorMoneyPurchaseSubjectRpc(
        purchaseSubject, "cancel_unstarted_creator_event_reservation", { p_purchase_intent_id: intent.id },
      );
    } catch { /* Cleanup uncertainty never authorizes checkout or a second charge. */ }
  };
  let products: Awaited<ReturnType<typeof readRevenueCatNonSubscriptionProducts>>;
  try { products = await readRevenueCatNonSubscriptionProducts([productId]); }
  catch {
    await cancelUnstarted();
    return { ok: false, message: "Store checkout could not be prepared. No new charge was started. Refresh My Tickets before trying again.", access, intentId: intent.id, productId };
  }
  const product = products.find((entry) => String(entry.identifier ?? "").trim() === productId) ?? null;
  if (!product || !isCreatorMoneyStoreQuoteMatch(product, {
    productId,
    amountMinor: access.priceCents,
    currency: access.currency,
  })) {
    await cancelUnstarted();
    return {
      ok: false,
      message: CREATOR_MONEY_STORE_QUOTE_UNAVAILABLE_COPY.replace("Nothing was charged.", "No new charge was started by this attempt."),
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
    await cancelUnstarted();
    return {
      ok: false,
      message: "Your session changed before Event Pass checkout. No new charge was started by this attempt.",
      access,
      intentId: intent.id,
      productId,
    };
  }

  let checkoutAttemptId: string;
  try { checkoutAttemptId = createEventCheckoutAttemptId(); }
  catch {
    await cancelUnstarted();
    return { ok: false, message: "Secure checkout could not be prepared. No new charge was started. Refresh My Tickets before trying again.", access, intentId: intent.id, productId };
  }
  // From this point an uncertain claim may already be committed. Never release
  // it or invoke the SDK unless this exact attempt is positively confirmed.
  let reservation: { data: Record<string, unknown> | null; error: unknown } | null;
  try {
    reservation = await invokeCreatorMoneyPurchaseSubjectRpc<Record<string, unknown>>(
      purchaseSubject, "begin_creator_event_checkout", { p_purchase_intent_id: intent.id, p_checkout_attempt_id: checkoutAttemptId },
    );
  } catch { reservation = null; }
  const held = reservation?.error ? null : reservation?.data;
  if (!held || !ACCESS_UUID_PATTERN.test(toText(held.id)) || held.purchaseIntentId !== intent.id
    || held.checkoutAttemptId !== checkoutAttemptId || held.startAuthorized !== true
    || held.state !== "held" || held.buyerId !== purchaseSubject.userId
    || held.offerId !== access.offer.id || held.creatorEventId !== input.creatorEventId
    || held.termsRevisionId !== input.expectedTermsRevisionId
    || held.priceCents !== access.priceCents || held.currency !== access.currency
    || !Number.isFinite(Date.parse(toText(held.expiresAt))) || Date.parse(toText(held.expiresAt)) <= Date.now()
    || !await revalidateCreatorMoneyPurchaseSubject(purchaseSubject)) {
    return { ok: false, message: "This ticket reservation is no longer ready for checkout. Check My Tickets for a pending purchase, then refresh this Event. No new charge was started by this attempt.",
      access: { ...access, requiresPurchase: false, reason: "reservation_pending" }, intentId: intent.id, productId };
  }

  try {
    await purchaseRevenueCatStoreProduct(product, { authority: purchaseSubject.authority });
  } catch (error) {
    const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId, purchaseSubject, access);
    if (verifiedAccess.allowed) {
      return {
        ok: true,
        message: "Event Pass active. You have access to this Event.",
        access: verifiedAccess,
        intentId: intent.id,
        productId,
      };
    }

    return {
      ok: false,
      message: isRevenueCatUserCancellation(error)
        ? "Event Pass checkout was canceled. Check My Tickets if your store still shows a pending purchase."
        : "Event Pass checkout could not be confirmed. Check My Tickets and your store purchase history before trying again.",
      access: verifiedAccess.requiresPurchase
        ? { ...verifiedAccess, requiresPurchase: false, reason: "reconciliation_required" }
        : verifiedAccess,
      intentId: intent.id,
      productId,
    };
  }

  const verifiedAccess = await waitForPaidCreatorEventPassAccess(input.creatorEventId, purchaseSubject, access);
  if (!verifiedAccess.allowed) {
    return {
      ok: false,
      message: "Purchase received. Waiting for the verified Event Pass to finish.",
      access: verifiedAccess.requiresPurchase
        ? { ...verifiedAccess, requiresPurchase: false, reason: "reconciliation_required" }
        : verifiedAccess,
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
    message: "Event Pass active. You have access to this Event.",
    access: verifiedAccess,
    intentId: intent.id,
    productId,
  };
}
