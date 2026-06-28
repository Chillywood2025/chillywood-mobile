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

const doc = read("docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md");
const packageJson = read("package.json");

[
  "Two-client installed-app realtime UI proof: Closed / Partial / Blocked",
  "Final verdict: Partial under `docs/release/ACTUAL_USER_PROOF_STANDARD.md`.",
  "Actual-user correction",
  "R3CXA0DS5JV",
  "R5CR120QCBF",
  "com.chillywood.mobile",
  "versionCode `57`",
  "com.android.vending",
  "Two physical Play-internal v57 Android clients were used",
  "R3CXA0DS5JV and R5CR120QCBF were both active clients",
  "Watch-Party realtime callback remains Closed",
  "Diagnostic sideloaded emulator is not accepted as Play-internal UI proof",
  "Live video participant visibility",
  "Live video participant visibility: Partial",
  "Chat call media",
  "Chat call media: Partial",
  "Watch-Party sync",
  "Watch-Party sync: Closed",
  "Real simultaneous multi-user state",
  "Real simultaneous multi-user state: Partial",
  "Owner/Admin/Moderator realtime controls",
  "Owner/Admin/Moderator realtime controls: Closed",
  "Matrix totals: 6 Closed, 3 Partial, 0 Blocked, 0 Failed under the actual-user correction.",
  "/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317/",
  "/tmp/app-final-live-chat-installed-realtime-ui-closure-20260627-170821/",
  "No sideload was used on either physical tester phone",
  "No uninstall/reinstall/clear-data happened",
  "No Play production submission happened",
  "No provider mutation happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
].forEach((needle) => requireText("two-client installed app realtime UI proof doc", doc, needle));

[
  "proof:two-client-installed-app-realtime-ui",
  "guard:two-client-installed-app-realtime-ui-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("two-client installed app realtime UI proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("two-client installed app realtime UI proof passed.");
console.log("- proof document records two Play-internal v57 clients, launch preflight, actual-user Partial Chat/Live status, and safety boundaries.");
