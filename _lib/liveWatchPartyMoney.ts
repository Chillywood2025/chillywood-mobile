import { Platform } from "react-native";

import {
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  validateCreatorMoneyPurchaseIntent,
} from "./creatorMoneyPurchaseAuthority";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { supabase } from "./supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LiveWatchPartyPassType =
  | "live_watch_party_access_pass"
  | "live_watch_party_seat_pass";

export type LiveWatchPartyMoneyAccess = {
  allowed: boolean;
  reason:
    | "subject_authority_required"
    | "live_target_unavailable"
    | "live_target_ended"
    | "exact_live_host"
    | "no_creator_live_pass_required"
    | "exact_live_access_pass"
    | "exact_live_seat_pass"
    | "exact_live_access_pass_required"
    | "exact_live_seat_pass_optional";
  viewerOnly: boolean;
  seatEligible: boolean;
  seatApproved: boolean;
  hostAuthority: boolean;
  accessOfferId: string | null;
  seatOfferId: string | null;
  accessPriceCents: number | null;
  seatPriceCents: number | null;
  currency: string;
  grantsPublish: false;
  requiresHostApproval: boolean;
};

export type LiveWatchPartyOffer = {
  offerId: string;
  partyId: string;
  creatorId: string;
  hostUserId: string;
  passType: LiveWatchPartyPassType;
  productKey: string;
  provider: "revenuecat_google_play";
  providerProductId: string;
  priceCents: number;
  currency: string;
  environment: "sandbox";
  status: "sandbox" | "disabled";
  grantsPublish: false;
  requiresHostApproval: boolean;
};

const LIVE_MONEY_ACCESS_REASONS = new Set<LiveWatchPartyMoneyAccess["reason"]>([
  "subject_authority_required",
  "live_target_unavailable",
  "live_target_ended",
  "exact_live_host",
  "no_creator_live_pass_required",
  "exact_live_access_pass",
  "exact_live_seat_pass",
  "exact_live_access_pass_required",
  "exact_live_seat_pass_optional",
]);

const exactText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const safeInteger = (value: unknown) => (
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null
);

const liveMoneyClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: { message?: string } | null }>;
};

export const parseLiveWatchPartyMoneyAccess = (value: unknown): LiveWatchPartyMoneyAccess | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const reason = exactText(row.reason) as LiveWatchPartyMoneyAccess["reason"];
  if (
    typeof row.allowed !== "boolean"
    || typeof row.viewerOnly !== "boolean"
    || typeof row.seatEligible !== "boolean"
    || typeof row.seatApproved !== "boolean"
    || (row.hostAuthority !== undefined && typeof row.hostAuthority !== "boolean")
    || row.grantsPublish === true
    || !LIVE_MONEY_ACCESS_REASONS.has(reason)
  ) return null;
  const accessOfferId = exactText(row.accessOfferId);
  const seatOfferId = exactText(row.seatOfferId);
  if ((accessOfferId && !UUID_PATTERN.test(accessOfferId)) || (seatOfferId && !UUID_PATTERN.test(seatOfferId))) return null;
  if (row.seatApproved && !row.seatEligible && row.hostAuthority !== true) return null;
  if (row.allowed && reason === "exact_live_access_pass_required") return null;
  return {
    allowed: row.allowed,
    reason,
    viewerOnly: row.viewerOnly,
    seatEligible: row.seatEligible,
    seatApproved: row.seatApproved,
    hostAuthority: row.hostAuthority === true,
    accessOfferId: accessOfferId || null,
    seatOfferId: seatOfferId || null,
    accessPriceCents: safeInteger(row.accessPriceCents),
    seatPriceCents: safeInteger(row.seatPriceCents),
    currency: exactText(row.currency) || "usd",
    grantsPublish: false,
    requiresHostApproval: row.requiresHostApproval === true,
  };
};

export async function readLiveWatchPartyMoneyAccess(partyId: string) {
  const exactPartyId = exactText(partyId);
  if (!exactPartyId) return null;
  const { data, error } = await liveMoneyClient.rpc("resolve_live_watch_party_money_access", {
    p_party_id: exactPartyId,
  });
  if (error) throw new Error(error.message || "Live Watch-Party access could not be verified.");
  return parseLiveWatchPartyMoneyAccess(data);
}

