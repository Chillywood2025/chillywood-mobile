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
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const settings = read("app/settings.tsx");
const notifications = read("_lib/notifications.ts");
const chillyChatCalls = read("_lib/chillyChatCalls.ts");
const communicationPanel = read("components/communication/in-room-communication-panel.tsx");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const chatIndex = read("app/chat/index.tsx");
const profile = read("app/profile/[userId].tsx");
const clearEndedCallMatch = chatLib.match(/export async function clearEndedChatThreadCall[\s\S]*?\n}/);
const clearEndedCallBody = clearEndedCallMatch?.[0] ?? "";

[
  "proof:notification-icon-surface-wiring",
  "proof:room-safe-notification-and-call-behavior",
  "guard:notification-room-call-policy",
].forEach((needle) => assertIncludes(packageJson, needle, "package notification room/call scripts"));

assertIncludes(bell, "readNotificationSummary", "bell must use real unread summary");
assertIncludes(bell, "readNotificationActivityList", "bell tray must use real notification records");
assertIncludes(bell, "No fake counts or records are shown.", "bell empty state must be honest");
assertIncludes(bell, "accessibilityLabel={accessibilityLabel}", "bell accessibility label must be dynamic");
assertIncludes(bell, "roomSafe", "bell must support room-safe mode");
assertIncludes(profile, 'NotificationBellButton surface="profile"', "Profile header must use the shared top-right notification bell");
assertIncludes(profile, "headerBackButton", "Profile header must keep the back and bell controls balanced");

assertNotIncludes(settings, "readNotificationActivityList", "Settings must not duplicate bell Activity records");
assertNotIncludes(settings, "settings-notification-activity-list", "Settings must not render an Activity inbox");
assertIncludes(settings, "Bell Activity", "Settings must point users to the bell tray for Activity");
assertIncludes(bell, "markNotificationRead", "Bell Activity must mark read");
assertIncludes(bell, "dismissNotification", "Bell Activity must dismiss");

[
  "Incoming Chi'lly Chat call",
  "app-wide-incoming-call-modal",
  "alreadyOnSameThread) return null;",
  "roomSafeCall ? styles.incomingCallBannerOverlay : styles.incomingCallModalOverlay",
  "Decline",
  "Reply in Chat",
  "Leave room and answer",
  "Answering will leave or pause your current room media session.",
  "You are hosting. Leaving may end or disrupt the room.",
  "updateChillyChatCallInviteStatus",
  "status: \"declined\"",
  "dismissPresentedChillyChatCallNotifications",
  "dismissChillyChatCallNotificationRows",
  "cleanupChillyChatCallNotifications",
  "[750, 1800, 5000]",
  "clearEndedChatThreadCall",
  "RoomSafeActivityNotificationBridge",
].forEach((needle) => assertIncludes(layout, needle, "room-safe incoming call policy"));

