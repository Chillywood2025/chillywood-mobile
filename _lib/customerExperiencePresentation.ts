export type EventCustomerAction = "none" | "buy_pass" | "open_live" | "open_replay";

export type EventCustomerPresentation = {
  statusLabel: string;
  headline: string;
  body: string;
  action: EventCustomerAction;
  actionLabel: string | null;
};

const clean = (value: unknown) => String(value ?? "").trim();

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

export function resolveHomeBrandRevealHeight(viewportHeight: number) {
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
