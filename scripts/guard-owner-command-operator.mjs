#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const failures = [];
const fail = (message) => failures.push(message);
const includes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing: ${needle}`);
};
const notIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include: ${needle}`);
};

const requiredFiles = [
  "_lib/ownerCommandOperator.ts",
  "supabase/functions/owner-command-operator/index.ts",
  "supabase/migrations/20260712180500_owner_command_operator.sql",
  "scripts/owner-command-cli.mjs",
  "docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md",
];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) fail(`required file missing: ${file}`);
}

const helper = read("_lib/ownerCommandOperator.ts");
const fn = read("supabase/functions/owner-command-operator/index.ts");
const migration = read("supabase/migrations/20260712180500_owner_command_operator.sql");
const cli = read("scripts/owner-command-cli.mjs");
const admin = read("app/admin.tsx");
const packageJson = read("package.json");
const runbook = existsSync(path.join(root, "docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md")) ? read("docs/OWNER_COMMAND_OPERATOR_RUNBOOK.md") : "";

for (const systemId of [
  "media_automation",
  "livekit_operator",
  "money_flow_control",
  "notification_delivery_operator",
  "release_ota_operator",
  "security_owner_operator",
  "moderation_safety_operator",
  "observability_runtime_operator",
]) {
  includes(helper, `"${systemId}"`, "owner command helper active system routing");
  includes(fn, `"${systemId}"`, "owner command function active system routing");
}

for (const phrase of [
  "authorizeOwnerOrSuperAdmin",
  "owner_or_super_admin_required",
  "platform_role_memberships",
  "x-owner-command-operator-token",
  "OWNER_COMMAND_OPERATOR_TOKEN_SHA256",
  "constantTimeEqual",
]) includes(fn, phrase, "owner/trusted auth");

for (const phrase of [
  "approvalRequest",
  "approval_request_required",
  "owner_approval_required",
  "external_confirmation_required",
  "approval_expired",
  "preflight_passed_target_operator_execution_required",
]) includes(fn, phrase, "approval/external gates");

for (const phrase of [
  "direct_mutation_performed: false",
  "direct_domain_mutation: false",
  "highRiskExecuted: false",
  "moneyMoved: false",
]) includes(fn, phrase, "no direct high-risk execution");

for (const phrase of [
  "revoke all on table public.owner_command_requests from anon, authenticated",
  "revoke all on table public.owner_command_events from anon, authenticated",
  "revoke all on table public.owner_command_execution_steps from anon, authenticated",
  "revoke all on table public.owner_command_blockers from anon, authenticated",
  "grant select, insert, update on table public.owner_command_requests to service_role",
]) includes(migration, phrase, "RLS client write denial");

for (const phrase of [
  "OWNER_COMMAND_OWNER_JWT",
  "OWNER_COMMAND_OPERATOR_TOKEN",
  "owner_command_owner_jwt_required",
]) includes(cli, phrase, "CLI fail-closed auth");

for (const script of [
  "owner-command:classify",
  "owner-command:plan",
  "owner-command:dry-run",
  "owner-command:execute-approved",
]) includes(packageJson, `"${script}"`, "owner command package script");

for (const id of [
  "admin-owner-command-center-section",
  "owner-command-input",
  "owner-command-execute-button",
  "owner-command-blockers",
  "owner-command-proof-report",
]) includes(admin, id, "admin command UI");

for (const forbidden of [
  "stripe.transfers.create",
  "stripe.paymentLinks.create",
  "stripe.checkout.sessions.create",
  "stripe.payouts.create",
  "supabase.auth.admin",
  "createSignedUrl",
  "eas update",
  "expo publish",
  "ban_user",
  "delete_content",
  "manual_premium_grant",
]) notIncludes(fn, forbidden, "owner command function forbidden direct mutation");

for (const forbidden of [
  "OWNER_COMMAND_OPERATOR_TOKEN=",
  "OWNER_COMMAND_OWNER_JWT=",
  "service_role_key",
  "SUPABASE_SERVICE_ROLE_KEY=",
]) {
  notIncludes(cli, forbidden, "owner command CLI secret literal");
  notIncludes(runbook, forbidden, "owner command runbook secret literal");
}

for (const phrase of [
  "Owner makes judgment",
  "no god mode",
  "Level 3",
  "Level 4",
  "external confirmation",
  "routes through existing autonomous systems",
  "exact blocker",
]) includes(runbook, phrase, "owner command runbook");

if (failures.length) {
  console.error("guard:owner-command-operator failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("guard:owner-command-operator passed");
