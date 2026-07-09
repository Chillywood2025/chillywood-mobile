import type { MediaAutomationCandidate } from "./mediaAutomationDiscovery";

export type MediaAutomationBatchRiskLevel =
  | "blocked"
  | "low"
  | "medium"
  | "elevated";

export type MediaAutomationBatchPolicyInput = {
  eligible_count?: number | null;
  latest_backup_age_minutes?: number | null;
  restore_drill_age_minutes?: number | null;
  previous_success_streak?: number | null;
  previous_failure_count?: number | null;
  active_unfinished_jobs?: number | null;
  unsafe_cdn_rows?: number | null;
  disk_space_available?: boolean | null;
  cpu_capacity?: "low" | "normal" | "high" | null;
  owner_max_batch_cap?: number | null;
  hard_max_batch_cap?: number | null;
  backfill_requested?: boolean | null;
};

export type MediaAutomationBatchSizeResult = {
  batchSize: number;
  riskLevel: MediaAutomationBatchRiskLevel;
  reasonCodes: string[];
  manualBatchSizeRequired: false;
  hardMaxBatchCap: number;
  ownerMaxBatchCap: number;
};

export type MediaAutomationAutoBatchPlan = {
  selected: MediaAutomationCandidate[];
  skipped: MediaAutomationCandidate[];
  batchSize: number;
  riskLevel: MediaAutomationBatchRiskLevel;
  reasonCodes: string[];
  rollbackRequired: true;
  auditRequired: true;
  mutationAttempted: false;
  productionRowsWritten: false;
  productionPlaybackSwitched: false;
  manualSourceIdsRequired: false;
  manualBatchSizeRequired: false;
};

const toNonNegativeInteger = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

const isStale = (ageMinutes: number, maxAgeMinutes: number) => (
  !Number.isFinite(ageMinutes) || ageMinutes > maxAgeMinutes
);

export function resolveBatchRiskLevel(batchSize: number): MediaAutomationBatchRiskLevel {
  if (batchSize <= 0) return "blocked";
  if (batchSize === 1) return "low";
  if (batchSize <= 5) return "medium";
  return "elevated";
}

export function calculateAutoBatchSize(input: MediaAutomationBatchPolicyInput): MediaAutomationBatchSizeResult {
  const reasonCodes: string[] = [];
  const eligibleCount = toNonNegativeInteger(input.eligible_count, 0);
  const latestBackupAgeMinutes = toNonNegativeInteger(input.latest_backup_age_minutes, Number.POSITIVE_INFINITY);
  const restoreDrillAgeMinutes = toNonNegativeInteger(input.restore_drill_age_minutes, Number.POSITIVE_INFINITY);
  const previousSuccessStreak = toNonNegativeInteger(input.previous_success_streak, 0);
  const previousFailureCount = toNonNegativeInteger(input.previous_failure_count, 0);
  const activeUnfinishedJobs = toNonNegativeInteger(input.active_unfinished_jobs, 0);
  const unsafeCdnRows = toNonNegativeInteger(input.unsafe_cdn_rows, 0);
  const hardMaxBatchCap = Math.max(1, toNonNegativeInteger(input.hard_max_batch_cap, 25));
  const ownerMaxBatchCap = Math.max(1, toNonNegativeInteger(input.owner_max_batch_cap, hardMaxBatchCap));
  const effectiveHardCap = Math.min(hardMaxBatchCap, ownerMaxBatchCap, 25);

  if (input.backfill_requested === true) reasonCodes.push("backfill_disabled");
  if (eligibleCount <= 0) reasonCodes.push("no_eligible_candidates");
  if (activeUnfinishedJobs > 0) reasonCodes.push("active_unfinished_jobs_present");
  if (unsafeCdnRows > 0) reasonCodes.push("unsafe_cdn_rows_present");
  if (isStale(latestBackupAgeMinutes, 24 * 60)) reasonCodes.push("latest_backup_stale");
  if (isStale(restoreDrillAgeMinutes, 24 * 60)) reasonCodes.push("restore_drill_stale");
  if (input.disk_space_available === false) reasonCodes.push("disk_space_unavailable");
  if (input.cpu_capacity === "low") reasonCodes.push("cpu_capacity_low");

  if (reasonCodes.length > 0) {
    return {
      batchSize: 0,
      riskLevel: "blocked",
      reasonCodes,
      manualBatchSizeRequired: false,
      hardMaxBatchCap: effectiveHardCap,
      ownerMaxBatchCap,
    };
  }

  let target = 1;
  if (previousFailureCount > 0) {
    target = 1;
    reasonCodes.push("previous_failure_drops_cap_to_one");
  } else if (previousSuccessStreak >= 5) {
    target = 25;
    reasonCodes.push("success_streak_cap_twenty_five");
  } else if (previousSuccessStreak >= 3) {
    target = 10;
    reasonCodes.push("success_streak_cap_ten");
  } else if (previousSuccessStreak >= 1) {
    target = 5;
    reasonCodes.push("success_streak_cap_five");
  } else {
    reasonCodes.push("first_auto_run_cap_one");
  }

  const batchSize = Math.min(eligibleCount, target, effectiveHardCap);
  return {
    batchSize,
    riskLevel: resolveBatchRiskLevel(batchSize),
    reasonCodes,
    manualBatchSizeRequired: false,
    hardMaxBatchCap: effectiveHardCap,
    ownerMaxBatchCap,
  };
}

export function buildAutoBatchPlan(
  candidates: MediaAutomationCandidate[],
  input: MediaAutomationBatchPolicyInput,
): MediaAutomationAutoBatchPlan {
  const eligible = candidates.filter((candidate) => candidate.publicSafe && candidate.needsTranscode);
  const batchSizeResult = calculateAutoBatchSize({
    ...input,
    eligible_count: input.eligible_count ?? eligible.length,
  });
  const selected = eligible.slice(0, batchSizeResult.batchSize);

  return {
    selected,
    skipped: eligible.slice(batchSizeResult.batchSize),
    batchSize: batchSizeResult.batchSize,
    riskLevel: batchSizeResult.riskLevel,
    reasonCodes: batchSizeResult.reasonCodes,
    rollbackRequired: true,
    auditRequired: true,
    mutationAttempted: false,
    productionRowsWritten: false,
    productionPlaybackSwitched: false,
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
  };
}

export function sanitizeBatchPolicyProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/postgres(?:ql)?:\/\//i.test(entry)) return "[REDACTED_DB_URL]";
    if (/X-Amz-Signature=/i.test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/eyJ[A-Za-z0-9_-]{20,}\./.test(entry)) return "[REDACTED_TOKEN]";
    return entry;
  })) as T;
}
