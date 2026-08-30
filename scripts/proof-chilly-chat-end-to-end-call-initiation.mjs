#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/release/CHILLY_CHAT_END_TO_END_CALL_INITIATION_PROOF.md");
const packageJson = read("package.json");
const chatLib = read("_lib/chat.ts");
const callLib = read("_lib/chillyChatCalls.ts");
const notificationsLib = read("_lib/notifications.ts");
const appLayout = read("app/_layout.tsx");
const inbox = read("app/chat/index.tsx");
const thread = read("app/chat/[threadId].tsx");
const profile = read("app/profile/[userId].tsx");
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const callDeliveryCopy = read("_lib/chillyChatCallDeliveryCopy.ts");

[
  "Chi’lly Chat end-to-end call initiation proof: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "Same-thread proof is not enough",
  "Users must be able to start Voice/Video Call without both phones already inside the same thread",
  "Pre-created thread/call state is not actual-user proof",
  "Receiver elsewhere in app must get app-wide incoming call state or remain Partial",
  "Background push/ringing must be proved separately or remain Partial",
  "Source fixed is not installed-app proof",
  "No auth/RLS/chat/account-status permission weakening happened",
  "No service-role chat proof was counted",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Root Cause",
  "Normal Supported Call-Start Paths",
  "Same-Thread Proof Result",
  "Receiver Elsewhere In App Proof Result",
  "Background/Push Proof Result",
  "Profile Normal Path Result",
  "Profile Deep-Link Fallback Result",
  "Source Fixes Made",
  "Installed-App Proof Result",
  "Remaining Blockers",
  "Screenshots/XML/Log Artifact Paths",
  "Safety Confirmation",
].forEach((needle) => requireText("end-to-end call initiation proof doc", doc, needle));

[
  "proof:chilly-chat-end-to-end-call-initiation",
  "guard:chilly-chat-end-to-end-call-initiation-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "getOrCreateDirectThread",
  "startCall",
  "chat-search-suggestion-voice",
  "chat-search-suggestion-video",
  "openDirectThreadForPerson",
].forEach((needle) => requireText("chat inbox start-chat path", inbox, needle));

[
  "Unable to start Chi'lly Chat call. The receiver invite could not be saved.",
  "await endCommunicationRoom(roomId, currentUserId).catch(() => null);",
  "beginChillyChatCall",
  "dispatchChillyChatCallPush",
].forEach((needle) => requireText("chat call source", chatLib, needle));

[
  "readLatestRingingChillyChatCallInviteForCallee",
  "subscribeToIncomingChillyChatCallInvites",
  "callee_user_id",
  "status\", \"ringing\"",
].forEach((needle) => requireText("call invite source", callLib, needle));

[
  "inviteId?: string;",
  "triggerType === \"chilly_chat_call\" || data.openCall === true",
].forEach((needle) => requireText("notification alert source", notificationsLib, needle));

[
  "IncomingCallNotificationBridge",
  "readLatestRingingChillyChatCallInviteForCallee",
  "subscribeToIncomingChillyChatCallInvites",
  "chilly_chat_call_invite",
  "app-wide-incoming-call-banner",
  "presentation === \"native_background\"",
  "openCall: \"1\"",
].forEach((needle) => requireText("app-wide receiver source", appLayout, needle));

[
  "chat-thread-incoming-call-banner",
  "result.role === \"callee\"",
  "shouldShowOutgoingRingingPanel",
].forEach((needle) => requireText("same-thread collision source", thread, needle));

[
  "Android call alert sent.",
  "Native iPhone call alert sent.",
  "Push notification sent.",
  "Delivery status: in-app banner available",
  "Delivery status: push unconfirmed",
  "Delivery status: invite failed",
  "chat-call-delivery-status",
].forEach((needle) => requireText("thread delivery status source", `${thread}\n${callDeliveryCopy}`, needle));

[
  "profile-unavailable-open-chat-search",
  "Chat search to find or start a direct thread through the normal app path.",
  "Voice Call",
  "Video Call",
  "getOrCreateDirectThread",
].forEach((needle) => requireText("profile path source", profile, needle));

[
  "blockedDispatch(\"account_access_restricted\")",
  "buildBlockedChillyChatCallDispatch",
].forEach((needle) => requireText("call dispatch receiver unavailable source", callDispatch, needle));

if (failures.length) {
  console.error("Chi'lly Chat end-to-end call initiation proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Chi'lly Chat end-to-end call initiation proof passed.");
console.log("- source paths, receiver invite state, app-wide incoming call banner, profile fallback, proof wording, and safety boundaries are documented.");
