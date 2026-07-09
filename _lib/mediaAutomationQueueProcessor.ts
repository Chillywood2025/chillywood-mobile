import type { MediaAutomationControllerDecision } from "./mediaAutomationController";
import type { MediaAutomationCandidate } from "./mediaAutomationDiscovery";

export type MediaAutomationQueueItemStatus =
  | "queued"
  | "claimed"
  | "processing"
  | "completed"
  | "failed"
  | "quarantined"
  | "dead_letter";

export type MediaAutomationQueueItem = {
  queueItemId: string;
  sourceType: string;
  sourceId: string;
  classification: string;
  status: MediaAutomationQueueItemStatus;
  attemptCount: number;
  outputPrefix: string;
  auditStatus: "pending_audit" | "audit_passed" | "audit_failed" | "quarantined";
  publicSafe: boolean;
  privateOrPremiumOrOriginal: boolean;
};

export type MediaAutomationQueueLease = {
  leaseId: string;
  queueItemIds: string[];
  maxConcurrency: number;
  maxJobsPerRun: number;
  expiresAtMillis: number;
};

export type MediaAutomationQueueProcessorDecision = {
  allowed: boolean;
  stopReason: string | null;
  selectedItems: MediaAutomationQueueItem[];
  leaseRequired: true;
  backupGateRequired: true;
  killSwitchRequired: true;
  auditRequiredBeforeResolverTrust: true;
  deadLetterRequired: true;
  quarantineRequired: true;
  productionPlaybackSwitched: false;
};

