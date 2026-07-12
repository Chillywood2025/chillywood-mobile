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

const matrix = read("_lib/platformRoleActionMatrix.ts");
const registry = read("_lib/adminActionRegistry.ts");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const admin = read("app/admin.tsx");
const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");

for (const required of [
  "Moderator can perform support duties only with exact support scopes",
  "Moderator cannot enable money/provider/payout systems",
  "Moderator cannot execute provider refunds",
  "Moderator private-data access is minimum necessary and case-scoped",
]) requireText("moderator doc", moderatorDoc, required);

for (const required of [
  "moderator",
  "canViewModerationQueue",
  "canModerateContent",
  "canApproveAutonomousRequests",
  "canUseOwnerCommandCenter",
]) requireText("role matrix", matrix, required);

for (const required of [
  "moderation.report_target.hide",
  "moderation.report_target.remove",
  "moderation.report.escalate",
  "approval_request_only",
  "Moderation actions require exact scope",
]) requireText("admin registry moderation", registry, required);

for (const required of [
  "requested_by_actor_id",
  "self_approval_denied",
  "owner_or_super_admin_required",
]) requireText("approval function", approvalFn, required);

forbidRegex("admin UI", admin, /moderator[\s\S]{0,120}(approve_request|autonomous-approval-approve-button)/i, "moderator approval path");
forbidRegex("registry", registry, /enabledForRoles:\s*\[[^\]]*"moderator"[^\]]*\][\s\S]{0,240}actionId:\s*"autonomous\.approval\.approve"/i, "moderator autonomous approval");
forbidRegex("registry", registry, /actionId:\s*"staff\.role\.grant"[\s\S]{0,300}enabledForRoles:\s*\[[^\]]*"moderator"/i, "moderator staff grant");
forbidRegex("registry", registry, /actionId:\s*"money\.[^"]*"[\s\S]{0,300}directExecutionAllowed:\s*true[\s\S]{0,120}highRisk:\s*true/i, "moderator/high-risk money direct execution");
forbidRegex("moderator doc", moderatorDoc, /Moderator can (?:approve autonomous|grant Owner|grant Admin|move money|grant Premium|publish OTA|rollback OTA)/i, "moderator broad authority claim");

if (failures.length) {
  console.error("guard:moderator-autonomous-boundaries failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("guard:moderator-autonomous-boundaries passed");
