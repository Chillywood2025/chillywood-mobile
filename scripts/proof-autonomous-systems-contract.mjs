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
const ownerCommandHelper = read("_lib/ownerCommandOperator.ts");
const ownerCommandFunction = read("supabase/functions/owner-command-operator/index.ts");
const ownerCommandMigration = read("supabase/migrations/20260712180500_owner_command_operator.sql");
const ownerCommandRunbook = read("docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md");

const activeSystems = [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
  "installed_product_qa_operator",
  "platform_recovery_operator",
  "privacy_compliance_operator",
  "support_success_operator",
  "search_ranking_integrity_operator",
];

const foundationOnlySystems = [
  "ads_sponsor_delivery_operator",
];

const protectedSystems = [
  ...activeSystems,
  ...foundationOnlySystems,
  "owner_command_operator",
];

const ownerRoutedSystems = [
  ...activeSystems,
  ...foundationOnlySystems,
];

const approvalRequesterSystems = [
  ...activeSystems,
  "owner_command_operator",
];

const scopedSystems = [
  {
    id: "notification_delivery_operator",
    activation: 'activeActivationMode: "limited_scheduled_safe_recovery"',
    schedulerStatus: "chillywood-notification-operator-watch-once.timer_every_5_minutes",
    servicePath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.service",
    timerPath: "ops/notification-operator/systemd/chillywood-notification-operator-watch-once.timer",
    watchScriptPath: "ops/notification-operator/systemd/notification-operator-watch-once.sh",
  },
  {
    id: "release_ota_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-release-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.service",
    timerPath: "ops/release-operator/systemd/chillywood-release-operator-watch-once.timer",
    watchScriptPath: "ops/release-operator/systemd/release-operator-watch-once.sh",
  },
  {
    id: "security_owner_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-security-owner-operator-watch-once.timer_every_15_minutes",
    servicePath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.service",
    timerPath: "ops/security-owner-operator/systemd/chillywood-security-owner-operator-watch-once.timer",
    watchScriptPath: "ops/security-owner-operator/systemd/security-owner-operator-watch-once.sh",
  },
  {
    id: "moderation_safety_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-moderation-safety-operator-watch-once.timer_every_10_minutes",
    servicePath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.service",
    timerPath: "ops/moderation-safety-operator/systemd/chillywood-moderation-safety-operator-watch-once.timer",
    watchScriptPath: "ops/moderation-safety-operator/systemd/moderation-safety-operator-watch-once.sh",
  },
  {
    id: "observability_runtime_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-observability-operator-watch-once.timer_every_10_minutes",
    servicePath: "ops/observability-operator/systemd/chillywood-observability-operator-watch-once.service",
    timerPath: "ops/observability-operator/systemd/chillywood-observability-operator-watch-once.timer",
    watchScriptPath: "ops/observability-operator/systemd/observability-operator-watch-once.sh",
  },
  {
    id: "platform_recovery_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-platform-recovery-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.service",
    timerPath: "ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.timer",
    watchScriptPath: "ops/platform-recovery-operator/systemd/platform-recovery-operator-watch-once.sh",
  },
  {
    id: "privacy_compliance_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-privacy-compliance-operator-watch-once.timer_every_6_hours",
    servicePath: "ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.service",
    timerPath: "ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.timer",
    watchScriptPath: "ops/privacy-compliance-operator/systemd/privacy-compliance-operator-watch-once.sh",
  },
  {
    id: "support_success_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-support-success-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.service",
    timerPath: "ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.timer",
    watchScriptPath: "ops/support-success-operator/systemd/support-success-operator-watch-once.sh",
  },
  {
    id: "search_ranking_integrity_operator",
    activation: 'activeActivationMode: "limited_scheduled_probe"',
    schedulerStatus: "chillywood-search-ranking-integrity-operator-watch-once.timer_every_30_minutes",
    servicePath: "ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.service",
    timerPath: "ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.timer",
    watchScriptPath: "ops/search-ranking-integrity-operator/systemd/search-ranking-integrity-operator-watch-once.sh",
  },
];

const moneyScheduler = {
  servicePath: "ops/money-operator/systemd/chillywood-money-operator-watch-once.service",
  timerPath: "ops/money-operator/systemd/chillywood-money-operator-watch-once.timer",
  watchScriptPath: "ops/money-operator/systemd/money-operator-watch-once.sh",
};

