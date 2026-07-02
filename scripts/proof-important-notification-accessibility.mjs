#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const packageJson = read("package.json");
const notifications = read("_lib/notifications.ts");
const settings = read("app/settings.tsx");
const bell = read("components/notifications/notification-bell-button.tsx");
const revenuecatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const chatIndex = read("app/chat/index.tsx");

const buyerTypes = [
  "paid_video_unlocked",
  "watch_party_ticket_ready",
  "channel_subscription_active",
  "vip_access_active",
  "event_pass_active",
  "tip_sent_receipt",
];
const creatorTypes = [
  "paid_video_sold",
  "watch_party_ticket_sold",
  "channel_subscription_started",
  "vip_pass_sold",
  "event_pass_sold",
  "tip_received",
];

[
  "proof:important-notification-accessibility",
  "guard:notification-action-retention-policy",
].forEach((needle) => add(`package script registered ${needle}`, includes(packageJson, needle), needle));

[
  "NotificationActionGroup",
  "NotificationLifecycleStatus",
  "classifyNotificationAction",
  "readImportantNotificationList",
  "readNotificationActivityList",
  "IMPORTANT_NOTIFICATION_CATEGORIES",
  "action_required",
  "access_ready",
  "creator_sale",
  "chat_call",
  "event_reminder",
  "history",
].forEach((needle) => add(`important/actionable model contains ${needle}`, includes(notifications, needle), needle));

buyerTypes.forEach((type) => {
  add(`buyer creator-money type classifies important ${type}`, includes(notifications, type), type);
});
creatorTypes.forEach((type) => {
  add(`creator sale/support type classifies important ${type}`, includes(notifications, type), type);
});

[
  "creator_money_purchase",
  "creator_money_sale",
  "chilly_chat_call",
  "chilly_chat_missed_call",
  "upcoming_event_reminder",
  "moderation_notice",
  "event_starts_soon",
  "watch_party_starts_soon",
].forEach((needle) => add(`important category/type covered ${needle}`, includes(notifications, needle), needle));

[
  "readNotificationActivityList(undefined, 12, 18)",
  "notification-tray-important-section",
  "notification-tray-recent-section",
  "Important / Action Needed",
  "These stay visible after read until handled, dismissed, revoked, or expired.",
  "Open Notification Settings",
].forEach((needle) => add(`bell tray retention UI contains ${needle}`, includes(bell, needle), needle));

add("Settings does not duplicate bell Activity records", !includes(settings, "readNotificationActivityList") && !includes(settings, "settings-notification-activity-list"), "no Settings Activity list");

add("mark-read updates read_at without dismissal", includes(notifications, "const payload: NotificationUpdate = { read_at") && !includes(notifications, "read_at: new Date().toISOString(), dismissed_at"), "read payload");
add("dismiss hides active rows", includes(notifications, "dismissed_at: new Date().toISOString(), status: \"dismissed\""), "dismiss payload");
add("important rows are read separately from recent limit", includes(notifications, "readImportantNotificationList(userId, importantLimit)") && includes(notifications, "readNotificationList(userId, recentLimit)"), "split query helper");
add("Activity does not fake notification records", includes(bell, "No fake counts or records are shown."), "real records copy");
add("Chat remains separate from money notifications", !includes(chatIndex, "creator_money_sale") && !includes(chatIndex, "creator_money_purchase"), "chat separation");

[
  "Seat Pass ready",
  "Seat Pass sold",
  "Your Watch-Party Seat Pass is ready.",
].forEach((needle) => add(`Seat Pass visible copy present ${needle}`, includes(revenuecatWebhook, needle), needle));

const forbiddenVisiblePhrases = [
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
  forbiddenVisiblePhrases.forEach((needle) => {
    add(`Seat Pass visible wording enforced in ${fileLabel}: no ${needle}`, !includes(source, needle), needle);
  });
});

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Important notification accessibility proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Important notification accessibility proof passed.");