const FORBIDDEN_OUTPUT_SEGMENT = /(^|\/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(\/|$)/i;

const toNonNegativeInteger = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

const safePrefix = (prefix: string) => (
  prefix.startsWith("playback/public/auto/")
  && !prefix.includes("..")
  && !FORBIDDEN_OUTPUT_SEGMENT.test(prefix)
);

export function discoverQueuedMediaAutomationWork(input: {
  candidates: MediaAutomationCandidate[];
  existingQueueItems?: MediaAutomationQueueItem[] | null;
  batchId: string;
  maxJobsPerRun: number;
}): MediaAutomationQueueItem[] {
  const existing = new Set((input.existingQueueItems ?? []).map((item) => `${item.sourceType}:${item.sourceId}`));
  return input.candidates
    .filter((candidate) => candidate.publicSafe && candidate.needsTranscode)
    .filter((candidate) => !existing.has(`${candidate.sourceType}:${candidate.sourceId}`))
    .slice(0, Math.max(0, Math.floor(input.maxJobsPerRun)))
    .map((candidate) => ({
      queueItemId: `${input.batchId}:${candidate.sourceType}:${candidate.sourceId}`,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      classification: candidate.classification,
      status: "queued",
      attemptCount: 0,
      outputPrefix: `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/${input.batchId}/`,
      auditStatus: "pending_audit",
      publicSafe: true,
      privateOrPremiumOrOriginal: false,
    }));
}

export function resolveQueueProcessorStopReason(input: {
  decision: MediaAutomationControllerDecision;
  queueItems: MediaAutomationQueueItem[];
  backupGateClosed?: boolean | null;
  killSwitchAvailable?: boolean | null;
  maxRetryCount?: number | null;
}): string | null {
  const maxRetryCount = Math.max(1, toNonNegativeInteger(input.maxRetryCount, 3));
  if (!input.decision.allowed) return input.decision.blockedReason ?? "automation_controller_denied";
  if (!input.decision.canRunWorker) return "worker_not_allowed";
  if (input.backupGateClosed !== true) return "backup_gate_not_closed";
  if (input.killSwitchAvailable !== true) return "kill_switch_missing";
  if (input.queueItems.length === 0) return "no_queue_items";
  if (input.queueItems.length > input.decision.maxJobsPerRun) return "max_jobs_per_run_exceeded";
  if (input.decision.maxConcurrency <= 0) return "max_concurrency_invalid";
  if (input.queueItems.some((item) => item.status !== "queued")) return "queue_item_not_queued";
  if (input.queueItems.some((item) => item.attemptCount >= maxRetryCount)) return "retry_cap_exceeded";
  if (input.queueItems.some((item) => !item.publicSafe || item.privateOrPremiumOrOriginal)) return "unsafe_queue_item_blocked";
  if (input.queueItems.some((item) => !safePrefix(item.outputPrefix))) return "unsafe_output_prefix";
  return null;
}

export function claimAutomationQueueItem(input: {
  decision: MediaAutomationControllerDecision;
  queueItems: MediaAutomationQueueItem[];
  nowMillis: number;
  backupGateClosed?: boolean | null;
  killSwitchAvailable?: boolean | null;
  leaseTtlMillis?: number | null;
  maxRetryCount?: number | null;
}): {
  lease: MediaAutomationQueueLease | null;
  stopReason: string | null;
  claimedItems: MediaAutomationQueueItem[];
} {
  const stopReason = resolveQueueProcessorStopReason(input);
  if (stopReason) {
    return {
      lease: null,
      stopReason,
      claimedItems: [],
    };
  }

  const ttl = Math.max(1, toNonNegativeInteger(input.leaseTtlMillis, 15 * 60 * 1000));
  const claimedItems = input.queueItems.map((item) => ({
    ...item,
    status: "claimed" as const,
    attemptCount: item.attemptCount + 1,
  }));
  return {
    lease: {
      leaseId: `queue:${input.nowMillis}:${claimedItems.map((item) => item.sourceId).join(",")}`,
      queueItemIds: claimedItems.map((item) => item.queueItemId),
      maxConcurrency: input.decision.maxConcurrency,
      maxJobsPerRun: input.decision.maxJobsPerRun,
      expiresAtMillis: input.nowMillis + ttl,
    },
    stopReason: null,
    claimedItems,
  };
}

export function processAutomationQueueItemDryRun(input: {
  lease: MediaAutomationQueueLease | null;
  queueItems: MediaAutomationQueueItem[];
}): {
  processed: boolean;
  writesAttempted: false;
  uploadAttempted: false;
  resolverTrustChanged: false;
  stopReason: string | null;
  processedItemIds: string[];
} {
  if (!input.lease) {
    return {
      processed: false,
      writesAttempted: false,
      uploadAttempted: false,
      resolverTrustChanged: false,
      stopReason: "missing_queue_lease",
      processedItemIds: [],
    };
  }
  const leaseItems = new Set(input.lease.queueItemIds);
  if (input.queueItems.some((item) => !leaseItems.has(item.queueItemId))) {
    return {
      processed: false,
      writesAttempted: false,
      uploadAttempted: false,
      resolverTrustChanged: false,
      stopReason: "queue_item_not_in_lease",
      processedItemIds: [],
    };
  }
  if (input.queueItems.length > input.lease.maxJobsPerRun) {
    return {
      processed: false,
      writesAttempted: false,
      uploadAttempted: false,
      resolverTrustChanged: false,
      stopReason: "lease_max_jobs_exceeded",
      processedItemIds: [],
    };
  }
  return {
    processed: true,
    writesAttempted: false,
    uploadAttempted: false,
    resolverTrustChanged: false,
    stopReason: null,
    processedItemIds: input.queueItems.map((item) => item.queueItemId),
  };
}

export function completeAutomationQueueItem(input: {
  queueItem: MediaAutomationQueueItem;
  auditPassed: boolean;
}): MediaAutomationQueueItem {
  return {
    ...input.queueItem,
    status: input.auditPassed ? "completed" : "quarantined",
    auditStatus: input.auditPassed ? "audit_passed" : "quarantined",
  };
}

export function failAutomationQueueItem(input: {
  queueItem: MediaAutomationQueueItem;
  retryCapReached?: boolean | null;
}): MediaAutomationQueueItem {
  return {
    ...input.queueItem,
    status: input.retryCapReached === true ? "dead_letter" : "failed",
    auditStatus: "audit_failed",
  };
}

export function quarantineAutomationQueueItem(input: {
  queueItem: MediaAutomationQueueItem;
  reason: string;
}): {
  queueItem: MediaAutomationQueueItem;
  automationPaused: true;
  resolverTrustRevoked: true;
  reason: string;
} {
  return {
    queueItem: {
      ...input.queueItem,
      status: "quarantined",
      auditStatus: "quarantined",
    },
    automationPaused: true,
    resolverTrustRevoked: true,
    reason: input.reason,
  };
}

export function sanitizeQueueProcessorProof<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry !== "string") return entry;
    if (/postgres(?:ql)?:\/\//i.test(entry)) return "[REDACTED_DB_URL]";
    if (new RegExp(`X-Amz-${"Signature"}=`, "i").test(entry)) return "[REDACTED_SIGNED_URL]";
    if (/eyJ[A-Za-z0-9_-]{20,}\./.test(entry)) return "[REDACTED_TOKEN]";
    return entry;
  })) as T;
}
