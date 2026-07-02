#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const add = (name, passed, detail) => checks.push({ name, passed, detail });
const includes = (source, needle) => source.includes(needle);

const layout = read("app/_layout.tsx");
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const watchPartyLobby = read("app/watch-party/index.tsx");
const watchPartyRoom = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const notifications = read("_lib/notifications.ts");
const chillyChatCalls = read("_lib/chillyChatCalls.ts");
const communicationPanel = read("components/communication/in-room-communication-panel.tsx");
const clearEndedCallMatch = chatLib.match(/export async function clearEndedChatThreadCall[\s\S]*?\n}/);
const clearEndedCallBody = clearEndedCallMatch?.[0] ?? "";

[
  "watch-party-waiting-room",
  "watch-party-room",
  "live-stage",
].forEach((surface) => {
  add(`room/live surface has room-safe bell ${surface}`, includes(watchPartyLobby + watchPartyRoom + liveStage, surface) && includes(watchPartyLobby + watchPartyRoom + liveStage, "roomSafe"), surface);
});

[
  "ROOM_SAFE_CALL_PATH_PREFIXES",
  "\"/watch-party\"",
  "\"/watch-party/live-stage\"",
  "\"/communication\"",
  "room-safe-incoming-call-banner",
  "Incoming Chi'lly Chat call",
  "Answering will leave or pause your current room media session.",
  "room-safe-incoming-call-decline",
  "room-safe-incoming-call-reply-chat",
  "room-safe-incoming-call-leave-answer",
  "Leave room and answer?",
  "You are hosting. Leaving may end or disrupt the room.",
  "Returning will re-check your room access.",
  "updateChillyChatCallInviteStatus",
  "status: \"declined\"",
  "dismissChillyChatCallNotificationRows",
  "cleanupChillyChatCallNotifications",
  "[750, 1800, 5000]",
  "clearEndedChatThreadCall",
].forEach((needle) => add(`incoming call room-safe behavior includes ${needle}`, includes(layout, needle), needle));

