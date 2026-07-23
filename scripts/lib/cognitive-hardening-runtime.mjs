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
const WRITE_ACTIONS = new Set([
  "repository_apply_patch",
  "repository_write_new_file",
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
      kind: "internal",
      action: request.action,
      relativePaths: canonicalPaths.map((entry) => entry.relativePath),
    };
  }
  if (request.action === "test_run_allowlisted") {
    const command = request.argv.length === 1 ? TEST_COMMANDS.get(request.argv[0]) : null;
    if (!command) throw new Error("test_command_not_allowlisted");
    return { kind: "process", program: command.program, args: command.args, shell: false };
  }
  if (request.action === "git_create_scoped_branch") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "process", program: "git", args: ["switch", "-c", request.branch], shell: false };
  }
  if (request.action === "git_stage_allowlisted_paths") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "process", program: "git", args: ["add", "--", ...canonicalPaths.map((entry) => entry.relativePath)], shell: false };
  }
  if (request.action === "git_commit_scoped") {
    if (request.argv.length !== 1 || request.argv[0].length < 3 || request.argv[0].length > 120) throw new Error("commit_message_invalid");
    return { kind: "process", program: "git", args: ["commit", "-m", request.argv[0]], shell: false };
  }
  if (request.action === "git_push_scoped_draft_branch") {
    if (request.argv.length) throw new Error("git_action_argv_forbidden");
    return { kind: "process", program: "git", args: ["push", "origin", `${request.branch}:${request.branch}`], shell: false };
  }
  if (request.action === "github_open_draft_pr") return { kind: "github_api", action: "open_draft_pr", repository: request.repositoryFullName };
  if (request.action === "github_update_draft_pr_body") return { kind: "github_api", action: "update_draft_pr_body", repository: request.repositoryFullName };
  throw new Error("action_not_implemented");
};

const preparePinnedPathHandles = (action, canonicalPaths) => {
  if (!action.startsWith("repository_")) return [];
  const handles = [];
  try {
    for (const entry of canonicalPaths) {
      const exists = fs.existsSync(entry.canonicalTarget);
      let flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
      if (action === "repository_apply_patch") flags = fs.constants.O_RDWR | fs.constants.O_NOFOLLOW;
      if (action === "repository_write_new_file") {
        if (exists) throw new Error("new_file_already_exists");
        flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW;
      } else if (!exists) throw new Error("path_missing_at_use");
      const descriptor = fs.openSync(entry.canonicalTarget, flags, 0o600);
      const descriptorStat = fs.fstatSync(descriptor);
      const pathStat = fs.lstatSync(entry.canonicalTarget);
      const useTimeCanonicalTarget = fs.realpathSync(entry.canonicalTarget);
      if (pathStat.isSymbolicLink()
        || useTimeCanonicalTarget !== entry.canonicalTarget
        || descriptorStat.dev !== pathStat.dev
        || descriptorStat.ino !== pathStat.ino) {
        fs.closeSync(descriptor);
        throw new Error("path_identity_changed");
      }
      const original = action === "repository_apply_patch"
        ? fs.readFileSync(descriptor, { encoding: null, flag: "r" })
        : null;
      handles.push({
        relativePath: entry.relativePath,
        descriptor,
        createdByEngine: action === "repository_write_new_file",
        original,
        canonicalTarget: entry.canonicalTarget,
      });
    }
    return handles;
  } catch (error) {
    for (const handle of handles) fs.closeSync(handle.descriptor);
    throw error;
  }
};

const rollbackPinnedPathHandles = (handles) => {
  try {
    for (const handle of handles) {
      if (handle.createdByEngine) {
        fs.closeSync(handle.descriptor);
        handle.descriptor = null;
        fs.unlinkSync(handle.canonicalTarget);
      } else if (handle.original) {
        fs.ftruncateSync(handle.descriptor, 0);
        fs.writeSync(handle.descriptor, handle.original, 0, handle.original.length, 0);
        fs.fsyncSync(handle.descriptor);
      }
    }
    return true;
  } catch {
    return false;
  }
};

const closePinnedPathHandles = (handles) => {
  for (const handle of handles) {
    if (Number.isInteger(handle.descriptor)) {
      try {
        fs.closeSync(handle.descriptor);
      } catch {
        // A rollback may already have closed a newly created file descriptor.
      }
      handle.descriptor = null;
    }
  }
};

