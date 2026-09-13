import { Platform } from "react-native";

import {
  captureCreatorMoneyPurchaseAuthority,
  isCreatorMoneyPurchaseAuthorityCurrent,
  prepareCreatorMoneyPurchaseSubject,
  revalidateCreatorMoneyPurchaseSubject,
  invokeCreatorMoneyPurchaseSubjectRpc,
  validateCreatorMoneyPurchaseIntent,
} from "./creatorMoneyPurchaseAuthority";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
} from "./revenuecat";
import { isRevenueCatUserCancellation } from "./revenuecatPurchaseClosure";
import { supabase } from "./supabase";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

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
  seatReviewState: "not_required" | "not_owned" | "eligible" | "requested" | "rejected" | "approved";
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

export type LiveWatchPartyHostOfferState = {
  accessEnabled: boolean;
  accessOfferId: string | null;
  accessPriceCents: number | null;
  seatEnabled: boolean;
  seatOfferId: string | null;
  seatPriceCents: number | null;
  currency: string;
};

export type LiveWatchPartySeatPassState = {
  buyerId: string;
  state: "eligible" | "requested" | "rejected" | "approved";
};

const LIVE_WATCH_PARTY_PURCHASE_POLL_ATTEMPTS = 10;
const LIVE_WATCH_PARTY_PURCHASE_POLL_DELAY_MS = 1_500;

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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveSeatReviewState = (row: Record<string, unknown>, currentSpeakerApproved: boolean) => {
  if (currentSpeakerApproved) return "approved" as const;
  if (exactText(row.requested_at)) return "requested" as const;
  if (exactText(row.rejected_at)) return "rejected" as const;
  return "eligible" as const;
};

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
    seatReviewState: row.seatApproved
      ? "approved"
      : row.seatEligible && seatOfferId
        ? "eligible"
        : seatOfferId
          ? "not_owned"
          : "not_required",
  };
};

export async function readLiveWatchPartyMoneyAccess(partyId: string) {
  const exactPartyId = exactText(partyId);
  if (!exactPartyId) return null;
  const response = await withAuthorityReadDeadline(
    liveMoneyClient.rpc("resolve_live_watch_party_money_access", { p_party_id: exactPartyId }),
    null,
  );
  if (!response || response.error) throw new Error(response?.error?.message || "Live Stage Pass access could not be verified.");
  const access = parseLiveWatchPartyMoneyAccess(response.data);
  if (!access?.seatOfferId || !access.seatEligible || access.hostAuthority) return access;
  const passQuery = (supabase as any)
    .from("paid_live_watch_party_passes")
    .select("approved_at,buyer_id,rejected_at,requested_at,status")
    .eq("party_id", exactPartyId)
    .eq("offer_id", access.seatOfferId)
    .eq("pass_type", "live_watch_party_seat_pass")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  const passResponse = await withAuthorityReadDeadline<{
    data: unknown;
    error: { message?: string } | null;
  } | null>(
    passQuery,
    null,
  );
  if (!passResponse || passResponse.error) {
    throw new Error("Live Stage seat access could not be verified.");
  }
  const passRows = passResponse.data;
  const pass = Array.isArray(passRows) && passRows[0] && typeof passRows[0] === "object"
    ? passRows[0] as Record<string, unknown>
    : null;
  return pass ? { ...access, seatReviewState: resolveSeatReviewState(pass, access.seatApproved) } : access;
}

export const isLiveWatchPartyPassConfirmed = (
  access: LiveWatchPartyMoneyAccess | null | undefined,
  passType: LiveWatchPartyPassType,
  offerId: string,
) => {
  const exactOfferId = exactText(offerId);
  if (!access || !UUID_PATTERN.test(exactOfferId)) return false;
  if (passType === "live_watch_party_access_pass") {
    return access.allowed && access.accessOfferId === exactOfferId;
  }
  return access.seatEligible && access.seatOfferId === exactOfferId;
};

