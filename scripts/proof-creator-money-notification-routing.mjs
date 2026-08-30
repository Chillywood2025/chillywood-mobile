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
add("Watch-Party money notification does not deep-link to Live Stage", !includes(revenuecatWebhook, "chillywoodmobile://watch-party/live-stage"), "no money Live Stage deep link");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Creator money notification routing proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Creator money notification routing proof passed.");
