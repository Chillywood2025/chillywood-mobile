import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};

export type ResearchClaimRecord = Readonly<{
  bounded_claim: string;
  category: string;
  claim_hash: string;
  confidence: number;
  contradiction_state: string;
  created_at: string;
  erased_at: string | null;
  environment: string;
  freshness_deadline: string;
  id: string;
  platform: string;
  project_id: string;
  retention_until: string;
  status: string;
  support_state: string;
  task_id: string;
}>;

export type ResearchSourceRecord = Readonly<{
  bounded_excerpt: string;
  canonical_url_hash: string;
  citation_metadata: unknown;
  content_hash: string;
  erased_at: string | null;
  freshness_deadline: string;
  id: string;
  is_primary: boolean;
  ownership_identity: string;
  publication_date: string;
  retention_until: string;
  retrieval_date: string;
  source_type: string;
  trusted_for_tool_execution: boolean;
}>;

export type ResearchRelationRecord = Readonly<{
  relationship: string;
  source_id: string;
}>;

export type ResearchRetrievalRecord = Readonly<{
  id: string;
  request_url_hash: string;
  resolved_address_hashes: unknown;
  response_hash: string;
  result: string;
  source_id: string;
}>;

export type ResearchContradictionRecord = Readonly<{
  resolution_state: string;
}>;

export type ResearchSnapshot = Readonly<{
  claim: ResearchClaimRecord;
  contradictions: readonly ResearchContradictionRecord[];
  relations: readonly ResearchRelationRecord[];
  retrievals: readonly ResearchRetrievalRecord[];
  sources: readonly ResearchSourceRecord[];
}>;

export type ResearchEvaluation = Readonly<{
  evidenceHash: string;
  reasons: readonly string[];
  status: "pass" | "fail" | "blocked";
}>;

