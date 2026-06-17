#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => existsSync(path.join(root, relativePath));

const fail = (message) => {
  console.error(`Route contract guard failed: ${message}`);
  process.exitCode = 1;
};

const assertFile = (relativePath, label) => {
  if (!exists(relativePath)) fail(`${label} file is missing: ${relativePath}`);
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const assertScopedIncludes = (source, startNeedle, endNeedle, needle, label) => {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) {
    fail(`${label} scope could not be found`);
    return "";
  }

  const scoped = source.slice(start, end);
  assertIncludes(scoped, needle, label);
  return scoped;
};

[
  ["app/watch-party/index.tsx", "Party Waiting Room"],
  ["app/watch-party/[partyId].tsx", "Party Room"],
  ["app/watch-party/live-stage/[partyId].tsx", "Live Stage"],
  ["app/player/[id].tsx", "Player"],
  ["app/title/[id].tsx", "Title"],
  ["app/channel-studio/index.tsx", "Platform Studio preferred wrapper"],
  ["app/channel-settings.tsx", "Platform Studio compatibility implementation"],
  ["app/channel/[userId].tsx", "Public Platform"],
  ["app/channel-subscription/[creatorId].tsx", "Subscriber Area"],
  ["app/vip-pass/[creatorId].tsx", "VIP Area"],
  ["app/chat/index.tsx", "Chi'lly Chat inbox"],
  ["app/chat/[threadId].tsx", "Chi'lly Chat thread"],
  ["app/subscribe.tsx", "Premium route"],
  ["_lib/platformIdentity.ts", "Platform identity resolver"],
  ["_lib/platformModes.ts", "Platform owner/viewer mode resolver"],
  ["_lib/creatorMonetizationRouteTargets.ts", "Creator money route targets"],
].forEach(([relativePath, label]) => assertFile(relativePath, label));

const appLayout = read("app/_layout.tsx");
const watchPartyIndex = read("app/watch-party/index.tsx");
const partyRoom = read("app/watch-party/[partyId].tsx");
const player = read("app/player/[id].tsx");
const title = read("app/title/[id].tsx");
const channelStudio = read("app/channel-studio/index.tsx");
const channelSettings = read("app/channel-settings.tsx");
const publicPlatform = read("app/channel/[userId].tsx");
const communicationIndex = read("app/communication/index.tsx");
const communicationRoom = read("app/communication/[roomId].tsx");
const monetization = read("_lib/monetization.ts");
const channelSubscriptionRoute = read("app/channel-subscription/[creatorId].tsx");
const vipRoute = read("app/vip-pass/[creatorId].tsx");
const platformIdentity = read("_lib/platformIdentity.ts");
const platformModes = read("_lib/platformModes.ts");
const creatorMoneyRouteTargets = read("_lib/creatorMonetizationRouteTargets.ts");
const routeDoc = read("docs/NAVIGATION_TERMINOLOGY_MAP.md");

assertIncludes(appLayout, '<Stack.Screen name="watch-party/index" />', "Waiting Room route registration");
assertIncludes(appLayout, '<Stack.Screen name="watch-party/[partyId]" />', "Party Room route registration");
assertIncludes(appLayout, '<Stack.Screen name="watch-party/live-stage/[partyId]" />', "Live Stage route registration");
assertIncludes(appLayout, '<Stack.Screen name="chat/index" />', "Chi'lly Chat inbox route registration");
assertIncludes(appLayout, '<Stack.Screen name="chat/[threadId]" />', "Chi'lly Chat thread route registration");
assertIncludes(appLayout, '<Stack.Screen name="channel-studio/index" />', "Platform Studio preferred route registration");
assertIncludes(appLayout, '<Stack.Screen name="channel-settings" />', "Platform Studio compatibility route registration");
assertIncludes(appLayout, '<Stack.Screen name="subscribe" />', "Premium route registration");

assertIncludes(watchPartyIndex, 'pathname: "/watch-party/[partyId]"', "Party Waiting Room to Party Room handoff");
assertIncludes(watchPartyIndex, 'const liveStageRoute = `/watch-party/live-stage${queryString ? `?${queryString}` : ""}`;', "Live Waiting Room to Live Stage handoff");
assertIncludes(watchPartyIndex, "if (options.roomType === \"live\")", "Live Waiting Room branch");
assertIncludes(watchPartyIndex, "setEmbeddedLiveStageEntry", "Live Stage embedded handoff owner");
assertIncludes(partyRoom, 'pathname: "/watch-party/live-stage/[partyId]"', "Party Room explicit Go Live route");

const paidTicketPurchaseScope = assertScopedIncludes(
  watchPartyIndex,
  "const onBuyPaidTicketAndJoin = useCallback(async () => {",
  "}, [isSignedIn, navigateToPreviewRoom, preparedRoom, preview, router]);",
  "navigateToPreviewRoom(targetPreview);",
  "Paid Watch-Party ticket buyer post-purchase path",
);
assertNotIncludes(paidTicketPurchaseScope, "/watch-party/live-stage", "Paid Watch-Party ticket buyer path");
assertNotIncludes(paidTicketPurchaseScope, "setEmbeddedLiveStageEntry", "Paid Watch-Party ticket buyer path");

