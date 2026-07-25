import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import { validateResearchUrl } from "../../../_lib/cognitivePlatformFoundation.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};
import researchAuthoritiesJson from "../../../config/intelligence/research-authorities.json" with {
  type: "json",
};

export type Json = null | boolean | number | string | Json[] | {
  [key: string]: Json;
};
export type JsonObject = { [key: string]: Json };

type ResearchAuthority = Readonly<{
  authorityId: string;
  hostname: string;
  ownerId: string;
  pathPrefix?: string;
  publisher: string;
  sourceType: string;
}>;

export type SourceRequest = Readonly<{
  action: "retrieve_source";
  authorityId: string;
  citationLocator: string;
  citationTitle: string;
  evidenceQuery: string;
  environment: "production";
  freshnessSeconds: number;
  platform: "shared";
  projectId: string;
  publisher: string;
  sourceType: string;
  taskId: string;
  url: string;
}>;

export type ClaimRequest = Readonly<{
  action: "record_claim";
  boundedClaim: string;
  canaryKey: string;
  category: string;
  confidence: number;
  contradictionState: string;
  environment: "production";
  freshnessDeadline: string;
  platform: "shared";
  projectId: string;
  sourceIds: readonly string[];
  taskId: string;
}>;

export type ContradictionDetectionRequest = Readonly<{
  action: "detect_contradiction";
  boundedEvidence: string;
  claimId: string;
  environment: "production";
  platform: "shared";
  projectId: string;
  sourceId: string;
  taskId: string;
}>;

export type ResearchMaintenanceRequest = Readonly<{
  action: "expire_public_memory";
  environment: "production";
  limit: number;
  platform: "shared";
  projectId: string;
  taskId: string;
}>;

export type CanonicalResearchUrl = Readonly<{
  canonical: string;
  hostname: string;
  pathAndQuery: string;
  pathname: string;
}>;

export type PinnedResearchResponse = Readonly<{
  body: string;
  canonicalUrl: string;
  connectedAddress: string;
  contentType: string;
  lastModifiedHeader: string | null;
  resolvedAddresses: readonly string[];
  retrievalDate: string;
  status: number;
}>;

const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const AUTHORITIES = Object.freeze(
  (researchAuthoritiesJson.authorities as ResearchAuthority[]).map((entry) =>
    Object.freeze({ ...entry, hostname: entry.hostname.toLowerCase() })
  ),
);
const AUTHORITY_BY_ID = new Map(
  AUTHORITIES.map((entry) => [entry.authorityId, entry]),
);

export const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]{1,79}$/u;
const SOURCE_KEYS = Object.freeze([
  "action",
  "authorityId",
  "citationLocator",
  "citationTitle",
  "evidenceQuery",
  "environment",
  "freshnessSeconds",
  "platform",
  "projectId",
  "publisher",
  "sourceType",
  "taskId",
  "url",
]);
const CLAIM_KEYS = Object.freeze([
  "action",
  "boundedClaim",
  "canaryKey",
  "category",
  "confidence",
  "contradictionState",
  "environment",
  "freshnessDeadline",
  "platform",
  "projectId",
  "sourceIds",
  "taskId",
]);
const CONTRADICTION_DETECTION_KEYS = Object.freeze([
  "action",
  "boundedEvidence",
  "claimId",
  "environment",
  "platform",
  "projectId",
  "sourceId",
  "taskId",
]);
const MAINTENANCE_KEYS = Object.freeze([
  "action",
  "environment",
  "limit",
  "platform",
  "projectId",
  "taskId",
]);
const CANARY_KEYS = new Set([
  "platform_policy_research",
  "repository_architecture_ux",
  "dependency_security_research",
]);
const CLAIM_CATEGORIES = new Set([
  "technical",
  "platform_policy",
  "consequential_news",
  "product",
  "security",
]);
const MAX_SOURCE_TTL_SECONDS = Object.freeze(
  {
    news: 7 * 86_400,
    security_advisory: 14 * 86_400,
    platform_policy: 30 * 86_400,
    store_policy: 30 * 86_400,
    official_documentation: 30 * 86_400,
    product_research: 30 * 86_400,
    competitor_research: 30 * 86_400,
    engineering_practice: 30 * 86_400,
  } as const,
);

