#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const add = (key, ok, detail) => checks.push({ key, ok: Boolean(ok), detail });
const hasAll = (haystack, needles) => needles.every((needle) => haystack.includes(needle));
const hasNone = (haystack, needles) => needles.every((needle) => !haystack.includes(needle));

const files = {
  adminUi: "app/admin.tsx",
  adminDoc: "docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md",
  adminScope: "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  firstOwner: "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  hierarchy: "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  moderator: "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  packageJson: "package.json",
};

const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, exists(file) ? read(file) : ""]));
const visibleText = text.adminUi
  .replace(/type\s+OperatorTabKey[\s\S]+?;/g, "")
  .replace(/const\s+operatorTabs[\s\S]+?];/g, "");

const forbiddenVisibleCopy = [
  "Operator center",
  "Chi'llywood Operator Center",
  "Support role",
  "not wired",
  "provider proof",
  "schema truth",
  "raw backend error",
  "service-role key is visible",
  "signed URL:",
  "raw storage path:",
  "private provider id:",
  "token value:",
  "raw IP:",
  "tax id:",
  "bank details:",
];

const requiredScripts = [
  "proof:owner-admin-command-center-ui",
  "guard:owner-admin-command-center-ui-policy",
  "proof:staff-role-hierarchy",
  "guard:staff-role-hierarchy-policy",
  "proof:admin-role-scope",
  "guard:admin-role-scope-policy",
  "proof:moderator-role-scope",
  "guard:moderator-role-scope-policy",
  "proof:first-owner-authority",
  "guard:first-owner-authority-policy",
];

add("doc_exists", text.adminDoc.includes("Owner/Admin Command Center UI: Closed"), "Command Center production UI doc exists and is closed.");
add("single_entry", hasAll(text.adminDoc + text.adminUi, ["Single Command Center entry point", "/admin", "Admin Command Center"]), "Single /admin Command Center entry point is documented and present.");
add("production_labels", hasAll(text.adminDoc, ["Admin UI is production-labeled", "Unavailable tools are hidden or honestly disabled"]) || hasAll(text.adminDoc, ["production-labeled", "honestly disabled"]), "Production-label and unavailable-tool rules are documented.");
add("operator_not_product", hasAll(text.hierarchy + text.adminDoc, ["operator is the internal/backend alias for Admin", "Admin is the product-facing"]) && !visibleText.includes("Operator center"), "Operator remains internal and product UI says Admin.");
add("support_not_role", hasAll(text.adminDoc + text.hierarchy, ["Support is a work area", "not a staff role"]) && !visibleText.includes("Support role"), "Support remains workflow/permission area, not role UI.");
add("danger_confirmation", hasAll(text.adminUi + text.adminDoc, ["Confirm", "confirmation", "Dangerous actions require confirmation"]), "Dangerous action confirmation markers exist.");
add("reason_required", hasAll(text.adminUi + text.adminDoc, ["Reason required", "reason", "Destructive/sensitive actions require reason"]), "Reason-required markers exist.");
add("audit_readback", hasAll(text.adminUi + text.adminDoc, ["audit", "readback", "Audit / Readback Behavior"]), "Audit/readback behavior is present.");
add("fail_closed", hasAll(text.adminUi + text.adminDoc, ["fail closed", "Unable to", "Admin UI fails closed"]), "Fail-closed behavior is documented and represented.");
add("safe_errors", hasAll(text.adminUi + text.adminDoc, ["formatAdminOperationFailure", "Admin UI does not show raw backend errors"]), "Sanitized backend error path is present.");
add("search_privacy", hasAll(text.adminUi + text.adminDoc, ["ADMIN_SEARCH_MIN_LENGTH", "Search / Filter Privacy", "masked email/identity display"]) && hasAll(text.adminUi, ["slice(0,", "maskOperatorIdentity"]), "Search/filter privacy and bounded result markers exist.");
add("disabled_markers", hasAll(text.adminUi + text.adminDoc, ["OwnerDisabledReason", "Unavailable", "honestly disabled"]), "Disabled/unavailable tool markers exist.");
add("no_forbidden_visible_copy", hasNone(visibleText, forbiddenVisibleCopy), "Forbidden product-facing labels and raw secret exposure copy are absent.");
add("money_disabled", hasAll(text.adminDoc + text.adminUi, ["Money/provider/payout actions remain disabled/read-only/manual/external", "No provider secrets, checkout, transfer, withdrawal, payout, balance, or live-money movement is created"]), "Money/provider/payout actions remain disabled/read-only/manual/external.");
add("role_guard_refs", requiredScripts.every((script) => text.packageJson.includes(script)), "Command Center plus role proof/guard package scripts are wired.");

const failed = checks.filter((check) => !check.ok);
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = process.env.OWNER_ADMIN_COMMAND_CENTER_ARTIFACT_DIR || path.join("/tmp", `app-owner-admin-command-center-ui-proof-${timestamp}`);
fs.mkdirSync(artifactDir, { recursive: true });

fs.writeFileSync(path.join(artifactDir, "README.md"), [
  "# Owner/Admin Command Center UI Proof",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Passed: ${checks.length - failed.length}`,
  `Failed: ${failed.length}`,
  "",
  ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.key}: ${check.detail}`),
  "",
  "Safety: static repo proof only; no provider/dashboard/database mutation.",
  "",
].join("\n"));

console.log(JSON.stringify({ artifact: artifactDir, failed: failed.length, passed: checks.length - failed.length, total: checks.length }, null, 2));

if (failed.length) {
  for (const check of failed) console.error(`FAIL ${check.key}: ${check.detail}`);
  process.exit(1);
}
