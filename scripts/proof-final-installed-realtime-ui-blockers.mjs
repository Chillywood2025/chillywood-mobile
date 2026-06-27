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

const doc = read("docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md");
const twoClientDoc = read("docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md");
const packageJson = read("package.json");

[
  "Final installed realtime UI blockers: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "Two physical Play-internal v57 Android clients were used",
  "No physical phone sideload was used",
  "Live video participant visibility",
  "Chat call media",
  "Watch-Party sync",
  "Real simultaneous multi-user state",
  "Watch-Party installed UI proof",
  "Closed: both clients exposed the expected Watch-Party installed UI state",
  "Chat Call installed UI proof",
  "Partial: `chat_threads` insert remained RLS-denied",
  "Live installed UI proof",
  "Partial: `proof_premium_001` no longer showed the Premium gate",
  "Real simultaneous multi-user state: Partial",
  "Owner/Admin/Moderator realtime controls remain Closed",
  "Premium gates were not bypassed or weakened",
  "`chat_threads` RLS was not weakened",
  "No auth/account-status/chat permission bypass was added",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider mutation happened",
  "/tmp/app-final-installed-realtime-ui-blockers-20260627-110519/",
  "/tmp/app-final-installed-realtime-ui-blockers-participants-20260627-111028/",
].forEach((needle) => requireText("final installed realtime UI blockers doc", doc, needle));

[
  "Watch-Party sync: Closed",
  "Chat call media: Partial",
  "Live video participant visibility: Partial",
  "Real simultaneous multi-user state: Partial",
  "Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed",
].forEach((needle) => requireText("two-client installed app realtime UI proof doc", twoClientDoc, needle));

[
  "proof:final-installed-realtime-ui-blockers",
  "guard:final-installed-realtime-ui-blockers-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("final installed realtime UI blockers proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("final installed realtime UI blockers proof passed.");
console.log("- final blockers doc records Watch-Party installed UI closeout, honest Chat/Live Partial blockers, two physical Play-internal v57 devices, and safety boundaries.");
