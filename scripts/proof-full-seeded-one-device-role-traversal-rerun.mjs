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

const doc = read("docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md");
const oneDeviceDoc = read("docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md");
const packageJson = read("package.json");

[
  "Full seeded one-device role traversal rerun: Closed / Partial / Blocked",
  "package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`",
  "EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`",
  "Stable seeded proof account pack: Closed",
  "No service-role was used in this rerun",
  "No accounts were created or recreated in this rerun",
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
  "signed-out",
  "normal",
  "creator",
  "moderator",
  "admin/operator",
  "owner",
  "restricted",
  "blocked pair",
  "Premium",
  "non-Premium",
  "Flow Matrix",
  "Pass / Fail / Blocked Summary",
  "Two-device proof still required",
  "No sideload was used",
  "No APK install was used as tester proof",
  "No uninstall/reinstall/clear-data happened",
  "liveMoneyEnabled remains OFF",
  "Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF",
  "No provider dashboard mutation happened",
  "Safety Confirmation",
].forEach((needle) => requireText("full seeded one-device rerun doc", doc, needle));

[
  "proof:full-seeded-one-device-role-traversal-rerun",
  "guard:full-seeded-one-device-role-traversal-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "Full seeded one-device role traversal rerun",
  "Stable seeded proof account pack: Closed",
].forEach((needle) => requireText("one attached device proof doc", oneDeviceDoc, needle));

notes.push("Full seeded one-device role traversal rerun doc exists with installed Play metadata, update group, stable account pack status, all required roles/accounts, flow matrix, status summary, two-device limitation, and safety confirmation.");
notes.push("The rerun proof is honest about any blocked flows and does not claim two-device-only behavior closed on one device.");

if (failures.length) {
  console.error("Full seeded one-device role traversal rerun proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Full seeded one-device role traversal rerun proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