add("room-safe call action does not auto-answer", !includes(layout, "autoAnswer") && !includes(layout, "answerAutomatically"), "no auto answer code");
add("room-safe call action does not auto-leave before explicit button", includes(layout, "onPress={roomSafeCall ? leaveRoomAndAnswer : openCall}"), "explicit leave button");
add("Reply in Chat routes to chat without answering", includes(layout, "replyInChat") && includes(layout, "`/chat/${threadId}`"), "replyInChat route");
add(
  "app-wide incoming call banner rings/vibrates outside the same chat thread",
  includes(layout, "playChillyChatCallSound")
    && includes(layout, "Vibration.vibrate")
    && includes(layout, "alreadyOnSameThread")
    && includes(layout, "readNotificationPreferences"),
  "global call bridge must ring/vibrate on non-thread app surfaces without double-ringing the same thread",
);
add(
  "declined/answered call rows are removed from in-app Activity",
  includes(notifications, "dismissChillyChatCallNotificationRows")
    && includes(notifications, ".eq(\"category\", \"chilly_chat_call\")")
    && includes(notifications, ".eq(\"user_id\", viewerUserId)")
    && includes(notifications, "staleData")
    && includes(notifications, "status: \"dismissed\""),
  "active and stale chilly_chat_call rows are dismissed for the current user",
);
add(
  "declined calls also clear presented Android call notifications after delayed delivery",
  includes(layout, "dismissAllPresentedNotificationsFallback: true,\n      dismissIncomingCallFallback: true,")
    && includes(layout, "dismissAllPresentedNotificationsFallback: true,\n          dismissIncomingCallFallback: true,")
    && includes(layout, "await dismissPresentedChillyChatCallNotifications({\n        callInviteId: invite.id,\n        dismissAllPresentedNotificationsFallback: true,\n        dismissIncomingCallFallback: true,\n        path: alert.path,\n        presentedNotificationId: alert.presentedNotificationId ?? null,\n        threadId: invite.threadId,\n      }).catch(() => 0);")
    && includes(notifications, "presentedNotificationId")
    && includes(notifications, "isIncomingChillyChatCallTitle")
    && includes(notifications, "dismissIncomingCallFallback")
    && includes(notifications, "dismissAllPresentedNotificationsFallback")
    && includes(notifications, "Notifications.dismissAllNotificationsAsync"),
  "presented Android incoming-call notifications are retried by exact id, limited incoming-call fallback, and explicit action cleanup after invite decline",
);
add(
  "stale call notification rows reconcile against real invite status",
  includes(notifications, "reconcileChillyChatCallNotificationRows")
    && includes(notifications, "CHAT_CALL_INVITES_TABLE")
    && includes(notifications, "status: \"handled\"")
    && includes(notifications, "Answer or reply\" : \"Open Chat"),
  "stale incoming-call rows must not stay active/actionable after decline or expiry",
);
add(
  "caller sees real ringing/waiting state instead of stale one-person connected success",
  includes(chatThread, "outgoingCallInvite")
    && includes(chatThread, "subscribeToChillyChatCallInvite")
    && includes(chatThread, "Voice call ringing")
    && includes(chatThread, "statusLabelOverride={outgoingCallRinging ? \"Ringing\" : null}")
    && includes(communicationPanel, "statusLabelOverride")
    && includes(chillyChatCalls, "readChillyChatCallInvite"),
  "caller ringback must follow invite lifecycle and label the single-participant call as ringing",
);
add(
  "inbox/thread reads clear stale active call state after terminal invite status",
  includes(chatLib, "reconcileActiveChatThreadCallState")
    && includes(chatLib, "shouldClearStaleActiveThreadCall")
    && includes(chatLib, "hasCurrentChatThreadMembership")
    && includes(chatLib, "CHAT_CALL_INVITES_TABLE")
    && includes(chatLib, "inviteStatus === \"ringing\"")
    && includes(chatLib, "activeCommunicationRoomId: undefined"),
  "inbox live-call badges must not survive declined/missed/expired call invites",
);
add(
  "stale active call clearing does not recurse through full thread readback",
  includes(clearEndedCallBody, "hasCurrentChatThreadMembership")
    && !includes(clearEndedCallBody, "getChatThread("),
  "clearEndedChatThreadCall must not call getChatThread because thread readback also reconciles stale calls",
);
add(
  "room-safe Decline clears active thread call state",
  includes(layout, "await clearEndedChatThreadCall(invite.threadId).catch(() => null);"),
  "Decline must not leave a stale answerable active call room behind",
);
add(
  "room-safe Decline retries notification row cleanup after call invite updates",
  includes(layout, "cleanupChillyChatCallNotifications")
    && includes(layout, "[750, 1800, 5000]")
    && includes(layout, "await dismissChillyChatCallNotificationRows({\n        callInviteId: invite.id,\n        threadId: invite.threadId,\n      }).catch(() => 0);"),
  "Decline must catch delayed notification row creation and make incoming-call rows non-actionable",
);

[
  "RoomSafeActivityNotificationBridge",
  "subscribeToForegroundActivityNotifications",
  "room-safe-notification-toast",
  "New creator activity",
].forEach((needle) => add(`room-safe activity toast includes ${needle}`, includes(layout, needle), needle));

[
  "NOTIFICATION_PRIORITY_ORDER",
  "incoming_chilly_chat_voice_video_call",
  "creator_money_access_ready_or_sale_support",
  "chat_message",
  "general_activity",
  "subscribeToForegroundActivityNotifications",
  "isIncomingChillyChatCall",
  "if (isIncomingChillyChatCall) return;",
].forEach((needle) => add(`notification priority/activity source includes ${needle}`, includes(notifications, needle), needle));

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Room-safe notification and call behavior proof failed:");
  failed.forEach((check) => console.error(`- ${check.name}: ${check.detail}`));
  process.exit(1);
}

console.log("Room-safe notification and call behavior proof passed.");
