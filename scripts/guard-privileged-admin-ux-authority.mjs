import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failures = [];
const requireText = (source, needle, message) => {
  if (!source.includes(needle)) failures.push(message);
};
const forbidText = (source, needle, message) => {
  if (source.includes(needle)) failures.push(message);
};

const admin = read("app/admin.tsx");
const moderation = read("_lib/moderation.ts");
const roleMatrix = read("_lib/platformRoleActionMatrix.ts");
const exactAuthority = read("supabase/functions/_shared/exact-subject-authority.ts");
const liveOps = read("supabase/functions/admin-live-ops-fix-center/index.ts");
const liveCost = read("supabase/functions/_shared/live-cost-guard.ts");
const legalEvidence = read("supabase/functions/admin-legal-evidence/index.ts");
const ownerControls = read("supabase/functions/admin-owner-controls/index.ts");

// Information architecture: one consolidated Admin surface, with a deliberately
// small top-level workspace set and specialized tools kept inside workspaces.
requireText(admin, "const ADMIN_MAIN_TAB_KEYS: readonly OperatorTabKey[] = [", "Admin must keep an explicit canonical top-level tab set.");
for (const key of ["home", "money-center", "users", "reports", "live-ops-fix-center", "rachi", "cognitive", "legal", "system", "owner-security"]) {
  requireText(admin, `"${key}"`, `Missing canonical Admin workspace: ${key}`);
}
for (const legacy of ["telemetry", "alerts", "automation", "incidents", "turn", "subscriptions", "creator-subs", "money-sandbox", "money-ops"]) {
  forbidText(admin, `ADMIN_MAIN_TAB_KEYS: readonly OperatorTabKey[] = [\n  \"${legacy}\"`, `Specialized ${legacy} tool must not become the first standalone Admin workspace.`);
}
requireText(admin, "visibleOperatorTabs", "Role-scoped Admin tab visibility must remain explicit.");
requireText(admin, 'accessibilityRole="tab"', "Admin main tabs must expose tab semantics to accessibility services.");
requireText(admin, "accessibilityState={{ selected: active }}", "Admin selectable navigation must expose selected state.");
requireText(admin, "admin-main-tab-", "Admin main tabs need stable test IDs for route/UX regression coverage.");
requireText(admin, "ADMIN_TAB_MAIN_GROUP", "Specialized Admin tools must remain grouped into coherent main workspaces.");

// Preserve existing client navigation without using it as server authority.
requireText(roleMatrix, "super_admin: owner", "Preserve the existing Super Admin navigation matrix.");
requireText(moderation, 'hasPlatformRoleMembership(memberships, ["owner", "super_admin"])', "Preserve existing privileged client entry points; server permissions are checked separately.");
requireText(admin, "isOwnerStaff", "Admin UI must retain an explicit true-owner-only state for break-glass/first-owner controls.");
requireText(ownerControls, 'role === "owner"', "Owner controls must retain exact true-owner checks.");

// Server authority requires the exact caller-allowed role and persisted grants.
forbidText(exactAuthority, 'roles.includes("operator")', "Exact authority must not alias Super Admin to operator.");
forbidText(exactAuthority, 'return new Set(keys);', "Roles must never synthesize requested permission grants.");
requireText(exactAuthority, '.in("role", roles)', "Role queries must use only the caller's allowed roles.");
requireText(exactAuthority, '.from("platform_staff_permission_grants")', "Permission lookup must read persisted exact-subject grants.");
requireText(exactAuthority, 'resolveExactPermissionKeys(result.data, subjectId, keys, nowMs)', "Permissions must retain subject, expiry and status checks.");
requireText(liveOps, '["owner", "super_admin", "operator"]', "Live Ops Fix Center must recognize Super Admin.");
requireText(liveOps, 'userRole !== "owner" && !(await hasActiveStaffPermission', "Every nonowner Live Ops caller must have an explicit grant.");
requireText(liveOps, '"live_ops"', "Live Ops boundary must still require live_ops permission.");
requireText(liveCost, '["owner", "super_admin", "operator"]', "Live Cost Guard must recognize Super Admin.");
forbidText(liveCost, 'role === "owner" || role === "super_admin"', "Super Admin must not bypass the Live Cost permission grant.");
requireText(liveCost, '.has("live_ops")', "Live Cost must check the explicit live_ops grant.");
forbidText(legalEvidence, 'isOwnerClassRole', "Legal evidence must not grant implicit Super Admin authority.");
requireText(legalEvidence, 'if (!canReleaseHold(auth.user))', "Legal hold release must enforce its narrower role and explicit-grant boundary.");
requireText(legalEvidence, 'user.permissions.has("legal_hold") || user.permissions.has("legal_ops")', "Super Admin hold release needs an explicit hold/operations grant.");
requireText(legalEvidence, 'role === "moderator"', "Moderator must remain denied from legal-evidence authority.");

if (failures.length) {
  console.error(JSON.stringify({ guard: "privileged-admin-ux-authority", status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  guard: "privileged-admin-ux-authority",
  status: "PASS",
  verified: [
    "consolidated-admin-information-architecture",
    "role-scoped-tab-visibility",
    "accessible-selected-tab-state",
    "stable-admin-tab-test-contracts",
    "explicit-server-permissions",
    "true-owner-only-separation",
    "live-ops-exact-authority",
    "live-cost-guard-exact-authority",
    "legal-evidence-exact-authority",
  ],
}, null, 2));
