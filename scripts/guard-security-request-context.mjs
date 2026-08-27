import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Security Request Context guard failed: ${message}`);
  process.exit(1);
};

const migration = read("supabase/migrations/202605230002_security_request_context_backend.sql");
const expansionMigration = read("supabase/migrations/202605230003_security_context_event_link_expansion.sql");
const validatorFixMigration = read("supabase/migrations/202605230004_fix_security_context_metadata_validator.sql");
const trustedProofMigration = read("supabase/migrations/202605230005_trusted_network_proof_contract.sql");
const helper = read("supabase/functions/_shared/security-request-context.ts");
const ownerControls = read("supabase/functions/admin-owner-controls/index.ts");
const livekitToken = read("supabase/functions/livekit-token/index.ts");
const liveOpsFixCenter = read("supabase/functions/admin-live-ops-fix-center/index.ts");
const mediaStorage = read("supabase/functions/media-storage/index.ts");
const adminUi = read("app/admin.tsx");
const adminOwnerControlsClient = read("_lib/adminOwnerControls.ts");

[
  "create table if not exists public.\"security_request_context\"",
  "\"ip_hash\" text not null",
  "\"ip_prefix_or_masked_ip\" text",
  "\"capture_status\" text",
  "alter table public.\"security_request_context\" enable row level security",
  "revoke all on table public.\"security_request_context\" from \"anon\", \"authenticated\"",
  "get_security_request_context_summary",
  "add column if not exists \"security_context_id\"",
  "create table if not exists public.\"livekit_token_request_audit\"",
  "prevent_livekit_token_request_audit_mutation",
].forEach((needle) => {
  if (!migration.includes(needle)) fail(`missing migration marker: ${needle}`);
});

[
  "security_context_id_from_metadata",
  "dmca_cases",
  "dmca_audit_log",
  "safety_reports",
  "admin_live_ops_action_audit",
  "admin_live_cost_guard_events",
  "admin_live_cost_guard_actions",
  "creator_payout_audit_log",
  "network_billing_audit_logs",
  "fraud_audit_logs",
  "platform_staff_role_audit",
  "media_security_audit_events",
].forEach((needle) => {
  if (!expansionMigration.includes(needle)) fail(`missing expansion migration marker: ${needle}`);
});

if (/\"ip_address\"|\"raw_ip\"|ip_address_encrypted/i.test(expansionMigration)) {
  fail("event-link expansion migration must not add raw IP storage");
}

if (!validatorFixMigration.includes('context."user_id" = auth.uid()')) {
  fail("security context validator fix must compare uuid user_id to auth.uid()");
}

[
  "network_proof_verified",
  "signed_chillywood_proxy",
  "get_security_request_context_summary",
].forEach((needle) => {
  if (!trustedProofMigration.includes(needle)) fail(`missing trusted proof migration marker: ${needle}`);
});

[
  "x-chillywood-network-proof",
  "x-chillywood-network-proof-signature",
  "x-chillywood-network-proof-timestamp",
  "x-chillywood-network-proof-version",
  "CHILLYWOOD_NETWORK_PROOF_SECRET",
  "SECURITY_CONTEXT_HASH_PEPPER",
  "captureSecurityRequestContext",
  "verifySignedNetworkProof",
  "spoofable_client_ip_headers_ignored",
  "network_proof_verified",
  "raw_ip_retained: false",
  "securityContextAuditMetadata",
].forEach((needle) => {
  if (!helper.includes(needle)) fail(`missing helper marker: ${needle}`);
});

if (/captured_from_trusted_header|DEFAULT_TRUSTED_IP_HEADERS|SECURITY_CONTEXT_TRUSTED_IP_HEADERS/.test(helper)) {
  fail("helper must not capture network proof from direct trusted IP headers");
}

[
  "captureSecurityRequestContext",
  "security_context_id",
  "last_security_context_id",
  "securityContextAuditMetadata",
  "owner_security_access_denied",
  "temporary_grant_revoked",
  "networkProof",
  "get_security_request_context_summary",
].forEach((needle) => {
  if (!ownerControls.includes(needle)) fail(`missing owner controls linkage: ${needle}`);
});

[
  "captureSecurityRequestContext",
  "writeLiveKitTokenRequestAudit",
  "livekit_token_request_audit",
  "token_stored: false",
  "participantToken",
].forEach((needle) => {
  if (!livekitToken.includes(needle)) fail(`missing LiveKit audit marker: ${needle}`);
});

[
  "captureSecurityRequestContext",
  "security_context_id",
  "securityContextAuditMetadata",
].forEach((needle) => {
  if (!liveOpsFixCenter.includes(needle)) fail(`missing Live Ops security context marker: ${needle}`);
});

[
  "captureSecurityRequestContext",
  "media_security_audit_events",
  "security_context_id",
  "object_key_owner",
].forEach((needle) => {
  if (!mediaStorage.includes(needle)) fail(`missing media security context marker: ${needle}`);
});

if (/livekit_token_request_audit[\s\S]{0,600}participantToken/i.test(livekitToken)) {
  fail("LiveKit token audit appears to write participantToken near audit insert");
}

[
  "OwnerSecurityNetworkProof",
  "networkProof?: OwnerSecurityNetworkProof | null",
].forEach((needle) => {
  if (!adminOwnerControlsClient.includes(needle)) fail(`missing owner security network proof client type: ${needle}`);
});

[
  "formatOwnerSecurityNetworkProof",
  "Network Verification",
  "No security context linked",
].forEach((needle) => {
  if (!adminUi.includes(needle)) fail(`missing Owner Security masked network proof UI marker: ${needle}`);
});

const walk = (dir, files = []) => {
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    if (path.startsWith("artifacts") || path.startsWith("supabase/.temp")) continue;
    const absolute = join(root, path);
    const stat = statSync(absolute);
    if (stat.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
};

const publicClientText = walk("app")
  .concat(walk("components"), walk("_lib"))
  .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path))
  .map((path) => read(path))
  .join("\n");

[
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "request_ip",
  "ip_address",
  "submitted_ip_hash",
].forEach((needle) => {
  if (publicClientText.toLowerCase().includes(needle)) {
    fail(`mobile/public client references trusted IP marker: ${needle}`);
  }
});

console.log("Security Request Context guard passed.");
