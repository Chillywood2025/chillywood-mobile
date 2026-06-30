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
const bell = read("components/notifications/notification-bell-button.tsx");
const layout = read("app/_layout.tsx");
const settings = read("app/settings.tsx");
const notifications = read("_lib/notifications.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const chatIndex = read("app/chat/index.tsx");

[
  "proof:notification-icon-surface-wiring",
  "proof:room-safe-notification-and-call-behavior",
  "guard:notification-room-call-policy",
].forEach((needle) => assertIncludes(packageJson, needle, "package notification room/call scripts"));

assertIncludes(bell, "readNotificationSummary", "bell must use real unread summary");
assertIncludes(bell, "readNotificationList", "bell tray must use real notification records");
assertIncludes(bell, "No fake counts or records are shown.", "bell empty state must be honest");
assertIncludes(bell, "accessibilityLabel={accessibilityLabel}", "bell accessibility label must be dynamic");
assertIncludes(bell, "roomSafe", "bell must support room-safe mode");

assertIncludes(settings, "readNotificationList", "Settings Activity must read real records");
assertIncludes(settings, "markNotificationRead", "Settings Activity must mark read");
assertIncludes(settings, "dismissNotification", "Settings Activity must dismiss");
assertIncludes(settings, "Chat stays conversation-only", "Settings Activity must preserve Chat separation copy");

[
  "Incoming Chi'lly Chat call",
  "Decline",
  "Reply in Chat",
  "Leave room and answer",
  "Answering will leave or pause your current room media session.",
  "You are hosting. Leaving may end or disrupt the room.",
  "updateChillyChatCallInviteStatus",
  "status: \"declined\"",
  "RoomSafeActivityNotificationBridge",
].forEach((needle) => assertIncludes(layout, needle, "room-safe incoming call policy"));

assertNotIncludes(layout, "autoAnswer", "incoming calls must not auto-answer");
assertNotIncludes(layout, "answerAutomatically", "incoming calls must not auto-answer");
assertNotIncludes(layout, "autoLeave", "incoming calls must not auto-leave rooms");
assertNotIncludes(layout, "setMicrophoneEnabled(true)", "incoming calls must not hijack mic");
assertNotIncludes(layout, "setCameraEnabled(true)", "incoming calls must not hijack camera");

assertIncludes(notifications, "NOTIFICATION_PRIORITY_ORDER", "priority model must exist");
assertIncludes(notifications, "INTERRUPTIVE_NOTIFICATION_PRIORITIES", "interruptive priority model must exist");
assertIncludes(notifications, "resolveNotificationPath", "notification routes must use resolver");
assertIncludes(notifications, "if (isIncomingChillyChatCall) return;", "activity toasts must not duplicate call banners");

assertIncludes(moneyFlags, "live_money_enabled: \"off\"", "live money must remain off");
assertIncludes(moneyFlags, "payouts_enabled: \"off\"", "payouts must remain off");
assertNotIncludes(chatIndex, "creator_money_sale", "Chat inbox must not become creator-money notification ledger");
assertNotIncludes(chatIndex, "creator_money_purchase", "Chat inbox must not become creator-money notification ledger");

if (failures.length) {
  console.error("Notification room/call policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Notification room/call policy guard passed.");
