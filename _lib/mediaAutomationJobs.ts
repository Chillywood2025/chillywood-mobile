import type { MediaAutomationCandidate } from "./mediaAutomationDiscovery";
import { getSupportedRenditionsForSource } from "./mediaRenditionLadder";

export type MediaAutomationJobPlan = {
  jobId: string;
  batchId: string;
  sourceType: string;
  sourceId: string;
  title: string;
  outputPrefix: string;
  rollbackScope: string;
  requestedRenditions: string[];
  dryRun: boolean;
  writesAllowed: boolean;
  valid: boolean;
  failures: string[];
};

export type MediaAutomationJobPlanInput = {
  batchId: string;
  candidates: MediaAutomationCandidate[];
  maxBatchSize: number;
  mode?: "dry_run" | "one_job" | "batch" | "continuous_limited" | string | null;
  writesAllowed?: boolean | null;
  forceAlreadyAudited?: boolean | null;
};

export type MediaAutomationRollbackPlanEntry = {
  batchId: string;
  sourceId: string;
  sourceType: string;
  exactOutputPrefix: string;
  exactRollbackScope: string;
  broadRollbackAllowed: false;
};

const toText = (value: unknown) => String(value ?? "").trim();

const slugify = (value: string) => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled"
);

const outputPrefixFor = (candidate: MediaAutomationCandidate, batchId: string) => (
  `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/${batchId}/`
);

const isSafeOutputPrefix = (prefix: string) => (
  prefix.startsWith("playback/public/auto/")
  && !prefix.includes("..")
  && !/(^|\/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(\/|$)/i.test(prefix)
);

export function buildMediaTranscodeJobPlan(input: {
  batchId: string;
  candidate: MediaAutomationCandidate;
  mode?: string | null;
  writesAllowed?: boolean | null;
}): MediaAutomationJobPlan {
  const batchId = toText(input.batchId) || "automation-dry-run-batch";
  const candidate = input.candidate;
  const outputPrefix = outputPrefixFor(candidate, batchId);
  const failures: string[] = [];
  const requestedRenditions = getSupportedRenditionsForSource(
    { width: candidate.sourceWidth, height: candidate.sourceHeight },
    {
      premiumEnabled: true,
      unknownSourceStrategy: "conservative_free",
    },
  ).map((rendition) => rendition.label);

  if (!candidate.publicSafe) failures.push("candidate_not_public_safe");
  if (!candidate.needsTranscode) failures.push(candidate.alreadyHasAuditedHls ? "already_has_audited_hls" : "candidate_does_not_need_transcode");
  if (!isSafeOutputPrefix(outputPrefix)) failures.push("unsafe_output_prefix");
  if (requestedRenditions.length === 0) failures.push("source_resolution_below_minimum_hls_rendition");

  return {
    jobId: `job-${batchId}-${slugify(candidate.sourceId).slice(0, 12)}`,
    batchId,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    title: candidate.title,
    outputPrefix,
    rollbackScope: `batch_id=${batchId};source_id=${candidate.sourceId};exact_prefix=${outputPrefix}`,
    requestedRenditions,
    dryRun: input.mode !== "one_job" && input.mode !== "batch" && input.mode !== "continuous_limited",
    writesAllowed: input.writesAllowed === true,
    valid: failures.length === 0,
    failures,
  };
}

export function validateMediaTranscodeJobPlan(plan: MediaAutomationJobPlan): MediaAutomationJobPlan {
  const failures = [...plan.failures];
  if (!plan.batchId) failures.push("missing_batch_id");
  if (!plan.sourceId) failures.push("missing_source_id");
  if (!isSafeOutputPrefix(plan.outputPrefix)) failures.push("unsafe_output_prefix");
  if (!plan.rollbackScope.includes(plan.batchId) || !plan.rollbackScope.includes(plan.outputPrefix)) {
    failures.push("rollback_scope_not_exact");
  }
  return {
    ...plan,
    valid: failures.length === 0,
    failures: Array.from(new Set(failures)),
  };
}

export function createMediaTranscodeJobsDryRun(input: MediaAutomationJobPlanInput): {
  batchId: string;
  plans: MediaAutomationJobPlan[];
  mutationAttempted: false;
  productionRowsWritten: false;
  maxBatchCapEnforced: boolean;
} {
  const maxBatchSize = Math.max(0, Math.floor(Number(input.maxBatchSize) || 0));
  const selected = input.candidates
    .filter((candidate) => candidate.publicSafe)
    .filter((candidate) => input.forceAlreadyAudited === true || candidate.needsTranscode)
    .slice(0, maxBatchSize);
  const plans = selected.map((candidate) => validateMediaTranscodeJobPlan(buildMediaTranscodeJobPlan({
    batchId: input.batchId,
    candidate,
    mode: "dry_run",
    writesAllowed: false,
  })));

  return {
    batchId: toText(input.batchId) || "automation-dry-run-batch",
    plans,
    mutationAttempted: false,
    productionRowsWritten: false,
    maxBatchCapEnforced: plans.length <= maxBatchSize,
  };
}

export function buildAutoDetectedTranscodeJobPlan(input: MediaAutomationJobPlanInput): {
  batchId: string;
  plans: MediaAutomationJobPlan[];
  mutationAttempted: false;
  productionRowsWritten: false;
  manualSourceIdsRequired: false;
  manualBatchSizeRequired: false;
  maxBatchCapEnforced: boolean;
} {
  const dryRun = createMediaTranscodeJobsDryRun({
    ...input,
    mode: "dry_run",
    writesAllowed: false,
  });
  return {
    ...dryRun,
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
  };
}

export function validateAutoDetectedJobPlan(plan: MediaAutomationJobPlan): MediaAutomationJobPlan {
  return validateMediaTranscodeJobPlan(plan);
}

export function buildAutoDetectedRollbackPlan(plans: MediaAutomationJobPlan[]): MediaAutomationRollbackPlanEntry[] {
  return plans.map((plan) => ({
    batchId: plan.batchId,
    sourceId: plan.sourceId,
    sourceType: plan.sourceType,
    exactOutputPrefix: plan.outputPrefix,
    exactRollbackScope: plan.rollbackScope,
    broadRollbackAllowed: false,
  }));
}

export function sanitizeAutoJobPlanProof<T>(value: T): T {
  return sanitizeJobPlanProof(value);
}

export function sanitizeJobPlanProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/postgres(?:ql)?:\/\//i.test(entry)) return "[REDACTED_DB_URL]";
    if (/X-Amz-Signature=/i.test(entry)) return "[REDACTED_SIGNED_URL]";
    return entry;
  })) as T;
}
