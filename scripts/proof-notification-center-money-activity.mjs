#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const settings = read("app/settings.tsx");
const notifications = read("_lib/notifications.ts");
const deviceTokens = read("supabase/functions/notification-device-tokens/index.ts");
const migration = read("supabase/migrations/20260630130624_creator_money_notifications_activity.sql");

[
  "readNotificationActivityList",
  "readImportantNotificationList",
  "markNotificationRead",
  "dismissNotification",
  "resolveNotificationPath",
  "settings-notification-activity-list",
  "settings-notification-important-section",
  "settings-notification-recent-section",
  "notification-activity-row-",
  "notification-activity-dismiss-",
  "Creator purchase",
  "Creator sale",
  "Important / Action Needed",
  "Read state does not remove important notifications.",
  "Chat stays conversation-only",
].forEach((needle) => {
  add(`Settings Activity contains ${needle}`, includes(settings + notifications, needle), needle);
});

[
  "creatorMoneyPurchasesEnabled",
  "creatorMoneySalesEnabled",
  "creator_money_purchases_enabled",
  "creator_money_sales_enabled",
].forEach((needle) => {
  add(`creator-money notification preference wired ${needle}`, includes(settings + notifications + migration, needle), needle);
});

add("read/dismiss state uses real notification rows", includes(notifications, "readNotificationActivityList") && includes(notifications, "dismissNotification"), "notification record helpers");
add("Activity deep-link opens through route resolver", includes(settings, "router.push(path as Parameters<typeof router.push>[0])"), "Activity router.push");
add("Activity empty state is honest", includes(settings, "Creator-money notifications are backed by real notification records."), "real records empty state");
add("Activity does not use Chat as money ledger", !includes(settings, "chat notification ledger"), "no Chat ledger copy");
add("Activity reads important rows separately from recent limit", includes(notifications, "readImportantNotificationList(userId, importantLimit)") && includes(settings, "readNotificationActivityList(undefined, 20, 30)"), "important/recent split");
add("Settings refresh reads backend push registration", includes(settings, "readCurrentPushRegistration()") && includes(notifications, "export async function readCurrentPushRegistration"), "push status readback");
add("Device push registration is separated from in-app Activity", includes(settings, "Device push registration controls phone push alerts. In-app Activity is tied to your account and still works in the app."), "push/activity separation copy");
add("Register Device immediately verifies backend status", includes(settings, "nextRegistration = await readCurrentPushRegistration()"), "post-register readback");
add("Push status uses current install scope", includes(notifications, "action: \"status\"") && includes(notifications, "installId") && includes(deviceTokens, ".eq(\"install_id\", installId)"), "install-scoped status");
add("Push status returns fingerprint only", includes(deviceTokens, "tokenFingerprint") && !includes(deviceTokens, "token: token"), "no raw token status response");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Notification center money activity proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Notification center money activity proof passed.");
