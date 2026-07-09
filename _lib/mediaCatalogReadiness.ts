export type MediaCatalogReadinessClassification =
  | "ready_for_transcode"
  | "already_audited_hls"
  | "needs_scan"
  | "needs_moderation_review"
  | "private_excluded"
  | "premium_excluded"
  | "original_master_excluded"
  | "missing_source"
  | "unsupported_format"
  | "blocked_moderation"
  | "denied_source";

export type MediaCatalogReadinessRow = {
  source_type?: string | null;
  source_id?: string | null;
  title?: string | null;
  visibility?: string | null;
  scan_status?: string | null;
  moderation_status?: string | null;
  mime_type?: string | null;
  source_present?: boolean | null;
  paid_or_premium_locked?: boolean | null;
  is_original_only?: boolean | null;
  has_audited_hls?: boolean | null;
};

export type MediaCatalogReadinessResult = {
  sourceType: string;
  sourceId: string;
  title: string;
  classification: MediaCatalogReadinessClassification;
  canQueueForScan: boolean;
  canPromoteToTranscodeEligibility: boolean;
  publicCandidate: boolean;
  scanStatus: string;
  moderationStatus: string;
  blockedReasons: string[];
  nextStep: string;
};

export type MediaCatalogReadinessPlan = {
  totalRows: number;
  classificationCounts: Record<MediaCatalogReadinessClassification, number>;
  readyForTranscode: MediaCatalogReadinessResult[];
  scanCandidates: MediaCatalogReadinessResult[];
  moderationReviewCandidates: MediaCatalogReadinessResult[];
  alreadyAuditedHls: MediaCatalogReadinessResult[];
  mutationAttempted: false;
  scanExecutionAttempted: false;
  productionRowsWritten: false;
  mediaProcessed: false;
  playbackSwitched: false;
};

const PUBLIC_SCAN_STATUSES = new Set(["clean", "approved"]);
const SCAN_PENDING_STATUSES = new Set(["", "pending", "pending_scan", "scanning", "manual_review", "unscanned"]);
const BLOCKED_SCAN_STATUSES = new Set(["failed", "scan_failed", "malware", "malware_detected", "quarantined"]);
const PUBLIC_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const REVIEW_MODERATION_STATUSES = new Set(["", "pending", "pending_review", "reported", "manual_review"]);
const BLOCKED_MODERATION_STATUSES = new Set(["blocked", "hidden", "removed", "banned", "rejected"]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/vnd.apple.mpegurl",
]);

const EMPTY_COUNTS: Record<MediaCatalogReadinessClassification, number> = {
  ready_for_transcode: 0,
  already_audited_hls: 0,
  needs_scan: 0,
  needs_moderation_review: 0,
  private_excluded: 0,
  premium_excluded: 0,
  original_master_excluded: 0,
  missing_source: 0,
  unsupported_format: 0,
  blocked_moderation: 0,
  denied_source: 0,
};

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const isSupportedMimeType = (value: unknown) => {
  const mimeType = toLowerText(value || "video/mp4");
  if (!mimeType) return true;
  return SUPPORTED_VIDEO_MIME_TYPES.has(mimeType) || mimeType.startsWith("video/");
};