export const executeAuthorizedAction = async ({
  repositoryRoot,
  request,
  allowedScopes,
  allowNewFile,
  capabilityLedger,
  capabilityId,
  capabilityUse,
  budgetLedger,
  budgetReservationId,
  budgetRequest,
  leaseRegistry,
  getRuntimeGate,
  executeInvocation,
  rollbackCoordinator,
  rollbackInvocation,
  signal,
}) => {
  const preGate = getRuntimeGate();
  if (signal.aborted || preGate.emergencyStop || preGate.taskCancelled || preGate.taskQuarantined) {
    return { accepted: false, status: "blocked_preflight", result: null, blockers: ["runtime_gate_closed"] };
  }
  if (WRITE_ACTIONS.has(request.action)
    && (
      !rollbackCoordinator
      || rollbackCoordinator.taskStates?.get(capabilityUse.taskId) !== "rollback_pending"
      || (!request.action.startsWith("repository_") && typeof rollbackInvocation !== "function")
    )) {
    return { accepted: false, status: "blocked_preflight", result: null, blockers: ["rollback_contract_missing"] };
  }
  const canonicalPaths = request.paths.map((requestedPath) => resolveConfinedRepositoryPath({
    repositoryRoot,
    requestedPath,
    allowedScopes,
    allowNewFile,
  }));
  const composedBlockers = capabilityLedger.authorizeComposedRequest(
    capabilityId,
    { ...request, paths: canonicalPaths.map((entry) => entry.relativePath) },
    capabilityUse,
  );
  if (composedBlockers.length) return { accepted: false, status: "blocked_preflight", result: null, blockers: composedBlockers };
  const invocation = closedInvocation(request, canonicalPaths);
  const actionFingerprint = sha256(stableJson({
    action: request.action,
    branch: request.branch,
    paths: canonicalPaths.map((entry) => entry.relativePath),
  }));
  const budgetGate = {
    ...preGate,
    deadlineAt: preGate.deadlineAt,
    actionFingerprint,
    planSnapshotHash: capabilityUse.planSnapshotHash,
  };
  const requiredBudget = {
    ...budgetRequest,
    toolCalls: 1,
    toolBytes: capabilityUse.bytes,
    concurrentCalls: 1,
  };
  if (budgetRequest.toolCalls !== 1
    || budgetRequest.toolBytes !== capabilityUse.bytes
    || budgetRequest.concurrentCalls !== 1
    || !budgetLedger.reserve(budgetReservationId, requiredBudget, budgetGate)) {
    return { accepted: false, status: "blocked_preflight", result: null, blockers: ["budget_reservation_rejected"] };
  }
  const leaseKeys = [
    `repository:${request.repositoryFullName}`,
    `branch:${request.branch}`,
    `platform:${capabilityUse.platform}`,
    `provider:${capabilityUse.provider}`,
    ...canonicalPaths.map((entry) => `path:${entry.relativePath}`),
  ];
  const leaseMode = WRITE_ACTIONS.has(request.action) ? "write" : "read";
  for (const resourceKey of leaseKeys) {
    const acquired = leaseRegistry.acquire({
      resourceKey,
      taskId: capabilityUse.taskId,
      mode: leaseMode,
      issuedAt: preGate.now.toISOString(),
      expiresAt: preGate.deadlineAt,
    }, preGate.now);
    if (!acquired) {
      budgetLedger.release(budgetReservationId);
      leaseKeys.forEach((key) => leaseRegistry.release(key, capabilityUse.taskId));
      return { accepted: false, status: "blocked_preflight", result: null, blockers: ["resource_lease_conflict"] };
    }
  }
  const capabilityEvent = capabilityLedger.consume(capabilityId, capabilityUse, preGate);
  if (capabilityEvent.event !== "consumed") {
    budgetLedger.release(budgetReservationId);
    leaseKeys.forEach((key) => leaseRegistry.release(key, capabilityUse.taskId));
    return { accepted: false, status: "blocked_preflight", result: null, blockers: String(capabilityEvent.reason).split(",") };
  }
  let pinnedHandles = [];
  try {
    pinnedHandles = preparePinnedPathHandles(request.action, canonicalPaths);
    const executableInvocation = invocation.kind === "internal"
      ? {
          ...invocation,
          pathHandles: pinnedHandles.map(({ relativePath, descriptor }) => ({ relativePath, descriptor })),
        }
      : invocation;
    const result = await executeInvocation(executableInvocation, signal);
    const postGate = getRuntimeGate();
    const postBlockers = [
      ...(signal.aborted ? ["task_cancelled"] : []),
      ...capabilityLedger.reauthorizeAcceptedCall(capabilityId, capabilityUse, postGate),
    ];
    const settled = budgetLedger.settle(budgetReservationId, requiredBudget, postGate);
    if (postBlockers.length || !settled) {
      const blockers = [...new Set([...postBlockers, ...(!settled ? ["budget_settlement_rejected"] : [])])].sort();
      const internalRollback = rollbackPinnedPathHandles(pinnedHandles);
      const externalRollback = typeof rollbackInvocation === "function"
        ? await rollbackInvocation(executableInvocation, result, signal)
        : invocation.kind === "internal";
      const rollbackSucceeded = internalRollback && externalRollback === true;
      if (rollbackCoordinator && typeof rollbackCoordinator.record === "function") {
        rollbackCoordinator.record(capabilityUse.taskId, rollbackSucceeded, postGate.now);
      }
      return {
        accepted: false,
        status: rollbackSucceeded ? "rolled_back_postflight" : "rollback_failed_quarantined",
        result: null,
        blockers: [...new Set([...blockers, ...(rollbackSucceeded ? [] : ["rollback_failed"])])].sort(),
      };
    }
    return { accepted: true, status: "completed", result, blockers: [] };
  } catch {
    const internalRollback = rollbackPinnedPathHandles(pinnedHandles);
    const externalRollback = typeof rollbackInvocation === "function"
      ? await rollbackInvocation(invocation, null, signal)
      : invocation.kind === "internal";
    const rollbackSucceeded = internalRollback && externalRollback === true;
    if (rollbackCoordinator && typeof rollbackCoordinator.record === "function") {
      rollbackCoordinator.record(capabilityUse.taskId, rollbackSucceeded, getRuntimeGate().now);
    }
    budgetLedger.release(budgetReservationId);
    return {
      accepted: false,
      status: rollbackSucceeded ? "execution_failed_rolled_back" : "rollback_failed_quarantined",
      result: null,
      blockers: [rollbackSucceeded ? "execution_failed" : "rollback_failed"],
    };
  } finally {
    closePinnedPathHandles(pinnedHandles);
    leaseKeys.forEach((key) => leaseRegistry.release(key, capabilityUse.taskId));
  }
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
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
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
  totalTimeoutMs = 15_000,
}) => {
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
    const target = await runBounded(
      () => validateResearchUrlWithDns(current, resolveDns),
      "research_dns_timeout",
    );
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
