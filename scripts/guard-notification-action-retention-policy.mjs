#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const assertIncludes = (source, needle, label) => assert(source.includes(needle), `${label}: missing ${needle}`);
const assertNotIncludes = (source, needle, label) => assert(!source.includes(needle), `${label}: must not include ${needle}`);

const packageJson = read("package.json");
const notifications = read("_lib/notifications.ts");
const settings = read("app/settings.tsx");
const bell = read("components/notifications/notification-bell-button.tsx");
const deviceTokens = read("supabase/functions/notification-device-tokens/index.ts");
const revenuecatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const chatIndex = read("app/chat/index.tsx");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");

[
  "proof:important-notification-accessibility",
  "guard:notification-action-retention-policy",
].forEach((needle) => assertIncludes(packageJson, needle, "package notification retention scripts"));

[
  "classifyNotificationAction",
  "readImportantNotificationList",
  "readNotificationActivityList",
  "NotificationActionGroup",
  "NotificationLifecycleStatus",
  "creator_money_purchase",
  "creator_money_sale",
  "chilly_chat_call",
  "chilly_chat_missed_call",
  "upcoming_event_reminder",
  "moderation_notice",
  "access_granted",
].forEach((needle) => assertIncludes(notifications, needle, "important notification model"));

[
  "paid_video_unlocked",
  "watch_party_ticket_ready",
  "channel_subscription_active",
  "vip_access_active",
  "event_pass_active",
  "tip_sent_receipt",
  "paid_video_sold",
  "watch_party_ticket_sold",
  "channel_subscription_started",
  "vip_pass_sold",
  "event_pass_sold",
  "tip_received",
].forEach((needle) => assertIncludes(notifications, needle, "creator-money important type coverage"));

assertIncludes(notifications, "readImportantNotificationList(userId, importantLimit)", "important rows must be read separately from recent rows");
assertIncludes(notifications, "readNotificationList(userId, recentLimit)", "recent rows must remain separate from important rows");
assertIncludes(notifications, "unreadCount: notifications.filter((notification) => !notification.isRead && !notification.isDismissed).length", "badge summary must ignore dismissed unread rows");
assertIncludes(notifications, "const payload: NotificationUpdate = { read_at", "mark-read must update read_at");
assertNotIncludes(notifications, "read_at: new Date().toISOString(), dismissed_at", "mark-read must not dismiss important rows");
assertIncludes(notifications, "dismissed_at: new Date().toISOString(), status: \"dismissed\"", "dismiss must be the hide action");

[
  "notification-tray-important-section",
  "notification-tray-recent-section",
  "Important / Action Needed",
  "These stay visible after read until handled, dismissed, revoked, or expired.",
  "Open Notification Settings",
].forEach((needle) => assertIncludes(bell, needle, "bell tray retention UI"));

assertNotIncludes(settings, "readNotificationActivityList", "Settings must not duplicate bell Activity records");
assertNotIncludes(settings, "settings-notification-activity-list", "Settings must not render an Activity inbox");
assertIncludes(bell, "No fake counts or records are shown.", "bell tray must not fake records");
assertIncludes(notifications, "export async function readCurrentPushRegistration", "Settings must have backend push status readback helper");
assertIncludes(settings, "readCurrentPushRegistration()", "Settings refresh must read backend push registration");
assertIncludes(settings, "Device push registration controls phone push alerts. In-app Activity lives in the bell tray and still works in the app.", "Settings must separate push registration from in-app Activity");
assertIncludes(settings, "nextRegistration = await readCurrentPushRegistration()", "Register Device must verify persisted backend status");
assertIncludes(settings, "onPressRefreshPushRegistration", "Device push Refresh must have a dedicated backend readback handler");
assertIncludes(settings, "setNotificationSavingKey(\"push-refresh\")", "Device push Refresh must show a busy state");
assertIncludes(settings, "void onPressRefreshPushRegistration();", "Device push Refresh button must call the dedicated readback handler");
assertIncludes(deviceTokens, 'userClient.rpc("wave1_push_ownership_readback"', "device token status must use authoritative current-session readback");
assertIncludes(deviceTokens, "p_install_id: installId", "device token status must bind the exact current install");
assertIncludes(deviceTokens, "p_platform: platform", "device token status must bind the exact platform");
assertIncludes(deviceTokens, "p_provider: provider", "device token status must bind the exact provider");
assertIncludes(deviceTokens, "tokenFingerprint", "device token status must expose fingerprint only");
assertNotIncludes(deviceTokens, "token: token", "device token status must not return raw push token");
assertNotIncludes(chatIndex, "creator_money_sale", "Chat must not become creator-money notification ledger");
assertNotIncludes(chatIndex, "creator_money_purchase", "Chat must not become creator-money notification ledger");

[
  "watch_party_live_ticket",
  "Party Room Pass active",
  "Party Room Pass sold",
  "Live Stage Pass active",
  "Live Stage Pass sold",
  "Live Stage Seat Pass active",
  "Live Stage Seat Pass sold",
  "Event Pass active",
  "Event Pass sold",
].forEach((needle) => assertIncludes(revenuecatWebhook, needle, "Seat Pass visible notification copy"));

const staleSeatPassVisibleCopy = [
  ["Watch-Party", "Ticket"].join(" "),
  ["Watch", "Party", "Ticket"].join(" "),
  ["watch-party", "ticket"].join(" "),
  ["ticket", "sold"].join(" "),
  ["ticket", "ready"].join(" "),
  ["ticket", "manager"].join(" "),
];
[
  ["_lib/notifications.ts", notifications],
  ["app/settings.tsx", settings],
  ["components/notifications/notification-bell-button.tsx", bell],
  ["supabase/functions/revenuecat-webhook/index.ts", revenuecatWebhook],
].forEach(([fileLabel, source]) => {
  staleSeatPassVisibleCopy.forEach((needle) => {
    assertNotIncludes(source, needle, `visible Seat Pass copy in ${fileLabel}`);
  });
});

assertIncludes(moneyFlags, "live_money_enabled: \"off\"", "live money must remain off");
assertIncludes(moneyFlags, "payouts_enabled: \"off\"", "payouts must remain off");

if (failures.length) {
  console.error("Notification action retention policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Notification action retention policy guard passed.");
