export type MediaAutomationCandidateClassification =
  | "eligible_needs_transcode"
  | "eligible_already_has_audited_hls"
  | "excluded_private"
  | "excluded_premium"
  | "excluded_original_master"
  | "excluded_unscanned"
  | "excluded_moderation_blocked"
  | "excluded_missing_source"
  | "excluded_unsupported_format"
  | "excluded_already_active_job"
  | "excluded_denied_source"
  | "excluded_already_processed"
  | "eligible_public_safe"
  | "already_has_audited_hls"
  | "needs_transcode"
  | "private_blocked"
  | "premium_blocked"
  | "original_only_blocked"
  | "unscanned_blocked"
  | "moderation_blocked"
  | "missing_source_blocked"
  | "unsupported_format_blocked"
  | "denied_source_blocked";

export type MediaAutomationCandidateRow = {
  source_type: string;
  source_id: string;
  title?: string | null;
  visibility?: string | null;
  scan_status?: string | null;
  moderation_status?: string | null;
  mime_type?: string | null;
  source_present?: boolean | null;
  paid_or_premium_locked?: boolean | null;
  is_original_only?: boolean | null;
  has_audited_hls?: boolean | null;
  has_active_unfinished_job?: boolean | null;
  already_processed?: boolean | null;
  current_playback_source?: string | null;
};

export type MediaAutomationCandidate = {
  sourceType: string;
  sourceId: string;
  title: string;
  classification: MediaAutomationCandidateClassification;
  legacyClassification: MediaAutomationCandidateClassification;
  publicSafe: boolean;
  needsTranscode: boolean;
  alreadyHasAuditedHls: boolean;
  currentPlaybackSource: string;
  blockedReasons: string[];
};

export type MediaAutomationCandidateBatch = {
  candidates: MediaAutomationCandidate[];
  selected: MediaAutomationCandidate[];
  maxBatchSize: number;
  mutationAttempted: false;
  productionPlaybackSwitched: false;
  blockedCounts: Record<string, number>;
};

const PUBLIC_SCAN_STATUSES = new Set(["clean", "approved"]);
const PUBLIC_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "application/vnd.apple.mpegurl"]);

export const MEDIA_AUTOMATION_CLASSIFICATION_ALIASES: Record<string, MediaAutomationCandidateClassification> = {
  eligible_needs_transcode: "needs_transcode",
  eligible_already_has_audited_hls: "already_has_audited_hls",
  excluded_private: "private_blocked",
  excluded_premium: "premium_blocked",
  excluded_original_master: "original_only_blocked",
  excluded_unscanned: "unscanned_blocked",
  excluded_moderation_blocked: "moderation_blocked",
  excluded_missing_source: "missing_source_blocked",
  excluded_unsupported_format: "unsupported_format_blocked",
  excluded_denied_source: "denied_source_blocked",
  excluded_already_active_job: "needs_transcode",
  excluded_already_processed: "already_has_audited_hls",
};

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

