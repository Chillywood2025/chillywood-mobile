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
const includes = (source, needle, label) => {
  if (!source.includes(needle)) failures.push(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) failures.push(`${label} must not include: ${needle}`);
};

const docPath = "docs/FULL_APP_AUTHORITY_PRODUCT_BEHAVIOR_AUDIT.md";
if (!existsSync(path.join(root, docPath))) failures.push(`missing ${docPath}`);

const doc = existsSync(path.join(root, docPath)) ? read(docPath) : "";
const packageJson = read("package.json");
const adminRegistry = read("_lib/adminActionRegistry.ts");
const adminRegistryDoc = read("docs/ADMIN_ACTION_REGISTRY.md");
const roleMatrix = read("_lib/platformRoleActionMatrix.ts");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const ownerCommand = read("_lib/ownerCommandOperator.ts");
const ownerAuthority = read("_lib/platformOwnerAuthority.ts");
const autonomousRegistry = read("_lib/autonomousSystemsRegistry.ts");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const adminRoute = existsSync(path.join(root, "app/admin.tsx")) ? read("app/admin.tsx") : "";

const appFiles = list("find app -type f | sort");
const functionFiles = list("find supabase/functions -maxdepth 2 -type f -name 'index.ts' | sort");

for (const file of appFiles) includes(doc, `\`${file}\``, "full-app route inventory");
for (const file of functionFiles) includes(doc, `\`${file.split("/")[2]}\``, "full-app function inventory");

for (const script of [
  "proof:full-app-authority-product-audit",
  "guard:full-app-authority-product-audit",
]) includes(packageJson, `"${script}"`, "package audit script wiring");

for (const phrase of [
  "manual Premium grant",
  "payout release",
  "production charge",
  "production OTA publish/rollback",
  "auth/RLS or owner-role mutation",
  "broad push campaign",
  "hidden enforcement",
  "ban/restrict",
  "destructive content deletion",
]) includes(`${adminRegistry}\n${adminRegistryDoc}`, phrase, "admin action high-risk boundary");

if (/status:\s*"live"[\s\S]{0,500}actionId:\s*"(?:money\.move|premium\.grant|payout\.release|release\.publish|release\.rollback|auth\.rls|owner\.role|moderation\.ban|moderation\.delete|notification\.blast)/.test(adminRegistry)) {
  failures.push("admin action registry exposes direct live high-risk action");
}

for (const phrase of [
  "canMoveMoney: \"Money movement is never a direct UI action",
  "canGrantPremium: \"Manual Premium grant/edit controls are forbidden.",
  "canPublishOrRollbackRelease: \"Production publish/rollback requires Level 4 approval",
  "canMutateAuthRls: \"Auth/RLS mutation requires explicit owner approval",
  "canEnforceUserRestriction: \"User restrictions require backed policy",
  "canDeleteContent: \"Content deletion/removal requires exact content scope",
]) includes(roleMatrix, phrase, "role denial copy");

for (const phrase of [
  "owner",
  "super_admin",
  "canUserApproveAutonomousRequest",
  "hasOwnerOrSuperAdminAuthority",
  "AUTONOMOUS_APPROVAL_REQUESTER_TYPES",
]) includes(ownerAuthority, phrase, "owner authority");

for (const phrase of [
  "AUTONOMOUS_APPROVAL_REQUESTER_ACTORS",
  "\"notification_delivery_operator\"",
  "\"release_ota_operator\"",
  "\"security_owner_operator\"",
  "\"moderation_safety_operator\"",
  "\"observability_runtime_operator\"",
  "\"owner_command_operator\"",
  "return input.approverRoles.includes(\"owner\") || input.approverRoles.includes(\"super_admin\")",
]) includes(approvalModel, phrase, "approval requester parity");

for (const phrase of [
  "OwnerCommandTargetSystemId = Exclude<AutonomousSystemId, \"owner_command_operator\">",
  "target_system_required",
  "unknown_target_system",
  "owner_command_direct_db_mutation_forbidden",
]) includes(ownerCommand, phrase, "owner command target guard");

for (const phrase of [
  "owner_command_operator",
  "scoped_command_router_guarded",
  "direct target-table mutation outside routed operator",
]) includes(autonomousRegistry, phrase, "autonomous registry owner command protection");

const secretExposureCorpus = doc + adminRoute + currentState + nextTask;
for (const [label, pattern] of [
  ["Stripe live secret value", /\bsk_live_[A-Za-z0-9_=-]{12,}/],
  ["restricted live key value", /\brk_live_[A-Za-z0-9_=-]{12,}/],
  ["Stripe webhook secret value", /\bwhsec_[A-Za-z0-9_=-]{12,}/],
  ["service-role assignment value", /\bSUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[A-Za-z0-9._-]{20,}/],
  ["Money Operator token assignment value", /\bMONEY_OPERATOR_TOKEN\s*=\s*['"]?[A-Za-z0-9._-]{20,}/],
  ["Owner Command token assignment value", /\bOWNER_COMMAND_OPERATOR_TOKEN\s*=\s*['"]?[A-Za-z0-9._-]{20,}/],
]) {
  if (pattern.test(secretExposureCorpus)) failures.push(`client/docs secret exposure: ${label}`);
}

for (const phrase of [
  "Full app authority/product behavior source audit is closed",
]) {
  includes(currentState, phrase, "current state audit truth");
  includes(nextTask, phrase, "next task audit truth");
}
if (!/installed proof remains pending/i.test(currentState)) failures.push("current state audit truth missing: installed proof remains pending");
if (!/installed proof remains pending/i.test(nextTask)) failures.push("next task audit truth missing: installed proof remains pending");

notIncludes(currentState + nextTask + doc, "installed proof passed for current commit", "installed proof overclaim");

if (existsSync(path.join(root, "app/admin-command-center.tsx"))) failures.push("duplicate admin route exists");
if (!existsSync(path.join(root, "app/admin.tsx"))) failures.push("canonical /admin route missing");

if (failures.length) {
  console.error("guard:full-app-authority-product-audit failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  appRouteFiles: appFiles.length,
  edgeFunctions: functionFiles.length,
  highRiskDirectActions: "blocked_or_approval_gated",
  installedProofStatus: "pending_not_claimed",
}, null, 2));
