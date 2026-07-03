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
const chatThreadPath = "app/chat/[threadId].tsx";
const configPath = "supabase/config.toml";
const packagePath = "package.json";

for (const filePath of [dispatchPath, callsLibPath, chatThreadPath, configPath, packagePath]) {
  if (!fs.existsSync(path.join(ROOT, filePath))) fail(`missing required file ${filePath}`);
}

const dispatch = read(dispatchPath);
const callsLib = read(callsLibPath);
const chatThread = read(chatThreadPath);
const config = read(configPath);
const packageJson = JSON.parse(read(packagePath));

if (!dispatch.includes('const CHAT_CALL_CHANNEL_ID = "chilly_chat_calls_v3"')) {
  fail("incoming call pushes must use chilly_chat_calls_v3");
}

if (!dispatch.includes('const CHAT_CALL_SOUND = "default"')) {
  fail("incoming call pushes must request Android default sound on the fresh call channel");
}

if (!dispatch.includes('const MISSED_CALL_CHANNEL_ID = "chilly_chat_missed_calls"')) {
  fail("missed call pushes must use chilly_chat_missed_calls");
}

if (/\bchilly_chat_calls\b/.test(dispatch.replace(/chilly_chat_calls_v3/g, ""))) {
  fail("new call push dispatcher must not use stale chilly_chat_calls channels");
}

if (!dispatch.includes('target_route: "/chat/[threadId]"') || !dispatch.includes("function buildRoute")) {
  fail("call push payload must target the canonical /chat/[threadId] route");
}

if (!dispatch.includes("openCall") || !dispatch.includes("callInviteId")) {
  fail("call push payload must include safe call context for tap routing");
}

if (!dispatch.includes('sound: input.action === "incoming" ? CHAT_CALL_SOUND : "default"')) {
  fail("incoming call pushes must request the call ringtone while missed calls stay calmer");
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

if (!config.includes("[functions.chilly-chat-call-dispatch]")) {
  fail("Supabase config must declare chilly-chat-call-dispatch");
}

if (packageJson.scripts?.["guard:chilly-chat-call-push-policy"] !== "node ./scripts/guard-chilly-chat-call-push-policy.mjs") {
  fail("package.json must expose guard:chilly-chat-call-push-policy");
}

console.log("Chi'lly Chat call push policy guard passed.");