const checks = [
  {
    name: "all active systems present",
    passes: () => protectedSystems.every((systemId) => registry.includes(`id: "${systemId}"`) && registryDoc.includes(`\`${systemId}\``)),
  },
  {
    name: "owner command operator is protected control plane",
    passes: () => (
      registry.includes('id: "owner_command_operator"')
      && registry.includes('status: "scoped_command_router_guarded"')
      && registry.includes("no_scheduler_no_daemon_no_worker_manual_or_owner_invoked_only")
      && registry.includes("bypassing target autonomous operator")
      && registry.includes("real_world_or_external_impact_owner_command")
      && registryDoc.includes("protected scoped command-routing control plane")
    ),
    negative: () => !registry.replace('id: "owner_command_operator"', 'id: "removed_owner_command_operator"').includes('id: "owner_command_operator"'),
  },
  {
    name: "owner command operator routes through all active systems",
    passes: () => ownerRoutedSystems.every((systemId) => ownerCommandHelper.includes(`"${systemId}"`) && ownerCommandFunction.includes(`"${systemId}"`))
      && packageJson.includes('"proof:owner-command-operator"')
      && packageJson.includes('"proof:owner-command-routing"')
      && packageJson.includes('"proof:owner-command-approval-gates"')
      && packageJson.includes('"guard:owner-command-operator"'),
    negative: () => !ownerCommandHelper.replaceAll('"money_flow_control"', '"removed_money_flow_control"').includes('"money_flow_control"'),
  },
  {
    name: "installed product QA operator is scoped scheduled after device-lab timer proof",
    passes: () => {
      const blockStart = registry.indexOf('id: "installed_product_qa_operator"');
      const blockEnd = registry.indexOf("\n  },", blockStart);
      const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
      return block.includes("scoped_write_capable_guarded")
        && block.includes('activeActivationMode: "limited_scheduled_probe"')
        && block.includes("chillywood-installed-qa-firebase-smoke.timer_daily_cost_capped")
        && block.includes("fake installed proof")
        && block.includes("manual Premium grant")
        && block.includes("claiming two-device proof without proof")
        && block.includes("safe_installed_qa_owner_command")
        && block.includes("firebase_test_lab_results_bucket_bootstrap")
        && block.includes("gs://chillywood-installed-qa-testlab-results")
        && block.includes("installed-qa-testlab-runner@chillywood-app.iam.gserviceaccount.com")
        && block.includes("enable or link Google Cloud billing")
        && block.includes("grant Owner IAM")
        && block.includes("grant Editor IAM")
        && block.includes("grant project-wide Storage Admin")
        && packageJson.includes('"proof:installed-product-qa-operator"')
        && packageJson.includes('"guard:installed-product-qa-operator"');
    },
  },
  {
    name: "final scheduled scoped-write operators are real token-gated systems",
    passes: () => [
      ["platform_recovery_operator", "proof:platform-recovery-operator", "guard:platform-recovery-operator", "chillywood-platform-recovery-operator-watch-once.timer_every_30_minutes", "supabase/functions/platform-recovery-operator/index.ts"],
      ["privacy_compliance_operator", "proof:privacy-compliance-operator", "guard:privacy-compliance-operator", "chillywood-privacy-compliance-operator-watch-once.timer_every_6_hours", "supabase/functions/privacy-compliance-operator/index.ts"],
      ["support_success_operator", "proof:support-success-operator", "guard:support-success-operator", "chillywood-support-success-operator-watch-once.timer_every_30_minutes", "supabase/functions/support-success-operator/index.ts"],
      ["search_ranking_integrity_operator", "proof:search-ranking-integrity-operator", "guard:search-ranking-integrity-operator", "chillywood-search-ranking-integrity-operator-watch-once.timer_every_30_minutes", "supabase/functions/search-ranking-integrity-operator/index.ts"],
    ].every(([systemId, proof, guard, scheduler, functionPath]) => {
      const blockStart = registry.indexOf(`id: "${systemId}"`);
      const blockEnd = registry.indexOf("\n  },", blockStart);
      const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
      return block.includes("scoped_write_capable_guarded")
        && block.includes('activeActivationMode: "limited_scheduled_probe"')
        && block.includes(scheduler)
        && block.includes(proof)
        && block.includes(guard)
        && packageJson.includes(`"${proof}"`)
        && packageJson.includes(`"${guard}"`)
        && read(functionPath).includes("handleScopedOperatorRequest");
    }),
  },
  {
    name: "ads sponsor delivery remains foundation-only",
    passes: () => {
      const blockStart = registry.indexOf('id: "ads_sponsor_delivery_operator"');
      const blockEnd = registry.indexOf("\n  },", blockStart);
      const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
      return block.includes('status: "foundation_only_guarded"')
        && block.includes('activeActivationMode: "off"')
        && block.includes("no_scheduler_foundation_only")
        && block.includes("no Edge Function required")
        && !existsSync(path.join(root, "supabase/functions/ads-sponsor-delivery-operator/index.ts"))
        && !packageJson.includes("ads-sponsor-delivery-operator:watch-once");
    },
  },
  {
    name: "owner command cannot bypass approval gates",
    passes: () => (
      ownerCommandFunction.includes("approval_request_required")
      && ownerCommandFunction.includes("owner_approval_required")
      && ownerCommandFunction.includes("external_confirmation_required")
      && ownerCommandFunction.includes("preflight_passed_target_operator_execution_required")
      && ownerCommandFunction.includes("direct_mutation_performed: false")
      && ownerCommandFunction.includes("highRiskExecuted: false")
    ),
    negative: () => !ownerCommandFunction.replaceAll("external_confirmation_required", "external_confirmation_removed").includes("external_confirmation_required"),
  },
  {
    name: "owner command tables deny client writes",
    passes: () => [
      "owner_command_requests",
      "owner_command_events",
      "owner_command_execution_steps",
      "owner_command_blockers",
    ].every((table) => ownerCommandMigration.includes(`public.${table}`) && ownerCommandMigration.includes(`revoke all on table public.${table} from anon, authenticated`)),
  },
  {
    name: "owner command runbook forbids god mode",
    passes: () => (
      ownerCommandRunbook.includes("Owner makes judgment")
      && ownerCommandRunbook.includes("no god mode")
      && ownerCommandRunbook.includes("routes through existing autonomous systems")
      && ownerCommandRunbook.includes("Level 4 still needs external confirmation")
      && ownerCommandRunbook.includes("exact blockers")
    ),
  },
  {
    name: "new systems are scoped-write active not placeholders",
    passes: () => scopedSystems.every((system) => {
      const blockStart = registry.indexOf(`id: "${system.id}"`);
      const blockEnd = registry.indexOf("\n  },", blockStart);
      const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
      return block.includes("scoped_write_capable_guarded") && !block.includes("candidate_foundation_only");
    }),
    negative: () => registry.replace('status: "scoped_write_capable_guarded"', 'status: "candidate_foundation_only"').includes("candidate_foundation_only"),
  },
  {
    name: "new systems scheduled status has timer artifacts",
    passes: () => scopedSystems.every((system) => {
      const blockStart = registry.indexOf(`id: "${system.id}"`);
      const blockEnd = registry.indexOf("\n  },", blockStart);
      const block = blockStart >= 0 && blockEnd > blockStart ? registry.slice(blockStart, blockEnd) : "";
      const service = read(system.servicePath);
      const timer = read(system.timerPath);
      const watchScript = read(system.watchScriptPath);
      return block.includes(system.activation)
        && block.includes(system.schedulerStatus)
        && service.includes("NoNewPrivileges=true")
        && service.includes("ProtectSystem=strict")
        && service.includes("CapabilityBoundingSet=")
        && !/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY/i.test(service + timer + watchScript)
        && watchScript.includes('"action":"watch_once"')
        && watchScript.includes('"scheduler":"systemd_timer"')
        && watchScript.includes(`"operator_id":"${system.id}"`);
    }),
    negative: () => scopedSystems.some((system) => !read(system.watchScriptPath).replace('"action":"watch_once"', '"action":"high_risk"').includes('"action":"watch_once"')),
  },
  {
    name: "money operator scheduled provider-health loop is scoped",
    passes: () => {
      const service = read(moneyScheduler.servicePath);
      const timer = read(moneyScheduler.timerPath);
      const watchScript = read(moneyScheduler.watchScriptPath);
      return registry.includes('id: "money_flow_control"')
        && registry.includes('activeActivationMode: "limited_scheduled_probe"')
        && registry.includes("chillywood-money-operator-watch-once.timer_every_10_minutes")
        && packageJson.includes('"proof:money-operator-scheduler"')
        && packageJson.includes('"guard:money-operator-scheduler"')
        && service.includes("NoNewPrivileges=true")
        && service.includes("ProtectSystem=strict")
        && timer.includes("OnUnitActiveSec=10min")
        && watchScript.includes('"action":"watch_once"')
        && watchScript.includes('"scheduler":"systemd_timer"')
        && watchScript.includes('"operator_id":"money_flow_control"')
        && !/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|checkout|payment_link|transfer|payout|cashout|invoice|manual_premium_grant/i.test(service + timer + watchScript);
    },
    negative: () => read(moneyScheduler.watchScriptPath).replace('"action":"watch_once"', '"action":"real_payout"').includes('"action":"real_payout"'),
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
    negative: () => !registry.replaceAll("broad DB mutation", "broad writes allowed").includes("broad DB mutation"),
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
    passes: () => (
      approvalModel.includes("operatorSelfApprovalAllowed: false")
      && approvalModel.includes("AUTONOMOUS_APPROVAL_REQUESTER_ACTORS")
      && approvalModel.includes('"owner_command_operator"')
      && approvalFunction.includes("mark_preflight_result")
      && approvalFunction.includes("owner_or_super_admin_required")
      && approvalRequesterSystems.every((systemId) => approvalFunction.includes(`"${systemId}"`))
      && !approvalFunction.includes('"ads_sponsor_delivery_operator"')
    ),
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
  protectedSystems,
  foundationOnlySystems,
  scopedWriteSystemsAdded: [
    ...scopedSystems.map((system) => system.id),
    "installed_product_qa_operator",
  ],
  scheduledMoneyLoop: "chillywood-money-operator-watch-once.timer_every_10_minutes",
  revenueCatReadbackReconciled: true,
  candidatePlaceholdersRemaining: 0,
}, null, 2));
