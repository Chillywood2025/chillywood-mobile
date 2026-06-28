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

const fail = (message) => failures.push(message);
const requireText = (label, content, needle) => {
  if (!content.includes(needle)) fail(`${label} missing required text: ${needle}`);
};
const forbidMatch = (label, content, pattern, description) => {
  if (pattern.test(content)) fail(`${label} contains forbidden ${description}`);
};

const sentences = (content) => content
  .replace(/\r/g, "")
  .split(/(?<=[.!?])\s+|\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

const hasNegation = (sentence) => /\b(no|not|never|without|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|could not|unless|requires|required|unavailable|not proved|not confirmed|not counted|not actual-user|remain Partial|not enough|stopped|Source fixed is not installed-app proof)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, description) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${description}: "${sentence.slice(0, 260)}"`);
  }
};

const doc = read("docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md");
const packageJson = read("package.json");
const chatLib = read("_lib/chat.ts");
const callLib = read("_lib/chillyChatCalls.ts");
const notificationsLib = read("_lib/notifications.ts");
const appLayout = read("app/_layout.tsx");
const inbox = read("app/chat/index.tsx");
const thread = read("app/chat/[threadId].tsx");
const profile = read("app/profile/[userId].tsx");
const settings = read("app/settings.tsx");
const userData = read("_lib/userData.ts");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const callMigration = read("supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql");
const initialRepairMigration = read("supabase/migrations/20260628205325_chilly_chat_direct_thread_open_repair.sql");
const safetyMigration = read("supabase/migrations/20260628212500_chilly_chat_direct_thread_repair_safety_guards.sql");
const grantsMigration = read("supabase/migrations/20260628213000_chilly_chat_direct_thread_repair_execute_grants.sql");
const pairKeyMigration = read("supabase/migrations/20260628215750_chilly_chat_direct_thread_repair_ambiguous_pair_key.sql");
const memberUpsertMigration = read("supabase/migrations/20260628215943_chilly_chat_direct_thread_repair_member_upsert_constraint.sql");
const ownerReadbackMigration = read("supabase/migrations/20260628223157_chilly_chat_owner_initiated_thread_member_readback.sql");
const directMemberReadbackMigration = read("supabase/migrations/20260628223918_chilly_chat_direct_member_platform_owner_thread_readback.sql");

[
  "Google-signed Play internal install proof: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "installerPackageName must be com.android.vending",
  "Sideloaded APK proof is not accepted",
  "Fresh remote profile must win over stale AsyncStorage",
  "Settings/Profile/Chat must agree on the current handle",
  "Visible People result must open or create a direct thread",
  "Direct-thread repair must be authenticated and RLS-safe",
  "Unable to open Chi’lly Chat with this person right now is not Closed",
  "Receiver banner must resolve a valid readable direct thread",
  "This Chi’lly Chat thread could not be found is not Closed",
  "Receiver banner tap must join or open the correct call thread",
  "Same-thread proof is not enough",
  "Background push/ringing is Partial without installed-app evidence",
  "Call end/decline/missed cleanup must be proved before full call closure",
  "Source fixed is not installed-app proof",
  "Google Play internal install is not enough without actual user flow proof",
  "No auth/RLS/chat/account-status permission weakening happened",
  "No service-role chat proof was counted",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Supabase RPC / Migration Verification",
  "Device Version / Installer Proof",
  "Cross-Lane Issues Found",
  "Build status: FINISHED",
  "Google Play internal testing upload status: delivered to internal testing",
  "Status: Passed for installed visible Chat search open/create after live RPC fixes.",
  "This Chi'lly Chat thread could not be found.",
  "20260628215838 chilly_chat_direct_thread_repair_ambiguous_pair_key",
  "20260628220027 chilly_chat_direct_thread_repair_member_upsert_constraint",
  "20260628223330 chilly_chat_owner_initiated_thread_member_readback",
  "20260628223918 chilly_chat_direct_member_platform_owner_thread_readback",
  "Receiver banner thread-readback fix",
  "callee_can_access=true",
  "thread_readable_by_callee=true",
  "R5CR120QCBF` tapped the app-wide banner and joined the correct call surface",
  "2 in call",
  "false `Missed voice call`",
  "requires a newer Google Play internal build",
].forEach((needle) => requireText("v60 proof doc", doc, needle));

[
  "proof:google-signed-v60-direct-chat-call-proof",
  "guard:google-signed-v60-direct-chat-call-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (/Final verdict:\s*Closed/i.test(doc)) {
  [
    "installer `com.android.vending`",
    "versionCode `60` or higher",
    "Settings shows `@user230455`",
    "Profile shows `@user230455`",
    "Chat/search result shows `@user230455`",
    "direct thread opens/creates",
    "receiver same-thread",
    "receiver elsewhere",
    "background push",
    "local and remote video on both phones",
    "call end/decline/missed cleanup",
  ].forEach((needle) => requireText("Closed proof evidence", doc, needle));
}

