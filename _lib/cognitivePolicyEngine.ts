import {
  isPrivateOrReservedAddress,
  sanitizeCognitivePayload,
} from "./cognitivePlatformFoundation";

export type CanonicalSecurityPolicy = Readonly<{
  policyId: string;
  normalization: Readonly<{
    unicodeForm: "NFKC";
    stripDefaultIgnorables: boolean;
    caseFoldLabels: boolean;
    maximumDecodeDepth: number;
    maximumEncodedCandidateBytes: number;
  }>;
  limits: Readonly<{
    maximumDepth: number;
    maximumObjectKeys: number;
    maximumArrayLength: number;
    maximumStringBytes: number;
    maximumTotalBytes: number;
    maximumFragments: number;
    maximumClassificationMilliseconds: number;
  }>;
  secretLabels: readonly string[];
  providerAuthorityTerms: readonly string[];
  privateIdentifierCategories: readonly string[];
  fragmentReconstruction: Readonly<{
    positionAliases: readonly string[];
    fragmentAliases: readonly string[];
    semanticOrder: readonly string[];
    rejectDuplicatePositions: boolean;
    inspectForwardAndReverse: boolean;
    inspectObjectKeysAndValuesTogether: boolean;
  }>;
  safeStatusMetadata: readonly string[];
  forbiddenPrototypeKeys: readonly string[];
}>;

export type CanonicalClassification =
  | "safe"
  | "secret_or_private"
  | "untrusted_instruction"
  | "provider_authority"
  | "invalid_or_oversized";

const DEFAULT_IGNORABLES =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\uffa0]/gu;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const PHONE = /(?:^|\D)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?:\D|$)/u;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u;
const PEM = /-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/u;
const SIGNED_URL = /[?&](?:x-amz-signature|x-goog-signature|signature|sig|token)=/iu;
const INSTRUCTION =
  /\b(?:ignore|override|bypass|disable|weaken|forget)\b[\s\S]{0,80}\b(?:instruction|policy|approval|rls|guard|system|developer|safety)\b|\b(?:merge|deploy|release|execute|run|invoke|read)\b[\s\S]{0,80}\b(?:pull request|production|shell|command|tool|environment|secret|credential)\b/iu;
const SECRET_ASSIGNMENT =
  /\b(?:access[_ -]?token|api[_ -]?key|authorization|bearer|client[_ -]?secret|cookie|credential|github[_ -]?token|key[_ -]?password|model[_ -]?key|password|passphrase|private[_ -]?key|refresh[_ -]?token|secret|service[_ -]?role|session[_ -]?cookie|token)\b\s*(?::|=|is)\s*[^\s,;]{6,}/iu;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const normalizeSecurityText = (
  value: string,
  policy: CanonicalSecurityPolicy,
): string => {
  const normalized = value.normalize(policy.normalization.unicodeForm);
  return policy.normalization.stripDefaultIgnorables
    ? normalized.replace(DEFAULT_IGNORABLES, "")
    : normalized;
};

