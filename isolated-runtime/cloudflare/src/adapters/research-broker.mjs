import researchAuthoritiesJson from "../../../../config/intelligence/research-authorities.json" with {
  type: "json",
};
import { blocked, ready } from "./helpers.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]{1,79}$/u;
const INSTRUCTION =
  /\b(?:ignore|override|bypass|disable|weaken|forget)\b[\s\S]{0,80}\b(?:instruction|policy|approval|rls|guard|system|developer|safety)\b|\b(?:merge|deploy|release|execute|run|invoke|read)\b[\s\S]{0,80}\b(?:pull request|production|shell|command|tool|environment|secret|credential)\b/iu;
const SECRET_OR_PRIVATE =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----|[?&](?:x-amz-signature|x-goog-signature|signature|sig|token)=|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:access[_ -]?token|api[_ -]?key|authorization|bearer|client[_ -]?secret|cookie|credential|github[_ -]?token|key[_ -]?password|model[_ -]?key|password|passphrase|private[_ -]?key|refresh[_ -]?token|secret|service[_ -]?role|session[_ -]?cookie|token)\b\s*(?::|=|is)\s*[^\s,;]{6,}/iu;
const CLAIM_CATEGORIES = new Set([
  "technical",
  "platform_policy",
  "consequential_news",
  "product",
  "security",
]);
const CANARY_KEYS = new Set([
  "platform_policy_research",
  "repository_architecture_ux",
  "dependency_security_research",
]);
const MAX_SOURCE_TTL_SECONDS = Object.freeze({
  competitor_research: 30 * 86_400,
  engineering_practice: 30 * 86_400,
  news: 7 * 86_400,
  official_documentation: 30 * 86_400,
  platform_policy: 30 * 86_400,
  product_research: 30 * 86_400,
  security_advisory: 14 * 86_400,
  store_policy: 30 * 86_400,
});
const AUTHORITIES = new Map(
  researchAuthoritiesJson.authorities.map((authority) => [
    authority.authorityId,
    Object.freeze({
      ...authority,
      hostname: authority.hostname.toLowerCase(),
    }),
  ]),
);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, keys) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const boundedText = (value, minimum, maximum) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimum &&
      normalized.length <= maximum &&
      new TextEncoder().encode(normalized).byteLength <= maximum * 4
    ? normalized
    : null;
};

const isSecuritySafeText = (value) => {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKC").replace(
    /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\uffa0]/gu,
    "",
  );
  return new TextEncoder().encode(normalized).byteLength <= 4_000 &&
    !INSTRUCTION.test(normalized) &&
    !SECRET_OR_PRIVATE.test(normalized);
};

export const canonicalizeResearchUrl = (raw) => {
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 2_048) {
    return null;
  }
  const normalized = raw.normalize("NFKC").replace(
    /[\u3002\uff0e\uff61]/gu,
    ".",
  );
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port && parsed.port !== "443")
  ) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    !/^[a-z0-9.-]+$/u.test(hostname) ||
    hostname.includes("..")
  ) {
    return null;
  }
  parsed.hostname = hostname;
  parsed.port = "";
  const canonical = parsed.toString();
  return isSecuritySafeText(canonical)
    ? Object.freeze({
      canonical,
      hostname,
      pathname: parsed.pathname,
    })
    : null;
};

export const authorityForSource = (
  authorityId,
  target,
  publisher,
  sourceType,
) => {
  const authority = AUTHORITIES.get(authorityId);
  if (
    !authority ||
    authority.hostname !== target.hostname ||
    authority.publisher !== publisher ||
    authority.sourceType !== sourceType ||
    (
      authority.pathPrefix !== undefined &&
      target.pathname !== authority.pathPrefix &&
      !target.pathname.startsWith(`${authority.pathPrefix}/`)
    )
  ) {
    return null;
  }
  return authority;
};

const normalizeScope = (payload) =>
  payload.platform === "shared" &&
    payload.environment === "production" &&
    typeof payload.taskId === "string" &&
    UUID.test(payload.taskId) &&
    typeof payload.projectId === "string" &&
    UUID.test(payload.projectId);

