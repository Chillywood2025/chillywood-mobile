import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`Security Context proxy proof guard failed: ${message}`);
  process.exit(1);
};

const helper = read("supabase/functions/_shared/security-request-context.ts");
const ownerControls = read("supabase/functions/admin-owner-controls/index.ts");
const adminUi = read("app/admin.tsx");
const adminOwnerControlsClient = read("_lib/adminOwnerControls.ts");

[
  "SECURITY_CONTEXT_TRUSTED_IP_HEADERS",
  "SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS",
  "trusted_ip_headers_not_configured",
  "trusted_ip_header_missing",
  "trusted_ip_header_malformed",
  "raw_ip_retained: false",
].forEach((needle) => {
  if (!helper.includes(needle)) fail(`missing explicit trusted-header/fallback marker: ${needle}`);
});

if (!/return \["1", "true", "yes"\]\.includes\(enableDefaults\) \? \[\.\.\.DEFAULT_TRUSTED_IP_HEADERS\] : \[\]/.test(helper)) {
  fail("default proxy headers must remain disabled unless explicitly enabled server-side");
}

[
  "securityContextFilter",
  "get_security_request_context_summary",
  "livekit_token_request_audit",
  "securityContextIdShort",
].forEach((needle) => {
  if (!ownerControls.includes(needle)) fail(`missing Audit Explorer masked context backend marker: ${needle}`);
});

[
  "OwnerSecurityNetworkProof",
  "securityContext?: OwnerSecurityNetworkProof | null",
  "securityContextIdShort?: string | null",
].forEach((needle) => {
  if (!adminOwnerControlsClient.includes(needle)) fail(`missing safe network proof client type marker: ${needle}`);
});

[
  "auditExplorerNetworkFilterOptions",
  "Has Proof",
  "Missing Proof",
  "Network Proof",
  "formatOwnerSecurityNetworkProof",
].forEach((needle) => {
  if (!adminUi.includes(needle)) fail(`missing Audit Explorer masked proof UI marker: ${needle}`);
});

if (/Raw IP|Full IP|ipHashShort/.test(adminUi)) {
  fail("admin UI must not render raw/full IP or IP hash fields");
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

const publicClientFiles = walk("app")
  .concat(walk("components"), walk("_lib"))
  .filter((path) => /\.(ts|tsx|js|jsx)$/.test(path));

const publicClientText = publicClientFiles.map((path) => read(path)).join("\n").toLowerCase();

[
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "request_ip",
  "ip_address",
  "submitted_ip_hash",
  "trusted_ip",
].forEach((needle) => {
  if (publicClientText.includes(needle)) {
    fail(`mobile/public client references trusted IP marker: ${needle}`);
  }
});

const nonAdminPublicText = publicClientFiles
  .filter((path) => path !== "app/admin.tsx" && path !== "_lib/adminOwnerControls.ts")
  .map((path) => read(path))
  .join("\n")
  .toLowerCase();

[
  "network proof",
  "masked ip",
  "security_context_id",
  "ip_hash",
  "user_agent_hash",
].forEach((needle) => {
  if (nonAdminPublicText.includes(needle)) {
    fail(`non-admin public UI references restricted network proof marker: ${needle}`);
  }
});

console.log("Security Context proxy proof guard passed.");
