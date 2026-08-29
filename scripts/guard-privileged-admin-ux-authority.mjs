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

// Canonical role semantics: Super Admin is Owner-equivalent for ordinary
// privileged work, while true-owner-only controls remain a separate boundary.
requireText(roleMatrix, "super_admin: owner", "Role matrix must preserve Super Admin -> Owner authority equivalence.");
requireText(moderation, 'hasPlatformRoleMembership(memberships, ["owner", "super_admin"])', "Client authority must recognize Owner and Super Admin together.");
requireText(admin, "isOwnerStaff", "Admin UI must retain an explicit true-owner-only state for break-glass/first-owner controls.");
requireText(ownerControls, 'role === "owner"', "Owner controls must retain exact true-owner checks.");

// Server parity: Super Admin may cross permission-scoped operator boundaries,
// but exact owner-only callers that do not allow operator remain owner-only.
requireText(exactAuthority, 'roles.includes("operator")', "Exact authority helper must support the scoped Super Admin compatibility path.");
requireText(exactAuthority, 'hasExactActiveRole(rows, subjectId, "super_admin"', "Exact authority helper must verify active Super Admin membership.");
requireText(exactAuthority, 'return new Set(keys);', "Super Admin must receive owner-equivalent scoped permission keys server-side.");
requireText(liveOps, '["owner", "super_admin", "operator"]', "Live Ops Fix Center must recognize Super Admin.");
requireText(liveOps, 'userRole === "operator"', "Live Ops operators must remain permission-scoped.");
requireText(liveOps, '"live_ops"', "Live Ops operator boundary must still require live_ops permission.");
requireText(liveCost, '["owner", "super_admin", "operator"]', "Live Cost Guard must recognize Super Admin.");
requireText(liveCost, 'role === "owner" || role === "super_admin"', "Live Cost Guard must preserve Owner/Super Admin parity.");
requireText(legalEvidence, 'isOwnerClassRole', "Legal evidence must use a single Owner/Super Admin owner-class predicate.");
requireText(legalEvidence, 'error: "owner_or_super_admin_required"', "Legal hold release must explicitly enforce Owner/Super Admin authority.");
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
    "owner-super-admin-parity",
    "true-owner-only-separation",
    "live-ops-exact-authority",
    "live-cost-guard-exact-authority",
    "legal-evidence-exact-authority",
  ],
}, null, 2));
