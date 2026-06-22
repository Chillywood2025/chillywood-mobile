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
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "paid_videos" } },
    viewerTarget: "/player/[id]",
  },
  watchPartyTicket: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "paid_watch_parties" } },
    viewerTarget: "/watch-party/[partyId]",
  },
  eventPass: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "offers", manage: "paid_events" } },
    viewerTarget: "/event/[eventId]",
  },
  platformSubscription: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "ways_to_earn", manage: "channel_subscriptions" } },
    viewerTarget: "/channel-subscription/[creatorId]",
  },
  vipPass: {
    ownerTarget: { pathname: "/channel-studio", params: { tab: "monetization", focus: "ways_to_earn", manage: "vip_passes" } },
    viewerTarget: "/vip-pass/[creatorId]",
  },
} as const;

export type CreatorMoneyRouteTargetKey = keyof typeof CREATOR_MONEY_ROUTE_TARGETS;
