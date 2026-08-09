import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const fail = (message) => {
  console.error(`Chi'lly Chat call push policy guard failed: ${message}`);
  process.exit(1);
};

const dispatchPath = "supabase/functions/chilly-chat-call-dispatch/index.ts";
const dispatchPolicyPath = "supabase/functions/_shared/chilly-chat-call-dispatch-policy.mjs";
const fcmErrorPolicyPath = "supabase/functions/_shared/fcm-error-policy.mjs";
const expoReceiptsPath = "supabase/functions/_shared/expo-push-receipts.ts";
const transitionPath = "supabase/functions/chilly-chat-call-transition/index.ts";
const transitionMigrationPath = "supabase/migrations/20260718103000_durable_chat_call_status_transition.sql";
const callsLibPath = "_lib/chillyChatCalls.ts";
const soundAssetsPath = "_lib/chillyChatCallSoundAssets.ts";
const chatThreadPath = "app/chat/[threadId].tsx";
const notificationsPath = "_lib/notifications.ts";
const nativeCallPluginPath = "plugins/withChillyChatNativeCallNotifications.js";
const configPath = "supabase/config.toml";
const packagePath = "package.json";

for (const filePath of [dispatchPath, dispatchPolicyPath, fcmErrorPolicyPath, expoReceiptsPath, transitionPath, transitionMigrationPath, callsLibPath, soundAssetsPath, chatThreadPath, notificationsPath, nativeCallPluginPath, configPath, packagePath]) {
  if (!fs.existsSync(path.join(ROOT, filePath))) fail(`missing required file ${filePath}`);
}

const dispatch = read(dispatchPath);
const dispatchPolicy = read(dispatchPolicyPath);
const fcmErrorPolicy = read(fcmErrorPolicyPath);
const expoReceipts = read(expoReceiptsPath);
const transition = read(transitionPath);
const transitionMigration = read(transitionMigrationPath);
const callsLib = read(callsLibPath);
const soundAssets = read(soundAssetsPath);
const chatThread = read(chatThreadPath);
const notifications = read(notificationsPath);
const nativeCallPlugin = read(nativeCallPluginPath);
const config = read(configPath);
const packageJson = JSON.parse(read(packagePath));

if (!dispatch.includes('const CHAT_CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1"')) {
  fail("incoming call pushes must use the native CallStyle channel chilly_chat_calls_fullscreen_v1");
}

if (!soundAssets.includes('CHILLY_CHAT_NATIVE_CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1"')) {
  fail("native call channel constant must be shared by JS and guards");
}

if (!nativeCallPlugin.includes('CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1"')) {
  fail("native Android CallStyle plugin must create the same full-screen call channel as JS/server");
}

if (!nativeCallPlugin.includes("NotificationCompat.CallStyle.forIncomingCall")) {
  fail("native Android incoming call plugin must render CallStyle notifications");
}

if (!nativeCallPlugin.includes("val answerIntent = buildActionPendingIntent(context, data, ACTION_ANSWER, 1)")) {
  fail("native Android Answer must use the immutable explicit notification-action receiver path");
}

if (!nativeCallPlugin.includes("val declineIntent = buildActionPendingIntent(context, data, ACTION_DECLINE, 2)")) {
  fail("native Android Decline must use the immutable explicit notification-action receiver path");
}

if (
  !nativeCallPlugin.includes("PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE")
  || nativeCallPlugin.includes("PendingIntent.FLAG_MUTABLE")
) {
  fail("native Android Answer and Decline PendingIntents must remain immutable");
}

if (
  !nativeCallPlugin.includes('"android:name": ".ChillyChatCallNotificationActionReceiver"')
  || !nativeCallPlugin.includes('"android:exported": "false"')
) {
  fail("native Android action receiver must remain explicit and non-exported");
}

if (
  !nativeCallPlugin.includes("captureTrustedNotificationAction(")
  || !nativeCallPlugin.includes("Intent(Intent.ACTION_MAIN)")
  || nativeCallPlugin.includes("captureForActivity")
) {
  fail("native Android actions must persist trusted receiver state before a neutral Activity launch");
}

if (!dispatch.includes('const MISSED_CALL_CHANNEL_ID = "chilly_chat_missed_calls"')) {
  fail("missed call pushes must use chilly_chat_missed_calls");
}

if (/\bchilly_chat_calls\b/.test(dispatch.replace(/chilly_chat_calls_fullscreen_v1/g, ""))) {
  fail("new call push dispatcher must not use stale chilly_chat_calls channels");
}

if (!dispatch.includes('target_route: "/chat/[threadId]"') || !dispatch.includes("function buildRoute")) {
  fail("call push payload must target the canonical /chat/[threadId] route");
}

for (const requiredData of ["nativeCallStyle", "android_callstyle", "threadId", "callInviteId", "callerName"]) {
  if (!`${dispatch}\n${dispatchPolicy}`.includes(requiredData)) {
    fail(`incoming call push payload must include native CallStyle data: ${requiredData}`);
  }
}

if (!dispatch.includes('if (input.action === "missed" && copy)') || !dispatchPolicy.includes('if (action !== "incoming") return null')) {
  fail("incoming and missed presentation copy must remain action-specific");
}

for (const requiredFcmDispatch of [
  "sendFcmDataMessage",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "provider: \"fcm\"",
  "androidSent",
  "no_enabled_fcm_token",
  "no_enabled_expo_token",
]) {
  if (!dispatch.includes(requiredFcmDispatch)) {
    fail(`active incoming CallStyle dispatch must prefer direct native FCM delivery: ${requiredFcmDispatch}`);
  }
}

