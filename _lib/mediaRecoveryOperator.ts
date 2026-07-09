export type MediaRecoveryAuditStatus =
  | "pending_audit"
  | "audit_passed"
  | "audit_failed"
  | "quarantined";

export type MediaRecoveryAuditRow = {
  id: string;
  batch_id: string;
  source_id: string;
  rendition_label: string;
  public_playback_path: string;
  manifest_path: string | null;
  variant_playlist_path: string | null;
  visibility: "public" | "premium" | "private" | string;
  scan_status: "clean" | "approved" | "pending" | "unscanned" | string;
  moderation_status: "clean" | "approved" | "allowed" | "blocked" | "hidden" | string;
  bucket_role: "public_playback" | "private_origin" | string;
  is_original: boolean;
  is_public_playback_safe: boolean;
  worker_status: MediaRecoveryAuditStatus;
  resolver_ready: boolean;
};

export type MediaRecoveryRollbackPlan = {
  batch_id: string;
  exact_r2_prefix: string;
  row_ids: string[];
  delete_only_exact_prefix: true;
  revoke_resolver_trust: true;
  delete_private_origin_media: false;
};

export type MediaRecoveryAuditResult = {
  batch_id: string;
  source_id: string;
  passed: boolean;
  state: "passed" | "quarantined";
  resolverTrustAllowed: boolean;
  checkedRowCount: number;
  expectedRowCount: number;
  failures: string[];
  rollbackPlan: MediaRecoveryRollbackPlan;
};

export type MediaRecoveryAuditInput = {
  batchId: string;
  sourceId: string;
  expectedRowCount: number;
  exactR2Prefix: string;
  rows: MediaRecoveryAuditRow[];
};

const PUBLIC_PREFIX = "playback/public/";
const ALLOWED_SCAN_STATUSES = new Set(["clean", "approved"]);
const ALLOWED_MODERATION_STATUSES = new Set(["clean", "approved", "allowed"]);
const FORBIDDEN_PUBLIC_SEGMENTS = new Set([
  "original",
  "originals",
  "master",
  "masters",
  "source",
  "sources",
  "uploads",
  "private",
  "premium",
  "processing",
  "moderation-blocked",
  "moderation_blocked",
  "unscanned",
]);

const toText = (value: unknown) => String(value ?? "").trim();
const toLowerText = (value: unknown) => toText(value).toLowerCase();

const normalizeObjectPath = (value: unknown) => (
  toText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
);

const findForbiddenSegment = (path: string) => (
  path
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .find((segment) => FORBIDDEN_PUBLIC_SEGMENTS.has(segment)) ?? null
);

const rowPlaybackPaths = (row: MediaRecoveryAuditRow) => [
  row.public_playback_path,
  row.manifest_path,
  row.variant_playlist_path,
]
  .map((value) => normalizeObjectPath(value))
  .filter(Boolean);

export function buildMediaRecoveryRollbackPlan(input: {
  batchId: string;
  exactR2Prefix: string;
  rows: MediaRecoveryAuditRow[];
}): MediaRecoveryRollbackPlan {
  return {
    batch_id: input.batchId,
    exact_r2_prefix: normalizeObjectPath(input.exactR2Prefix),
    row_ids: input.rows.map((row) => row.id),
    delete_only_exact_prefix: true,
    revoke_resolver_trust: true,
    delete_private_origin_media: false,
  };
}

export function auditMediaRecoveryBatch(
  input: MediaRecoveryAuditInput,
): MediaRecoveryAuditResult {
  const batchId = toText(input.batchId);
  const sourceId = toText(input.sourceId);
  const exactR2Prefix = normalizeObjectPath(input.exactR2Prefix);
  const rows = input.rows.filter((row) => row.batch_id === batchId);
  const failures: string[] = [];

  if (rows.length !== input.expectedRowCount) {
    failures.push("row_count_mismatch");
  }

  for (const row of rows) {
    if (row.source_id !== sourceId) failures.push(`source_id_mismatch:${row.id}`);
    if (row.resolver_ready === true) failures.push(`unexpected_ready_row_before_audit:${row.id}`);
    if (row.worker_status !== "pending_audit") failures.push(`row_not_pending_audit:${row.id}`);
    if (row.is_original === true) failures.push(`original_or_master_public_playback_blocked:${row.id}`);
    if (row.visibility === "premium" || row.visibility === "private") {
      failures.push(`premium_or_private_public_playback_blocked:${row.id}`);
    }
    if (row.bucket_role !== "public_playback") failures.push(`wrong_bucket_role:${row.id}`);
    if (row.is_public_playback_safe !== true) failures.push(`not_public_playback_safe:${row.id}`);
    if (!ALLOWED_SCAN_STATUSES.has(toLowerText(row.scan_status))) failures.push(`scan_not_clean:${row.id}`);
    if (!ALLOWED_MODERATION_STATUSES.has(toLowerText(row.moderation_status))) {
      failures.push(`moderation_not_allowed:${row.id}`);
    }

    for (const path of rowPlaybackPaths(row)) {
      if (!path.startsWith(PUBLIC_PREFIX)) failures.push(`non_public_playback_prefix:${row.id}`);
      if (!path.startsWith(exactR2Prefix)) failures.push(`outside_exact_r2_prefix:${row.id}`);
      const forbiddenSegment = findForbiddenSegment(path);
      if (forbiddenSegment) failures.push(`forbidden_private_prefix:${row.id}:${forbiddenSegment}`);
    }
  }

  const passed = failures.length === 0;
  return {
    batch_id: batchId,
    source_id: sourceId,
    passed,
    state: passed ? "passed" : "quarantined",
    resolverTrustAllowed: passed,
    checkedRowCount: rows.length,
    expectedRowCount: input.expectedRowCount,
    failures,
    rollbackPlan: buildMediaRecoveryRollbackPlan({
      batchId,
      exactR2Prefix,
      rows,
    }),
  };
}

export function canResolverTrustAuditedRows(
  result: MediaRecoveryAuditResult,
): boolean {
  return result.passed === true
    && result.resolverTrustAllowed === true
    && result.failures.length === 0
    && result.checkedRowCount === result.expectedRowCount;
}

export function applyMediaRecoveryAuditResult(
  row: MediaRecoveryAuditRow,
  result: MediaRecoveryAuditResult,
): MediaRecoveryAuditRow {
  if (!result.passed) {
    return {
      ...row,
      worker_status: "quarantined",
      resolver_ready: false,
    };
  }

  return {
    ...row,
    worker_status: "audit_passed",
    resolver_ready: true,
  };
}
