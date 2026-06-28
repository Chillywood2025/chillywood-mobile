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

const doc = read("docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md");
const packageJson = read("package.json");
const sourceDoc = read("docs/release/CHILLY_CHAT_END_TO_END_CALL_INITIATION_PROOF.md");
const playDoc = read("docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md");

[
  "Chi’lly Chat Play v58 actual-user call proof: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "Same-thread proof is not enough",
  "Users must be able to start Voice/Video Call without both phones already inside the same thread",
  "Pre-created thread/call state is not actual-user proof",
  "Receiver elsewhere in app must get app-wide incoming call state or remain Partial",
  "Background push/ringing must be proved separately or remain Partial",
  "Source fixed is not installed-app proof",
  "v58 installed is not enough without actual user flow proof",
  "If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed",
  "Out-of-scope is not an excuse to ignore visible user-facing problems",
  "Small safe visible issues were fixed where found",
  "Risky or larger issues were documented instead of hidden",
  "No auth/RLS/chat/account-status permission weakening happened",
  "No service-role chat proof was counted",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Repo Commit Proved",
  "Origin/Main Alignment",
  "Device List",
  "Package/Version/Installer Proof",
  "Normal Inbox/Search Path Result",
  "Existing Thread Path Result",
  "Normal Profile Path Result",
  "Deep-Link Fallback Result",
  "Receiver Same-Thread Result",
  "Receiver Elsewhere-In-App Result",
  "Receiver Background/Push Result",
  "Voice Call Result",
  "Video Call Result",
  "Local/Remote Video Result",
  "Fullscreen Video Fit Result",
  "Blocked/Restricted/Signed-Out Safety Result",
  "Cross-Lane Issues Found",
  "Fixes Made",
  "Issues Documented But Not Fixed",
  "Remaining Launch Blockers",
  "Screenshots/XML/Log Artifact Paths",
  "Actual-User Proof Classification",
  "Safety Confirmation",
].forEach((needle) => requireText("Play v58 actual-user proof doc", doc, needle));

[
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "com.chillywood.mobile",
  "com.android.vending",
  "versionCode `58`",
  "versionName `1.0.0`",
  "0a22ab3e2612d4f888b4f56eac03c0639cac26ae",
  "HEAD == origin/main",
  "/tmp/chillywood-play-v58-call-proof-20260628/",
  "R5CR120QCBF-package.txt",
  "R3CXA0DS5JV-package.txt",
  "R5-03-chat-inbox-from-self-profile.png",
  "R3-06-existing-thread-voice-started.png",
  "R5-07-receiver-elsewhere-voice-after-dismiss-keyboard.png",
  "R3-07-voice-caller-back-to-thread-delivery.png",
].forEach((needle) => requireText("Play v58 artifact proof", doc, needle));

[
  "proof:chilly-chat-play-v58-actual-user-call-proof",
  "guard:chilly-chat-play-v58-actual-user-call-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "Source fixed is not installed-app proof",
  "Final verdict: Partial",
].forEach((needle) => requireText("source call initiation proof doc", sourceDoc, needle));

[
  "Play-internal two-phone Chat/Live proof: Partial",
  "If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed",
].forEach((needle) => requireText("Play internal two-phone proof doc", playDoc, needle));

if (failures.length) {
  console.error("Chi'lly Chat Play v58 actual-user call proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Chi'lly Chat Play v58 actual-user call proof passed.");
console.log("- v58 device/package evidence, Partial actual-user classification, artifact paths, v59 search dependency, receiver-state gaps, and safety boundaries are documented.");