if (!dispatch.includes('&& (input.action === "missed" || androidSent === 0)')) {
  fail("Expo fallback must not be used for active incoming calls after direct FCM succeeds");
}

if (!dispatch.includes('sound: "default"') || dispatch.includes('sound: input.action === "incoming"')) {
  fail("incoming call pushes must stay data-only while missed calls use standard Expo sound");
}

if (!notifications.includes("Notifications.getDevicePushTokenAsync") || !notifications.includes('provider: "fcm"')) {
  fail("Android push registration must store the native FCM token for CallStyle background delivery");
}

for (const forbidden of [
  "LiveKit",
  "livekit",
  "roomToken",
  "room_token",
  "communicationRoomToken",
  "communication_room_token",
]) {
  if (dispatch.includes(forbidden)) {
    fail(`dispatcher payload/source includes forbidden token or authority marker: ${forbidden}`);
  }
}

const returnedPayloadSection = dispatch.match(/return jsonResponse\(200, \{[\s\S]*?\n\s+\}\);/u)?.[0] ?? "";
if (/token|secret|credential|serviceRole/i.test(returnedPayloadSection)) {
  fail("dispatcher response must not include tokens, secrets, credentials, or service-role material");
}

if (!dispatch.includes("readRequiredEnv(\"SUPABASE_SERVICE_ROLE_KEY\")")) {
  fail("dispatcher must keep service-role access server-side");
}

if (!dispatch.includes("sanitizeErrorMessage")) {
  fail("dispatcher must sanitize errors");
}

if (!dispatch.includes("DeviceNotRegistered") || !dispatch.includes("revoked_at")) {
  fail("dispatcher must revoke expired provider tokens");
}
if (!dispatch.includes("readFcmProviderErrorCode")) {
  fail("dispatcher must parse provider-specific FCM error details");
}
if (!dispatch.includes("isPermanentFcmTokenError")) {
  fail("dispatcher must revoke only provider-confirmed permanent FCM token failures");
}
if (!fcmErrorPolicy.includes("google.firebase.fcm.v1.FcmError")) {
  fail("FCM error policy must require the provider-specific REST detail type");
}
if (!fcmErrorPolicy.includes("UNREGISTERED") || !fcmErrorPolicy.includes("SENDER_ID_MISMATCH")) {
  fail("FCM error policy must retain both permanent token failure reasons");
}

if (!dispatch.includes("reconcileRecentExpoPushReceipts") || !expoReceipts.includes("getReceipts")) {
  fail("dispatcher must reconcile Expo receipts instead of relying only on accepted send tickets");
}

if (!callsLib.includes('supabase.functions.invoke("chilly-chat-call-dispatch"')) {
  fail("call invite client path must invoke server-side call dispatch");
}

if (!callsLib.includes('action: "incoming"') || !callsLib.includes('supabase.functions.invoke("chilly-chat-call-transition"')) {
  fail("call client path must dispatch incoming calls and await server-owned status transitions");
}

if (callsLib.includes("void dispatchChillyChatCallPush")) {
  fail("terminal call delivery must not use a fire-and-forget mobile dispatch");
}

for (const durableMarker of [
  'transition_chilly_chat_call_invite',
  'claim_chilly_chat_call_transition_delivery',
  'for update',
  'chat_call_transition_deliveries',
]) {
  if (!transitionMigration.toLowerCase().includes(durableMarker)) {
    fail(`durable transition migration is missing ${durableMarker}`);
  }
}

if (!transition.includes('await fetch(`${supabaseUrl}/functions/v1/chilly-chat-call-dispatch`')
  || !transition.includes('.eq("delivery_status", "dispatching")')) {
  fail("server-owned transition operation must await dispatch and durably record the result");
}

if (!chatThread.includes("incomingCallInvite") || !chatThread.includes("handleAcceptIncomingCall") || !chatThread.includes("handleDeclineIncomingCall")) {
  fail("in-app incoming call sheet behavior appears to be removed");
}

for (const requiredNativeActionGuard of [
  "nativeCallAction",
  "requestedCallInviteId",
  "readChillyChatCallInvite(requestedCallInviteId)",
  "invite.threadId !== threadId",
  "invite.calleeUserId !== currentUserId",
  "invite.callerUserId === currentUserId",
]) {
  if (!chatThread.includes(requiredNativeActionGuard)) {
    fail(`native Answer/Decline route must verify the active invite before mutating call state: ${requiredNativeActionGuard}`);
  }
}

if (!chatThread.includes("readAcceptableIncomingInvite") || !chatThread.includes("getCommunicationRoomSnapshot") || !chatThread.includes("latestInvite.status === \"ringing\"")) {
  fail("same-thread/native Answer must re-read the ringing invite and active communication room before accepting");
}

if (!chatThread.includes("dismissPresentedChillyChatCallNotifications") || !chatThread.includes("dismissAllPresentedNotificationsFallback: true")) {
  fail("native Answer/Decline handling must dismiss presented Android call notifications after safe invite handling");
}

if (!config.includes("[functions.chilly-chat-call-dispatch]")) {
  fail("Supabase config must declare chilly-chat-call-dispatch");
}

if (!config.includes("[functions.chilly-chat-call-transition]")) {
  fail("Supabase config must declare chilly-chat-call-transition");
}

if (!packageJson.scripts?.["guard:chilly-chat-call-push-policy"]?.includes("test-chilly-chat-call-semantics.mjs")) {
  fail("package.json must expose guard:chilly-chat-call-push-policy");
}

console.log("Chi'lly Chat call push policy guard passed.");
