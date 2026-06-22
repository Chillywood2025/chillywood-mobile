export const ALGORITHM_RANKING_V1_VERSION = "algorithm-ranking-v1-rules-2026-06-18";

export const algorithmRankingV1Enabled = true;
export const algorithmRankingV1EmergencyFallbackEnabled = false;

export type AlgorithmRankingSurface =
  | "home_video"
  | "creator_platform"
  | "live_discovery"
  | "paid_creator_offer"
  | "search_result"
  | "similar_content"
  | "safety_trust";

export type AlgorithmRankingWeights = {
  freshnessWeight: number;
  engagementWeight: number;
  completionWeight: number;
  creatorTrustWeight: number;
  liveBoostWeight: number;
  safetyPenaltyWeight: number;
  alreadySeenPenaltyWeight: number;
  reportPenaltyWeight: number;
  spamPenaltyWeight: number;
  newCreatorBoostWeight: number;
  diversityPenaltyWeight: number;
  personalizationPlaceholderWeight: number;
};

export type AlgorithmRankingComponentScores = {
  freshnessScore: number;
  engagementScore: number;
  completionScore: number;
  creatorTrustScore: number;
  safetyScore: number;
  liveActivityBoost: number;
  personalizationPlaceholder: number;
  newCreatorBoost: number;
  searchRelevanceScore: number;
};

export type AlgorithmRankingPenalties = {
  alreadySeenPenalty: number;
  reportPenalty: number;
  spamPenalty: number;
  diversityPenalty: number;
  accessPenalty: number;
  exclusionPenalty: number;
};

export type AlgorithmRankingResult = {
  finalScore: number;
  componentScores: AlgorithmRankingComponentScores;
  penalties: AlgorithmRankingPenalties;
  explanation: string[];
  version: string;
  excluded: boolean;
  exclusionReason: string | null;
};

export type AlgorithmRankingInput = {
  id: string;
  surface?: AlgorithmRankingSurface;
  title?: string | null;
  creatorId?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  startsAt?: string | null;
  isLive?: boolean | null;
  isActive?: boolean | null;
  visibility?: string | null;
  moderationStatus?: string | null;
  reportCount?: number | null;
  takedownStatus?: string | null;
  isDraft?: boolean | null;
  isPrivate?: boolean | null;
  isLocked?: boolean | null;
  isSubscriberOnly?: boolean | null;
  viewerHasAccess?: boolean | null;
  isPaid?: boolean | null;
  paidOfferScope?: string | null;
  likeCount?: number | null;
  favoriteCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  viewCount?: number | null;
  watchCount?: number | null;
  completionRate?: number | null;
  averageWatchSeconds?: number | null;
  creatorTrustScore?: number | null;
  creatorAccountAgeDays?: number | null;
  creatorStrikeCount?: number | null;
  creatorFollowerCount?: number | null;
  alreadySeen?: boolean | null;
  watchedCompletionRate?: number | null;
  sameCreatorRecentCount?: number | null;
  repeatContentCount?: number | null;
  query?: string | null;
  searchText?: string | null;
};

const BLOCKED_MODERATION_STATUSES = new Set([
  "banned",
  "blocked",
  "hidden",
  "removed",
  "takedown",
  "admin_removed",
]);

const REPORTED_MODERATION_STATUSES = new Set([
  "reported",
  "under_review",
  "pending_review",
]);

const BLOCKED_VISIBILITY_VALUES = new Set([
  "circle",
  "circle_only",
  "chilly_circle",
  "draft",
  "private",
  "deleted",
  "removed",
  "hidden",
  "unpublished",
]);

export const DEFAULT_ALGORITHM_RANKING_WEIGHTS: AlgorithmRankingWeights = {
  freshnessWeight: 0.16,
  engagementWeight: 0.2,
  completionWeight: 0.14,
  creatorTrustWeight: 0.14,
  liveBoostWeight: 0.12,
  safetyPenaltyWeight: 1,
  alreadySeenPenaltyWeight: 0.2,
  reportPenaltyWeight: 0.38,
  spamPenaltyWeight: 0.28,
  newCreatorBoostWeight: 0.08,
  diversityPenaltyWeight: 0.2,
  personalizationPlaceholderWeight: 0,
};

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const boundedNumber = (value: unknown, fallback: number, min = 0, max = 1) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
};

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const toCount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parseTime = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const pushReason = (reasons: string[], condition: boolean, message: string) => {
  if (condition) reasons.push(message);
};

