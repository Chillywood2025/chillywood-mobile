import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHmac } from "node:crypto";
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
const trustedProxyConfig = read("ops/trusted-network-proof-proxy/wrangler.toml");
const trustedProxyWorker = read("ops/trusted-network-proof-proxy/src/index.js");

[
  "x-chillywood-network-proof",
  "x-chillywood-network-proof-signature",
  "x-chillywood-network-proof-timestamp",
  "x-chillywood-network-proof-version",
  "CHILLYWOOD_NETWORK_PROOF_SECRET",
  "verifySignedNetworkProof",
  "missing_trusted_proxy_proof",
  "invalid_trusted_proxy_proof_signature",
  "expired_trusted_proxy_proof",
  "malformed_trusted_proxy_proof_payload",
  "spoofable_client_ip_headers_ignored",
  "raw_ip_retained: false",
].forEach((needle) => {
  if (!helper.includes(needle)) fail(`missing explicit signed proxy proof marker: ${needle}`);
});

if (/captured_from_trusted_header|DEFAULT_TRUSTED_IP_HEADERS|SECURITY_CONTEXT_TRUSTED_IP_HEADERS|SECURITY_CONTEXT_USE_DEFAULT_TRUSTED_IP_HEADERS/.test(helper)) {
  fail("helper must not trust direct proxy IP headers");
}

[
  'name = "chillywood-network-proof-proxy"',
  "network-proof.chillywoodstream.com",
  'workers_dev = false',
  'CHILLYWOOD_BACKEND_ORIGIN_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co"',
].forEach((needle) => {
  if (!trustedProxyConfig.includes(needle)) fail(`trusted proxy config missing marker: ${needle}`);
});

[
  "STRIPPED_HEADERS",
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "x-client-ip",
  "cf-connecting-ip",
  "x-chillywood-network-proof",
  "x-chillywood-network-proof-signature",
  "CHILLYWOOD_NETWORK_PROOF_SECRET",
  "CHILLYWOOD_NETWORK_PROOF_HASH_PEPPER",
  "masked_ip_or_prefix",
  "rawIpForwarded: false",
].forEach((needle) => {
  if (!trustedProxyWorker.includes(needle)) fail(`trusted proxy worker missing marker: ${needle}`);
});

if (/headers\.set\(["'](?:x-forwarded-for|x-real-ip|forwarded|x-client-ip|cf-connecting-ip)["']/i.test(trustedProxyWorker)) {
  fail("trusted proxy worker must not forward direct IP headers");
}

const encodeBase64Url = (value) => Buffer.from(value, "utf8").toString("base64url");
const signProof = ({ payload, secret, timestamp = String(Math.floor(Date.now() / 1000)), version = "v1" }) => {
  const proof = encodeBase64Url(JSON.stringify({ ...payload, timestamp, version }));
  const signingInput = `${version}.${timestamp}.${proof}`;
  const signature = `sha256=${createHmac("sha256", secret).update(signingInput).digest("hex")}`;
  return { proof, signature, timestamp, version };
};
const verifyProofFixture = ({ proof, signature, timestamp, version }, { now = Date.now(), secret = "unit-secret" } = {}) => {
  if (!proof || !signature || !timestamp || !version) return "malformed";
  const parsedTimestamp = Number(timestamp) * 1000;
  if (Math.abs(now - parsedTimestamp) > 300_000) return "expired";
  const expected = `sha256=${createHmac("sha256", secret).update(`${version}.${timestamp}.${proof}`).digest("hex")}`;
  if (expected !== signature) return "invalid";
  const payload = JSON.parse(Buffer.from(proof, "base64url").toString("utf8"));
  if (!/^[a-f0-9]{16,128}$/.test(String(payload.ip_hash || ""))) return "malformed";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(payload.masked_ip_or_prefix || ""))) return "malformed";
  return "verified";
};

const validFixture = signProof({
  secret: "unit-secret",
  payload: {
    ip_hash: "a".repeat(64),
    masked_ip_or_prefix: "203.0.113.0/24",
    request_path: "/functions/v1/livekit-token",
    user_agent_hash: "b".repeat(64),
  },
});

if (verifyProofFixture(validFixture) !== "verified") {
  fail("valid signed network proof fixture was not accepted");
}
if (verifyProofFixture({ ...validFixture, signature: "sha256=" + "0".repeat(64) }) !== "invalid") {
  fail("invalid signed network proof fixture was not rejected");
}
if (verifyProofFixture(signProof({
  secret: "unit-secret",
  timestamp: "1700000000",
  payload: { ip_hash: "c".repeat(64), masked_ip_or_prefix: "203.0.113.0/24" },
})) !== "expired") {
  fail("expired signed network proof fixture was not rejected");
}
if (verifyProofFixture(signProof({
  secret: "unit-secret",
  payload: { ip_hash: "d".repeat(64), masked_ip_or_prefix: "203.0.113.42" },
})) !== "malformed") {
  fail("raw full-IP-looking masked proof fixture was not rejected");
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
  "networkProofVerified?: boolean | null",
].forEach((needle) => {
  if (!adminOwnerControlsClient.includes(needle)) fail(`missing safe network proof client type marker: ${needle}`);
});

[
  "auditExplorerNetworkFilterOptions",
  "Has Proof",
  "Missing Proof",
  "Network Proof",
  "Verified network proof",
  "Network proof not verified",
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
