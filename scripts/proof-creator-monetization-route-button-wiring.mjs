#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);
const excludes = (source, needle) => !source.includes(needle);

const channelSettings = read("app/channel-settings.tsx");
const creatorSetupRoute = read("app/creator-monetization-setup.tsx");
const monetizeRoute = read("app/monetize.tsx");
const revenueRoute = read("app/revenue.tsx");
const payoutsRoute = read("app/payouts.tsx");
const routeTargets = read("_lib/creatorMonetizationRouteTargets.ts");
const creatorSetup = read("_lib/creatorMonetizationSetup.ts");
const creatorPayouts = read("_lib/creatorPayouts.ts");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

const requiredRoutes = [
  ["creator setup compatibility", creatorSetupRoute, "/channel-studio?tab=monetization&focus=offers"],
  ["monetize compatibility", monetizeRoute, "/channel-studio?tab=monetization&focus=offers"],
  ["revenue compatibility", revenueRoute, "/channel-studio?tab=monetization&focus=balance"],
  ["payouts compatibility", payoutsRoute, "/channel-studio?tab=monetization&focus=payouts"],
];
for (const [name, source, needle] of requiredRoutes) {
  add(name, includes(source, needle), `${needle}`);
}

[
  ["Money Center tab focus", "normalizeMonetizationSectionId"],
  ["Payout route focus", "focus=payouts"],
  ["Dynamic feature CTA test IDs", "testID={`money-feature-${feature.key}-cta`}"],
  ["Ways to Earn section", "title: \"Ways to Earn\""],
  ["Offers section", "title: \"Offers\""],
  ["Cashout/Payout readiness section", "title: \"Cashout / Payout readiness\""],
  ["Saved config readback", "money-saved-sandbox-config-readback"],
  ["Shared setup config list RPC", "listMyCreatorSandboxMonetizationConfigs"],
  ["Shared setup config save wrapper", "saveCreatorSetupConfig"],
  ["Cashout readiness preview", "previewCreatorPayoutPreproductionWorkflow"],
  ["Cashout readiness resolver", "resolveCreatorPayoutReadiness"],
  ["Cashout readiness summary", "readCreatorPayoutDashboardSummary"],
  ["Safe Stripe setup action", "handleStartPayoutProviderSetup"],
  ["Safe Stripe status sync", "handleRefreshPayoutProviderStatus"],
].forEach(([name, needle]) => add(name, includes(channelSettings, needle), needle));

const flowChecks = [
  {
    name: "Paid Video",
    featureKey: "paid_videos",
    manager: "money-manager-paid-video-edit-button",
    productKey: "paid_content_access_sandbox_099",
    sourceType: 'sourceType: "paid_content"',
    viewerRoute: 'viewerTarget: "/player/[id]"',
  },
  {
    name: "Tips",
    featureKey: "tips",
    manager: "money-manager-tips-enable-button",
    productKey: "creator_tip_sandbox_099",
    sourceType: 'sourceType: "creator_tip"',
    viewerRoute: 'viewerTarget: "tip_sheet"',
  },
  {
    name: "Watch-Party Ticket",
    featureKey: "paid_watch_parties",
    manager: "money-manager-watch-party-save-config-button",
    productKey: "watch_party_live_ticket_sandbox_099",
    sourceType: 'sourceType: "watch_party_live"',
    viewerRoute: 'viewerTarget: "/watch-party/[partyId]"',
  },
  {
    name: "Channel Subscription",
    featureKey: "channel_subscriptions",
    manager: "money-manager-channel-subscription-enable-button",
    productKey: "channel_subscription_sandbox_monthly_499",
    sourceType: 'sourceType: "channel_subscription"',
    viewerRoute: 'viewerTarget: "/channel-subscription/[creatorId]"',
  },
  {
    name: "VIP",
    featureKey: "vip_passes",
    manager: "money-manager-vip-pass-enable-button",
    productKey: "vip_pass_sandbox_499",
    sourceType: 'sourceType: "vip_pass"',
    viewerRoute: 'viewerTarget: "/vip-pass/[creatorId]"',
  },
  {
    name: "Event Pass",
    featureKey: "paid_events",
    manager: "money-manager-paid-event-edit-button",
    productKey: "event_pass_sandbox_099",
    sourceType: 'sourceType: "event"',
    viewerRoute: 'viewerTarget: "/event/[eventId]"',
  },
];

for (const flow of flowChecks) {
  add(`${flow.name} feature catalog key`, includes(channelSettings, flow.featureKey), flow.featureKey);
  add(`${flow.name} manager action`, includes(channelSettings, flow.manager), flow.manager);
  add(`${flow.name} approved product tier`, includes(creatorSetup, flow.productKey) && includes(channelSettings, flow.productKey), flow.productKey);
  add(`${flow.name} source type save`, includes(channelSettings, flow.sourceType), flow.sourceType);
  add(`${flow.name} viewer route`, includes(routeTargets, flow.viewerRoute), flow.viewerRoute);
}

[
  ["Premium route remains separate", 'viewerTarget: "/subscribe"'],
  ["Premium app-wide route not creator subscription", 'ownerTarget: "/subscribe"'],
  ["Live money runtime off", "liveMoneyEnabled: false"],
  ["Payouts runtime off", "payoutsEnabled: false"],
  ["Cashout runtime off", "cashoutEnabled: false"],
].forEach(([name, needle]) => add(name, includes(featureFlags, needle) || includes(routeTargets, needle), needle));

[
  ["digital sales setup sandbox", 'digital_sales_enabled: "sandbox_only"'],
  ["tips setup sandbox", 'tips_enabled: "sandbox_only"'],
  ["watch-party setup sandbox", 'watch_party_tickets_enabled: "sandbox_only"'],
  ["paid content setup sandbox", 'paid_content_enabled: "sandbox_only"'],
  ["live money default off", 'live_money_enabled: "off"'],
  ["payout default off", 'payouts_enabled: "off"'],
].forEach(([name, needle]) => add(name, includes(moneyFlags, needle), needle));

[
  ["No Stripe Android digital checkout", "stripeAndroidDigitalCheckoutEnabled: false"],
  ["Payout execution read-only", "payoutExecutionReadOnly: true"],
  ["Payment cannot grant LiveKit publish", "liveKitPublishGrantedByPayment: false"],
  ["Provider helper payload safety", "assertSafePayoutFunctionPayload"],
  ["No payout payload allowed", "payload.payoutCreated || payload.transferCreated || payload.checkoutCreated"],
  ["Production payout execution blocked", "productionExecutionAllowed: false"],
].forEach(([name, needle]) => add(name, includes(`${creatorSetup}\n${creatorPayouts}`, needle), needle));

[
  ["No live money enabled", "liveMoneyEnabled: true"],
  ["No payouts enabled", "payoutsEnabled: true"],
  ["No production cashout enabled", "cashoutEnabled: true"],
  ["No production money default on", 'live_money_enabled: "on"'],
  ["No payout default on", 'payouts_enabled: "on"'],
].forEach(([name, needle]) => add(name, excludes(`${featureFlags}\n${moneyFlags}`, needle), needle));

const failed = checks.filter((check) => !check.passed);
const result = {
  verdict: failed.length ? "Blocked" : "Pass",
  checkedAt: new Date().toISOString(),
  summary: {
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
  },
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length) process.exit(1);
