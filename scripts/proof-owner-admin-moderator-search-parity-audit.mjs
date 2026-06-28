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

const doc = read("docs/release/OWNER_ADMIN_MODERATOR_SEARCH_PARITY_AUDIT.md");
const packageJson = read("package.json");
const admin = read("app/admin.tsx");
const adminReadModels = read("_lib/adminReadModels.ts");
const helper = read("_lib/peopleSearchNormalization.ts");
const adminGovernance = read("docs/admin/ADMIN_SEARCH_PRIVACY_EXPORT_GOVERNANCE.md");
const commandCenterDoc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");

[
  "Owner/Admin/Moderator search parity audit: Closed / Partial / Blocked",
  "Owner/Admin/Moderator search parity audit: Partial",
  "Admin search is not public people search",
  "Handle search must work with and without @ where staff search is authorized",
  "Meaningful numbers like 92 must not be stripped",
  "Staff search must preserve scope, minimization, and audit",
  "No auth/RLS/staff permission weakening happened",
  "No private user data was exposed",
  "Service-role setup is not actual-user or staff-authority proof",
  "Current First Owner was not touched",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Surfaces Checked",
  "Was Admin/Moderator/Support Search Affected?",
  "Normalization Behavior",
  "Privacy / Scope / Audit Safety",
  "Actual-User/Admin-Facing Proof Classification",
  "Remaining Blockers",
  "Safety Confirmation",
].forEach((needle) => requireText("search parity audit doc", doc, needle));

[
  "proof:owner-admin-moderator-search-parity-audit",
  "guard:owner-admin-moderator-search-parity-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "getPrimaryPeopleSearchCandidate",
  "matchesPeopleSearchValues",
  "normalizePeopleSearchQuery",
  "rankPeopleSearchValues",
  "adminSearchCanUseScope",
  "availableAdminSearchScopes",
  "writeAdminSearchAudit",
  "Email lookup is admin-only",
  "Search users by name or @handle",
  "Backend-unavailable states appear in the audit card",
].forEach((needle) => requireText("admin search source", admin, needle));

[
  "normalizePeopleSearchQuery",
  "buildAdminUsersReadModelQueries",
  "get_admin_users_read_model",
  "mergeAdminUsersReadModels",
].forEach((needle) => requireText("admin read model source", adminReadModels, needle));

[
  "normalizePeopleSearchQuery",
  "alphaNumberBoundaryVariants",
  "$1.$2",
  "$1_$2",
  "$1-$2",
  "replace(/[^a-z0-9 ._-]+/g",
  "replace(/[^a-z0-9]+/g",
].forEach((needle) => requireText("people search normalization helper", helper, needle));

[
  "Admin search requires exact scope",
  "Non-admin and unscoped attempts are denied",
  "Searches are audited with masked query preview",
  "Search results are minimized",
  "Moderator does not see full email by default",
  "Admin can see full email only with exact scope",
  "Phone/device search is disabled by default",
  "Private chat/content evidence search requires exact scope and case/report/legal context",
].forEach((needle) => requireText("admin search governance doc", adminGovernance, needle));

[
  "Admin search results are privacy-safe",
  "Admin UI fails closed",
  "Admin UI does not show raw backend errors",
].forEach((needle) => requireText("command center governance doc", commandCenterDoc, needle));

if (failures.length) {
  console.error("Owner/Admin/Moderator search parity audit proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Owner/Admin/Moderator search parity audit proof passed.");
console.log("- staff/admin search parity, privacy/scope/audit boundaries, and actual-user proof limits are documented.");
