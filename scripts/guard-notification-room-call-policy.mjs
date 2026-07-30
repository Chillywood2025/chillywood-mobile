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
const nativeIntent = read("app/+native-intent.tsx");
const appConfig = read("app.config.ts");
const chatThread = read("app/chat/[threadId].tsx");
const chatLib = read("_lib/chat.ts");
const settings = read("app/settings.tsx");
const notifications = read("_lib/notifications.ts");
const chillyChatCalls = read("_lib/chillyChatCalls.ts");
const chillyChatCallSoundAssets = read("_lib/chillyChatCallSoundAssets.ts");
const chillyChatNativeCallRouteBuffer = read("_lib/chillyChatNativeCallRouteBuffer.ts");
const chillyChatNativeCallRoutes = read("_lib/chillyChatNativeCallRoutes.mjs");
const authoritativeBusyBegin = read("supabase/migrations/20260730032500_chilly_chat_authoritative_busy_begin.sql");
const nativeCallPlugin = read("plugins/withChillyChatNativeCallNotifications.js");
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
assertIncludes(appConfig, "./plugins/withChillyChatNativeCallNotifications", "Expo config must install the native Android CallStyle notification plugin");

assertNotIncludes(settings, "readNotificationActivityList", "Settings must not duplicate bell Activity records");
assertNotIncludes(settings, "settings-notification-activity-list", "Settings must not render an Activity inbox");
assertIncludes(settings, "Bell Activity", "Settings must point users to the bell tray for Activity");
assertIncludes(settings, "Ring on calls", "Settings Chi'lly Chat calls section must expose a ring toggle next to vibration");
assertIncludes(settings, "Full-screen call alerts", "Settings must expose Android full-screen call alert status for native builds");
assertIncludes(settings, "Open Android call alert settings", "Settings must provide a route to Android full-screen call alert settings when available");
assertIncludes(settings, "onToggleChillyChatCallRing", "Settings ring toggle must persist through notification preferences");
assertIncludes(settings, "silent_vibrate", "Settings ring toggle must use the existing silent/vibrate call preference instead of a schema-only toggle");
assertIncludes(settings, "Sound could not play. Check media volume, notification volume, or Android sound settings.", "Settings preview must show a clear sound playback failure instead of fake success");
assertIncludes(settings, "Preview sound started.", "Settings preview must only report a bounded playback start, not fake completion");
assertIncludes(settings, "Quiet Buzz preview started. It is a quieter, vibration-first alert", "Quiet Buzz preview copy must make quiet/vibration-first behavior clear");
assertNotIncludes(settings, "Playing the selected in-app call sound", "Settings preview must not show the old fake-success sound message");
assertIncludes(bell, "markNotificationRead", "Bell Activity must mark read");
assertIncludes(bell, "dismissNotification", "Bell Activity must dismiss");

