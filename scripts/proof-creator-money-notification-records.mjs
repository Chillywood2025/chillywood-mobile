#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const notifications = read("_lib/notifications.ts");
const revenuecatWebhook = read("supabase/functions/revenuecat-webhook/index.ts");
const migration = read("supabase/migrations/20260630130624_creator_money_notifications_activity.sql");

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

buyerTypes.forEach((type) => {
  add(`buyer notification type exported ${type}`, includes(notifications, type), type);
  add(`buyer notification type allowed in migration ${type}`, includes(migration, type), type);
  add(`buyer notification type emitted by webhook ${type}`, includes(revenuecatWebhook, type), type);
});

creatorTypes.forEach((type) => {
  add(`creator notification type exported ${type}`, includes(notifications, type), type);
  add(`creator notification type allowed in migration ${type}`, includes(migration, type), type);
  add(`creator notification type emitted by webhook ${type}`, includes(revenuecatWebhook, type), type);
});

[
  "creator_money_purchase",
  "creator_money_sale",
  "notification_event_dedupes",
  "verified_provider_ledger_event",
  "createCreatorMoneyNotifications",
  "createCreatorMoneyNotification",
  "buyerNotificationPlanForProduct",
  "creatorNotificationPlanForProduct",
  "no_access_grant_from_notification",
  "no_payout_from_notification",
  "sandbox_only: true",
  "not_payable: true",
].forEach((needle) => {
  add(`real record/source truth contains ${needle}`, includes(revenuecatWebhook + migration, needle), needle);
});

add("notification records insert into notifications table", includes(revenuecatWebhook, '.from("notifications")') && includes(revenuecatWebhook, ".insert({"), "notifications insert");
add("notification creation requires active provider event", includes(revenuecatWebhook, "ACTIVE_EVENT_TYPES.has(input.eventType)"), "active event check");
add("notification creation requires ledger event", includes(revenuecatWebhook, "if (!input.ledgerEventId || !input.providerEventId) return;"), "ledger/provider check");
add("creator self-sale notification is suppressed", includes(revenuecatWebhook, "input.creatorId === input.buyerUserId"), "self-sale suppression");

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Creator money notification records proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Creator money notification records proof passed.");
