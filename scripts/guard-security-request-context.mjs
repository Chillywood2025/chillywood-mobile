import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Security Request Context guard failed: ${message}`);
  process.exit(1);
};

const migration = read("supabase/migrations/202605230002_security_request_context_backend.sql");
const helper = read("supabase/functions/_shared/security-request-context.ts");
const ownerControls = read("supabase/functions/admin-owner-controls/index.ts");
const livekitToken = read("supabase/functions/livekit-token/index.ts");

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
  "SECURITY_CONTEXT_TRUSTED_IP_HEADERS",
  "SECURITY_CONTEXT_HASH_PEPPER",
  "captureSecurityRequestContext",
  "trusted_ip_headers_not_configured",
  "raw_ip_retained: false",
  "securityContextAuditMetadata",
].forEach((needle) => {
  if (!helper.includes(needle)) fail(`missing helper marker: ${needle}`);
});

[
  "captureSecurityRequestContext",
  "security_context_id",
  "last_security_context_id",
  "securityContextAuditMetadata",
  "owner_security_access_denied",
  "temporary_grant_revoked",
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

if (/livekit_token_request_audit[\s\S]{0,600}participantToken/i.test(livekitToken)) {
  fail("LiveKit token audit appears to write participantToken near audit insert");
}

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