const boundedDecode = (
  value: string,
  policy: CanonicalSecurityPolicy,
): readonly string[] => {
  if (
    new TextEncoder().encode(value).byteLength >
    policy.normalization.maximumEncodedCandidateBytes
  ) {
    return Object.freeze([value]);
  }
  const candidates = new Set<string>([value]);
  let current = value;
  for (
    let index = 0;
    index < policy.normalization.maximumDecodeDepth;
    index += 1
  ) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      candidates.add(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  const compact = value.replace(/\s+/gu, "");
  if (
    compact.length >= 8 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/u.test(compact)
  ) {
    try {
      const decoded = globalThis.atob(compact);
      if (/^[\x09\x0a\x0d\x20-\x7e]+$/u.test(decoded)) candidates.add(decoded);
    } catch {
      // Invalid base64 remains untrusted source data, not an execution error.
    }
  }
  if (compact.length >= 16 && compact.length % 2 === 0 && /^[a-f0-9]+$/iu.test(compact)) {
    const bytes = compact.match(/.{2}/gu) ?? [];
    const decoded = String.fromCharCode(...bytes.map((entry) => Number.parseInt(entry, 16)));
    if (/^[\x09\x0a\x0d\x20-\x7e]+$/u.test(decoded)) candidates.add(decoded);
  }
  return Object.freeze([...candidates]);
};

const collectBoundedText = (
  value: unknown,
  policy: CanonicalSecurityPolicy,
): Readonly<{ valid: boolean; texts: readonly string[] }> => {
  const texts: string[] = [];
  const seen = new WeakSet<object>();
  let totalBytes = 0;
  let fragments = 0;
  const visit = (entry: unknown, depth: number): boolean => {
    if (depth > policy.limits.maximumDepth) return false;
    if (typeof entry === "string") {
      const bytes = new TextEncoder().encode(entry).byteLength;
      if (bytes > policy.limits.maximumStringBytes) return false;
      totalBytes += bytes;
      fragments += 1;
      texts.push(normalizeSecurityText(entry, policy));
      return (
        totalBytes <= policy.limits.maximumTotalBytes &&
        fragments <= policy.limits.maximumFragments
      );
    }
    if (entry === null || typeof entry === "number" || typeof entry === "boolean") {
      return true;
    }
    if (Array.isArray(entry)) {
      if (entry.length > policy.limits.maximumArrayLength) return false;
      if (seen.has(entry)) return false;
      seen.add(entry);
      return entry.every((child) => visit(child, depth + 1));
    }
    if (typeof entry === "object") {
      if (seen.has(entry)) return false;
      seen.add(entry);
      const record = entry as Record<string, unknown>;
      const keys = Object.keys(record);
      if (
        keys.length > policy.limits.maximumObjectKeys ||
        keys.some((key) => policy.forbiddenPrototypeKeys.includes(key))
      ) {
        return false;
      }
      for (const key of keys.sort()) {
        const normalizedKey = normalizeSecurityText(key, policy);
        texts.push(normalizedKey);
        if (!visit(record[key], depth + 1)) return false;
      }
      return true;
    }
    return false;
  };
  return Object.freeze({ valid: visit(value, 0), texts: Object.freeze(texts) });
};

export const classifyCanonicalSecurityPayload = (
  value: unknown,
  policy: CanonicalSecurityPolicy,
): CanonicalClassification => {
  const startedAt = Date.now();
  const collected = collectBoundedText(value, policy);
  if (!collected.valid) return "invalid_or_oversized";
  const joined = collected.texts.join(" ");
  const fragmentJoined = collected.texts.join("");
  const candidates = new Set<string>([
    joined,
    fragmentJoined,
    [...collected.texts].reverse().join(""),
  ]);
  for (const text of [...candidates]) {
    for (const decoded of boundedDecode(text, policy)) candidates.add(decoded);
  }
  for (const raw of candidates) {
    const text = normalizeSecurityText(raw, policy);
    if (EMAIL.test(text) || PHONE.test(text) || JWT.test(text) || PEM.test(text) || SIGNED_URL.test(text) || SECRET_ASSIGNMENT.test(text)) {
      return "secret_or_private";
    }
    if (INSTRUCTION.test(text)) return "untrusted_instruction";
    const authority = policy.providerAuthorityTerms.some((term) =>
      text.toLocaleLowerCase("en-US").includes(term.toLocaleLowerCase("en-US")),
    );
    if (authority) return "provider_authority";
    if (Date.now() - startedAt > policy.limits.maximumClassificationMilliseconds) {
      return "invalid_or_oversized";
    }
  }
  const inherited = sanitizeCognitivePayload(value);
  if (!inherited.accepted) return "secret_or_private";
  if (inherited.categories.includes("untrusted_instruction")) {
    return "untrusted_instruction";
  }
  if (inherited.categories.includes("private_identifier") || inherited.categories.includes("secret_like_value")) {
    return "secret_or_private";
  }
  return "safe";
};

export type CanonicalNetworkPolicy = Readonly<{
  policyId: string;
  allowedSchemes: readonly string[];
  allowedPorts: readonly string[];
  forbiddenHostSuffixes: readonly string[];
  forbiddenHostnames: readonly string[];
  forbiddenCidrs: readonly string[];
  revalidateEveryRedirect: boolean;
  pinResolvedAddresses: boolean;
  verifyConnectedPeer: boolean;
}>;

const normalizeHostname = (hostname: string): string =>
  hostname.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\.+$/u, "");