assertIncludes(player, "PLAYER_WATCH_PARTY_SOURCE", "Player content-first Watch-Party handoff source");
assertIncludes(player, 'pathname: "/watch-party"', "Player to Watch-Party Waiting Room handoff");
assertIncludes(player, "sourceType: \"creator_video\"", "Player creator-video handoff");
assertIncludes(player, "sourceType: \"platform_title\"", "Player platform-title handoff");
assertIncludes(player, "ensureWatchPartyLivePremium", "Player Watch-Party Premium preflight");
assertIncludes(title, 'pathname: "/watch-party"', "Title to Watch-Party Waiting Room handoff");
assertIncludes(title, "requireWatchPartyLivePremium", "Title Watch-Party Premium preflight");

assertIncludes(channelStudio, 'import { ChannelStudioScreen } from "../channel-settings";', "Platform Studio wrapper import");
assertIncludes(channelStudio, "export default ChannelStudioScreen;", "Platform Studio wrapper export");
assertIncludes(channelSettings, "export function ChannelStudioScreen()", "Platform Studio implementation owner");
assertIncludes(routeDoc, "/channel-studio` | Platform Studio", "Platform Studio preferred route doc");
assertIncludes(routeDoc, "/channel-settings` | Platform Studio compatibility", "Platform Studio compatibility route doc");

assertIncludes(communicationIndex, '<Redirect href="/chat" />', "Communication inbox compatibility redirect");
assertIncludes(communicationRoom, 'pathname: "/chat/[threadId]"', "Communication room compatibility thread redirect");
assertIncludes(communicationRoom, 'router.replace("/chat")', "Communication room compatibility inbox fallback");

assertIncludes(monetization, 'premium_subscription: {', "Premium target remains separate");
assertIncludes(monetization, 'id: "premium_subscription"', "Premium product id remains separate");
assertIncludes(channelSubscriptionRoute, "does not include Chi'llywood Premium", "Channel Subscription separation copy");
assertIncludes(vipRoute, "does not unlock Chi'llywood Premium", "VIP separation copy");
assertIncludes(platformIdentity, "GENERATED_USERNAME_PATTERN", "Platform identity generated fallback guard");
assertIncludes(platformIdentity, '"Untitled Platform"', "Platform identity clean fallback");
assertIncludes(publicPlatform, "resolvePlatformDisplayIdentity", "Public Platform identity resolver usage");
assertIncludes(channelSubscriptionRoute, "resolvePlatformDisplayIdentity", "Subscriber Area identity resolver usage");
assertIncludes(vipRoute, "resolvePlatformDisplayIdentity", "VIP Area identity resolver usage");
assertIncludes(platformModes, '"owner_mode"', "Platform owner mode contract");
assertIncludes(platformModes, '"viewer_mode"', "Platform viewer mode contract");
assertIncludes(platformModes, '"sandbox_tester_mode"', "Platform sandbox tester mode contract");
assertIncludes(publicPlatform, "resolvePublicPlatformMode", "Public Platform mode resolver usage");
assertIncludes(publicPlatform, "isViewerPurchasePlatformMode", "Public Platform viewer purchase mode guard");
assertIncludes(publicPlatform, "isOwnerPlatformMode", "Public Platform owner mode guard");
assertIncludes(creatorMoneyRouteTargets, "platformSubscription", "Creator subscription route target");
assertIncludes(creatorMoneyRouteTargets, "vipPass", "Creator VIP route target");
assertIncludes(creatorMoneyRouteTargets, 'pathname: "/channel-studio"', "Creator offer owner management target");
assertIncludes(publicPlatform, "CREATOR_MONEY_ROUTE_TARGETS.platformSubscription.ownerTarget", "Public Platform subscription manage target");
assertIncludes(publicPlatform, "CREATOR_MONEY_ROUTE_TARGETS.vipPass.ownerTarget", "Public Platform VIP manage target");
assertIncludes(publicPlatform, "Creator Offers", "Public Platform owner creator-offers surface");
assertIncludes(publicPlatform, "Manage offers. Do not buy your own.", "Public Platform owner self-purchase copy");
assertIncludes(publicPlatform, "Support this Platform", "Public Platform viewer support surface");
[
  "platform-support-tip-button",
  "platform-support-subscribe-button",
  "platform-support-vip-button",
  "platform-support-paid-video-button",
  "platform-support-ticket-button",
  "platform-support-event-pass-button",
  "platform-content-open-button",
].forEach((needle) => assertIncludes(publicPlatform, needle, "Public Platform stable selector"));
assertIncludes(channelSubscriptionRoute, "Owners cannot buy their own creator subscription", "Subscriber Area owner self-purchase guard");
assertIncludes(vipRoute, "Owners cannot buy their own creator VIP pass", "VIP Area owner self-purchase guard");
assertIncludes(channelSubscriptionRoute, "subscriber-area-manage-offer-button", "Subscriber Area manage selector");
assertIncludes(channelSubscriptionRoute, "subscriber-area-preview-button", "Subscriber Area preview selector");
assertIncludes(vipRoute, "vip-area-manage-offer-button", "VIP Area manage selector");
assertIncludes(vipRoute, "vip-area-preview-button", "VIP Area preview selector");
assertNotIncludes(creatorMoneyRouteTargets, 'platformSubscription: {\n    ownerTarget: "/subscribe"', "Creator subscription owner route");
assertNotIncludes(creatorMoneyRouteTargets, 'vipPass: {\n    ownerTarget: "/subscribe"', "Creator VIP owner route");

if (process.exitCode) process.exit();
console.log("Route contract guard passed.");
