export type MediaScanState =
  | "unscanned"
  | "scan_pending"
  | "scan_clean"
  | "scan_failed"
  | "scan_quarantined"
  | "scan_skipped_private"
  | "scan_skipped_premium"
  | "scan_skipped_missing_source"
  | "scan_skipped_unsupported"
  | "scan_skipped_already_audited_hls";

export type MediaScanCandidateRow = {
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
  has_active_job?: boolean | null;
  has_audited_hls?: boolean | null;
};

export type MediaScanCandidateClassification = {
  sourceType: string;
  sourceId: string;
  title: string;
  scanState: MediaScanState;
  canScan: boolean;
  canWriteCleanResult: boolean;
  canPromoteToReadiness: boolean;
  publicCandidate: boolean;
  moderationAllowed: boolean;
  scannerType: "ffprobe_media_readability" | "clamav_malware" | "plan_only";
  blockedReasons: string[];
  nextStep: string;
};

export type MediaScanJobPlan = {
  scannerType: "ffprobe_media_readability" | "clamav_malware" | "plan_only";
  totalCandidates: number;
  plannedJobCount: number;
  jobs: Array<{
    sourceType: string;
    sourceId: string;
    title: string;
    targetTable: "videos";
    targetColumn: "source";
    requiredScannerProof: string[];
    trustedWritePath: "service_role_media_scan_rpc_required";
    productionWritePlanned: false;
  }>;
  skipped: MediaScanCandidateClassification[];
  mutationAttempted: false;
  productionRowsWritten: false;
  mediaProcessed: false;
  transcodeStarted: false;
  playbackSwitched: false;
};

export type MediaScanResultInput = {
  status?: "clean" | "scan_failed" | "malware_detected" | "quarantined" | "manual_review" | string | null;
  scannerName?: string | null;
  scannerVersion?: string | null;
  scannerType?: "ffprobe_media_readability" | "clamav_malware" | "plan_only" | string | null;
  proof?: {
    observedReadable?: boolean | null;
    decodedStreams?: number | null;
    durationMillis?: number | null;
    errorCode?: string | null;
  } | null;
};

export type MediaScanResultValidation = {
  valid: boolean;
  scanState: MediaScanState;
  normalizedStatus: string;
  scannerName: string;
  scannerVersion: string;
  scannerType: string;
  blockedReasons: string[];
};

const PUBLIC_SCAN_STATUSES = new Set(["clean", "approved"]);
const PENDING_SCAN_STATUSES = new Set(["", "pending", "pending_scan", "scanning", "manual_review", "unscanned"]);
const BLOCKED_SCAN_STATUSES = new Set(["failed", "scan_failed", "malware", "malware_detected", "quarantined"]);
const PUBLIC_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const BLOCKED_MODERATION_STATUSES = new Set(["blocked", "hidden", "removed", "banned", "rejected"]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/vnd.apple.mpegurl",
]);

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const isSupportedMimeType = (value: unknown) => {
  const mimeType = toLowerText(value || "video/mp4");
  if (!mimeType) return true;
  return SUPPORTED_VIDEO_MIME_TYPES.has(mimeType) || mimeType.startsWith("video/");
};

const isModerationAllowed = (value: unknown) => PUBLIC_MODERATION_STATUSES.has(toLowerText(value));