export const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    expected.every((key, index) => key === actual[index]);
};

const toBoundedText = (
  value: unknown,
  minimum: number,
  maximum: number,
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length < minimum || normalized.length > maximum ||
    new TextEncoder().encode(normalized).byteLength > maximum * 4
  ) {
    return null;
  }
  return normalized;
};

export const isSecuritySafe = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

export const canonicalizeResearchUrl = (
  raw: unknown,
): CanonicalResearchUrl | null => {
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 2_048) {
    return null;
  }
  const normalized = raw.normalize("NFKC").replace(
    /[\u3002\uff0e\uff61]/gu,
    ".",
  );
  if (validateResearchUrl(normalized).length > 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.hash || (parsed.port && parsed.port !== "443")
  ) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !hostname || hostname === "localhost" ||
    hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    !/^[a-z0-9.-]+$/u.test(hostname) ||
    hostname.includes("..")
  ) {
    return null;
  }
  parsed.hostname = hostname;
  parsed.port = "";
  const canonical = parsed.toString();
  if (!isSecuritySafe({ url: canonical })) return null;
  return Object.freeze({
    canonical,
    hostname,
    pathAndQuery: `${parsed.pathname}${parsed.search}`,
    pathname: parsed.pathname,
  });
};

const parseIpv4 = (raw: string): bigint | null => {
  const parts = raw.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) =>
      !/^(?:0|[1-9][0-9]{0,2})$/u.test(part) || Number(part) > 255
    )
  ) {
    return null;
  }
  return parts.reduce(
    (value, part) => (value << 8n) | BigInt(Number(part)),
    0n,
  );
};

const parseIpv6 = (raw: string): bigint | null => {
  let value = raw.toLowerCase().replace(/^\[|\]$/gu, "").split("%", 1)[0];
  if (value.startsWith("::ffff:") && value.slice(7).includes(".")) {
    const ipv4 = parseIpv4(value.slice(7));
    return ipv4 === null ? null : (0xffffn << 32n) | ipv4;
  }
  if (value.includes(".")) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[a-f0-9]{1,4}$/u.test(group))
  ) {
    return null;
  }
  return groups.reduce(
    (result, group) => (result << 16n) | BigInt(`0x${group}`),
    0n,
  );
};

const ipv4InRange = (
  value: bigint,
  base: string,
  prefix: number,
): boolean => {
  const parsedBase = parseIpv4(base);
  if (parsedBase === null) return true;
  const shift = BigInt(32 - prefix);
  return (value >> shift) === (parsedBase >> shift);
};

const ipv6InRange = (
  value: bigint,
  base: string,
  prefix: number,
): boolean => {
  const parsedBase = parseIpv6(base);
  if (parsedBase === null) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (parsedBase >> shift);
};

const PRIVATE_V4: readonly [string, number][] = Object.freeze([
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]);
const RESERVED_V6: readonly [string, number][] = Object.freeze([
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
]);

export const ipAddressKey = (raw: string): string | null => {
  const normalized =
    raw.toLowerCase().replace(/^\[|\]$/gu, "").split("%", 1)[0];
  if (normalized.startsWith("::ffff:") && normalized.slice(7).includes(".")) {
    const mapped = parseIpv4(normalized.slice(7));
    return mapped === null ? null : `4:${mapped.toString(16)}`;
  }
  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) return `4:${ipv4.toString(16)}`;
  const ipv6 = parseIpv6(normalized);
  return ipv6 === null ? null : `6:${ipv6.toString(16)}`;
};

export const isPrivateOrReservedIp = (raw: string): boolean => {
  const normalized =
    raw.toLowerCase().replace(/^\[|\]$/gu, "").split("%", 1)[0];
  if (normalized.startsWith("::ffff:") && normalized.slice(7).includes(".")) {
    return isPrivateOrReservedIp(normalized.slice(7));
  }
  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) {
    return PRIVATE_V4.some(([base, prefix]) => ipv4InRange(ipv4, base, prefix));
  }
  const ipv6 = parseIpv6(normalized);
  if (ipv6 === null) return true;
  if (!ipv6InRange(ipv6, "2000::", 3)) return true;
  return RESERVED_V6.some(([base, prefix]) => ipv6InRange(ipv6, base, prefix));
};

