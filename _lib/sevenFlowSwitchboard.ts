import { Platform } from "react-native";

import type { MoneyFeatureFlagKey } from "./moneyFeatureFlags";

const IOS_STORE = Platform.OS === "ios";
const REVENUECAT_STORE_LABEL = IOS_STORE ? "App Store / RevenueCat" : "Google Play / RevenueCat";

export type SevenMoneyFlowKey =
  | "premium"
  | "tips"
  | "paid_video"
  | "watch_party_ticket"
  | "channel_subscription"
  | "vip"
  | "event_pass";

export type SevenFlowSwitchName =
  | "premiumEnabled"
  | "tipsEnabled"
  | "paidVideoEnabled"
  | "watchPartyTicketEnabled"
  | "channelSubscriptionEnabled"
  | "vipEnabled"
  | "eventPassEnabled";

export type SevenFlowProviderReadiness =
  | "sandbox_proved"
  | "production_ready_unverified"
  | "production_blocked_provider_config";

export type CreatorMoneyProductionProviderStatus =
  | "missing"
  | "created"
  | "verified"
  | "blocked_owner_action"
  | "blocked_provider_constraints";

export type SevenFlowSwitchboardRow = {
  flowKey: SevenMoneyFlowKey;
  label: string;
  switchName: SevenFlowSwitchName;
  defaultState: "off" | "entitlement_read_only";
  moneySwitchKey: MoneyFeatureFlagKey | "premium_purchase_shell";
  globalMasterSwitchRequired: boolean;
  emergencyStopSwitch: MoneyFeatureFlagKey;
  provider: "App Store / RevenueCat" | "Google Play / RevenueCat";
  productId: string;
  productCatalog?: readonly string[];
  productionProductId?: string;
  productionBasePlanId?: string;
  productType: "subscription" | "one_time_consumable" | "one_time_non_consumable";
  accessCreated: string;
  accessNotCreated: string;
  appSurface: string;
  providerReadiness: SevenFlowProviderReadiness;
};

export type CreatorMoneyProductionProviderProductRow = {
  flowKey: SevenMoneyFlowKey;
  label: string;
  sandboxProductId: string;
  productionProductId: string;
  productionBasePlanId: string | null;
  productType: SevenFlowSwitchboardRow["productType"];
  launchPriceUsd: string;
  launchRegion: "United States only first";
  customPricingPolicy: "provider_backed_fail_closed";
  switchName: SevenFlowSwitchName;
  activationStatus: "off";
  googlePlayStatus: CreatorMoneyProductionProviderStatus;
  revenueCatStatus: CreatorMoneyProductionProviderStatus;
};

const iosTierIds = (stem: string) => [1, 2, 3, 4].map((tier) => `com.chillywood.${stem}.tier${tier}`);
const IOS_PAID_VIDEO_PRODUCTS = iosTierIds("paidvideo");
const IOS_EVENT_PASS_PRODUCTS = iosTierIds("eventpass");
const IOS_VIP_PRODUCTS = iosTierIds("vip");
const IOS_CHANNEL_SUBSCRIPTION_PRODUCTS = Array.from(
  { length: 8 },
  (_, index) => `com.chillywood.channel.subscription.slot${index + 1}`,
);

