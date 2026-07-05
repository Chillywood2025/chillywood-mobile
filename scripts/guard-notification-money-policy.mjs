#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Notification money policy guard failed: ${message}`);
  process.exitCode = 1;
};
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const packageJson = read("package.json");
const revenuecatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const settings = read("app/settings.tsx");
const notifications = read("_lib/notifications.ts");
const bell = read("components/notifications/notification-bell-button.tsx");
const chatIndex = read("app/chat/index.tsx");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const routeTargets = read("_lib/creatorMonetizationRouteTargets.ts");

assertIncludes(packageJson, "guard:notification-money-policy", "package guard script");
assertIncludes(packageJson, "proof:creator-money-notification-routing", "routing proof script");
assertIncludes(packageJson, "proof:creator-money-notification-records", "records proof script");
assertIncludes(packageJson, "proof:notification-center-money-activity", "activity proof script");

[
  "no_access_grant_from_notification: true",
  "no_payout_from_notification: true",
  "premium_unlock: false",
  "livekit_authority: false",
  "sandbox_only: true",
  "not_payable: true",
  "Tips do not unlock anything.",
].forEach((needle) => assertIncludes(revenuecatWebhook, needle, "notification safety context/copy"));

[
  "Sandbox proof record",
  "UI/routing proof",
  "not-payable proof",
  "Sandbox/not-payable; no payout was created.",
].forEach((needle) => assertNotIncludes(revenuecatWebhook, needle, "visible notification copy"));

[
  "readMoneyNotificationPreference",
  "creator_money_purchases_enabled",
  "creator_money_sales_enabled",
  "push_enabled",
  "in_app_enabled",
  "readAndroidPushTokens",
  "notification_delivery_attempts",
].forEach((needle) => assertIncludes(revenuecatWebhook, needle, "notification preference/push gate"));

assertIncludes(bell, "Real notification records for creator money, events, system alerts, and supported activity.", "bell Activity notification copy");
assertNotIncludes(chatIndex, "creator_money_sale", "Chat must not become money notification center");
assertNotIncludes(chatIndex, "creator_money_purchase", "Chat must not become money notification center");
assertIncludes(notifications, "resolveNotificationPath", "safe notification route resolver");
assertIncludes(moneyFlags, "live_money_enabled: \"off\"", "live money remains off");
assertIncludes(moneyFlags, "payouts_enabled: \"off\"", "payouts remain off");
assertIncludes(routeTargets, 'viewerTarget: "/watch-party/[partyId]"', "Watch-Party money routes to Party Room");

assertNotIncludes(revenuecatWebhook, "chillywoodmobile://watch-party/live-stage", "creator-money notifications must not route to Live Stage");
assertIncludes(revenuecatWebhook, "notifications guide buyers and creators", "notification code is route guidance only");
assertNotIncludes(revenuecatWebhook, "payout_request", "notifications must not create payout requests");
assertNotIncludes(settings, "Money notification Chat", "Chat must not become money notification center");

const staleSeatPassNotificationCopy = [
  ["Watch-Party", "Ticket"].join(" "),
  ["Watch", "Party", "Ticket"].join(" "),
  ["watch-party", "ticket"].join(" "),
  ["ticket", "sold"].join(" "),
  ["ticket", "ready"].join(" "),
  ["ticket", "manager"].join(" "),
];
[
  ["_lib/notifications.ts", notifications],
  ["supabase/functions/revenuecat-webhook/index.ts", revenuecatWebhook],
  ["app/settings.tsx", settings],
].forEach(([fileLabel, source]) => {
  staleSeatPassNotificationCopy.forEach((needle) => {
    assertNotIncludes(source, needle, `visible Seat Pass notification copy in ${fileLabel}`);
  });
});

if (process.exitCode) process.exit();

console.log("Notification money policy guard passed.");
