#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const failures = [];
const fail = (message) => failures.push(message);

const admin = read("app/admin.tsx");
const registry = read("_lib/adminActionRegistry.ts");
const matrix = read("_lib/platformRoleActionMatrix.ts");
const approvalFn = read("supabase/functions/autonomous-approval-request/index.ts");
const ownerCommandFn = read("supabase/functions/owner-command-operator/index.ts");

const duplicateAdminRouteNames = [
  "admin-command-center.tsx",
  "owner-admin.tsx",
  "super-admin.tsx",
  "operator-center.tsx",
].filter((file) => existsSync(path.join(root, "app", file)));
if (duplicateAdminRouteNames.length) fail(`duplicate admin route(s): ${duplicateAdminRouteNames.join(", ")}`);

const appRoutes = readdirSync(path.join(root, "app"));
if (appRoutes.some((file) => /^admin-command-center\./.test(file))) fail("duplicate /admin-command-center route found");

const testIds = [
  ...admin.matchAll(/testID=\"([^\"]+)\"/g),
  ...admin.matchAll(/testID=\\{`([^`]+)`\\}/g),
].map((match) => match[1]);
const actionIds = [...new Set(testIds)].filter((id) => (
  !/-chips$/.test(id)
  && (
    id.includes("button")
    || id.includes("chip")
    || id.includes("main-tab")
    || id.includes("target-${")
    || id.includes("permission-${")
    || id.includes("recent-${")
  )
));
const ignored = [
  /admin-staff-grant-confirm-modal/,
  /admin-staff-revoke-confirm-modal/,
  /admin-role-confirm-modal/,
];
for (const id of actionIds) {
  if (ignored.some((pattern) => pattern.test(id))) continue;
  if (!registry.includes(id)) fail(`visible action/tap testID is not registered: ${id}`);
}

for (const phrase of [
  "canApproveAutonomousRequests",
  "canUseOwnerCommandCenter",
  "canMoveMoney",
  "canGrantPremium",
  "canPublishOrRollbackRelease",
  "canMutateAuthRls",
  "canEnforceUserRestriction",
]) {
  if (!matrix.includes(phrase)) fail(`role matrix missing ${phrase}`);
}

for (const phrase of [
  "owner_or_super_admin_required",
  "self_approval_denied",
  "secret_like_payload_blocked",
  "Fresh preflight is still required",
]) {
  if (!approvalFn.includes(phrase)) fail(`autonomous approval function missing ${phrase}`);
}

for (const phrase of [
  "owner_or_super_admin_required",
  "owner_approval_required",
  "external_confirmation_required",
  "direct_domain_mutation: false",
  "highRiskExecuted: false",
  "moneyMoved: false",
]) {
  if (!ownerCommandFn.includes(phrase)) fail(`owner command function missing ${phrase}`);
}

if (/testID="(?:manual-premium-grant|premium-grant|payout-release|mark-paid|send-money|create-payment-link|publish-production-ota|rollback-production-ota|ban-user|delete-content|broad-push-campaign)-button"/i.test(admin)) {
  fail("admin UI contains forbidden high-risk active button testID");
}

for (const handler of [
  "manualPremiumGrant",
  "releasePayout",
  "markPayoutPaid",
  "sendMoney",
  "createPaymentLink",
  "publishProductionOtaNow",
  "rollbackProductionOtaNow",
  "banUserNow",
  "deleteContentNow",
]) {
  if (admin.includes(handler)) fail(`admin UI contains forbidden direct high-risk handler: ${handler}`);
}

if (failures.length) {
  console.error("guard:owner-admin-moderator-tap-policy failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("guard:owner-admin-moderator-tap-policy passed");