export const normalizeSourceRequest = (payload) => {
  const keys = [
    "action",
    "authorityId",
    "citationLocator",
    "citationTitle",
    "environment",
    "evidenceQuery",
    "freshnessSeconds",
    "platform",
    "projectId",
    "publisher",
    "sourceType",
    "taskId",
    "url",
  ];
  if (
    !exactKeys(payload, keys) ||
    payload.action !== "retrieve_source" ||
    !normalizeScope(payload)
  ) {
    return null;
  }
  const authorityId = boundedText(payload.authorityId, 2, 80);
  const publisher = boundedText(payload.publisher, 1, 120);
  const sourceType = boundedText(payload.sourceType, 2, 80);
  const citationTitle = boundedText(payload.citationTitle, 1, 512);
  const citationLocator = boundedText(payload.citationLocator, 1, 512);
  const evidenceQuery = boundedText(payload.evidenceQuery, 4, 512);
  const url = canonicalizeResearchUrl(payload.url);
  const maximumTtl = sourceType
    ? MAX_SOURCE_TTL_SECONDS[sourceType]
    : undefined;
  if (
    !authorityId ||
    !SAFE_IDENTIFIER.test(authorityId) ||
    !publisher ||
    !sourceType ||
    !SAFE_IDENTIFIER.test(sourceType) ||
    !citationTitle ||
    !citationLocator ||
    !evidenceQuery ||
    !isSecuritySafeText(evidenceQuery) ||
    !url ||
    !authorityForSource(authorityId, url, publisher, sourceType) ||
    !Number.isSafeInteger(payload.freshnessSeconds) ||
    maximumTtl === undefined ||
    payload.freshnessSeconds < 300 ||
    payload.freshnessSeconds > maximumTtl
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
  return Object.freeze({
    ...payload,
    authorityId,
    citationLocator,
    citationTitle,
    evidenceQuery,
    publisher,
    sourceType,
    url: url.canonical,
  });
};

export const normalizeClaimRequest = (payload, now = Date.now()) => {
  const keys = [
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
  ];
  if (
    !exactKeys(payload, keys) ||
    payload.action !== "record_claim" ||
    !normalizeScope(payload) ||
    !CANARY_KEYS.has(payload.canaryKey) ||
    !CLAIM_CATEGORIES.has(payload.category) ||
    payload.contradictionState !== "none" ||
    typeof payload.confidence !== "number" ||
    !Number.isFinite(payload.confidence) ||
    payload.confidence < 0 ||
    payload.confidence > 1 ||
    !Array.isArray(payload.sourceIds) ||
    payload.sourceIds.length < 1 ||
    payload.sourceIds.length > 8 ||
    payload.sourceIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
    new Set(payload.sourceIds).size !== payload.sourceIds.length
  ) {
    return null;
  }
  const boundedClaim = boundedText(payload.boundedClaim, 4, 2_000);
  const freshness = typeof payload.freshnessDeadline === "string"
    ? Date.parse(payload.freshnessDeadline)
    : Number.NaN;
  if (
    !boundedClaim ||
    !isSecuritySafeText(boundedClaim) ||
    !Number.isFinite(freshness) ||
    freshness <= now ||
    freshness > now + 30 * 86_400_000
  ) {
    return null;
  }
  return Object.freeze({
    ...payload,
    boundedClaim,
    freshnessDeadline: new Date(freshness).toISOString(),
    sourceIds: Object.freeze([...payload.sourceIds]),
  });
};

export const normalizeContradictionRequest = (payload) => {
  const keys = [
    "action",
    "boundedEvidence",
    "claimId",
    "environment",
    "platform",
    "projectId",
    "sourceId",
    "taskId",
  ];
  if (
    !exactKeys(payload, keys) ||
    payload.action !== "detect_contradiction" ||
    !normalizeScope(payload) ||
    typeof payload.claimId !== "string" ||
    !UUID.test(payload.claimId) ||
    typeof payload.sourceId !== "string" ||
    !UUID.test(payload.sourceId)
  ) {
    return null;
  }
  const boundedEvidence = boundedText(payload.boundedEvidence, 4, 2_000);
  return boundedEvidence && isSecuritySafeText(boundedEvidence)
    ? Object.freeze({ ...payload, boundedEvidence })
    : null;
};

export const normalizeMaintenanceRequest = (payload) => {
  const keys = [
    "action",
    "environment",
    "limit",
    "platform",
    "projectId",
    "taskId",
  ];
  return exactKeys(payload, keys) &&
      payload.action === "expire_public_memory" &&
      normalizeScope(payload) &&
      Number.isSafeInteger(payload.limit) &&
      payload.limit >= 1 &&
      payload.limit <= 100
    ? Object.freeze({ ...payload })
    : null;
};

const serviceToken = (env) => {
  const token = typeof env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN === "string"
    ? env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN.trim()
    : "";
  const length = new TextEncoder().encode(token).byteLength;
  if (length < 32 || length > 512) {
    throw new Error("research_broker_configuration_rejected");
  }
  return token;
};

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const recordClaim = ready(
  ["record_research_claim"],
  async ({ database, env, payload }) => {
    const request = normalizeClaimRequest(payload);
    if (!request) throw new Error("research_claim_payload_rejected");
    const expectedClaimHash = await sha256Hex(request.boundedClaim);
    const result = await database.call("recordPublicResearchClaim", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.canaryKey,
      request.boundedClaim,
      request.category,
      request.confidence,
      request.freshnessDeadline,
      request.contradictionState,
      [...request.sourceIds],
      serviceToken(env),
    ]);
    const retention = isRecord(result) &&
        typeof result.retention_until === "string"
      ? Date.parse(result.retention_until)
      : Number.NaN;
    if (
      !isRecord(result) ||
      typeof result.research_claim_id !== "string" ||
      !UUID.test(result.research_claim_id) ||
      result.claim_hash !== expectedClaimHash ||
      result.erased_at !== null ||
      !Number.isFinite(retention) ||
      retention <= Date.now() ||
      retention > Date.now() + 30 * 86_400_000 + 300_000
    ) {
      throw new Error("research_claim_readback_rejected");
    }
    return Object.freeze({
      canaryAccepted: false,
      canaryKey: request.canaryKey,
      claimHash: expectedClaimHash,
      evaluatorRequired: true,
      privateDataUsed: false,
      researchClaimId: result.research_claim_id,
      userDerivedDataUsed: false,
    });
  },
);