export const SEVEN_FLOW_SWITCHBOARD: readonly SevenFlowSwitchboardRow[] = [
  {
    flowKey: "premium",
    label: "Premium",
    switchName: "premiumEnabled",
    defaultState: "entitlement_read_only",
    moneySwitchKey: "premium_purchase_shell",
    globalMasterSwitchRequired: false,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? "com.chillywood.premium.monthly" : "premium_subscription",
    productCatalog: IOS_STORE
      ? ["com.chillywood.premium.monthly", "com.chillywood.premium.yearly"]
      : ["premium_subscription"],
    productType: "subscription",
    accessCreated: "user_entitlements row for entitlement_key premium when RevenueCat verifies an active subscription.",
    accessNotCreated: "No creator access grant, creator earning, payout, paid content unlock, VIP, Party Room Pass, Live Stage Pass, Live Stage Seat Pass, Event Pass, room authority, or LiveKit publish authority.",
    appSurface: "/subscribe and Premium gates",
    providerReadiness: "sandbox_proved",
  },
  {
    flowKey: "tips",
    label: "Tips",
    switchName: "tipsEnabled",
    defaultState: "off",
    moneySwitchKey: "tips_enabled",
    globalMasterSwitchRequired: true,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? "com.chillywood.tip.tier1" : "cw_creator_tip_sandbox_099",
    productCatalog: IOS_STORE ? iosTierIds("tip") : ["cw_creator_tip_sandbox_099"],
    productionProductId: IOS_STORE ? "" : "cw_creator_tip_099",
    productType: "one_time_consumable",
    accessCreated: "No durable access. Provider-backed ledger/readback only.",
    accessNotCreated: "No Premium, paid video, Party Room Pass, Live Stage Pass, Live Stage Seat Pass, subscription, VIP, Event Pass, badge, ranking, LiveKit, host, moderator, payable balance, or payout access.",
    appSurface: "Public Platform support/tip sheet and Money Center",
    providerReadiness: "sandbox_proved",
  },
  {
    flowKey: "paid_video",
    label: "Paid Video",
    switchName: "paidVideoEnabled",
    defaultState: "off",
    moneySwitchKey: "paid_content_enabled",
    globalMasterSwitchRequired: true,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? IOS_PAID_VIDEO_PRODUCTS[0] : "cw_paid_content_access_sandbox_099",
    productCatalog: IOS_STORE ? IOS_PAID_VIDEO_PRODUCTS : ["cw_paid_content_access_sandbox_099"],
    productionProductId: IOS_STORE ? "" : "cw_paid_content_access_099",
    productType: "one_time_consumable",
    accessCreated: "paid_content_access grant bound to one creator video/source id after verified provider reconciliation.",
    accessNotCreated: "No Premium, Platform Subscription, VIP, Party Room Pass, Live Stage Pass, Live Stage Seat Pass, Event Pass, other video unlock, LiveKit authority, payout, or payable balance.",
    appSurface: "/player/[id]",
    providerReadiness: "sandbox_proved",
  },
  {
    flowKey: "watch_party_ticket",
    label: "Party Room Pass",
    switchName: "watchPartyTicketEnabled",
    defaultState: "off",
    moneySwitchKey: "watch_party_tickets_enabled",
    globalMasterSwitchRequired: true,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? "com.chillywood.seatpass.tier1" : "cw_watch_party_live_ticket_sandbox_099",
    productCatalog: IOS_STORE ? iosTierIds("seatpass") : ["cw_watch_party_live_ticket_sandbox_099"],
    productionProductId: IOS_STORE ? "" : "cw_watch_party_ticket_099",
    productType: "one_time_consumable",
    accessCreated: "watch_party_live_ticket grant bound to one Party Room / Watch-Party target.",
    accessNotCreated: "No Premium, other room, Live Stage route, LiveKit publish, host, speaker, moderator, paid video, VIP, subscription, Event Pass, payout, or payable balance.",
    appSurface: "/watch-party/[partyId]",
    providerReadiness: "sandbox_proved",
  },
  {
    flowKey: "channel_subscription",
    label: "Platform Subscription",
    switchName: "channelSubscriptionEnabled",
    defaultState: "off",
    moneySwitchKey: "digital_sales_enabled",
    globalMasterSwitchRequired: true,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? IOS_CHANNEL_SUBSCRIPTION_PRODUCTS[0] : "channel_subscription_sandbox_monthly_499:monthly",
    productCatalog: IOS_STORE ? IOS_CHANNEL_SUBSCRIPTION_PRODUCTS : ["channel_subscription_sandbox_monthly_499:monthly"],
    productionProductId: IOS_STORE ? "" : "cw_channel_subscription_monthly_499",
    productionBasePlanId: IOS_STORE ? undefined : "monthly",
    productType: "subscription",
    accessCreated: "channel_subscription state for one creator plus read-time access to that creator's ordinary Paid Videos while active. iOS uses one independently reusable subscription slot per concurrently subscribed creator.",
    accessNotCreated: "No Premium, VIP, permanent Paid Video ownership, per-video transaction/ledger event, Party Room Pass, Live Stage Pass, Live Stage Seat Pass, Event Pass, other creator subscription, LiveKit authority, payout, or payable balance.",
    appSurface: "/channel-subscription/[creatorId]",
    providerReadiness: "sandbox_proved",
  },
  {
    flowKey: "vip",
    label: "VIP",
    switchName: "vipEnabled",
    defaultState: "off",
    moneySwitchKey: "digital_sales_enabled",
    globalMasterSwitchRequired: true,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? IOS_VIP_PRODUCTS[0] : "cw_vip_pass_sandbox_499",
    productCatalog: IOS_STORE ? IOS_VIP_PRODUCTS : ["cw_vip_pass_sandbox_499"],
    productionProductId: IOS_STORE ? "" : "cw_vip_pass_499",
    productType: "one_time_consumable",
    accessCreated: "vip_pass grant/pass state for exactly 30 days of one creator's VIP Area and VIP-only shelf after verified provider reconciliation.",
    accessNotCreated: "No auto-renewal, Premium, Platform Subscription, ordinary Paid Video ownership, Party Room Pass, Live Stage Pass, Live Stage Seat Pass, Event Pass, other creator VIP, LiveKit authority, payout, or payable balance.",
    appSurface: "/vip-pass/[creatorId]",
    providerReadiness: "sandbox_proved",
  },
  {
    flowKey: "event_pass",
    label: "Event Pass",
    switchName: "eventPassEnabled",
    defaultState: "off",
    moneySwitchKey: "digital_sales_enabled",
    globalMasterSwitchRequired: true,
    emergencyStopSwitch: "live_money_enabled",
    provider: REVENUECAT_STORE_LABEL,
    productId: IOS_STORE ? IOS_EVENT_PASS_PRODUCTS[0] : "cw_event_pass_sandbox_099",
    productCatalog: IOS_STORE ? IOS_EVENT_PASS_PRODUCTS : ["cw_event_pass_sandbox_099"],
    productionProductId: IOS_STORE ? "" : "cw_event_pass_099",
    productType: "one_time_consumable",
    accessCreated: "event_pass grant/pass bound to one creator event after verified provider reconciliation.",
    accessNotCreated: "No Premium, VIP, subscription, paid video, Party Room Pass, Live Stage Pass, Live Stage Seat Pass, other Event Pass, LiveKit authority, payout, or payable balance.",
    appSurface: "/event/[eventId]",
    providerReadiness: "sandbox_proved",
  },
] as const;

export const SEVEN_FLOW_REQUIRED_SWITCHES: readonly SevenFlowSwitchName[] = SEVEN_FLOW_SWITCHBOARD.map((flow) => flow.switchName);

export const CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS: readonly CreatorMoneyProductionProviderProductRow[] = SEVEN_FLOW_SWITCHBOARD
  .filter((flow) => flow.flowKey !== "premium")
  .map((flow) => ({
    flowKey: flow.flowKey,
    label: flow.label,
    sandboxProductId: flow.productId,
    productionProductId: flow.productionProductId ?? "",
    productionBasePlanId: flow.productionBasePlanId ?? null,
    productType: flow.productType,
    launchPriceUsd: flow.flowKey === "channel_subscription" ? "$4.99/month" : flow.flowKey === "vip" ? "$4.99" : "$0.99+ finite tiers",
    launchRegion: "United States only first" as const,
    customPricingPolicy: "provider_backed_fail_closed" as const,
    switchName: flow.switchName,
    activationStatus: "off" as const,
    googlePlayStatus: "missing" as CreatorMoneyProductionProviderStatus,
    revenueCatStatus: "missing" as CreatorMoneyProductionProviderStatus,
  }));
