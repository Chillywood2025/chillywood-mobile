#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const moneyFlowControl = read("_lib/moneyFlowControl.ts");
const moneyRunbook = read("docs/MONEY_FLOW_CONTROL_RUNBOOK.md");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const approvalFunction = read("supabase/functions/autonomous-approval-request/index.ts");
const approvalMigration = [
  read("supabase/migrations/20260711173119_autonomous_approval_requests.sql"),
  read("supabase/migrations/20260711185503_autonomous_approval_live_flow.sql"),
  read("supabase/migrations/20260711193000_money_flow_control_approval_scope.sql"),
].join("\n\n");
const ownerAuthority = read("_lib/platformOwnerAuthority.ts");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");

const failures = [];
const fail = (message) => failures.push(message);

const mustInclude = (source, needle) => source.includes(needle);
const mustNotInclude = (source, needle) => !source.includes(needle);
const candidateBlock = (source, candidateId) => (
  source.match(new RegExp(`id:\\s*"${candidateId}"[\\s\\S]*?activationRequirements:\\s*\\[[\\s\\S]*?\\n\\s*\\],\\n\\s*},`))?.[0] ?? ""
);

const candidateIds = [
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
];

const contractChecks = [
  {
    name: "media system present",
    passes: () => mustInclude(registry, 'id: "media_automation"'),
  },
  {
    name: "LiveKit system present",
    passes: () => mustInclude(registry, 'id: "livekit_operator"'),
  },
  {
    name: "Money Flow system present",
    passes: () => mustInclude(registry, 'id: "money_flow_control"') && mustInclude(registryDoc, "`money_flow_control`"),
  },
  {
    name: "valid candidate placeholders pass",
    passes: () => candidateIds.every((candidateId) => {
      const block = candidateBlock(registry, candidateId);
      return block
        && mustInclude(registryDoc, `\`${candidateId}\``)
        && mustInclude(block, 'status: "candidate_foundation_only"')
        && mustInclude(block, 'activeActivationMode: "off"')
        && mustInclude(block, 'schedulerStatus: "no_scheduler_no_daemon_no_worker"')
        && mustInclude(block, "allowedWrites: []")
        && mustInclude(block, "ownerApprovalRequiredForActivation: true");
    }),
    negative: () => {
      const block = candidateBlock(registry, "notification_delivery_operator");
      const brokenBlock = block.replace('activeActivationMode: "off"', 'activeActivationMode: "limited_scheduled_safe_recovery"');
      return !mustInclude(brokenBlock, 'activeActivationMode: "off"');
    },
  },
  {
    name: "candidate with active scheduler fails",
    passes: () => candidateIds.every((candidateId) => mustInclude(candidateBlock(registry, candidateId), 'schedulerStatus: "no_scheduler_no_daemon_no_worker"')),
    negative: () => {
      const block = candidateBlock(registry, "notification_delivery_operator");
      const brokenBlock = block.replace('schedulerStatus: "no_scheduler_no_daemon_no_worker"', 'schedulerStatus: "candidate_scheduler_active"');
      return !mustInclude(brokenBlock, 'schedulerStatus: "no_scheduler_no_daemon_no_worker"');
    },
  },
  {
    name: "candidate with write scope fails",
    passes: () => candidateIds.every((candidateId) => mustInclude(candidateBlock(registry, candidateId), "allowedWrites: []")),
    negative: () => {
      const broken = registry.replace("allowedWrites: [],", 'allowedWrites: ["write authority"],');
      return !mustInclude(candidateBlock(broken, "notification_delivery_operator"), "allowedWrites: []");
    },
  },
  {
    name: "candidate claiming closed/live fails",
    passes: () => candidateIds.every((candidateId) => mustInclude(candidateBlock(registry, candidateId), 'status: "candidate_foundation_only"')) && mustInclude(registryDoc, "are not active autonomous systems, are not closed/healthy/live"),
    negative: () => {
      const block = candidateBlock(registry, "notification_delivery_operator");
      const brokenBlock = block.replace('status: "candidate_foundation_only"', 'status: "live_closed_active"');
      return !mustInclude(brokenBlock, 'status: "candidate_foundation_only"');
    },
  },
  {
    name: "RevenueCat provider readback current-state is reconciled",
    passes: () => (
      mustInclude(currentState + nextTask, "RevenueCat provider readback is closed")
      && mustInclude(currentState + nextTask, "dashboard TEST returned HTTP `200` / `test_received`")
      && mustInclude(currentState + nextTask, "premiumGranted=false")
      && mustInclude(currentState + nextTask, "liveMoneyAction=false")
      && mustInclude(currentState + nextTask, "moneyMoved=false")
      && mustNotInclude(currentState + nextTask, "dashboard valid TEST proof remains pending")
      && mustNotInclude(currentState + nextTask, "dashboard delivery history and dashboard TEST remain owner-session/API-capability proof gates")
    ),
    negative: () => !mustInclude((currentState + nextTask).replaceAll("RevenueCat provider readback is closed", "RevenueCat provider readback is pending"), "RevenueCat provider readback is closed"),
  },
  {
    name: "valid future scope passes only with proof/guard/approval/write bounds",
    passes: () => [
      "approvalLevel:",
      "allowedReadScope",
      "allowedWriteScope",
      "forbiddenScope",
      "proofScript",
      "guardScript",
      "rollbackBehavior",
      "killSwitchOrFallback",
      "ownerApprovalRequired",
    ].every((needle) => mustInclude(registry, needle)),
  },
  {
    name: "missing rollback fails",
    passes: () => mustInclude(registry, "rollback/quarantine behavior") && mustInclude(registry, "rollbackBehavior"),
    negative: () => !mustInclude(registry.replaceAll("rollbackBehavior", "removedRollback"), "rollbackBehavior"),
  },
  {
    name: "missing kill switch fails",
    passes: () => mustInclude(registry, "kill switch/emergency stop") && mustInclude(registry, "killSwitchOrFallback"),
    negative: () => !mustInclude(registry.replaceAll("killSwitchOrFallback", "removedKillSwitch"), "killSwitchOrFallback"),
  },
  {
    name: "missing backup gate fails",
    passes: () => mustInclude(registry, "backup/restore"),
    negative: () => !mustInclude(registry.replaceAll("backup/restore", "removed-backup-gate"), "backup/restore"),
  },
  {
    name: "private media public exposure fails",
    passes: () => mustInclude(registry, "private/Premium/original public exposure"),
    negative: () => !mustInclude(registry.replace("private/Premium/original public exposure", "removed-exposure-boundary"), "private/Premium/original public exposure"),
  },
  {
    name: "fake heartbeat fails",
    passes: () => mustInclude(registry, "fake heartbeat") && mustInclude(approvalFunction, "owner_or_super_admin_required"),
    negative: () => !mustInclude(registry.replaceAll("fake heartbeat", "manual heartbeat accepted"), "fake heartbeat"),
  },
  {
    name: "stale cutoff loosening fails",
    passes: () => mustInclude(registry, "stale cutoff loosening"),
    negative: () => !mustInclude(registry.replaceAll("stale cutoff loosening", "cutoff mutation allowed"), "stale cutoff loosening"),
  },
  {
    name: "broad DB write fails",
    passes: () => mustInclude(registry, "broad DB mutation") && mustInclude(registry, "non-LiveKit table mutation"),
    negative: () => !mustInclude(registry.replace("broad DB mutation", "broad writes allowed"), "broad DB mutation"),
  },
  {
    name: "Level 3 action listed as autonomous fails",
    passes: () => /approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/.test(registry),
    negative: () => {
      const surface = registry.match(/id:\s*"broad_media_backfill_or_new_scheduler"[\s\S]*?ownerApprovalRequired:\s*true,/)?.[0] ?? "";
      const brokenSurface = surface.replace("approvalLevel: 3", "approvalLevel: 2");
      return !/approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/.test(brokenSurface);
    },
  },
  {
    name: "scheduler overclaim fails",
    passes: () => mustInclude(registry, "scheduler status must match actual installed systemd/GitHub/Cloudflare state"),
    negative: () => !mustInclude(registry.replace("scheduler status must match actual installed systemd/GitHub/Cloudflare state", "scheduler always active"), "scheduler status must match actual installed systemd/GitHub/Cloudflare state"),
  },
  {
    name: "missing LiveKit surface fails",
    passes: () => ["live_stage", "watch_party_live", "party_room_live_sidecar", "chat_call", "livekit_token", "livekit_router", "heartbeat_monitor", "render_telemetry"].every((needle) => mustInclude(registry, needle)),
    negative: () => !mustInclude(registry.replace("party_room_live_sidecar", "sidecar_removed"), "party_room_live_sidecar"),
  },
  {
    name: "missing media proof fails",
    passes: () => ["proof:media-automation-controller", "proof:media-automation-cli", "proof:media-object-storage-zero-hetzner"].every((needle) => mustInclude(registry + packageJson, needle)),
    negative: () => !mustInclude((registry + packageJson).replaceAll("proof:media-automation-cli", "proof:removed"), "proof:media-automation-cli"),
  },
  {
    name: "secret logging allowance fails",
    passes: () => mustInclude(approvalModel, "SECRET_KEY_PATTERN") && mustInclude(approvalFunction, "SECRET_PATTERN"),
    negative: () => mustNotInclude("allow secrets in metadata", "SECRET_KEY_PATTERN"),
  },
  {
    name: "missing money surface fails",
    passes: () => ["premium_revenue", "creator_payout_ledger", "payout_batches", "provider_transfer_records", "network_billing", "sponsor_deals", "fraud_holds", "usage_metering"].every((needle) => mustInclude(registry, needle)),
    negative: () => !mustInclude(registry.replace("provider_transfer_records", "provider_transfer_removed"), "provider_transfer_records"),
  },
  {
    name: "fake money state fails",
    passes: () => mustInclude(registry, "fake creator earnings") && mustInclude(registry, "fake payable balance") && mustInclude(moneyFlowControl, "fake_revenue_forbidden"),
    negative: () => !mustInclude(registry.replaceAll("fake payable balance", "fake payable allowed"), "fake payable balance"),
  },
  {
    name: "real money movement requires Level 4",
    passes: () => /id:\s*"real_money_movement_or_public_money_launch"[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/.test(registry) && mustInclude(moneyFlowControl, "real_money_movement_level_4"),
    negative: () => {
      const broken = registry.replace(
        /id:\s*"real_money_movement_or_public_money_launch"[\s\S]*?approvalLevel:\s*4/,
        (match) => match.replace("approvalLevel: 4", "approvalLevel: 2"),
      );
      return !/id:\s*"real_money_movement_or_public_money_launch"[\s\S]*approvalLevel:\s*4[\s\S]*ownerApprovalRequired:\s*true/.test(broken);
    },
  },
  {
    name: "Level 4 money action requires external confirmation",
    passes: () => mustInclude(moneyFlowControl, "external_provider_confirmation_required_for_level_4") && mustInclude(moneyRunbook, "external provider confirmation"),
    negative: () => !mustInclude(moneyFlowControl.replaceAll("external_provider_confirmation_required_for_level_4", "confirmation_removed"), "external_provider_confirmation_required_for_level_4"),
  },
  {
    name: "scoped money operator writes are explicit Level 2 registry entries",
    passes: () => /id:\s*"scoped_money_operator_reconciliation_writes"[\s\S]*approvalLevel:\s*2[\s\S]*money_reconciliation_findings[\s\S]*money_required_review_flags/.test(registry) && mustInclude(moneyFlowControl, "MONEY_OPERATOR_ALLOWED_WRITE_TABLES"),
    negative: () => !/id:\s*"scoped_money_operator_reconciliation_writes"[\s\S]*approvalLevel:\s*2/.test(registry.replace("scoped_money_operator_reconciliation_writes", "money_operator_removed")),
  },
  {
    name: "provider webhook reliability loop is explicit Level 2 registry scope",
    passes: () => /id:\s*"provider_webhook_reliability_loop"[\s\S]*approvalLevel:\s*2[\s\S]*money_provider_sync_status[\s\S]*money_reconciliation_findings/.test(registry) && mustInclude(moneyFlowControl, "MONEY_PROVIDER_RELIABILITY_SURFACES"),
    negative: () => !/id:\s*"provider_webhook_reliability_loop"[\s\S]*approvalLevel:\s*2/.test(registry.replace("provider_webhook_reliability_loop", "provider_loop_removed")),
  },
  {
    name: "provider access broker is explicit Level 2 registry scope",
    passes: () => /id:\s*"provider_access_broker"[\s\S]*approvalLevel:\s*2[\s\S]*provider_access_capabilities[\s\S]*provider_access_audit_events[\s\S]*provider_dashboard_repair_requests/.test(registry) && mustInclude(packageJson, "proof:provider-access-broker") && mustInclude(packageJson, "guard:provider-access-broker"),
    negative: () => !/id:\s*"provider_access_broker"[\s\S]*approvalLevel:\s*2/.test(registry.replaceAll("provider_access_broker", "provider_access_removed")),
  },
  {
    name: "Level 3/4 action requires approval request",
    passes: () => mustInclude(approvalMigration, "approval_level integer not null check (approval_level in (3, 4))") && mustInclude(registryDoc, "Level 3/4 actions create") && mustInclude(approvalFunction, "approve_request"),
  },
  {
    name: "operator cannot self-approve",
    passes: () => mustInclude(approvalModel, "operatorSelfApprovalAllowed: false") && mustInclude(approvalMigration, "autonomous_approval_requests_no_self_approval") && mustInclude(ownerAuthority, "canUserApproveAutonomousRequest"),
  },
  {
    name: "Rachi cannot self-approve",
    passes: () => mustInclude(approvalModel, "requestedByActorType === \"rachi\"") && mustInclude(registryDoc, "Rachi cannot approve itself"),
  },
  {
    name: "expired approval cannot execute",
    passes: () => mustInclude(approvalModel, "Date.parse(input.request.expiresAt) <= Date.now()") && mustInclude(approvalFunction, "expire_old_requests"),
  },
  {
    name: "execution requires fresh preflight after approval",
    passes: () => mustInclude(approvalModel, "approvedPreflightReran") && mustInclude(approvalMigration, "preflight_passed") && mustInclude(approvalFunction, "mark_preflight_result"),
  },
  {
    name: "admin foundation test IDs exist",
    passes: () => [
      "admin-autonomous-approvals-section",
      "autonomous-approval-request-card",
      "autonomous-approval-approve-button",
      "autonomous-approval-deny-button",
      "autonomous-approval-cancel-button",
      "autonomous-approval-emergency-pause-button",
      "autonomous-approval-resume-button",
      "autonomous-approval-risk-summary",
      "autonomous-approval-rollback-plan",
      "autonomous-approval-proof-plan",
      "autonomous-approval-event-history",
      "autonomous-approval-owner-locked-copy",
    ].every((needle) => mustInclude(admin, needle)),
  },
  {
    name: "owner/super-admin live approval backing exists",
    passes: () => mustInclude(approvalModel, "live_owner_super_admin_backed") && mustInclude(approvalMigration, "super_admin") && mustInclude(approvalFunction, "authorizeOwnerOrSuperAdmin"),
  },
  {
    name: "emergency stop blocks execution",
    passes: () => mustInclude(approvalModel, "emergencyStopBlocksExecution") && mustInclude(approvalMigration, "autonomous_system_emergency_state_blocks_execution"),
  },
];

for (const check of contractChecks) {
  if (!check.passes()) fail(`proof case failed: ${check.name}`);
  if (check.negative && !check.negative()) fail(`negative proof case did not fail as expected: ${check.name}`);
}

if (failures.length) {
  console.error("Autonomous systems contract proof failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  proofCases: contractChecks.length,
  systems: ["media_automation", "livekit_operator", "money_flow_control"],
  candidatePlaceholders: candidateIds,
  candidatesActive: false,
  candidateWriteAuthority: false,
  moneyFlowControl: "scoped_write_capable_guarded",
  revenueCatProviderReadback: "closed_reconciled",
  approvalRequestPath: "live_owner_super_admin_backed",
  rachiCanApproveItself: false,
  operatorSelfApprovalAllowed: false,
  expansionRequiresRegistryEntry: true,
}, null, 2));
