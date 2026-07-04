import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const fail = (message) => {
  console.error(`Chi'lly Chat call push policy guard failed: ${message}`);
  process.exit(1);
};

const dispatchPath = "supabase/functions/chilly-chat-call-dispatch/index.ts";
const callsLibPath = "_lib/chillyChatCalls.ts";
const soundAssetsPath = "_lib/chillyChatCallSoundAssets.ts";
const chatThreadPath = "app/chat/[threadId].tsx";
const notificationsPath = "_lib/notifications.ts";
const nativeCallPluginPath = "plugins/withChillyChatNativeCallNotifications.js";
const configPath = "supabase/config.toml";
const packagePath = "package.json";

for (const filePath of [dispatchPath, callsLibPath, soundAssetsPath, chatThreadPath, notificationsPath, nativeCallPluginPath, configPath, packagePath]) {
  if (!fs.existsSync(path.join(ROOT, filePath))) fail(`missing required file ${filePath}`);
}

const dispatch = read(dispatchPath);
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

if (!nativeCallPlugin.includes('val answerIntent = buildActivityPendingIntent(context, data, "answer", 1)')) {
  fail("native Android Answer action must start the app Activity with nativeCallAction=answer");
}

if (nativeCallPlugin.includes("val answerIntent = buildActionPendingIntent")) {
  fail("native Android Answer action must not rely on a broadcast receiver to launch the app from background");
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
  if (!dispatch.includes(requiredData)) {
    fail(`incoming call push payload must include native CallStyle data: ${requiredData}`);
  }
}

if (!dispatch.includes("pushMessage.body = copy.body") || !dispatch.includes('if (input.action === "missed")')) {
  fail("incoming call pushes must be data-only so native Android can render CallStyle while missed calls stay standard");
}

for (const requiredFcmDispatch of [
  "sendFcmDataMessage",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "provider: \"fcm\"",
  "nativeSentCount",
  "no_enabled_native_fcm_token",
  "native_fcm_unavailable_expo_fallback",
]) {
  if (!dispatch.includes(requiredFcmDispatch)) {
    fail(`active incoming CallStyle dispatch must prefer direct native FCM delivery: ${requiredFcmDispatch}`);
  }
}

if (!dispatch.includes('const shouldAttemptExpo = input.action === "missed" || nativeSentCount === 0')) {
  fail("Expo fallback must not be used for active incoming calls after direct FCM succeeds");
}

if (!dispatch.includes('pushMessage.sound = "default"') || dispatch.includes('sound: input.action === "incoming"')) {
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

if (!dispatch.includes("getReceipts") || !dispatch.includes("reconcileRecentExpoReceipts")) {
  fail("dispatcher must reconcile Expo receipts instead of relying only on accepted send tickets");
}

if (!callsLib.includes('supabase.functions.invoke("chilly-chat-call-dispatch"')) {
  fail("call invite client path must invoke server-side call dispatch");
}

if (!callsLib.includes('action: "incoming"') || !callsLib.includes('action: "missed"')) {
  fail("call invite client path must dispatch incoming and missed call actions");
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

if (packageJson.scripts?.["guard:chilly-chat-call-push-policy"] !== "node ./scripts/guard-chilly-chat-call-push-policy.mjs") {
  fail("package.json must expose guard:chilly-chat-call-push-policy");
}

console.log("Chi'lly Chat call push policy guard passed.");
