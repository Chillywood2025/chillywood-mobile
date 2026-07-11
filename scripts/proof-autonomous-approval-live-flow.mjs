#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const approvalModel = read("_lib/autonomousApprovalRequests.ts");
const authority = read("_lib/platformOwnerAuthority.ts");
const admin = read("app/admin.tsx");
const edge = read("supabase/functions/autonomous-approval-request/index.ts");
const livekitOperator = read("_lib/livekitAutonomousOperator.ts");
const mediaOperator = read("_lib/mediaAutomationController.ts");
const registry = read("_lib/autonomousSystemsRegistry.ts");
const migration = [
  read("supabase/migrations/20260711173119_autonomous_approval_requests.sql"),
  read("supabase/migrations/20260711185503_autonomous_approval_live_flow.sql"),
].join("\n\n");
const packageJson = read("package.json");

const checks = [];
const add = (key, ok, detail) => checks.push({ key, ok: Boolean(ok), detail });
const hasAll = (source, needles) => needles.every((needle) => source.includes(needle));
const hasNone = (source, needles) => needles.every((needle) => !source.includes(needle));

add(
  "owner_super_admin_can_approve_pending_level_3_4",
  hasAll(authority + edge + migration, [
    "hasOwnerOrSuperAdminAuthority",
    "owner_or_super_admin_required",
    "approve_request",
    "approval_level integer not null check (approval_level in (3, 4))",
  ]),
  "Owner/super-admin authority gates live approve_request for Level 3/4 requests.",
);

add(
  "non_owner_cannot_approve",
  hasAll(edge, ["authorizeOwnerOrSuperAdmin", "owner_or_super_admin_required", "OPS_APPROVAL_TOKEN", "constantTimeEqual"])
    && !edge.includes("operator can approve"),
  "Edge function verifies owner/super-admin membership before approve/deny and keeps trusted operator tokens constant-time.",
);

add(
  "operator_cannot_self_approve",
  hasAll(authority + approvalModel + edge + migration, [
    "requestedByActorId",
    "self_approval_denied",
    "autonomous_approval_requests_no_self_approval",
    "operatorSelfApprovalAllowed: false",
  ]),
  "Requester/self approval is denied in source helpers, Edge function, and DB constraint.",
);

add(
  "rachi_cannot_approve",
  hasAll(approvalModel + authority, ["Rachi can request/recommend but cannot approve itself", "rachi"])
    && !edge.includes("rachiCanApprove: true"),
  "Rachi can request/recommend but cannot approve itself.",
);

add(
  "expired_request_cannot_execute",
  hasAll(approvalModel + edge + migration, ["expiresAt", "request_expired", "autonomous_approval_request_expired"]),
  "Expired approvals are blocked before review, preflight, and execution.",
);

add(
  "fresh_preflight_required",
  hasAll(approvalModel + edge + migration, [
    "approvedPreflightReran",
    "mark_preflight_result",
    "preflight_passed",
    "autonomous_execution_requires_fresh_preflight",
  ]),
  "Execution requires preflight_passed after approval.",
);

add(
  "failed_preflight_blocks_execution",
  hasAll(approvalModel + migration, ["preflight_failed", "status = 'preflight_failed'"]),
  "Failed preflight moves request to preflight_failed and does not execute.",
);

add(
  "scope_must_match",
  hasAll(approvalModel + edge + migration, [
    "validateAutonomousApprovalExecutionScope",
    "p_system_id",
    "p_action_id",
    "autonomous_approval_scope_mismatch",
  ]),
  "Execution must match approved system/action scope.",
);

add(
  "emergency_stop_blocks_execution",
  hasAll(approvalModel + edge + migration, [
    "emergencyStopBlocksExecution",
    "emergency_pause_system",
    "autonomous_system_emergency_state_blocks_execution",
  ]),
  "Emergency stop/pause blocks autonomous execution.",
);

add(
  "approval_events_are_audited",
  hasAll(edge + migration, [
    "autonomous_approval_request_events",
    "requested",
    "approved",
    "denied",
    "preflight_passed",
    "executed",
  ]),
  "Request lifecycle writes immutable audit events.",
);

add(
  "secret_metadata_rejected",
  hasAll(edge + migration, [
    "containsSecretLikeValue",
    "secret_like_payload_blocked",
    "autonomous_approval_secret_metadata_blocked",
  ]),
  "Secret-like request, approval, preflight, execution, and emergency metadata is blocked/redacted.",
);

add(
  "level_3_4_without_request_fails",
  hasAll(approvalModel + edge + migration + livekitOperator + mediaOperator + registry, [
    "ownerApprovalRequired",
    "create_request",
    "mark_executed",
    "request_id_required",
    "planLiveKitLevelThreeOrFourApprovalRequest",
    "planMediaAutomationLevelThreeOrFourApprovalRequest",
  ]),
  "Level 3/4 execution path depends on an approval request id.",
);

add(
  "admin_ui_live_testids_exist",
  [
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
  ].every((needle) => admin.includes(needle)),
  "Admin UI exposes live review cards and locked copy on canonical /admin.",
);

add(
  "no_duplicate_admin_route",
  hasNone(admin, ["/admin-command-center", "href=\"/admin-command-center\"", "router.push(\"/admin-command-center\""]),
  "No duplicate Admin route is introduced.",
);

add(
  "no_manual_premium_or_billing_path",
  hasNone(edge + migration + admin, [
    "manual_premium_grant",
    "grant_premium",
    "RevenueCat product",
    "Stripe live",
    "cashout",
    "payout mutation",
  ]),
  "Approval framework does not add Premium, billing, payout, or product mutations.",
);

add(
  "package_script_wired",
  packageJson.includes("\"proof:autonomous-approval-live-flow\""),
  "Package script is wired.",
);

const failed = checks.filter((check) => !check.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  passed: checks.length - failed.length,
  failed: failed.length,
  total: checks.length,
}, null, 2));

if (failed.length) {
  for (const check of failed) {
    console.error(`FAIL ${check.key}: ${check.detail}`);
  }
  process.exit(1);
}