assertIncludes(notifications, "dismissPresentedChillyChatCallNotifications", "handled call notifications must be dismissible by invite/path");
assertIncludes(notifications, "Notifications.getPresentedNotificationsAsync", "handled call notifications must inspect presented Android notifications");
assertIncludes(notifications, "Notifications.dismissNotificationAsync", "handled call notifications must dismiss only matching call notifications");
assertIncludes(notifications, "presentedNotificationId", "handled call notifications must carry the exact presented Android notification identifier");
assertIncludes(notifications, "isIncomingChillyChatCallTitle", "handled call notifications must fallback only to incoming Chi'lly Chat call titles");
assertIncludes(notifications, "dismissIncomingCallFallback", "handled call notification title fallback must require an explicit call action");
assertIncludes(notifications, "dismissAllPresentedNotificationsFallback", "presented notification sweep must require an explicit incoming-call action");
assertIncludes(notifications, "Notifications.dismissAllNotificationsAsync", "Android remote call pushes must have a final presented-notification cleanup fallback");
assertIncludes(notifications, "canUsePresentedNotificationSweep", "presented notification sweep must be guarded by call-specific matching state");
assertIncludes(notifications, "dismissChillyChatCallNotificationRows", "handled call notification rows must be dismissible by invite/thread and stale current-user fallback");
assertIncludes(notifications, ".eq(\"category\", \"chilly_chat_call\")", "call notification row cleanup must only target Chi'lly Chat calls");
assertIncludes(notifications, ".eq(\"user_id\", viewerUserId)", "call notification row cleanup must be scoped to current user");
assertIncludes(notifications, "staleData", "call notification row cleanup must remove older active incoming rows for the current user");
assertIncludes(notifications, "status: \"dismissed\"", "call notification row cleanup must make rows non-actionable");
assertIncludes(layout, "await clearEndedChatThreadCall(invite.threadId).catch(() => null);", "room-safe decline must clear active thread call state");
assertIncludes(layout, "await dismissPresentedChillyChatCallNotifications({\n        callInviteId: invite.id,\n        dismissAllPresentedNotificationsFallback: true,\n        dismissIncomingCallFallback: true,\n        path: alert.path,\n        presentedNotificationId: alert.presentedNotificationId ?? null,\n        threadId: invite.threadId,\n      }).catch(() => 0);", "room-safe decline must retry presented Android call notification cleanup after invite status update");
assertIncludes(layout, "await dismissChillyChatCallNotificationRows({\n        callInviteId: invite.id,\n        threadId: invite.threadId,\n      }).catch(() => 0);", "room-safe decline must retry persisted call row cleanup after invite status update");
assertIncludes(layout, "presentedNotificationId: alert.presentedNotificationId ?? null", "room-safe actions must pass the exact presented Android notification id");
assertIncludes(layout, "dismissIncomingCallFallback: true", "room-safe actions must enable the limited incoming-call title fallback only after an explicit user action");
assertIncludes(layout, "dismissAllPresentedNotificationsFallback: true", "room-safe actions must enable the final Android presented-notification cleanup only after an explicit user action");
assertIncludes(layout, "dismissAllPresentedNotificationsFallback: true,\n          dismissIncomingCallFallback: true,", "delayed call cleanup must retry both presented Android notifications and persisted rows");
assertIncludes(layout, "playChillyChatCallSound", "app-wide incoming call bridge must ring outside the same chat thread");
assertIncludes(layout, "Vibration.vibrate", "app-wide incoming call bridge must vibrate outside the same chat thread");
assertIncludes(layout, "alreadyOnSameThread", "app-wide ringing must avoid double-ringing when receiver is already inside that chat thread");
assertIncludes(layout, "app-wide-incoming-call-modal", "normal app surfaces must show a full incoming-call modal instead of only a top banner");
assertIncludes(layout, "app-wide-incoming-call-answer", "normal app surface modal must keep an answer action");
assertIncludes(layout, "room-safe-incoming-call-banner", "room-safe surfaces must keep the compact incoming call banner");
assertIncludes(layout, "roomSafeCall ? styles.incomingCallBannerOverlay : styles.incomingCallModalOverlay", "room-safe and normal incoming-call surfaces must use different presentations");
assertIncludes(layout, "readNotificationPreferences", "app-wide call ringing must respect notification preferences");
assertIncludes(notifications, "reconcileChillyChatCallNotificationRows", "notification reads must reconcile stale incoming-call rows against invite state");
assertIncludes(notifications, "CHAT_CALL_INVITES_TABLE", "notification stale-call reconciliation must read real call invites");
assertIncludes(notifications, "status: \"handled\"", "stale incoming-call rows must become non-actionable history");
assertIncludes(notifications, "Answer or reply\" : \"Open Chat", "handled call rows must not keep active answer copy");
assertIncludes(chillyChatCalls, "readChillyChatCallInvite", "caller must be able to read current invite status");
assertIncludes(chillyChatCalls, "subscribeToChillyChatCallInvite", "caller must subscribe to invite lifecycle changes");
assertIncludes(chatThread, "outgoingCallInvite", "caller screen must track outgoing invite state");
assertIncludes(chatThread, "Voice call ringing", "caller screen must show ringing instead of stale one-person connected success");
assertIncludes(chatThread, "statusLabelOverride={outgoingCallRinging ? \"Ringing\" : null}", "call panel must label one-person outgoing calls as ringing");
assertIncludes(chatThread, "No answer. The call expired and active call state was cleared.", "caller timeout must clear stale active call state");
assertIncludes(communicationPanel, "statusLabelOverride", "communication panel must allow honest call status labels");
assertIncludes(chatLib, "reconcileActiveChatThreadCallState", "inbox/thread reads must reconcile stale active call state");
assertIncludes(chatLib, "shouldClearStaleActiveThreadCall", "stale active call cleanup must be backed by invite/room readback");
assertIncludes(chatLib, "hasCurrentChatThreadMembership", "stale active call cleanup must verify membership without re-entering full thread readback");
assertIncludes(chatLib, "CHAT_CALL_INVITES_TABLE", "stale active call cleanup must read real call invites");
assertIncludes(chatLib, "activeCommunicationRoomId: undefined", "stale active call cleanup must remove live-call badges from returned thread summaries");
assertNotIncludes(clearEndedCallBody, "getChatThread(", "clearEndedChatThreadCall must not recurse through getChatThread during stale-call reconciliation");

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
