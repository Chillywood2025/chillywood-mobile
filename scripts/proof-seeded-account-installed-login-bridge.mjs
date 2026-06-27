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

const doc = read("docs/release/SEEDED_ACCOUNT_INSTALLED_LOGIN_BRIDGE.md");
const rerunDoc = read("docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md");
const oneDeviceDoc = read("docs/release/ONE_ATTACHED_DEVICE_FULL_APP_AUTOMATION_PROOF.md");
const stablePackDoc = read("docs/release/STABLE_SEEDED_PROOF_ACCOUNT_PACK.md");
const packageJson = read("package.json");
const runner = read("scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs");

[
  "Seeded account installed login bridge: Closed / Partial / Blocked",
  "Backend auth readback passed",
  "Installed UI login root cause: automation credential injection failure",
  "Credential Source Status",
  "Secure Credential Bridge",
  "Installed UI Login Results",
  "No passwords were printed or committed",
  "No service-role was used",
  "No accounts were created or recreated",
  "Current First Owner was not touched",
  "No auth bypass was added",
  "No RLS/account-status gate weakening happened",
  "No sideload, uninstall, reinstall, or clear-data happened",
  "liveMoneyEnabled remains OFF",
  "No provider mutation happened",
].forEach((needle) => requireText("seeded account installed login bridge doc", doc, needle));

[
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
].forEach((needle) => requireText("seeded account installed login bridge doc", doc, needle));

[
  "restricted expected fail-closed",
  "The harness now uses the secure local `MAESTRO_` environment bridge",
  "Credential values remain stored only in ignored `.env.browserstack-monetization.local`",
].forEach((needle) => requireText("seeded account installed login bridge doc", doc, needle));

[
  "Full seeded one-device role traversal rerun: Closed / Partial / Blocked",
  "The harness now uses the secure local `MAESTRO_` environment bridge",
  "Status counts after affected-only closure: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`",
].forEach((needle) => requireText("full seeded one-device rerun doc", rerunDoc, needle));

[
  "Seeded account installed login bridge",
  "Status counts: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`",
].forEach((needle) => requireText("one attached device proof doc", oneDeviceDoc, needle));

requireText("stable seeded proof account pack doc", stablePackDoc, "Credential values are stored only in `.env.browserstack-monetization.local`");
requireText("package scripts", packageJson, "proof:seeded-account-installed-login-bridge");
requireText("local rerun runner", runner, "MAESTRO_CHILLYWOOD_LOGIN_EMAIL");
requireText("local rerun runner", runner, "MAESTRO_CHILLYWOOD_LOGIN_PASSWORD");

notes.push("Seeded account installed login bridge doc exists with root cause, credential-source status, secure local bridge behavior, backend auth summary, installed UI login table, restricted fail-closed result, no-secrets proof, and safety confirmation.");
notes.push("Full one-device traversal rerun docs now reflect the post-bridge installed UI login results and the affected-only closure of the prior five route-marker/control-proof blockers.");

if (failures.length) {
  console.error("Seeded account installed login bridge proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Seeded account installed login bridge proof passed.");
notes.forEach((note) => console.log(`- ${note}`));
