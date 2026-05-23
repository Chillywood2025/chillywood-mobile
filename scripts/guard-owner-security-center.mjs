import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Owner Security Center guard failed: ${message}`);
  process.exit(1);
};

const adminScreen = read("app/admin.tsx");
const ownerControls = read("_lib/adminOwnerControls.ts");
const ownerFunction = read("supabase/functions/admin-owner-controls/index.ts");
const migration = read("supabase/migrations/202605220004_owner_security_center.sql");

[
  "Owner Security Center",
  "CURRENT DEVICE TRUST",
  "TEMPORARY GRANTS",
  "SECURITY AUDIT",
  "LIVE OPS FLAGS",
  "SECURITY CHECKLIST",
  "EMERGENCY ACTIONS",
  "REVOKE GRANTS",
].forEach((needle) => {
  if (!adminScreen.includes(needle)) fail(`missing production UI marker: ${needle}`);
});

["Proof Roles", "Proof Grants", "Security Panel"].forEach((needle) => {
  if (adminScreen.includes(needle)) fail(`legacy placeholder label still visible: ${needle}`);
});

[
  "readOwnerSecurityStatus",
  "trustCurrentOwnerDevice",
  "revokeOwnerDevice",
  "revokeTemporaryOwnerGrant",
  "revokeAllTemporaryOwnerGrants",
  "runOwnerSecurityChecklist",
].forEach((needle) => {
  if (!ownerControls.includes(needle)) fail(`missing client wrapper: ${needle}`);
});

[
  "security_status",
  "trust_current_owner_device",
  "revoke_owner_device",
  "revoke_temporary_owner_grant",
  "revoke_all_temporary_owner_grants",
  "run_owner_security_checklist",
  "owner_required",
  "requireTrustedCurrentOwnerDevice",
  "trusted_device_required",
  "typed_confirmation_required",
  "owner_security_access_denied",
  "writeSecurityAudit",
].forEach((needle) => {
  if (!ownerFunction.includes(needle)) fail(`missing Edge Function owner security marker: ${needle}`);
});

[
  "owner_trusted_devices",
  "security_audit_events",
  "enable row level security",
  "owner_security_center_table_status",
  "revoked_reason",
].forEach((needle) => {
  const migrationText = `${migration}\n${read("supabase/migrations/202605230001_owner_security_center_hardening.sql")}`;
  if (!migrationText.includes(needle)) fail(`missing migration marker: ${needle}`);
});

[
  "UNTRUST DEVICE",
  "REVOKE GRANT",
  "REVOKE GRANTS",
  "Owner Security actions require a reason.",
  "Emergency actions require backend-verified owner access",
  "!ownerSecurityDangerActionsAvailable",
].forEach((needle) => {
  if (!adminScreen.includes(needle)) fail(`missing dangerous-action safety UI marker: ${needle}`);
});

const mobileClient = `${adminScreen}\n${ownerControls}`;
[
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "LIVEKIT_API_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "PRIVATE_KEY",
].forEach((needle) => {
  if (mobileClient.includes(needle)) fail(`private secret name referenced in mobile client: ${needle}`);
});

console.log("Owner Security Center guard passed.");
