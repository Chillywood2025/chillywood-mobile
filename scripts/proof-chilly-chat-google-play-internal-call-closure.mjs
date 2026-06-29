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

const doc = read("docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md");
const packageJson = read("package.json");
const v58Doc = read("docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md");
const sourceDoc = read("docs/release/CHILLY_CHAT_END_TO_END_CALL_INITIATION_PROOF.md");
const playDoc = read("docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md");
const chatLib = read("_lib/chat.ts");
const userData = read("_lib/userData.ts");
const settings = read("app/settings.tsx");
const directThreadRepairMigration = read("supabase/migrations/20260628211504_chilly_chat_direct_thread_open_repair.sql");

[
  "Chi’lly Chat Google Play internal actual-user call proof: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "Google Play internal install is not enough without actual user flow proof",
  "No logout, uninstall, reinstall, or clear-data happened",
  "Same-thread proof is not enough",
  "Users must be able to start Voice/Video Call without both phones already inside the same thread",
  "Pre-created thread/call state is not actual-user proof",
  "Receiver elsewhere in app must get app-wide incoming call state or remain Partial",
  "Background push/ringing must be proved separately or remain Partial",
  "Call end/decline/missed cleanup must be proved before full call closure",
  "Source fixed is not installed-app proof",
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
  "Google Play Internal Build / Install Result",
  "Device Version Verification",
  "No Logout / No Data Reset Confirmation",
  "Search Prerequisite Result",
  "Inbox/Search Call Path Result",
  "Existing Thread Call Path Result",
  "Normal Profile Call Path Result",
  "Deep-Link Fallback Result",
  "Receiver Same-Thread Result",
  "Receiver Elsewhere-In-App Result",
  "Receiver Background/Push Result",
  "Voice Call Result",
  "Video Call Local/Remote Result",
  "Fullscreen Video Fit Result",
  "Call End / Decline / Missed Cleanup Result",
  "Cross-Lane Issues Found",
  "Fixes Made",
  "Issues Documented But Not Fixed",
  "Remaining Launch Blockers",
  "Screenshots/XML/Log Artifact Paths",
  "Actual-User Proof Classification",
  "Safety Confirmation",
].forEach((needle) => requireText("Google Play internal call closure doc", doc, needle));

[
  "Owner/Admin R3 searched `user230455`",
  "user230455 @user230455",
  "Unable to open Chi'lly Chat with this person right now.",
  "Settings reporting the handle as current at `@user230455` while normal Profile still displayed the stale `@user230456` handle",
  "direct-thread open/create before call start",
  "signed-in `readUserProfile()` now prefers the remote profile over stale AsyncStorage",
  "Settings writes the updated username into the shared local profile cache",
  "get_or_create_direct_chat_thread",
  "Source fixes are now applied but not installed-app proof",
].forEach((needle) => requireText("user230455 retry proof", doc, needle));

[
  "7cf16ebe-a3de-4efb-8170-63a5e9799653",
  "0c9b2162-c259-4934-a0e8-5679f524b609",
  "versionCode `59`",
  "versionName `1.0.0`",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "com.chillywood.mobile",
  "com.android.vending",
  "2026-06-28 15:03:23",
  "2026-06-28 15:02:36",
  "f0a41ab3b8bec606bc682b8e1d4494c8bd8cb580",
  "HEAD == origin/main",
  "/tmp/chillywood-google-play-internal-call-closure-20260628/",
].forEach((needle) => requireText("v59 package/build proof", doc, needle));

[
  "proof:chilly-chat-google-play-internal-call-closure",
  "guard:chilly-chat-google-play-internal-call-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

requireText("v58 proof doc", v58Doc, "Final verdict: Partial");
requireText("source call initiation proof doc", sourceDoc, "Source fixed is not installed-app proof");
requireText("Play internal two-phone proof doc", playDoc, "Play-internal two-phone Chat/Live proof: Partial");
requireText("chat direct thread repair source", chatLib, "openOrRepairDirectThreadWithRpc");
requireText("chat direct thread repair source", chatLib, "get_or_create_direct_chat_thread");
requireText("chat direct thread repair source", chatLib, "return openOrRepairDirectThreadWithRpc(target);");
requireText("profile cache source", userData, "const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;");
requireText("settings handle cache source", settings, "await saveUserProfile(updatedProfile);");
requireText("direct thread repair migration", directThreadRepairMigration, "create or replace function public.get_or_create_direct_chat_thread");
requireText("direct thread repair migration", directThreadRepairMigration, "grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;");

if (failures.length) {
  console.error("Chi'lly Chat Google Play internal call closure proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Chi'lly Chat Google Play internal call closure proof passed.");
console.log("- v59 Play internal delivery, device package evidence, no-reset continuity, Partial actual-user classification, artifact paths, and safety boundaries are documented.");