[
  "Incoming Chi'lly Chat call",
  "app-wide-incoming-call-banner",
  "presentation === \"native_background\"",
  "presentation === \"thread_banner\"",
  "AppState.addEventListener",
  "AppState.currentState === \"active\"",
  "readLatestRingingChillyChatCallInviteForCallee",
  "setInterval",
  "style={styles.incomingCallBannerOverlay}",
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
assertIncludes(notifications, "Notifications.getLastNotificationResponseAsync", "background/cold-start notification taps must restore the pending call route");
assertIncludes(notifications, "Notifications.clearLastNotificationResponseAsync", "handled notification taps must clear the last response to avoid stale re-routing");
assertIncludes(notifications, "Notifications.getPresentedNotificationsAsync", "handled call notifications must inspect presented Android notifications");
assertIncludes(notifications, "Notifications.dismissNotificationAsync", "handled call notifications must dismiss only matching call notifications");
assertIncludes(notifications, "readNativeCallAlertStatus", "Settings must be able to read native Android full-screen call alert status");
assertIncludes(notifications, "openNativeCallAlertSettings", "Settings must be able to open Android full-screen call alert settings");
assertIncludes(notifications, "CHILLY_CHAT_NATIVE_CALL_CHANNEL_ID", "notification runtime must create the native full-screen call channel");
assertIncludes(notifications, "ensureNativeCallNotificationChannel", "notification runtime must ask native Android to create the native call channel");
assertIncludes(notifications, "Notifications.getDevicePushTokenAsync", "notification registration must capture the native Android FCM token for background CallStyle delivery");
assertIncludes(notifications, 'provider: "fcm"', "notification registration must store native FCM tokens separately from Expo tokens");
assertIncludes(notifications, "nativeTokenFingerprint", "notification registration must expose safe native token fingerprint readback only");
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
assertIncludes(layout, "app-wide-incoming-call-banner", "normal foreground app surfaces must show a compact top banner");
assertIncludes(layout, "app-wide-incoming-call-answer", "foreground compact banner must keep an answer action");
assertIncludes(layout, "presentation === \"native_background\"", "background calls must defer to native CallStyle or CallKit presentation");
assertIncludes(layout, "presentation === \"thread_banner\"", "same-thread calls must defer to the thread's compact answer banner");
assertNotIncludes(layout, "app-wide-incoming-call-modal", "foreground calls must not use the large blocking app-wide modal");
assertNotIncludes(layout, "<Modal", "background native call presentation must not be simulated with a React modal");
assertIncludes(layout, "readLatestRingingChillyChatCallInviteForCallee", "normal app surfaces must read back active ringing call invites");
assertIncludes(layout, "AppState.addEventListener", "normal app surfaces must refresh incoming call readback when the app returns active");
assertIncludes(layout, "AppState.currentState === \"active\"", "foreground readback must be limited to active app state");
assertIncludes(layout, "setInterval", "normal app surfaces must not depend on a single missed realtime or foreground notification event");
assertIncludes(layout, "room-safe-incoming-call-banner", "room-safe surfaces must keep the compact incoming call banner");
assertIncludes(chatThread, "chat-thread-incoming-call-banner", "same-thread callees must receive compact Answer/Decline controls");
assertIncludes(chatThread, "shouldShowOutgoingRingingPanel", "only the durable caller may receive the outgoing waiting panel");
assertIncludes(layout, "readNotificationPreferences", "app-wide call ringing must respect notification preferences");
assertIncludes(chillyChatCallSoundAssets, "InterruptionModeAndroid.DoNotMix", "call sound playback must request audible media focus instead of ducking under other audio");
assertIncludes(chillyChatCallSoundAssets, 'CHILLY_CHAT_NATIVE_CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1"', "native Android call channel id must be explicit and versioned");
assertIncludes(chillyChatCallSoundAssets, "playThroughEarpieceAndroid: false", "call sound playback must use the speaker path on Android");
assertIncludes(chillyChatCallSoundAssets, "shouldDuckAndroid: false", "call sound playback must not duck itself into near-silence");
assertIncludes(chillyChatCallSoundAssets, "shouldPlay: false", "call sound playback must start explicitly so failures can be caught");
assertIncludes(chillyChatCallSoundAssets, "sound.playAsync()", "call sound playback must explicitly start preview/ringtone audio");
assertIncludes(chillyChatCallSoundAssets, "waitForChillyChatSoundPlayback", "call sound playback must verify Expo reports the selected ringtone as playing");
assertIncludes(chillyChatCallSoundAssets, "status.isLoaded && status.isPlaying", "call sound playback verification must require a loaded playing sound");
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
assertIncludes(chatThread, "const latestInvite = await readChillyChatCallInvite(outgoingCallInvite.id)", "caller timeout must re-read authoritative invite state before transition");
assertIncludes(chatThread, "if (latestInvite?.status === \"accepted\")", "caller timeout must preserve an invite accepted at the deadline");
assertIncludes(chatThread, "if (!latestInvite || latestInvite.status !== \"ringing\") return;", "caller timeout may only attempt a missed transition from ringing");
assertIncludes(chatThread, "if (!missedInvite || missedInvite.status !== \"missed\") return;", "caller timeout cleanup requires a confirmed missed transition");
assertIncludes(chatThread, "nativeCallAction", "native Android notification actions must route through the chat thread");
assertIncludes(chatThread, "requestedNativeCallOwnsTransition", "native Android actions must own acceptance without racing the openCall compatibility route");
assertIncludes(chatThread, "|| requestedNativeCallOwnsTransition", "openCall compatibility handling must remain inert while a native action settles");
assertIncludes(chatThread, "activeNativeCallActionRequestKeyRef", "native Android actions must survive unrelated rerenders while their exact request remains current");
assertIncludes(chatThread, "readChillyChatCallInvite(requestedCallInviteId)", "native Android notification actions must read the invite by id after cold/background launch");
assertIncludes(chatThread, "invite.threadId !== threadId", "native Android notification actions must reject wrong-thread invite ids");
assertIncludes(chatThread, "invite.calleeUserId !== currentUserId", "native Android notification actions must reject invites for another callee");
assertIncludes(chatThread, "invite.callerUserId === currentUserId", "native Android notification actions must reject self/caller-side stale invite actions");
assertIncludes(chatThread, "readAcceptableIncomingInvite", "native and same-thread Answer must re-read current invite state before accepting");
assertIncludes(chatThread, "latestInvite.status === \"ringing\"", "native and same-thread Answer must require a currently ringing invite");
assertIncludes(chatThread, "getCommunicationRoomSnapshot", "native and same-thread Answer must verify the room is active before joining");
assertIncludes(chatThread, "dismissPresentedChillyChatCallNotifications", "native Answer/Decline must clear presented Android call notifications after safe invite handling");
assertIncludes(chatThread, 'result.invite?.status === "busy"', "an authoritative busy result must not open a second media panel");
assertIncludes(chatThread, "No media was started", "the caller must receive an honest no-media busy result");
assertIncludes(authoritativeBusyBegin, 'invite."status" = \'accepted\'', "busy authority must require an accepted established invite");
assertIncludes(authoritativeBusyBegin, 'established_thread."active_communication_room_id"', "busy authority must reject historical rooms that are no longer authoritative on their thread");
assertIncludes(authoritativeBusyBegin, 'active_room."status" = \'active\'', "busy authority must require the established room to remain active");
assertIncludes(authoritativeBusyBegin, "'busy'", "busy authority must terminate the overlap before delivery");
assertIncludes(authoritativeBusyBegin, '"delivery_status" = \'skipped\'', "busy authority must explicitly skip the terminal delivery");
assertIncludes(layout, "resolveChillyChatNativeCallRoute", "terminated Android native actions must replay their exact initial URL after authenticated boot");
assertIncludes(layout, "setPendingNativeCallRoute((current)", "cold-start native actions must remain pending until session hydration finishes");
assertIncludes(layout, "Linking.getInitialURL()", "terminated Android native actions must read the Activity initial URL");
assertIncludes(layout, "function AndroidNativeCallRouteBridge()", "terminated Android native actions must use a dedicated always-mounted capture bridge");
assertIncludes(layout, "<AndroidNativeCallRouteBridge />", "the Android native action capture bridge must mount at the session shell");
assert(
  layout.indexOf("<AndroidNativeCallRouteBridge />") >= 0
  && layout.indexOf("<AuthRouteGate />") >= 0
  && layout.indexOf("<AndroidNativeCallRouteBridge />") < layout.indexOf("<AuthRouteGate />"),
  "the Android native action capture bridge must mount before the auth-gated navigator",
);
assertIncludes(chillyChatNativeCallRoutes, '["answer", "decline"].includes(nativeCallAction)', "cold-start replay must be limited to explicit Answer and Decline actions");
assertIncludes(chillyChatNativeCallRoutes, "UUID_PATTERN", "cold-start replay must reject malformed thread and invite identities");
assertNotIncludes(chillyChatNativeCallRoutes, "access_token", "cold-start call routes must not carry authentication credentials");
assertIncludes(nativeIntent, "redirectSystemPath", "Expo Router must normalize Android native call actions before initial route caching");
assertIncludes(nativeIntent, 'Platform.OS !== "android"', "native-intent call normalization must not change iOS system-path handling");
assertIncludes(nativeIntent, "redirectEarlyAndroidNativeCallSystemPath", "Expo Router native-intent handling must install the early Android action buffer");
assertNotIncludes(nativeIntent, "console.", "native call system-path normalization must not log private action URLs");
assertIncludes(chillyChatNativeCallRouteBuffer, 'Platform.OS === "android"', "the early native call action buffer must remain Android-only");
assertIncludes(chillyChatNativeCallRouteBuffer, 'Linking.addEventListener("url"', "the early native call action buffer must subscribe during native-intent module loading");
assertIncludes(chillyChatNativeCallRouteBuffer, "createChillyChatNativeCallRouteBuffer", "the early action buffer must reject unvalidated system URLs and retain pre-mount actions");
assertIncludes(chillyChatNativeCallRouteBuffer, "subscribeToEarlyAndroidNativeCallRoutes", "the authenticated root bridge must drain the early action buffer");
assertIncludes(layout, "subscribeToEarlyAndroidNativeCallRoutes", "the root bridge must consume live native actions retained during JS startup");
assertNotIncludes(chillyChatNativeCallRouteBuffer, "console.", "the early native call action buffer must not log private URLs");
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

assertIncludes(nativeCallPlugin, "android.permission.USE_FULL_SCREEN_INTENT", "native CallStyle plugin must request full-screen intent permission for native call alerts");
assertIncludes(nativeCallPlugin, "ChillyChatFirebaseMessagingService", "native CallStyle plugin must register the custom Chi'lly Chat FCM service");
assertIncludes(nativeCallPlugin, "ExpoFirebaseMessagingService", "native CallStyle plugin must replace the Expo FCM service without double-handling incoming call pushes");
assertIncludes(nativeCallPlugin, "tools:node", "native CallStyle plugin must remove Expo's default FCM service before registering the custom service");
assertIncludes(nativeCallPlugin, "ChillyChatCallNotificationActionReceiver", "native CallStyle plugin must register Answer/Decline action receiver");
assertIncludes(nativeCallPlugin, "NotificationCompat.CallStyle.forIncomingCall", "native Android incoming calls must use CallStyle");
assertIncludes(nativeCallPlugin, "ACTION_ANSWER", "native CallStyle must expose Answer action");
assertIncludes(nativeCallPlugin, "ACTION_DECLINE", "native CallStyle must expose Decline action");
assertIncludes(nativeCallPlugin, 'val answerIntent = buildActivityPendingIntent(context, data, "answer", 1)', "native Answer action must start the app Activity directly");
assertNotIncludes(nativeCallPlugin, "val answerIntent = buildActionPendingIntent", "native Answer action must not rely on a broadcast receiver to launch from background");
assertIncludes(nativeCallPlugin, "setFullScreenIntent", "native CallStyle must use full-screen intent when Android allows it");
assertIncludes(nativeCallPlugin, "canUseFullScreenIntent", "native full-screen behavior must check Android permission");
assertIncludes(nativeCallPlugin, "ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT", "native module must provide the Android full-screen intent settings route");
assertIncludes(nativeCallPlugin, "FLAG_INSISTENT", "native incoming call notification must ring like an incoming call until handled or timed out");
assertIncludes(nativeCallPlugin, "super.onMessageReceived(remoteMessage)", "custom FCM service must forward non-call pushes to Expo");
assertIncludes(nativeCallPlugin, "showIncomingCallNotification", "custom FCM service must render native incoming call notifications outside the app");
assertIncludes(nativeCallPlugin, "openDeepLinkForAction", "native Answer/Decline must deep-link into authenticated app call handling");
assertIncludes(nativeCallPlugin, "Intent(Intent.ACTION_VIEW, deepLink)", "native Answer must launch with an explicit VIEW deep link");
assertIncludes(nativeCallPlugin, "Intent.CATEGORY_BROWSABLE", "native Answer deep link must use a browser/deep-link category Expo can receive");
assertIncludes(nativeCallPlugin, "putExtra(\"openCall\", if (nativeAction == \"answer\") \"1\" else \"0\")", "native Answer intent must preserve openCall=1 for the JS join trigger");
assertIncludes(nativeCallPlugin, "readFullScreenCallAlertStatus", "native module must expose full-screen permission readback");
assertIncludes(nativeCallPlugin, "openFullScreenCallAlertSettings", "native module must expose full-screen permission settings route");

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