export const authorityForSource = (
  authorityId: string,
  target: CanonicalResearchUrl,
  publisher: string,
  sourceType: string,
): ResearchAuthority | null => {
  const authority = AUTHORITY_BY_ID.get(authorityId);
  if (
    !authority || authority.hostname !== target.hostname ||
    authority.publisher !== publisher || authority.sourceType !== sourceType ||
    (authority.pathPrefix !== undefined &&
      target.pathname !== authority.pathPrefix &&
      !target.pathname.startsWith(`${authority.pathPrefix}/`))
  ) {
    return null;
  }
  return authority;
};

export const authorityOwnerForId = (authorityId: string): string | null =>
  AUTHORITY_BY_ID.get(authorityId)?.ownerId ?? null;

export const normalizeSourceRequest = (
  payload: unknown,
): SourceRequest | null => {
  if (
    !isRecord(payload) || !hasExactKeys(payload, SOURCE_KEYS) ||
    payload.action !== "retrieve_source" ||
    payload.platform !== "shared" || payload.environment !== "production" ||
    typeof payload.taskId !== "string" ||
    !UUID_PATTERN.test(payload.taskId) ||
    typeof payload.projectId !== "string" ||
    !UUID_PATTERN.test(payload.projectId)
  ) {
    return null;
  }
  const authorityId = toBoundedText(payload.authorityId, 2, 80);
  const publisher = toBoundedText(payload.publisher, 1, 120);
  const sourceType = toBoundedText(payload.sourceType, 2, 80);
  const citationTitle = toBoundedText(payload.citationTitle, 1, 512);
  const citationLocator = toBoundedText(payload.citationLocator, 1, 512);
  const evidenceQuery = toBoundedText(payload.evidenceQuery, 4, 512);
  const url = canonicalizeResearchUrl(payload.url);
  if (
    !authorityId || !SAFE_IDENTIFIER.test(authorityId) || !publisher ||
    !sourceType || !SAFE_IDENTIFIER.test(sourceType) || !citationTitle ||
    !citationLocator || !evidenceQuery || !url ||
    !authorityForSource(authorityId, url, publisher, sourceType) ||
    !Number.isSafeInteger(payload.freshnessSeconds)
  ) {
    return null;
  }
  const maximumTtl = MAX_SOURCE_TTL_SECONDS[
    sourceType as keyof typeof MAX_SOURCE_TTL_SECONDS
  ];
  if (
    maximumTtl === undefined ||
    Number(payload.freshnessSeconds) < 300 ||
    Number(payload.freshnessSeconds) > maximumTtl
  ) {
    return null;
  }
  if (
    authorityId === "chillywood-public-repository" &&
    !/^\/Chillywood2025\/chillywood-mobile\/commit\/[a-f0-9]{40}$/u.test(
      url.pathname,
    )
  ) {
    return null;
  }
  const normalized: SourceRequest = Object.freeze({
    action: "retrieve_source",
    authorityId,
    citationLocator,
    citationTitle,
    evidenceQuery,
    environment: "production",
    freshnessSeconds: Number(payload.freshnessSeconds),
    platform: "shared",
    projectId: payload.projectId,
    publisher,
    sourceType,
    taskId: payload.taskId,
    url: url.canonical,
  });
  return isSecuritySafe(normalized) ? normalized : null;
};

