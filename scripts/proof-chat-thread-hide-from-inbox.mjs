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

const forbidMatch = (label, content, pattern, reason) => {
  if (pattern.test(content)) failures.push(`${label} contains forbidden pattern (${reason})`);
};

const migration = read("supabase/migrations/20260629063526_chat_thread_hide_from_inbox.sql");
const types = read("supabase/database.types.ts");
const chatLib = read("_lib/chat.ts");
const inbox = read("app/chat/index.tsx");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const goNoGo = read("docs/FINAL_PUBLIC_USE_GO_NO_GO.md");
const checklist = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const releaseDoc = read("docs/release/CROSS_APP_PEOPLE_HANDLE_SEARCH_FIX.md");
const packageJson = read("package.json");

[
  "hidden_at",
  "hide_chat_thread_from_inbox",
  "unhide_chat_thread_for_me",
  "can_access_chat_thread",
  "\"thread_id\" = normalized_thread_id",
  "\"user_id\" = actor_user_id",
  "preserves shared thread/message/call history",
].forEach((needle) => requireText("migration", migration, needle));

[
  "hidden_at: string | null",
  "hidden_at?: string | null",
].forEach((needle) => requireText("database types", types, needle));

[
  "hiddenAt?: string",
  "isHiddenFromCurrentInbox",
  "lastMessageTime <= hiddenTime",
  "hideChatThreadFromInbox",
  "unhideChatThreadForMe",
  "hide_chat_thread_from_inbox",
  "unhide_chat_thread_for_me",
  "getOrCreateDirectThread",
  "await unhideChatThreadForMe",
].forEach((needle) => requireText("chat helper", chatLib, needle));

[
  "Delete from my inbox",
  "This removes the conversation from your inbox. It does not delete it for the other person.",
  "hideChatThreadFromInbox",
  "Couldn't remove this conversation right now. Please try again.",
  "Long-press a thread for profile, call, and inbox actions.",
  "setThreads((current) => current.filter((item) => item.threadId !== thread.threadId))",
].forEach((needle) => requireText("chat inbox", inbox, needle));

[
  ["CURRENT_STATE.md", currentState],
  ["NEXT_TASK.md", nextTask],
  ["ROADMAP.md", roadmap],
  ["FINAL_PUBLIC_USE_GO_NO_GO.md", goNoGo],
  ["FINAL_PRODUCTION_READINESS_CHECKLIST.md", checklist],
  ["CROSS_APP_PEOPLE_HANDLE_SEARCH_FIX.md", releaseDoc],
].forEach(([label, content]) => {
  [
    "Chi’lly Chat delete/hide conversation",
    "Delete from my inbox is a per-user hide, not a hard delete.",
    "The other participant’s copy is not deleted.",
    "Message and call history are preserved.",
    "Hidden direct threads must not create duplicate direct threads.",
    "Profile/Search → Chi’lly Chat must reopen the existing direct thread.",
    "Do not hide identity bugs by deleting rows.",
    "Proof Normal / @user230456 is a legitimate separate proof account/thread and may be hidden from the tester inbox without renaming or merging.",
    "Source fixed is not installed-app proof.",
    "Google Play internal install is not enough without actual user flow proof.",
    "installerPackageName",
    "com.android.vending",
    "Sideloaded APK proof is not accepted.",
    "No logout, uninstall, reinstall, or clear-data happened.",
    "No auth/RLS/chat/account-status permission weakening happened.",
    "No service-role chat/social proof was counted.",
    "No provider/live-money mutation happened.",
    "liveMoneyEnabled",
  ].forEach((needle) => requireText(label, content, needle));
  requireText(label, content, "OFF");
});

[
  "proof:chat-thread-hide-from-inbox",
  "guard:chat-thread-hide-from-inbox-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  ["chat helper", chatLib],
  ["chat inbox", inbox],
  ["migration", migration],
].forEach(([label, content]) => {
  forbidMatch(label, content, /delete\s+from\s+public\."?chat_threads/i, "hard-deleting chat threads");
  forbidMatch(label, content, /delete\s+from\s+public\."?chat_messages/i, "hard-deleting chat messages");
  forbidMatch(label, content, /delete\s+from\s+public\."?chat_call/i, "hard-deleting call records");
});

[
  ["chat helper", chatLib],
  ["chat inbox", inbox],
].forEach(([label, content]) => {
  forbidMatch(label, content, /service_role/i, "service-role use in app/client feature path");
});

if (failures.length) {
  console.error("Chat thread hide-from-inbox proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Chat thread hide-from-inbox proof passed.");
console.log("- per-user hidden_at state, inbox filtering, existing-thread reopen, UI confirmation, docs, and safety boundaries are present.");
