#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const operatingModel = read("docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const approvalFunction = read("supabase/functions/autonomous-approval-request/index.ts");
const ownerAuthority = read("_lib/platformOwnerAuthority.ts");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const migration = read("supabase/migrations/20260712145220_autonomous_scoped_write_operators.sql");
const sharedFn = read("supabase/functions/_shared/scoped-operator.ts");

const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include: ${needle}`);
};

const requiredActiveSystems = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
];

const newlyScopedSystems = [
  {
    id: "notification_delivery_operator",
    proof: "proof:notification-delivery-operator",
    guard: "guard:notification-delivery-operator",
    functionPath: "supabase/functions/notification-operator/index.ts",
    adminTestId: "admin-notification-operator-section",
    forbidden: ["bypass notification preferences", "marketing blast sends", "changing push provider credentials"],
    highRisk: "broad_notification_campaign_or_provider_config",
  },
  {
    id: "release_ota_operator",
    proof: "proof:release-ota-operator",
    guard: "guard:release-ota-operator",
    functionPath: "supabase/functions/release-operator/index.ts",
    adminTestId: "admin-release-operator-section",
    forbidden: ["auto-publish production OTA without approval", "auto-rollback production OTA without approval", "fake installed proof"],
    highRisk: "production_publish_or_rollback",
  },
  {
    id: "security_owner_operator",
    proof: "proof:security-owner-operator",
    guard: "guard:security-owner-operator",
    functionPath: "supabase/functions/security-owner-operator/index.ts",
    adminTestId: "admin-security-owner-operator-section",
    forbidden: ["assign/revoke owner role autonomously", "mutate auth/RLS autonomously", "let Rachi/operator approve themselves"],
    highRisk: "owner_role_auth_rls_or_secret_rotation",
  },
  {
    id: "moderation_safety_operator",
    proof: "proof:moderation-safety-operator",
    guard: "guard:moderation-safety-operator",
    functionPath: "supabase/functions/moderation-safety-operator/index.ts",
    adminTestId: "admin-moderation-safety-operator-section",
    forbidden: ["permanent ban/suspend/restrict without approval", "delete content without approval", "hidden enforcement with no appeal/review trail"],
    highRisk: "account_rights_content_delete_or_enforcement",
  },
];

for (const systemId of requiredActiveSystems) {
  includes(registry, `id: "${systemId}"`, "autonomous registry");
  includes(registryDoc, `\`${systemId}\``, "registry docs");
  includes(approvalFunction, systemId, "approval function system whitelist");
}

for (const system of newlyScopedSystems) {
  const blockStart = registry.indexOf(`id: "${system.id}"`);
  const blockEnd = registry.indexOf("\n  },", blockStart);
  const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
  includes(block, "scoped_write_capable_guarded", `${system.id} active status`);
  includes(block, 'activeActivationMode: "manual_cli"', `${system.id} manual activation`);
  includes(block, "no_scheduler_no_daemon_no_worker_manual_cli_only", `${system.id} scheduler status`);
  includes(block, "allowedWrites", `${system.id} write scope`);
  includes(block, "requiredProofScripts", `${system.id} proof registration`);
  includes(block, "requiredGuardScripts", `${system.id} guard registration`);
  includes(block, system.proof, `${system.id} proof script`);
  includes(block, system.guard, `${system.id} guard script`);
  includes(block, "rollbackBehavior", `${system.id} rollback`);
  includes(block, "killSwitchOrFallback", `${system.id} kill switch`);
  includes(block, "ownerApprovalRequired: true", `${system.id} high-risk approval`);
  includes(block, system.highRisk, `${system.id} high-risk surface`);
  for (const forbidden of system.forbidden) includes(block, forbidden, `${system.id} forbidden scope`);
  includes(packageJson, `"${system.proof}"`, `${system.id} package proof`);
  includes(packageJson, `"${system.guard}"`, `${system.id} package guard`);
  includes(admin, system.adminTestId, `${system.id} admin section`);
  includes(read(system.functionPath), "handleScopedOperatorRequest", `${system.id} edge function`);
}