export const normalizeClaimRequest = (
  payload: unknown,
  now = new Date(),
): ClaimRequest | null => {
  if (
    !isRecord(payload) || !hasExactKeys(payload, CLAIM_KEYS) ||
    payload.action !== "record_claim" ||
    payload.platform !== "shared" || payload.environment !== "production" ||
    typeof payload.taskId !== "string" ||
    !UUID_PATTERN.test(payload.taskId) ||
    typeof payload.projectId !== "string" ||
    !UUID_PATTERN.test(payload.projectId) ||
    typeof payload.canaryKey !== "string" ||
    !CANARY_KEYS.has(payload.canaryKey) ||
    typeof payload.category !== "string" ||
    !CLAIM_CATEGORIES.has(payload.category) ||
    payload.contradictionState !== "none" ||
    typeof payload.confidence !== "number" ||
    !Number.isFinite(payload.confidence) ||
    payload.confidence < 0 || payload.confidence > 1 ||
    !Array.isArray(payload.sourceIds) ||
    payload.sourceIds.length < 1 || payload.sourceIds.length > 8 ||
    payload.sourceIds.some((id) =>
      typeof id !== "string" || !UUID_PATTERN.test(id)
    ) ||
    new Set(payload.sourceIds).size !== payload.sourceIds.length
  ) {
    return null;
  }
  const boundedClaim = toBoundedText(payload.boundedClaim, 4, 2_000);
  if (!boundedClaim || typeof payload.freshnessDeadline !== "string") {
    return null;
  }
  const freshness = Date.parse(payload.freshnessDeadline);
  if (
    !Number.isFinite(freshness) || freshness <= now.getTime() ||
    freshness > now.getTime() + 30 * 86_400_000
  ) {
    return null;
  }
  const normalized: ClaimRequest = Object.freeze({
    action: "record_claim",
    boundedClaim,
    canaryKey: payload.canaryKey,
    category: payload.category,
    confidence: payload.confidence,
    contradictionState: payload.contradictionState,
    environment: "production",
    freshnessDeadline: new Date(freshness).toISOString(),
    platform: "shared",
    projectId: payload.projectId,
    sourceIds: Object.freeze([...payload.sourceIds]) as readonly string[],
    taskId: payload.taskId,
  });
  return isSecuritySafe(normalized) ? normalized : null;
};

export const normalizeContradictionDetectionRequest = (
  payload: unknown,
): ContradictionDetectionRequest | null => {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, CONTRADICTION_DETECTION_KEYS) ||
    payload.action !== "detect_contradiction" ||
    payload.platform !== "shared" || payload.environment !== "production" ||
    typeof payload.taskId !== "string" || !UUID_PATTERN.test(payload.taskId) ||
    typeof payload.projectId !== "string" ||
    !UUID_PATTERN.test(payload.projectId) ||
    typeof payload.claimId !== "string" ||
    !UUID_PATTERN.test(payload.claimId) ||
    typeof payload.sourceId !== "string" ||
    !UUID_PATTERN.test(payload.sourceId)
  ) {
    return null;
  }
  const boundedEvidence = toBoundedText(payload.boundedEvidence, 4, 2_000);
  if (!boundedEvidence) return null;
  const normalized: ContradictionDetectionRequest = Object.freeze({
    action: "detect_contradiction",
    boundedEvidence,
    claimId: payload.claimId,
    environment: "production",
    platform: "shared",
    projectId: payload.projectId,
    sourceId: payload.sourceId,
    taskId: payload.taskId,
  });
  return isSecuritySafe({ boundedEvidence }) ? normalized : null;
};

