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
  environment: "production";
  freshnessSeconds: number;
  platform: "shared";
  projectId: string;
  publicationDate: string;
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
  "environment",
  "freshnessSeconds",
  "platform",
  "projectId",
  "publicationDate",
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
const CONTRADICTION_STATES = new Set([
  "none",
  "detected",
  "unresolved",
  "resolved",
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
  const url = canonicalizeResearchUrl(payload.url);
  if (
    !authorityId || !SAFE_IDENTIFIER.test(authorityId) || !publisher ||
    !sourceType || !SAFE_IDENTIFIER.test(sourceType) || !citationTitle ||
    !citationLocator || !url ||
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
  if (typeof payload.publicationDate !== "string") return null;
  const publicationTime = Date.parse(payload.publicationDate);
  if (
    !Number.isFinite(publicationTime) ||
    publicationTime > Date.now() + 300_000
  ) {
    return null;
  }
  const publicationDate = new Date(publicationTime).toISOString();
  const normalized: SourceRequest = Object.freeze({
    action: "retrieve_source",
    authorityId,
    citationLocator,
    citationTitle,
    environment: "production",
    freshnessSeconds: Number(payload.freshnessSeconds),
    platform: "shared",
    projectId: payload.projectId,
    publicationDate,
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
    typeof payload.contradictionState !== "string" ||
    !CONTRADICTION_STATES.has(payload.contradictionState) ||
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
): string | null => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (!["text/html", "text/plain", "application/json"].includes(mediaType)) {
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
  const bounded = text.replace(/\s+/gu, " ").trim().slice(0, 2_000);
  if (!bounded || !isSecuritySafe({ excerpt: bounded })) return null;
  return bounded;
};

export const extractObservedPublicationDates = (
  body: string,
  contentType: string,
): readonly string[] => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (!["text/html", "text/plain", "application/json"].includes(mediaType)) {
    return Object.freeze([]);
  }
  const candidates: string[] = [];
  const append = (raw: string): void => {
    const parsed = Date.parse(decodeHtmlEntities(raw.trim()));
    if (Number.isFinite(parsed) && parsed <= Date.now() + 300_000) {
      candidates.push(new Date(parsed).toISOString());
    }
  };
  for (
    const match of body.matchAll(
      /"(?:datePublished|publicationDate|published_at)"\s*:\s*"([^"]{4,80})"/giu,
    )
  ) {
    append(match[1]);
  }
  if (mediaType === "text/html") {
    for (
      const match of body.matchAll(
        /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:article:published_time|datePublished|publication_date|publish-date)["'][^>]*content\s*=\s*["']([^"']{4,80})["'][^>]*>/giu,
      )
    ) {
      append(match[1]);
    }
    for (
      const match of body.matchAll(
        /<meta\b[^>]*content\s*=\s*["']([^"']{4,80})["'][^>]*(?:name|property)\s*=\s*["'](?:article:published_time|datePublished|publication_date|publish-date)["'][^>]*>/giu,
      )
    ) {
      append(match[1]);
    }
  }
  return Object.freeze([...new Set(candidates)].sort());
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
  } else if (mediaType === "application/json") {
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
