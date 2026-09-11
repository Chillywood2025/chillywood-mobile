export type EventCustomerAction = "none" | "buy_pass" | "open_live" | "open_replay";

export type EventCustomerPresentation = {
  statusLabel: string;
  headline: string;
  body: string;
  action: EventCustomerAction;
  actionLabel: string | null;
};

export type CustomerAudience = "public" | "circle" | "private";
export type CustomerEntitlement = "free" | "premium" | "creator_vip" | null;
export type CustomerOwnership = "not_owned" | "unlocked" | "active" | "unknown" | "unavailable";
export type ExactAccessProduct =
  | "paid_video"
  | "party_room_pass"
  | "event_pass"
  | "live_stage_pass"
  | "live_stage_seat_pass";

export type CustomerAccessSummary = {
  audienceLabel: "Public" | "Chi'lly Circle" | "Private";
  accessLabel: string | null;
  detail: string | null;
  canPurchase: boolean;
};

export const EXACT_ACCESS_PRODUCT_LABELS: Record<ExactAccessProduct, string> = {
  paid_video: "Paid Video",
  party_room_pass: "Party Room Pass",
  event_pass: "Event Pass",
  live_stage_pass: "Live Stage Pass",
  live_stage_seat_pass: "Live Stage Seat Pass",
};

export const TIP_SUPPORT_DOCTRINE =
  "A tip supports one exact creator. It grants no content, Premium, VIP, Circle, pass, seat, room, or LiveKit authority.";

const clean = (value: unknown) => String(value ?? "").trim();

export const isCurrentAuthorityRequest = (input: {
  generation: number;
  currentGeneration: number;
  requestedAuthorityKey: string;
  currentAuthorityKey: string;
}) => (
  Number.isInteger(input.generation)
  && input.generation >= 0
  && input.generation === input.currentGeneration
  && clean(input.requestedAuthorityKey) === clean(input.currentAuthorityKey)
);

export const formatOneTimePrice = (priceLabel?: string | null) => {
  const price = clean(priceLabel);
  return price ? `${price} one-time` : "One-time purchase";
};

export const formatRecurringPrice = (
  priceLabel?: string | null,
  period: "month" | "year" = "month",
) => {
  const price = clean(priceLabel);
  return price ? `${price} per ${period}` : `Renews every ${period}`;
};

export const resolveAudienceLabel = (audience: CustomerAudience) => (
  audience === "circle" ? "Chi'lly Circle" : audience === "private" ? "Private" : "Public"
);

export function resolveCustomerAccessSummary(input: {
  audience: CustomerAudience;
  entitlement?: CustomerEntitlement;
  paid?: boolean;
  ownership?: CustomerOwnership;
  exactProduct?: ExactAccessProduct | null;
  priceLabel?: string | null;
  audienceAuthorized?: boolean;
}): CustomerAccessSummary {
  const audienceLabel = resolveAudienceLabel(input.audience);
  const ownership = input.ownership ?? "not_owned";

  if (input.audience !== "public" && input.audienceAuthorized === false) {
    return {
      audienceLabel,
      accessLabel: input.audience === "circle" ? "Circle access required" : "Private access required",
      detail: "Audience access must be approved before any separate purchase can be used.",
      canPurchase: false,
    };
  }

  if (ownership === "unknown") {
    return {
      audienceLabel,
      accessLabel: "Access unavailable",
      detail: "Your current access could not be verified. Try again before purchasing.",
      canPurchase: false,
    };
  }
  if (ownership === "unavailable") {
    return {
      audienceLabel,
      accessLabel: "Unavailable",
      detail: "This item is not currently available.",
      canPurchase: false,
    };
  }
  if (ownership === "unlocked") {
    return { audienceLabel, accessLabel: "Unlocked", detail: null, canPurchase: false };
  }
  if (ownership === "active") {
    return {
      audienceLabel,
      accessLabel: input.entitlement === "creator_vip" ? "VIP Active" : "Pass Active",
      detail: null,
      canPurchase: false,
    };
  }

  if (input.entitlement === "premium") {
    return {
      audienceLabel,
      accessLabel: "Chi'llywood Premium",
      detail: "Premium is platform access. It does not include creator VIP or separate paid items.",
      canPurchase: false,
    };
  }
  if (input.entitlement === "creator_vip") {
    return {
      audienceLabel,
      accessLabel: "Creator VIP",
      detail: "VIP applies only to this creator and does not include Chi'llywood Premium.",
      canPurchase: false,
    };
  }
  if (input.paid) {
    return {
      audienceLabel,
      accessLabel: input.priceLabel ? formatOneTimePrice(input.priceLabel) : "Paid",
      detail: input.exactProduct
        ? "Purchase applies only to this exact item. Audience restrictions still apply."
        : null,
      canPurchase: !!input.exactProduct,
    };
  }
  return { audienceLabel, accessLabel: null, detail: null, canPurchase: false };
}

const eventStartLabel = (startsAt?: string | null) => {
  const parsed = Date.parse(clean(startsAt));
  if (!Number.isFinite(parsed)) return "Start time to be announced";
  return new Date(parsed).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function resolveMainTabBrandRevealHeight(viewportHeight: number) {
  const height = Number.isFinite(viewportHeight) ? viewportHeight : 0;
  return Math.round(Math.max(188, Math.min(224, height * 0.24)));
}

export function resolveLiveHubCardWidth(viewportWidth: number) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 0;
  return Math.round(Math.max(236, Math.min(320, width - 64)));
}

