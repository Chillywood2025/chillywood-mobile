#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing ${needle}`);
};
const forbidRegex = (label, source, pattern, detail) => {
  if (pattern.test(source)) failures.push(`${label} contains forbidden ${detail}`);
};

const registry = read("_lib/adminActionRegistry.ts");
const matrix = read("_lib/platformRoleActionMatrix.ts");
const admin = read("app/admin.tsx");

for (const required of [
  "ADMIN_ACTION_REGISTRY",
  "FORBIDDEN_ACTIVE_ADMIN_ACTIONS",
  "ADMIN_TEST_ID_ALIASES",
  "requiredRoleAction",
  "approvalLevel",
  "reasonRequired",
  "auditRequired",
  "expectedDenialCopy",
  "directExecutionAllowed",
]) requireText("admin action registry", registry, required);

for (const required of [
  "PLATFORM_ROLE_ACTION_MATRIX",
  "PLATFORM_ROLE_ACTION_DENIALS",
  "canRolePerformAction",
  "getDeniedRoleActionCopy",
]) requireText("role action matrix", matrix, required);

for (const required of [
  "admin-role-action-contract-section",
  "admin-action-registry-status",
  "admin-role-action-denial-copy",
  "admin-high-risk-blocked-actions",
]) requireText("admin UI contract panel", admin, required);

forbidRegex("registry", registry, /manual_premium_grant[\s\S]{0,400}status:\s*"live"/i, "active manual Premium grant");
forbidRegex("registry", registry, /payout_release[\s\S]{0,400}status:\s*"live"/i, "active payout release");
forbidRegex("registry", registry, /production_ota_publish_direct[\s\S]{0,400}status:\s*"live"/i, "active direct OTA publish");
forbidRegex("registry", registry, /auth_rls_mutation_without_approval[\s\S]{0,400}status:\s*"live"/i, "active direct auth/RLS mutation");
forbidRegex("registry", registry, /broad_push_campaign_direct[\s\S]{0,400}status:\s*"live"/i, "active broad push campaign");
forbidRegex("admin UI", admin, /testID="(?:manual-premium-grant|payout-release|mark-paid|send-money|publish-ota|rollback-ota|broad-push-campaign)-button"/i, "unsafe active button testID");

if (failures.length) {
  console.error("guard:admin-action-registry failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("guard:admin-action-registry passed");
