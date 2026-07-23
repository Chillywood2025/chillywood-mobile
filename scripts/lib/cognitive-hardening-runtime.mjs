import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";

const FORBIDDEN_SEGMENTS = new Set([".git", "node_modules", "android", "ios"]);
const CREDENTIAL_FILE = /(?:^|\/)(?:\.env(?:\.|$)|credentials?\.json$|.*\.(?:jks|keystore|p8|p12|pem|key)$)/iu;
const PRIVATE_V4 = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const stableJson = (value) => {
  const normalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])]));
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};
export const canonicalSnapshotHash = (snapshot) => sha256(stableJson(snapshot));

const decodePath = (value) => {
  let current = String(value).normalize("NFKC");
  for (let index = 0; index < 3; index += 1) {
    const next = decodeURIComponent(current);
    if (next === current) return next;
    current = next;
  }
  if (/%(?:2e|2f|5c)/iu.test(current)) throw new Error("path_encoding_invalid");
  return current;
};

const inside = (candidate, root) => candidate === root || candidate.startsWith(`${root}${path.sep}`);
const inScopes = (relative, scopes) => scopes.some((scope) => {
  const normalized = scope.replaceAll("\\", "/").replace(/\/+$/u, "");
  return relative === normalized || relative.startsWith(`${normalized}/`);
});

export const resolveConfinedRepositoryPath = ({
  repositoryRoot,
  requestedPath,
  allowedScopes,
  allowNewFile = false,
}) => {
  const canonicalRoot = fs.realpathSync(repositoryRoot);
  const rootStat = fs.statSync(canonicalRoot);
  const decoded = decodePath(requestedPath).replaceAll("\\", "/");
  if (!decoded || path.posix.isAbsolute(decoded) || path.win32.isAbsolute(decoded)) throw new Error("absolute_path_forbidden");
  const segments = decoded.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("path_traversal_forbidden");
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) throw new Error("forbidden_path");
  if (decoded === ".github/workflows" || decoded.startsWith(".github/workflows/")) throw new Error("workflow_edit_forbidden");
  if (CREDENTIAL_FILE.test(decoded)) throw new Error("credential_path_forbidden");
  if (!inScopes(decoded, allowedScopes)) throw new Error("path_scope_mismatch");

  let current = canonicalRoot;
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = path.join(current, segments[index]);
    const isLast = index === segments.length - 1;
    if (!fs.existsSync(candidate)) {
      if (!allowNewFile || !isLast) throw new Error("path_missing");
      break;
    }
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) throw new Error("symlink_forbidden");
    if (stat.dev !== rootStat.dev) throw new Error("mount_boundary_forbidden");
    if (!isLast && !stat.isDirectory()) throw new Error("path_parent_not_directory");
    if (stat.isDirectory() && fs.existsSync(path.join(candidate, ".git"))) throw new Error("submodule_boundary_forbidden");
    current = candidate;
  }
  const parent = fs.realpathSync(fs.existsSync(path.dirname(path.join(canonicalRoot, decoded)))
    ? path.dirname(path.join(canonicalRoot, decoded))
    : current);
  const canonicalTarget = fs.existsSync(path.join(canonicalRoot, decoded))
    ? fs.realpathSync(path.join(canonicalRoot, decoded))
    : path.join(parent, path.basename(decoded));
  if (!inside(parent, canonicalRoot) || !inside(canonicalTarget, canonicalRoot)) throw new Error("path_escape_forbidden");
  if (fs.existsSync(canonicalTarget)) {
    const stat = fs.statSync(canonicalTarget);
    if (stat.nlink > 1 && stat.isFile()) throw new Error("hard_link_forbidden");
  }
  return { canonicalRoot, canonicalTarget, relativePath: decoded };
};

const ipv4Integer = (address) => address.split(".").reduce((result, octet) => (result * 256) + Number(octet), 0);
const ipv4Private = (address) => {
  const number = ipv4Integer(address);
  return PRIVATE_V4.some(([base, bits]) => {
    const baseInteger = ipv4Integer(base);
    const size = 2 ** (32 - bits);
    return number >= baseInteger && number < baseInteger + size;
  });
};
export const isPrivateOrReservedNetworkAddress = (address) => {
  if (net.isIPv4(address)) return ipv4Private(address);
  if (!net.isIPv6(address)) return true;
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fe8") || normalized.startsWith("fe9")
    || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("fc") || normalized.startsWith("fd")
    || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateOrReservedNetworkAddress(normalized.slice(7));
  return false;
};