export function classifyMediaCatalogReadiness(
  row: MediaCatalogReadinessRow,
  options: { deniedSourceIds?: string[] | null } = {},
): MediaCatalogReadinessResult {
  const sourceId = toText(row.source_id);
  const deniedSourceIds = new Set((options.deniedSourceIds ?? []).map(toText).filter(Boolean));
  const visibility = toLowerText(row.visibility || "draft");
  const scanStatus = toLowerText(row.scan_status || "unscanned");
  const moderationStatus = toLowerText(row.moderation_status || "pending_review");
  const sourcePresent = row.source_present === true;
  const premiumLocked = row.paid_or_premium_locked === true || visibility === "premium";
  const originalOnly = row.is_original_only === true;
  const alreadyAuditedHls = row.has_audited_hls === true;
  const blockedReasons: string[] = [];

  let classification: MediaCatalogReadinessClassification = "ready_for_transcode";
  if (!sourceId || deniedSourceIds.has(sourceId)) {
    classification = "denied_source";
    blockedReasons.push("denied_source");
  } else if (visibility !== "public") {
    classification = "private_excluded";
    blockedReasons.push("private_media_never_public_transcode");
  } else if (premiumLocked) {
    classification = "premium_excluded";
    blockedReasons.push("premium_requires_future_signed_token_cdn");
  } else if (originalOnly) {
    classification = "original_master_excluded";
    blockedReasons.push("original_master_stays_private");
  } else if (!sourcePresent) {
    classification = "missing_source";
    blockedReasons.push("missing_source");
  } else if (!isSupportedMimeType(row.mime_type)) {
    classification = "unsupported_format";
    blockedReasons.push("unsupported_format");
  } else if (BLOCKED_SCAN_STATUSES.has(scanStatus) || BLOCKED_MODERATION_STATUSES.has(moderationStatus)) {
    classification = "blocked_moderation";
    blockedReasons.push(BLOCKED_SCAN_STATUSES.has(scanStatus) ? "scan_blocked" : "moderation_blocked");
  } else if (alreadyAuditedHls) {
    classification = "already_audited_hls";
  } else if (!PUBLIC_SCAN_STATUSES.has(scanStatus)) {
    classification = "needs_scan";
    blockedReasons.push(SCAN_PENDING_STATUSES.has(scanStatus) ? "scan_proof_required" : "scan_not_clean");
  } else if (!PUBLIC_MODERATION_STATUSES.has(moderationStatus)) {
    classification = "needs_moderation_review";
    blockedReasons.push(REVIEW_MODERATION_STATUSES.has(moderationStatus) ? "moderation_review_required" : "moderation_not_allowed");
  }

  const result = {
    sourceType: toText(row.source_type) || "creator_video",
    sourceId,
    title: toText(row.title) || "(untitled)",
    classification,
    canQueueForScan: classification === "needs_scan",
    canPromoteToTranscodeEligibility: classification === "ready_for_transcode",
    publicCandidate: visibility === "public" && !premiumLocked && !originalOnly,
    scanStatus,
    moderationStatus,
    blockedReasons,
    nextStep: "none",
  };

  return {
    ...result,
    nextStep: resolveReadinessNextStep(result),
  };
}

export function canQueueMediaForScan(result: MediaCatalogReadinessResult): boolean {
  return result.classification === "needs_scan" && result.publicCandidate === true;
}

export function canPromoteScanResultToTranscodeEligibility(result: MediaCatalogReadinessResult): boolean {
  return result.classification === "ready_for_transcode";
}

function resolveReadinessNextStep(result: Omit<MediaCatalogReadinessResult, "nextStep">): string {
  switch (result.classification) {
    case "ready_for_transcode":
      return "eligible_for_auto_detect_transcode";
    case "already_audited_hls":
      return "skip_already_cdn_hls_ready";
    case "needs_scan":
      return "queue_scan_after_safe_operator_preflight";
    case "needs_moderation_review":
      return "moderation_review_required_before_transcode";
    case "blocked_moderation":
      return "keep_blocked";
    case "private_excluded":
    case "premium_excluded":
    case "original_master_excluded":
      return "exclude_from_public_cdn";
    case "missing_source":
      return "repair_source_metadata_before_scan";
    case "unsupported_format":
      return "unsupported_until_worker_supports_format";
    case "denied_source":
      return "operator_denied_source";
    default:
      return "none";
  }
}

export function buildMediaReadinessPlan(
  rows: MediaCatalogReadinessRow[],
  options: { deniedSourceIds?: string[] | null } = {},
): MediaCatalogReadinessPlan {
  const results = rows.map((row) => classifyMediaCatalogReadiness(row, options));
  const classificationCounts = { ...EMPTY_COUNTS };
  for (const result of results) {
    classificationCounts[result.classification] += 1;
  }

  return {
    totalRows: results.length,
    classificationCounts,
    readyForTranscode: results.filter((result) => result.classification === "ready_for_transcode"),
    scanCandidates: results.filter(canQueueMediaForScan),
    moderationReviewCandidates: results.filter((result) => result.classification === "needs_moderation_review"),
    alreadyAuditedHls: results.filter((result) => result.classification === "already_audited_hls"),
    mutationAttempted: false,
    scanExecutionAttempted: false,
    productionRowsWritten: false,
    mediaProcessed: false,
    playbackSwitched: false,
  };
}

export function sanitizeMediaReadinessProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/https?:\/\//i.test(entry)) return "[REDACTED_URL]";
    if (/X-Amz-/i.test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/(^|_)(storage|object|path|url|bucket)$/i.test(key) && entry) return "[REDACTED_MEDIA_VALUE]";
    return entry;
  })) as T;
}
