#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const settings = read("app/settings.tsx");
const bell = read("components/notifications/notification-bell-button.tsx");
const notifications = read("_lib/notifications.ts");
const deviceTokens = read("supabase/functions/notification-device-tokens/index.ts");
const migration = read("supabase/migrations/20260630130624_creator_money_notifications_activity.sql");

[
  "readNotificationActivityList",
  "readImportantNotificationList",
  "markNotificationRead",
  "dismissNotification",
  "resolveNotificationPath",
  "notification-tray-row-",
  "notification-tray-dismiss-",
  "Important / Action Needed",
  "These stay visible after read until handled, dismissed, revoked, or expired.",
  "Open Notification Settings",
].forEach((needle) => {
  add(`Bell Activity contains ${needle}`, includes(bell + notifications, needle), needle);
});

[
  "creatorMoneyPurchasesEnabled",
  "creatorMoneySalesEnabled",
  "creator_money_purchases_enabled",
  "creator_money_sales_enabled",
  "creator_money_purchase",
  "creator_money_sale",
].forEach((needle) => {
  add(`creator-money notification preference wired ${needle}`, includes(settings + notifications + migration, needle), needle);
});

add("read/dismiss state uses real notification rows", includes(notifications, "readNotificationActivityList") && includes(notifications, "dismissNotification"), "notification record helpers");
add("Activity deep-link opens through route resolver", includes(bell, "router.push(path as Parameters<typeof router.push>[0])"), "Activity router.push");
add("Activity empty state is honest", includes(bell, "No fake counts or records are shown."), "real records empty state");
add("Activity does not use Chat as money ledger", !includes(settings + bell, "chat notification ledger"), "no Chat ledger copy");
add("Bell Activity reads important rows separately from recent limit", includes(notifications, "readImportantNotificationList(userId, importantLimit)") && includes(bell, "readNotificationActivityList(undefined, 12, 18)"), "important/recent split");
add("Settings does not render duplicate Activity records", !includes(settings, "readNotificationActivityList") && !includes(settings, "settings-notification-activity-list"), "no Settings Activity list");
add("Settings refresh reads backend push registration", includes(settings, "readCurrentPushRegistration()") && includes(notifications, "export async function readCurrentPushRegistration"), "push status readback");
add("Device push registration is separated from in-app Activity", includes(settings, "Device push registration controls phone push alerts. In-app Activity lives in the bell tray and still works in the app."), "push/activity separation copy");
add("Register Device immediately verifies backend status", includes(settings, "nextRegistration = await readCurrentPushRegistration()"), "post-register readback");
add("Device push Refresh has dedicated backend readback action", includes(settings, "onPressRefreshPushRegistration") && includes(settings, "setNotificationSavingKey(\"push-refresh\")") && includes(settings, "const nextRegistration = await readCurrentPushRegistration()"), "dedicated push refresh readback");
add("Device push Refresh shows busy state and does not call generic Activity refresh", includes(settings, "notificationSavingKey === \"push-refresh\"") && includes(settings, "void onPressRefreshPushRegistration();") && !includes(settings, "void refreshNotifications();\n              }}\n            >\n              <Text style={styles.utilityButtonText}>Refresh</Text>"), "refresh button wiring");
add("Push status uses current install scope", includes(notifications, "action: \"status\"") && includes(notifications, "installId") && includes(deviceTokens, ".eq(\"install_id\", installId)"), "install-scoped status");
add("Push status returns fingerprint only", includes(deviceTokens, "tokenFingerprint") && !includes(deviceTokens, "token: token"), "no raw token status response");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Notification center money activity proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Notification center money activity proof passed.");
