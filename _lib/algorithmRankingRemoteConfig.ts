import {
  getRemoteConfigBoolean,
  getRemoteConfigNumber,
} from "./firebaseRemoteConfig";
import { REMOTE_CONFIG_KEYS } from "./featureFlags";
import {
  DEFAULT_ALGORITHM_RANKING_WEIGHTS,
  resolveAlgorithmRankingWeights,
  type AlgorithmRankingWeights,
} from "./algorithmRanking";

export function readAlgorithmRankingV1RemoteFlag() {
  return getRemoteConfigBoolean(REMOTE_CONFIG_KEYS.algorithmRankingV1Enabled, false);
}

export function readAlgorithmRankingV1RemoteWeights(): AlgorithmRankingWeights {
  return resolveAlgorithmRankingWeights({
    freshnessWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingFreshnessWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.freshnessWeight,
    ),
    engagementWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingEngagementWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.engagementWeight,
    ),
    completionWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingCompletionWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.completionWeight,
    ),
    creatorTrustWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingCreatorTrustWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.creatorTrustWeight,
    ),
    liveBoostWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingLiveBoostWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.liveBoostWeight,
    ),
    safetyPenaltyWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingSafetyPenaltyWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.safetyPenaltyWeight,
    ),
    alreadySeenPenaltyWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingAlreadySeenPenaltyWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.alreadySeenPenaltyWeight,
    ),
    newCreatorBoostWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingNewCreatorBoostWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.newCreatorBoostWeight,
    ),
    diversityPenaltyWeight: getRemoteConfigNumber(
      REMOTE_CONFIG_KEYS.algorithmRankingDiversityPenaltyWeight,
      DEFAULT_ALGORITHM_RANKING_WEIGHTS.diversityPenaltyWeight,
    ),
  });
}