export const validateCanonicalResearchUrl = (
  raw: string,
  policy: CanonicalNetworkPolicy,
): readonly string[] => {
  const blockers: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return Object.freeze(["url_invalid"]);
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (!policy.allowedSchemes.includes(parsed.protocol)) blockers.push("scheme_forbidden");
  if (!policy.allowedPorts.includes(parsed.port)) blockers.push("port_forbidden");
  if (parsed.username || parsed.password) blockers.push("embedded_credentials_forbidden");
  if (
    policy.forbiddenHostnames.includes(hostname) ||
    policy.forbiddenHostSuffixes.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    blockers.push("hostname_forbidden");
  }
  const unwrappedMapped = hostname.match(/^\[?::ffff:(\d+\.\d+\.\d+\.\d+)\]?$/iu)?.[1];
  const addressCandidate = unwrappedMapped ?? hostname.replace(/^\[|\]$/gu, "");
  if (isPrivateOrReservedAddress(addressCandidate)) blockers.push("address_forbidden");
  if (
    !policy.revalidateEveryRedirect ||
    !policy.pinResolvedAddresses ||
    !policy.verifyConnectedPeer
  ) {
    blockers.push("runtime_peer_controls_required");
  }
  return Object.freeze([...new Set(blockers)]);
};

export const validateResolvedResearchAddresses = (
  resolvedAddresses: readonly string[],
  connectedPeer: string,
  policy: CanonicalNetworkPolicy,
): readonly string[] => {
  const blockers: string[] = [];
  if (resolvedAddresses.length === 0) blockers.push("dns_result_missing");
  if (resolvedAddresses.some(isPrivateOrReservedAddress)) blockers.push("dns_private_address");
  if (!resolvedAddresses.includes(connectedPeer)) blockers.push("connected_peer_not_pinned");
  if (isPrivateOrReservedAddress(connectedPeer)) blockers.push("connected_peer_private");
  if (!policy.verifyConnectedPeer) blockers.push("connected_peer_verification_disabled");
  return Object.freeze([...new Set(blockers)]);
};

export type SensitivePathPolicy = Readonly<{
  policyId: string;
  unicodeNormalization: "NFKC";
  caseInsensitive: boolean;
  forbiddenSegments: readonly string[];
  forbiddenBasenames: readonly string[];
  forbiddenExtensions: readonly string[];
  forbiddenNameFragments: readonly string[];
  rejectSymlinks: boolean;
  rejectHardlinkedSensitiveFiles: boolean;
  rejectSubmodules: boolean;
}>;

