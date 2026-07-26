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

const hasNegation = (sentence) => /\b(no|not|never|without|cannot|can't|must not|is not|are not|was not|were not|did not|do not|does not|pending|Partial|Blocked|could not|unless|requires|required|unavailable|not proved|not confirmed|not counted|not actual-user|remain Partial|Source fixed is not installed-app proof)\b/i.test(sentence);

const forbidSentence = (label, content, predicate, description) => {
  for (const sentence of sentences(content)) {
    if (predicate(sentence)) fail(`${label} contains forbidden ${description}: "${sentence.slice(0, 260)}"`);
  }
};

const doc = read("docs/release/CHILLY_CHAT_END_TO_END_CALL_INITIATION_PROOF.md");
const chatLib = read("_lib/chat.ts");
const callLib = read("_lib/chillyChatCalls.ts");
const notificationsLib = read("_lib/notifications.ts");
const appLayout = read("app/_layout.tsx");
const inbox = read("app/chat/index.tsx");
const thread = read("app/chat/[threadId].tsx");
const profile = read("app/profile/[userId].tsx");
const callDispatch = read("supabase/functions/chilly-chat-call-dispatch/index.ts");
const callDeliveryCopy = read("_lib/chillyChatCallDeliveryCopy.ts");
const featureFlags = read("_lib/featureFlags.ts");
const moneyFlags = read("_lib/moneyFeatureFlags.ts");
const callMigration = read("supabase/migrations/202606100001_chilly_chat_call_invites_and_ringtones.sql");

[
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
].forEach((needle) => requireText("end-to-end proof doc", doc, needle));

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /same-thread.*(?:full|actual-user).*Closed|Closed.*same-thread-only/i.test(sentence)
  && !hasNegation(sentence)
), "same-thread-only proof counted as full actual-user Closed");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /pre-created.*(?:actual-user|Closed|proof)|precreated.*(?:actual-user|Closed|proof)/i.test(sentence)
  && !hasNegation(sentence)
), "pre-created thread/call state counted as actual-user proof");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /receiver elsewhere|elsewhere in app|app-wide incoming/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "receiver elsewhere-in-app Closed without installed-app evidence");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /background|push|ringing/i.test(sentence)
  && /\bClosed\b/i.test(sentence)
  && !hasNegation(sentence)
), "background push/ringing Closed without installed-app evidence");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /Profile unavailable|deep-link profile unavailable/i.test(sentence)
  && /normal.*profile.*broken|all Chat proof.*blocked|proves normal.*profile/i.test(sentence)
  && !hasNegation(sentence)
), "deep-link unavailable state treated as normal in-app profile breakage");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /service-role|service role/i.test(sentence)
  && /chat.*proof|authority proof|counted/i.test(sentence)
  && !hasNegation(sentence)
), "service-role counted as chat proof");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /provider mutation|Google Play product|base-plan|RevenueCat|Stripe|provider dashboard|Play production|live-money|live money/i.test(sentence)
  && /happened|mutated|changed|applied|executed|submitted|enabled|turned on/i.test(sentence)
  && !hasNegation(sentence)
), "provider/live-money mutation claim");

forbidSentence("end-to-end proof doc", doc, (sentence) => (
  /auth|RLS|Premium|chat permission|account-status|staff permission/i.test(sentence)
  && /weakened|bypassed|disabled|turned off/i.test(sentence)
  && !hasNegation(sentence)
), "auth/RLS/chat/account-status permission weakening");