export const validateResearchUrlWithDns = async (raw, resolveDns) => {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("url_invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("https_required");
  if (parsed.username || parsed.password) throw new Error("embedded_credentials_forbidden");
  if (parsed.port && parsed.port !== "443") throw new Error("port_not_allowed");
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("private_or_internal_target");
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await resolveDns(hostname);
  if (!Array.isArray(addresses) || addresses.length < 1) throw new Error("dns_resolution_missing");
  if (addresses.some((entry) => isPrivateOrReservedNetworkAddress(entry.address))) throw new Error("private_or_reserved_target");
  return { parsed, addresses: addresses.map((entry) => entry.address).sort() };
};

export const fetchResearchEvidence = async ({
  initialUrl,
  resolveDns,
  request,
  signal,
  maxRedirects = 3,
  maxCompressedBytes = 1_000_000,
  maxDecompressedBytes = 4_000_000,
  maxDecompressionRatio = 20,
}) => {
  let current = initialUrl;
  const history = [];
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (signal.aborted) throw new Error("research_cancelled");
    const target = await validateResearchUrlWithDns(current, resolveDns);
    const response = await request({
      url: target.parsed.toString(),
      pinnedAddresses: target.addresses,
      signal,
      headers: { accept: "text/html, text/plain, application/json", "user-agent": "ChillywoodResearchFoundation/1" },
      credentials: "omit",
      cookie: null,
      authorization: null,
    });
    if (signal.aborted) throw new Error("research_cancelled");
    if (!Number.isSafeInteger(response.compressedBytes) || !Number.isSafeInteger(response.decompressedBytes)
      || response.compressedBytes < 0 || response.decompressedBytes < 0
      || response.compressedBytes > maxCompressedBytes || response.decompressedBytes > maxDecompressedBytes
      || response.decompressedBytes > Math.max(1, response.compressedBytes) * maxDecompressionRatio) throw new Error("research_response_size_rejected");
    if (!["text/html", "text/plain", "application/json"].includes(String(response.contentType).split(";")[0].trim().toLowerCase())) throw new Error("research_content_type_rejected");
    history.push({ urlHash: sha256(current), addressHashes: target.addresses.map(sha256), status: response.status });
    if (response.redirectUrl) {
      if (redirect === maxRedirects) throw new Error("redirect_limit_exceeded");
      current = new URL(response.redirectUrl, current).toString();
      continue;
    }
    const text = String(response.body ?? "")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<form[\s\S]*?<\/form>/giu, " ")
      .replace(/<[^>]+(?:hidden|display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/giu, " ")
      .slice(0, maxDecompressedBytes);
    return { text, history, untrusted: true, credentialsSent: false, authorizationPersisted: false };
  }
  throw new Error("redirect_limit_exceeded");
};

export const requiredTestManifestForChanges = ({
  changedPaths,
  finalCommit,
  platform,
}) => {
  if (!/^[a-f0-9]{40}$/u.test(finalCommit)) throw new Error("final_commit_invalid");
  const tests = new Map();
  const add = (id, commandId, risk = "medium", physicalEvidenceRequired = false) => {
    tests.set(id, { id, commandId, platform, finalCommit, risk, physicalEvidenceRequired });
  };
  add("lint", "npm:lint", "low");
  add("typescript", "npx:tsc-no-emit", "low");
  for (const relative of [...changedPaths].sort()) {
    if (relative.startsWith("supabase/migrations/") || relative.startsWith("supabase/tests/")) add("database", "supabase:test-db", "high");
    if (relative.startsWith(".github/workflows/")) throw new Error("workflow_edit_forbidden");
    if (/(?:app\.config|app\.json|package-lock\.json|android|ios)/u.test(relative)) add("native-runtime", "npm:guard-native-runtime", "critical");
    if (/cognitive|intelligence|research/iu.test(relative)) add("cognitive-red-team", "npm:test-cognitive-red-team", "high");
  }
  return [...tests.values()].sort((left, right) => left.id.localeCompare(right.id));
};

export class ResourceLeaseRegistry {
  #leases = new Map();

  acquire({ resourceKey, taskId, mode, issuedAt, expiresAt }, now = new Date()) {
    if (!["read", "write"].includes(mode) || Date.parse(expiresAt) <= now.getTime()) return false;
    const active = (this.#leases.get(resourceKey) ?? []).filter((lease) => !lease.revoked && Date.parse(lease.expiresAt) > now.getTime());
    if (active.some((lease) => lease.taskId !== taskId && (lease.mode === "write" || mode === "write"))) return false;
    active.push({ resourceKey, taskId, mode, issuedAt, expiresAt, revoked: false });
    this.#leases.set(resourceKey, active);
    return true;
  }
}
