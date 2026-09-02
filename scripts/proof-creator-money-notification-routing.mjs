#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const notifications = read("_lib/notifications.ts");
const layout = read("app/_layout.tsx");
const revenuecatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const routeTargets = read("_lib/creatorMonetizationRouteTargets.ts");

[
  "/player/[id]",
  "/watch-party/[partyId]",
  "/watch-party/live-stage/[partyId]",
  "/channel-subscription/[creatorId]",
  "/vip-pass/[creatorId]",
  "/event/[eventId]",
  "/channel/[userId]",
  "/channel-studio",
  "/subscribe",
  "/chat",
  "/chat/[threadId]",
  "/settings",
].forEach((route) => add(`notification target route supports ${route}`, includes(notifications, route), route));

[
  "/player/",
  "/watch-party/",
  "/channel-subscription/",
  "/vip-pass/",
  "/event/",
  "/channel-studio",
  "/subscribe",
  "/chat/",
  "/settings",
].forEach((prefix) => add(`deep-link normalization accepts ${prefix}`, includes(notifications, prefix), prefix));

[
  "chillywoodmobile://player/",
  "chillywoodmobile://watch-party/",
  "chillywoodmobile://channel-subscription/",
  "chillywoodmobile://vip-pass/",
  "chillywoodmobile://event/",
  "chillywoodmobile://channel/",
  "chillywoodmobile://channel-studio?tab=monetization&focus=transactions",
].forEach((deepLink) => add(`backend emits ${deepLink}`, includes(revenuecatWebhook, deepLink), deepLink));

add("notification response handler routes push tap paths", includes(layout, "subscribeToNotificationResponses"), "subscribeToNotificationResponses");
add("notification response handler sanitizes then uses router.push",
  includes(layout, "const safePath = sanitizeExternalIosNativeCallPath(path)")
    && includes(layout, "router.push(safePath as Parameters<typeof router.push>[0])"),
  "sanitized router.push notification path");
add("Watch-Party money notification targets Party Room", includes(revenuecatWebhook, 'route: "/watch-party/[partyId]"'), "/watch-party/[partyId]");
add("Watch-Party route target stays Party Room in route truth", includes(routeTargets, 'viewerTarget: "/watch-party/[partyId]"'), "Party Room viewer target");
add("Party Room Pass deep link stays on the exact canonical Party Room path", includes(revenuecatWebhook, "deepLink: `chillywoodmobile://watch-party/${partyId}`"), "exact Party Room deep link");
add("Live Stage Pass and Seat Pass deep links use the exact Live Stage path", includes(revenuecatWebhook, "deepLink: `chillywoodmobile://watch-party/live-stage/${partyId}`"), "exact Live Stage deep link");
add("Live Stage notification target is distinct from Party Room", includes(revenuecatWebhook, 'route: "/watch-party/live-stage/[partyId]"'), "distinct Live Stage route");
add("Event Pass deep link stays on the exact canonical Event path", includes(revenuecatWebhook, "deepLink: `chillywoodmobile://event/${creatorEventId}`"), "exact Event deep link");
add("Party Room notification target is derived from its exact canonical offer", includes(revenuecatWebhook, '.from("paid_watch_party_offers")') && includes(revenuecatWebhook, '.eq("creator_id", creatorId)'), "exact Party Room offer binding");
add("Live Stage notification target is derived from its exact canonical offer and product", includes(revenuecatWebhook, '.from("paid_live_watch_party_offers")') && includes(revenuecatWebhook, '.eq("pass_type", input.productType)'), "exact Live Stage offer binding");
add("Event notification target is derived from its exact creator Event", includes(revenuecatWebhook, '.from("paid_creator_events")') && includes(revenuecatWebhook, '.eq("creator_event_id", sourceId)'), "exact Event binding");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Creator money notification routing proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Creator money notification routing proof passed.");