export function resolveAlgorithmRankingWeights(
  overrides?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null,
): AlgorithmRankingWeights {
  return {
    freshnessWeight: boundedNumber(overrides?.freshnessWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.freshnessWeight),
    engagementWeight: boundedNumber(overrides?.engagementWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.engagementWeight),
    completionWeight: boundedNumber(overrides?.completionWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.completionWeight),
    creatorTrustWeight: boundedNumber(overrides?.creatorTrustWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.creatorTrustWeight),
    liveBoostWeight: boundedNumber(overrides?.liveBoostWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.liveBoostWeight),
    safetyPenaltyWeight: boundedNumber(overrides?.safetyPenaltyWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.safetyPenaltyWeight),
    alreadySeenPenaltyWeight: boundedNumber(
      overrides?.alreadySeenPenaltyWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.alreadySeenPenaltyWeight,
    ),
    reportPenaltyWeight: boundedNumber(overrides?.reportPenaltyWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.reportPenaltyWeight),
    spamPenaltyWeight: boundedNumber(overrides?.spamPenaltyWeight, DEFAULT_ALGORITHM_RANKING_WEIGHTS.spamPenaltyWeight),
    newCreatorBoostWeight: boundedNumber(
      overrides?.newCreatorBoostWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.newCreatorBoostWeight,
    ),
    diversityPenaltyWeight: boundedNumber(
      overrides?.diversityPenaltyWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.diversityPenaltyWeight,
    ),
    personalizationPlaceholderWeight: boundedNumber(
      overrides?.personalizationPlaceholderWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.personalizationPlaceholderWeight,
    ),
  };
}

export function getAlgorithmRankingEligibility(input: AlgorithmRankingInput) {
  const moderationStatus = normalizeText(input.moderationStatus);
  const visibility = normalizeText(input.visibility);
  const takedownStatus = normalizeText(input.takedownStatus);
  const isReported = REPORTED_MODERATION_STATUSES.has(moderationStatus) || toCount(input.reportCount) > 0;

  if (input.isDraft || visibility === "draft") return { excluded: true, reason: "draft_content" };
  if (input.isPrivate || BLOCKED_VISIBILITY_VALUES.has(visibility)) return { excluded: true, reason: "private_or_unpublished" };
  if (input.isLocked && !input.viewerHasAccess) return { excluded: true, reason: "locked_without_access" };
  if (input.isSubscriberOnly && !input.viewerHasAccess) return { excluded: true, reason: "subscriber_only_without_access" };
  if (BLOCKED_MODERATION_STATUSES.has(moderationStatus)) return { excluded: true, reason: "unsafe_moderation_status" };
  if (takedownStatus === "active" || takedownStatus === "removed") return { excluded: true, reason: "active_takedown" };

  return { excluded: false, reason: isReported ? "reported_penalized" : null };
}

const scoreFreshness = (input: AlgorithmRankingInput, nowMillis: number) => {
  const timestamp = parseTime(input.publishedAt) ?? parseTime(input.startsAt) ?? parseTime(input.createdAt) ?? parseTime(input.updatedAt);
  if (!timestamp) return 0.2;
  const ageHours = Math.max(0, (nowMillis - timestamp) / (1000 * 60 * 60));
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.88;
  if (ageHours <= 72) return 0.68;
  if (ageHours <= 24 * 14) return 0.42;
  if (ageHours <= 24 * 45) return 0.22;
  return 0.08;
};

const scoreEngagement = (input: AlgorithmRankingInput) => {
  const likes = toCount(input.likeCount) + toCount(input.favoriteCount);
  const comments = toCount(input.commentCount);
  const shares = toCount(input.shareCount);
  const views = toCount(input.viewCount) + toCount(input.watchCount);
  const weightedActions = likes + comments * 2 + shares * 3;
  const rate = views > 0 ? weightedActions / Math.max(views, 1) : weightedActions / 20;
  return clamp(Math.log1p(weightedActions) / 7 + rate, 0, 1);
};

const scoreCompletion = (input: AlgorithmRankingInput) => {
  const completionRate = Number(input.completionRate ?? 0);
  if (Number.isFinite(completionRate) && completionRate > 0) return clamp(completionRate, 0, 1);
  const averageWatchSeconds = toCount(input.averageWatchSeconds);
  return clamp(averageWatchSeconds / 900, 0, 0.8);
};