const detectContradiction = ready(
  ["detect_research_contradiction"],
  async ({ database, env, payload }) => {
    const request = normalizeContradictionRequest(payload);
    if (!request) throw new Error("research_contradiction_payload_rejected");
    const result = await database.call("detectResearchContradiction", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.claimId,
      request.sourceId,
      request.boundedEvidence,
      serviceToken(env),
    ]);
    if (
      !isRecord(result) ||
      typeof result.contradiction_id !== "string" ||
      !UUID.test(result.contradiction_id) ||
      typeof result.event_id !== "string" ||
      !UUID.test(result.event_id) ||
      typeof result.evidence_hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(result.evidence_hash)
    ) {
      throw new Error("research_contradiction_readback_rejected");
    }
    return Object.freeze({
      contradictionId: result.contradiction_id,
      evaluatorRequired: true,
      eventId: result.event_id,
      evidenceHash: result.evidence_hash,
      privateDataUsed: false,
      state: "detected",
      userDerivedDataUsed: false,
    });
  },
);

const expirePublicMemory = ready(
  ["expire_research"],
  async ({ database, env, payload }) => {
    const request = normalizeMaintenanceRequest(payload);
    if (!request) throw new Error("research_maintenance_payload_rejected");
    const result = await database.call("expirePublicResearch", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.limit,
      serviceToken(env),
    ]);
    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.source_count) ||
      !Number.isSafeInteger(result.claim_count) ||
      !Number.isSafeInteger(result.total_count) ||
      result.source_count < 0 ||
      result.claim_count < 0 ||
      result.total_count !== result.source_count + result.claim_count ||
      result.total_count > request.limit ||
      result.retention_policy_id !== "chillywood-cognitive-retention-v1"
    ) {
      throw new Error("research_maintenance_readback_rejected");
    }
    return Object.freeze({
      claimCount: result.claim_count,
      privateDataUsed: false,
      retentionPolicyId: result.retention_policy_id,
      sourceCount: result.source_count,
      totalCount: result.total_count,
      userDerivedDataUsed: false,
    });
  },
);

export const PUBLIC_RESEARCH_BROKER_ADAPTERS = Object.freeze({
  retrieve_source: blocked(
    ["record_research_source"],
    "CLOUDFLARE_FETCH_CONNECTED_PEER_PROOF_UNAVAILABLE",
  ),
  record_claim: recordClaim,
  detect_contradiction: detectContradiction,
  expire_public_memory: expirePublicMemory,
});
