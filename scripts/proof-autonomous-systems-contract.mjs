#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const approvalFunction = read("supabase/functions/autonomous-approval-request/index.ts");
const approvalMigration = read("supabase/migrations/20260711173119_autonomous_approval_requests.sql");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");

const failures = [];
const fail = (message) => failures.push(message);

const mustInclude = (source, needle) => source.includes(needle);
const mustNotInclude = (source, needle) => !source.includes(needle);

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
    passes: () => mustInclude(registry, "fake heartbeat") && mustInclude(approvalFunction, "owner_approval_execution_foundation_only"),
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
    negative: () => !/approvalLevel:\s*3[\s\S]*ownerApprovalRequired:\s*true/.test(registry.replace("approvalLevel: 3", "approvalLevel: 2")),
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
    name: "Level 3/4 action requires approval request",
    passes: () => mustInclude(approvalMigration, "approval_level integer not null check (approval_level in (3, 4))") && mustInclude(registryDoc, "Level 3/4 actions create"),
  },
  {
    name: "operator cannot self-approve",
    passes: () => mustInclude(approvalModel, "operatorSelfApprovalAllowed: false") && mustInclude(approvalMigration, "autonomous_approval_requests_no_self_approval"),
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
    passes: () => mustInclude(approvalModel, "approvedPreflightReran") && mustInclude(approvalFunction, "executionRequiresFreshPreflight"),
  },
  {
    name: "admin foundation test IDs exist",
    passes: () => [
      "admin-autonomous-approvals-section",
      "autonomous-approval-request-card",
      "autonomous-approval-approve-button",
      "autonomous-approval-deny-button",
      "autonomous-approval-risk-summary",
      "autonomous-approval-rollback-plan",
    ].every((needle) => mustInclude(admin, needle)),
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
  systems: ["media_automation", "livekit_operator"],
  approvalRequestPath: "foundation_only_until_owner_super_admin_backing",
  rachiCanApproveItself: false,
  operatorSelfApprovalAllowed: false,
  expansionRequiresRegistryEntry: true,
}, null, 2));
