import { Platform } from "react-native";

const DIGITAL_STORE_PROVIDER = Platform.OS === "ios" ? "App Store / RevenueCat" : "Google Play / RevenueCat";

export type MonetizationFeatureKey =
  | "tips"
  | "paid_videos"
  | "paid_watch_parties"
  | "channel_subscriptions"
  | "vip_passes"
  | "paid_events";

export type MonetizationFeatureStatus =
  | "Not set up"
  | "Setup mode"
  | "Active"
  | "Paused"
  | "Needs attention"
  | "Blocked";

export type MonetizationFeatureAction =
  | "Set up"
  | "Manage"
  | "Resume"
  | "Fix issue";

export type MonetizationFeatureCatalogItem = {
  key: MonetizationFeatureKey;
  title: string;
  creatorDescription: string;
  fanActionLabel: string;
  creatorActionLabel: string;
  status: MonetizationFeatureStatus;
  requiredSetup: readonly string[];
  manageTarget: string;
  allowedSurfaces: readonly string[];
  blockedReason?: string;
};

export const CREATOR_MONETIZATION_FEATURE_CATALOG: readonly MonetizationFeatureCatalogItem[] = [
  {
    key: "tips",
    title: "Tips",
    creatorDescription: "Accept tips from fans.",
    fanActionLabel: "Tip",
    creatorActionLabel: "Set up",
    status: "Not set up",
    requiredSetup: ["Stripe Connect test payouts", "provider readiness", "tax/legal readiness"],
    manageTarget: "tips",
    allowedSurfaces: ["channel_header", "video_player", "live_host_area", "party_room_host_area", "recap"],
  },
  {
    key: "paid_videos",
    title: "Paid Videos",
    creatorDescription: "Charge fans to unlock selected videos.",
    fanActionLabel: "Unlock Video",
    creatorActionLabel: "Set up",
    status: "Not set up",
    requiredSetup: [`${DIGITAL_STORE_PROVIDER} product`, "content access resolver", "creator payout readiness"],
    manageTarget: "offers",
    allowedSurfaces: ["video_upload", "video_edit", "video_card", "video_player_locked_state"],
  },
  {
    key: "paid_watch_parties",
    title: "Watch-Party Seat Passes",
    creatorDescription: "Sell Seat Pass access to hosted Watch-Party rooms.",
    fanActionLabel: "Get Seat",
    creatorActionLabel: "Set up",
    status: "Not set up",
    requiredSetup: ["Seat Pass offer", "room entry gate", `${DIGITAL_STORE_PROVIDER} product`],
    manageTarget: "offers",
    allowedSurfaces: ["watch_party_creation", "watch_party_invite", "party_waiting_room_gate"],
  },
  {
    key: "channel_subscriptions",
    title: "Channel Subscriptions",
    creatorDescription: "Offer monthly creator membership.",
    fanActionLabel: "Subscribe",
    creatorActionLabel: "Set up",
    status: "Not set up",
    requiredSetup: ["creator subscription offer", "monthly product", "subscriber access rules"],
    manageTarget: "ways_to_earn",
    allowedSurfaces: ["channel_header"],
  },
  {
    key: "vip_passes",
    title: "VIP Passes",
    creatorDescription: "Sell creator-specific VIP status and access.",
    fanActionLabel: "Get VIP",
    creatorActionLabel: "Set up",
    status: "Not set up",
    requiredSetup: ["VIP pass offer", "VIP access gate", `${DIGITAL_STORE_PROVIDER} sandbox product`],
    manageTarget: "ways_to_earn",
    allowedSurfaces: ["creator_channel"],
  },
  {
    key: "paid_events",
    title: "Paid Events",
    creatorDescription: "Sell Event Passes to live events and premieres.",
    fanActionLabel: "Buy Event Pass",
    creatorActionLabel: "Set up",
    status: "Not set up",
    requiredSetup: ["event pass product", "event access gate", "event type routing"],
    manageTarget: "offers",
    allowedSurfaces: ["event_creation", "event_page", "live_waiting_room", "party_waiting_room"],
  },
];