export function classifyMediaScanCandidate(
  row: MediaScanCandidateRow,
  options: {
    scannerType?: "ffprobe_media_readability" | "clamav_malware" | "plan_only";
    deniedSourceIds?: string[] | null;
  } = {},
): MediaScanCandidateClassification {
  const sourceId = toText(row.source_id);
  const sourceType = toText(row.source_type) || "creator_video";
  const title = toText(row.title) || "(untitled)";
  const visibility = toLowerText(row.visibility || "draft");
  const scanStatus = toLowerText(row.scan_status || "unscanned");
  const moderationStatus = toLowerText(row.moderation_status || "pending_review");
  const premiumLocked = row.paid_or_premium_locked === true || visibility === "premium";
  const sourcePresent = row.source_present === true;
  const originalOnly = row.is_original_only === true;
  const deniedSourceIds = new Set((options.deniedSourceIds ?? []).map(toText).filter(Boolean));
  const scannerType = options.scannerType ?? "ffprobe_media_readability";
  const blockedReasons: string[] = [];

  let scanState: MediaScanState = "unscanned";
  let canScan = false;

  if (!sourceId || deniedSourceIds.has(sourceId)) {
    scanState = "scan_skipped_unsupported";
    blockedReasons.push("denied_source");
  } else if (visibility !== "public") {
    scanState = "scan_skipped_private";
    blockedReasons.push("private_media_never_public_scan");
  } else if (premiumLocked) {
    scanState = "scan_skipped_premium";
    blockedReasons.push("premium_requires_future_signed_token_cdn");
  } else if (originalOnly) {
    scanState = "scan_skipped_unsupported";
    blockedReasons.push("original_master_stays_private");
  } else if (!sourcePresent) {
    scanState = "scan_skipped_missing_source";
    blockedReasons.push("missing_source");
  } else if (!isSupportedMimeType(row.mime_type)) {
    scanState = "scan_skipped_unsupported";
    blockedReasons.push("unsupported_format");
  } else if (BLOCKED_MODERATION_STATUSES.has(moderationStatus) || BLOCKED_SCAN_STATUSES.has(scanStatus)) {
    scanState = "scan_quarantined";
    blockedReasons.push(BLOCKED_MODERATION_STATUSES.has(moderationStatus) ? "moderation_blocked" : "scan_blocked");
  } else if (row.has_audited_hls === true) {
    scanState = "scan_skipped_already_audited_hls";
    blockedReasons.push("already_audited_hls_skip_normal_scan_automation");
  } else if (PUBLIC_SCAN_STATUSES.has(scanStatus)) {
    scanState = "scan_clean";
    blockedReasons.push("already_scan_clean");
  } else if (PENDING_SCAN_STATUSES.has(scanStatus)) {
    scanState = "scan_pending";
    canScan = true;
  } else {
    scanState = "unscanned";
    canScan = true;
  }

  const moderationAllowed = isModerationAllowed(moderationStatus);
  const publicCandidate = visibility === "public" && !premiumLocked && !originalOnly;
  return {
    sourceType,
    sourceId,
    title,
    scanState,
    canScan,
    canWriteCleanResult: false,
    canPromoteToReadiness: false,
    publicCandidate,
    moderationAllowed,
    scannerType,
    blockedReasons,
    nextStep: resolveScanNextStep(scanState, blockedReasons, moderationAllowed),
  };
}

export function buildMediaScanJobPlan(
  rows: MediaScanCandidateRow[],
  options: {
    maxJobs?: number | null;
    scannerType?: "ffprobe_media_readability" | "clamav_malware" | "plan_only";
    deniedSourceIds?: string[] | null;
  } = {},
): MediaScanJobPlan {
  const scannerType = options.scannerType ?? "ffprobe_media_readability";
  const maxJobs = Math.max(0, Math.min(Number(options.maxJobs ?? 1) || 1, 25));
  const classifications = rows.map((row) => classifyMediaScanCandidate(row, { scannerType, deniedSourceIds: options.deniedSourceIds }));
  const selected = classifications.filter((result) => result.canScan).slice(0, maxJobs);
  return {
    scannerType,
    totalCandidates: classifications.length,
    plannedJobCount: selected.length,
    jobs: selected.map((result) => ({
      sourceType: result.sourceType,
      sourceId: result.sourceId,
      title: result.title,
      targetTable: "videos",
      targetColumn: "source",
      requiredScannerProof: ["scanner_name", "scanner_version", "scanner_result", "scan_status_readback"],
      trustedWritePath: "service_role_media_scan_rpc_required",
      productionWritePlanned: false,
    })),
    skipped: classifications.filter((result) => !result.canScan),
    mutationAttempted: false,
    productionRowsWritten: false,
    mediaProcessed: false,
    transcodeStarted: false,
    playbackSwitched: false,
  };
}

