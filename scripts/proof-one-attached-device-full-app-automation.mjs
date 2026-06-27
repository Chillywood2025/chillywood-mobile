#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const notes = [];

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

const doc = read("docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md");
const packageJson = read("package.json");

[
  "One attached device full app automation proof: Closed / Partial / Blocked",
  "Verdict for this lane: Closed for one-device route/control traversal",
  "package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`",
  "EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`",
  "Stable seeded proof account pack: Closed",
  "Seeded account installed login bridge",
  "Installed UI login passed for every non-restricted seeded proof account",
  "Seeded Account Readiness Table",
  "signed-out",
  "proof_normal_001",
  "proof_creator_001",
  "proof_moderator_001",
  "proof_admin_operator_001",
  "proof_owner_001",
  "proof_restricted_001",
  "proof_blocked_a_001",
  "proof_blocked_b_001",
  "proof_premium_001",
  "proof_nonpremium_001",
  "Flow Matrix",
  "Pass / Fail / Blocked Summary",
  "Status counts: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`",
  "Five prior route-marker/control-proof blockers are closed",
  "Two-device proof still required",
  "No sideload was used",
  "No uninstall/reinstall/clear-data happened",
  "No service-role was used in this rerun",
  "No accounts were created or recreated in this rerun",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider dashboard mutation happened",
  "Safety Confirmation",
].forEach((needle) => requireText("one attached device proof doc", doc, needle));

[
  "proof:one-attached-device-full-app-automation",
  "guard:one-attached-device-full-app-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

notes.push("One attached device proof doc records installed Play metadata, EAS update group, seeded account readiness, installed login bridge, flow matrix, affected blocker closure, two-device limitations, and safety confirmation.");
notes.push("The lane is Closed for one-device route/control traversal; two-device realtime proof remains separate.");

if (failures.length) {
  console.error("One attached device full app automation proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("One attached device full app automation proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