export async function readMyLiveWatchPartyHostOfferState(
  partyId: string,
): Promise<LiveWatchPartyHostOfferState | null> {
  const exactPartyId = exactText(partyId);
  if (!exactPartyId) return null;
  const { data, error } = await (supabase as any)
    .from("paid_live_watch_party_offers")
    .select("id,pass_type,price_cents,currency,status")
    .eq("party_id", exactPartyId);
  if (error || !Array.isArray(data)) return null;
  const access = data.find((row) => exactText(row?.pass_type) === "live_watch_party_access_pass") as Record<string, unknown> | undefined;
  const seat = data.find((row) => exactText(row?.pass_type) === "live_watch_party_seat_pass") as Record<string, unknown> | undefined;
  const isEnabled = (row: Record<string, unknown> | undefined) => (
    row?.status === "sandbox" || row?.status === "active"
  );
  return {
    accessEnabled: isEnabled(access),
    accessOfferId: access && UUID_PATTERN.test(exactText(access.id)) ? exactText(access.id) : null,
    accessPriceCents: access ? safeInteger(access.price_cents) : null,
    seatEnabled: isEnabled(seat),
    seatOfferId: seat && UUID_PATTERN.test(exactText(seat.id)) ? exactText(seat.id) : null,
    seatPriceCents: seat ? safeInteger(seat.price_cents) : null,
    currency: exactText(access?.currency ?? seat?.currency) || "usd",
  };
}

export async function readLiveWatchPartySeatPassStates(
  partyId: string,
): Promise<Record<string, LiveWatchPartySeatPassState["state"]>> {
  const exactPartyId = exactText(partyId);
  if (!exactPartyId) return {};
  const { data, error } = await liveMoneyClient.rpc("list_live_watch_party_seat_states_for_host", {
    p_party_id: exactPartyId,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.entries(data as Record<string, unknown>).reduce((states, [buyerId, value]) => {
    const state = exactText(value);
    if (!UUID_PATTERN.test(buyerId) || !["eligible", "requested", "rejected", "approved"].includes(state)) {
      return states;
    }
    states[buyerId] = state as LiveWatchPartySeatPassState["state"];
    return states;
  }, {} as Record<string, LiveWatchPartySeatPassState["state"]>);
}

export async function requestMyLiveWatchPartySeat(partyId: string) {
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>("request_my_live_watch_party_seat", {
    p_party_id: exactText(partyId),
  });
  if (error) throw new Error(error.message || "Live Stage seat request could not be saved.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Live Stage seat request could not be confirmed.");
  }
  return data as Record<string, unknown>;
}

export async function rejectLiveWatchPartySeatRequest(partyId: string, buyerId: string) {
  const exactBuyerId = exactText(buyerId);
  if (!UUID_PATTERN.test(exactBuyerId)) throw new Error("Live Stage seat request identity is invalid.");
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>("review_live_watch_party_seat_request", {
    p_buyer_id: exactBuyerId,
    p_decision: "reject",
    p_party_id: exactText(partyId),
  });
  if (error) throw new Error(error.message || "Live Stage seat rejection could not be saved.");
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Live Stage seat rejection could not be confirmed.");
  }
  return data as Record<string, unknown>;
}

export async function setMyLiveWatchPartyOffer(input: {
  partyId: string;
  passType: LiveWatchPartyPassType;
  enabled: boolean;
}) {
  const productKey = input.passType === "live_watch_party_access_pass"
    ? "live_watch_party_access_pass_sandbox_099"
    : "live_watch_party_seat_pass_sandbox_099";
  const { data, error } = await runCurrentAccountBoundSupabaseMutationRpc<Record<string, unknown>>("set_my_live_watch_party_offer", {
    p_enabled: input.enabled,
    p_party_id: exactText(input.partyId),
    p_pass_type: input.passType,
    p_product_key: productKey,
  });
  if (error) throw new Error(error.message || "Live Stage offer could not be saved.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Live Stage offer details could not be confirmed.");
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
  ) throw new Error("Live Stage offer details did not match the exact room and product.");
  return {
    ...(row as unknown as LiveWatchPartyOffer),
    offerId,
    passType,
    priceCents,
    grantsPublish: false as const,
  };
}

