#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const list = (command) => execSync(command, { cwd: root, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const docPath = "docs/FULL_APP_AUTHORITY_PRODUCT_BEHAVIOR_AUDIT.md";
if (!existsSync(path.join(root, docPath))) {
  console.error(`proof:full-app-authority-product-audit failed: missing ${docPath}`);
  process.exit(1);
}

const doc = read(docPath);
const packageJson = read("package.json");
const adminRegistry = read("_lib/adminActionRegistry.ts");
const adminRegistryDoc = read("docs/ADMIN_ACTION_REGISTRY.md");
const roleMatrix = read("_lib/platformRoleActionMatrix.ts");
const autonomousRegistry = read("_lib/autonomousSystemsRegistry.ts");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const ownerCommand = read("_lib/ownerCommandOperator.ts");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");

const appFiles = list("find app -type f | sort");
const functionFiles = list("find supabase/functions -maxdepth 2 -type f -name 'index.ts' | sort");

for (const file of appFiles) requireText("route inventory", doc, `\`${file}\``);
for (const file of functionFiles) {
  const functionName = file.split("/")[2];
  requireText("Edge Function inventory", doc, `\`${functionName}\``);
}

for (const phrase of [
  "source/guard sweep closed; installed role/device proof pending",
  "/admin is the only platform Admin Command Center",
  "Owner/super_admin remains final authority",
  "Level 3/4 actions require owner/super_admin approval",
  "Level 4 also requires external confirmation",
  "No direct UI or function path may move money",
  "UI Action / Tap Inventory Result",
  "Backend / Edge Function Inventory",
  "Feature Lane Classification",
  "Installed Proof Status",
]) requireText("full audit doc", doc, phrase);

for (const phrase of [
  "Manual Premium grant/edit",
  "Payout release, mark paid, transfer, cashout",
  "Production OTA publish/rollback without approval",
  "Auth/RLS/owner-role mutation without approval",
  "Broad push campaign without approval",
  "Direct ban/suspend/restrict/delete content",
  "Provider product/mode/dashboard mutation without approval",
  "LiveKit routing/stale cutoff/server registry mutation",
  "Broad media processing/backfill",
]) requireText("blocked classes", doc, phrase);

for (const phrase of [
  "manual Premium grant",
  "payout release",
  "production charge",
  "production OTA publish/rollback",
  "auth/RLS or owner-role mutation",
  "broad push campaign",
  "hidden enforcement",
]) requireText("admin action registry high-risk absence", `${adminRegistry}\n${adminRegistryDoc}`, phrase);

for (const phrase of [
  "canApproveAutonomousRequests",
  "canMoveMoney",
  "canGrantPremium",
  "canPublishOrRollbackRelease",
  "canMutateAuthRls",
  "canEnforceUserRestriction",
]) requireText("role matrix", roleMatrix, phrase);

for (const systemId of [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
  "owner_command_operator",
]) {
  requireText("autonomous registry", autonomousRegistry, `id: "${systemId}"`);
  requireText("full audit doc system", doc, systemId);
}

for (const phrase of [
  "AUTONOMOUS_APPROVAL_REQUESTER_ACTORS",
  "\"owner_command_operator\"",
  "operatorSelfApprovalAllowed: false",
  "executionRequiresFreshPreflight: true",
  "executionRequiresExactScopeMatch: true",
]) requireText("approval model", approvalModel, phrase);

for (const phrase of [
  "OwnerCommandTargetSystemId = Exclude<AutonomousSystemId, \"owner_command_operator\">",
  "approval_required",
  "external_confirmation_required",
  "owner_command_direct_db_mutation_forbidden",
]) requireText("owner command routing guard", ownerCommand, phrase);

for (const script of [
  "proof:full-app-authority-product-audit",
  "guard:full-app-authority-product-audit",
  "proof:every-visible-surface-active-wiring-audit",
  "proof:owner-admin-moderator-tap-matrix",
  "proof:admin-action-registry",
  "proof:moderator-autonomous-boundaries",
]) requireText("package wiring", packageJson, `"${script}"`);

requireText("current state", currentState, "Full app authority/product behavior source audit is closed");
requireText("next task", nextTask, "Full app authority/product behavior source audit is closed");

forbidText("route inventory", doc, "installed proof passed for current commit");
if (existsSync(path.join(root, "app/admin-command-center.tsx"))) failures.push("duplicate admin route exists");

if (failures.length) {
  console.error("proof:full-app-authority-product-audit failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  appRouteFiles: appFiles.length,
  edgeFunctions: functionFiles.length,
  installedProofStatus: "pending_not_claimed",
}, null, 2));
