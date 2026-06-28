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

const doc = read("docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md");
const packageJson = read("package.json");
const participantGrid = read("components/communication/communication-participant-grid.tsx");
const inRoomPanel = read("components/communication/in-room-communication-panel.tsx");
const roomHeader = read("components/communication/communication-room-header.tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");

[
  "Play-internal two-phone Chat/Live proof: Partial.",
  "Source fixed is not installed-app proof",
  "EAS Update published is not installed-app proof",
  "Both physical Play-internal phones must run the updated code",
  "One attached device cannot close two-phone proof",
  "If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed",
  "Out-of-scope is not an excuse to ignore visible user-facing problems",
  "873bb515e73930ef1b1cb6fb047293e18ce84449",
  "ccf8ee01-efa6-4792-bd4a-bf7e015bcd36",
  "019f0c20-a752-7fd2-a61e-c9fa1a27a734",
  "production",
  "runtime `1.0.0`",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "com.android.vending",
  "versionCode",
  "Update Pickup Evidence",
  "Active update ID could not be confirmed",
  "Chat Video Scenario 1 Result",
  "Status: Partial.",
  "Profile unavailable",
  "Chat Video Scenario 2 Result",
  "Chat Video Scenario 3 Result",
  "Background/push ringing was not proved",
  "Fullscreen Aspect Fit Result",
  "Live Remote Video Result",
  "Premium-required",
  "Live Host Controls Result",
  "Watch-Party Sanity Result",
  "Cross-Lane Issues Found",
  "Fixes Made",
  "Issues Documented But Not Fixed",
  "Remaining Blockers",
  "No sideload, uninstall, reinstall, or clear-data happened",
  "No auth/RLS/Premium/chat/account-status/staff permission weakening happened",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
].forEach((needle) => requireText("play internal two phone proof doc", doc, needle));

[
  "/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/eas-update-output.json",
  "/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/update-pickup-cycle-1.log",
  "/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/update-pickup-cycle-2.log",
  "/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/device-a-chat-thread-from-profile.png",
  "/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/device-a-live-waiting-room.png",
  "/tmp/app-play-internal-two-phone-chat-live-proof-20260627-214654/two-client-run/device-b-live-waiting-room.png",
].forEach((needle) => requireText("artifact references", doc, needle));

[
  "const hasVideoStream = !!participant.streamURL;",
  "const showVideo = !!RTCView && hasVideoStream;",
  "Video connected",
].forEach((needle) => requireText("communication participant grid", participantGrid, needle));

requireText("in-room communication panel", inRoomPanel, "{participantCount} in call");
requireText("communication room header", roomHeader, "{participantCount} in room");
requireText("live stage", liveStage, "const showHeroRemoteVideo = !heroParticipantIsCurrentUser && !!RTCView && !!heroMediaParticipant?.streamURL;");
requireText("live stage", liveStage, "const showRemoteLiveVideo = !isCurrentUser && !!RTCView && !!mediaParticipant?.streamURL;");

[
  "proof:play-internal-two-phone-chat-live-proof",
  "guard:play-internal-two-phone-chat-live-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("Play-internal two-phone Chat/Live proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Play-internal two-phone Chat/Live proof passed.");
console.log("- delivery, device metadata, update-pickup limits, Chat/Live Partial results, artifacts, blockers, and safety wording are documented.");
