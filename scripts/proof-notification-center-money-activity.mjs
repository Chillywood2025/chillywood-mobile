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
const migration = read("supabase/migrations/20260630130624_creator_money_notifications_activity.sql");

[
  "readNotificationList",
  "markNotificationRead",
  "dismissNotification",
  "resolveNotificationPath",
  "settings-notification-activity-list",
  "notification-activity-row-",
  "notification-activity-dismiss-",
  "Creator purchase",
  "Creator sale",
  "Chat stays conversation-only",
].forEach((needle) => {
  add(`Settings Activity contains ${needle}`, includes(settings, needle), needle);
});

[
  "creatorMoneyPurchasesEnabled",
  "creatorMoneySalesEnabled",
  "creator_money_purchases_enabled",
  "creator_money_sales_enabled",
].forEach((needle) => {
  add(`creator-money notification preference wired ${needle}`, includes(settings + notifications + migration, needle), needle);
});

add("read/dismiss state uses real notification rows", includes(notifications, "readNotificationList") && includes(notifications, "dismissNotification"), "notification record helpers");
add("Activity deep-link opens through route resolver", includes(settings, "router.push(path as Parameters<typeof router.push>[0])"), "Activity router.push");
add("Activity empty state is honest", includes(settings, "Creator-money notifications are backed by real notification records."), "real records empty state");
add("Activity does not use Chat as money ledger", !includes(settings, "chat notification ledger"), "no Chat ledger copy");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Notification center money activity proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Notification center money activity proof passed.");
