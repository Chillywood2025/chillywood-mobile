#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  lock: "docs/admin/ROLE_TERMINOLOGY_LOCK.md",
  adminScope: "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  ownerTools: "docs/admin/OWNER_ADMIN_CONTROL_TOOLS.md",
  fullQa: "docs/OWNER_ADMIN_FULL_SURFACE_QA.md",
  searchAudit: "docs/OWNER_ADMIN_SEARCH_PERMISSION_AUDIT_HARDENING.md",
  moderation: "docs/legal/MODERATION_REPORTING_WORKFLOW.md",
  moneySupport: "docs/support/MONEY_SUPPORT_WORKFLOW.md",
  platformRoles: "docs/admin/PLATFORM_ROLES.md",
  nextTask: "NEXT_TASK.md",
  roadmap: "ROADMAP.md",
  readiness: "docs/FINAL_PRODUCTION_READINESS_CHECKLIST.md",
  adminUi: "app/admin.tsx",
  appConfig: "_lib/appConfig.ts",
  adminMoneySandbox: "app/admin-money-sandbox-purchases.tsx",
  channelSettings: "app/channel-settings.tsx",
  edge: "supabase/functions/admin-owner-controls/index.ts",
  staffMigration: "supabase/migrations/202605140008_platform_staff_role_management.sql",
  adminScopeMigration: "supabase/migrations/20260625184725_admin_role_scope_permissions.sql",
};

const text = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, exists(file) ? read(file) : ""]),
);

const checks = [];
const add = (key, ok, detail) => checks.push({ detail, key, ok: Boolean(ok) });
const hasAll = (haystack, needles) => needles.every((needle) => haystack.includes(needle));
const hasNone = (haystack, needles) => needles.every((needle) => !haystack.includes(needle));

const currentDocs = [
  text.lock,
  text.adminScope,
  text.ownerTools,
  text.fullQa,
  text.searchAudit,
  text.moderation,
  text.moneySupport,
  text.platformRoles,
  text.nextTask,
  text.roadmap,
  text.readiness,
].join("\n");

const uiText = [
  text.adminUi,
  text.appConfig,
  text.adminMoneySandbox,
  text.channelSettings,
  text.edge,
].join("\n");

const roleNormalizer = text.staffMigration.match(/create or replace function public\."platform_staff_normalize_role"[\s\S]+?\$\$;/)?.[0] ?? text.staffMigration;
const roleAuditChecks = [text.staffMigration, text.adminScopeMigration].join("\n");

const forbiddenProductOperatorLabels = [
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
];

const forbiddenSupportRoleNormalizers = [
  "when 'support' then",
  "\"role\" in ('owner', 'operator', 'moderator', 'support')",
  "\"role\" in ('owner', 'operator', 'support', 'moderator')",
  "role = 'support'",
  "role = \"support\"",
];

const supportScopes = [
  "support_inbox",
  "creator_support",
  "billing_support_read",
  "admin.support.view",
  "admin.support.manage",
  "admin.payment_status.view",
  "admin.refund_status.record",
];

add("lock_doc_exists", exists(files.lock), "Role terminology lock doc exists.");
add("operator_internal_admin", hasAll(text.lock, ["Operator is an internal/backend alias for Admin", "Admin is the product-facing role name"]), "Lock doc states operator is internal Admin and Admin is product-facing.");
add("no_product_operator", currentDocs.includes("There is no separate product Operator role"), "Current docs state there is no separate product Operator role.");
add("support_work_area", hasAll(text.lock + text.moneySupport + text.adminScope, ["Support is a work area", "not a separate role"]), "Docs state Support is a work area, not a separate role.");
add("moderator_support_capable", hasAll(text.lock + text.moderation + text.moneySupport, ["Moderator includes support duties", "granted exact support scopes"]), "Docs state Moderator can handle support duties through exact scopes.");
add("moderator_separate", (text.lock + text.adminScope).includes("Moderator is separate from Admin"), "Docs state Moderator is separate from Admin/operator.");
add(
  "next_lane",
  currentDocs.includes("Next lane: Moderator role scope including support duties.")
    || currentDocs.includes("Next lane: real staff grant/readback only when Owner selects the actual Moderator accounts and exact scopes.")
    || currentDocs.includes("Next lane: Return to final production readiness checklist and app-controlled launch blockers, excluding known Google Play base-plan provider blocker."),
  "Next lane recommendation is recorded.",
);
add("support_scopes_preserved", hasAll(currentDocs + text.adminScopeMigration + text.edge, supportScopes), "Support remains represented as permission scopes/workflows.");
add("operator_role_preserved", hasAll(roleNormalizer, ["when 'admin' then 'operator'", "when 'operator' then 'operator'", "when 'moderator' then 'moderator'"]), "Backend role normalizer preserves admin->operator and moderator.");
add("support_role_not_added", hasNone(roleNormalizer + roleAuditChecks, forbiddenSupportRoleNormalizers), "Backend migrations do not add support as a platform role.");
add("ui_admin_label", uiText.includes("Admin Command Center") && !uiText.includes("Chi'llywood Operator Center"), "User-facing Admin UI uses Admin Command Center.");
add("ui_no_product_operator_copy", hasNone(uiText, forbiddenProductOperatorLabels), "User-facing UI copy does not present Operator as a product role.");
add("template_labels_safe", hasAll(text.edge, ["Legal Admin Workflow", "Live Ops Admin Workflow", "Support Workflow"]) && !hasAll(text.edge, ["Legal Operator", "Live Ops Operator", "Support Agent"]), "Permission template display labels use Admin/workflow terminology.");
add("no_money_activation", hasAll(text.lock, ["Moderator cannot enable money/provider/payout systems", "Moderator cannot execute provider refunds"]) && text.readiness.includes("Payouts, Stripe payouts, merch checkout"), "Terminology lane does not authorize money/provider/payout activation.");

const failed = checks.filter((check) => !check.ok);
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = path.join("/tmp", `app-role-terminology-lock-proof-${timestamp}`);
fs.mkdirSync(artifactDir, { recursive: true });

const report = [
  "# Role Terminology Lock Proof",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Passed: ${checks.length - failed.length}`,
  `Failed: ${failed.length}`,
  "",
  "## Checks",
  "",
  ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.key}: ${check.detail}`),
  "",
  "## Safety",
  "",
  "- No provider dashboard mutation.",
  "- No backend role rename.",
  "- No support backend role creation.",
  "- No money/provider/payout activation.",
  "- Static repo proof only.",
  "",
].join("\n");

fs.writeFileSync(path.join(artifactDir, "README.md"), report);
fs.writeFileSync(path.join(artifactDir, "terminology-matrix.json"), JSON.stringify({
  backendMapping: {
    owner: "Owner / First Owner authority layer",
    operator: "Admin",
    moderator: "Moderator with scoped support-duty capability",
  },
  productHierarchy: ["First Owner", "Owner", "Admin", "Moderator", "Creator", "User"],
  supportScopes,
}, null, 2));

console.log(JSON.stringify({
  artifact: artifactDir,
  failed: failed.length,
  passed: checks.length - failed.length,
  total: checks.length,
}, null, 2));

if (failed.length) {
  for (const check of failed) console.error(`FAIL ${check.key}: ${check.detail}`);
  process.exit(1);
}
