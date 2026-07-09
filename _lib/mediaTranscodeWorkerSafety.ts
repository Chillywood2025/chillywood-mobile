import {
  MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS,
  resolveMediaTranscodeOperatorDecision,
  resolveOperatorAutoDisable as resolveOperatorAutoDisableFromModel,
  type MediaTranscodeOperatorAutoDisableResult,
  type MediaTranscodeOperatorDecision,
  type MediaTranscodeOperatorInput,
  type MediaTranscodeWorkerLease,
} from "./mediaTranscodeOperator";

export type MediaTranscodeWorkerLeaseValidation = {
  valid: boolean;
  blockedReason: string | null;
  lease: MediaTranscodeWorkerLease | null;
};

export type MediaTranscodeWorkerLeaseRequest = MediaTranscodeOperatorInput & {
  requestedSourceId: string;
};

export type MediaTranscodeWorkerCompletionInput = {
  lease: MediaTranscodeWorkerLease | null;
  success?: boolean | null;
  failed?: boolean | null;
  auditPassed?: boolean | null;
  auditFailed?: boolean | null;
  emergencyStop?: boolean | null;
};

export type MediaTranscodeWorkerBatchQuarantine = {
  batchId: string;
  state: "quarantined";
  disabled: true;
  reason: string;
  rollbackPlan: {
    batchId: string;
    r2Prefix: string;
    deleteOnlyExactPrefix: true;
    deleteProductionPrivateMedia: false;
    productionPlaybackSwitched: false;
  };
};

export type MediaTranscodeWorkerWritableRowStatus =
  | "pending_audit"
  | "ready"
  | "quarantined";

export function resolveTranscodeWorkerActivation(
  input: MediaTranscodeOperatorInput = {},
): MediaTranscodeOperatorDecision {
  return resolveMediaTranscodeOperatorDecision(input);
}

export function requestTranscodeWorkerLease(
  input: MediaTranscodeWorkerLeaseRequest,
): MediaTranscodeOperatorDecision {
  const decision = resolveMediaTranscodeOperatorDecision({
    ...input,
    sourceId: input.requestedSourceId,
    requester: input.requester || "operator",
  });

  if (!decision.lease) return decision;

  return {
    ...decision,
    state: "running_one_job",
    lease: {
      ...decision.lease,
      state: "running_one_job",
    },
  };
}

export function validateTranscodeWorkerLease(input: {
  lease: MediaTranscodeWorkerLease | null | undefined;
  sourceId: string;
  nowMillis: number;
  completedJobCount: number;
  emergencyStop?: boolean | null;
}): MediaTranscodeWorkerLeaseValidation {
  if (input.emergencyStop === true) {
    return { valid: false, blockedReason: "emergency_stop", lease: input.lease ?? null };
  }
  if (!input.lease) {
    return { valid: false, blockedReason: "missing_operator_lease", lease: null };
  }
  if (input.lease.sourceId !== input.sourceId) {
    return { valid: false, blockedReason: "lease_source_mismatch", lease: input.lease };
  }
  if (input.nowMillis > input.lease.expiresAtMillis) {
    return { valid: false, blockedReason: "lease_expired_or_job_stalled", lease: input.lease };
  }
  if (input.completedJobCount >= input.lease.maxJobs) {
    return { valid: false, blockedReason: "max_job_count_exceeded", lease: input.lease };
  }
  if (input.lease.state === "emergency_stop" || input.lease.state === "paused") {
    return { valid: false, blockedReason: input.lease.state, lease: input.lease };
  }

  return { valid: true, blockedReason: null, lease: input.lease };
}

export function canWorkerWriteRenditionStatus(
  status: MediaTranscodeWorkerWritableRowStatus,
): boolean {
  return status === MEDIA_TRANSCODE_OPERATOR_PENDING_AUDIT_STATUS;
}

export function canResolverTrustWorkerWrittenRows(input: {
  auditPassed: boolean;
  rowStatus: MediaTranscodeWorkerWritableRowStatus;
}): boolean {
  return input.auditPassed === true && input.rowStatus === "ready";
}

export function completeTranscodeWorkerLease(
  input: MediaTranscodeWorkerCompletionInput,
): MediaTranscodeOperatorAutoDisableResult {
  return resolveOperatorAutoDisableFromModel({
    mode: input.lease?.mode ?? "disabled",
    success: input.success,
    failed: input.failed,
    auditPassed: input.auditPassed,
    auditFailed: input.auditFailed,
    emergencyStop: input.emergencyStop,
  });
}

export const resolveOperatorAutoDisable = resolveOperatorAutoDisableFromModel;

export function quarantineTranscodeWorkerBatch(input: {
  batchId: string;
  reason: string;
  r2Prefix: string;
}): MediaTranscodeWorkerBatchQuarantine {
  return {
    batchId: input.batchId,
    state: "quarantined",
    disabled: true,
    reason: input.reason,
    rollbackPlan: {
      batchId: input.batchId,
      r2Prefix: input.r2Prefix,
      deleteOnlyExactPrefix: true,
      deleteProductionPrivateMedia: false,
      productionPlaybackSwitched: false,
    },
  };
}