export async function setMyLiveWatchPartyOffer(input: {
  partyId: string;
  passType: LiveWatchPartyPassType;
  enabled: boolean;
}) {
  const productKey = input.passType === "live_watch_party_access_pass"
    ? "live_watch_party_access_pass_sandbox_099"
    : "live_watch_party_seat_pass_sandbox_099";
  const { data, error } = await liveMoneyClient.rpc("set_my_live_watch_party_offer", {
    p_enabled: input.enabled,
    p_party_id: exactText(input.partyId),
    p_pass_type: input.passType,
    p_product_key: productKey,
  });
  if (error) throw new Error(error.message || "Live Watch-Party offer could not be saved.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Live Watch-Party offer proof was not returned.");
  const row = data as Record<string, unknown>;
  const offerId = exactText(row.offerId);
  if (row.status === "disabled") return { status: "disabled" as const, offerId: UUID_PATTERN.test(offerId) ? offerId : null };
  const priceCents = safeInteger(row.priceCents);
  const passType = exactText(row.passType) as LiveWatchPartyPassType;
  if (
    !UUID_PATTERN.test(offerId)
    || exactText(row.partyId) !== exactText(input.partyId)
    || passType !== input.passType
    || exactText(row.provider) !== "revenuecat_google_play"
    || !priceCents
    || row.grantsPublish === true
  ) throw new Error("Live Watch-Party offer proof did not match the exact room and product.");
  return {
    ...(row as unknown as LiveWatchPartyOffer),
    offerId,
    passType,
    priceCents,
    grantsPublish: false as const,
  };
}

export async function purchaseLiveWatchPartyOffer(input: {
  offerId: string;
  passType: LiveWatchPartyPassType;
  priceCents: number;
}) {
  if (!UUID_PATTERN.test(input.offerId) || !Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
    throw new Error("The exact Live Watch-Party offer is unavailable.");
  }
  if (Platform.OS === "ios") {
    throw new Error("This exact Live Watch-Party pass is not present in the verified App Store sandbox catalog. Nothing was charged.");
  }
  const subject = await prepareCreatorMoneyPurchaseSubject();
  if (!subject) throw new Error("Billing identity is unavailable for the current account.");
  const { data, error } = await liveMoneyClient.rpc("create_live_watch_party_purchase_intent", {
    p_offer_id: input.offerId,
  });
  if (error) throw new Error(error.message || "The Live Watch-Party purchase could not start.");
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  if (row?.alreadyPurchased === true) return { alreadyOwned: true, intentId: null, productId: null };
  const sourceType = input.passType === "live_watch_party_access_pass"
    ? "live_watch_party_access"
    : "live_watch_party_seat";
  const providerProductId = exactText(row?.providerProductId);
  const intent = validateCreatorMoneyPurchaseIntent(data, {
    userId: subject.userId,
    sourceType,
    sourceId: input.offerId,
    creatorId: exactText(row?.creatorId),
    provider: "revenuecat_google_play",
    providerProductId,
    environment: "sandbox",
    status: "pending",
    amountMinor: input.priceCents,
    currency: "usd",
  });
  if (!intent || exactText(row?.passType) !== input.passType || row?.grantsPublish === true) {
    throw new Error("The purchase intent did not match this exact Live Watch-Party pass.");
  }
  if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed before checkout.");
  const products = await readRevenueCatNonSubscriptionProducts([intent.providerProductId]);
  if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed before checkout.");
  const storeProduct = products.find((product) => exactText(product.identifier) === intent.providerProductId);
  if (!storeProduct) throw new Error("The verified Live Watch-Party sandbox product is unavailable. Nothing was charged.");
  const purchase = await purchaseRevenueCatStoreProduct(storeProduct, { authority: subject.authority });
  if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed while checkout completed.");
  return {
    alreadyOwned: false,
    intentId: intent.id,
    productId: exactText(purchase.productIdentifier) || intent.providerProductId,
  };
}