export function resolvePlatformViewerOfferKeys(input: {
  canTip: boolean;
  canPurchaseSubscription: boolean;
  hasSubscriptionAccess: boolean;
  canPurchaseVip: boolean;
  hasVipAccess: boolean;
  hasPartyRoomOffer: boolean;
}) {
  const keys: ("tip" | "subscription" | "vip" | "party_room")[] = [];
  if (input.canTip) keys.push("tip");
  if (input.canPurchaseSubscription || input.hasSubscriptionAccess) keys.push("subscription");
  if (input.canPurchaseVip || input.hasVipAccess) keys.push("vip");
  if (input.hasPartyRoomOffer) keys.push("party_room");
  return keys;
}

export function isCurrentExactPartyRoomOffer(input: {
  offerPartyId?: string | null;
  offerHostId?: string | null;
  offerEndsAt?: string | null;
  roomPartyId?: string | null;
  roomHostId?: string | null;
  roomActive: boolean;
  nowMillis?: number;
}) {
  const offerPartyId = clean(input.offerPartyId).toUpperCase();
  const roomPartyId = clean(input.roomPartyId).toUpperCase();
  const offerHostId = clean(input.offerHostId);
  const roomHostId = clean(input.roomHostId);
  if (
    !input.roomActive
    || !offerPartyId
    || offerPartyId !== roomPartyId
    || !offerHostId
    || offerHostId !== roomHostId
  ) return false;

  const endsAt = clean(input.offerEndsAt);
  if (!endsAt) return true;
  const endsAtMillis = Date.parse(endsAt);
  const nowMillis = Number.isFinite(input.nowMillis) ? Number(input.nowMillis) : Date.now();
  return Number.isFinite(endsAtMillis) && endsAtMillis > nowMillis;
}

export function resolveEventCustomerPresentation(input: {
  status?: string | null;
  startsAt?: string | null;
  isPaid: boolean;
  accessAllowed: boolean;
  requiresPurchase: boolean;
  soldOut: boolean;
  priceLabel?: string | null;
  hasLiveDestination: boolean;
  hasReplayDestination: boolean;
}): EventCustomerPresentation {
  const status = clean(input.status).toLowerCase();
  const starts = eventStartLabel(input.startsAt);
  const accessCopy = input.isPaid
    ? input.accessAllowed
      ? "Your Event Pass is active for this Event."
      : "This Event requires its own Event Pass."
    : "This Event is free. No Event Pass is required.";

  if (status === "canceled" || status === "cancelled") {
    return {
      statusLabel: "Canceled",
      headline: "This Event was canceled",
      body: "There is nothing you need to do. It is no longer open for entry.",
      action: "none",
      actionLabel: null,
    };
  }

  if (status === "expired") {
    return {
      statusLabel: "Expired",
      headline: "This Event is no longer available",
      body: "The Event and any replay window have ended.",
      action: "none",
      actionLabel: null,
    };
  }

  if (status === "ended" || status === "replay_available") {
    if (input.accessAllowed && input.hasReplayDestination) {
      return {
        statusLabel: "Replay available",
        headline: "Watch the Event replay",
        body: accessCopy,
        action: "open_replay",
        actionLabel: "Watch Replay",
      };
    }
    return {
      statusLabel: "Ended",
      headline: status === "replay_available" ? "Replay is being prepared" : "This Event has ended",
      body: status === "replay_available"
        ? "Come back when the replay is available from this Event."
        : "No replay is currently available.",
      action: "none",
      actionLabel: null,
    };
  }

  if (status === "rescheduled") {
    const canBuyPass = input.requiresPurchase && !input.soldOut;
    return {
      statusLabel: "Rescheduled",
      headline: `New time: ${starts}`,
      body: `${accessCopy} ${input.requiresPurchase ? "Access can be confirmed for the new time." : "Your access remains tied to this Event."}`,
      action: canBuyPass ? "buy_pass" : "none",
      actionLabel: canBuyPass
        ? input.priceLabel ? `Get Event Pass — ${input.priceLabel}` : "Get Event Pass"
        : null,
    };
  }

  if (input.requiresPurchase) {
    return {
      statusLabel: input.soldOut ? "Sold out" : "Event Pass required",
      headline: input.soldOut ? "Event Passes are sold out" : "Get access to this Event",
      body: status === "live_now"
        ? `${accessCopy} Entry is available now after access is verified.`
        : `${accessCopy} Entry opens when the Event goes live.`,
      action: input.soldOut ? "none" : "buy_pass",
      actionLabel: input.soldOut
        ? null
        : input.priceLabel
          ? `Get Event Pass — ${input.priceLabel}`
          : "Get Event Pass",
    };
  }

  if (status === "live_now") {
    if (input.accessAllowed && input.hasLiveDestination) {
      return {
        statusLabel: "Live now",
        headline: "This Event is live",
        body: accessCopy,
        action: "open_live",
        actionLabel: "Watch Event Live",
      };
    }
    return {
      statusLabel: "Live now",
      headline: "Live entry is getting ready",
      body: `${accessCopy} Pull down to refresh the authorized entry.`,
      action: "none",
      actionLabel: null,
    };
  }

  if (status === "scheduled") {
    return {
      statusLabel: "Upcoming",
      headline: `Starts ${starts}`,
      body: `${accessCopy} Come back when the Event goes live.`,
      action: "none",
      actionLabel: null,
    };
  }

  return {
    statusLabel: "Not open yet",
    headline: "This Event is not open for entry",
    body: accessCopy,
    action: "none",
    actionLabel: null,
  };
}
