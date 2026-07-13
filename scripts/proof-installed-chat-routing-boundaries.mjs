#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const chat = read("app/chat/index.tsx");
const accountAccess = read("_lib/accountAccess.ts");
const migration = read("supabase/migrations/20260624171153_wave5_1_account_access_restrictions.sql");
const chatReadGateMigration = read("supabase/migrations/20260628223956_chilly_chat_direct_member_platform_owner_thread_readback.sql");

[
  "testID=\"chat-inbox-screen\"",
  "testID=\"chat-search-input\"",
  "readAccountAccessStatus(user.id)",
  "accountStatus?.restricted",
  "setRestrictedAccess(accountStatus)",
  "testID=\"chat-access-restricted-state\"",
  "This account is restricted or suspended",
  "are denied right now",
  "chat-access-restricted-support-button",
].forEach((needle) => requireText("chat route", chat, needle));

if (chat.indexOf("accountStatus?.restricted") > chat.indexOf("const nextThreads = await listChatThreads()")) {
  failures.push("chat route must check account restriction before loading inbox threads");
}

[
  "account_access_status_readback",
  "p_user_id",
  "restricted: toBoolean",
  "scheduledDeletion: toBoolean",
  "authSuspended: toBoolean",
].forEach((needle) => requireText("account access helper", accountAccess, needle));

[
  "create or replace function public.\"account_access_status_readback\"",
  "v_actor <> v_target",
  "grant execute on function public.\"account_access_status_readback\"(text) to authenticated, service_role",
].forEach((needle) => requireText("account access migration", migration, needle));

[
  "create or replace function public.can_access_chat_thread",
  "and not public.\"is_account_access_restricted\"(actor.user_id)",
  "where public.\"is_account_access_restricted\"(other_member.\"user_id\")",
].forEach((needle) => requireText("chat read gate migration", chatReadGateMigration, needle));

[
  "admin-main-tab",
  "manualPremiumGrant",
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
].forEach((needle) => forbidText("chat route", chat, needle));

if (failures.length) {
  console.error("proof:installed-chat-routing-boundaries failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:installed-chat-routing-boundaries passed");
console.log("- normal /chat keeps chat-inbox-screen and chat-search-input markers.");
console.log("- restricted /chat checks backed self account-status before rendering the inbox and shows explicit denied/support copy.");
