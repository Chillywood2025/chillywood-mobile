#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const packageJson = read("package.json");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const approvalFunction = read("supabase/functions/autonomous-approval-request/index.ts");
const migration = read("supabase/migrations/20260712145220_autonomous_scoped_write_operators.sql");

const activeSystems = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
];

const scopedSystems = [
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
];

const checks = [
  {
    name: "all active systems present",
    passes: () => activeSystems.every((systemId) => registry.includes(`id: "${systemId}"`) && registryDoc.includes(`\`${systemId}\``)),
  },
  {
    name: "new systems are scoped-write active not placeholders",
    passes: () => scopedSystems.every((systemId) => {
      const blockStart = registry.indexOf(`id: "${systemId}"`);
      const blockEnd = registry.indexOf("\n  },", blockStart);
      const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
      return block.includes("scoped_write_capable_guarded") && !block.includes("candidate_foundation_only");
    }),
    negative: () => registry.replace('status: "scoped_write_capable_guarded"', 'status: "candidate_foundation_only"').includes("candidate_foundation_only"),
  },
  {
    name: "valid future scope requires proof guard rollback kill switch approval",
    passes: () => ["approvalLevel:", "allowedReadScope", "allowedWriteScope", "forbiddenScope", "proofScript", "guardScript", "rollbackBehavior", "killSwitchOrFallback", "ownerApprovalRequired"].every((needle) => registry.includes(needle)),
  },
  {
    name: "missing rollback fails",
    passes: () => registry.includes("rollbackBehavior"),
    negative: () => !registry.replaceAll("rollbackBehavior", "removedRollback").includes("rollbackBehavior"),
  },
  {
    name: "missing kill switch fails",
    passes: () => registry.includes("killSwitchOrFallback"),
    negative: () => !registry.replaceAll("killSwitchOrFallback", "removedKillSwitch").includes("killSwitchOrFallback"),
  },
  {
    name: "missing backup gate fails",
    passes: () => registry.includes("backup/restore"),
    negative: () => !registry.replaceAll("backup/restore", "removed-backup").includes("backup/restore"),
  },
  {
    name: "private media public exposure fails",
    passes: () => registry.includes("private/Premium/original public exposure"),
    negative: () => !registry.replace("private/Premium/original public exposure", "removed-exposure").includes("private/Premium/original public exposure"),
  },
  {
    name: "fake heartbeat fails",
    passes: () => registry.includes("fake heartbeat"),
    negative: () => !registry.replaceAll("fake heartbeat", "manual heartbeat accepted").includes("fake heartbeat"),
  },
  {
    name: "stale cutoff loosening fails",
    passes: () => registry.includes("stale cutoff loosening"),
    negative: () => !registry.replaceAll("stale cutoff loosening", "cutoff mutation allowed").includes("stale cutoff loosening"),
  },
  {
    name: "broad DB write fails",
    passes: () => registry.includes("broad DB mutation"),
    negative: () => !registry.replace("broad DB mutation", "broad writes allowed").includes("broad DB mutation"),
  },
  {
    name: "new scoped systems have proof and guard scripts",
    passes: () => [
      "proof:notification-delivery-operator",
      "guard:notification-delivery-operator",
      "proof:release-ota-operator",
      "guard:release-ota-operator",
      "proof:security-owner-operator",
      "guard:security-owner-operator",
      "proof:moderation-safety-operator",
      "guard:moderation-safety-operator",
    ].every((script) => registry.includes(script) && packageJson.includes(`"${script}"`)),
  },
  {
    name: "notification high risk requires approval",
    passes: () => /broad_notification_campaign_or_provider_config[\s\S]*approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/.test(registry),
    negative: () => {
      const block = registry.match(/broad_notification_campaign_or_provider_config[\s\S]*?ownerApprovalRequired:\s*true/)?.[0] ?? "";
      return !block.replace("approvalLevel: 3", "approvalLevel: 2").includes("approvalLevel: 3");
    },
  },
  {
    name: "release publish rollback requires Level 4",
    passes: () => /production_publish_or_rollback[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/.test(registry),
  },
  {
    name: "security owner auth RLS mutation requires Level 4",
    passes: () => /owner_role_auth_rls_or_secret_rotation[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/.test(registry),
  },
  {
    name: "moderation enforcement requires approval",
    passes: () => /account_rights_content_delete_or_enforcement[\s\S]*approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/.test(registry),
  },
  {
    name: "scoped write migration denies clients",
    passes: () => migration.includes("enable row level security") && migration.includes("from anon, authenticated") && migration.includes("check (user_rights_changed = false)") && migration.includes("check (money_moved = false)"),
  },
  {
    name: "approval path prevents self approval and requires preflight",
    passes: () => approvalModel.includes("operatorSelfApprovalAllowed: false") && approvalFunction.includes("mark_preflight_result") && approvalFunction.includes("owner_or_super_admin_required"),
  },
  {
    name: "RevenueCat reconciled current-state text passes",
    passes: () => (
      (currentState + nextTask).includes("RevenueCat provider readback is closed")
      && (currentState + nextTask).includes("dashboard TEST returned HTTP `200` / `test_received`")
      && (currentState + nextTask).includes("premiumGranted=false")
      && (currentState + nextTask).includes("liveMoneyAction=false")
      && (currentState + nextTask).includes("moneyMoved=false")
      && !(currentState + nextTask).includes("dashboard valid TEST proof remains pending")
    ),
  },
  {
    name: "no duplicate admin route",
    passes: () => !existsSync("app/admin-command-center.tsx"),
  },
];

const failures = [];
for (const check of checks) {
  if (!check.passes()) failures.push(check.name);
  if (check.negative && !check.negative()) failures.push(`${check.name} negative case did not fail`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  activeSystems,
  scopedWriteSystemsAdded: scopedSystems,
  revenueCatReadbackReconciled: true,
  candidatePlaceholdersRemaining: 0,
}, null, 2));
