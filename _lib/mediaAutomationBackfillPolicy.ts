import type { ChillywoodAutonomyPolicyDecision } from "./chillywoodAutonomyPolicy";
import { classifyAutonomousOperation } from "./chillywoodAutonomyPolicy";

export type MediaAutomationBackfillMode =
  | "disabled"
  | "small_capped"
  | "broad_uncapped";

export type MediaAutomationBackfillPolicyInput = {
  mode?: MediaAutomationBackfillMode | null;
  requestedBatchSize?: number | null;
  hardMaxBatchCap?: number | null;
  backupGateClosed?: boolean | null;
  restoreDrillFresh?: boolean | null;
  rollbackAvailable?: boolean | null;
  telemetryAvailable?: boolean | null;
  auditRequired?: boolean | null;
  ownerApprovedBroadBackfill?: boolean | null;
  includesPrivateMedia?: boolean | null;
  includesPremiumMedia?: boolean | null;
  includesOriginalMedia?: boolean | null;
  includesUnscannedMedia?: boolean | null;
  includesModerationBlockedMedia?: boolean | null;
  destructiveCleanupRequested?: boolean | null;
};

export type MediaAutomationBackfillPolicyDecision = {
  mode: MediaAutomationBackfillMode;
  allowed: boolean;
  approval: ChillywoodAutonomyPolicyDecision;
  batchSize: number;
  hardMaxBatchCap: number;
  broadBackfill: boolean;
  rollbackRequired: true;
  telemetryRequired: true;
  auditRequired: true;
  failures: string[];
};

const toNonNegativeInteger = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

const normalizeMode = (value: unknown): MediaAutomationBackfillMode => {
  if (value === "small_capped" || value === "broad_uncapped") return value;
  return "disabled";
};

export function resolveMediaAutomationBackfillPolicy(
  input: MediaAutomationBackfillPolicyInput = {},
): MediaAutomationBackfillPolicyDecision {
  const mode = normalizeMode(input.mode);
  const hardMaxBatchCap = Math.min(25, Math.max(1, toNonNegativeInteger(input.hardMaxBatchCap, 25)));
  const requestedBatchSize = toNonNegativeInteger(input.requestedBatchSize, 0);
  const broadBackfill = mode === "broad_uncapped";
  const failures: string[] = [];

  if (mode === "disabled") failures.push("backfill_disabled_by_default");
  if (input.backupGateClosed !== true) failures.push("backup_gate_required");
  if (input.restoreDrillFresh !== true) failures.push("restore_drill_required");
  if (input.rollbackAvailable !== true) failures.push("rollback_required");
  if (input.telemetryAvailable !== true) failures.push("telemetry_required");
  if (input.auditRequired !== true) failures.push("audit_required");
  if (input.includesPrivateMedia === true) failures.push("private_media_blocked");
  if (input.includesPremiumMedia === true) failures.push("premium_media_blocked");
  if (input.includesOriginalMedia === true) failures.push("original_media_blocked");
  if (input.includesUnscannedMedia === true) failures.push("unscanned_media_blocked");
  if (input.includesModerationBlockedMedia === true) failures.push("moderation_blocked_media_blocked");
  if (input.destructiveCleanupRequested === true) failures.push("destructive_cleanup_requires_owner_approval");
  if (mode === "small_capped" && (requestedBatchSize <= 0 || requestedBatchSize > hardMaxBatchCap)) {
    failures.push("small_backfill_batch_cap_invalid");
  }
  if (broadBackfill && input.ownerApprovedBroadBackfill !== true) {
    failures.push("broad_backfill_requires_owner_approval");
  }

  const approval = classifyAutonomousOperation({
    operationKind: broadBackfill ? "broad_uncapped_backfill" : "public_safe_transcode_inside_caps",
    emergencyStopAvailable: true,
    rollbackAvailable: input.rollbackAvailable,
    auditRequired: input.auditRequired,
    fallbackAvailable: true,
    capsEnforced: mode === "small_capped" && requestedBatchSize > 0 && requestedBatchSize <= hardMaxBatchCap,
    broadUncappedBackfill: broadBackfill,
    destructiveProductionDbChange: input.destructiveCleanupRequested === true,
    processesPrivatePremiumOriginalMedia: input.includesPrivateMedia === true
      || input.includesPremiumMedia === true
      || input.includesOriginalMedia === true
      || input.includesUnscannedMedia === true
      || input.includesModerationBlockedMedia === true,
  });

  if (approval.blockedReason) failures.push(approval.blockedReason);
  if (approval.ownerApprovalRequired && mode !== "broad_uncapped") failures.push("unexpected_owner_approval_required");

  return {
    mode,
    allowed: mode === "small_capped" && failures.length === 0 && !approval.ownerApprovalRequired,
    approval,
    batchSize: mode === "small_capped" ? Math.min(requestedBatchSize, hardMaxBatchCap) : 0,
    hardMaxBatchCap,
    broadBackfill,
    rollbackRequired: true,
    telemetryRequired: true,
    auditRequired: true,
    failures: Array.from(new Set(failures)),
  };
}

export function buildMediaAutomationBackfillPlan(input: MediaAutomationBackfillPolicyInput): {
  decision: MediaAutomationBackfillPolicyDecision;
  selectedSourceCount: number;
  broadBackfillAllowed: false;
  destructiveCleanupAllowed: false;
  productionPlaybackSwitched: false;
} {
  const decision = resolveMediaAutomationBackfillPolicy(input);
  return {
    decision,
    selectedSourceCount: decision.allowed ? decision.batchSize : 0,
    broadBackfillAllowed: false,
    destructiveCleanupAllowed: false,
    productionPlaybackSwitched: false,
  };
}

export function sanitizeBackfillPolicyProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/postgres(?:ql)?:\/\//i.test(entry)) return "[REDACTED_DB_URL]";
    if (new RegExp(`X-Amz-${"Signature"}=`, "i").test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/eyJ[A-Za-z0-9_-]{20,}\./.test(entry)) return "[REDACTED_TOKEN]";
    return entry;
  })) as T;
}
