export type MediaAutomationCandidateClassification =
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
  current_playback_source?: string | null;
};

export type MediaAutomationCandidate = {
  sourceType: string;
  sourceId: string;
  title: string;
  classification: MediaAutomationCandidateClassification;
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

  if (!sourceId || deniedSourceIds.has(sourceId)) blockedReasons.push("denied_source_blocked");
  if (visibility !== "public") blockedReasons.push("private_blocked");
  if (premiumLocked) blockedReasons.push("premium_blocked");
  if (originalOnly) blockedReasons.push("original_only_blocked");
  if (!sourcePresent) blockedReasons.push("missing_source_blocked");
  if (!PUBLIC_SCAN_STATUSES.has(scanStatus)) blockedReasons.push("unscanned_blocked");
  if (!PUBLIC_MODERATION_STATUSES.has(moderationStatus)) blockedReasons.push("moderation_blocked");
  if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) blockedReasons.push("unsupported_format_blocked");

  let classification: MediaAutomationCandidateClassification = "eligible_public_safe";
  if (blockedReasons.length > 0) {
    classification = blockedReasons[0] as MediaAutomationCandidateClassification;
  } else if (alreadyHasAuditedHls) {
    classification = "already_has_audited_hls";
  } else {
    classification = "needs_transcode";
  }

  return {
    sourceType: toText(row.source_type) || "creator_video",
    sourceId,
    title: toText(row.title) || "(untitled)",
    classification,
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
  return rows
    .map((row) => classifyMediaAutomationCandidate(row, options))
    .filter((candidate) => candidate.publicSafe)
    .filter((candidate) => options.includeAlreadyAudited === true || !candidate.alreadyHasAuditedHls);
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
  const eligible = candidates
    .filter((candidate) => candidate.publicSafe)
    .filter((candidate) => options.includeAlreadyAudited === true || !candidate.alreadyHasAuditedHls);
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
