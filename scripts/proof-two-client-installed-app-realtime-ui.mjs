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
  "Final verdict: Partial",
  "R3CXA0DS5JV",
  "R5CR120QCBF",
  "com.chillywood.mobile",
  "versionCode `57`",
  "com.android.vending",
  "Two active Play-internal v57 Android clients",
  "Diagnostic sideloaded emulator is not accepted as Play-internal UI proof",
  "Live video participant visibility",
  "Chat call media",
  "Watch-Party sync",
  "Real simultaneous multi-user state",
  "Owner/Admin/Moderator realtime controls",
  "/tmp/app-two-client-installed-app-realtime-ui-proof-20260627132200/",
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
console.log("- proof document records two Play-internal v57 clients, launch preflight, honest Partial status, and safety boundaries.");
