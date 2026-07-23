import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import https from "node:https";

const FORBIDDEN_SEGMENTS = new Set([".git", "node_modules", "android", "ios"]);
const CREDENTIAL_FILE = /(?:^|\/)(?:\.env(?:\.|$)|\.git-credentials$|\.htpasswd$|\.npmrc$|\.netrc$|\.pypirc$|kubeconfig$|id_(?:rsa|dsa|ecdsa|ed25519)$|(?:auth|token|secrets?|credentials?|service[-_]?account(?:[-_]?key)?|serviceaccountkey|gcp[-_]?service[-_]?account|firebase[-_]?admin(?:sdk(?:-[^/]+)?)?|application[-_]?default[-_]?credentials)\.json$|\.aws\/credentials$|\.config\/gcloud\/application_default_credentials\.json$|\.docker\/config\.json$|\.gem\/credentials$|\.cargo\/credentials(?:\.toml)?$|.*\.(?:jks|keystore|p8|p12|pem|key)$)/iu;
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

const OWNER_POLICY_BUDGET_CEILING = Object.freeze({
  modelTokens: 10_000_000,
  modelCost: 25,
  toolCalls: 100,
  toolBytes: 10_000_000,
  elapsedMs: 14_400_000,
  childTasks: 20,
  recursionDepth: 4,
  concurrentCalls: 4,
  retries: 5,
});

export class CognitiveBudgetFixtureCoordinator {
  #limits;
  #consumed = Object.fromEntries(Object.keys(OWNER_POLICY_BUDGET_CEILING).map((key) => [key, 0]));
  #reservations = new Map();
  #actionOccurrences = new Map();
  #planOccurrences = new Map();

  constructor(requestedLimits = OWNER_POLICY_BUDGET_CEILING) {
    const keys = Object.keys(OWNER_POLICY_BUDGET_CEILING);
    if (!requestedLimits || Object.keys(requestedLimits).length !== keys.length
      || keys.some((key) => !Number.isSafeInteger(requestedLimits[key])
        || requestedLimits[key] < 0
        || requestedLimits[key] > OWNER_POLICY_BUDGET_CEILING[key])) {
      throw new Error("owner_policy_budget_invalid");
    }
    this.#limits = Object.freeze({ ...requestedLimits });
    Object.defineProperties(this, {
      authorityAvailable: { value: false, enumerable: true, writable: false },
      coordinatorKind: { value: "pure_fixture_budget", enumerable: true, writable: false },
    });
    Object.freeze(this);
  }

