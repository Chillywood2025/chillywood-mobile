export const SEARCH_RANKING_INTEGRITY_OPERATOR_ID = "search_ranking_integrity_operator" as const;

export type SearchRankingFindingClass =
  | "search_health_review"
  | "ranking_integrity_review"
  | "recommendation_quality_review"
  | "visibility_anomaly_review"
  | "spam_pattern_review"
  | "index_freshness_review";

const SECRET_KEY_PATTERN = /(secret|token|password|credential|authorization|service[_-]?role|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|private)/i;
const LONG_SECRET_LIKE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

export const sanitizeSearchRankingProof = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeSearchRankingProof);
  if (!value || typeof value !== "object") return typeof value === "string" ? value.replace(LONG_SECRET_LIKE_PATTERN, "[redacted]") : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
    .map(([key, entry]) => [key, sanitizeSearchRankingProof(entry)]));
};

export const classifySearchRankingFinding = (text: string): SearchRankingFindingClass => {
  const normalized = text.toLowerCase();
  if (normalized.includes("ranking")) return "ranking_integrity_review";
  if (normalized.includes("recommend")) return "recommendation_quality_review";
  if (normalized.includes("visibility") || normalized.includes("creator")) return "visibility_anomaly_review";
  if (normalized.includes("spam")) return "spam_pattern_review";
  if (normalized.includes("index")) return "index_freshness_review";
  return "search_health_review";
};

export const buildSearchRankingWatchPlan = () => ({
  systemId: SEARCH_RANKING_INTEGRITY_OPERATOR_ID,
  checks: ["search_health", "ranking_integrity_findings", "recommendation_quality_findings", "visibility_anomaly_findings", "index_freshness"],
  forbidden: ["hidden shadowban", "secret demotion/boost", "moderation enforcement", "ranking algorithm mutation", "public/private exposure change"],
});

export const buildSearchRankingOwnerCommand = (finding: SearchRankingFindingClass) => ({
  commandText: `Search Ranking Integrity Operator finding requires review: ${finding}.`,
  normalizedIntent: "search_ranking_integrity",
  targetSystems: [SEARCH_RANKING_INTEGRITY_OPERATOR_ID],
  approvalLevel: 2,
  allowedScope: ["search/ranking health findings", "visibility anomaly review flags", "approval request for ranking changes"],
  forbiddenScope: ["shadowban", "secret demotion/boost", "content deletion", "exposure change", "auth/RLS mutation"],
});