forbidSentence("v60 proof doc", doc, (sentence) => (
  /same-thread.*(?:full|actual-user).*Closed|Closed.*same-thread-only/i.test(sentence)
  && !hasNegation(sentence)
), "same-thread-only proof counted as full actual-user Closed");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /pre-created.*(?:actual-user|Closed|proof)|precreated.*(?:actual-user|Closed|proof)/i.test(sentence)
  && !hasNegation(sentence)
), "pre-created thread/call state counted as actual-user proof");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /inbox|search/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "inbox/search path Closed without installed evidence");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /normal profile|Profile path/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "normal profile path Closed without installed evidence");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /receiver elsewhere|elsewhere-in-app|app-wide incoming|in-app banner/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "receiver elsewhere-in-app Closed without installed-app evidence");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /\b(background|push|ringing)\b/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "background push/ringing Closed without installed-app evidence");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /video call|local video|remote video|fullscreen video/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "video proof Closed without local/remote evidence on both phones");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /cleanup|active call state|stale.*state|end\/decline\/missed/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "call cleanup Closed without cleanup matrix evidence");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /Unable to open Chi.lly Chat with this person right now/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "direct-thread failure counted as Closed");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /@user230456.*wins|stale.*@user230456.*primary|Settings\/Profile\/Chat.*mismatch/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "stale handle mismatch counted as Closed");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /logout|uninstall|reinstall|clear-data|clear data|sideload|adb install|manual APK/i.test(sentence)
  && /happened|performed|used|executed|counted/i.test(sentence)
  && !hasNegation(sentence)
), "forbidden device action");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /service-role|service role/i.test(sentence)
  && /chat.*proof|authority proof|counted/i.test(sentence)
  && !hasNegation(sentence)
), "service-role counted as chat proof");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /provider mutation|Google Play product|base-plan|RevenueCat|Stripe|provider dashboard|Play production|live-money|live money/i.test(sentence)
  && /happened|mutated|changed|applied|executed|submitted|enabled|turned on/i.test(sentence)
  && !hasNegation(sentence)
), "provider/live-money mutation claim");

forbidSentence("v60 proof doc", doc, (sentence) => (
  /auth|RLS|Premium|chat permission|account-status|staff permission/i.test(sentence)
  && /weakened|bypassed|disabled|turned off/i.test(sentence)
  && !hasNegation(sentence)
), "auth/RLS/chat/account-status permission weakening");