export const classifySensitiveRepositoryPath = (
  rawPath: string,
  policy: SensitivePathPolicy,
): "allowed" | "forbidden" => {
  let decoded = rawPath.normalize(policy.unicodeNormalization);
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return "forbidden";
    }
  }
  decoded = decoded.replaceAll("\\", "/");
  const comparison = policy.caseInsensitive
    ? decoded.toLocaleLowerCase("en-US")
    : decoded;
  const segments = comparison.split("/").filter(Boolean);
  if (
    !comparison ||
    comparison.startsWith("/") ||
    /^[a-z]:\//iu.test(comparison) ||
    segments.includes("..") ||
    segments.some((segment) =>
      policy.forbiddenSegments.some(
        (forbidden) =>
          segment === forbidden ||
          comparison.includes(`/${forbidden}/`) ||
          comparison.startsWith(`${forbidden}/`),
      ),
    )
  ) {
    return "forbidden";
  }
  const basename = segments.at(-1) ?? "";
  if (
    policy.forbiddenBasenames.includes(basename) ||
    policy.forbiddenExtensions.some((extension) => basename.endsWith(extension)) ||
    policy.forbiddenNameFragments.some((fragment) => basename.includes(fragment))
  ) {
    return "forbidden";
  }
  return "allowed";
};

export type ProviderPolicyDecision = Readonly<{
  provider:
    | "aws"
    | "azure"
    | "kubernetes"
    | "gcp"
    | "github"
    | "app_store_connect"
    | "google_play"
    | "eas"
    | "revenuecat"
    | "stripe";
  classification:
    | "explicit_deny"
    | "read_only"
    | "write_or_release_authority"
    | "owner_admin_or_escalation"
    | "unknown";
  executable: false;
  ownerReviewRequired: boolean;
  reasons: readonly string[];
}>;

const WRITE_AUTHORITY =
  /\b(?:admin|administrator|owner|root|write|maintain|merge|deploy|release|publish|submit|rollout|update|delete|create|manage|impersonate|assumerole|setiampolicy|tokencreator|workflow)\b/iu;
const DENY_AUTHORITY = /\b(?:deny|denied|forbidden|not authorized|insufficient permission)\b/iu;
const DENIAL_REVERSAL = /\b(?:remove|disable|bypass|override|reverse)\b[\s\S]{0,30}\b(?:deny|denial|restriction)\b/iu;

export const classifyProviderPolicy = (
  provider: ProviderPolicyDecision["provider"],
  rawPolicy: unknown,
): ProviderPolicyDecision => {
  const serialized = JSON.stringify(canonicalize(rawPolicy)).slice(0, 16_000);
  const reasons: string[] = [];
  let classification: ProviderPolicyDecision["classification"] = "unknown";
  if (DENIAL_REVERSAL.test(serialized)) {
    classification = "owner_admin_or_escalation";
    reasons.push("denial_reversal_requested");
  } else if (DENY_AUTHORITY.test(serialized)) {
    classification = "explicit_deny";
    reasons.push("explicit_deny_observed");
  } else if (
    WRITE_AUTHORITY.test(serialized) ||
    /"Action"\s*:\s*"\*"|"NotAction"|"NotResource"|\bcluster-admin\b|\bsystem:masters\b/iu.test(
      serialized,
    )
  ) {
    classification = /\b(?:owner|root|administrator|admin|impersonate|setiampolicy|assumerole)\b/iu.test(
      serialized,
    )
      ? "owner_admin_or_escalation"
      : "write_or_release_authority";
    reasons.push("mutation_or_escalation_authority_observed");
  } else if (/\b(?:read|view|list|get|describe|download)\b/iu.test(serialized)) {
    classification = "read_only";
    reasons.push("read_only_authority_observed");
  } else {
    reasons.push("provider_policy_unknown");
  }
  return Object.freeze({
    provider,
    classification,
    executable: false,
    ownerReviewRequired:
      classification === "write_or_release_authority" ||
      classification === "owner_admin_or_escalation" ||
      classification === "unknown",
    reasons: Object.freeze(reasons),
  });
};

export const authorityTimestampActive = (
  startsAt: string,
  expiresAt: string,
  databaseNow: string,
): boolean => {
  const start = Date.parse(startsAt);
  const end = Date.parse(expiresAt);
  const now = Date.parse(databaseNow);
  if (![start, end, now].every(Number.isFinite) || end <= start) {
    throw new Error("authority_timestamp_invalid");
  }
  return now >= start && now < end;
};
