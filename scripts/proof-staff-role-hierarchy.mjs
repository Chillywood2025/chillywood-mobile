#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  adminDoc: "docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md",
  adminUi: "app/admin.tsx",
  firstOwnerDoc: "docs/admin/FIRST_OWNER_AUTHORITY_AND_SUCCESSION.md",
  firstOwnerMigration: "supabase/migrations/20260625131000_first_owner_authority_succession.sql",
  hierarchyDoc: "docs/admin/STAFF_ROLE_HIERARCHY_PROOF.md",
  moderatorDoc: "docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md",
  moderatorMigration: "supabase/migrations/20260625192527_moderator_role_scope_support_duties.sql",
  packageJson: "package.json",
  roleLock: "docs/admin/ROLE_TERMINOLOGY_LOCK.md",
  roleMigration: "supabase/migrations/202605140008_platform_staff_role_management.sql",
  scopeMigration: "supabase/migrations/20260625184725_admin_role_scope_permissions.sql",
};

const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, exists(file) ? read(file) : ""]));
const checks = [];
const add = (key, ok, detail) => checks.push({ key, ok: Boolean(ok), detail });
const hasAll = (haystack, needles) => needles.every((needle) => haystack.includes(needle));
const hasNone = (haystack, needles) => needles.every((needle) => !haystack.includes(needle));

const roleNormalizer = text.roleMigration.match(/create or replace function public\."platform_staff_normalize_role"[\s\S]+?\$\$;/)?.[0] ?? text.roleMigration;
const currentDocs = [text.hierarchyDoc, text.roleLock, text.firstOwnerDoc, text.adminDoc, text.moderatorDoc].join("\n");
const migrations = [text.roleMigration, text.scopeMigration, text.firstOwnerMigration, text.moderatorMigration].join("\n");

const requiredScripts = [
  "proof:first-owner-authority",
  "guard:first-owner-authority-policy",
  "proof:admin-role-scope",
  "guard:admin-role-scope-policy",
  "proof:moderator-role-scope",
  "guard:moderator-role-scope-policy",
  "proof:role-terminology-lock",
  "guard:role-terminology-policy",
  "proof:staff-role-hierarchy",
  "guard:staff-role-hierarchy-policy",
];

add("proof_doc_exists", text.hierarchyDoc.includes("Staff role hierarchy proof: Closed"), "Final staff hierarchy proof doc exists and is closed.");
add("product_hierarchy", hasAll(text.hierarchyDoc, ["First Owner", "Owner", "Admin", "Moderator", "Creator", "User"]), "Product-facing hierarchy is documented.");
add("operator_admin", hasAll(text.hierarchyDoc + text.roleLock, ["operator is the internal/backend alias for Admin", "Admin is the product-facing role"]), "operator = internal/backend Admin is documented.");
add("support_not_role", hasAll(text.hierarchyDoc + text.roleLock, ["support is not a backend role", "Support is a work area and permission group"]) || hasAll(text.hierarchyDoc + text.roleLock, ["`support` is not a backend role", "Support is a work area and permission group"]), "Support work-area doctrine is documented.");
add("moderator_support", hasAll(text.hierarchyDoc + text.moderatorDoc, ["Moderator includes support duties only through exact scopes", "Moderator is separate from Admin/operator"]), "Moderator support-duty doctrine is documented.");
add("source_docs_exist", [files.firstOwnerDoc, files.adminDoc, files.moderatorDoc, files.roleLock].every(exists), "First Owner, Admin, Moderator, and role lock docs exist.");
add("role_values_preserved", hasAll(roleNormalizer, ["when 'owner' then 'owner'", "when 'admin' then 'operator'", "when 'operator' then 'operator'", "when 'moderator' then 'moderator'"]), "Role normalizer preserves owner/operator/moderator.");
add("support_role_absent", hasNone(roleNormalizer + migrations, ["when 'support' then", "\"role\" in ('owner', 'operator', 'moderator', 'support')", "role = 'support'", "role = \"support\""]), "Migrations do not add support as a staff role.");
add("first_owner_authority", hasAll(text.firstOwnerMigration + text.firstOwnerDoc, ["first_owner_grant_owner_by_email", "first_owner_revoke_owner_by_email", "first_owner_complete_self_step_down", "first_owner_required", "password re-auth", "single-use passcode"]), "First Owner owns Owner succession.");
add("admin_owner_forbidden", hasAll(text.adminDoc + text.firstOwnerMigration, ["Admin cannot grant or revoke Owner", "Admin cannot alter First Owner succession", "first_owner_required"]), "Admin cannot alter Owner/First Owner authority.");
add("moderator_owner_admin_forbidden", hasAll(text.moderatorDoc + text.moderatorMigration, ["Moderator cannot grant or revoke Owner", "Moderator cannot grant or revoke Admin/operator", "v_actor_role = 'operator' and v_target_role = 'moderator' and public.has_platform_permission('manage_moderators')"]) && !text.moderatorMigration.includes("v_actor_role = 'moderator' and v_target_role"), "Moderator cannot grant/revoke Owner/Admin/operator.");
add("first_owner_target_protected", hasAll(text.scopeMigration + text.adminDoc + text.moderatorDoc, ["first_owner_target_protected", "public.is_first_owner(v_target, null)", "Moderator cannot remove, demote, delete, deactivate, or suspend First Owner"]), "First Owner target is protected from staff destructive actions.");
add("money_forbidden", hasAll(currentDocs, ["Admin and Moderator cannot enable money/provider/payout systems", "Admin and Moderator cannot execute provider refunds"]) && hasAll(text.adminDoc + text.moderatorDoc, ["premium.public.activate", "creator_money.activate", "provider.refund.execute"]), "Admin/Moderator money/provider/payout/refund boundaries are documented.");
add("ui_operator_not_product", hasAll(text.adminUi, ["Admin Command Center", "Admin center label", "Admin center helper copy"]) && !text.adminUi.includes("Operator center label") && !text.adminUi.includes("Operator center helper copy"), "UI does not present Operator as product role.");
add("proof_guard_scripts", requiredScripts.every((script) => text.packageJson.includes(script)), "First Owner/Admin/Moderator/terminology/hierarchy proof and guard scripts are present.");
add("no_backend_role_rename", hasAll(text.hierarchyDoc, ["No backend role values were renamed", "No separate Operator or Support product roles exist"]), "No backend role rename is documented.");

const failed = checks.filter((check) => !check.ok);
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const artifactDir = process.env.STAFF_ROLE_HIERARCHY_ARTIFACT_DIR || path.join("/tmp", `app-staff-role-hierarchy-proof-run-${timestamp}`);
fs.mkdirSync(artifactDir, { recursive: true });

const report = [
  "# Staff Role Hierarchy Proof",
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
fs.writeFileSync(path.join(artifactDir, "final-hierarchy-matrix.json"), JSON.stringify({
  backendMapping: {
    owner: "Owner / First Owner authority layer",
    operator: "Admin",
    moderator: "Moderator",
  },
  productHierarchy: ["First Owner", "Owner", "Admin", "Moderator", "Creator", "User"],
  support: "work area / permission group, not a staff role",
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
