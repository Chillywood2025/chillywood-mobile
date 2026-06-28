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

const doc = read("docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md");
const packageJson = read("package.json");
const chatLib = read("_lib/chat.ts");
const userData = read("_lib/userData.ts");
const settings = read("app/settings.tsx");
const initialRepairMigration = read("supabase/migrations/20260628205325_chilly_chat_direct_thread_open_repair.sql");
const safetyMigration = read("supabase/migrations/20260628212500_chilly_chat_direct_thread_repair_safety_guards.sql");
const grantsMigration = read("supabase/migrations/20260628213000_chilly_chat_direct_thread_repair_execute_grants.sql");
const pairKeyMigration = read("supabase/migrations/20260628215750_chilly_chat_direct_thread_repair_ambiguous_pair_key.sql");
const memberUpsertMigration = read("supabase/migrations/20260628215943_chilly_chat_direct_thread_repair_member_upsert_constraint.sql");

[
  "Google-signed Play internal install proof: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "installerPackageName must be com.android.vending",
  "Sideloaded APK proof is not accepted",
  "No logout, uninstall, reinstall, or clear-data happened",
  "Fresh remote profile must win over stale AsyncStorage",
  "Settings/Profile/Chat must agree on the current handle",
  "Visible People result must open or create a direct thread",
  "Direct-thread repair must be authenticated and RLS-safe",
  "Unable to open Chi’lly Chat with this person right now is not Closed",
  "Same-thread proof is not enough",
  "Call end/decline/missed cleanup must be proved before full call closure",
  "Source fixed is not installed-app proof",
  "Google Play internal install is not enough without actual user flow proof",
  "If Robert/testers cannot reproduce it in the Google-signed Play-internal installed app, it is not actual-user Closed",
  "No auth/RLS/chat/account-status permission weakening happened",
  "No service-role chat proof was counted",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Repo Commit Proved",
  "Origin/Main Alignment",
  "Supabase RPC / Migration Verification",
  "Google Play Internal Build Result",
  "Google-Signed Install Verification",
  "Device Version / Installer Proof",
  "No Logout / No Data Reset Confirmation",
  "Fresh Profile Handle Result",
  "People Search Result",
  "Direct Thread Open/Create Repair Result",
  "Inbox/Search Call Path Result",
  "Existing Thread Call Path Result",
  "Normal Profile Call Path Result",
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
].forEach((needle) => requireText("v60 proof doc", doc, needle));

[
  "0b563c79384e5270440bc0ad076bbc4ca687bf57",
  "c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82",
  "HEAD == origin/main",
  "8642fea7-b782-4c18-98c8-5805b6c7c20e",
  "VersionCode: `60`",
  "VersionName: `1.0.0`",
  "20260628211504 chilly_chat_direct_thread_open_repair",
  "20260628211710 chilly_chat_direct_thread_repair_safety_guards",
  "20260628211813 chilly_chat_direct_thread_repair_execute_grants",
  "Authenticated execute: true",
  "Anonymous execute: false",
  "Service-role execute: false",
  "Checks blocked relationship before thread insert: true",
  "Checks account access before thread insert: true",
  "Checks target profile exists before thread insert: true",
  "API probe result for anonymous caller: `exists_permission_denied_for_anon`",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "com.chillywood.mobile",
  "com.android.vending",
  "versionCode `60`",
  "lastUpdateTime=2026-06-28 16:49:54",
  "lastUpdateTime=2026-06-28 16:49:28",
  "@user230455",
  "@user230456",
  "Build status: FINISHED",
  "Google Play internal testing upload status: delivered to internal testing",
  "Status: Passed for installed visible Chat search open/create after live RPC fixes.",
  "R5CR120QCBF` showed an app-wide incoming banner",
  "This Chi'lly Chat thread could not be found.",
  "Caller End Call returned the thread header to `No Active Call`.",
  "20260628215838 chilly_chat_direct_thread_repair_ambiguous_pair_key",
  "20260628220027 chilly_chat_direct_thread_repair_member_upsert_constraint",
].forEach((needle) => requireText("v60 proof facts", doc, needle));

[
  "proof:google-signed-v60-direct-chat-call-proof",
  "guard:google-signed-v60-direct-chat-call-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "openOrRepairDirectThreadWithRpc",
  "get_or_create_direct_chat_thread",
  "return openOrRepairDirectThreadWithRpc(target);",
].forEach((needle) => requireText("direct chat repair client", chatLib, needle));

[
  "const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;",
  "await writeJsonValue(USER_PROFILE_KEY, remoteProfile);",
].forEach((needle) => requireText("fresh profile source", userData, needle));

requireText("settings handle cache source", settings, "await saveUserProfile(updatedProfile);");
requireText("initial direct thread repair migration", initialRepairMigration, "create or replace function public.get_or_create_direct_chat_thread");
requireText("initial direct thread repair migration", initialRepairMigration, "auth.uid()::text");
requireText("safety direct thread repair migration", safetyMigration, "public.\"assert_account_private_feature_allowed\"(actor_user_id, 'chat_direct_thread_open')");
requireText("safety direct thread repair migration", safetyMigration, "public.\"has_channel_audience_block_between\"(actor_user_id, normalized_target_user_id)");
requireText("safety direct thread repair migration", safetyMigration, "target_unavailable");
requireText("safety direct thread repair migration", safetyMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from anon;");
requireText("safety direct thread repair migration", safetyMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from service_role;");
requireText("direct thread repair grants migration", grantsMigration, "grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;");
requireText("pair key direct thread repair migration", pairKeyMigration, "v_participant_pair_key");
requireText("pair key direct thread repair migration", pairKeyMigration, "where thread.\"participant_pair_key\" = v_participant_pair_key");
requireText("member upsert direct thread repair migration", memberUpsertMigration, "on conflict on constraint chat_thread_members_pkey do update");
requireText("member upsert direct thread repair migration", memberUpsertMigration, "avoids ambiguous pair-key and member-upsert resolution");

if (failures.length) {
  console.error("Google-signed v60 direct chat call proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Google-signed v60 direct chat call proof passed.");
console.log("- Google Play v60 install, fresh handle/search, visible direct-thread open, voice-call incoming banner, receiver join blocker, RPC fixes, artifact paths, and safety boundaries are documented.");