export const normalizeResearchMaintenanceRequest = (
  payload: unknown,
): ResearchMaintenanceRequest | null => {
  if (
    !isRecord(payload) || !hasExactKeys(payload, MAINTENANCE_KEYS) ||
    payload.action !== "expire_public_memory" ||
    payload.platform !== "shared" || payload.environment !== "production" ||
    typeof payload.taskId !== "string" || !UUID_PATTERN.test(payload.taskId) ||
    typeof payload.projectId !== "string" ||
    !UUID_PATTERN.test(payload.projectId) ||
    !Number.isSafeInteger(payload.limit) ||
    Number(payload.limit) < 1 || Number(payload.limit) > 100
  ) {
    return null;
  }
  return Object.freeze({
    action: "expire_public_memory",
    environment: "production",
    limit: Number(payload.limit),
    platform: "shared",
    projectId: payload.projectId,
    taskId: payload.taskId,
  });
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");

export const extractBoundedExcerpt = (
  body: string,
  contentType: string,
  evidenceQuery?: string,
): string | null => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (
    ![
      "application/feed+json",
      "application/json",
      "text/html",
      "text/plain",
    ].includes(mediaType)
  ) {
    return null;
  }
  let text = body;
  if (mediaType === "text/html") {
    text = text
      .replace(/<!--[\s\S]*?-->/gu, " ")
      .replace(/<(script|style|form|noscript|svg)\b[\s\S]*?<\/\1\s*>/giu, " ")
      .replace(
        /<[^>]+(?:hidden|display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/giu,
        " ",
      )
      .replace(/<[^>]+>/gu, " ");
    text = decodeHtmlEntities(text);
  }
  text = text.replace(/\s+/gu, " ").trim();
  let bounded = text.slice(0, 2_000);
  if (evidenceQuery !== undefined) {
    const query = evidenceQuery.replace(/\s+/gu, " ").trim();
    if (
      query.length < 4 || query.length > 512 ||
      !isSecuritySafe({ evidenceQuery: query })
    ) {
      return null;
    }
    const matchAt = text.toLocaleLowerCase("en-US").indexOf(
      query.toLocaleLowerCase("en-US"),
    );
    if (matchAt < 0) return null;
    const start = Math.max(0, Math.min(matchAt - 600, text.length - 2_000));
    bounded = text.slice(start, start + 2_000).trim();
  }
  if (!bounded || !isSecuritySafe({ excerpt: bounded })) return null;
  return bounded;
};

export type PublicationDateCandidate = Readonly<{
  date: string;
  evidenceClass: "modification" | "publication";
  label:
    | "http_last_modified"
    | "json_ld_article_date_modified"
    | "json_ld_article_date_published"
    | "open_graph_modified_time"
    | "open_graph_published_time"
    | "publisher_labeled_modified_date"
    | "publisher_labeled_publication_date"
    | "schema_org_date_modified"
    | "schema_org_date_published"
    | "trusted_feed_publication_date";
  priority: number;
}>;

const parseTagAttributes = (source: string): ReadonlyMap<string, string> => {
  const attributes = new Map<string, string>();
  for (
    const match of source.matchAll(
      /([a-z_:][a-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/giu,
    )
  ) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) {
      attributes.set(name, decodeHtmlEntities(match[3].trim()));
    }
  }
  return attributes;
};

const schemaTypes = (value: unknown): readonly string[] => {
  const values = Array.isArray(value) ? value : [value];
  return Object.freeze(
    values
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
};

const schemaIdentifier = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (
    isRecord(value) &&
    typeof value["@id"] === "string" &&
    value["@id"].trim()
  ) {
    return value["@id"].trim();
  }
  return null;
};

const schemaIdentifiers = (value: unknown): readonly string[] => {
  const values = Array.isArray(value) ? value : [value];
  return Object.freeze(
    values.map(schemaIdentifier).filter((entry): entry is string => !!entry),
  );
};

const isArticleNode = (value: Record<string, unknown>): boolean =>
  schemaTypes(value["@type"]).some((type) =>
    [
      "article",
      "blogposting",
      "newsarticle",
      "report",
      "scholarlyarticle",
      "techarticle",
    ].includes(type)
  );

const primaryJsonLdNodes = (
  root: Record<string, unknown>,
): readonly Record<string, unknown>[] => {
  const graph = Array.isArray(root["@graph"])
    ? root["@graph"].filter(isRecord)
    : [];
  if (graph.length < 1) return Object.freeze([root]);

  const referenced = new Set([
    ...schemaIdentifiers(root.mainEntity),
    ...graph.flatMap((node) =>
      schemaTypes(node["@type"]).includes("webpage")
        ? schemaIdentifiers(node.mainEntity)
        : []
    ),
  ]);
  const explicitlyPrimary = graph.filter((node) => {
    const nodeId = schemaIdentifier(node["@id"]);
    return (
      (nodeId !== null && referenced.has(nodeId)) ||
      node.mainEntityOfPage === true ||
      schemaIdentifier(node.mainEntityOfPage) !== null
    );
  });
  if (explicitlyPrimary.length > 0) {
    return Object.freeze(explicitlyPrimary);
  }
  const articles = graph.filter(isArticleNode);
  return Object.freeze(articles.length === 1 ? articles : []);
};

const extractJsonLdRoots = (body: string): readonly unknown[] => {
  const roots: unknown[] = [];
  for (
    const match of body.matchAll(
      /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json(?:\s*;\s*charset=[^"']+)?["'][^>]*>([\s\S]*?)<\/script\s*>/giu,
    )
  ) {
    try {
      roots.push(JSON.parse(decodeHtmlEntities(match[1])));
    } catch {
      // Malformed structured data is not trusted publication evidence.
    }
  }
  return Object.freeze(roots);
};

const hasSchemaOrgContext = (value: unknown): boolean => {
  const contexts = Array.isArray(value) ? value : [value];
  return contexts.some((entry) =>
    typeof entry === "string" &&
    /^https?:\/\/schema\.org\/?$/iu.test(entry.trim())
  );
};

export const extractPublicationDateCandidates = (
  body: string,
  contentType: string,
  now = Date.now(),
  lastModifiedHeader: string | null = null,
): readonly PublicationDateCandidate[] => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (
    ![
      "application/feed+json",
      "application/json",
      "text/html",
      "text/plain",
    ].includes(mediaType)
  ) {
    return Object.freeze([]);
  }
  const candidates: PublicationDateCandidate[] = [];
  const append = (
    raw: unknown,
    evidenceClass: PublicationDateCandidate["evidenceClass"],
    label: PublicationDateCandidate["label"],
    priority: number,
  ): void => {
    if (typeof raw !== "string" || raw.length < 4 || raw.length > 80) return;
    const parsed = Date.parse(decodeHtmlEntities(raw.trim()));
    if (!Number.isFinite(parsed) || parsed > now + 300_000) return;
    candidates.push(Object.freeze({
      date: new Date(parsed).toISOString(),
      evidenceClass,
      label,
      priority,
    }));
  };
  const appendJsonLd = (
    rootValue: unknown,
    explicitlyJsonLd: boolean,
  ): void => {
    const roots = Array.isArray(rootValue) ? rootValue : [rootValue];
    for (const root of roots.filter(isRecord)) {
      for (const node of primaryJsonLdNodes(root)) {
        const article = isArticleNode(node);
        if (
          !article &&
          !explicitlyJsonLd &&
          !hasSchemaOrgContext(root["@context"]) &&
          !hasSchemaOrgContext(node["@context"])
        ) {
          continue;
        }
        append(
          node.datePublished,
          "publication",
          article
            ? "json_ld_article_date_published"
            : "schema_org_date_published",
          article ? 10 : 20,
        );
        append(
          node.dateModified,
          "modification",
          article
            ? "json_ld_article_date_modified"
            : "schema_org_date_modified",
          article ? 110 : 120,
        );
      }
    }
  };

  if (mediaType === "text/html") {
    for (const root of extractJsonLdRoots(body)) appendJsonLd(root, true);
    for (const match of body.matchAll(/<meta\b[^>]{0,2048}>/giu)) {
      const attributes = parseTagAttributes(match[0]);
      const label = (
        attributes.get("property") ??
          attributes.get("name") ??
          attributes.get("itemprop") ??
          ""
      ).toLowerCase();
      const value = attributes.get("content");
      if (label === "article:published_time") {
        append(value, "publication", "open_graph_published_time", 30);
      } else if (label === "article:modified_time") {
        append(value, "modification", "open_graph_modified_time", 130);
      } else if (label === "datepublished") {
        append(value, "publication", "schema_org_date_published", 20);
      } else if (label === "datemodified") {
        append(value, "modification", "schema_org_date_modified", 120);
      } else if (
        ["publication_date", "publish-date", "published"].includes(label)
      ) {
        append(
          value,
          "publication",
          "publisher_labeled_publication_date",
          40,
        );
      } else if (["modified", "modified-date"].includes(label)) {
        append(
          value,
          "modification",
          "publisher_labeled_modified_date",
          140,
        );
      }
    }
    for (
      const match of body.matchAll(
        /<time\b([^>]{0,2048})>([\s\S]{0,256}?)<\/time\s*>/giu,
      )
    ) {
      const attributes = parseTagAttributes(match[1]);
      const itemProp = (attributes.get("itemprop") ?? "").toLowerCase();
      const label = decodeHtmlEntities(match[2])
        .replace(/<[^>]+>/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .toLowerCase();
      const value = attributes.get("datetime") ?? attributes.get("content");
      if (
        itemProp === "datepublished" ||
        /^(?:first\s+)?published(?:\s+(?:at|on))?\b/u.test(label) ||
        /^publication\s+date\b/u.test(label)
      ) {
        append(
          value,
          "publication",
          itemProp === "datepublished"
            ? "schema_org_date_published"
            : "publisher_labeled_publication_date",
          itemProp === "datepublished" ? 20 : 40,
        );
      } else if (
        itemProp === "datemodified" ||
        /^(?:last\s+)?(?:modified|updated)(?:\s+(?:at|on))?\b/u.test(label)
      ) {
        append(
          value,
          "modification",
          itemProp === "datemodified"
            ? "schema_org_date_modified"
            : "publisher_labeled_modified_date",
          itemProp === "datemodified" ? 120 : 140,
        );
      }
    }
  } else if (
    mediaType === "application/json" ||
    mediaType === "application/feed+json"
  ) {
    try {
      const root = JSON.parse(body);
      appendJsonLd(root, false);
      if (
        isRecord(root) &&
        typeof root.version === "string" &&
        root.version.startsWith("https://jsonfeed.org/version/") &&
        Array.isArray(root.items) &&
        root.items.length === 1 &&
        isRecord(root.items[0])
      ) {
        append(
          root.items[0].date_published,
          "publication",
          "trusted_feed_publication_date",
          50,
        );
      }
    } catch {
      // Invalid JSON is not trusted publication evidence.
    }
  }
  append(
    lastModifiedHeader,
    "modification",
    "http_last_modified",
    150,
  );
  const unique = new Map<string, PublicationDateCandidate>();
  for (const candidate of candidates) {
    unique.set(
      `${candidate.evidenceClass}|${candidate.label}|${candidate.date}`,
      candidate,
    );
  }
  return Object.freeze(
    [...unique.values()].sort((left, right) =>
      left.priority - right.priority ||
      left.date.localeCompare(right.date) ||
      left.label.localeCompare(right.label)
    ),
  );
};

export const extractObservedPublicationDates = (
  body: string,
  contentType: string,
  now = Date.now(),
): readonly string[] =>
  Object.freeze([
    ...new Set(
      extractPublicationDateCandidates(body, contentType, now)
        .filter((candidate) => candidate.evidenceClass === "publication")
        .map((candidate) => candidate.date),
    ),
  ].sort());

export type PublicationProvenance = Readonly<{
  machineValue: string;
  mode: "github_commit_metadata" | "published_metadata";
  publicationDate: string;
  semanticIdentity: string;
}>;

export type PublicationDateSelection =
  | Readonly<{
    candidates: readonly PublicationDateCandidate[];
    contradictionState: "detected";
    publicationDates: readonly string[];
    status: "ambiguous";
  }>
  | Readonly<{
    candidates: readonly PublicationDateCandidate[];
    contradictionState: "provenance_incomplete";
    status: "unverified";
  }>
  | Readonly<{
    candidates: readonly PublicationDateCandidate[];
    contradictionState: "none";
    provenance: PublicationProvenance;
    status: "selected";
  }>;

export const selectPublicationDateProvenance = (
  body: string,
  contentType: string,
  target: CanonicalResearchUrl,
  authorityId: string,
  now = Date.now(),
  lastModifiedHeader: string | null = null,
): PublicationDateSelection => {
  if (authorityId === "chillywood-public-repository") {
    const commit = target.pathname.match(
      /^\/Chillywood2025\/chillywood-mobile\/commit\/([a-f0-9]{40})$/u,
    )?.[1];
    if (!commit || !contentType.toLowerCase().startsWith("text/html")) {
      return Object.freeze({
        candidates: Object.freeze([]),
        contradictionState: "provenance_incomplete",
        status: "unverified",
      });
    }
    const rawDate = body.match(
      /"(?:committedDate|authoredDate)"\s*:\s*"([^"]{4,80})"/iu,
    )?.[1] ??
      body.match(
        /<relative-time\b[^>]*\bdatetime=["']([^"']{4,80})["'][^>]*>/iu,
      )?.[1];
    const parsed = rawDate === undefined ? Number.NaN : Date.parse(rawDate);
    if (!Number.isFinite(parsed) || parsed > now + 300_000) {
      return Object.freeze({
        candidates: Object.freeze([]),
        contradictionState: "provenance_incomplete",
        status: "unverified",
      });
    }
    const publicationDate = new Date(parsed).toISOString();
    return Object.freeze({
      candidates: Object.freeze([]),
      contradictionState: "none",
      provenance: Object.freeze({
        machineValue: publicationDate,
        mode: "github_commit_metadata",
        publicationDate,
        semanticIdentity: `github-commit:${commit}`,
      }),
      status: "selected",
    });
  }
  const candidates = extractPublicationDateCandidates(
    body,
    contentType,
    now,
    lastModifiedHeader,
  );
  const publicationDates = Object.freeze([
    ...new Set(
      candidates
        .filter((candidate) => candidate.evidenceClass === "publication")
        .map((candidate) => candidate.date),
    ),
  ].sort());
  if (publicationDates.length < 1) {
    return Object.freeze({
      candidates,
      contradictionState: "provenance_incomplete",
      status: "unverified",
    });
  }
  if (publicationDates.length > 1) {
    return Object.freeze({
      candidates,
      contradictionState: "detected",
      publicationDates,
      status: "ambiguous",
    });
  }
  const publicationDate = publicationDates[0];
  return Object.freeze({
    candidates,
    contradictionState: "none",
    provenance: Object.freeze({
      machineValue: publicationDate,
      mode: "published_metadata",
      publicationDate,
      semanticIdentity: `published-at:${publicationDate}`,
    }),
    status: "selected",
  });
};

export const derivePublicationProvenance = (
  body: string,
  contentType: string,
  target: CanonicalResearchUrl,
  authorityId: string,
  now = Date.now(),
  lastModifiedHeader: string | null = null,
): PublicationProvenance | null => {
  const selection = selectPublicationDateProvenance(
    body,
    contentType,
    target,
    authorityId,
    now,
    lastModifiedHeader,
  );
  return selection.status === "selected" ? selection.provenance : null;
};

const normalizeExtractiveText = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

export const claimHasExtractiveSupport = (
  boundedClaim: string,
  boundedExcerpt: string,
): boolean => {
  const claim = normalizeExtractiveText(boundedClaim);
  const excerpt = normalizeExtractiveText(boundedExcerpt);
  return claim.length >= 4 && excerpt.includes(claim);
};

export type RetrievedCitationMetadata = Readonly<{
  locator: string;
  title: string;
}>;

export const extractRetrievedCitationMetadata = (
  body: string,
  contentType: string,
  canonicalUrl: string,
  publisher: string,
  sourceType: string,
): RetrievedCitationMetadata | null => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  let title = "";
  if (mediaType === "text/html") {
    const titleMatch = body.match(
      /<title\b[^>]*>([\s\S]{1,1024}?)<\/title\s*>/iu,
    );
    const metaTitleMatch = body.match(
      /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:og:title|twitter:title)["'][^>]*content\s*=\s*["']([^"']{1,1024})["'][^>]*>/iu,
    );
    title = decodeHtmlEntities(
      (titleMatch?.[1] ?? metaTitleMatch?.[1] ?? "").replace(/<[^>]+>/gu, " "),
    );
  } else if (
    mediaType === "application/json" ||
    mediaType === "application/feed+json"
  ) {
    const match = body.match(
      /"(?:headline|title|name)"\s*:\s*"([^"\\]{1,512})"/iu,
    );
    title = match?.[1] ?? "";
  }
  title = title.replace(/\s+/gu, " ").trim().slice(0, 512);
  if (!title) {
    title = `${publisher} ${sourceType.replace(/_/gu, " ")}`.slice(0, 512);
  }
  const locator = canonicalUrl.slice(0, 512);
  const metadata = Object.freeze({ locator, title });
  return locator && title && isSecuritySafe(metadata) ? metadata : null;
};