  reserve(reservationId, requested, gate) {
    const deadline = Date.parse(gate.deadlineAt);
    if (gate.emergencyStop || gate.taskCancelled || gate.taskQuarantined
      || !Number.isFinite(deadline) || gate.now.getTime() >= deadline
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(reservationId)
      || !/^[a-f0-9]{64}$/u.test(gate.actionFingerprint)
      || !/^[a-f0-9]{64}$/u.test(gate.planSnapshotHash)
      || this.#reservations.has(reservationId)
      || !requested || Object.keys(requested).length === 0
      || (this.#actionOccurrences.get(gate.actionFingerprint) ?? 0) >= 3
      || (this.#planOccurrences.get(gate.planSnapshotHash) ?? 0) >= 3) return false;
    for (const [key, raw] of Object.entries(requested)) {
      if (!(key in this.#limits)
        || !Number.isSafeInteger(raw) || raw < 0
        || this.#consumed[key] + raw > this.#limits[key]) return false;
    }
    for (const [key, raw] of Object.entries(requested)) this.#consumed[key] += raw;
    this.#reservations.set(reservationId, Object.freeze({ ...requested }));
    this.#actionOccurrences.set(gate.actionFingerprint, (this.#actionOccurrences.get(gate.actionFingerprint) ?? 0) + 1);
    this.#planOccurrences.set(gate.planSnapshotHash, (this.#planOccurrences.get(gate.planSnapshotHash) ?? 0) + 1);
    return true;
  }

  settle(reservationId, actual, gate) {
    const reserved = this.#reservations.get(reservationId);
    if (!reserved) return false;
    if (gate.emergencyStop || gate.taskCancelled || gate.taskQuarantined) {
      this.release(reservationId);
      return false;
    }
    for (const [key, raw] of Object.entries(actual)) {
      const prior = reserved[key] ?? 0;
      if (!(key in this.#limits)
        || !Number.isSafeInteger(raw) || raw < 0
        || this.#consumed[key] - prior + raw > this.#limits[key]) return false;
    }
    for (const [key, prior] of Object.entries(reserved)) this.#consumed[key] -= prior;
    for (const [key, raw] of Object.entries(actual)) this.#consumed[key] += raw;
    this.#reservations.delete(reservationId);
    return true;
  }

  release(reservationId) {
    const reserved = this.#reservations.get(reservationId);
    if (!reserved) return false;
    for (const [key, prior] of Object.entries(reserved)) this.#consumed[key] -= prior;
    this.#reservations.delete(reservationId);
    return true;
  }

  snapshot() {
    return Object.freeze({ limits: this.#limits, consumed: Object.freeze({ ...this.#consumed }) });
  }
}
Object.freeze(CognitiveBudgetFixtureCoordinator.prototype);

// Backward-compatible import name for existing pure tests. It is not consulted
// by executeAuthorizedAction and cannot mint execution authority.
export const CognitiveEngineBudgetAuthority = CognitiveBudgetFixtureCoordinator;

export const registerIsolatedTestCapabilityLedger = (ledger, repositoryRoot) => {
  void ledger;
  void repositoryRoot;
  // This source-only scaffold has no credential broker or production executor.
  // A caller-created object cannot become an execution authority, including in a
  // temporary directory. Pure capability/state-machine behavior is tested
  // independently of side-effecting execution.
  throw new Error("cognitive_execution_authority_unavailable");
};

const decodePath = (value) => {
  let current = String(value).normalize("NFKC");
  for (let index = 0; index < 5; index += 1) {
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

const CLOSED_ACTIONS = new Set([
  "repository_read_file",
  "repository_list_files",
  "repository_search",
  "repository_apply_patch",
  "repository_write_new_file",
  "test_run_allowlisted",
  "git_create_scoped_branch",
  "git_stage_allowlisted_paths",
  "git_commit_scoped",
  "git_push_scoped_draft_branch",
  "github_open_draft_pr",
  "github_update_draft_pr_body",
]);
const TEST_COMMANDS = new Map([
  ["lint", { program: "npm", args: ["run", "lint"] }],
  ["typescript", { program: "npx", args: ["tsc", "--noEmit"] }],
  ["cognitive_red_team", { program: "npm", args: ["run", "test:cognitive-red-team"] }],
  ["route_contracts", { program: "npm", args: ["run", "guard:route-contracts"] }],
]);

const validScopedBranch = (value) => typeof value === "string"
  && /^codex\/[a-z0-9][a-z0-9/_-]{2,120}$/u.test(value)
  && !/(?:^|\/)(?:main|master|release(?:\/|$))/iu.test(value);

const closedInvocation = (request, canonicalPaths) => {
  if (!CLOSED_ACTIONS.has(request.action)) throw new Error("action_not_allowed");
  if (request.repositoryFullName !== "Chillywood2025/chillywood-mobile") throw new Error("repository_not_allowed");
  if (request.remote !== "origin") throw new Error("remote_not_allowed");
  if (!validScopedBranch(request.branch)) throw new Error("branch_not_allowed");
  if (!Array.isArray(request.argv) || request.argv.length > 64
      || request.argv.some((entry) => typeof entry !== "string" || entry.length > 1_024 || /[\n\r;|><`]|\$\(|\|\||&&|&\s*$/u.test(entry))) {
    throw new Error("command_injection_forbidden");
  }
  if (request.argv.some((entry) => /^(?:-f|--force(?:-with-lease)?|--delete|main|master|release|env|printenv|export|-x|--upload-pack)$/iu.test(entry))) {
    throw new Error("forbidden_argument");
  }
  if (request.action.startsWith("repository_")) {
    if (request.argv.length) throw new Error("repository_action_argv_forbidden");
    return {
      kind: "disabled_contract",
      action: request.action,
      relativePaths: canonicalPaths.map((entry) => entry.relativePath),
    };
  }
  if (request.action === "test_run_allowlisted") {
    const command = request.argv.length === 1 ? TEST_COMMANDS.get(request.argv[0]) : null;
    if (!command) throw new Error("test_command_not_allowlisted");
    return {
      kind: "disabled_contract",
      action: request.action,
      program: command.program,
      args: command.args,
      shell: false,
    };
  }
  if (request.action === "git_create_scoped_branch") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "disabled_contract", action: request.action, branch: request.branch };
  }
  if (request.action === "git_stage_allowlisted_paths") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return {
      kind: "disabled_contract",
      action: request.action,
      relativePaths: canonicalPaths.map((entry) => entry.relativePath),
    };
  }
  if (request.action === "git_commit_scoped") {
    if (request.argv.length !== 1 || request.argv[0].length < 3 || request.argv[0].length > 120) throw new Error("commit_message_invalid");
    // A future executor must commit from an engine-owned index populated from
    // pinned allowed-path descriptors. The ambient Git index is never accepted.
    return { kind: "disabled_contract", action: request.action };
  }
  if (request.action === "git_push_scoped_draft_branch") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "disabled_contract", action: request.action, branch: request.branch };
  }
  if (request.action === "github_open_draft_pr") return { kind: "disabled_contract", action: request.action, repository: request.repositoryFullName };
  if (request.action === "github_update_draft_pr_body") return { kind: "disabled_contract", action: request.action, repository: request.repositoryFullName };
  throw new Error("action_not_implemented");
};

export const validateCognitiveExecutionContract = ({
  repositoryRoot,
  request,
  allowedScopes,
  allowNewFile,
}) => {
  if (!request || typeof request !== "object" || !Array.isArray(request.paths)) {
    throw new Error("execution_contract_invalid");
  }
  const canonicalPaths = request.paths.map((requestedPath) => resolveConfinedRepositoryPath({
    repositoryRoot,
    requestedPath,
    allowedScopes,
    allowNewFile,
  }));
  const invocation = closedInvocation(request, canonicalPaths);
  return Object.freeze({
    action: request.action,
    invocation: Object.freeze({ ...invocation }),
    relativePaths: Object.freeze(canonicalPaths.map((entry) => entry.relativePath)),
    productionExecutionAvailable: false,
  });
};

export const executeAuthorizedAction = async ({
  signal,
  getRuntimeGate,
}) => {
  // Deliberately do not call any caller-supplied ledger, budget, lease, rollback,
  // invocation, or result callback. Those objects cannot confer authority while
  // the scaffold is undeployed. This also prevents late side effects after
  // cancellation and prevents raw tool/provider output from crossing the trust
  // boundary.
  if (signal?.aborted) {
    return Object.freeze({
      accepted: false,
      status: "blocked_preflight",
      result: null,
      blockers: Object.freeze(["runtime_gate_closed", "cognitive_execution_authority_unavailable"]),
    });
  }
  // getRuntimeGate is intentionally not invoked: it is caller-controlled and no
  // runtime authority exists that could authenticate its answer.
  void getRuntimeGate;
  return Object.freeze({
    accepted: false,
    status: "blocked_preflight",
    result: null,
    blockers: Object.freeze(["cognitive_execution_authority_unavailable"]),
  });
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

const parseIpv6 = (address) => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, "").split("%")[0];
  if (!normalized.includes(":")) return null;
  let value = normalized;
  const ipv4Tail = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/u);
  if (ipv4Tail) {
    if (!net.isIPv4(ipv4Tail[1])) return null;
    const octets = ipv4Tail[1].split(".").map(Number);
    value = value.slice(0, -ipv4Tail[1].length)
      + `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
};

const ipv6PrefixMatch = (address, base, bits) => {
  const value = parseIpv6(address);
  const baseValue = parseIpv6(base);
  if (value === null || baseValue === null) return true;
  if (bits === 0) return true;
  const shift = BigInt(128 - bits);
  return (value >> shift) === (baseValue >> shift);
};

const RESERVED_V6 = [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

export const isPrivateOrReservedNetworkAddress = (address) => {
  const normalized = String(address).toLowerCase().replace(/^\[|\]$/gu, "").split("%")[0];
  if (net.isIPv4(normalized)) return ipv4Private(normalized);
  if (!net.isIPv6(normalized)) return true;
  // Fail closed: IANA currently allocates global unicast from 2000::/3.
  // Special-purpose prefixes inside that block remain denied below.
  if (!ipv6PrefixMatch(normalized, "2000::", 3)) return true;
  return RESERVED_V6.some(([base, bits]) => ipv6PrefixMatch(normalized, base, bits));
};

const normalizedIp = (address) => {
  const value = String(address).toLowerCase().replace(/^\[|\]$/gu, "").split("%")[0];
  if (net.isIPv4(value)) return `v4:${value.split(".").map(Number).join(".")}`;
  const parsed = parseIpv6(value);
  return parsed === null ? null : `v6:${parsed.toString(16).padStart(32, "0")}`;
};

const RESEARCH_MAX_URL_BYTES = 2_048;
const RESEARCH_CREDENTIAL_PATTERN = /\b(?:(?:access|refresh)\s*(?:[_-]?token|\[\s*token\s*\])|token|api[_-]?key|service[_-]?role|private[_-]?key|secret|password|pwd|credential|authorization|auth|cookie|bearer|signature|sig|key)(?:[._-][A-Za-z0-9_-]{1,64})?\s*[:=]/iu;
const SENSITIVE_RESEARCH_LABELS = new Set([
  "accesskey", "accesstoken", "apikey", "auth", "authorization", "authorizationtoken",
  "bearer", "clientsecret", "cookie", "credential", "credentialkey", "credentialtoken", "key", "password", "privatekey", "pwd",
  "refreshtoken", "secret", "servicerole", "sig", "signature", "token", "xapikey",
]);
const SENSITIVE_RESEARCH_LABEL_PARTS = new Set([
  "auth", "authorization", "bearer", "cookie", "credential", "key", "password",
  "pwd", "secret", "sig", "signature", "token",
]);
const SECURITY_CONFUSABLES = Object.freeze({
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c",
  т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w",
  ү: "y", ӏ: "l", һ: "h", α: "a", β: "b", ε: "e", η: "h", ι: "i", κ: "k", μ: "m",
  ν: "v", ο: "o", ρ: "p", τ: "t", υ: "y", χ: "x", ϲ: "c", ն: "n", օ: "o",
  ı: "i", ɡ: "g", ɪ: "i", ɩ: "i", հ: "h",
});
const SECURITY_DECIMAL_BLOCKS = Object.freeze([
  48,1632,1776,1984,2406,2534,2662,2790,2918,3046,3174,3302,3430,3558,
  3664,3792,3872,4160,4240,6112,6160,6470,6608,6784,6800,6992,7088,7232,
  7248,42528,43216,43264,43472,43504,43600,44016,66720,68912,69734,69872,
  69942,70096,70384,70736,70864,71248,71360,71472,71904,72016,72784,73040,
  73120,73552,92768,92864,93008,120782,120792,120802,120812,120822,
  123200,123632,124144,125264,130032,
]);
const normalizeDecimalDigit = (character) => {
  const codePoint = character.codePointAt(0);
  const block = SECURITY_DECIMAL_BLOCKS.find((start) => codePoint >= start && codePoint <= start + 9);
  return block === undefined ? character : String(codePoint - block);
};
const normalizedSecurityText = (value) =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u3002\uff0e\uff61]/gu, ".")
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Mark}]/gu, "")
    .replace(/\p{Nd}/gu, normalizeDecimalDigit)
    .replace(/[АВЕКМНОРСТУХІЈЅԀԚԜҮӀҺавекмнорстухіјѕԁԛԝүӏһΑΒΕΗΙΚΜΝΟΡΤΥΧϹαβεηικμνορτυχϲՆՕնօıɡꞬɪɩՀհ]/gu, (character) =>
      SECURITY_CONFUSABLES[character.toLowerCase()] ?? character
    );
const normalizedSecurityLabel = (value) =>
  normalizedSecurityText(value).toLowerCase().replace(/[^a-z0-9]/gu, "");
const hasSensitiveResearchAssignment = (value) => {
  const normalized = normalizedSecurityText(value);
  for (const match of normalized.matchAll(/([^?&=:\s]{1,256})\s*[:=]/gu)) {
    const label = normalizedSecurityLabel(match[1]);
    const labelParts = match[1]
      .toLowerCase()
      .split(/[^a-z0-9]+/gu)
      .filter(Boolean);
    if (
      SENSITIVE_RESEARCH_LABELS.has(label)
      || labelParts.some((part) => SENSITIVE_RESEARCH_LABEL_PARTS.has(part))
      || /^(?:access|refresh)(?:key|token)$/u.test(label)
      || /^(?:api|private)(?:key|token)$/u.test(label)
      || /^service(?:key|role|token)$/u.test(label)
      || /^authorization(?:key|token)$/u.test(label)
    ) return true;
  }
  return false;
};
const hasPrivateIdentifierText = (value) => {
  const normalized = normalizedSecurityText(value);
  if (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(normalized)
    || /^[a-f0-9]{40,128}$/iu.test(normalized)
    || /^[a-f0-9]{16}$/iu.test(normalized)
  ) return false;
  if (/[\p{L}\p{N}._%+-]+@[^\s@]+\.[^\s@]{2,}/u.test(normalized)) return true;
  const reviewedOpaqueRemoved = normalized
    .replace(/digest\s*[:=]\s*[a-f0-9]{16}\b/giu, "")
    .replace(/\b[12][0-9]{3}-[01][0-9]-[0-3][0-9](?:T[0-9:.+-]+Z?)?\b/gu, "");
  if (
    /\+?\p{Nd}[\p{Nd} ()-]{7,}\p{Nd}/u.test(reviewedOpaqueRemoved)
    || /\b(?:\p{Nd}{1,3}\.){3}\p{Nd}{1,3}\b/u.test(reviewedOpaqueRemoved)
  ) return true;
  return reviewedOpaqueRemoved
    .split(/[\s?&=,;()[\]{}<>"']/gu)
    .some((fragment) => fragment.includes(":") && parseIpv6(fragment) !== null);
};
const hasPrivateIdentifierInResearchData = (value) =>
  normalizedSecurityText(value).split(/\r?\n/gu).some((line) => {
    if (!/^https:\/\//iu.test(line)) return hasPrivateIdentifierText(line);
    try {
      const url = new URL(line);
      const decodedValues = [...url.searchParams.values()].map((entry) => {
        try {
          return decodeURIComponent(entry);
        } catch {
          return entry;
        }
      });
      return hasPrivateIdentifierText(url.hash)
        || decodedValues.some((entry) => hasPrivateIdentifierText(entry));
    } catch {
      const queryIndex = line.indexOf("?");
      if (line.includes("https://") && queryIndex >= 0) {
        return hasPrivateIdentifierText(line.slice(queryIndex));
      }
      return !line.includes("https://") && hasPrivateIdentifierText(line);
    }
  });
const decodeBoundedSecurityCandidates = (value) => {
  const initial = normalizedSecurityText(value);
  if (Buffer.byteLength(initial, "utf8") > RESEARCH_MAX_URL_BYTES * 12) {
    throw new Error("url_too_long");
  }
  const candidates = new Set([initial]);
  let frontier = [...candidates];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const addDecodedCandidate = (decoded, next) => {
    const normalized = normalizedSecurityText(decoded).slice(0, 16_384);
    if (
      normalized.length < 3
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
      || candidates.has(normalized)
    ) return;
    candidates.add(normalized);
    next.push(normalized);
  };
  for (let depth = 0; depth < 6; depth += 1) {
    const next = [];
    for (const candidate of frontier) {
      try {
        const decoded = normalizedSecurityText(decodeURIComponent(candidate));
        if (decoded !== candidate && !candidates.has(decoded)) {
          candidates.add(decoded);
          next.push(decoded);
        }
      } catch {
        throw new Error("url_encoding_invalid");
      }
      for (const match of candidate.matchAll(/\b[A-Za-z0-9+/_-]{4,}={0,2}\b/gu)) {
        try {
          const normalized = match[0].replaceAll("-", "+").replaceAll("_", "/");
          const bytes = Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
          addDecodedCandidate(decoder.decode(bytes), next);
        } catch {
          // Invalid base64/base64url is ordinary untrusted URL text.
        }
      }
      for (const match of candidate.matchAll(/\b(?:[0-9a-fA-F]{2}){4,}\b/gu)) {
        try {
          addDecodedCandidate(
            decoder.decode(Buffer.from(match[0].slice(0, 32_768), "hex")),
            next,
          );
        } catch {
          // Non-UTF-8 hexadecimal data is not interpreted as text.
        }
      }
    }
    if (next.length === 0) return [...candidates];
    if (next.length > 128) throw new Error("credential_bearing_url_forbidden");
    if (depth === 5) {
      candidates.add("secret=encoded_depth_exceeded");
      return [...candidates];
    }
    frontier = next.slice(0, 128);
  }
  return [...candidates];
};

const URL_POSITION_WORDS = Object.freeze({
  zero: 0, first: 1, one: 1, second: 2, two: 2, third: 3, three: 3,
  fourth: 4, four: 4, fifth: 5, five: 5, sixth: 6, six: 6,
  seventh: 7, seven: 7, eighth: 8, eight: 8, ninth: 9, nine: 9,
  tenth: 10, ten: 10, middle: 50, penultimate: 98, last: 99,
});
const urlPosition = (value) => {
  const label = normalizedSecurityLabel(value);
  if (Object.hasOwn(URL_POSITION_WORDS, label)) return URL_POSITION_WORDS[label];
  const numeric = label.match(/([0-9]{1,6})/u);
  if (numeric) return Number(numeric[1]);
  for (const [word, position] of Object.entries(URL_POSITION_WORDS)) {
    if (label.includes(word)) return position;
  }
  return null;
};
const appendContiguousCandidates = (candidates, values) => {
  const bounded = values.slice(0, 64).map((value) => value.slice(0, 1_024));
  if (bounded.length >= 2) {
    candidates.push(bounded.join(""), [...bounded].reverse().join(""));
  }
  for (let start = 0; start < bounded.length; start += 1) {
    let joined = "";
    for (let end = start; end < bounded.length; end += 1) {
      joined += bounded[end];
      if (end > start) candidates.push(joined);
    }
  }
};
const reconstructNamedResearchFragments = (searchParams) => {
  const groups = new Map();
  const allIndexed = [];
  const entries = [...searchParams.entries()].slice(0, 128);
  const candidates = [];
  appendContiguousCandidates(candidates, entries.map(([, value]) => value));
  if (entries.length >= 2) {
    appendContiguousCandidates(candidates, entries.flatMap(([key, value]) => [key, value]));
  }
  const pairedFragments = [];
  let pendingPosition = null;
  for (const [key, value] of entries) {
    const normalizedKey = normalizedSecurityText(key).slice(0, 128);
    const keyLabel = normalizedSecurityLabel(normalizedKey);
    if (["position", "index", "ordinal", "order", "idx"].includes(keyLabel)) {
      pendingPosition = urlPosition(value);
      continue;
    }
    if (["chunk", "fragment", "piece", "part", "value"].includes(keyLabel) && pendingPosition !== null) {
      pairedFragments.push({ position: pendingPosition, value: value.slice(0, 1_024) });
      pendingPosition = null;
    }
    const embedded = normalizedSecurityText(value)
      .match(/^\s*([0-9]{1,6}|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s*[:|]\s*([\s\S]+)$/iu);
    if (embedded) {
      const position = urlPosition(embedded[1]);
      if (position !== null) pairedFragments.push({ position, value: embedded[2].slice(0, 1_024) });
    }
    const position = urlPosition(normalizedKey);
    if (position !== null) {
      const fragment = { position, value: value.slice(0, 1_024) };
      const marker = /([0-9]{1,6}|zero|one|two|three|four|five|six|seven|eight|nine|ten)/iu;
      const groupKey = normalizedSecurityLabel(normalizedKey.replace(marker, "")) || "indexed";
      const group = groups.get(groupKey) ?? [];
      group.push(fragment);
      groups.set(groupKey, group);
      allIndexed.push(fragment);
    }
  }
  allIndexed.push(...pairedFragments);
  if (allIndexed.length >= 2) {
    const positions = new Set(allIndexed.map((fragment) => fragment.position));
    const inputOrder = allIndexed.map((fragment) => fragment.value);
    appendContiguousCandidates(candidates, inputOrder);
    if (positions.size === allIndexed.length) {
      const positionOrder = [...allIndexed]
        .sort((left, right) => left.position - right.position)
        .map((fragment) => fragment.value);
      appendContiguousCandidates(candidates, positionOrder);
    }
  }
  for (const fragments of groups.values()) {
    if (fragments.length < 2 || fragments.length > 128) continue;
    const positions = new Set(fragments.map((fragment) => fragment.position));
    appendContiguousCandidates(candidates, fragments.map((fragment) => fragment.value));
    if (positions.size === fragments.length) {
      const sorted = [...fragments].sort((left, right) => left.position - right.position);
      const rawOrdered = sorted.map((fragment) => fragment.value);
      const ordered = sorted.map((fragment) => {
        const decoded = decodeBoundedSecurityCandidates(fragment.value)
          .filter((candidate) => candidate !== "secret=encoded_depth_exceeded");
        return decoded.at(-1) ?? fragment.value;
      });
      appendContiguousCandidates(candidates, rawOrdered);
      appendContiguousCandidates(candidates, ordered);
    }
  }
  return candidates;
};

const pathResearchFragmentCandidates = (pathname) => {
  const segments = pathname.split("/").filter(Boolean).slice(0, 64).map((segment) => {
    try {
      return decodeURIComponent(segment).slice(0, 1_024);
    } catch {
      return segment.slice(0, 1_024);
    }
  });
  const candidates = [];
  appendContiguousCandidates(candidates, segments);
  return candidates;
};

export const validateResearchUrlWithDns = async (raw, resolveDns) => {
  const rawText = String(raw).normalize("NFKC").replace(/[\u3002\uff0e\uff61]/gu, ".");
  if (Buffer.byteLength(rawText, "utf8") > RESEARCH_MAX_URL_BYTES) {
    throw new Error("url_too_long");
  }
  let parsed;
  try {
    parsed = new URL(rawText);
  } catch {
    throw new Error("url_invalid");
  }
  if (parsed.protocol !== "https:") throw new Error("https_required");
  if (parsed.username || parsed.password) throw new Error("embedded_credentials_forbidden");
  if (parsed.port && parsed.port !== "443") throw new Error("port_not_allowed");
  let decoded = parsed.toString();
  let fullyDecoded = false;
  for (let index = 0; index < 6; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        fullyDecoded = true;
        break;
      }
      decoded = next;
    } catch {
      throw new Error("url_encoding_invalid");
    }
  }
  if (!fullyDecoded) {
    try {
      if (decodeURIComponent(decoded) !== decoded) {
        throw new Error("credential_bearing_url_forbidden");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "credential_bearing_url_forbidden") throw error;
      throw new Error("url_encoding_invalid");
    }
  }
  let fullyDecodedUrl;
  try {
    fullyDecodedUrl = new URL(decoded);
  } catch {
    throw new Error("url_encoding_invalid");
  }
  const encodedValues = [
    ...parsed.searchParams.values(),
    ...fullyDecodedUrl.searchParams.values(),
    ...parsed.pathname.split("/").filter(Boolean),
    ...fullyDecodedUrl.pathname.split("/").filter(Boolean),
  ];
  if (encodedValues.length > 128) throw new Error("credential_bearing_url_forbidden");
  const namedFragmentCandidates = [
    ...reconstructNamedResearchFragments(parsed.searchParams),
    ...reconstructNamedResearchFragments(fullyDecodedUrl.searchParams),
    ...pathResearchFragmentCandidates(parsed.pathname),
    ...pathResearchFragmentCandidates(fullyDecodedUrl.pathname),
  ];
  const securityCandidates = [
    rawText,
    decoded,
    ...namedFragmentCandidates,
    ...encodedValues.flatMap((value) => {
      const decodedValueCandidates = decodeBoundedSecurityCandidates(value);
      const depthExceeded = decodedValueCandidates.includes("secret=encoded_depth_exceeded");
      const reviewedOpaque = (
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value)
        || /^[a-f0-9]{16}$/iu.test(value)
        || /^[a-f0-9]{40,128}$/iu.test(value)
      );
      if (depthExceeded && !reviewedOpaque) {
        throw new Error("credential_bearing_url_forbidden");
      }
      return decodedValueCandidates.filter((candidate) =>
        candidate !== "secret=encoded_depth_exceeded"
      );
    }),
  ];
  if (securityCandidates.some((candidate) =>
    RESEARCH_CREDENTIAL_PATTERN.test(candidate)
    || hasSensitiveResearchAssignment(candidate)
    || hasPrivateIdentifierInResearchData(candidate)
    || /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/u.test(candidate)
    || /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u.test(candidate)
    || /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,})\b/u.test(candidate)
    || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u.test(candidate)
    || /https:\/\/[^/\s:@]+:[^/\s@]+@/iu.test(candidate)
  )) {
    throw new Error("credential_bearing_url_forbidden");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("private_or_internal_target");
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await resolveDns(hostname);
  if (!Array.isArray(addresses) || addresses.length < 1) throw new Error("dns_resolution_missing");
  if (addresses.some((entry) => isPrivateOrReservedNetworkAddress(entry.address))) throw new Error("private_or_reserved_target");
  return { parsed, addresses: addresses.map((entry) => entry.address).sort() };
};

const RESEARCH_TRANSPORTS = new WeakMap();

export const createMockResearchTransport = () => {
  throw new Error("arbitrary_research_mock_transport_removed");
};

export const createDeterministicResearchFixtureTransport = (fixtures) => {
  if (!Array.isArray(fixtures) || fixtures.length < 1 || fixtures.length > 32) {
    throw new Error("research_fixture_transport_invalid");
  }
  const records = fixtures.map((fixture) => {
    let fixtureUrl;
    let redirectUrl;
    try {
      fixtureUrl = new URL(fixture?.url);
      redirectUrl = fixture?.redirectUrl ? new URL(fixture.redirectUrl, fixtureUrl) : null;
    } catch {
      throw new Error("research_fixture_transport_invalid");
    }
    const syntheticHost = (url) =>
      url.protocol === "https:"
      && (url.hostname.endsWith(".test") || url.hostname.endsWith(".invalid"));
    if (!fixture || typeof fixture !== "object"
      || typeof fixture.url !== "string"
      || !syntheticHost(fixtureUrl)
      || (redirectUrl && redirectUrl.protocol !== "https:")
      || !Number.isSafeInteger(fixture.status)
      || fixture.status < 100 || fixture.status > 599
      || !["text/html", "text/plain", "application/json"].includes(fixture.contentType)
      || typeof fixture.body !== "string"
      || fixture.body.length > 4_000_000
      || (fixture.redirectUrl !== undefined && fixture.redirectUrl !== null
        && typeof fixture.redirectUrl !== "string")
      || !Number.isSafeInteger(fixture.delayMs ?? 0)
      || (fixture.delayMs ?? 0) < 0 || (fixture.delayMs ?? 0) > 1_000
      || !["pinned", "mismatch_public"].includes(fixture.peerMode ?? "pinned")) {
      throw new Error("research_fixture_transport_invalid");
    }
    return Object.freeze({
      url: fixtureUrl.toString(),
      status: fixture.status,
      contentType: fixture.contentType,
      body: fixture.body,
      redirectUrl: redirectUrl?.toString() ?? null,
      delayMs: fixture.delayMs ?? 0,
      peerMode: fixture.peerMode ?? "pinned",
    });
  });
  const transport = async ({ url, pinnedAddresses, signal }) => {
    const fixture = records.find((candidate) => candidate.url === url);
    if (!fixture || signal.aborted) throw new Error("research_fixture_missing");
    if (fixture.delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, fixture.delayMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new Error("research_cancelled"));
        }, { once: true });
      });
    }
    const bytes = Buffer.byteLength(fixture.body, "utf8");
    return {
      status: fixture.status,
      connectedAddress: fixture.peerMode === "pinned" ? pinnedAddresses[0] : "8.8.8.8",
      contentType: fixture.contentType,
      compressedBytes: bytes,
      decompressedBytes: bytes,
      body: fixture.body,
      redirectUrl: fixture.redirectUrl,
    };
  };
  RESEARCH_TRANSPORTS.set(transport, "deterministic_fixture");
  return transport;
};

export const createPinnedHttpsResearchTransport = () => {
  const transport = ({ url, pinnedAddresses, signal, headers }) => new Promise((resolve, reject) => {
    if (!Array.isArray(pinnedAddresses) || pinnedAddresses.length < 1 || signal.aborted) {
      reject(new Error("research_transport_scope_invalid"));
      return;
    }
    const parsed = new URL(url);
    const pinned = pinnedAddresses[0];
    const request = https.request({
      protocol: "https:",
      hostname: parsed.hostname,
      port: 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: { ...headers, "accept-encoding": "identity" },
      agent: false,
      lookup: (_hostname, _options, callback) =>
        callback(null, pinned, net.isIPv6(pinned) ? 6 : 4),
      signal,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      const connectedAddress = response.socket.remoteAddress;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 4_000_000) request.destroy(new Error("research_response_size_rejected"));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: response.statusCode,
          connectedAddress,
          contentType: response.headers["content-type"] ?? "",
          compressedBytes: bytes,
          decompressedBytes: bytes,
          body: body.toString("utf8"),
          redirectUrl: response.headers.location ?? null,
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
  RESEARCH_TRANSPORTS.set(transport, "pinned_https");
  return transport;
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
  totalTimeoutMs = 15_000,
}) => {
  if (!RESEARCH_TRANSPORTS.has(request)) throw new Error("research_transport_not_reviewed");
  const transportKind = RESEARCH_TRANSPORTS.get(request);
  if (!Number.isSafeInteger(totalTimeoutMs) || totalTimeoutMs < 100 || totalTimeoutMs > 60_000) throw new Error("research_timeout_invalid");
  const startedAt = Date.now();
  const runBounded = async (operation, timeoutLabel) => {
    if (signal.aborted) throw new Error("research_cancelled");
    const remaining = totalTimeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) throw new Error("research_total_timeout");
    let timeout;
    let abortListener;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error(timeoutLabel)), remaining);
        }),
        new Promise((_, reject) => {
          abortListener = () => reject(new Error("research_cancelled"));
          signal.addEventListener("abort", abortListener, { once: true });
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abortListener) signal.removeEventListener("abort", abortListener);
    }
  };
  let current = initialUrl;
  const history = [];
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (signal.aborted) throw new Error("research_cancelled");
    const dnsController = new AbortController();
    const abortDns = () => dnsController.abort();
    signal.addEventListener("abort", abortDns, { once: true });
    let target;
    try {
      target = await runBounded(
        () => validateResearchUrlWithDns(current, (hostname) =>
          resolveDns(hostname, { signal: dnsController.signal })),
        "research_dns_timeout",
      );
    } finally {
      dnsController.abort();
      signal.removeEventListener("abort", abortDns);
    }
    const internalController = new AbortController();
    const abortInternal = () => internalController.abort();
    signal.addEventListener("abort", abortInternal, { once: true });
    let response;
    try {
      response = await runBounded(
        () => request({
          url: target.parsed.toString(),
          pinnedAddresses: target.addresses,
          requireConnectedAddressMatch: true,
          signal: internalController.signal,
          headers: { accept: "text/html, text/plain, application/json", "user-agent": "ChillywoodResearchFoundation/1" },
          credentials: "omit",
          cookie: null,
          authorization: null,
        }),
        "research_transport_timeout",
      );
    } finally {
      internalController.abort();
      signal.removeEventListener("abort", abortInternal);
    }
    if (signal.aborted) throw new Error("research_cancelled");
    const connectedAddress = normalizedIp(response.connectedAddress);
    const pinnedAddresses = new Set(target.addresses.map(normalizedIp));
    if (!connectedAddress
      || isPrivateOrReservedNetworkAddress(response.connectedAddress)
      || !pinnedAddresses.has(connectedAddress)) throw new Error("research_connected_peer_mismatch");
    if (!Number.isSafeInteger(response.compressedBytes) || !Number.isSafeInteger(response.decompressedBytes)
      || response.compressedBytes < 0 || response.decompressedBytes < 0
      || response.compressedBytes > maxCompressedBytes || response.decompressedBytes > maxDecompressedBytes
      || response.decompressedBytes > Math.max(1, response.compressedBytes) * maxDecompressionRatio) throw new Error("research_response_size_rejected");
    const actualBodyBytes = Buffer.byteLength(String(response.body ?? ""), "utf8");
    if (actualBodyBytes !== response.decompressedBytes
      || actualBodyBytes > maxDecompressedBytes) throw new Error("research_response_size_mismatch");
    if (!["text/html", "text/plain", "application/json"].includes(String(response.contentType).split(";")[0].trim().toLowerCase())) throw new Error("research_content_type_rejected");
    if (!Number.isSafeInteger(response.status) || response.status < 200 || response.status > 399) throw new Error("research_http_status_rejected");
    history.push({ urlHash: sha256(current), addressHashes: target.addresses.map(sha256), status: response.status });
    if (response.redirectUrl) {
      if (response.status < 300 || response.status > 399) throw new Error("research_redirect_status_invalid");
      if (redirect === maxRedirects) throw new Error("redirect_limit_exceeded");
      current = new URL(response.redirectUrl, current).toString();
      continue;
    }
    if (response.status < 200 || response.status > 299) throw new Error("research_http_status_rejected");
    const text = String(response.body ?? "")
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<form[\s\S]*?<\/form>/giu, " ")
      .replace(/<[^>]+(?:hidden|display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/giu, " ")
      .slice(0, maxDecompressedBytes);
    return {
      text,
      history,
      untrusted: true,
      credentialsSent: false,
      authorizationPersisted: false,
      transportKind,
      claimSupportEligible: transportKind === "pinned_https",
      evidenceAuthority: transportKind === "pinned_https"
        ? "untrusted_network_evidence"
        : "synthetic_fixture_only",
    };
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

export class CognitiveLeaseFixtureCoordinator {
  #leases = new Map();

  constructor() {
    Object.defineProperties(this, {
      authorityAvailable: { value: false, enumerable: true, writable: false },
      coordinatorKind: { value: "pure_fixture_lease", enumerable: true, writable: false },
    });
    Object.freeze(this);
  }

  acquire({ resourceKey, taskId, mode, issuedAt, expiresAt }, now = new Date()) {
    const issued = Date.parse(issuedAt);
    const expires = Date.parse(expiresAt);
    if (
      typeof resourceKey !== "string"
      || !/^(?:repository|branch|path|migration_namespace|edge_function|database_object|provider|release_channel|platform|feature_flag):[A-Za-z0-9._/:-]{1,512}$/u.test(resourceKey)
      || typeof taskId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(taskId)
      || !["read", "write"].includes(mode)
      || !Number.isFinite(issued)
      || !Number.isFinite(expires)
      || issued > now.getTime()
      || expires <= now.getTime()
      || expires <= issued
    ) return false;
    const active = (this.#leases.get(resourceKey) ?? []).filter((lease) => !lease.revoked && Date.parse(lease.expiresAt) > now.getTime());
    if (active.some((lease) => lease.taskId !== taskId && (lease.mode === "write" || mode === "write"))) return false;
    if (active.some((lease) => lease.taskId === taskId && lease.mode === mode)) return false;
    active.push({ resourceKey, taskId, mode, issuedAt, expiresAt, heartbeatAt: issuedAt, revoked: false });
    this.#leases.set(resourceKey, active);
    return true;
  }

  heartbeat(resourceKey, taskId, at = new Date()) {
    const active = this.#leases.get(resourceKey) ?? [];
    const lease = active.find((entry) => entry.taskId === taskId && !entry.revoked && Date.parse(entry.expiresAt) > at.getTime());
    if (!lease) return false;
    lease.heartbeatAt = at.toISOString();
    return true;
  }

  revoke(resourceKey, taskId) {
    const active = this.#leases.get(resourceKey) ?? [];
    const lease = active.find((entry) => entry.taskId === taskId && !entry.revoked);
    if (!lease) return false;
    lease.revoked = true;
    return true;
  }

  release(resourceKey, taskId) {
    const active = this.#leases.get(resourceKey) ?? [];
    const remaining = active.filter((entry) => entry.taskId !== taskId);
    if (remaining.length === active.length) return false;
    if (remaining.length) this.#leases.set(resourceKey, remaining);
    else this.#leases.delete(resourceKey);
    return true;
  }
}

// Backward-compatible import name for existing pure tests. It is not consulted
// by executeAuthorizedAction and cannot mint execution authority.
export const ResourceLeaseRegistry = CognitiveLeaseFixtureCoordinator;