notIncludes(registry, 'id: "notification_delivery_operator",\n    displayName: "Notification Delivery Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "release_ota_operator",\n    displayName: "Release / OTA Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "security_owner_operator",\n    displayName: "Security / Owner Authority Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registry, 'id: "moderation_safety_operator",\n    displayName: "Moderation / Safety Operator",\n    status: "candidate_foundation_only"', "active registry");
notIncludes(registryDoc, "candidate_foundation_only", "registry docs");
notIncludes(registryDoc, "Allowed writes: none", "registry docs");

for (const required of [
  "private/Premium/original public exposure",
  "unscanned/moderation-blocked processing",
  "broad uncapped backfill",
  "backup/restore",
  "rollback/quarantine",
  "fake heartbeat",
  "stale cutoff loosening",
  "broad DB mutation",
  "marking unhealthy server active without host proof",
  "manual Premium grant",
  "real money movement without Level 4",
  "fake creator earnings",
  "fake payable balance",
  "provider_access_broker",
  "provider_webhook_reliability_loop",
]) {
  includes(registry, required, "existing active system protection");
}

for (const required of [
  "approvalLevel:",
  "allowedReadScope",
  "allowedWriteScope",
  "forbiddenScope",
  "proofScript",
  "guardScript",
  "rollbackBehavior",
  "killSwitchOrFallback",
  "ownerApprovalRequired",
]) {
  includes(registry, required, "expansion rule fields");
}

for (const script of [
  "proof:autonomous-systems-contract",
  "guard:autonomous-systems-contract",
  "proof:autonomous-approval-live-flow",
  "proof:money-flow-control",
  "guard:money-flow-control",
  "proof:livekit-autonomous-operator",
  "proof:media-automation-cli",
]) {
  includes(packageJson, `"${script}"`, "package script wiring");
}

for (const table of [
  "notification_operator_events",
  "release_operator_events",
  "security_operator_events",
  "moderation_operator_events",
]) {
  includes(migration, `public.${table}`, "scoped operator migration");
}
includes(migration, "enable row level security", "scoped operator migration");
includes(migration, "from anon, authenticated", "scoped operator client write denial");
includes(migration, "check (user_rights_changed = false)", "scoped operator user-rights constraint");
includes(migration, "check (money_moved = false)", "scoped operator money constraint");
includes(sharedFn, "constantTimeEqual", "operator token gate");
includes(sharedFn, "sanitizeOperatorMetadata", "operator redaction");

includes(approvalModel, "operatorSelfApprovalAllowed: false", "approval self-approval model");
includes(ownerAuthority, "canUserApproveAutonomousRequest", "owner authority helper");
includes(approvalFunction, "owner_or_super_admin_required", "approval function owner gate");
includes(approvalFunction, "mark_preflight_result", "approval fresh preflight");
includes(approvalFunction, "emergency_pause_system", "approval emergency controls");
notIncludes(approvalFunction, "rachi_can_approve", "approval function");

notIncludes(currentState + nextTask, "dashboard valid TEST proof remains pending", "RevenueCat closure state");
includes(currentState + nextTask, "RevenueCat provider readback is closed", "RevenueCat reconciled state");
includes(currentState + nextTask, "dashboard TEST returned HTTP `200` / `test_received`", "RevenueCat dashboard TEST closure");
includes(currentState + nextTask, "premiumGranted=false", "RevenueCat no Premium grant");
includes(currentState + nextTask, "liveMoneyAction=false", "RevenueCat no live money action");
includes(currentState + nextTask, "moneyMoved=false", "RevenueCat no money moved");

if (existsSync("app/admin-command-center.tsx")) fail("duplicate admin route exists");
if (/production_ota_publish[\s\S]{0,400}approvalLevel:\s*[0123]/.test(registry)) fail("production OTA publish downgraded below Level 4");
if (/owner_role_auth_rls_or_secret_rotation[\s\S]{0,400}approvalLevel:\s*[0123]/.test(registry)) fail("owner/auth/RLS mutation downgraded below Level 4");
if (/account_rights_content_delete_or_enforcement[\s\S]{0,400}approvalLevel:\s*[012]/.test(registry)) fail("moderation enforcement downgraded below Level 3");
if (/broad_notification_campaign_or_provider_config[\s\S]{0,400}approvalLevel:\s*[012]/.test(registry)) fail("notification broad send/provider config downgraded below Level 3");
if (/REVENUECAT_SECRET_API_KEY|SERVICE_ROLE_KEY|MONEY_OPERATOR_TOKEN|NOTIFICATION_OPERATOR_TOKEN|RELEASE_OPERATOR_TOKEN|SECURITY_OWNER_OPERATOR_TOKEN|MODERATION_SAFETY_OPERATOR_TOKEN/.test(admin + registryDoc + operatingModel)) {
  fail("secret name/value leaked into client-facing docs or admin copy");
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  activeSystems: requiredActiveSystems,
  scopedWriteSystemsAdded: newlyScopedSystems.map((system) => system.id),
  candidatePlaceholdersRemaining: 0,
}, null, 2));