[
  ["v60 proof doc", doc],
  ["chat lib", chatLib],
  ["call lib", callLib],
  ["notifications lib", notificationsLib],
  ["app layout", appLayout],
  ["chat inbox", inbox],
  ["chat thread", thread],
  ["profile", profile],
  ["settings", settings],
  ["user data", userData],
  ["initial repair migration", initialRepairMigration],
  ["safety repair migration", safetyMigration],
  ["grants repair migration", grantsMigration],
  ["pair-key repair migration", pairKeyMigration],
  ["member-upsert repair migration", memberUpsertMigration],
  ["owner readback migration", ownerReadbackMigration],
  ["direct member readback migration", directMemberReadbackMigration],
].forEach(([label, content]) => {
  forbidMatch(label, content, /\b(?:PASSWORD|PASSCODE)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i, "password value");
  forbidMatch(label, content, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
  forbidMatch(label, content, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
  forbidMatch(label, content, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id|X-Goog-Signature)[^\s)]*/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");
});

[
  "throw new Error(\"Unable to start Chi'lly Chat call. The receiver-visible call state was not saved.\")",
  "throw new Error(\"Unable to start Chi'lly Chat call. The receiver invite could not be saved.\")",
].forEach((needle) => requireText("chat source failure handling", chatLib, needle));

[
  "openOrRepairDirectThreadWithRpc",
  "get_or_create_direct_chat_thread",
  "return openOrRepairDirectThreadWithRpc(target);",
].forEach((needle) => requireText("direct thread source", chatLib, needle));

[
  "const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;",
  "await writeJsonValue(USER_PROFILE_KEY, remoteProfile);",
].forEach((needle) => requireText("profile cache source", userData, needle));

requireText("settings handle cache source", settings, "await saveUserProfile(updatedProfile);");
requireText("call invite RLS", callMigration, "alter table public.\"chat_call_invites\" enable row level security;");
requireText("initial repair migration", initialRepairMigration, "grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;");
requireText("safety repair migration", safetyMigration, "public.\"assert_account_private_feature_allowed\"(actor_user_id, 'chat_direct_thread_open')");
requireText("safety repair migration", safetyMigration, "public.\"assert_account_private_feature_allowed\"(normalized_target_user_id, 'chat_direct_thread_target')");
requireText("safety repair migration", safetyMigration, "public.\"has_channel_audience_block_between\"(actor_user_id, normalized_target_user_id)");
requireText("safety repair migration", safetyMigration, "target_unavailable");
requireText("safety repair migration", safetyMigration, "insert into public.\"chat_threads\"");
requireText("safety repair migration", safetyMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from anon;");
requireText("safety repair migration", safetyMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from service_role;");
requireText("grants repair migration", grantsMigration, "grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;");
requireText("pair-key repair migration", pairKeyMigration, "v_participant_pair_key");
requireText("pair-key repair migration", pairKeyMigration, "where thread.\"participant_pair_key\" = v_participant_pair_key");
requireText("member-upsert repair migration", memberUpsertMigration, "on conflict on constraint chat_thread_members_pkey do update");
requireText("member-upsert repair migration", memberUpsertMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from service_role;");
requireText("owner readback migration", ownerReadbackMigration, "create or replace function public.can_access_chat_thread");
requireText("owner readback migration", ownerReadbackMigration, "explicit members of owner-created direct threads");
requireText("direct member readback migration", directMemberReadbackMigration, "create or replace function public.can_access_chat_thread");
requireText("direct member readback migration", directMemberReadbackMigration, "Direct threads that contain a platform owner remain member-only");
requireText("direct member readback migration", directMemberReadbackMigration, "public.\"has_channel_audience_block_between\"(actor.user_id, other_member.\"user_id\")");
requireText("call invite stale missed guard", callLib, "query = query.eq(\"status\", \"ringing\");");
requireText("call invite stale missed guard", callLib, "if (!updatedInvite) return null;");
requireText("banner auto accept source", thread, "Incoming call could not be accepted. Ask the caller to start a new call.");
requireText("banner auto accept source", thread, "status: \"accepted\"");

forbidMatch("chat call migration", callMigration, /disable row level security/i, "RLS disablement");
forbidMatch("chat call migration", callMigration, /using\s*\(\s*true\s*\)/i, "allow-all RLS policy");
forbidMatch("chat call migration", callMigration, /with check\s*\(\s*true\s*\)/i, "allow-all RLS write policy");
forbidMatch("initial repair migration", initialRepairMigration, /disable row level security/i, "RLS disablement");
forbidMatch("safety repair migration", safetyMigration, /disable row level security/i, "RLS disablement");
forbidMatch("grants repair migration", grantsMigration, /disable row level security/i, "RLS disablement");
forbidMatch("pair-key repair migration", pairKeyMigration, /disable row level security/i, "RLS disablement");
forbidMatch("member-upsert repair migration", memberUpsertMigration, /disable row level security/i, "RLS disablement");
forbidMatch("owner readback migration", ownerReadbackMigration, /disable row level security/i, "RLS disablement");
forbidMatch("direct member readback migration", directMemberReadbackMigration, /disable row level security/i, "RLS disablement");
forbidMatch("mobile chat/call sources", `${chatLib}\n${callLib}\n${notificationsLib}\n${appLayout}\n${inbox}\n${thread}\n${profile}\n${settings}\n${userData}`, /service_role|SUPABASE_SERVICE_ROLE/i, "service-role mobile use");

forbidMatch("runtime feature flags", featureFlags, /liveMoneyEnabled:\s*true/i, "liveMoneyEnabled ON");
forbidMatch("runtime feature flags", featureFlags, /payoutsEnabled:\s*true/i, "payouts enabled");
forbidMatch("runtime feature flags", featureFlags, /cashoutEnabled:\s*true/i, "cashout enabled");
forbidMatch("runtime feature flags", featureFlags, /stripeConnectProductionEnabled:\s*true/i, "Stripe Connect production enabled");
forbidMatch("runtime feature flags", featureFlags, /payableBalancesEnabled:\s*true/i, "payable balances enabled");
forbidMatch("money feature defaults", moneyFlags, /live_money_enabled:\s*["']on["']/i, "live_money_enabled ON");
forbidMatch("money feature defaults", moneyFlags, /payouts_enabled:\s*["']on["']/i, "payouts ON");
forbidMatch("money feature defaults", moneyFlags, /cashout_enabled:\s*["']on["']/i, "cashout ON");
forbidMatch("money feature defaults", moneyFlags, /stripe_connect_production_enabled:\s*["']on["']/i, "Stripe Connect production ON");
forbidMatch("money feature defaults", moneyFlags, /payable_balances_enabled:\s*["']on["']/i, "payable balances ON");

if (failures.length) {
  console.error("Google-signed v60 direct chat call policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Google-signed v60 direct chat call policy guard passed.");
console.log("- no v60 Google-signed install overclaim, same-thread-only closeout, pre-created proof, stale handle closure, direct-thread failure closure, receiver/background/video/cleanup overclaim, forbidden device action, permission weakening, service-role proof, secret exposure, provider mutation, or live-money activation was introduced.");