const scoreCreatorTrust = (input: AlgorithmRankingInput) => {
  const explicitTrust = Number(input.creatorTrustScore);
  if (Number.isFinite(explicitTrust) && explicitTrust >= 0) return clamp(explicitTrust, 0, 1);
  const accountAge = toCount(input.creatorAccountAgeDays);
  const followers = toCount(input.creatorFollowerCount);
  const strikes = toCount(input.creatorStrikeCount);
  return clamp(0.48 + Math.min(accountAge, 365) / 1200 + Math.log1p(followers) / 18 - strikes * 0.2, 0, 1);
};

const scoreSafety = (input: AlgorithmRankingInput) => {
  const moderationStatus = normalizeText(input.moderationStatus);
  if (moderationStatus === "clean" || moderationStatus === "") return 1;
  if (REPORTED_MODERATION_STATUSES.has(moderationStatus)) return 0.35;
  return 0;
};

const scoreSearchRelevance = (input: AlgorithmRankingInput) => {
  const query = normalizeText(input.query);
  if (!query) return 0;
  const text = normalizeText(`${input.title ?? ""} ${input.searchText ?? ""}`);
  if (!text) return 0;
  if (text === query) return 1;
  if (text.includes(query)) return 0.78;
  const terms = query.split(/\s+/g).filter(Boolean);
  if (!terms.length) return 0;
  const matched = terms.filter((term) => text.includes(term)).length;
  return clamp(matched / terms.length, 0, 1) * 0.65;
};

const scoreNewCreatorBoost = (input: AlgorithmRankingInput) => {
  const age = toCount(input.creatorAccountAgeDays);
  const followers = toCount(input.creatorFollowerCount);
  if (age > 0 && age <= 45) return 1;
  if (age <= 0 && followers <= 0) return 0;
  if (followers <= 25) return 0.7;
  return 0;
};

function scoreRankingItem(
  input: AlgorithmRankingInput,
  options: {
    surface: AlgorithmRankingSurface;
    weights?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null;
    nowMillis?: number;
  },
): AlgorithmRankingResult {
  const weights = resolveAlgorithmRankingWeights(options.weights);
  const nowMillis = options.nowMillis ?? Date.now();
  const eligibility = getAlgorithmRankingEligibility(input);
  const reportCount = toCount(input.reportCount);
  const sameCreatorRecentCount = toCount(input.sameCreatorRecentCount);
  const repeatContentCount = toCount(input.repeatContentCount);
  const watchedCompletionRate = Number(input.watchedCompletionRate ?? 0);

  const componentScores: AlgorithmRankingComponentScores = {
    freshnessScore: scoreFreshness(input, nowMillis),
    engagementScore: scoreEngagement(input),
    completionScore: scoreCompletion(input),
    creatorTrustScore: scoreCreatorTrust(input),
    safetyScore: scoreSafety(input),
    liveActivityBoost: input.isLive || input.isActive ? 1 : 0,
    personalizationPlaceholder: 0,
    newCreatorBoost: scoreNewCreatorBoost(input),
    searchRelevanceScore: options.surface === "search_result" ? scoreSearchRelevance(input) : 0,
  };

  const penalties: AlgorithmRankingPenalties = {
    alreadySeenPenalty: input.alreadySeen ? (watchedCompletionRate >= 0.9 ? 1 : 0.55) : 0,
    reportPenalty: clamp(reportCount / 5, 0, 1),
    spamPenalty: clamp(repeatContentCount / 4, 0, 1),
    diversityPenalty: clamp(Math.max(0, sameCreatorRecentCount - 2) / 4, 0, 1),
    accessPenalty: input.isPaid && options.surface !== "paid_creator_offer" ? 0.08 : 0,
    exclusionPenalty: eligibility.excluded ? 10 : 0,
  };

  const positiveScore =
    componentScores.freshnessScore * weights.freshnessWeight
    + componentScores.engagementScore * weights.engagementWeight
    + componentScores.completionScore * weights.completionWeight
    + componentScores.creatorTrustScore * weights.creatorTrustWeight
    + componentScores.liveActivityBoost * weights.liveBoostWeight
    + componentScores.newCreatorBoost * weights.newCreatorBoostWeight
    + componentScores.personalizationPlaceholder * weights.personalizationPlaceholderWeight
    + componentScores.searchRelevanceScore * (options.surface === "search_result" ? 0.28 : 0);

  const negativeScore =
    (1 - componentScores.safetyScore) * weights.safetyPenaltyWeight
    + penalties.alreadySeenPenalty * weights.alreadySeenPenaltyWeight
    + penalties.reportPenalty * weights.reportPenaltyWeight
    + penalties.spamPenalty * weights.spamPenaltyWeight
    + penalties.diversityPenalty * weights.diversityPenaltyWeight
    + penalties.accessPenalty
    + penalties.exclusionPenalty;

  const explanation = explainScore({
    input,
    componentScores,
    penalties,
    excluded: eligibility.excluded,
    exclusionReason: eligibility.reason,
  });

  return {
    finalScore: eligibility.excluded ? 0 : Number(clamp((positiveScore - negativeScore) * 100, 0, 100).toFixed(2)),
    componentScores,
    penalties,
    explanation,
    version: ALGORITHM_RANKING_V1_VERSION,
    excluded: eligibility.excluded,
    exclusionReason: eligibility.reason,
  };
}

