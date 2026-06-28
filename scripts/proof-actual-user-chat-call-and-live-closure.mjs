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

const standard = read("docs/release/ACTUAL_USER_PROOF_STANDARD.md");
const doc = read("docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md");
const packageJson = read("package.json");

[
  "Actual-user proof is Closed only when Robert or a normal tester can reproduce the behavior",
  "Pre-created thread/call state was not counted as actual-user Closed",
  "`chat_threads` RLS was not weakened",
  "Premium gates were not bypassed or weakened",
].forEach((needle) => requireText("actual-user proof standard", standard, needle));

[
  "Actual-user Chat Call proof: Partial",
  "Actual-user Live UI proof: Partial",
  "Real simultaneous multi-user state: Partial",
  "docs/release/ACTUAL_USER_PROOF_STANDARD.md",
  "chat-call prior proof limitation",
  "Manual call initiation/ringing path was tested through installed UI",
  "Pre-created thread/call state was not counted as actual-user Closed",
  "Receiver background push: Partial",
  "Scenario 1",
  "Scenario 2",
  "Scenario 3",
  "_lib/chat.ts",
  "_lib/chillyChatCalls.ts",
  "app/chat/[threadId].tsx",
  "app/_layout.tsx",
  "Backend",
  "Watch-Party installed UI proof remains Closed",
  "`chat_threads` RLS was not weakened",
  "Premium gates were not bypassed or weakened",
  "No service-role chat permission proof was used",
  "No auth/account-status/chat permission bypass was added",
  "No physical phone sideload was used",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider mutation happened",
  "No secrets/tokens/private data were committed or artifacted",
  "bc66e544-d7b8-44d7-8236-9957f378b95a",
].forEach((needle) => requireText("actual-user chat/live closure doc", doc, needle));

[
  "proof:actual-user-chat-call-and-live-closure",
  "guard:actual-user-chat-call-and-live-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("actual-user chat call and live closure proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("actual-user chat call and live closure proof passed.");
console.log("- proof document records the manual Chat Call limitation, code fixes, Partial installed-app results, and safety boundaries.");