export function classifyMediaAutomationCandidate(
  row: MediaAutomationCandidateRow,
  options: { deniedSourceIds?: string[] | null } = {},
): MediaAutomationCandidate {
  const sourceId = toText(row.source_id);
  const deniedSourceIds = new Set((options.deniedSourceIds ?? []).map(toText).filter(Boolean));
  const blockedReasons: string[] = [];
  const visibility = toLowerText(row.visibility || "draft");
  const scanStatus = toLowerText(row.scan_status || "unscanned");
  const moderationStatus = toLowerText(row.moderation_status || "pending_review");
  const mimeType = toLowerText(row.mime_type || "video/mp4");
  const sourcePresent = row.source_present === true;
  const premiumLocked = row.paid_or_premium_locked === true || visibility === "premium";
  const originalOnly = row.is_original_only === true;
  const alreadyHasAuditedHls = row.has_audited_hls === true;
  const hasActiveUnfinishedJob = row.has_active_unfinished_job === true;
  const alreadyProcessed = row.already_processed === true;

  if (!sourceId || deniedSourceIds.has(sourceId)) blockedReasons.push("excluded_denied_source");
  if (visibility !== "public") blockedReasons.push("excluded_private");
  if (premiumLocked) blockedReasons.push("excluded_premium");
  if (originalOnly) blockedReasons.push("excluded_original_master");
  if (!sourcePresent) blockedReasons.push("excluded_missing_source");
  if (hasActiveUnfinishedJob) blockedReasons.push("excluded_already_active_job");
  if (!PUBLIC_SCAN_STATUSES.has(scanStatus)) blockedReasons.push("excluded_unscanned");
  if (!PUBLIC_MODERATION_STATUSES.has(moderationStatus)) blockedReasons.push("excluded_moderation_blocked");
  if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) blockedReasons.push("excluded_unsupported_format");
  if (alreadyProcessed) blockedReasons.push("excluded_already_processed");

  let classification: MediaAutomationCandidateClassification = "eligible_needs_transcode";
  if (blockedReasons.length > 0) {
    classification = blockedReasons[0] as MediaAutomationCandidateClassification;
  } else if (alreadyHasAuditedHls) {
    classification = "eligible_already_has_audited_hls";
  }
  const legacyClassification = MEDIA_AUTOMATION_CLASSIFICATION_ALIASES[classification] ?? classification;

  return {
    sourceType: toText(row.source_type) || "creator_video",
    sourceId,
    title: toText(row.title) || "(untitled)",
    classification,
    legacyClassification,
    publicSafe: blockedReasons.length === 0,
    needsTranscode: blockedReasons.length === 0 && !alreadyHasAuditedHls,
    alreadyHasAuditedHls,
    currentPlaybackSource: toText(row.current_playback_source) || "signed-origin-fallback",
    blockedReasons,
  };
}

export function discoverEligibleTranscodeSources(
  rows: MediaAutomationCandidateRow[],
  options: { deniedSourceIds?: string[] | null; includeAlreadyAudited?: boolean | null } = {},
): MediaAutomationCandidate[] {
  return discoverEligibleMediaCandidates(rows, options);
}

export function discoverEligibleMediaCandidates(
  rows: MediaAutomationCandidateRow[],
  options: { deniedSourceIds?: string[] | null; includeAlreadyAudited?: boolean | null } = {},
): MediaAutomationCandidate[] {
  return rows
    .map((row) => classifyMediaAutomationCandidate(row, options))
    .filter((candidate) => candidate.publicSafe)
    .filter((candidate) => options.includeAlreadyAudited === true || !candidate.alreadyHasAuditedHls);
}

export function filterAutomationCandidates(
  candidates: MediaAutomationCandidate[],
  options: { includeAlreadyAudited?: boolean | null; includeAlreadyProcessed?: boolean | null } = {},
): MediaAutomationCandidate[] {
  return candidates
    .filter((candidate) => candidate.publicSafe)
    .filter((candidate) => options.includeAlreadyAudited === true || !candidate.alreadyHasAuditedHls)
    .filter((candidate) => options.includeAlreadyProcessed === true || candidate.classification !== "excluded_already_processed");
}

export function buildTranscodeCandidateBatch(
  rows: MediaAutomationCandidateRow[],
  options: {
    maxBatchSize: number;
    deniedSourceIds?: string[] | null;
    includeAlreadyAudited?: boolean | null;
  },
): MediaAutomationCandidateBatch {
  const maxBatchSize = Math.max(0, Math.floor(Number(options.maxBatchSize) || 0));
  const candidates = rows.map((row) => classifyMediaAutomationCandidate(row, options));
  const eligible = filterAutomationCandidates(candidates, options);
  const selected = eligible.slice(0, maxBatchSize);
  const blockedCounts: Record<string, number> = {};
  for (const candidate of candidates) {
    if (candidate.publicSafe && !candidate.alreadyHasAuditedHls) continue;
    const key = candidate.classification;
    blockedCounts[key] = (blockedCounts[key] ?? 0) + 1;
  }

  return {
    candidates,
    selected,
    maxBatchSize,
    mutationAttempted: false,
    productionPlaybackSwitched: false,
    blockedCounts,
  };
}

export function sanitizeAutomationDiscoveryProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/https?:\/\//i.test(entry) && !/media\.chillywoodstream\.com/.test(entry)) return "[REDACTED_URL]";
    if (/X-Amz-Signature=/i.test(entry)) return "[REDACTED_SIGNED_URL]";
    return entry;
  })) as T;
}
