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

const doc = read("docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md");
const packageJson = read("package.json");

[
  "25 seeded participants realtime proof: Closed / Partial / Blocked",
  "At least two active clients are required for realtime proof",
  "Seeded accounts are identities; active clients prove simultaneous behavior",
  "Participant Pack",
  "Devices / Active Clients",
  "Live Video Proof",
  "Chat Call Media Proof",
  "Watch-Party Sync Proof",
  "Simultaneous Multi-User State Proof",
  "Owner/Admin/Moderator Realtime Controls",
  "Blocked / Restricted Behavior",
  "proof_participant_001@chillywood.test",
  "proof_participant_025@chillywood.test",
  "proof_creator_001@chillywood.test",
  "proof_moderator_001@chillywood.test",
  "proof_admin_operator_001@chillywood.test",
  "proof_owner_001@chillywood.test",
  "proof_premium_001@chillywood.test",
  "proof_nonpremium_001@chillywood.test",
  "proof_blocked_a_001@chillywood.test",
  "proof_blocked_b_001@chillywood.test",
  "proof_restricted_001@chillywood.test",
  "emulator-5554",
  "versionCode `55`",
  "versionCode `57`",
  "No sideload was used",
  "No service-role was used as role/permission authority proof",
  "Current First Owner was not touched",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider mutation happened",
  "No LiveKit tokens, push tokens, signed URLs, raw IPs, secrets, private messages, or private evidence were exposed",
  "Partial: full installed-app two-phone UI traversal still required",
].forEach((needle) => requireText("25 seeded participants realtime proof doc", doc, needle));

[
  "proof:25-seeded-participants-realtime",
  "guard:25-seeded-participants-realtime-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

for (let i = 1; i <= 25; i += 1) {
  const n = String(i).padStart(3, "0");
  requireText("25 seeded participants realtime proof doc", doc, `proof_participant_${n}@chillywood.test`);
}

if (failures.length) {
  console.error("25 seeded participants realtime proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("25 seeded participants realtime proof passed.");
console.log("- proof document lists the participant pack, device/client state, realtime results, honest Partial blocker, and required safety boundaries.");
