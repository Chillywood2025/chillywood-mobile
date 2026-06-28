#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`guard:owner-admin-command-center-ui-policy failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) fail(`missing ${label}: ${needle}`);
};
const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) fail(`forbidden ${label}: ${needle}`);
};

const adminUi = read("app/admin.tsx");
const doc = read("docs/admin/OWNER_ADMIN_COMMAND_CENTER_PRODUCTION_UI.md");
const packageJson = read("package.json");

assertIncludes(doc, "Owner/Admin Command Center UI: Closed", "closed command center doc");
assertIncludes(doc, "Single Command Center entry point", "single entry point");
assertIncludes(doc, "Admin UI is production-labeled", "production-labeled rule");
assertIncludes(doc, "Unavailable tools open active setup/status/resolution, support/review, or access-status flows.", "active unavailable rule");
assertIncludes(doc, "Dangerous actions require confirmation", "confirmation rule");
assertIncludes(doc, "Destructive/sensitive actions require reason and audit where supported", "reason audit rule");
assertIncludes(doc, "Admin search results are privacy-safe and limited/paginated", "search privacy rule");
assertIncludes(doc, "Admin UI fails closed if backend functions are unavailable", "backend unavailable fail closed rule");
assertIncludes(doc, "Admin UI does not show raw backend errors", "raw error rule");
assertIncludes(doc, "Admin UI does not expose service-role-only concepts", "service-role concept rule");
assertIncludes(doc, "Admin UI does not expose raw storage paths, signed URLs, private provider IDs, token values, raw IPs, secrets, tax IDs, or bank details", "private exposure rule");
assertIncludes(doc, "Money/provider/payout actions open active readiness/status/manual/external review flows.", "money active readiness rule");

for (const phrase of [
  "Operator center",
  "Chi'llywood Operator Center",
  "Support role",
  "not wired",
  "provider proof",
  "schema truth",
]) {
  assertNotIncludes(adminUi, phrase, `forbidden production UI copy ${phrase}`);
}

for (const phrase of [
  "Alert.alert(",
  "Confirm",
  "Reason required",
  "OwnerDisabledReason",
  "formatAdminOperationFailure",
  "maskOperatorIdentity",
  "ADMIN_SEARCH_MIN_LENGTH",
  "slice(0,",
  "No provider secrets, checkout, transfer, withdrawal, payout, balance, or live-money movement is created",
]) {
  assertIncludes(adminUi, phrase, `Command Center safety marker ${phrase}`);
}

for (const script of [
  "proof:owner-admin-command-center-ui",
  "guard:owner-admin-command-center-ui-policy",
]) {
  assertIncludes(packageJson, script, `package script ${script}`);
}

console.log("guard:owner-admin-command-center-ui-policy passed");