export async function purchaseLiveWatchPartyOffer(input: {
  partyId: string;
  offerId: string;
  passType: LiveWatchPartyPassType;
  priceCents: number;
}) {
  const initiatingAuthority = captureCreatorMoneyPurchaseAuthority();
  if (!exactText(input.partyId) || !UUID_PATTERN.test(input.offerId) || !Number.isSafeInteger(input.priceCents) || input.priceCents <= 0) {
    throw new Error("The exact Live Stage offer is unavailable.");
  }
  if (Platform.OS !== "android") {
    throw new Error("This exact Live Stage Pass is not available on this device. Nothing was charged.");
  }
  if (input.passType === "live_watch_party_seat_pass") {
    const entryAccess = await readLiveWatchPartyMoneyAccess(input.partyId);
    if (!entryAccess?.allowed) {
      throw new Error("A Live Stage Pass is required before a Live Stage Seat Pass can be purchased for this paid Live Stage. Nothing was charged.");
    }
  }
  if (!isCreatorMoneyPurchaseAuthorityCurrent(initiatingAuthority)) {
    throw new Error("Account changed before Live Stage checkout. Nothing was charged.");
  }
  const subject = await prepareCreatorMoneyPurchaseSubject(initiatingAuthority);
  if (!subject) throw new Error("Billing identity is unavailable for the current account.");
  const response = await invokeCreatorMoneyPurchaseSubjectRpc<Record<string, unknown>>(
    subject,
    "create_live_watch_party_purchase_intent",
    { p_offer_id: input.offerId },
  );
  if (!response || response.error) {
    if (response?.error?.message?.includes("live_stage_entry_required_before_seat_pass")) {
      throw new Error("A Live Stage Pass is required before a Live Stage Seat Pass can be purchased for this paid Live Stage. Nothing was charged.");
    }
    throw new Error(response?.error?.message || "The Live Stage purchase could not start.");
  }
  const data = response.data;
  const row = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  if (row?.alreadyPurchased === true) {
    if (!await revalidateCreatorMoneyPurchaseSubject(subject)) {
      throw new Error("Account changed while Live Stage access was being checked.");
    }
    const access = await readLiveWatchPartyMoneyAccess(input.partyId);
    if (!await revalidateCreatorMoneyPurchaseSubject(subject)) {
      throw new Error("Account changed while Live Stage access was being checked.");
    }
    return {
      alreadyOwned: true,
      intentId: null,
      productId: null,
      access,
      confirmed: isLiveWatchPartyPassConfirmed(access, input.passType, input.offerId),
    };
  }
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
  if (
    !intent
    || exactText(row?.partyId) !== exactText(input.partyId)
    || exactText(row?.passType) !== input.passType
    || row?.grantsPublish === true
  ) {
    throw new Error("The purchase intent did not match this exact Live Stage pass.");
  }
  if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed before checkout.");
  const products = await readRevenueCatNonSubscriptionProducts([intent.providerProductId]);
  if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed before checkout.");
  const storeProduct = products.find((product) => exactText(product.identifier) === intent.providerProductId);
  if (!storeProduct) throw new Error("The Live Stage Pass is unavailable on this device. Nothing was charged.");
  if (input.passType === "live_watch_party_seat_pass") {
    if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed before checkout.");
    const latestEntryAccess = await readLiveWatchPartyMoneyAccess(input.partyId);
    if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed before checkout.");
    if (!latestEntryAccess?.allowed) {
      throw new Error("A Live Stage Pass is required before a Live Stage Seat Pass can be purchased for this paid Live Stage. Nothing was charged.");
    }
  }
  const waitForExactPass = async () => {
    let access: LiveWatchPartyMoneyAccess | null = null;
    for (let attempt = 0; attempt < LIVE_WATCH_PARTY_PURCHASE_POLL_ATTEMPTS; attempt += 1) {
      if (!await revalidateCreatorMoneyPurchaseSubject(subject)) return null;
      access = await readLiveWatchPartyMoneyAccess(input.partyId).catch(() => null);
      if (!await revalidateCreatorMoneyPurchaseSubject(subject)) return null;
      if (isLiveWatchPartyPassConfirmed(access, input.passType, input.offerId)) return access;
      if (attempt + 1 < LIVE_WATCH_PARTY_PURCHASE_POLL_ATTEMPTS) {
        await delay(LIVE_WATCH_PARTY_PURCHASE_POLL_DELAY_MS);
      }
    }
    return access;
  };
  let purchase;
  try {
    purchase = await purchaseRevenueCatStoreProduct(storeProduct, { authority: subject.authority });
  } catch (error) {
    if (isRevenueCatUserCancellation(error)) {
      throw new Error("Live Stage checkout was canceled. Nothing changed.");
    }
    const recoveredAccess = await waitForExactPass();
    if (isLiveWatchPartyPassConfirmed(recoveredAccess, input.passType, input.offerId)) {
      return {
        alreadyOwned: false,
        intentId: intent.id,
        productId: intent.providerProductId,
        access: recoveredAccess,
        confirmed: true,
      };
    }
    throw new Error("Live Stage checkout could not be verified. Check your access before trying again.");
  }
  if (!await revalidateCreatorMoneyPurchaseSubject(subject)) throw new Error("Account changed while checkout completed.");
  const access = await waitForExactPass();
  return {
    alreadyOwned: false,
    intentId: intent.id,
    productId: exactText(purchase.productIdentifier) || intent.providerProductId,
    access,
    confirmed: isLiveWatchPartyPassConfirmed(access, input.passType, input.offerId),
  };
}
