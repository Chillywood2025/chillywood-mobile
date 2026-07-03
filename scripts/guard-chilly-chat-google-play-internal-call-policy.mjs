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

const hasNegation = (sentence) => /\b(no|not|never|without|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|could not|unless|requires|required|unavailable|not proved|not confirmed|not counted|not actual-user|remain Partial|not enough|stopped|deleted|Source fixed is not installed-app proof)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, description) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${description}: "${sentence.slice(0, 260)}"`);
  }
};

const doc = read("docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md");
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
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const callMigration = read("supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql");
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
  "Any accidental non-target or private-account screenshots captured during navigation were deleted",
  "Owner/Admin R3 searched `user230455`",
  "Unable to open Chi'lly Chat with this person right now.",
  "Settings reporting the handle as current at `@user230455` while normal Profile still displayed the stale `@user230456` handle",
  "Source fixes are now applied but not installed-app proof",
].forEach((needle) => requireText("Google Play internal call closure doc", doc, needle));

[
  "proof:chilly-chat-google-play-internal-call-closure",
  "guard:chilly-chat-google-play-internal-call-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "7cf16ebe-a3de-4efb-8170-63a5e9799653",
  "0c9b2162-c259-4934-a0e8-5679f524b609",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "versionCode `59`",
  "com.android.vending",
  "HEAD == origin/main",
].forEach((needle) => requireText("v59 device/build proof", doc, needle));

if (/Final verdict:\s*Closed/i.test(doc)) {
  fail("Google Play internal call proof must not claim Closed while call flow, receiver state, background push, video, and cleanup are Partial.");
}

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /same-thread.*(?:full|actual-user).*Closed|Closed.*same-thread-only/i.test(sentence)
  && !hasNegation(sentence)
), "same-thread-only proof counted as full actual-user Closed");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /pre-created.*(?:actual-user|Closed|proof)|precreated.*(?:actual-user|Closed|proof)/i.test(sentence)
  && !hasNegation(sentence)
), "pre-created thread/call state counted as actual-user proof");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /inbox|search/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "inbox/search path Closed without installed evidence");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /normal profile|Profile path/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "normal profile path Closed without installed evidence");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /receiver elsewhere|elsewhere-in-app|app-wide incoming|in-app banner/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "receiver elsewhere-in-app Closed without installed-app banner evidence");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /\b(background|push|ringing)\b/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "background push/ringing Closed without installed-app evidence");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /video call|local video|remote video|fullscreen video/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !/v61 Google-signed responsive video call proof|Android two-phone installed responsive video layout proof as Closed|Android two-phone installed responsive layout/i.test(sentence)
  && !hasNegation(sentence)
), "video proof Closed without local/remote evidence on both phones");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /cleanup|active call state|stale.*state|end\/decline\/missed/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "call cleanup Closed without cleanup matrix evidence");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /logout|uninstall|reinstall|clear-data|clear data|sideload/i.test(sentence)
  && /happened|performed|used|executed/i.test(sentence)
  && !hasNegation(sentence)
), "forbidden device action");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /service-role|service role/i.test(sentence)
  && /chat.*proof|authority proof|counted/i.test(sentence)
  && !hasNegation(sentence)
), "service-role counted as chat proof");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /provider mutation|Google Play product|base-plan|RevenueCat|Stripe|provider dashboard|Play production|live-money|live money/i.test(sentence)
  && /happened|mutated|changed|applied|executed|submitted|enabled|turned on/i.test(sentence)
  && !hasNegation(sentence)
), "provider/live-money mutation claim");

forbidSentence("Google Play internal call proof doc", doc, (sentence) => (
  /auth|RLS|Premium|chat permission|account-status|staff permission/i.test(sentence)
  && /weakened|bypassed|disabled|turned off/i.test(sentence)
  && !hasNegation(sentence)
), "auth/RLS/chat/account-status permission weakening");

[
  ["Google Play internal proof doc", doc],
  ["chat lib", chatLib],
  ["call lib", callLib],
  ["notifications lib", notificationsLib],
  ["app layout", appLayout],
  ["chat inbox", inbox],
  ["chat thread", thread],
  ["profile", profile],
  ["settings", settings],
  ["user data", userData],
  ["call dispatch", callDispatch],
  ["direct thread repair migration", directThreadRepairMigration],
].forEach(([label, content]) => {
  forbidMatch(label, content, /\b(?:PASSWORD|PASSCODE)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i, "password value");
  forbidMatch(label, content, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
  forbidMatch(label, content, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
  forbidMatch(label, content, /https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");
});

[
  "throw new Error(\"Unable to start Chi'lly Chat call. The receiver-visible call state was not saved.\")",
  "throw new Error(\"Unable to start Chi'lly Chat call. The receiver invite could not be saved.\")",
  "await clearEndedChatThreadCall(thread.threadId).catch(() => null);",
  "await endCommunicationRoom(roomId).catch(() => null);",
].forEach((needle) => requireText("chat source failure handling", chatLib, needle));

[
  "readLatestRingingChillyChatCallInviteForCallee",
  "subscribeToIncomingChillyChatCallInvites",
  "filter: `callee_user_id=eq.${normalizedCalleeUserId}`",
].forEach((needle) => requireText("call invite realtime source", callLib, needle));

[
  "readLatestRingingChillyChatCallInviteForCallee",
  "subscribeToIncomingChillyChatCallInvites",
  "chilly_chat_call_invite",
  "app-wide-incoming-call-modal",
].forEach((needle) => requireText("app-wide receiver source", appLayout, needle));

[
  "getOrCreateDirectThread",
  "chat-search-suggestion-voice",
  "chat-search-suggestion-video",
  "openDirectThreadForPerson",
].forEach((needle) => requireText("inbox start-chat source", inbox, needle));

[
  "openOrRepairDirectThreadWithRpc",
  "get_or_create_direct_chat_thread",
  "return openOrRepairDirectThreadWithRpc(target);",
].forEach((needle) => requireText("direct thread open/create fallback source", chatLib, needle));

[
  "const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;",
  "await writeJsonValue(USER_PROFILE_KEY, remoteProfile);",
].forEach((needle) => requireText("profile cache freshness source", userData, needle));

requireText("settings handle cache source", settings, "await saveUserProfile(updatedProfile);");

[
  "Delivery status: push sent",
  "Delivery status: in-app banner available",
  "Delivery status: push unconfirmed",
  "Delivery status: receiver unavailable",
  "Delivery status: invite failed",
].forEach((needle) => requireText("caller delivery status source", thread, needle));

requireText("profile deep-link fallback", profile, "profile-unavailable-open-chat-search");
requireText("profile normal path", profile, "Voice Call");
requireText("profile normal path", profile, "Video Call");
requireText("call dispatch receiver unavailable", callDispatch, "blockedReason: \"account_access_restricted\"");
requireText("call invite RLS", callMigration, "alter table public.\"chat_call_invites\" enable row level security;");
requireText("call invite RLS", callMigration, "chat_call_invites_select_members");
requireText("call invite RLS", callMigration, "public.can_access_chat_thread(\"thread_id\")");
requireText("direct thread repair migration", directThreadRepairMigration, "create or replace function public.get_or_create_direct_chat_thread");
requireText("direct thread repair migration", directThreadRepairMigration, "auth.uid()::text");
requireText("direct thread repair migration", directThreadRepairMigration, "normalized_target_user_id = actor_user_id");
requireText("direct thread repair migration", directThreadRepairMigration, "public.is_platform_owner_user(normalized_target_user_id) and not public.is_current_platform_owner()");
requireText("direct thread repair migration", directThreadRepairMigration, "grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;");

forbidMatch("chat call migration", callMigration, /disable row level security/i, "RLS disablement");
forbidMatch("chat call migration", callMigration, /using\s*\(\s*true\s*\)/i, "allow-all RLS policy");
forbidMatch("chat call migration", callMigration, /with check\s*\(\s*true\s*\)/i, "allow-all RLS write policy");
forbidMatch("direct thread repair migration", directThreadRepairMigration, /disable row level security/i, "RLS disablement");
forbidMatch("direct thread repair migration", directThreadRepairMigration, /using\s*\(\s*true\s*\)/i, "allow-all RLS policy");
forbidMatch("direct thread repair migration", directThreadRepairMigration, /with check\s*\(\s*true\s*\)/i, "allow-all RLS write policy");
forbidMatch("direct thread repair migration", directThreadRepairMigration, /grant execute .*service_role/i, "service-role RPC grant");
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
  console.error("Chi'lly Chat Google Play internal call policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Chi'lly Chat Google Play internal call policy guard passed.");
console.log("- no v59 actual-user overclaim, same-thread-only closeout, pre-created proof, receiver/background/video/cleanup overclaim, device reset claim, permission weakening, service-role proof, secret exposure, provider mutation, or live-money activation was introduced.");