const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const OFFICIAL_PRIMARY_TYPES = new Set([
  "official_documentation",
  "security_advisory",
  "platform_policy",
  "store_policy",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const safe = (value: unknown): boolean =>
  classifyCanonicalSecurityPayload(value, SECURITY_POLICY) === "safe";

const stableJson = (value: unknown): string => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (isRecord(entry)) {
      return Object.fromEntries(
        Object.keys(entry).sort().map((key) => [key, normalize(entry[key])]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const normalizeExtractiveText = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const validCitation = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 2 && keys[0] === "locator" && keys[1] === "title" &&
    typeof value.title === "string" &&
    value.title.trim().length >= 1 && value.title.length <= 512 &&
    typeof value.locator === "string" &&
    value.locator.trim().length >= 1 && value.locator.length <= 512 &&
    safe(value);
};

const evaluationProjection = (
  snapshot: ResearchSnapshot,
  reasons: readonly string[],
): unknown => ({
  claim: {
    category: snapshot.claim.category,
    claimHash: snapshot.claim.claim_hash,
    contradictionState: snapshot.claim.contradiction_state,
    createdAt: snapshot.claim.created_at,
    erasedAt: snapshot.claim.erased_at,
    freshnessDeadline: snapshot.claim.freshness_deadline,
    id: snapshot.claim.id,
    status: snapshot.claim.status,
    supportState: snapshot.claim.support_state,
    retentionUntil: snapshot.claim.retention_until,
  },
  contradictions: snapshot.contradictions.map((entry) => entry.resolution_state)
    .sort(),
  reasons: [...reasons].sort(),
  retrievals: snapshot.retrievals.map((entry) => ({
    id: entry.id,
    requestUrlHash: entry.request_url_hash,
    responseHash: entry.response_hash,
    result: entry.result,
    sourceId: entry.source_id,
  })).sort((left, right) => left.id.localeCompare(right.id)),
  sources: snapshot.sources.map((entry) => ({
    canonicalUrlHash: entry.canonical_url_hash,
    contentHash: entry.content_hash,
    freshnessDeadline: entry.freshness_deadline,
    id: entry.id,
    isPrimary: entry.is_primary,
    ownershipIdentity: entry.ownership_identity,
    publicationDate: entry.publication_date,
    retentionUntil: entry.retention_until,
    retrievalDate: entry.retrieval_date,
    sourceType: entry.source_type,
  })).sort((left, right) => left.id.localeCompare(right.id)),
});

export const evaluateStoredResearchClaim = async (
  snapshot: ResearchSnapshot,
  now = new Date(),
): Promise<ResearchEvaluation> => {
  const failReasons = new Set<string>();
  const blockedReasons = new Set<string>();
  const claim = snapshot.claim;
  if (
    claim.platform !== "shared" || claim.environment !== "production" ||
    !LOWER_HEX_64.test(claim.claim_hash) ||
    typeof claim.bounded_claim !== "string" ||
    claim.bounded_claim.trim().length < 4 ||
    claim.bounded_claim.length > 2_000 ||
    !Number.isFinite(claim.confidence) ||
    claim.confidence < 0 || claim.confidence > 1 ||
    !safe({ claim: claim.bounded_claim })
  ) {
    failReasons.add("claim_contract_invalid");
  } else if (await sha256Hex(claim.bounded_claim) !== claim.claim_hash) {
    failReasons.add("claim_hash_mismatch");
  }
  if (claim.status !== "supported" || claim.support_state !== "supported") {
    failReasons.add("claim_not_supported");
  }
  const claimFreshness = Date.parse(claim.freshness_deadline);
  const claimRetention = Date.parse(claim.retention_until);
  const claimCreated = Date.parse(claim.created_at);
  if (!Number.isFinite(claimFreshness) || claimFreshness <= now.getTime()) {
    blockedReasons.add("claim_expired");
  }
  if (
    claim.erased_at !== null || !Number.isFinite(claimRetention) ||
    claimRetention <= now.getTime()
  ) {
    blockedReasons.add("claim_retention_expired");
  }
  if (
    !Number.isFinite(claimCreated) ||
    claimRetention > claimCreated + 30 * 86_400_000
  ) {
    failReasons.add("claim_retention_invalid");
  }
  if (!["none", "resolved"].includes(claim.contradiction_state)) {
    blockedReasons.add("claim_contradiction_unresolved");
  }
  if (
    snapshot.contradictions.some((entry) => entry.resolution_state === "open")
  ) {
    blockedReasons.add("open_contradiction_exists");
  }
  if (
    snapshot.sources.length < 1 || snapshot.sources.length > 8 ||
    new Set(snapshot.sources.map((entry) => entry.id)).size !==
      snapshot.sources.length
  ) {
    failReasons.add("source_count_invalid");
  }
  const sourceById = new Map(
    snapshot.sources.map((entry) => [entry.id, entry]),
  );
  if (
    snapshot.relations.length !== snapshot.sources.length ||
    snapshot.relations.some((entry) =>
      entry.relationship !== "supports" || !sourceById.has(entry.source_id)
    ) ||
    new Set(snapshot.relations.map((entry) => entry.source_id)).size !==
      snapshot.relations.length
  ) {
    failReasons.add("claim_source_relation_invalid");
  }
  const retrievalsBySource = new Map<string, ResearchRetrievalRecord[]>();
  for (const retrieval of snapshot.retrievals) {
    retrievalsBySource.set(retrieval.source_id, [
      ...(retrievalsBySource.get(retrieval.source_id) ?? []),
      retrieval,
    ]);
  }
  for (const source of snapshot.sources) {
    const sourceFreshness = Date.parse(source.freshness_deadline);
    const sourceRetention = Date.parse(source.retention_until);
    const publicationDate = Date.parse(source.publication_date);
    const retrievalDate = Date.parse(source.retrieval_date);
    if (
      !Number.isFinite(sourceFreshness) ||
      sourceFreshness <= now.getTime() ||
      (Number.isFinite(claimFreshness) && sourceFreshness < claimFreshness)
    ) {
      blockedReasons.add("source_expired");
    }
    if (
      source.erased_at !== null || !Number.isFinite(sourceRetention) ||
      sourceRetention <= now.getTime()
    ) {
      blockedReasons.add("source_retention_expired");
    }
    if (
      !Number.isFinite(publicationDate) || !Number.isFinite(retrievalDate) ||
      publicationDate > retrievalDate ||
      sourceRetention > retrievalDate + 30 * 86_400_000
    ) {
      failReasons.add("source_publication_retention_invalid");
    }
    if (
      !LOWER_HEX_64.test(source.canonical_url_hash) ||
      !LOWER_HEX_64.test(source.content_hash) ||
      typeof source.bounded_excerpt !== "string" ||
      source.bounded_excerpt.length < 1 ||
      source.bounded_excerpt.length > 2_000 ||
      source.trusted_for_tool_execution !== false ||
      !validCitation(source.citation_metadata) ||
      !safe({
        citation: source.citation_metadata,
        excerpt: source.bounded_excerpt,
      })
    ) {
      failReasons.add("source_contract_invalid");
    } else if (
      await sha256Hex(source.bounded_excerpt) !== source.content_hash
    ) {
      failReasons.add("source_content_hash_mismatch");
    } else if (
      await sha256Hex(
        String((source.citation_metadata as Record<string, unknown>).locator),
      ) !== source.canonical_url_hash
    ) {
      failReasons.add("source_citation_locator_mismatch");
    }
    const normalizedClaim = normalizeExtractiveText(claim.bounded_claim);
    const normalizedExcerpt = normalizeExtractiveText(source.bounded_excerpt);
    if (
      normalizedClaim.length < 4 ||
      !normalizedExcerpt.includes(normalizedClaim)
    ) {
      failReasons.add("source_extract_support_missing");
    }
    const retrievals = retrievalsBySource.get(source.id) ?? [];
    if (
      retrievals.length < 1 ||
      !retrievals.some((retrieval) =>
        retrieval.result === "accepted" &&
        retrieval.request_url_hash === source.canonical_url_hash &&
        retrieval.response_hash === source.content_hash &&
        Array.isArray(retrieval.resolved_address_hashes) &&
        retrieval.resolved_address_hashes.length >= 1 &&
        retrieval.resolved_address_hashes.length <= 16 &&
        retrieval.resolved_address_hashes.every((hash) =>
          typeof hash === "string" && LOWER_HEX_64.test(hash)
        )
      )
    ) {
      failReasons.add("broker_retrieval_receipt_invalid");
    }
  }
  if (
    ["technical", "platform_policy", "security"].includes(claim.category) &&
    !snapshot.sources.some((source) =>
      source.is_primary && OFFICIAL_PRIMARY_TYPES.has(source.source_type)
    )
  ) {
    failReasons.add("official_primary_source_required");
  }
  if (
    claim.category === "consequential_news" &&
    new Set(snapshot.sources.map((source) => source.ownership_identity)).size <
      2
  ) {
    failReasons.add("independent_news_corroboration_required");
  }
  const reasons = [
    ...failReasons,
    ...blockedReasons,
  ].sort();
  const status = failReasons.size > 0
    ? "fail"
    : blockedReasons.size > 0
    ? "blocked"
    : "pass";
  return Object.freeze({
    evidenceHash: await sha256Hex(
      stableJson(evaluationProjection(snapshot, reasons)),
    ),
    reasons: Object.freeze(reasons),
    status,
  });
};