[
  ["proof doc", doc],
  ["chat lib", chatLib],
  ["call lib", callLib],
  ["notifications lib", notificationsLib],
  ["app layout", appLayout],
  ["chat inbox", inbox],
  ["chat thread", thread],
  ["profile", profile],
  ["call dispatch", callDispatch],
].forEach(([label, content]) => {
  forbidMatch(label, content, /(PASSWORD|PASSCODE)\s*=\s*['"]?[^<\s][^\s]{8,}/i, "password value");
  forbidMatch(label, content, /(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*=\s*['"]?[A-Za-z0-9._-]{20,}/, "service-role key value");
  forbidMatch(label, content, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT/token");
  forbidMatch(label, content, /https?:\/\/[^\s)]*[?&](?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)=[^\s)]*/i, "signed URL");
  forbidMatch(label, content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "raw IP value");
});

if (!chatLib.includes("beginChillyChatCall") || !chatLib.includes("dispatchChillyChatCallPush")) {
  fail("chat source must atomically reserve receiver-visible thread/invite state before dispatch");
}
if (!chatLib.includes("throw new Error(\"Unable to start Chi'lly Chat call. The receiver invite could not be saved.\")")) {
  fail("chat source must fail when receiver invite state is not saved");
}
if (!chatLib.includes("await endCommunicationRoom(roomId).catch(() => null);")) {
  fail("invite failure must end only the unclaimed candidate room");
}
if (/catch \(inviteError\)[\s\S]{0,400}clearEndedChatThreadCall/u.test(chatLib)) {
  fail("a losing simultaneous start must not clear the winning thread call state");
}
if (/catch\s*\([^)]*invite[^)]*\)\s*{[^}]*delivery\s*=\s*{/is.test(chatLib)) {
  fail("invite failure must not be swallowed into a fake delivery object");
}

[
  "readLatestRingingChillyChatCallInviteForCallee",
  "subscribeToIncomingChillyChatCallInvites",
  "filter: `callee_user_id=eq.${normalizedCalleeUserId}`",
].forEach((needle) => requireText("call invite realtime source", callLib, needle));

[
  "readLatestRingingChillyChatCallInviteForCallee",
  "subscribeToIncomingChillyChatCallInvites",
  "chilly_chat_call_invite",
  "app-wide-incoming-call-banner",
].forEach((needle) => requireText("app-wide receiver source", appLayout, needle));
requireText("app-wide receiver source", appLayout, "presentation === \"native_background\"");
requireText("same-thread receiver source", thread, "chat-thread-incoming-call-banner");
requireText("same-thread receiver source", thread, "result.role === \"callee\"");

[
  "getOrCreateDirectThread",
  "chat-search-suggestion-voice",
  "chat-search-suggestion-video",
  "openDirectThreadForPerson",
].forEach((needle) => requireText("inbox start-chat source", inbox, needle));

[
  "Android call alert sent.",
  "Native iPhone call alert sent.",
  "Push notification sent.",
  "Delivery status: in-app banner available",
  "Delivery status: push unconfirmed",
  "Delivery status: receiver unavailable",
  "Delivery status: invite failed",
].forEach((needle) => requireText("caller delivery status source", `${thread}\n${callDeliveryCopy}`, needle));

requireText("profile deep-link fallback", profile, "profile-unavailable-open-chat-search");
requireText("profile normal path", profile, "Voice Call");
requireText("profile normal path", profile, "Video Call");
requireText("call dispatch receiver unavailable", callDispatch, "blockedDispatch(\"account_access_restricted\")");
if (!/return jsonResponse\(200,\s*blockedDispatch\("account_access_restricted"\)\)/.test(callDispatch)) {
  fail("account restricted call dispatch must report receiver unavailable without turning into a generic invoke failure");
}
if (!/const blockedDispatch = \(reason: string\) => buildBlockedChillyChatCallDispatch\(reason\)/.test(callDispatch)) {
  fail("account restricted call dispatch must return an explicit receiver-unavailable blocked result");
}

requireText("call invite RLS", callMigration, "alter table public.\"chat_call_invites\" enable row level security;");
requireText("call invite RLS", callMigration, "chat_call_invites_select_members");
requireText("call invite RLS", callMigration, "public.can_access_chat_thread(\"thread_id\")");
forbidMatch("chat call migration", callMigration, /disable row level security/i, "RLS disablement");
forbidMatch("chat call migration", callMigration, /using\s*\(\s*true\s*\)/i, "allow-all RLS policy");
forbidMatch("chat call migration", callMigration, /with check\s*\(\s*true\s*\)/i, "allow-all RLS write policy");
forbidMatch("mobile chat/call sources", `${chatLib}\n${callLib}\n${notificationsLib}\n${appLayout}\n${inbox}\n${thread}\n${profile}`, /service_role|SUPABASE_SERVICE_ROLE/i, "service-role mobile use");

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
  console.error("Chi'lly Chat end-to-end call initiation policy guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Chi'lly Chat end-to-end call initiation policy guard passed.");
console.log("- no same-thread-only closeout, pre-created proof, receiver/background overclaim, invite swallowing, permission weakening, service-role proof, secret exposure, provider mutation, or live-money activation was introduced.");
