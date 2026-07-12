#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const requireText = (label, source, needle) => {
  if (!source.includes(needle)) failures.push(`${label} missing ${needle}`);
};
const forbidText = (label, source, needle) => {
  if (source.includes(needle)) failures.push(`${label} must not include ${needle}`);
};

const matrix = read("_lib/platformRoleActionMatrix.ts");
const registry = read("_lib/adminActionRegistry.ts");
const moderatorDoc = read("docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md");
const approval = read("_lib/autonomousApprovalRequests.ts");
const ownerAuthority = read("_lib/platformOwnerAuthority.ts");
const moderationOperator = read("_lib/moderationSafetyOperator.ts");

for (const phrase of [
  "Moderator can perform support duties only with exact support scopes",
  "Moderator is separate from Admin/operator",
  "Moderator cannot enable money/provider/payout systems",
  "Moderator cannot execute provider refunds",
  "Moderator cannot perform account-wide suspension/restoration by default",
  "Moderator private-data access is minimum necessary and case-scoped",
]) requireText("moderator doctrine", moderatorDoc, phrase);

for (const phrase of [
  "canApproveAutonomousRequests",
  "canUseOwnerCommandCenter",
  "canMoveMoney",
  "canGrantPremium",
  "canPublishOrRollbackRelease",
  "canMutateAuthRls",
  "canSendBroadNotification",
]) requireText("matrix boundary", matrix, phrase);

for (const phrase of [
  "Rachi can request/recommend but cannot approve itself.",
  "Autonomous operators cannot approve their own Level 3/4 requests.",
  "requestedByActorType === \"rachi\"",
  "AUTONOMOUS_APPROVAL_REQUESTER_ACTORS",
  "isAutonomousRequesterActor",
  "\"money_flow_control\"",
  "\"owner_command_operator\"",
]) requireText("autonomous approval self-approval guard", approval, phrase);

for (const phrase of [
  "hasOwnerOrSuperAdminAuthority",
  "canUserApproveAutonomousRequest",
  "owner",
  "super_admin",
]) requireText("owner authority helper", ownerAuthority, phrase);

for (const phrase of [
  "ban_suspend_restrict_or_delete_content",
  "approvalLevel: 3",
  "moderation_required_review_flags",
  "safety_review_recommendations",
]) requireText("moderation safety operator", moderationOperator, phrase);

for (const forbidden of [
  "moderator: owner",
  "Moderator can grant Owner",
  "Moderator can approve autonomous requests",
  "moderator can approve autonomous requests",
]) forbidText("moderator boundary text", `${matrix}\n${registry}\n${moderatorDoc}`, forbidden);

if (failures.length) {
  console.error("proof:moderator-autonomous-boundaries failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("proof:moderator-autonomous-boundaries passed");
