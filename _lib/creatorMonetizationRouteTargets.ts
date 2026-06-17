export const CREATOR_MONEY_ROUTE_TARGETS = {
  premium: {
    ownerTarget: "/subscribe",
    viewerTarget: "/subscribe",
  },
  tips: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "ways_to_earn", manage: "tips" } },
    viewerTarget: "tip_sheet",
  },
  paidVideo: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "paid_video" } },
    viewerTarget: "/player/[id]",
  },
  watchPartyTicket: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "watch_party_ticket" } },
    viewerTarget: "/watch-party/[partyId]",
  },
  eventPass: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "event_pass" } },
    viewerTarget: "/event/[eventId]",
  },
  platformSubscription: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "platform_subscription" } },
    viewerTarget: "/channel-subscription/[creatorId]",
  },
  vipPass: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "vip_pass" } },
    viewerTarget: "/vip-pass/[creatorId]",
  },
} as const;

export type CreatorMoneyRouteTargetKey = keyof typeof CREATOR_MONEY_ROUTE_TARGETS;