export function validateMediaScanResult(result: MediaScanResultInput): MediaScanResultValidation {
  const normalizedStatus = toLowerText(result.status);
  const scannerName = toText(result.scannerName);
  const scannerVersion = toText(result.scannerVersion);
  const scannerType = toText(result.scannerType || "ffprobe_media_readability");
  const proof = result.proof ?? {};
  const blockedReasons: string[] = [];

  if (!scannerName) blockedReasons.push("scanner_name_required");
  if (!scannerVersion) blockedReasons.push("scanner_version_required");

  let scanState: MediaScanState = "scan_failed";
  if (normalizedStatus === "clean") {
    scanState = "scan_clean";
    if (proof.observedReadable !== true) blockedReasons.push("scanner_proof_required_for_clean");
    if ((proof.decodedStreams ?? 0) <= 0) blockedReasons.push("decoded_stream_required_for_clean");
  } else if (normalizedStatus === "malware_detected" || normalizedStatus === "quarantined") {
    scanState = "scan_quarantined";
  } else if (normalizedStatus === "scan_failed" || normalizedStatus === "failed") {
    scanState = "scan_failed";
  } else if (normalizedStatus === "manual_review") {
    scanState = "scan_pending";
    blockedReasons.push("manual_review_not_clean");
  } else {
    scanState = "scan_failed";
    blockedReasons.push("unsupported_scan_result_status");
  }

  return {
    valid: blockedReasons.length === 0,
    scanState,
    normalizedStatus,
    scannerName,
    scannerVersion,
    scannerType,
    blockedReasons,
  };
}

export function canPromoteScanResultToReadiness(
  candidate: MediaScanCandidateClassification,
  validation: MediaScanResultValidation,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!candidate.publicCandidate) reasons.push("not_public_candidate");
  if (!candidate.moderationAllowed) reasons.push("moderation_not_allowed");
  if (!validation.valid) reasons.push(...validation.blockedReasons);
  if (validation.scanState !== "scan_clean") reasons.push("scan_not_clean");
  if (candidate.blockedReasons.some((reason) => reason.includes("private"))) reasons.push("private_blocked");
  if (candidate.blockedReasons.some((reason) => reason.includes("premium"))) reasons.push("premium_blocked");
  return { allowed: reasons.length === 0, reasons };
}

export function sanitizeMediaScanProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/https?:\/\//i.test(entry)) return "[REDACTED_URL]";
    if (/X-Amz-/i.test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/(^|_)(storage|object|path|url|bucket|key)$/i.test(key) && entry) return "[REDACTED_MEDIA_VALUE]";
    return entry;
  })) as T;
}

function resolveScanNextStep(scanState: MediaScanState, blockedReasons: string[], moderationAllowed: boolean): string {
  if (scanState === "scan_pending" || scanState === "unscanned") return "run_trusted_scanner_before_transcode";
  if (scanState === "scan_clean" && moderationAllowed) return "ready_for_transcode_after_readback";
  if (scanState === "scan_clean" && !moderationAllowed) return "moderation_review_required_before_transcode";
  if (scanState === "scan_quarantined") return "keep_blocked_or_quarantined";
  if (scanState === "scan_skipped_already_audited_hls") return "skip_already_cdn_hls_ready";
  if (blockedReasons.includes("private_media_never_public_scan")) return "exclude_private";
  if (blockedReasons.includes("premium_requires_future_signed_token_cdn")) return "exclude_premium";
  if (blockedReasons.includes("missing_source")) return "repair_source_metadata_before_scan";
  return "skip";
}
