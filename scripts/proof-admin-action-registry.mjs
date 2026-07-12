#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing ${needle}`);
};

const registry = read("_lib/adminActionRegistry.ts");
const admin = read("app/admin.tsx");
const pkg = read("package.json");

const testIdMatches = [
  ...admin.matchAll(/testID=\"([^\"]+)\"/g),
  ...admin.matchAll(/testID=\\{`([^`]+)`\\}/g),
].map((match) => match[1]);

const ignoredPatterns = [
  /-section$/,
  /-status$/,
  /-input$/,
  /-summary$/,
  /-notice$/,
  /-panel$/,
  /-results$/,
  /-chips$/,
  /-history$/,
  /-findings$/,
  /-blocked-actions$/,
  /-required$/,
  /-list$/,
  /-modal$/,
  /-state$/,
  /-copy$/,
  /-proof-report$/,
  /-risk-level$/,
  /-target-systems$/,
  /-blockers$/,
  /-request-card$/,
  /-event-history$/,
  /-rollback-plan$/,
  /-proof-plan$/,
  /-risk-summary$/,
  /each-section-/,
  /^money-/,
  /^observability-/,
];

const actionLike = [...new Set(testIdMatches)].filter((id) => (
  !ignoredPatterns.some((pattern) => pattern.test(id))
  && (
    id.includes("button")
    || id.includes("chip")
    || id.includes("main-tab")
    || id.includes("target-${")
    || id.includes("permission-${")
    || id.includes("recent-${")
  )
));

for (const testId of actionLike) {
  if (!registry.includes(testId)) failures.push(`admin action registry missing visible action testID: ${testId}`);
}

for (const field of [
  "actionId",
  "route",
  "section",
  "label",
  "testId",
  "backing",
  "requiredRoles",
  "requiredRoleAction",
  "approvalLevel",
  "reasonRequired",
  "auditRequired",
  "expectedDenialCopy",
  "expectedSuccessCopy",
  "ownerApprovalRequired",
  "externalConfirmationRequired",
  "directExecutionAllowed",
]) requireText("admin action registry field", registry, field);

for (const forbiddenAction of [
  "manual_premium_grant",
  "payout_release",
  "payout_mark_paid",
  "send_money",
  "production_ota_publish_direct",
  "auth_rls_mutation_without_approval",
  "broad_push_campaign_direct",
]) requireText("forbidden action registry", registry, forbiddenAction);

for (const script of [
  "proof:owner-admin-moderator-tap-matrix",
  "proof:admin-action-registry",
  "proof:moderator-autonomous-boundaries",
  "guard:owner-admin-moderator-tap-policy",
  "guard:admin-action-registry",
  "guard:moderator-autonomous-boundaries",
]) requireText("package scripts", pkg, `"${script}"`);

if (failures.length) {
  console.error("proof:admin-action-registry failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:admin-action-registry passed");
