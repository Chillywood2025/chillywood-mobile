#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`guard:role-terminology-policy failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) fail(`missing ${label}: ${needle}`);
};
const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) fail(`forbidden ${label}: ${needle}`);
};

const lock = read("docs/admin/ROLE_TERMINOLOGY_LOCK.md");
const adminScope = read("docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md");
const ownerTools = read("docs/admin/OWNER_ADMIN_CONTROL_TOOLS.md");
const moderation = read("docs/legal/MODERATION_REPORTING_WORKFLOW.md");
const moneySupport = read("docs/support/MONEY_SUPPORT_WORKFLOW.md");
const platformRoles = read("docs/admin/PLATFORM_ROLES.md");
const readiness = read("docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md");
const nextTask = read("NEXT_TASK.md");
const roadmap = read("ROADMAP.md");
const adminUi = read("app/admin.tsx");
const appConfig = read("_lib/appConfig.ts");
const adminMoneySandbox = read("app/admin-money-sandbox-purchases.tsx");
const channelSettings = read("app/channel-settings.tsx");
const edge = read("supabase/functions/admin-owner-controls/index.ts");
const staffMigration = read("supabase/migrations/202605140008_platform_staff_role_management.sql");
const adminMigration = read("supabase/migrations/20260625184725_admin_role_scope_permissions.sql");

const currentDocs = [
  lock,
  adminScope,
  ownerTools,
  moderation,
  moneySupport,
  platformRoles,
  readiness,
  nextTask,
  roadmap,
].join("\n");
const uiText = [adminUi, appConfig, adminMoneySandbox, channelSettings, edge].join("\n");
const roleNormalizer = staffMigration.match(/create or replace function public\."platform_staff_normalize_role"[\s\S]+?\$\$;/)?.[0] ?? staffMigration;

assertIncludes(lock, "Product-Facing Hierarchy", "product hierarchy section");
assertIncludes(lock, "First Owner", "First Owner role");
assertIncludes(lock, "Owner", "Owner role");
assertIncludes(lock, "Admin", "Admin role");
assertIncludes(lock, "Moderator", "Moderator role");
assertIncludes(lock, "Creator", "Creator role");
assertIncludes(lock, "User", "User role");
assertIncludes(lock, "Operator is an internal/backend alias for Admin", "operator internal Admin doctrine");
assertIncludes(lock, "Admin is the product-facing role name", "Admin product-facing doctrine");
assertIncludes(currentDocs, "There is no separate product Operator role", "no product Operator role doctrine");
assertIncludes(lock, "Support is a work area, not a separate role.", "Support work-area doctrine");
assertIncludes(currentDocs, "Support is a work area", "Support work-area docs");
assertIncludes(lock, "Moderator includes support duties when granted exact support scopes", "Moderator support-duty doctrine");
assertIncludes(lock, "Moderator is separate from Admin/operator", "Moderator separate doctrine");
if (
  !(nextTask + roadmap + lock).includes("Next lane: Moderator role scope including support duties.")
  && !(nextTask + roadmap + lock).includes("Next lane: real staff grant/readback only when Owner selects the actual Moderator accounts and exact scopes.")
  && !(nextTask + roadmap + lock).includes("Next lane: Return to final production readiness checklist and app-controlled launch blockers, excluding known Google Play base-plan provider blocker.")
) {
  fail("missing next lane recommendation");
}

for (const scope of [
  "support_inbox",
  "creator_support",
  "billing_support_read",
  "admin.support.view",
  "admin.support.manage",
  "admin.payment_status.view",
  "admin.refund_status.record",
]) {
  assertIncludes(currentDocs + adminMigration + edge, scope, `support permission scope ${scope}`);
}

assertIncludes(roleNormalizer, "when 'admin' then 'operator'", "admin maps to operator");
assertIncludes(roleNormalizer, "when 'operator' then 'operator'", "operator role preserved");
assertIncludes(roleNormalizer, "when 'moderator' then 'moderator'", "moderator role preserved");
assertNotIncludes(roleNormalizer, "when 'support' then", "support role normalizer");
assertNotIncludes(staffMigration + adminMigration, "\"role\" in ('owner', 'operator', 'moderator', 'support')", "support role constraint");
assertNotIncludes(staffMigration + adminMigration, "role = 'support'", "support role mutation");

for (const phrase of [
  "Operator Center",
  "Owner / Operator",
  "Admin/Operator",
  "Operator Ready",
  "Operator-only",
  "Loading operator access",
  "Sign in to access the Operator",
  "private operator surface",
  "private operator data",
  "operator action",
  "operator network",
]) {
  assertNotIncludes(uiText, phrase, `product-facing Operator copy ${phrase}`);
}

assertIncludes(uiText, "Admin Command Center", "Admin product-facing UI label");
assertIncludes(edge, "Legal Admin Workflow", "legal template Admin display label");
assertIncludes(edge, "Live Ops Admin Workflow", "live ops template Admin display label");
assertIncludes(edge, "Support Workflow", "support workflow display label");
assertNotIncludes(edge, "Legal Operator", "legal Operator template label");
assertNotIncludes(edge, "Live Ops Operator", "live ops Operator template label");
assertNotIncludes(edge, "Support Agent", "Support Agent role-like template label");

assertNotIncludes(lock, "Moderator equals Admin", "Moderator/Admin merge");
assertNotIncludes(lock, "Moderator cannot have support duties", "Moderator support-duty denial");
assertIncludes(lock, "Moderator cannot enable money/provider/payout systems", "Moderator money denial");
assertIncludes(lock, "Moderator cannot execute provider refunds", "Moderator refund denial");
assertIncludes(readiness, "Payouts, Stripe payouts, merch checkout", "money off-state unchanged");

console.log("guard:role-terminology-policy passed");
