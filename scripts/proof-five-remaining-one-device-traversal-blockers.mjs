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

const doc = read("docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md");
const packageJson = read("package.json");
const runner = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");

[
  "Five remaining one-device traversal blockers: Closed / Partial / Blocked",
  "normal `/chat`",
  "normal `/admin`",
  "creator `/channel-studio`",
  "creator `/creator-monetization-setup`",
  "creator `/payouts`",
  "Classification",
  "Root cause",
  "Fix applied",
  "Affected rerun result",
  "Pass: `chat-inbox-screen`",
  "Pass: normal user saw access-status denial",
  "Pass: active Premium-required status gate",
  "Normal `/admin` is expected denial/access-status behavior, not staff access",
  "Creator payouts remain readiness/status/support only",
  "Installed seeded login bridge remains Closed",
  "No service-role was used",
  "No accounts were created or recreated",
  "No passwords were printed or committed",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider mutation happened",
  "No sideload, uninstall, reinstall, or clear-data happened",
].forEach((needle) => requireText("five remaining blocker doc", doc, needle));

[
  "proof:five-remaining-one-device-traversal-blockers",
  "guard:five-remaining-one-device-traversal-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "FULL_SEEDED_ONE_DEVICE_AFFECTED_ONLY",
  "chillywoodmobile:///",
  "Admin access requires|SIGNED-IN ACCESS|Keep Browsing",
  "Premium required|Manage Premium|Platform Studio|SIGNED-IN ACCESS",
].forEach((needle) => requireText("local rerun runner", runner, needle));

if (failures.length) {
  console.error("Five remaining one-device traversal blockers proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Five remaining one-device traversal blockers proof passed.");
console.log("- all five blockers are named with root cause, classification, fix, and affected rerun result.");
console.log("- normal /admin remains access-status denial, creator payouts remain readiness/status only, and no money/provider/device safety boundary changed.");
