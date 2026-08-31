#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const fileExists = (relativePath) => existsSync(path.join(root, relativePath));
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);
const excludes = (source, needle) => !source.includes(needle);
const excludesAll = (source, needles) => needles.every((needle) => excludes(source, needle));

const channelSettings = read("app/channel-settings.tsx");
const creatorSetupRoute = read("app/creator-monetization-setup.tsx");
const monetizeRoute = read("app/monetize.tsx");
const revenueRoute = read("app/revenue.tsx");
const payoutsRoute = read("app/payouts.tsx");
const routeTargets = read("_lib/creatorMonetizationRouteTargets.ts");
const creatorSetup = read("_lib/creatorMonetizationSetup.ts");
const creatorPayouts = read("_lib/creatorPayouts.ts");
const creatorTips = read("_lib/creatorTips.ts");
const creatorPaidVideos = read("_lib/creatorPaidVideos.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const paidWatchPartyTickets = read("_lib/paidWatchPartyTickets.ts");
const channelSubscriptions = read("_lib/channelSubscriptions.ts");
const creatorVipPasses = read("_lib/creatorVipPasses.ts");
const paidCreatorEvents = read("_lib/paidCreatorEvents.ts");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const playerRoute = read("app/player/[id].tsx");
const platformRoute = read("app/channel/[userId].tsx");
const tipSheet = read("components/monetization/tip-sheet.tsx");
const watchPartyRoute = read("app/watch-party/[partyId].tsx");
const channelSubscriptionRoute = read("app/channel-subscription/[creatorId].tsx");
const vipRoute = read("app/vip-pass/[creatorId].tsx");
const eventRoute = read("app/event/[eventId].tsx");
const paidEventStatusGuardMigration = read("supabase/migrations/20260630091500_paid_event_pass_terminal_event_status_guard.sql");

const routeFiles = [
  "app/channel-settings.tsx",
  "app/creator-monetization-setup.tsx",
  "app/monetize.tsx",
  "app/revenue.tsx",
  "app/payouts.tsx",
  "app/player/[id].tsx",
  "app/watch-party/[partyId].tsx",
  "app/channel-subscription/[creatorId].tsx",
  "app/vip-pass/[creatorId].tsx",
  "app/event/[eventId].tsx",
];
for (const relativePath of routeFiles) {
  add(`route/source file exists: ${relativePath}`, fileExists(relativePath), relativePath);
}

const requiredRoutes = [
  ["creator setup compatibility", creatorSetupRoute, "/channel-studio?tab=monetization&focus=offers"],
  ["monetize compatibility", monetizeRoute, "/channel-studio?tab=monetization&focus=offers"],
  ["revenue compatibility", revenueRoute, "/channel-studio?tab=monetization&focus=balance"],
  ["payouts compatibility", payoutsRoute, "/channel-studio?tab=monetization&focus=payouts"],
];
for (const [name, source, needle] of requiredRoutes) {
  add(name, includes(source, needle), needle);
}

[
  ["Money Center tab focus", "normalizeMonetizationSectionId"],
  ["Offers focus accepted", 'normalized === "offers"'],
  ["Payout route focus", "focus=payouts"],
  ["Tips actual tappable CTA testID", "money-feature-tips-cta"],
  ["Paid Video actual tappable CTA testID", "money-feature-paid_video-cta"],
  ["Watch-Party Seat Pass actual tappable CTA testID", "money-feature-watch_party_ticket-cta"],
  ["Channel Subscription actual tappable CTA testID", "money-feature-channel_subscription-cta"],
  ["VIP actual tappable CTA testID", "money-feature-vip-cta"],
  ["Event Pass actual tappable CTA testID", "money-feature-event_pass-cta"],
  ["Money Center open Ways to Earn CTA", "money-center-open-ways-to-earn-button"],
  ["Money Center open Ways to Earn human tap handler", "onPress={openWaysToEarn}"],
  ["Money Center route/deep-link focus handler", "focusMoneyCenterSection"],
  ["Money Center selected accordion stays visible", "isMoneyCenterSectionBodyVisible(expanded)"],
  ["Money Center canonical overview renderer", "{renderMoneyCenterOverviewContent()}"],
  ["Money Center canonical Ways to Earn panel", 'renderWaysToEarnContent("money-center-ways-to-earn-panel")'],
  ["Money Center manager renders inline after selected feature card", "activeMoneyManageTarget === feature.key ?"],
  ["Money Center inline manager occupies full feature grid width", "moneyFeatureManagerInline"],
  ["Money Center manager close action", "money-manager-close-button"],
  ["Money Center monetization stack anchor", "money-center-monetization-section-stack"],
  ["Money Center section focus anchors", "money-section-${id}"],
  ["Money Center Tips manager panel", "money-manager-tips"],
  ["Money Center Paid Video manager panel", "money-manager-paid_video"],
  ["Money Center Watch-Party manager panel", "money-manager-watch_party_ticket"],
  ["Money Center Channel Subscription manager panel", "money-manager-channel_subscription"],
  ["Money Center VIP manager panel", "money-manager-vip"],
  ["Money Center Event Pass manager panel", "money-manager-event_pass"],
  ["Money Center cashout readiness focused panel", "money-manager-cashout-readiness"],
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
  ["Sandbox/not-payable setup copy", "sandbox/not-payable"],
  ["Production not live copy", "Production sales require owner/provider activation"],
].forEach(([name, needle]) => add(name, includes(channelSettings, needle), needle));

[
  ["Money Center no absolute section offset guessing", "monetizationStackOffsetRef.current + sectionOffset"],
  ["Money Center no forward scroll guess", "startingScrollY + 920"],
  ["Money Center no hardcoded Ways to Earn offset", "id === \"ways_to_earn\" ? 3600 : 2600"],
  ["Money Center no imperative focus scrollTo", "studioScrollRef.current?.scrollTo"],
  ["Money Center no timed manager focus retries", "focusActiveMoneyManagerPanel"],
  ["Money Center no duplicate rendered focus tabs", "{renderMoneyCenterFocusTabs()}"],
  ["Money Center no duplicate rendered focused content", "{renderActiveMoneyCenterFocusContent()}"],
  ["Money Center no duplicate focus-tab surface", "money-center-focus-tabs"],
  ["Money Center no duplicate focused Ways to Earn panel", "money-center-ways-to-earn-focused-panel"],
  ["Money Center no duplicate Overview accordion", 'id: "overview",\n            title: "Overview"'],
  ["Money Center no duplicate creator setup CTA", "money-center-creator-setup-button"],
  ["Money Center no duplicate cashout readiness CTA", "money-center-cashout-readiness-button"],
].forEach(([name, needle]) => add(name, excludes(channelSettings, needle), needle));

const addCreatorSetupChecks = (flow) => {
  add(`${flow.name} feature catalog key`, includes(channelSettings, flow.featureKey), flow.featureKey);
  add(`${flow.name} Money Center setup action`, includes(channelSettings, flow.manager), flow.manager);
  add(`${flow.name} approved sandbox tier`, includes(creatorSetup, flow.productKey) && includes(channelSettings, flow.productKey), flow.productKey);
  add(`${flow.name} source type save`, includes(channelSettings, flow.sourceType), flow.sourceType);
  add(`${flow.name} saved config readback path`, includes(channelSettings, "creatorSandboxConfigs") && includes(channelSettings, "money-saved-sandbox-config-readback"), "saved sandbox config readback");
  add(`${flow.name} sandbox/not-payable copy`, includes(channelSettings, "sandbox/not-payable") && includes(channelSettings, "No real payout"), "sandbox/not-payable and no payout copy");
  add(`${flow.name} viewer route target`, includes(routeTargets, flow.viewerRoute), flow.viewerRoute);
};

const flowChecks = [
  {
    name: "Paid Video",
    featureKey: "paid_videos",
    manager: "money-manager-paid-video-edit-button",
    productKey: "paid_content_access_sandbox_099",
    sourceType: 'sourceType: "paid_content"',
    viewerRoute: 'viewerTarget: "/player/[id]"',
    viewerChecks: [
      ["viewer route reads creator video access state", creatorVideos, "resolveCreatorContentAccess"],
      ["viewer route locks unpaid state", playerRoute, "creatorVideoPaidContentLocked"],
      ["viewer route renders lock card", playerRoute, "paid-video-lock-card"],
      ["viewer route has sandbox purchase/status action", playerRoute, "tester-paid-video-unlock-button"],
      ["viewer route keeps clear unlock CTA", playerRoute, "Unlock Video"],
      ["viewer route has simple unavailable copy", playerRoute, "Paid Video purchases are temporarily unavailable while setup is being finalized."],
      ["viewer route uses paid-video purchase helper", playerRoute, "purchasePaidVideoAccess"],
      ["viewer purchase helper resolves exact video", creatorPaidVideos, "resolvePaidVideoAccess(input.videoId)"],
      ["viewer purchase helper creates exact source intent", creatorPaidVideos, 'p_source_id: input.videoId'],
      ["viewer purchase helper binds paid content source type", creatorPaidVideos, 'p_source_type: "paid_content"'],
      ["viewer purchase helper prevents wrong creator binding", creatorPaidVideos, "access.creatorId !== input.creatorId"],
      ["viewer canceled state is clear", creatorPaidVideos, "Paid Video unlock was canceled. Nothing changed."],
      ["viewer success/readback rechecks exact video", creatorPaidVideos, "waitForPaidVideoAccess(input.videoId)"],
      ["viewer success receipt exists", playerRoute, "paid-video-purchase-success-receipt"],
      ["viewer copy keeps unrelated unlocks separate", playerRoute, "other creator videos stay separate"],
    ],
  },
  {
    name: "Tips",
    featureKey: "tips",
    manager: "money-manager-tips-enable-button",
    productKey: "creator_tip_sandbox_099",
    sourceType: 'sourceType: "creator_tip"',
    viewerRoute: 'viewerTarget: "tip_sheet"',
    viewerChecks: [
      ["creator Tips save uses sandbox config helper", channelSettings, "saveCreatorTipSandboxSetupConfig"],
      ["creator Tips save writes sandbox/not-payable metadata", channelSettings, 'tip_setup_mode: "sandbox_not_payable"'],
      ["creator Tips save preserves public-status RPC as non-blocking sync", channelSettings, "publicStatusSyncError"],
      ["creator Tips setup readback uses saved config", channelSettings, "creatorTipSandboxConfig"],
      ["creator Tips manager can refresh saved setup", channelSettings, "money-manager-tips-refresh-button"],
      ["viewer creator surface reads tip status", platformRoute, "readCreatorTipPublicStatus"],
      ["viewer creator surface opens tip sheet", platformRoute, "setTipSheetVisible(true)"],
      ["viewer creator surface has shared tip opener", platformRoute, "const openTipSheet = useCallback"],
      ["viewer tip CTA exists", platformRoute, "platform-support-tip-button"],
      ["viewer header sandbox tip CTA exists", platformRoute, "platform-sandbox-tip-button"],
      ["viewer sandbox tip CTA exists", platformRoute, "tester-tip-creator-button"],
      ["viewer support CTA testID is on actual touchable", platformRoute, "testID={item.testID}"],
      ["viewer tip sheet visible state is wired", platformRoute, "visible={tipSheetVisible}"],
      ["viewer tip sheet route exists", tipSheet, "testID=\"tip-sheet\""],
      ["viewer tip sheet confirm action exists", tipSheet, "tip-confirm-button"],
      ["viewer tip sheet amount options are accessible buttons", tipSheet, "Choose ${formatMonetizationCurrency(amount, tipStatus?.currency ?? \"usd\")} tip amount"],
      ["viewer tip sheet secondary action is tappable", tipSheet, "tip-sheet-not-now-button"],
      ["platform-neutral viewer purchase helper is wired", tipSheet, "purchaseCreatorTipWithStore"],
      ["viewer helper uses sandbox tip product key", creatorTips, "creator_tip_sandbox_099"],
      ["viewer helper uses RevenueCat sandbox tip product", creatorTips, "cw_creator_tip_sandbox_099"],
      ["viewer helper creates creator-tip intent", creatorTips, 'p_product_key: CREATOR_TIP_SANDBOX_PRODUCT_KEY'],
      ["viewer helper scopes tip to creator id", creatorTips, "p_source_id: creatorId"],
      ["viewer helper binds creator-tip source type", creatorTips, 'p_source_type: "creator_tip"'],
      ["viewer copy says tips unlock nothing", tipSheet, "Tips do not unlock videos, events, rooms, VIP, subscriptions, badges, public rewards, or merchandise."],
      ["viewer canceled tip state is clear", creatorTips, "Tip canceled. Nothing changed."],
      ["viewer sandbox success copy defers creator credit to verified provider reconciliation", creatorTips, "message: \"Sandbox tip purchase received. Creator credit waits for verified provider reconciliation.\""],
      ["viewer tip intent is no-access-grant", creatorTips, "no_access_grant: true"],
      ["viewer tip intent is not payable", creatorTips, "not_payable: true"],
      ["viewer success/readback is not payable", creatorTips, "no_live_payout: true"],
    ],
  },
  {
    name: "Watch-Party Seat Pass",
    featureKey: "paid_watch_parties",
    manager: "money-manager-watch-party-save-config-button",
    productKey: "watch_party_live_ticket_sandbox_099",
    sourceType: 'sourceType: "watch_party_live"',
    viewerRoute: 'viewerTarget: "/watch-party/[partyId]"',
    viewerChecks: [
      ["viewer route resolves Party Room Seat Pass access", watchPartyRoute, "resolvePaidWatchPartyTicketAccess(snapshot.room.partyId)"],
      ["viewer route renders ticket lock card", watchPartyRoute, "watch-party-ticket-lock-card"],
      ["viewer route has Seat Pass purchase action", watchPartyRoute, "watch-party-ticket-purchase-button"],
      ["viewer route labels Seat Pass gate clearly", watchPartyRoute, "Seat Pass required"],
      ["viewer route keeps clear Seat Pass CTA", watchPartyRoute, "Get Seat Pass"],
      ["viewer route has simple Seat Pass unavailable copy", watchPartyRoute, "Seat Pass purchases are temporarily unavailable while setup is being finalized."],
      ["viewer route uses Seat Pass purchase helper", watchPartyRoute, "purchasePaidWatchPartyTicket"],
      ["viewer purchase helper resolves exact party", paidWatchPartyTickets, "resolvePaidWatchPartyTicketAccess(input.partyId)"],
      ["viewer success/readback rechecks exact party", paidWatchPartyTickets, "waitForPaidWatchPartyTicketAccess(input.partyId)"],
      ["viewer purchase helper uses offer id while readback stays party scoped", paidWatchPartyTickets, "createPaidWatchPartyTicketPurchaseIntent(access.offer.id,"],
      ["viewer canceled state is clear", paidWatchPartyTickets, "Seat Pass purchase was canceled. Nothing changed."],
      ["viewer route target is Party Room", routeTargets, 'viewerTarget: "/watch-party/[partyId]"'],
      ["viewer route target is not Live Stage", routeTargets, 'viewerTarget: "/watch-party/live-stage/[partyId]"', false],
      ["viewer copy keeps LiveKit authority separate", paidWatchPartyTickets, 'room_type: "party_room"'],
      ["viewer success receipt exists", watchPartyRoute, "watch-party-ticket-success-receipt"],
    ],
  },
  {
    name: "Platform Subscription",
    featureKey: "channel_subscriptions",
    manager: "money-manager-channel-subscription-enable-button",
    productKey: "channel_subscription_sandbox_monthly_499",
    sourceType: 'sourceType: "channel_subscription"',
    viewerRoute: 'viewerTarget: "/channel-subscription/[creatorId]"',
    viewerChecks: [
      ["viewer route exists", channelSubscriptionRoute, "screen-channel-subscription"],
      ["viewer route resolves creator subscription access", channelSubscriptionRoute, "resolveChannelSubscriptionAccess(creatorId)"],
      ["viewer route renders locked/unpaid state", channelSubscriptionRoute, "subscriber-area-access-denied-state"],
      ["viewer route has subscribe/status action", channelSubscriptionRoute, "subscriber-area-subscribe-button"],
      ["viewer route keeps clear subscription CTA", channelSubscriptionRoute, "Start Platform Subscription"],
      ["viewer route has simple unavailable copy", channelSubscriptionRoute, "Platform Subscription purchases are temporarily unavailable while setup is being finalized."],
      ["viewer route uses subscription purchase helper", channelSubscriptionRoute, "purchaseChannelSubscription"],
      ["viewer purchase helper resolves exact creator", channelSubscriptions, "resolveChannelSubscriptionAccess(input.creatorId)"],
      ["viewer success/readback rechecks exact creator", channelSubscriptions, "waitForChannelSubscriptionAccess(input.creatorId)"],
      ["viewer purchase helper creates offer-scoped intent", channelSubscriptions, "createChannelSubscriptionPurchaseIntent(access.offer.id,"],
      ["viewer canceled state is clear", channelSubscriptions, "Platform Subscription was canceled. Nothing changed."],
      ["viewer route is creator subscription, not Premium", routeTargets, 'viewerTarget: "/channel-subscription/[creatorId]"'],
      ["viewer route target does not point to Premium subscribe", routeTargets, 'platformSubscription: {\n    ownerTarget', true],
      ["viewer copy keeps Premium separate", channelSubscriptionRoute, "does not include Chi'llywood Premium"],
    ],
  },
  {
    name: "VIP",
    featureKey: "vip_passes",
    manager: "money-manager-vip-pass-enable-button",
    productKey: "vip_pass_sandbox_499",
    sourceType: 'sourceType: "vip_pass"',
    viewerRoute: 'viewerTarget: "/vip-pass/[creatorId]"',
    viewerChecks: [
      ["viewer route exists", vipRoute, "screen-vip-pass"],
      ["viewer route resolves creator VIP access", vipRoute, "resolveCreatorVipPassAccess(creatorId)"],
      ["viewer route renders locked/unpaid state", vipRoute, "vip-area-access-denied-state"],
      ["viewer route has VIP/status action", vipRoute, "vip-area-get-vip-button"],
      ["viewer route keeps clear VIP CTA", vipRoute, "Get VIP Pass"],
      ["viewer route has simple unavailable copy", vipRoute, "VIP Pass purchases are temporarily unavailable while setup is being finalized."],
      ["viewer route uses VIP purchase helper", vipRoute, "purchaseCreatorVipPass"],
      ["viewer purchase helper resolves exact creator", creatorVipPasses, "resolveCreatorVipPassAccess(input.creatorId)"],
      ["viewer success/readback rechecks exact creator", creatorVipPasses, "waitForCreatorVipPassAccess(input.creatorId)"],
      ["viewer purchase helper creates offer-scoped intent", creatorVipPasses, "createCreatorVipPassPurchaseIntent(access.offer.id,"],
      ["viewer canceled state is clear", creatorVipPasses, "VIP Pass purchase was canceled. Nothing changed."],
      ["viewer route target is VIP", routeTargets, 'viewerTarget: "/vip-pass/[creatorId]"'],
      ["viewer copy keeps Premium separate", vipRoute, "VIP does not unlock Chi'llywood Premium"],
      ["viewer copy keeps other creators separate", vipRoute, "other creators stay separate"],
    ],
  },
  {
    name: "Event Pass",
    featureKey: "paid_events",
    manager: "money-manager-paid-event-edit-button",
    productKey: "event_pass_sandbox_099",
    sourceType: 'sourceType: "event"',
    viewerRoute: 'viewerTarget: "/event/[eventId]"',
    viewerChecks: [
      ["viewer route exists", eventRoute, "screen-event"],
      ["viewer route resolves paid event access", eventRoute, "resolvePaidCreatorEventPassAccess(eventId)"],
      ["viewer route renders lock card", eventRoute, "event-pass-lock-card"],
      ["viewer route renders unavailable state", eventRoute, "event-pass-access-denied-state"],
      ["viewer route has event pass purchase action", eventRoute, "event-pass-purchase-button"],
      ["viewer route keeps clear Event Pass CTA", eventRoute, "Get Event Pass"],
      ["viewer route has simple unavailable copy", eventRoute, "Event Pass purchases are temporarily unavailable while setup is being finalized."],
      ["viewer route has accessible back action", eventRoute, "event-back-button"],
      ["viewer route uses event pass purchase helper", eventRoute, "purchasePaidCreatorEventPass"],
      ["viewer purchase helper resolves exact event", paidCreatorEvents, "resolvePaidCreatorEventPassAccess(input.creatorEventId)"],
      ["viewer purchase helper uses offer id for purchase intent", paidCreatorEvents, "createPaidCreatorEventPassPurchaseIntent(access.offer.id,"],
      ["viewer success/readback rechecks exact event", paidCreatorEvents, "waitForPaidCreatorEventPassAccess(input.creatorEventId)"],
      ["viewer canceled state is clear", paidCreatorEvents, "Event Pass purchase was canceled. Nothing changed."],
      ["viewer route target is event", routeTargets, 'viewerTarget: "/event/[eventId]"'],
      ["viewer copy keeps unrelated unlocks separate", eventRoute, "other events, or LiveKit host controls"],
      ["viewer terminal status guard migration exists", paidEventStatusGuardMigration, "ended', 'expired', 'canceled', 'removed', 'unsafe', 'blocked"],
      ["viewer terminal status guard protects resolver", paidEventStatusGuardMigration, 'resolve_paid_creator_event_pass_access'],
      ["viewer terminal status guard protects purchase intent", paidEventStatusGuardMigration, 'create_paid_creator_event_pass_purchase_intent'],
    ],
  },
];

for (const flow of flowChecks) {
  addCreatorSetupChecks(flow);
  for (const [name, source, needle, expected = true] of flow.viewerChecks) {
    add(`${flow.name} ${name}`, expected ? includes(source, needle) : excludes(source, needle), needle);
  }
}

[
  ["Cashout readiness payout section button", "money-payout-review-readiness-button"],
  ["Cashout readiness is reachable", "handleReviewCashoutReadiness"],
  ["Cashout readiness uses payout summary", "readCreatorPayoutDashboardSummary"],
  ["Cashout readiness uses resolver", "resolveCreatorPayoutReadiness"],
  ["Cashout readiness preview does not execute", "previewCreatorPayoutPreproductionWorkflow"],
  ["Cashout readiness says no real payout", "No real payout will be sent"],
  ["Cashout readiness says no payable balance", "no payable balance is created"],
  ["Cashout readiness says production movement off", "Payouts and cashout remain OFF for production money movement"],
].forEach(([name, needle]) => add(name, includes(channelSettings, needle), needle));

[
  ["Cashout has no viewer route target", "cashout"],
  ["Payout has no viewer route target", "payout"],
  ["Withdraw has no viewer route target", "withdraw"],
].forEach(([name, needle]) => add(name, excludes(routeTargets, needle), needle));

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

const unsafeLiveMoneyNeedles = [
  "liveMoneyEnabled: true",
  "payoutsEnabled: true",
  "cashoutEnabled: true",
  'live_money_enabled: "on"',
  'payouts_enabled: "on"',
];
unsafeLiveMoneyNeedles.forEach((needle) => {
  add(`unsafe money default absent: ${needle}`, excludes(`${featureFlags}\n${moneyFlags}`, needle), needle);
});

const forbiddenViewerUnlockMixes = [
  [creatorTips, ["paid_video_unlock: true", "vip_unlock: true", "subscription_unlock: true", "payoutCreated: true"]],
  [creatorPaidVideos, ["premium_unlock: true", "tips_path: true", "payoutCreated: true"]],
  [paidWatchPartyTickets, ["grants_host_authority: true", "room_media_controls: true", "payoutCreated: true"]],
  [channelSubscriptions, ["premium_unlock: true", "vip_unlock: true", "payoutCreated: true"]],
  [creatorVipPasses, ["premium_unlock: true", "subscription_unlock: true", "payoutCreated: true"]],
  [paidCreatorEvents, ["premium_unlock: true", "vip_unlock: true", "subscription_unlock: true", "grants_host_authority: true"]],
];
for (const [source, needles] of forbiddenViewerUnlockMixes) {
  add(`forbidden unrelated viewer unlocks absent (${needles[0]})`, excludesAll(source, needles), needles.join(", "));
}

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
