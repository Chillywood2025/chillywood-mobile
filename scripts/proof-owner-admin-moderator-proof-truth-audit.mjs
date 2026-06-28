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

const doc = read("docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md");
const actualUserStandard = read("docs/release/ACTUAL_USER_PROOF_STANDARD.md");
const seededAuthorityDoc = read("docs/admin/OWNER_ADMIN_MODERATOR_PRODUCTION_AUTHORITY_SEEDED_DEVICE_PROOF.md");
const packageJson = read("package.json");

[
  "Owner/Admin/Moderator Proof Truth Audit: Closed / Partial / Blocked",
  "Diagnostic/backend proof is not actual-user proof",
  "Service-role/bootstrap proof is not role-authority proof",
  "Owner RPC staff grant path is the authority proof where applicable",
  "Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists",
  "Current First Owner was not touched",
  "No real users were modified",
  "No auth/RLS/staff permission weakening happened",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "No accounts were created, recreated, or modified in this audit",
  "No service-role was used in this audit",
].forEach((needle) => requireText("truth audit doc", doc, needle));

[
  "Actual-user installed-app Closed",
  "App-backed RPC/backend Closed",
  "Backend readback only",
  "Diagnostic proof only",
  "Controlled seeded proof only",
  "Service-role/bootstrap only",
  "Provider/dashboard owner-confirmation required",
  "Partial",
  "Blocked",
  "Human review",
].forEach((needle) => requireText("truth audit classifications", doc, needle));

[
  "Owner role authority",
  "First Owner protection",
  "Admin/operator role scope",
  "Moderator role scope",
  "Support-workflow access",
  "Role hierarchy",
  "Staff grant/revoke",
  "Owner RPC staff grant path",
  "Normal-user admin denial",
  "Moderator denial from Admin/Owner tools",
  "Admin/operator denial from Owner/First Owner tools",
  "Admin Command Center UI",
  "Admin Search privacy",
  "Reporting/moderation queue",
  "Content takedown",
  "Live moderation",
  "Chat/call moderation",
  "Account restriction/suspension",
  "Legal/DMCA evidence handling",
  "Money admin authority",
  "Audit logging",
  "Break-glass/incident response",
  "Staff onboarding/offboarding",
  "Provider dashboard governance",
].forEach((needle) => requireText("truth audit scope/matrix", doc, needle));

[
  "Claims That Stay Closed",
  "Claims Downgraded Or Clarified",
  "Actual-User Installed-App Proof Items",
  "Backend/RPC Proof Items",
  "Service-Role And Bootstrap-Only Items",
  "Provider Dashboard Owner-Confirmation Items",
  "Remaining Actual-User Proof Gaps",
  "Safety Confirmation",
  "Next Action",
].forEach((needle) => requireText("truth audit sections", doc, needle));

[
  "A feature is not Closed for launch, tester readiness, or mass usage unless it is proved through the same path an actual installed-app user would use.",
  "Backend/RPC proof can support this claim, but installed UI proof is required before calling the real staff surface Closed.",
  "Any existing proof marked Closed must be downgraded to Partial, Diagnostic only, Harness only, Backend readback only, or Controlled seeded proof only if it does not prove the actual installed-app user path.",
].forEach((needle) => requireText("actual-user proof standard", actualUserStandard, needle));

[
  "Proof truth audit: `docs/release/OWNER_ADMIN_MODERATOR_PROOF_TRUTH_AUDIT.md` is the governing classification for this lane.",
  "Diagnostic/backend proof is not actual-user proof",
  "Service-role/bootstrap proof is not role-authority proof",
  "Provider dashboard MFA/access remains owner-confirmation-required unless sanitized evidence exists",
].forEach((needle) => requireText("seeded authority cross-reference", seededAuthorityDoc, needle));

[
  "proof:owner-admin-moderator-proof-truth-audit",
  "guard:owner-admin-moderator-proof-truth-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

if (failures.length) {
  console.error("Owner/Admin/Moderator proof truth audit proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Owner/Admin/Moderator proof truth audit proof passed.");
console.log("- truth audit doc exists and classifies actual-user, RPC/backend, diagnostic, seeded, service-role, and provider-confirmation evidence separately.");
console.log("- service-role/bootstrap evidence is not counted as role-authority proof.");
console.log("- provider dashboard MFA/access remains owner-confirmation-required.");