export function explainScore(details: {
  input: AlgorithmRankingInput;
  componentScores: AlgorithmRankingComponentScores;
  penalties: AlgorithmRankingPenalties;
  excluded: boolean;
  exclusionReason: string | null;
}) {
  const explanation: string[] = [];
  pushReason(explanation, details.excluded, `Excluded from public ranking: ${details.exclusionReason ?? "unsafe_or_ineligible"}.`);
  pushReason(explanation, details.componentScores.freshnessScore >= 0.68, "Fresh or recently active item.");
  pushReason(explanation, details.componentScores.engagementScore >= 0.45, "Engagement signals are meaningful.");
  pushReason(explanation, details.componentScores.completionScore >= 0.55, "Completion/watch quality is healthy.");
  pushReason(explanation, details.componentScores.creatorTrustScore >= 0.7, "Creator trust score is strong.");
  pushReason(explanation, details.componentScores.liveActivityBoost > 0, "Live or active item receives a bounded boost.");
  pushReason(explanation, details.componentScores.newCreatorBoost > 0, "New or small creator receives a discovery boost.");
  pushReason(explanation, details.componentScores.searchRelevanceScore > 0, "Search text matches the query.");
  pushReason(explanation, details.penalties.alreadySeenPenalty > 0, "Already-watched item is lowered outside Continue Watching.");
  pushReason(explanation, details.penalties.reportPenalty > 0, "Reports or review status lower ranking.");
  pushReason(explanation, details.penalties.spamPenalty > 0, "Repeated/spam-like content is lowered.");
  pushReason(explanation, details.penalties.diversityPenalty > 0, "Same-creator repetition is capped for diversity.");
  pushReason(explanation, details.penalties.accessPenalty > 0, "Paid content receives a small scope penalty outside paid-offer ranking.");
  if (!explanation.length) explanation.push("Ranked from safe default signals with no strong boosts or penalties.");
  return explanation;
}

export function scoreVideoForHome(
  input: AlgorithmRankingInput,
  weights?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null,
  nowMillis?: number,
) {
  return scoreRankingItem(input, { surface: "home_video", weights, nowMillis });
}

export function scoreCreatorPlatform(
  input: AlgorithmRankingInput,
  weights?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null,
  nowMillis?: number,
) {
  return scoreRankingItem(input, { surface: "creator_platform", weights, nowMillis });
}

export function scoreLiveDiscoveryItem(
  input: AlgorithmRankingInput,
  weights?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null,
  nowMillis?: number,
) {
  return scoreRankingItem(input, { surface: "live_discovery", weights, nowMillis });
}

export function scorePaidCreatorOffer(
  input: AlgorithmRankingInput,
  weights?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null,
  nowMillis?: number,
) {
  return scoreRankingItem(input, { surface: "paid_creator_offer", weights, nowMillis });
}

export function scoreSearchResult(
  input: AlgorithmRankingInput,
  weights?: Partial<Record<keyof AlgorithmRankingWeights, unknown>> | null,
  nowMillis?: number,
) {
  return scoreRankingItem(input, { surface: "search_result", weights, nowMillis });
}
